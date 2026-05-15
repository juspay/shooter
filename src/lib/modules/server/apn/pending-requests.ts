/**
 * Pending Permission Requests Store — SQLite persistence.
 *
 * Persists in-flight permission requests so they survive server
 * restarts. Used by `/api/notify` (creates entries) and `/api/response`
 * (reads/updates decisions). notifier.cjs polls `/api/response` via
 * HTTP, so persisting the row is sufficient — there are no in-process
 * callbacks that need recovery.
 *
 * Database location: `~/.shooter/shooter.db` (shared with terminal-store).
 */

import type { PendingRequest } from '$lib/types';

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
        request_id  TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        tool_name   TEXT NOT NULL,
        tool_input  TEXT NOT NULL DEFAULT '{}',
        decision    TEXT,
        created_at  INTEGER NOT NULL,
        decided_at  INTEGER
      )
    `);
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

  insert(
    requestId: string,
    data: { sessionId: string; toolInput: Record<string, unknown>; toolName: string }
  ): void {
    // INSERT OR REPLACE matches the old Map.set semantics: a second
    // create with the same requestId silently overwrites instead of
    // erroring on UNIQUE constraint.
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_requests
         (request_id, session_id, tool_name, tool_input, decision, created_at, decided_at)
         VALUES (?, ?, ?, ?, NULL, ?, NULL)`
      )
      .run(requestId, data.sessionId, data.toolName, JSON.stringify(data.toolInput), Date.now());
  }

  setDecision(requestId: string, decision: 'allow' | 'deny'): boolean {
    const result = this.db
      .prepare('UPDATE pending_requests SET decision = ?, decided_at = ? WHERE request_id = ?')
      .run(decision, Date.now(), requestId);
    return result.changes > 0;
  }
}

function rowToRecord(row: Record<string, unknown>): PendingRequest {
  let toolInput: Record<string, unknown> = {};
  if (typeof row.tool_input === 'string' && row.tool_input.length > 0) {
    try {
      const parsed: unknown = JSON.parse(row.tool_input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        toolInput = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt JSON — fall back to empty.
    }
  }
  return {
    createdAt: row.created_at as number,
    decidedAt: (row.decided_at as null | number) ?? null,
    decision: (row.decision as null | PendingRequest['decision']) ?? null,
    sessionId: row.session_id as string,
    toolInput,
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
  data: { sessionId: string; toolInput: Record<string, unknown>; toolName: string }
): void {
  cleanup();
  pendingRequestsStore.insert(requestId, data);
}

export function getDecision(requestId: string): {
  decision?: 'allow' | 'deny';
  status: 'decided' | 'not_found' | 'pending';
} {
  const entry = pendingRequestsStore.get(requestId);
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

export function setDecision(requestId: string, decision: 'allow' | 'deny'): boolean {
  return pendingRequestsStore.setDecision(requestId, decision);
}
