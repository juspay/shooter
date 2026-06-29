// Always-on autopilot engine (server-side).
//
// Subscribes to the global ShooterEvent stream, tracks per-session state across
// ALL threads, and on a meaningful trigger runs: one LiteLLM summary + five
// DISTINCT-LENS next-step agents (blocker / next-command / risk / validation /
// progress) -> consensus merge -> persist to SQLite -> push to the phone (using
// the normal skip logic, so it only pushes when no dashboard is watching).
//
// Lives in the server.ts module graph (started from server.ts). Cross-graph
// state (events, store, control) is shared via globalThis singletons.

import type { AgentProposal, NextStep, SessionSummaryRecord, WireShooterEvent } from '$lib/types';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ptyManager } from '../terminal/pty-manager.js';
import { shooterDataDir } from '../utils/shooter-home.js';
import { onShooterEvent } from '../ws/events-handler.js';
import { isViewerPresent } from '../ws/presence-store.js';
import {
  buildEngineContext,
  clearEngineGoal,
  getEngineGoal,
  setEngineGoal,
} from './autopilot-context.js';
import { isLiteLLMConfigured, litellmJson } from './litellm-client.js';
import { mergeNextStepConsensus } from './next-step-consensus.js';
import { summaryStore } from './summary-store.js';

// ── Constants ────────────────────────────────────────────────────────

const HIGH_SIGNAL = new Set(['agent-idle', 'agent-question', 'tool-failed']);
const GRACE_MS = 4_000; // fire this long after the FIRST qualifying event (fast, not resetting)
const MIN_INTERVAL_MS = 30_000; // minimum gap between pipeline runs per session (cost bound)
const PERIODIC_EVERY = 20;
const ERROR_THRESHOLD = 3;
const MAX_EVENTS = 60;
const SUMMARY_MAX_TOKENS = 400;
const STEPS_MAX_TOKENS = 400;
// How many of the five lenses run concurrently. Kept BELOW the typical LiteLLM key parallel cap so
// the engine never saturates the key by itself: firing all five at once exhausted a
// max_parallel_requests=5 key and 429'd every call (empty consensus, silent stall). Default 3
// leaves headroom for the summary's retry + other callers sharing the key. Tune per key via env.
const LENS_CONCURRENCY = Math.max(1, Number(process.env.AUTOPILOT_LENS_CONCURRENCY) || 3);
// Consensus quorum: how many of the 5 distinct lenses must agree for a step to be non-tentative
// (and thus auto-injectable). The lenses are DIFFERENT perspectives that phrase the same action
// differently, so the Jaccard clustering systematically undercounts true agreement (observed: 4/5
// lenses proposed the same fix but only 2 clustered). 2-of-5 + the confidence floor + the eight
// driver guards (idle-only, managed-only, rate-limit, dedup, circuit-breaker, command-guard,
// kill-switch, human-grace) is the practical bar; quorum 3 left the autopilot almost never firing.
const CONSENSUS_QUORUM = 2;
const STATE_FILE = join(shooterDataDir(), 'autopilot.json');

// The engine does STRUCTURED extraction (one summary + five voting lenses). A reasoning model like
// `open-large` does this badly: it reasons out loud and ignores response_format, so the JSON never
// parses and the consensus collapses to tentative garbage. Pin a fast NON-reasoning model for the
// pipeline, independent of the user's chat model (LITELLM_MODEL). Overridable via AUTOPILOT_MODEL.
// NB: the default is the `-sa` variant — the Juspay LiteLLM grid only grants teams the `*-sa`
// models, so a bare `open-fast` returns "team not allowed to access model" and the pipeline dies
// silently. Keep the default on an accessible model so autopilot works without an env override.
const ENGINE_MODEL = process.env.AUTOPILOT_MODEL?.trim() || 'open-fast-sa';

// Retention for the persisted summary cards (the dashboard list). Without this the auto-* records
// accumulate forever — the original "tasks never got removed" bug. Pruned at startup + hourly.
const PRUNE_MAX_AGE_DAYS = Number(process.env.AUTOPILOT_SUMMARY_MAX_AGE_DAYS) || 7;
const PRUNE_MAX_PER_TERMINAL = Number(process.env.AUTOPILOT_SUMMARY_MAX_PER_TERMINAL) || 20;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

// Lead with the JSON-only contract; the per-lens perspective is a TRAILING modifier so the model
// doesn't start "thinking" about a role. No copyable placeholder value in the schema — reasoning
// models echo it verbatim ("a real shell command or instruction" leaked into real consensus).
const JSON_API_RULES =
  'You are a JSON API. Output ONLY one JSON object and nothing else — no prose, no reasoning, no ' +
  'markdown, no code fences. The first character MUST be { and the last MUST be }.';

/** Five DISTINCT perspectives — each a different angle, so converging votes mean real agreement. */
const LENSES = [
  'what is currently blocking progress, or is most likely to fail next',
  'the exact shell commands or file edits the agent should run next, in order',
  'what could go wrong if the agent continues on its current path, and what to validate first',
  'how to verify the work so far is correct — the tests, checks, or inspections to run',
  'the single most direct next step toward completing the session goal',
] as const;

// ── Per-session state (globalThis-shared) ───────────────────────────

// eslint-disable-next-line no-restricted-syntax -- internal engine state, never exported
interface EngineSession {
  cancelled: boolean;
  // Set once the pipeline judged the goal complete. Halts further pipeline runs (no wasted LLM
  // spend, no duplicate "done" pushes, no card resurrection) until genuine new work — a
  // tool-started event — clears it.
  completed: boolean;
  errorCount: number;
  eventCount: number;
  events: string[];
  // Highest signal + latest trigger seen during the OPEN grace window — evaluated at FIRE time, not
  // schedule time, so an agent-idle arriving after a low-signal event still runs as a high trigger.
  graceIsHigh: boolean;
  graceTimer: null | ReturnType<typeof setTimeout>;
  graceTrigger: string;
  lastRunAt: number;
  projectName: string;
  running: boolean;
  status: string;
  terminalId: string;
  toolCallCount: number;
}

const SESSIONS_KEY = '__shooter_autopilot_sessions';
const sessions: Map<string, EngineSession> =
  ((globalThis as Record<string, unknown>)[SESSIONS_KEY] as Map<string, EngineSession>) ||
  new Map<string, EngineSession>();
(globalThis as Record<string, unknown>)[SESSIONS_KEY] = sessions;

let enabled = readPersistedEnabled();
let unsubscribe: (() => void) | null = null;
let pruneTimer: null | ReturnType<typeof setInterval> = null;

// ── Control (exposed on globalThis so the /api/autopilot route can reach it) ──

export function isAutopilotEnabled(): boolean {
  return enabled;
}

export function setAutopilotEnabled(value: boolean): void {
  enabled = value;
  try {
    mkdirSync(shooterDataDir(), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ enabled: value }), 'utf-8');
  } catch {
    // best-effort persistence
  }
  if (!value) {
    for (const s of sessions.values()) {
      if (s.graceTimer) {
        clearTimeout(s.graceTimer);
        s.graceTimer = null;
      }
    }
  }
}

/** Start the engine: subscribe to the event stream. Idempotent. */
export function startAutopilotEngine(): void {
  if (unsubscribe) {
    return;
  }
  const control = {
    getGoal: getEngineGoal,
    isEnabled: isAutopilotEnabled,
    setEnabled: setAutopilotEnabled,
    setGoal: setEngineGoal,
  };
  (globalThis as Record<string, unknown>).__shooter_autopilot = control;
  unsubscribe = onShooterEvent(handleEvent);
  // Pre-track sessions for terminals that already exist at startup (e.g. a server restart that
  // reconnected persisted terminals). Without this a session is only created lazily on its NEXT
  // event, so an agent that went idle before the engine attached would be invisible until it emits
  // again. We deliberately do NOT force a pipeline run here — that would risk spurious LLM spend on
  // a genuinely quiet terminal; we just ensure the session is tracked so the next event triggers.
  try {
    for (const term of ptyManager.list()) {
      if (!sessions.has(term.id)) {
        createSession(term.id);
      }
    }
  } catch {
    // ptyManager not ready yet — sessions will be created lazily on first event
  }
  // Retention: prune the summary cards now and on an hourly timer so the dashboard
  // list cannot grow without bound. Best-effort — a DB hiccup must not stop the engine.
  pruneSummaries();
  pruneTimer = setInterval(pruneSummaries, PRUNE_INTERVAL_MS);
  pruneTimer.unref();
  console.log(
    `[autopilot] engine started (enabled=${enabled}, litellm=${isLiteLLMConfigured() ? 'configured' : 'absent'}, model=${ENGINE_MODEL}, lensConcurrency=${LENS_CONCURRENCY})`
  );
}

/**
 * Tear down the engine: unsubscribe from the event stream and stop the prune timer. The inverse of
 * startAutopilotEngine() — wired into server.ts's shutdown() and available for test teardown. Safe
 * to call when never started (both handles are null).
 */
export function stopAutopilotEngine(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

function applyEvent(session: EngineSession, event: WireShooterEvent): void {
  const parts: string[] = [event.type];
  if ('tool' in event && event.tool) {
    parts.push(`tool=${event.tool}`);
  }
  if ('error' in event && event.error) {
    parts.push(`error=${event.error.slice(0, 140)}`);
  }
  if ('command' in event && event.command) {
    parts.push(`cmd=${event.command.slice(0, 80)}`);
  }
  if ('message' in event && event.message) {
    // The agent's last message on idle (the OUTCOME — e.g. "the test failed because…") is the
    // richest signal the lenses have; keep enough of it to actually ground the next-step votes.
    parts.push(`msg=${event.message.slice(0, 400)}`);
  }
  session.events.push(parts.join(' '));
  if (session.events.length > MAX_EVENTS) {
    session.events.shift();
  }
  switch (event.type) {
    case 'agent-idle':
    case 'agent-question':
      session.status = 'idle';
      break;
    case 'tool-completed':
      session.toolCallCount += 1;
      break;
    case 'tool-failed':
      session.errorCount += 1;
      break;
    case 'tool-started':
      session.toolCallCount += 1;
      session.status = 'running';
      // Genuine new work in this terminal → the task is no longer "done"; re-arm the pipeline.
      session.completed = false;
      break;
    default:
      break;
  }
}

// ── Event handling ───────────────────────────────────────────────────

function createSession(terminalId: string): EngineSession {
  const session: EngineSession = {
    cancelled: false,
    completed: false,
    errorCount: 0,
    eventCount: 0,
    events: [],
    graceIsHigh: false,
    graceTimer: null,
    graceTrigger: '',
    lastRunAt: 0,
    projectName: projectNameFor(terminalId),
    running: false,
    status: 'running',
    terminalId,
    toolCallCount: 0,
  };
  sessions.set(terminalId, session);
  return session;
}

function fallbackSummary(session: EngineSession): string {
  return `${session.status} — ${session.toolCallCount} tool calls, ${session.errorCount} errors`;
}

function handleEvent(event: WireShooterEvent): void {
  const terminalId = 'terminalId' in event ? event.terminalId : undefined;
  if (!terminalId) {
    return;
  }

  if (event.type === 'terminal-exited') {
    const s = sessions.get(terminalId);
    if (s) {
      s.cancelled = true; // signal any in-flight pipeline to stop before persist/push
      if (s.graceTimer) {
        clearTimeout(s.graceTimer);
      }
    }
    sessions.delete(terminalId);
    clearEngineGoal(terminalId);
    return;
  }

  const session = sessions.get(terminalId) ?? createSession(terminalId);
  session.eventCount += 1;
  applyEvent(session, event);

  if (!enabled || session.running) {
    return;
  }
  // A task judged complete stays quiet — no more pipeline runs, LLM spend, or duplicate "done"
  // pushes — until a tool-started event (handled in applyEvent above) clears the flag.
  if (session.completed) {
    return;
  }
  const isHigh = HIGH_SIGNAL.has(event.type);
  const isPeriodic = session.eventCount % PERIODIC_EVERY === 0;
  const isErrorThreshold = session.errorCount >= ERROR_THRESHOLD;
  if (!isHigh && !isPeriodic && !isErrorThreshold) {
    return;
  }
  if (Date.now() - session.lastRunAt < MIN_INTERVAL_MS) {
    return;
  }
  // Track the strongest signal + latest trigger across the whole window (so a high-signal event
  // arriving after the timer was armed by a low-signal one is not lost). Schedule the timer ONCE;
  // do NOT reset it on every event (so a burst doesn't keep delaying the run).
  if (!session.graceTimer) {
    session.graceIsHigh = isHigh;
    session.graceTrigger = event.type;
    session.graceTimer = setTimeout(() => {
      session.graceTimer = null;
      const trigger = session.graceTrigger;
      const wasHigh = session.graceIsHigh;
      void runPipeline(session, trigger, wasHigh);
    }, GRACE_MS);
  } else {
    session.graceIsHigh = session.graceIsHigh || isHigh;
    session.graceTrigger = event.type;
  }
}

/**
 * URL for the engine's internal same-process call to its own /api/notify. Host defaults to
 * loopback — the server binds all interfaces (server.listen(port) with no host), so 127.0.0.1
 * always resolves — but is overridable via SHOOTER_INTERNAL_HOST for setups that pin the server to
 * a specific interface and block loopback.
 */
function internalNotifyUrl(): string {
  const host = process.env.SHOOTER_INTERNAL_HOST?.trim() || '127.0.0.1';
  const port = process.env.PORT || '54007';
  return `http://${host}:${port}/api/notify`;
}

// ── Pipeline ─────────────────────────────────────────────────────────

/** Run `fn` over `items` with at most `limit` in flight; preserves input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function persist(
  session: EngineSession,
  summary: string,
  steps: NextStep[],
  trigger: string,
  status: 'active' | 'completed',
  completionReason: null | string
): void {
  const record: SessionSummaryRecord = {
    completionReason,
    createdAt: new Date().toISOString(),
    id: `auto-${session.terminalId}-${Date.now()}`,
    nextSteps: JSON.stringify(steps),
    projectName: session.projectName,
    // No separate JSONL session UUID server-side; key on terminalId so
    // GET /api/summaries?sessionId=<terminalId> works (was previously null).
    sessionId: session.terminalId,
    status,
    summary,
    terminalId: session.terminalId,
    trigger,
  };
  try {
    summaryStore.insert(record);
  } catch (err) {
    console.error('[autopilot] persist failed:', err instanceof Error ? err.message : String(err));
  }
}

function projectNameFor(terminalId: string): string {
  try {
    const term = ptyManager.list().find((t) => t.id === terminalId);
    if (term?.cwd) {
      const segs = term.cwd.split('/').filter(Boolean);
      return segs.slice(-2).join('/') || terminalId;
    }
  } catch {
    // ptyManager unavailable — fall through
  }
  return terminalId;
}

function pruneSummaries(): void {
  try {
    summaryStore.pruneOld({
      maxAgeDays: PRUNE_MAX_AGE_DAYS,
      maxPerTerminal: PRUNE_MAX_PER_TERMINAL,
    });
  } catch (err) {
    console.warn('[autopilot] summary prune failed:', err instanceof Error ? err.message : err);
  }
}

async function push(session: EngineSession, summary: string, steps: NextStep[]): Promise<void> {
  const top = steps[0];
  if (!top) {
    return;
  }
  // Presence-aware: when a viewer is foregrounded (watching the live dashboard) skip the
  // push — they see it in-app. Push only when away. If no presence-aware client ever
  // reported, isViewerPresent() is false → push proceeds (prior always-push behavior).
  if (isViewerPresent()) {
    return;
  }
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return;
  }
  try {
    await fetch(internalNotifyUrl(), {
      body: JSON.stringify({
        data: {
          category: session.terminalId,
          dedupKey: `${session.terminalId}|${top.text.slice(0, 60)}`,
          sessionId: session.terminalId,
          source: 'autopilot',
        },
        message: `${summary.slice(0, 80)} — Next: ${top.text.slice(0, 60)}`,
        title: `Autopilot: ${session.projectName}`,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch (err) {
    console.warn('[autopilot] push failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Notify the phone that an autopilot task finished. Unlike push(), this is NOT presence-gated: a
 * completion fires exactly once (the session.completed guard prevents re-fires), so we always
 * deliver it — otherwise a task that finishes while the dashboard is open, then the viewer leaves
 * with no further events, would never notify at all.
 */
async function pushCompletion(
  session: EngineSession,
  summary: string,
  reason: null | string
): Promise<void> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return;
  }
  try {
    await fetch(internalNotifyUrl(), {
      body: JSON.stringify({
        data: {
          category: session.terminalId,
          // Distinct dedupKey from the next-step push so a completion is never suppressed by a
          // recent nudge for the same terminal.
          dedupKey: `${session.terminalId}|complete`,
          sessionId: session.terminalId,
          source: 'autopilot',
        },
        message: reason ?? summary.slice(0, 80),
        title: `✅ Autopilot done: ${session.projectName}`,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch (err) {
    console.warn(
      '[autopilot] completion push failed:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function readPersistedEnabled(): boolean {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      return Boolean((parsed as { enabled?: unknown })?.enabled);
    }
  } catch {
    // corrupt / unreadable
  }
  return false;
}

async function runPipeline(
  session: EngineSession,
  trigger: string,
  isHigh: boolean
): Promise<void> {
  if (!enabled || session.running) {
    return;
  }
  session.running = true;
  session.lastRunAt = Date.now();
  try {
    const context = buildEngineContext({
      errorCount: session.errorCount,
      events: session.events,
      goal: getEngineGoal(session.terminalId),
      projectName: session.projectName,
      status: session.status,
      toolCallCount: session.toolCallCount,
      trigger,
    });

    // One call yields BOTH the status sentence and the completion judgment (LLM-signalled
    // completion) — folding it in here costs no extra request. `complete` is trusted only when
    // strictly true; anything else keeps the card active.
    const summaryResult = await litellmJson<{
      complete?: boolean;
      completionReason?: string;
      summary: string;
    }>({
      maxTokens: SUMMARY_MAX_TOKENS,
      model: ENGINE_MODEL,
      systemInstruction: `${JSON_API_RULES} The object has keys: "summary" (a single sentence, max 120 characters, describing the current status of this coding session), "complete" (boolean — true ONLY when the session's goal is fully achieved and no further action is needed), and "completionReason" (a short string saying why it is complete, or "" when not complete).`,
      userPrompt: `${context}\n\nSummarise this coding session in ONE sentence (max 120 chars), and decide whether its goal is fully complete.`,
    });
    const summary = summaryResult?.summary?.trim() || fallbackSummary(session);
    const complete = summaryResult?.complete === true;
    const completionReason = complete
      ? summaryResult?.completionReason?.trim() || 'Goal complete'
      : null;

    // Run the five lenses at most LENS_CONCURRENCY in flight (default 3) so the engine never
    // saturates the LiteLLM key's parallel cap by itself. Each failed lens yields an empty list;
    // a step needs CONSENSUS_QUORUM (2) of the 5 to be non-tentative.
    const agentLists: AgentProposal[][] = await mapLimit(LENSES, LENS_CONCURRENCY, async (lens) => {
      const r = await litellmJson<{ steps: AgentProposal[] }>({
        maxTokens: STEPS_MAX_TOKENS,
        model: ENGINE_MODEL,
        systemInstruction: `${JSON_API_RULES} The object has one key "steps": an array of 1 to 3 objects, each {"text": the concrete next action for THIS exact session written in full as a string, "confidence": a number between 0 and 1}. Choose the actions from THIS perspective: ${lens}.`,
        userPrompt: `${context}\n\nGiven the session above, what should happen next?`,
      });
      return r?.steps ?? [];
    });
    const consensus = mergeNextStepConsensus(agentLists, { quorum: CONSENSUS_QUORUM });

    if (!enabled || session.cancelled) {
      return; // engine disabled or terminal exited mid-pipeline — don't persist/push a dead session
    }
    persist(
      session,
      summary,
      consensus.steps,
      trigger,
      complete ? 'completed' : 'active',
      completionReason
    );
    // A run consumed the accumulated errors — reset so the error-threshold trigger (errorCount >= 3)
    // does not stick and re-fire on every subsequent event for the rest of the session's life.
    session.errorCount = 0;
    if (complete) {
      // Mark the session done BEFORE pushing so no concurrent/subsequent run can double-fire the
      // completion notification — handleEvent now bails on a completed session until tool-started.
      session.completed = true;
      // Terminal lifecycle event — tell the phone the task is done instead of nudging a next step.
      await pushCompletion(session, summary, completionReason);
    } else if (isHigh && consensus.steps.length > 0 && !consensus.steps[0].tentative) {
      await push(session, summary, consensus.steps);
    }
  } catch (err) {
    console.error(
      `[autopilot] pipeline failed for ${session.terminalId}:`,
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    session.running = false;
  }
}
