/**
 * Summary Store — SQLite persistence for session summary records.
 *
 * Persists SessionSummaryRecord rows written by the autopilot engine after
 * each summarise+consensus pipeline run. Uses better-sqlite3 with WAL journal
 * mode, mirroring the pattern from terminal-store.ts.
 *
 * Database location: ~/.shooter/shooter.db (shared with terminal-store)
 */

import type { SessionSummaryRecord } from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

import { shooterDataDir } from '../utils/shooter-home.js';

// ── Constants ────────────────────────────────────────────────────────

const DB_DIR = shooterDataDir();
const DB_PATH = path.join(DB_DIR, 'shooter.db');

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
] as const;

// ── Row ↔ Record conversion ──────────────────────────────────────────

export class SummaryStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id           TEXT PRIMARY KEY,
        terminal_id  TEXT,
        session_id   TEXT,
        project_name TEXT,
        summary      TEXT NOT NULL,
        next_steps   TEXT NOT NULL DEFAULT '[]',
        trigger      TEXT NOT NULL,
        created_at   TEXT NOT NULL
      )
    `);
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
        record.createdAt
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
}

// ── SummaryStore ─────────────────────────────────────────────────────

function rowToRecord(row: Record<string, unknown>): SessionSummaryRecord {
  return {
    createdAt: row.created_at as string,
    id: row.id as string,
    nextSteps: row.next_steps as string,
    projectName: (row.project_name as string) ?? null,
    sessionId: (row.session_id as string) ?? null,
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
