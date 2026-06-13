// Dashboard store — manages per-terminal SessionState, syncs from REST + WebSocket events.

import type {
  DashboardCard,
  DashboardTerminalListResponse,
  DashboardTerminalRecord,
  RawEvent,
  SessionEvent,
  SessionState,
  SummaryContext,
} from '$lib/types';

import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { SessionSummarizer } from './summarizer';

function nowIso(): string {
  return new Date(Date.now()).toISOString();
}

// -- Constants ------------------------------------------------------------

const MAX_EVENTS_PER_SESSION = 100;
const POLL_INTERVAL_MS = 15_000;
const ACTIVE_THRESHOLD_MS = 30_000;

// Exponential backoff bounds for WS reconnection
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// -- State (Svelte 5 runes) -----------------------------------------------

let sessions = $state<SessionState[]>([]);
let connected = $state(false);

let ws: null | WebSocket = null;
let pollTimer: null | ReturnType<typeof setInterval> = null;
let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
let reconnectDelay = RECONNECT_BASE_MS;
let eventCounter = 0;

// Stored api key so polling can reuse it after connect()
let storedApiKey = '';

// Per-terminal summarizer instances
const summarizers = new SvelteMap<string, SessionSummarizer>();

// Per-terminal session WS connections (for goal extraction from conversation)
const sessionSockets = new SvelteMap<string, WebSocket>();

// Terminals currently opening a session socket — reserved synchronously
// before the async ticket fetch to prevent concurrent pollers from each
// passing the `sessionSockets.has()` check and opening duplicate sockets.
const pendingSessionSockets = new SvelteSet<string>();

export async function connect(apiKey: string): Promise<void> {
  storedApiKey = apiKey || getApiKey();
  if (!storedApiKey) {
    return;
  }

  // Initial data load
  await fetchTerminals(storedApiKey);

  // WebSocket subscription
  await connectWs(storedApiKey);

  // Start polling for new terminals
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    void fetchTerminals(storedApiKey);
  }, POLL_INTERVAL_MS);
}

export function disconnect(): void {
  if (ws) {
    ws.onclose = null; // prevent reconnect loop
    ws.close();
    ws = null;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Close all per-terminal session sockets
  for (const [, sock] of sessionSockets) {
    sock.onclose = null;
    sock.close();
  }
  sessionSockets.clear();
  pendingSessionSockets.clear();
  summarizers.clear();

  connected = false;
  storedApiKey = '';
}

export function getCards(): DashboardCard[] {
  const now = Date.now();
  return sortSessions(sessions).map((s) => {
    const createdMs = Date.parse(s.createdAt);
    const lastEventTs =
      s.events.length > 0 ? Date.parse(s.events[s.events.length - 1].timestamp) : 0;

    return {
      ...s,
      duration: now - createdMs,
      goal: s.goal, // Ensure goal is mapped
      isActive: lastEventTs > 0 && now - lastEventTs < ACTIVE_THRESHOLD_MS,
      isSummarizing: s.isSummarizing, // Ensure isSummarizing is mapped
      summary: s.summary, // Ensure summary is mapped
    };
  });
}

export function getSessions(): SessionState[] {
  return sessions;
}

export function isConnected(): boolean {
  return connected;
}

// -- REST: fetch terminal list --------------------------------------------

export function updateSessionGoal(terminalId: string, goal: string): void {
  const session = sessions.find((s) => s.terminalId === terminalId);
  if (session) {
    session.goal = goal;
  }
}

export function updateSessionSummary(terminalId: string, summary: string): void {
  const session = sessions.find((s) => s.terminalId === terminalId);
  if (session) {
    session.summary = summary;
    session.summaryUpdatedAt = nowIso();
    session.isSummarizing = false;
  }
}

// -- WebSocket: events channel -------------------------------------------

function addEventToSession(
  session: SessionState,
  type: string,
  data: Record<string, unknown>
): void {
  const event: SessionEvent = {
    data,
    id: `evt-${++eventCounter}`,
    summarized: false,
    terminalId: session.terminalId,
    timestamp: (data.timestamp as null | string) ?? nowIso(),
    type,
  };

  // Ring buffer — cap at MAX_EVENTS_PER_SESSION
  const nextEvents =
    session.events.length >= MAX_EVENTS_PER_SESSION
      ? [...session.events.slice(1), event]
      : [...session.events, event];

  session.events = nextEvents;
  session.eventCount += 1;
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function closeSessionSocket(terminalId: string): void {
  const sock = sessionSockets.get(terminalId);
  if (sock) {
    sock.onclose = null;
    sock.close();
    sessionSockets.delete(terminalId);
  }
}

async function connectWs(apiKey: string): Promise<void> {
  if (ws && ws.readyState <= 1) {
    return;
  } // already open or connecting

  try {
    const ticketRes = await fetch('/api/ws-ticket', {
      headers: { Authorization: `Bearer ${apiKey}` },
      method: 'POST',
    });

    if (!ticketRes.ok) {
      scheduleReconnect(apiKey);
      return;
    }

    const { ticket } = (await ticketRes.json()) as { ticket: string };
    const wsBase = window.location.origin.replace(/^http/, 'ws');
    ws = new WebSocket(`${wsBase}/ws/events?ticket=${ticket}`);

    ws.onopen = (): void => {
      connected = true;
      reconnectDelay = RECONNECT_BASE_MS; // reset backoff on success
    };

    ws.onmessage = (msg: MessageEvent): void => {
      try {
        const raw: unknown = JSON.parse(msg.data as string);
        if (raw && typeof raw === 'object') {
          handleWsMessage(raw as RawEvent);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (): void => {
      connected = false;
      ws = null;
      scheduleReconnect(apiKey);
    };

    ws.onerror = (): void => {
      connected = false;
    };
  } catch {
    connected = false;
    scheduleReconnect(apiKey);
  }
}

// Claude Code injects these wrappers as "user" messages (slash-command caveats, system reminders,
// etc.); none is the real goal. Mirror of SYSTEM_TAG_PREFIXES in server/sessions/jsonl-reader.ts.
const HARNESS_TAG_PREFIXES = [
  '<local-command',
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<system-reminder>',
  '<task-notification>',
  'Caveat:',
];

function extractGoalText(content: string | { content?: string; type: string }[]): string {
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const textPart = content.find((p) => p.type === 'text');
    text = textPart?.content ?? '';
  }
  const trimmed = text.slice(0, 200).trim();
  // A harness wrapper is not the user's goal — skip it so the caller keeps scanning for the real one
  // (this is what let "<local-command-caveat>Caveat: …" become the pinned goal).
  return isHarnessText(trimmed) ? '' : trimmed;
}

async function fetchTerminals(apiKey: string): Promise<void> {
  if (!apiKey) {
    return;
  }

  try {
    const res = await fetch('/api/terminals', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return;
    }

    const body: DashboardTerminalListResponse = (await res.json()) as DashboardTerminalListResponse;
    const incoming = body.terminals ?? [];

    sessions = sortSessions(mergeSessions(sessions, incoming));
  } catch {
    // Network errors are silent — we'll retry on next poll
  }
}

function getApiKey(): string {
  try {
    const saved = localStorage.getItem('shooter_config');
    if (!saved) {
      return '';
    }
    const parsed: unknown = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.apiKey === 'string') {
        return obj.apiKey;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function handleWsMessage(raw: RawEvent): void {
  const type = raw.type as string | undefined;
  if (!type || type === 'welcome') {
    return;
  }

  // Resolve terminalId — may come directly, or from a terminal-created event
  const terminalId = (raw.terminalId as null | string) ?? null;

  if (!terminalId) {
    // Events without terminalId don't map to a session card — skip
    return;
  }

  const idx = sessions.findIndex((s) => s.terminalId === terminalId);
  if (idx === -1) {
    // Unknown terminal — will be picked up on next poll
    return;
  }

  const session = sessions[idx];

  switch (type) {
    case 'agent-idle':
    case 'agent-question': {
      session.status = 'idle';
      addEventToSession(session, type, raw);
      break;
    }
    case 'terminal-exited': {
      session.status = 'exited';
      session.exitedAt = (raw.exitedAt as null | string) ?? nowIso();
      addEventToSession(session, type, raw);
      // Clean up per-terminal session socket and summarizer on exit
      closeSessionSocket(terminalId);
      summarizers.delete(terminalId);
      break;
    }
    case 'tool-completed': {
      addEventToSession(session, type, raw);
      break;
    }
    case 'tool-failed': {
      session.errorCount += 1;
      addEventToSession(session, type, raw);
      break;
    }
    case 'tool-started': {
      session.toolCallCount += 1;
      session.status = 'running';
      addEventToSession(session, type, raw);
      break;
    }
    default: {
      addEventToSession(session, type, raw);
      break;
    }
  }

  // Trigger AI summarization on significant events or periodically
  const shouldSummarize =
    type === 'tool-failed' ||
    type === 'agent-question' ||
    session.errorCount >= 3 ||
    (session.eventCount > 0 && session.eventCount % 20 === 0);

  if (shouldSummarize && !session.isSummarizing) {
    triggerSummarization(session);
  }

  // Re-sort after any status change
  sessions = sortSessions(sessions);
}

function isHarnessText(text: string): boolean {
  return HARNESS_TAG_PREFIXES.some((p) => text.startsWith(p));
}

// -- Public API -----------------------------------------------------------

function makeSessionState(t: DashboardTerminalRecord): SessionState {
  return {
    command: t.command,
    createdAt: t.createdAt,
    cwd: t.cwd,
    errorCount: 0,
    eventCount: 0,
    events: [],
    exitedAt: t.exitedAt,
    goal: '',
    isSummarizing: false,
    projectName: basename(t.cwd),
    projectPath: t.cwd,
    status: mapStatus(t.status),
    summary: '',
    summaryUpdatedAt: '',
    terminalId: t.id,
    toolCallCount: 0,
  };
}

function mapStatus(raw: string): SessionState['status'] {
  if (raw === 'running') {
    return 'running';
  }
  if (raw === 'idle') {
    return 'idle';
  }
  if (raw === 'exited') {
    return 'exited';
  }
  return 'error';
}

function mergeSessions(
  existing: SessionState[],
  incoming: DashboardTerminalRecord[]
): SessionState[] {
  // Drop terminals that disappeared from the API — tear down their sockets
  // and summarizer state so cards don't linger after deletion/cleanup.
  const incomingIds = new Set(incoming.map((t) => t.id));
  for (const s of existing) {
    if (!incomingIds.has(s.terminalId)) {
      closeSessionSocket(s.terminalId);
      summarizers.delete(s.terminalId);
    }
  }

  const map = new SvelteMap<string, SessionState>();
  for (const s of existing) {
    if (incomingIds.has(s.terminalId)) {
      map.set(s.terminalId, s);
    }
  }

  for (const t of incoming) {
    const prev = map.get(t.id);
    if (prev) {
      // Preserve accumulated event data; update mutable fields from server
      prev.command = t.command;
      prev.cwd = t.cwd;
      prev.projectName = basename(t.cwd);
      prev.projectPath = t.cwd;
      prev.exitedAt = t.exitedAt;
      // Only update status from server if we don't have a more specific local status
      if (prev.status !== 'error') {
        prev.status = mapStatus(t.status);
      }
      // Schedule goal extraction if still missing — but never for an exited terminal (its socket
      // would open, get a session-end, and the poll would keep reopening it).
      if (!prev.goal && t.exitedAt === null && t.status !== 'exited') {
        void openSessionSocket(t.id);
      }
    } else {
      map.set(t.id, makeSessionState(t));
      // Open a session WS for goal extraction on newly discovered (live) terminals only
      if (t.exitedAt === null && t.status !== 'exited') {
        void openSessionSocket(t.id);
      }
    }
  }

  return Array.from(map.values());
}

async function openSessionSocket(terminalId: string): Promise<void> {
  if (!storedApiKey) {
    return;
  }
  // Do not open duplicates — check both the open-socket map and the pending
  // set. Reserving the pending slot synchronously (before the async ticket
  // fetch) closes the TOCTOU window where two concurrent calls would each
  // pass `sessionSockets.has()` and open parallel WebSockets.
  if (sessionSockets.has(terminalId) || pendingSessionSockets.has(terminalId)) {
    return;
  }
  pendingSessionSockets.add(terminalId);

  console.log(`[DashboardStore] Opening session socket for ${terminalId}`);

  try {
    const ticketRes = await fetch('/api/ws-ticket', {
      headers: { Authorization: `Bearer ${storedApiKey}` },
      method: 'POST',
    });

    if (!ticketRes.ok) {
      console.warn(`[DashboardStore] Failed to get WS ticket for ${terminalId}:`, ticketRes.status);
      return;
    }

    const { ticket } = (await ticketRes.json()) as { ticket: string };
    const wsBase = window.location.origin.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/session/${terminalId}?ticket=${ticket}`;
    console.log(`[DashboardStore] Connecting session socket for ${terminalId}`);
    const sock = new WebSocket(wsUrl);

    sessionSockets.set(terminalId, sock);

    sock.onopen = (): void => {
      console.log(`[DashboardStore] Session socket opened for ${terminalId}`);
    };

    sock.onmessage = (msg: MessageEvent): void => {
      try {
        const raw: unknown = JSON.parse(msg.data as string);
        if (!raw || typeof raw !== 'object') {
          return;
        }
        const data = raw as Record<string, unknown>;

        // Session ended — stop watching (no goal will ever arrive on this socket).
        if (data.type === 'session-end') {
          closeSessionSocket(terminalId);
          return;
        }

        // Check if we already have a goal for this terminal
        const currentSession = sessions.find((s) => s.terminalId === terminalId);
        const hasGoal = currentSession?.goal && currentSession.goal.length > 0;

        if (data.type === 'history') {
          console.log(`[DashboardStore] Received history for ${terminalId}, extracting goal...`);

          const messages = data.messages as
            | undefined
            | {
                content: string | { content?: string; type: string }[];
                role: string;
              }[];
          if (!Array.isArray(messages)) {
            console.warn(`[DashboardStore] No messages array in history for ${terminalId}`);
            return;
          }

          console.log(
            `[DashboardStore] Found ${messages.length} messages, looking for first user message...`
          );

          // Find the FIRST non-harness user message and use it as the goal. Keep scanning past
          // harness-only messages (slash-command caveats, system reminders) so they never become
          // the goal — and do NOT close the socket when none is found yet: closing here made the
          // 15s poll reopen it every cycle (the session-watcher churn).
          for (const m of messages) {
            if (m.role !== 'user') {
              continue;
            }
            const goal = extractGoalText(m.content);
            if (goal) {
              updateSessionGoal(terminalId, goal);
              syncEngineGoal(terminalId, goal);
              closeSessionSocket(terminalId);
              return;
            }
          }
          // No real user goal in history yet — keep the socket open for incoming live messages.
          return;
        }

        // Handle individual message frames — if the socket opened before any
        // user message existed, the goal never gets set from history alone.
        if (data.type === 'message' && data.role === 'user' && !hasGoal) {
          const goal = extractGoalText(
            data.content as string | { content?: string; type: string }[]
          );
          if (goal) {
            updateSessionGoal(terminalId, goal);
            syncEngineGoal(terminalId, goal);
            closeSessionSocket(terminalId);
          }
          return;
        }

        // Ignore other message types while waiting for a goal
        if (!hasGoal) {
          return;
        }

        // We have a goal already — close the socket
        closeSessionSocket(terminalId);
      } catch (err) {
        console.warn('[DashboardStore] Error processing session message:', err);
      }
    };

    sock.onclose = (): void => {
      console.log(`[DashboardStore] Session socket closed for ${terminalId}`);
      sessionSockets.delete(terminalId);
    };

    sock.onerror = (err: Event): void => {
      console.warn(`[DashboardStore] Session socket error for ${terminalId}:`, err);
      sessionSockets.delete(terminalId);
    };
  } catch (err) {
    console.warn('[DashboardStore] Failed to open session socket:', err);
  } finally {
    pendingSessionSockets.delete(terminalId);
  }
}

function scheduleReconnect(apiKey: string): void {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectWs(apiKey);
  }, reconnectDelay);

  // Exponential backoff, capped
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function sortSessions(list: SessionState[]): SessionState[] {
  return [...list].sort((a, b) => {
    const order: Record<SessionState['status'], number> = {
      error: 2,
      exited: 3,
      idle: 1,
      running: 0,
    };

    const rankA = order[a.status];
    const rankB = order[b.status];

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Within running/idle: newest first
    if (a.status !== 'exited' && b.status !== 'exited') {
      return b.createdAt.localeCompare(a.createdAt);
    }

    // Within exited: most recently exited first
    const exitA = a.exitedAt ?? a.createdAt;
    const exitB = b.exitedAt ?? b.createdAt;
    return exitB.localeCompare(exitA);
  });
}

// Push a freshly-extracted goal to the SERVER-side autopilot engine so its per-cycle LLM context is
// anchored to the real user intent. Without this the engine always ran goal-less: its goal store
// was only reachable via this route, which nothing ever called (the client only updated local
// state). Best-effort — the engine may not be running (503); the next extraction retries.
function syncEngineGoal(terminalId: string, goal: string): void {
  if (!storedApiKey) {
    return;
  }
  void fetch('/api/autopilot/goal', {
    body: JSON.stringify({ goal, terminalId }),
    headers: { Authorization: `Bearer ${storedApiKey}`, 'Content-Type': 'application/json' },
    method: 'POST',
  }).catch(() => {
    // best-effort; nothing to do on failure
  });
}

function triggerSummarization(session: SessionState): void {
  session.isSummarizing = true;

  let summarizer = summarizers.get(session.terminalId);
  if (!summarizer) {
    summarizer = new SessionSummarizer();
    summarizers.set(session.terminalId, summarizer);
  }

  const recentEvents = session.events.slice(-10).map((e) => ({
    command: typeof e.data.command === 'string' ? e.data.command : null,
    error: typeof e.data.error === 'string' ? e.data.error : null,
    tool: typeof e.data.tool === 'string' ? e.data.tool : null,
    type: e.type,
  }));

  const context: SummaryContext = {
    conversationExcerpt: session.goal ?? '',
    errorCount: session.errorCount,
    goal: session.goal,
    recentEvents,
    status: session.status,
    toolCallCount: session.toolCallCount,
  };

  void (async (): Promise<void> => {
    try {
      const result = await summarizer.summarize(context);
      updateSessionSummary(session.terminalId, result.text);
    } catch (err) {
      console.error(`[dashboard] Summarization failed for ${session.terminalId}:`, err);
    } finally {
      session.isSummarizing = false;
    }
  })();
}
