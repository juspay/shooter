/**
 * Terminal Store — SQLite persistence for terminal metadata.
 *
 * Persists TerminalRecord rows so PtyManager can recover running terminals
 * after a server restart. Uses better-sqlite3 with WAL journal mode.
 *
 * Database location: ~/.shooter/shooter.db
 */

import type { TerminalRecord } from '$generated/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ────────────────────────────────────────────────────────

const DB_DIR = path.join(process.env.HOME || '', '.shooter');
const DB_PATH = path.join(DB_DIR, 'shooter.db');

// ── Snake/Camel Conversion ───────────────────────────────────────────

/** Column order used by INSERT. */
const COLUMNS = [
  'id',
  'command',
  'args',
  'cwd',
  'cols',
  'rows',
  'pid',
  'holder_pid',
  'socket_path',
  'session_file',
  'opencode_session_id',
  'status',
  'exit_code',
  'created_at',
  'exited_at',
] as const;

/** Map a snake_case DB row to a camelCase TerminalRecord. */
function rowToRecord(row: Record<string, unknown>): TerminalRecord {
  return {
    args: row.args as string,
    cols: row.cols as number,
    command: row.command as string,
    createdAt: row.created_at as string,
    cwd: row.cwd as string,
    exitCode: (row.exit_code as number) ?? null,
    exitedAt: (row.exited_at as string) ?? null,
    holderPid: (row.holder_pid as number) ?? null,
    id: row.id as string,
    opencodeSessionId: (row.opencode_session_id as string) ?? null,
    pid: (row.pid as number) ?? null,
    rows: row.rows as number,
    sessionFile: (row.session_file as string) ?? null,
    socketPath: (row.socket_path as string) ?? null,
    status: row.status as TerminalRecord['status'],
  };
}

/** Map camelCase field name to snake_case column name. */
const CAMEL_TO_SNAKE: Record<string, string> = {
  createdAt: 'created_at',
  exitCode: 'exit_code',
  exitedAt: 'exited_at',
  holderPid: 'holder_pid',
  opencodeSessionId: 'opencode_session_id',
  sessionFile: 'session_file',
  socketPath: 'socket_path',
};

export class TerminalStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
			CREATE TABLE IF NOT EXISTS terminals (
				id                    TEXT PRIMARY KEY,
				command               TEXT NOT NULL,
				args                  TEXT NOT NULL DEFAULT '[]',
				cwd                   TEXT NOT NULL,
				cols                  INTEGER NOT NULL DEFAULT 80,
				rows                  INTEGER NOT NULL DEFAULT 24,
				pid                   INTEGER,
				holder_pid            INTEGER,
				socket_path           TEXT,
				session_file          TEXT,
				opencode_session_id   TEXT,
				status                TEXT NOT NULL DEFAULT 'running',
				exit_code             INTEGER,
				created_at            TEXT NOT NULL,
				exited_at             TEXT
			)
		`);
  }

  deleteOlderThan(ms: number): number {
    const cutoff = new Date(Date.now() - ms).toISOString();
    const result = this.db
      .prepare(
        "DELETE FROM terminals WHERE status IN ('exited', 'orphaned') AND COALESCE(exited_at, created_at) < ?"
      )
      .run(cutoff);
    return result.changes;
  }

  get(id: string): null | TerminalRecord {
    const row = this.db.prepare('SELECT * FROM terminals WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  insert(terminal: TerminalRecord): void {
    const placeholders = COLUMNS.map(() => '?').join(', ');
    const stmt = this.db.prepare(
      `INSERT INTO terminals (${COLUMNS.join(', ')}) VALUES (${placeholders})`
    );
    stmt.run(
      terminal.id,
      terminal.command,
      terminal.args,
      terminal.cwd,
      terminal.cols,
      terminal.rows,
      terminal.pid,
      terminal.holderPid,
      terminal.socketPath,
      terminal.sessionFile,
      terminal.opencodeSessionId,
      terminal.status,
      terminal.exitCode,
      terminal.createdAt,
      terminal.exitedAt
    );
  }

  listAll(): TerminalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM terminals ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  listRunning(): TerminalRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM terminals WHERE status = 'running' ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  markExited(id: string, exitCode: null | number): void {
    this.db
      .prepare("UPDATE terminals SET status = 'exited', exit_code = ?, exited_at = ? WHERE id = ?")
      .run(exitCode, new Date().toISOString(), id);
  }

  markOrphaned(id: string): void {
    this.db
      .prepare(
        "UPDATE terminals SET status = 'orphaned', exited_at = COALESCE(exited_at, ?) WHERE id = ?"
      )
      .run(new Date().toISOString(), id);
  }

  update(id: string, fields: Partial<TerminalRecord>): void {
    const entries = Object.entries(fields).filter(
      ([key, val]) => key !== 'id' && val !== undefined
    );
    if (entries.length === 0) {
      return;
    }

    const sets = entries.map(([key]) => `${toSnake(key)} = ?`).join(', ');
    const values = entries.map(([, val]) => val ?? null);

    this.db.prepare(`UPDATE terminals SET ${sets} WHERE id = ?`).run(...values, id);
  }
}

// ── TerminalStore Class ──────────────────────────────────────────────

function toSnake(key: string): string {
  return CAMEL_TO_SNAKE[key] || key;
}

// ── Singleton ────────────────────────────────────────────────────────
// Use globalThis to ensure a single shared instance across module
// loaders (same pattern as pty-manager, session-watcher, opencode-watcher).

const TS_GLOBAL_KEY = '__shooter_terminal_store';
export const terminalStore: TerminalStore =
  ((globalThis as Record<string, unknown>)[TS_GLOBAL_KEY] as TerminalStore) || new TerminalStore();
(globalThis as Record<string, unknown>)[TS_GLOBAL_KEY] = terminalStore;
