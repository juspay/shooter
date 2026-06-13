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
import { homedir } from 'os';
import { join } from 'path';

import { ptyManager } from '../terminal/pty-manager.js';
import { onShooterEvent } from '../ws/events-handler.js';
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
const SUMMARY_MAX_TOKENS = 220;
const STEPS_MAX_TOKENS = 320;
const STATE_FILE = join(homedir(), '.shooter', 'autopilot.json');

/** Five DISTINCT lenses — each a different perspective, so votes mean real agreement. */
const LENSES = [
  'You are a BLOCKER-detection agent. Identify what is currently preventing progress or is most likely to fail next.',
  'You are a NEXT-COMMAND planner. Propose the exact shell commands or file edits the agent should run next, in order.',
  'You are a RISK analyst. Identify what could go wrong if the agent continues on its current path, and what to validate first.',
  'You are a VALIDATION agent. Propose how to verify the work so far is correct — the tests, checks, or inspections to run.',
  'You are a PROGRESS agent. Propose the single most direct next step toward completing the session goal.',
] as const;

// ── Per-session state (globalThis-shared) ───────────────────────────

// eslint-disable-next-line no-restricted-syntax -- internal engine state, never exported
interface EngineSession {
  errorCount: number;
  eventCount: number;
  events: string[];
  graceTimer: null | ReturnType<typeof setTimeout>;
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

// ── Control (exposed on globalThis so the /api/autopilot route can reach it) ──

export function isAutopilotEnabled(): boolean {
  return enabled;
}

export function setAutopilotEnabled(value: boolean): void {
  enabled = value;
  try {
    mkdirSync(join(homedir(), '.shooter'), { recursive: true });
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
  const control = { isEnabled: isAutopilotEnabled, setEnabled: setAutopilotEnabled };
  (globalThis as Record<string, unknown>).__shooter_autopilot = control;
  unsubscribe = onShooterEvent(handleEvent);
  console.log(
    `[autopilot] engine started (enabled=${enabled}, litellm=${isLiteLLMConfigured() ? 'configured' : 'absent'})`
  );
}

// ── Event handling ───────────────────────────────────────────────────

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
    parts.push(`msg=${event.message.slice(0, 120)}`);
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
      break;
    default:
      break;
  }
}

function createSession(terminalId: string): EngineSession {
  const session: EngineSession = {
    errorCount: 0,
    eventCount: 0,
    events: [],
    graceTimer: null,
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

// ── Pipeline ─────────────────────────────────────────────────────────

function handleEvent(event: WireShooterEvent): void {
  const terminalId = 'terminalId' in event ? event.terminalId : undefined;
  if (!terminalId) {
    return;
  }

  if (event.type === 'terminal-exited') {
    const s = sessions.get(terminalId);
    if (s?.graceTimer) {
      clearTimeout(s.graceTimer);
    }
    sessions.delete(terminalId);
    return;
  }

  const session = sessions.get(terminalId) ?? createSession(terminalId);
  session.eventCount += 1;
  applyEvent(session, event);

  if (!enabled || session.running) {
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
  // Schedule once; do NOT reset on every event (so a burst doesn't delay the run).
  if (!session.graceTimer) {
    session.graceTimer = setTimeout(() => {
      session.graceTimer = null;
      void runPipeline(session, event.type, isHigh);
    }, GRACE_MS);
  }
}

function persist(
  session: EngineSession,
  summary: string,
  steps: NextStep[],
  trigger: string
): void {
  const record: SessionSummaryRecord = {
    createdAt: new Date().toISOString(),
    id: `auto-${session.terminalId}-${Date.now()}`,
    nextSteps: JSON.stringify(steps),
    projectName: session.projectName,
    // No separate JSONL session UUID server-side; key on terminalId so
    // GET /api/summaries?sessionId=<terminalId> works (was previously null).
    sessionId: session.terminalId,
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

async function push(session: EngineSession, summary: string, steps: NextStep[]): Promise<void> {
  const top = steps[0];
  if (!top) {
    return;
  }
  const port = process.env.PORT || '54007';
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return;
  }
  try {
    await fetch(`http://127.0.0.1:${port}/api/notify`, {
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
    const context =
      `Project: ${session.projectName}\nStatus: ${session.status}\nErrors: ${session.errorCount}\n` +
      `Tool calls: ${session.toolCallCount}\nRecent events: ${session.events.slice(-12).join('; ')}\n` +
      `Trigger: ${trigger}`;

    const summaryResult = await litellmJson<{ summary: string }>({
      maxTokens: SUMMARY_MAX_TOKENS,
      systemInstruction:
        'You are a coding-session monitor. Respond ONLY with valid JSON: {"summary":"<one sentence, max 120 chars>"}. No markdown, no prose outside the JSON.',
      userPrompt: `${context}\n\nSummarise what is happening in this coding session in ONE sentence (max 120 chars).`,
    });
    const summary = summaryResult?.summary?.trim() || fallbackSummary(session);

    const lensResults = await Promise.allSettled(
      LENSES.map((lens) =>
        litellmJson<{ steps: AgentProposal[] }>({
          maxTokens: STEPS_MAX_TOKENS,
          systemInstruction: `${lens} Respond ONLY with valid JSON: {"steps":[{"text":"<short action>","confidence":0.9}]}. Up to 3 steps, confidence 0-1. No markdown.`,
          userPrompt: `${context}\n\nGiven the session above, what should happen next from your perspective?`,
        })
      )
    );
    // Keep all 5 lists (including empty on failure) so quorum stays 3-of-5.
    const agentLists: AgentProposal[][] = lensResults.map((r) =>
      r.status === 'fulfilled' ? (r.value?.steps ?? []) : []
    );
    const consensus = mergeNextStepConsensus(agentLists);

    if (!enabled) {
      return;
    }
    persist(session, summary, consensus.steps, trigger);
    if (isHigh && consensus.steps.length > 0 && !consensus.steps[0].tentative) {
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
