// Activity feed store — session-based polling and WebSocket streaming.
// Polls for active sessions, connects to each session's WebSocket, buffers events,
// and triggers AI summarization.

import type {
  ActivityEvent,
  ActivitySessionMessage,
  ActivitySessionRecord,
  ActivitySummary,
} from '$lib/types';

import { getApiKey } from '$lib/modules/client/common';
import { SvelteMap } from 'svelte/reactivity';

import { summarizeEvents } from './summarizer';

// -- Constants ------------------------------------------------------------

const MAX_EVENTS = 200;
const MAX_SUMMARIES = 50;
const SUMMARY_BATCH_SIZE = 5;
const SUMMARY_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 15_000;
const ACTIVE_THRESHOLD_MINUTES = 5;

// -- State (Svelte 5 runes) -----------------------------------------------

let events = $state<ActivityEvent[]>([]);
let summaries = $state<ActivitySummary[]>([]);
let aiAvailable = $state(true);
let connected = $state(false);
let summarizing = $state(false);

let pollTimer: null | ReturnType<typeof setInterval> = null;
let summaryTimer: null | ReturnType<typeof setInterval> = null;
let counter = 0;

// Per-session WebSocket connections
const sessionSockets = new SvelteMap<string, WebSocket>();

// Stored API key for polling
let storedApiKey = '';
let storedTicketFetcher: (() => Promise<string>) | null = null;

// -- Public API -----------------------------------------------------------

export async function connect(ticketFetcher: () => Promise<string>): Promise<void> {
  if (pollTimer) {
    // Already connected
    return;
  }

  storedApiKey = getApiKey();
  if (!storedApiKey) {
    console.warn('[ActivityStore] No API key available');
    return;
  }

  storedTicketFetcher = ticketFetcher;

  // Initial session discovery
  await discoverAndConnectSessions();

  // Start polling for new sessions every 15s
  pollTimer = setInterval(() => {
    void discoverAndConnectSessions();
  }, POLL_INTERVAL_MS);

  // Start periodic summarization
  summaryTimer = setInterval(() => {
    void tryGenerateSummary();
  }, SUMMARY_INTERVAL_MS);
}

export function disconnect(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }

  // Close all session sockets
  for (const [sessionId, sock] of sessionSockets) {
    sock.onclose = null;
    sock.close();
    console.log(`[ActivityStore] Closed session socket for ${sessionId}`);
  }
  sessionSockets.clear();

  // Reset in-memory feed so reconnect starts clean (no duplicate history replay
  // or stale summary/banner state carried forward).
  events = [];
  summaries = [];
  counter = 0;
  aiAvailable = true;
  summarizing = false;
  connected = false;
  storedApiKey = '';
  storedTicketFetcher = null;
}

export function getEvents(): ActivityEvent[] {
  return events;
}

export function getSummaries(): ActivitySummary[] {
  return summaries;
}

export function isAiAvailable(): boolean {
  return aiAvailable;
}

export function isConnected(): boolean {
  return connected;
}

export function isSummarizing(): boolean {
  return summarizing;
}

// -- Internal: Session Discovery ------------------------------------------

/** Add a typed event to the activity buffer. */
function addActivityEvent(
  session: ActivitySessionRecord,
  eventType: string,
  eventData: Record<string, unknown>,
  timestamp?: string
): void {
  const event: ActivityEvent = {
    data: eventData,
    id: `evt-${++counter}`,
    projectName: session.projectName,
    sessionId: session.id,
    summarized: false,
    timestamp: timestamp || new Date().toISOString(),
    type: eventType,
  };

  events = [...events, event].slice(-MAX_EVENTS);

  // Trigger summary when batch size reached
  const pending = events.filter((e) => !e.summarized);
  if (pending.length >= SUMMARY_BATCH_SIZE) {
    void tryGenerateSummary();
  }
}

async function connectSessionSocket(session: ActivitySessionRecord): Promise<void> {
  if (!storedTicketFetcher) {
    return;
  }

  try {
    const ticket = await storedTicketFetcher();
    const wsBase = window.location.origin.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/session/${session.id}?ticket=${ticket}`;

    console.log(`[ActivityStore] Connecting to session ${session.id}`);
    const sock = new WebSocket(wsUrl);
    sessionSockets.set(session.id, sock);

    sock.onopen = (): void => {
      console.log(`[ActivityStore] Session socket opened: ${session.id}`);
      connected = true;
    };

    sock.onmessage = (msg: MessageEvent): void => {
      try {
        const raw: unknown = JSON.parse(msg.data as string);
        if (!raw || typeof raw !== 'object') {
          return;
        }

        const data = raw as Record<string, unknown>;
        handleActivitySessionMessage(session, data);

        // Trigger immediate summary after receiving history batch
        if (data.type === 'history') {
          void tryGenerateSummary();
        }
      } catch {
        // ignore malformed
      }
    };

    sock.onclose = (): void => {
      console.log(`[ActivityStore] Session socket closed: ${session.id}`);
      sessionSockets.delete(session.id);
      connected = sessionSockets.size > 0;
    };

    sock.onerror = (err: Event): void => {
      console.warn(`[ActivityStore] Session socket error for ${session.id}:`, err);
      sessionSockets.delete(session.id);
      connected = sessionSockets.size > 0;
    };
  } catch (err) {
    console.warn(`[ActivityStore] Failed to connect session ${session.id}:`, err);
  }
}

async function discoverAndConnectSessions(): Promise<void> {
  if (!storedApiKey) {
    return;
  }

  try {
    const res = await fetch('/api/sessions?limit=50', {
      headers: { Authorization: `Bearer ${storedApiKey}` },
    });

    if (!res.ok) {
      console.warn('[ActivityStore] Failed to fetch sessions:', res.status);
      return;
    }

    const body = (await res.json()) as {
      projects?: {
        fullPath: string;
        id: string;
        lastModified: string;
        name: string;
        sessions: {
          created: string;
          id: string;
          messageCount: number;
          modified: string;
          title: string;
        }[];
      }[];
    };
    const projects = body.projects ?? [];

    // Flatten projects into session records, filter to sessions modified in last 5 minutes
    const cutoff = Date.now() - ACTIVE_THRESHOLD_MINUTES * 60 * 1000;
    const activeSessions: ActivitySessionRecord[] = [];
    for (const project of projects) {
      for (const session of project.sessions) {
        const modified = Date.parse(session.modified);
        if (modified > cutoff) {
          activeSessions.push({
            createdAt: session.created,
            id: session.id,
            modifiedAt: session.modified,
            projectName: project.name,
            projectPath: project.fullPath,
          });
        }
      }
    }

    const activeIds = new Set(activeSessions.map((s) => s.id));

    // Close sockets for sessions that are no longer active
    for (const [sessionId, sock] of sessionSockets) {
      if (!activeIds.has(sessionId)) {
        sock.onclose = null;
        sock.close();
        sessionSockets.delete(sessionId);
        console.log(`[ActivityStore] Session ${sessionId} went stale, closed socket`);
      }
    }

    // Open sockets for new active sessions
    for (const session of activeSessions) {
      if (!sessionSockets.has(session.id)) {
        void connectSessionSocket(session);
      }
    }

    connected = sessionSockets.size > 0;
  } catch (err) {
    console.warn('[ActivityStore] Error discovering sessions:', err);
  }
}

function handleActivitySessionMessage(
  session: ActivitySessionRecord,
  data: Record<string, unknown>
): void {
  const type = data.type as string | undefined;

  if (type === 'history' && Array.isArray(data.messages)) {
    // Initial batch — process last 20 for context
    const messages = data.messages as ActivitySessionMessage[];
    const recentMessages = messages.slice(-20);
    for (const msg of recentMessages) {
      processMessage(session, msg);
    }
  } else if (type === 'message') {
    // Conversation message (role + content)
    processMessage(session, {
      content: (data.content as ActivitySessionMessage['content']) || '',
      role: (data.role as string) || 'assistant',
      timestamp: data.timestamp as string,
    });
  } else if (type === 'tool-use') {
    // Tool execution started
    const name = (data.name as string) || 'unknown';
    const input =
      typeof data.input === 'object' && data.input !== null
        ? (data.input as Record<string, unknown>)
        : {};
    const filePath = (input.file_path as string) || (input.path as string) || '';
    const command = (input.command as string) || '';
    const pattern = (input.pattern as string) || '';
    addActivityEvent(session, 'tool_use', {
      command: command.slice(0, 120),
      filePath: filePath.slice(0, 200),
      name,
      pattern: pattern.slice(0, 100),
      tool: name,
    });
  } else if (type === 'tool-result') {
    // Tool result received
    const isError = data.isError === true;
    const output = ((data.output as string) || '').slice(0, 200);
    // Fall back to the last tool_use event's name when data.name is missing
    let toolName = (data.name as string) || '';
    if (!toolName) {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'tool_use' && events[i].data.name) {
          toolName = events[i].data.name as string;
          break;
        }
      }
    }
    addActivityEvent(session, 'tool_result', {
      is_error: isError,
      output,
      status: isError ? 'error' : 'done',
      tool: toolName,
    });
    if (isError) {
      void tryGenerateSummary();
    }
  } else if (type === 'thinking') {
    // Skip thinking blocks — too verbose for activity feed
  } else if (type === 'error') {
    addActivityEvent(session, 'error', {
      message: (data.message as string) || 'Unknown error',
    });
    void tryGenerateSummary();
  } else if (type === 'session-end') {
    addActivityEvent(session, 'session_end', {});
    void tryGenerateSummary();
  }
  // Ignore 'welcome' and other unknown types
}

/** Process a conversation message from the history batch. */
function processMessage(session: ActivitySessionRecord, msg: ActivitySessionMessage): void {
  const timestamp = msg.timestamp || new Date().toISOString();

  // Extract content text
  let contentText = '';
  if (typeof msg.content === 'string') {
    contentText = msg.content;
  } else if (Array.isArray(msg.content)) {
    const textParts = msg.content
      .filter((p) => p.type === 'text')
      .map((p) => p.text || p.content || '');
    contentText = textParts.join('');
  }

  if (msg.role === 'user') {
    addActivityEvent(
      session,
      'user_message',
      {
        text: contentText.slice(0, 150),
      },
      timestamp
    );
  } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    const toolUses = msg.content.filter((p) => p.type === 'tool_use');
    for (const tu of toolUses) {
      const raw = tu as unknown as Record<string, unknown>;
      const input =
        typeof raw.input === 'object' && raw.input !== null
          ? (raw.input as Record<string, unknown>)
          : {};
      addActivityEvent(
        session,
        'tool_use',
        {
          command: ((input.command as string) || '').slice(0, 120),
          filePath: ((input.file_path as string) || (input.path as string) || '').slice(0, 200),
          name: tu.name || 'unknown',
          tool: tu.name || 'unknown',
        },
        timestamp
      );
    }
  }
  // Skip assistant text, system messages, and other roles for activity feed
}

// -- Internal: Summarization ----------------------------------------------

async function tryGenerateSummary(): Promise<void> {
  if (summarizing) {
    return;
  }

  const unsummarized = events.filter((e) => !e.summarized);
  if (unsummarized.length === 0) {
    return;
  }

  // Group by project
  const byProject = new SvelteMap<string, ActivityEvent[]>();
  for (const event of unsummarized) {
    const project = event.projectName || 'Unknown';
    if (!byProject.has(project)) {
      byProject.set(project, []);
    }
    const bucket = byProject.get(project);
    if (bucket) {
      bucket.push(event);
    }
  }

  // Only summarize projects with enough events
  const ready = Array.from(byProject.entries()).filter(
    ([, projectEvents]) => projectEvents.length >= SUMMARY_BATCH_SIZE
  );

  if (ready.length === 0) {
    return;
  }

  summarizing = true;
  try {
    // Run up to 3 project summaries in parallel
    const results = await Promise.allSettled(
      ready.slice(0, 3).map(async ([projectName, projectEvents]) => {
        const result = await summarizeEvents(projectEvents, projectName);
        return { projectEvents, projectName, result };
      })
    );

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value.result.text) {
        continue;
      }
      const { projectEvents, projectName, result } = r.value;

      // Detect AI unavailability from error flag
      if (result.error?.includes('No AI provider')) {
        aiAvailable = false;
      }

      const summary: ActivitySummary = {
        eventIds: projectEvents.map((e) => e.id),
        id: `sum-${++counter}`,
        projectName,
        text: result.text,
        timestamp: new Date().toISOString(),
      };

      summaries = [...summaries, summary].slice(-MAX_SUMMARIES);

      const ids = new Set(projectEvents.map((e) => e.id));
      events = events.map((e) => (ids.has(e.id) ? { ...e, summarized: true } : e));
    }
  } catch (err) {
    console.warn('[ActivityStore] Summarization failed:', err);
  } finally {
    summarizing = false;
  }
}
