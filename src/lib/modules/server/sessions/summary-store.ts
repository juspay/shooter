/**
 * Summary Store — SQLite persistence for session summary records.
 *
 * Persists SessionSummaryRecord rows written by the autopilot engine after
 * each summarise+consensus pipeline run. Uses better-sqlite3 with WAL journal
 * mode, mirroring the pattern from terminal-store.ts.
 *
 * Database location: ~/.shooter/shooter.db (shared with terminal-store)
 */

import type { AutopilotTaskStatus, SessionSummaryRecord } from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

import { shooterDataDir } from '../utils/shooter-home.js';

// ── Column list ──────────────────────────────────────────────────────

const COLUMNS = [
  'id',
  'terminal_id',
  'session_id',
  'project_name',
  'summary',
  'next_steps',
  'trigger',
  'created_at',
  'status',
  'completion_reason',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── SummaryStore ─────────────────────────────────────────────────────

/** SQLite-backed persistence + retention for autopilot session-summary records. */
export class SummaryStore {
  private db: Database.Database;

  // dataDir is injectable so the unit tests can run against an isolated temp
  // directory instead of the real ~/.shooter (same idiom as DeviceTokenStore).
  constructor(dataDir: string = shooterDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'shooter.db'));
    this.db.pragma('journal_mode = WAL');
    // Fresh installs get the full schema; pre-existing DBs are upgraded by migrate().
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id                TEXT PRIMARY KEY,
        terminal_id       TEXT,
        session_id        TEXT,
        project_name      TEXT,
        summary           TEXT NOT NULL,
        next_steps        TEXT NOT NULL DEFAULT '[]',
        trigger           TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'active',
        completion_reason TEXT
      )
    `);
    this.migrate();
  }

  /** Remove one record by id; returns the number of rows deleted (0 or 1). */
  deleteById(id: string): number {
    return this.db.prepare('DELETE FROM session_summaries WHERE id = ?').run(id).changes;
  }

  insert(record: SessionSummaryRecord): void {
    const placeholders = COLUMNS.map(() => '?').join(', ');
    this.db
      .prepare(`INSERT INTO session_summaries (${COLUMNS.join(', ')}) VALUES (${placeholders})`)
      .run(
        record.id,
        record.terminalId,
        record.sessionId,
        record.projectName,
        record.summary,
        record.nextSteps,
        record.trigger,
        record.createdAt,
        record.status,
        record.completionReason
      );
  }

  listRecent(limit: number, sessionId?: string): SessionSummaryRecord[] {
    if (sessionId) {
      const rows = this.db
        .prepare(
          'SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(sessionId, limit) as Record<string, unknown>[];
      return rows.map(rowToRecord);
    }
    const rows = this.db
      .prepare('SELECT * FROM session_summaries ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  /**
   * Retention. Deletes records older than `maxAgeDays`, then trims each
   * terminal's history to its newest `maxPerTerminal` rows. Either bound is
   * optional; returns the total number of rows removed. `now` is injectable
   * for deterministic tests.
   */
  pruneOld(opts?: { maxAgeDays?: number; maxPerTerminal?: number; now?: Date }): number {
    const now = opts?.now ?? new Date();
    let removed = 0;

    if (opts?.maxAgeDays !== undefined) {
      const cutoff = new Date(now.getTime() - opts.maxAgeDays * DAY_MS).toISOString();
      removed += this.db
        .prepare('DELETE FROM session_summaries WHERE created_at < ?')
        .run(cutoff).changes;
    }

    if (opts?.maxPerTerminal !== undefined) {
      // Keep the newest N ACTIVE rows per terminal; delete the rest. ROW_NUMBER() is
      // available in the SQLite better-sqlite3 ships (>= 3.25). Two deliberate choices:
      //   - completed rows are EXEMPT (filtered out before windowing) so the "✓ done" card
      //     is never displaced by a burst of fresh active rows — only maxAgeDays removes it;
      //   - COALESCE(terminal_id, id) partitions each NULL-terminal row on its own (unique) id,
      //     so unattributed external rows are not lumped into a single shared cap.
      // SECURITY: the PARTITION BY / ORDER BY identifiers below are hardcoded literals. Never
      // interpolate caller input into this window clause — the only dynamic value is `cap`, bound
      // as a `?` parameter (never string-concatenated).
      // Clamp to a sane integer: a misconfigured 0/negative cap must NOT delete every active row
      // (`rn > 0` would match all), and an absurd value shouldn't stress the DB. cap === 0 after
      // clamping means "no per-terminal trimming" → skip the DELETE entirely.
      const cap = Math.min(Math.max(Math.trunc(opts.maxPerTerminal), 0), 1000);
      if (cap > 0) {
        removed += this.db
          .prepare(
            `DELETE FROM session_summaries WHERE id IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(terminal_id, id) ORDER BY created_at DESC, id DESC
                 ) AS rn FROM session_summaries WHERE status != 'completed'
               ) WHERE rn > ?
             )`
          )
          .run(cap).changes;
      }
    }

    return removed;
  }

  // Idempotent column-add migration for shooter.db files created before the
  // lifecycle columns existed (CREATE TABLE IF NOT EXISTS is a no-op there).
  private migrate(): void {
    const cols = new Set(
      (this.db.prepare('PRAGMA table_info(session_summaries)').all() as { name: string }[]).map(
        (c) => c.name
      )
    );
    if (!cols.has('status')) {
      this.db.exec(
        `ALTER TABLE session_summaries ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`
      );
    }
    if (!cols.has('completion_reason')) {
      this.db.exec('ALTER TABLE session_summaries ADD COLUMN completion_reason TEXT');
    }
  }
}

// ── Row → Record conversion ──────────────────────────────────────────

function rowToRecord(row: Record<string, unknown>): SessionSummaryRecord {
  return {
    completionReason: (row.completion_reason as string) ?? null,
    createdAt: row.created_at as string,
    id: row.id as string,
    nextSteps: row.next_steps as string,
    projectName: (row.project_name as string) ?? null,
    sessionId: (row.session_id as string) ?? null,
    status: ((row.status as string) || 'active') as AutopilotTaskStatus,
    summary: row.summary as string,
    terminalId: (row.terminal_id as string) ?? null,
    trigger: row.trigger as string,
  };
}

// ── Singleton ────────────────────────────────────────────────────────
// Shared instance across module loaders (same pattern as terminal-store).

const SS_GLOBAL_KEY = '__shooter_summary_store';
export const summaryStore: SummaryStore =
  ((globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] as SummaryStore) || new SummaryStore();
(globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] = summaryStore;
