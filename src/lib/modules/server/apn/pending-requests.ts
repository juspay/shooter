/**
 * Pending Permission Requests Store — SQLite persistence.
 *
 * Persists in-flight permission requests so they survive server
 * restarts. Used by `/api/notify` (creates entries), `/api/response`
 * (reads/updates decisions), and `/api/decide/[id]` (returns the
 * question + options for the iOS Decide screen). notifier.cjs polls
 * `/api/response` via HTTP, so persisting the row is sufficient —
 * there are no in-process callbacks that need recovery.
 *
 * Database location: `~/.shooter/shooter.db` (shared with terminal-store).
 *
 * Schema evolution: the original table had only the binary
 * permission columns. Newer columns (question, options, response_kind)
 * support dynamic-options notifications (plan-mode, MCP elicitation,
 * AskUserQuestion). They are added via ALTER TABLE if missing, so the
 * store works against both fresh DBs and DBs from older versions.
 */

import type {
  DecisionKind,
  OptionChoice,
  PendingRequest,
  PendingRequestRich,
  ResponseKind,
} from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export type { PendingRequest };

const MAX_AGE_MS = 5 * 60 * 1000;

const DB_DIR = path.join(process.env.HOME || '', '.shooter');
const DB_PATH = path.join(DB_DIR, 'shooter.db');

export class PendingRequestsStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id    TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        tool_name     TEXT NOT NULL,
        tool_input    TEXT NOT NULL DEFAULT '{}',
        decision      TEXT,
        created_at    INTEGER NOT NULL,
        decided_at    INTEGER,
        question      TEXT,
        options       TEXT NOT NULL DEFAULT '[]',
        response_kind TEXT NOT NULL DEFAULT 'hook'
      )
    `);
    this.migrate();
  }

  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare('DELETE FROM pending_requests WHERE created_at < ?').run(cutoff);
    return result.changes;
  }

  delete(requestId: string): void {
    this.db.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId);
  }

  get(requestId: string): null | PendingRequest {
    const row = this.db
      .prepare('SELECT * FROM pending_requests WHERE request_id = ?')
      .get(requestId) as Record<string, unknown> | undefined;
    return row ? rowToRecord(row) : null;
  }

  getRich(requestId: string): null | PendingRequestRich {
    const row = this.db
      .prepare('SELECT * FROM pending_requests WHERE request_id = ?')
      .get(requestId) as Record<string, unknown> | undefined;
    return row ? rowToRich(row) : null;
  }

  insert(
    requestId: string,
    data: {
      options?: OptionChoice[];
      question?: null | string;
      responseKind?: ResponseKind;
      sessionId: string;
      toolInput: Record<string, unknown>;
      toolName: string;
    }
  ): void {
    // INSERT OR REPLACE matches the old Map.set semantics: a second
    // create with the same requestId silently overwrites instead of
    // erroring on UNIQUE constraint.
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_requests
         (request_id, session_id, tool_name, tool_input, decision, created_at, decided_at, question, options, response_kind)
         VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)`
      )
      .run(
        requestId,
        data.sessionId,
        data.toolName,
        JSON.stringify(data.toolInput),
        Date.now(),
        data.question ?? null,
        JSON.stringify(data.options ?? []),
        data.responseKind ?? 'hook'
      );
  }

  setDecision(requestId: string, decision: DecisionKind): boolean {
    const result = this.db
      .prepare('UPDATE pending_requests SET decision = ?, decided_at = ? WHERE request_id = ?')
      .run(decision, Date.now(), requestId);
    return result.changes > 0;
  }

  /**
   * Add columns introduced in later versions. Idempotent — uses
   * PRAGMA table_info to check before each ALTER TABLE so re-running
   * against a fully-migrated DB is a no-op.
   */
  private migrate(): void {
    const cols = this.db.prepare('PRAGMA table_info(pending_requests)').all() as {
      name: string;
    }[];
    const existing = new Set(cols.map((c) => c.name));
    const wanted: { name: string; sql: string }[] = [
      { name: 'question', sql: 'ALTER TABLE pending_requests ADD COLUMN question TEXT' },
      {
        name: 'options',
        sql: "ALTER TABLE pending_requests ADD COLUMN options TEXT NOT NULL DEFAULT '[]'",
      },
      {
        name: 'response_kind',
        sql: "ALTER TABLE pending_requests ADD COLUMN response_kind TEXT NOT NULL DEFAULT 'hook'",
      },
    ];
    for (const col of wanted) {
      if (!existing.has(col.name)) {
        this.db.exec(col.sql);
      }
    }
  }
}

function parseOptions(raw: unknown): OptionChoice[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as OptionChoice[];
    }
  } catch {
    // corrupt JSON — fall back to empty
  }
  return [];
}

function parseToolInput(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // corrupt JSON — fall back to empty
  }
  return {};
}

function rowToRecord(row: Record<string, unknown>): PendingRequest {
  // Legacy adapter — only exposes the binary-decision fields the older
  // PendingRequest YAML type knows about. New callers should use
  // rowToRich() / getRich() instead.
  const decision = row.decision;
  return {
    createdAt: row.created_at as number,
    decidedAt: (row.decided_at as null | number) ?? null,
    decision: decision === 'allow' || decision === 'deny' ? decision : null,
    sessionId: row.session_id as string,
    toolInput: parseToolInput(row.tool_input),
    toolName: row.tool_name as string,
  };
}

function rowToRich(row: Record<string, unknown>): PendingRequestRich {
  const responseKindRaw = typeof row.response_kind === 'string' ? row.response_kind : 'hook';
  const responseKind: ResponseKind =
    responseKindRaw === 'hook' || responseKindRaw === 'pty' || responseKindRaw === 'info'
      ? responseKindRaw
      : 'hook';
  return {
    createdAt: row.created_at as number,
    decidedAt: (row.decided_at as null | number) ?? null,
    decision: (row.decision as DecisionKind | null) ?? null,
    options: parseOptions(row.options),
    question: (row.question as null | string) ?? null,
    requestId: row.request_id as string,
    responseKind,
    sessionId: row.session_id as string,
    toolInput: parseToolInput(row.tool_input),
    toolName: row.tool_name as string,
  };
}

// Singleton via globalThis (matches terminal-store.ts pattern so SvelteKit's
// module loaders don't accidentally produce multiple instances).
const PR_GLOBAL_KEY = '__shooter_pending_requests_store';
const pendingRequestsStore: PendingRequestsStore =
  ((globalThis as Record<string, unknown>)[PR_GLOBAL_KEY] as PendingRequestsStore) ||
  new PendingRequestsStore();
(globalThis as Record<string, unknown>)[PR_GLOBAL_KEY] = pendingRequestsStore;

export function cleanup(maxAgeMs: number = MAX_AGE_MS): void {
  pendingRequestsStore.cleanup(maxAgeMs);
}

export function createPendingRequest(
  requestId: string,
  data: {
    options?: OptionChoice[];
    question?: null | string;
    responseKind?: ResponseKind;
    sessionId: string;
    toolInput: Record<string, unknown>;
    toolName: string;
  }
): void {
  cleanup();
  pendingRequestsStore.insert(requestId, data);
}

export function getDecision(requestId: string): {
  decision?: DecisionKind;
  status: 'decided' | 'not_found' | 'pending';
} {
  const entry = pendingRequestsStore.getRich(requestId);
  if (!entry) {
    return { status: 'not_found' };
  }
  if (entry.decision) {
    // Match the old in-memory behavior: delete on first decided read so
    // the polling client only ever sees the decision once.
    pendingRequestsStore.delete(requestId);
    return { decision: entry.decision, status: 'decided' };
  }
  return { status: 'pending' };
}

/** Used by /api/decide/[requestId] to render the Decide screen. */
export function getRichRequest(requestId: string): null | PendingRequestRich {
  return pendingRequestsStore.getRich(requestId);
}

export function setDecision(requestId: string, decision: DecisionKind): boolean {
  return pendingRequestsStore.setDecision(requestId, decision);
}
