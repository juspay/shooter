// The phone-resident autonomous loop (runs in the WebView / browser).
//
// Watches /ws/events + GET /api/summaries to track per-terminal state, and when a
// Shooter-managed terminal goes idle with a high-confidence consensus next step, it
// produces a concrete command, vets it (guardCommand), and injects it into the PTY
// over /ws/terminal/:id — the same transport humans use. AUTO-INJECT mode.
//
// The decision logic lives in the pure, unit-tested decide-injection.ts. This module
// is the I/O shell: sockets, polling, per-terminal bookkeeping, the kill switch.
//
// See docs/superpowers/specs/2026-06-01-phone-autonomous-agent-design.md.

import type {
  ConsensusResult,
  DriverAction,
  DriverActionKind,
  InjectionState,
  NextStep,
  RawEvent,
  SessionSummaryRecord,
} from '$lib/types';

import { decideInjection, guardCommand, normalizeStep } from './decide-injection';

const AUTONOMY_KEY = 'shooter_autonomy';
const POLL_INTERVAL_MS = 6_000;
const RECONNECT_MS = 3_000;
const OPEN_TIMEOUT_MS = 5_000;
const MAX_ACTIONS = 40;
// When the WS missed the transition to idle (reconnect, or the agent was already idle when the
// dashboard opened), the poll path may synthesise an agent-idle from a recent idle-triggered
// summary — but ONLY if that summary is this fresh, so we never auto-act on stale parked state.
const IDLE_RESUME_WINDOW_MS = 120_000;
// Gap between the prompt text and the Enter key for agent TUIs (see inject()). A single chunk
// ending in CR is treated as a paste — the CR becomes a newline, not a submit — so the Enter must
// arrive as a SEPARATE write a beat later.
const AGENT_SUBMIT_DELAY_MS = 120;
// Allowed shape for a terminal id before it is interpolated into a socket URL (hex / UUID-like).
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Command heads we are willing to treat the next-step text as a literal command for. */
const SAFE_COMMAND_HEADS = new Set([
  'bun',
  'cargo',
  'cat',
  'deno',
  'echo',
  'eslint',
  'git',
  'go',
  'jest',
  'ls',
  'make',
  'node',
  'npm',
  'npx',
  'pnpm',
  'prettier',
  'pwd',
  'python',
  'python3',
  'tsc',
  'vitest',
  'yarn',
]);

/** Terminal commands that are AI agents — inject the next-step as a PROMPT, not a shell command. */
const AGENT_COMMANDS = new Set(['claude', 'opencode']);

// eslint-disable-next-line no-restricted-syntax -- internal DI seam, never exported
interface AutopilotDriverDeps {
  now: () => number;
  produceCommand: (input: ProduceCommandInput) => Promise<null | string>;
}

// eslint-disable-next-line no-restricted-syntax -- internal
interface ProduceCommandInput {
  apiKey: string;
  isAgentTerminal: boolean;
  recentOutput: string;
  step: NextStep;
  terminalId: string;
}

// eslint-disable-next-line no-restricted-syntax -- internal per-terminal bookkeeping
interface TerminalRuntime {
  autoActionCount: number;
  busy: boolean;
  command: string;
  consensus: ConsensusResult | null;
  injectSocket: null | WebSocket;
  isManaged: boolean;
  lastActedStep: null | string;
  lastActivityAt: number;
  lastCommand: null | string;
  lastEventAt: number;
  lastEventType: string;
  lastInjectedAt: number;
  recentOutput: string;
}

/**
 * The autonomous driver. One singleton per page; the AutopilotPanel starts/stops it and
 * reads `enabled` + `actions` reactively.
 */
export class AutopilotDriver {
  actions = $state<DriverAction[]>([]);
  enabled = $state(false);

  private apiKey = '';
  private deps: AutopilotDriverDeps;
  private eventsWs: null | WebSocket = null;
  private pollTimer: null | ReturnType<typeof setInterval> = null;
  private reconnectTimer: null | ReturnType<typeof setTimeout> = null;
  private started = false;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal, non-reactive bookkeeping
  private terminals = new Map<string, TerminalRuntime>();

  constructor(deps?: Partial<AutopilotDriverDeps>) {
    this.deps = {
      now: deps?.now ?? ((): number => Date.now()),
      produceCommand: deps?.produceCommand ?? defaultProduceCommand,
    };
    this.enabled = readPersistedAutonomy();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      localStorage.setItem(AUTONOMY_KEY, JSON.stringify({ enabled: value }));
    } catch {
      // best-effort
    }
  }

  start(apiKey: string): void {
    this.apiKey = apiKey;
    if (this.started) {
      return;
    }
    this.started = true;
    // Native silent-push wake (iOS): the AppDelegate dispatches 'shooter:wake' so the loop
    // runs a burst when woken in the background.
    if (typeof window !== 'undefined') {
      window.addEventListener('shooter:wake', this.onWake);
    }
    void this.connectEvents();
    void this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('shooter:wake', this.onWake);
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventsWs) {
      this.eventsWs.onclose = null;
      this.eventsWs.close();
      this.eventsWs = null;
    }
    for (const rt of this.terminals.values()) {
      rt.injectSocket?.close();
      rt.injectSocket = null;
    }
  }

  private async connectEvents(): Promise<void> {
    const ticket = await this.getTicket();
    if (!ticket || !this.started) {
      return;
    }
    const wsBase = window.location.origin.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws/events?ticket=${ticket}`);
    this.eventsWs = ws;
    ws.onmessage = (msg: MessageEvent): void => {
      try {
        const raw: unknown = JSON.parse(msg.data as string);
        if (raw && typeof raw === 'object') {
          this.handleEvent(raw as RawEvent);
        }
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = (): void => {
      this.eventsWs = null;
      if (this.started) {
        this.scheduleReconnect();
      }
    };
    ws.onerror = (): void => {
      // close handler does the reconnect
    };
  }

  private createRuntime(terminalId: string): TerminalRuntime {
    const rt: TerminalRuntime = {
      autoActionCount: 0,
      busy: false,
      command: '',
      consensus: null,
      injectSocket: null,
      isManaged: false,
      lastActedStep: null,
      lastActivityAt: 0,
      lastCommand: null,
      lastEventAt: 0,
      lastEventType: '',
      lastInjectedAt: 0,
      recentOutput: '',
    };
    this.terminals.set(terminalId, rt);
    return rt;
  }

  private async evaluate(terminalId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const rt = this.terminals.get(terminalId);
    if (!rt || rt.busy || !rt.consensus) {
      return;
    }
    const state: InjectionState = {
      autoActionCount: rt.autoActionCount,
      isManaged: rt.isManaged,
      lastActedStep: rt.lastActedStep,
      lastActivityAt: rt.lastActivityAt,
      lastEventType: rt.lastEventType,
      lastInjectedAt: rt.lastInjectedAt,
      terminalId,
    };
    // Agent terminals (claude/opencode) receive the next step as a PROMPT they reason about, so we
    // allow a best-ranked-but-tentative step through (keeps the autonomous loop live past step 1).
    // Shell terminals stay strict — there the injected text is a command run verbatim.
    const decision = decideInjection(state, rt.consensus, this.deps.now(), undefined, {
      allowTentative: isAgentCommand(rt.command),
    });
    if (!decision.act || !decision.step) {
      return; // common case — stay quiet
    }

    rt.busy = true;
    try {
      const isAgent = isAgentCommand(rt.command);
      let command: null | string;
      try {
        command = await this.deps.produceCommand({
          apiKey: this.apiKey,
          isAgentTerminal: isAgent,
          recentOutput: rt.recentOutput,
          step: decision.step,
          terminalId,
        });
      } catch {
        command = null;
      }

      if (!command) {
        // Transient producer failure (e.g. the LLM proxy was busy) — do NOT mark the step acted, so
        // it stays retryable on the next poll instead of being silenced forever.
        this.log(terminalId, 'skipped', `no command for: ${decision.step.text.slice(0, 60)}`);
        return;
      }
      // For agent TUIs the next-step is a natural-language prompt that inject() collapses to a single
      // line; collapse it HERE too, before guardCommand, so a legitimate multi-line prompt isn't
      // rejected as "multi-line" by a guard the injected form would have passed anyway.
      const candidate = isAgent ? command.replace(/\s*[\r\n]+\s*/g, ' ').trim() : command;
      const verdict = guardCommand(candidate, rt.lastCommand);
      if (!verdict.safe) {
        // Deterministic rejection of THIS step text — mark it acted so we don't loop on it.
        rt.lastActedStep = normalizeStep(decision.step.text);
        this.log(terminalId, 'skipped', `guard: ${verdict.reason}`);
        return;
      }
      const ok = await this.inject(terminalId, verdict.command);
      if (ok) {
        rt.lastInjectedAt = this.deps.now();
        rt.lastCommand = verdict.command;
        rt.lastActedStep = normalizeStep(decision.step.text); // mark acted ONLY on a real inject
        rt.autoActionCount += 1;
        this.log(terminalId, 'injected', verdict.command);
      } else {
        // Transient inject failure (socket) — leave the step unmarked so the next poll retries.
        this.log(terminalId, 'error', `inject failed: ${verdict.command}`);
      }
    } finally {
      rt.busy = false;
    }
  }

  private async fetchSummaries(): Promise<void> {
    try {
      const res = await fetch('/api/summaries?limit=30', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as { summaries?: SessionSummaryRecord[] };
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, non-reactive dedup
      const latest = new Set<string>();
      for (const rec of body.summaries ?? []) {
        const tid = rec.terminalId;
        if (!tid || latest.has(tid)) {
          continue; // records are newest-first; keep only the latest per terminal
        }
        const rt = this.terminals.get(tid);
        if (!rt) {
          continue;
        }
        latest.add(tid);
        rt.consensus = { agentCount: 5, quorum: 3, steps: parseSteps(rec.nextSteps) };
        // Resume the inject path when the WS missed the transition to idle: if this is a recent
        // agent-idle-triggered summary and nothing newer arrived over the WS, treat the terminal as
        // idle so the poll loop can act (decideInjection hard-requires lastEventType==='agent-idle',
        // which only the WS path otherwise sets — leaving the poll path dead after a reconnect).
        const createdMs = Date.parse(rec.createdAt);
        if (
          rec.trigger === 'agent-idle' &&
          Number.isFinite(createdMs) &&
          createdMs >= rt.lastEventAt &&
          this.deps.now() - createdMs < IDLE_RESUME_WINDOW_MS
        ) {
          rt.lastEventType = 'agent-idle';
        }
      }
    } catch {
      // silent — retry next poll
    }
  }

  private async fetchTerminals(): Promise<void> {
    try {
      const res = await fetch('/api/terminals', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as {
        terminals?: { command: string; exitedAt: null | string; id: string; status: string }[];
      };
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, non-reactive dedup
      const seen = new Set<string>();
      for (const t of body.terminals ?? []) {
        if (t.exitedAt !== null || t.status === 'exited') {
          continue; // only track live terminals
        }
        seen.add(t.id);
        const rt = this.terminals.get(t.id) ?? this.createRuntime(t.id);
        rt.isManaged = true; // present in GET /api/terminals ⇒ Shooter-managed
        rt.command = t.command ?? '';
      }
      for (const id of [...this.terminals.keys()]) {
        if (!seen.has(id)) {
          this.terminals.get(id)?.injectSocket?.close();
          this.terminals.delete(id);
        }
      }
    } catch {
      // silent — retry next poll
    }
  }

  private async getTicket(): Promise<null | string> {
    try {
      const res = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        method: 'POST',
      });
      if (!res.ok) {
        return null;
      }
      const { ticket } = (await res.json()) as { ticket: string };
      return ticket;
    } catch {
      return null;
    }
  }

  private handleEvent(raw: RawEvent): void {
    const type = typeof raw.type === 'string' ? raw.type : '';
    const terminalId = typeof raw.terminalId === 'string' ? raw.terminalId : '';
    if (!type || type === 'welcome' || !terminalId) {
      return;
    }
    const rt = this.terminals.get(terminalId);
    if (!rt) {
      return; // unknown terminal until the next /api/terminals poll
    }
    rt.lastEventType = type;
    rt.lastEventAt = this.deps.now(); // so a later summary can't downgrade a fresher live signal
    if (type !== 'agent-idle' && type !== 'agent-question') {
      rt.lastActivityAt = this.deps.now(); // tool/human activity → resets the grace window
    }
    if (type === 'tool-completed' && raw.success === true) {
      rt.autoActionCount = 0; // real progress resets the circuit breaker
    }
    if (type === 'agent-idle' && this.enabled) {
      void this.evaluate(terminalId);
    }
  }

  private async inject(terminalId: string, command: string): Promise<boolean> {
    const rt = this.terminals.get(terminalId);
    if (!rt) {
      return false;
    }
    // Defense-in-depth: terminalId is a server-issued id, but it reaches this socket-URL sink from
    // the events WebSocket too — constrain it to a safe charset (and URL-encode both it and the
    // ticket) so a malformed/hostile value can't alter the request path or target
    // (CodeQL js/request-forgery). Real ids are short hex / UUID-like.
    if (!SAFE_ID.test(terminalId)) {
      return false;
    }
    let ws = rt.injectSocket;
    if (!ws || ws.readyState > WebSocket.OPEN) {
      const ticket = await this.getTicket();
      if (!ticket) {
        return false;
      }
      const wsBase = window.location.origin.replace(/^http/, 'ws');
      ws = new WebSocket(
        `${wsBase}/ws/terminal/${encodeURIComponent(terminalId)}?ticket=${encodeURIComponent(ticket)}`
      );
      rt.injectSocket = ws;
      const opened = await waitForOpen(ws);
      if (!opened) {
        rt.injectSocket = null; // drop the failed socket so the next attempt reconnects cleanly
        return false;
      }
    }
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    if (isAgentCommand(rt.command)) {
      // Agent TUIs (claude/opencode) treat a single chunk ending in CR as a bracketed paste — the
      // CR becomes a literal newline, not a submit. Send the prompt text and the Enter as SEPARATE
      // writes, collapsing any newlines so a multi-line step can't submit halfway through.
      const prompt = command.replace(/\s*[\r\n]+\s*/g, ' ').trim();
      if (!prompt) {
        return false;
      }
      ws.send(JSON.stringify({ data: prompt, type: 'input' }));
      await delay(AGENT_SUBMIT_DELAY_MS);
      if (ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      ws.send(JSON.stringify({ data: '\r', type: 'input' }));
      return true;
    }
    ws.send(JSON.stringify({ data: `${command}\r`, type: 'input' }));
    return true;
  }

  private log(terminalId: string, kind: DriverActionKind, detail: string): void {
    this.actions = [{ at: this.deps.now(), detail, kind, terminalId }, ...this.actions].slice(
      0,
      MAX_ACTIONS
    );
  }

  private onWake = (): void => {
    void this.refresh();
  };

  private async refresh(): Promise<void> {
    if (!this.apiKey) {
      return;
    }
    await Promise.allSettled([this.fetchTerminals(), this.fetchSummaries()]);
    if (this.enabled) {
      for (const id of this.terminals.keys()) {
        void this.evaluate(id);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectEvents();
    }, RECONNECT_MS);
  }
}

async function defaultProduceCommand(input: ProduceCommandInput): Promise<null | string> {
  // Agent terminals (claude/opencode) take a natural-language PROMPT, not a shell command —
  // the consensus next-step is already that prompt, so inject it directly.
  if (input.isAgentTerminal) {
    const prompt = input.step.text.trim();
    return prompt.length > 0 ? prompt : null;
  }
  // Shell terminals: translate the next-step into a concrete command.
  // 1) On-device model via the native bridge (iOS Foundation Models), when present.
  const native = await tryNativeDecide(input);
  if (native) {
    return native;
  }
  // 2) LiteLLM via the server proxy (key stays server-side) — a real decide step in the browser.
  const litellm = await litellmProduceCommand(input);
  if (litellm) {
    return litellm;
  }
  // 3) Heuristic fallback (no LLM): only when the step text is already a literal command.
  const text = input.step.text.trim();
  const backticked = /`([^`]+)`/.exec(text);
  if (backticked) {
    return backticked[1].trim();
  }
  const head = text.split(/\s+/)[0]?.toLowerCase();
  if (head && SAFE_COMMAND_HEADS.has(head) && !/[\r\n]/.test(text) && text.length < 80) {
    return text;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Default command producer: a CONSERVATIVE heuristic with no LLM. It only yields a
 * command when the next-step text is already a literal command (backticked, or a bare
 * command starting with a known head). Prose next-steps return null → push only, never
 * an inject of garbage. The LLM-backed producer (LiteLLM / on-device) replaces this.
 */
function isAgentCommand(command: string): boolean {
  const firstToken = command.trim().split(/\s+/)[0] ?? '';
  const base = firstToken.split('/').pop() ?? '';
  return AGENT_COMMANDS.has(base);
}

async function litellmProduceCommand(input: ProduceCommandInput): Promise<null | string> {
  const base = readProcessEnv('LITELLM_BASE_URL');
  if (!base || !input.apiKey) {
    return null;
  }
  const model = readProcessEnv('LITELLM_MODEL') || 'open-large';
  const userPrompt =
    `Recent terminal output:\n${input.recentOutput.slice(-2000)}\n\n` +
    `Suggested next step: ${input.step.text}\n\n` +
    'Reply with ONLY the single shell command to run next — no prose, no backticks, no explanation.';
  try {
    const res = await fetch('/api/neurolink-proxy', {
      body: JSON.stringify({
        body: {
          max_tokens: 60,
          messages: [
            {
              content: 'You are a coding-session copilot. Output ONLY the next shell command.',
              role: 'system',
            },
            { content: userPrompt, role: 'user' },
          ],
          model,
          temperature: 0,
        },
        headers: {},
        provider: 'litellm',
        url: `${base}/chat/completions`,
      }),
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return null;
    }
    const cmd = content
      .trim()
      .replace(/^`+|`+$/g, '')
      .trim();
    return cmd.length > 0 ? cmd : null;
  } catch {
    return null;
  }
}

function parseSteps(json: string): NextStep[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Validate shape — a malformed/old record must not crash the loop downstream.
    return parsed.filter(
      (el): el is NextStep =>
        typeof el === 'object' &&
        el !== null &&
        typeof (el as NextStep).text === 'string' &&
        typeof (el as NextStep).confidence === 'number'
    );
  } catch {
    return [];
  }
}

function readPersistedAutonomy(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    const raw = localStorage.getItem(AUTONOMY_KEY);
    if (!raw) {
      return false;
    }
    const parsed: unknown = JSON.parse(raw);
    return Boolean((parsed as { enabled?: unknown })?.enabled);
  } catch {
    return false;
  }
}

function readProcessEnv(key: string): string {
  // eslint-disable-next-line @typescript-eslint/dot-notation -- bracket access avoids the bundler constant-folding process.env to its build-time value
  const proc = (window as unknown as Record<string, unknown>)['process'] as
    | undefined
    | { env?: Record<string, string | undefined> };
  const value = proc?.env?.[key];
  return typeof value === 'string' ? value : '';
}

function tryNativeDecide(input: ProduceCommandInput): Promise<null | string> {
  const bridge = (
    window as unknown as { ShooterBridge?: { agentDecide?: (ctx: string) => Promise<string> } }
  ).ShooterBridge;
  if (typeof bridge?.agentDecide !== 'function') {
    return Promise.resolve(null);
  }
  const ctx =
    `Recent terminal output:\n${input.recentOutput.slice(-2000)}\n\n` +
    `Suggested next step: ${input.step.text}\n\nReply with the single shell command to run next.`;
  return bridge
    .agentDecide(ctx)
    .then((c) => (typeof c === 'string' && c.trim().length > 0 ? c.trim() : null))
    .catch(() => null);
}

function waitForOpen(ws: WebSocket): Promise<boolean> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.close(); // don't leak a stuck CONNECTING socket (review finding)
      resolve(false);
    }, OPEN_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(true);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      ws.close();
      resolve(false);
    });
  });
}

/** Page-level singleton used by the AutopilotPanel. */
export const autopilotDriver = new AutopilotDriver();
