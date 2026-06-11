/**
 * Share Store — SQLite persistence for terminal sharing.
 *
 * terminal_shares: one share per terminal (scrypt password hash + mode).
 * share_sessions:  guest sessions keyed by sha256(token), 7-day TTL.
 *
 * Database location: ~/.shooter/shooter.db (same file as terminal-store).
 */

import type { ShareMode, TerminalShareRecord } from '$lib/types';

import Database from 'better-sqlite3';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DB_DIR = path.join(process.env.HOME || '', '.shooter');
const DB_PATH = path.join(DB_DIR, 'shooter.db');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Password hashing (scrypt, per-share random salt) ─────────────────

export class ShareStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
			CREATE TABLE IF NOT EXISTS terminal_shares (
				terminal_id   TEXT PRIMARY KEY,
				password_hash TEXT NOT NULL,
				mode          TEXT NOT NULL,
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS share_sessions (
				token_hash  TEXT PRIMARY KEY,
				terminal_id TEXT NOT NULL,
				created_at  INTEGER NOT NULL,
				expires_at  INTEGER NOT NULL
			)
		`);

    this.cleanup();
  }

  /** Purge expired sessions and shares whose terminal no longer exists. */
  cleanup(): void {
    this.db.prepare('DELETE FROM share_sessions WHERE expires_at < ?').run(Date.now());
    try {
      this.db
        .prepare('DELETE FROM terminal_shares WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
      this.db
        .prepare('DELETE FROM share_sessions WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
    } catch {
      // terminals table may not exist yet on a fresh database — skip orphan cleanup.
    }
  }

  /** Issue a new guest session for a shared terminal. Returns the raw token (stored hashed). */
  createSession(terminalId: string): { expiresAt: number; token: string } {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .prepare(
        'INSERT INTO share_sessions (token_hash, terminal_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(hashToken(token), terminalId, now, expiresAt);
    return { expiresAt, token };
  }

  /** Delete all guest sessions for a terminal (password change / revoke). */
  deleteSessions(terminalId: string): void {
    this.db.prepare('DELETE FROM share_sessions WHERE terminal_id = ?').run(terminalId);
  }

  /** Revoke a share: delete the share row and every guest session for it. */
  deleteShare(terminalId: string): void {
    this.db.prepare('DELETE FROM terminal_shares WHERE terminal_id = ?').run(terminalId);
    this.deleteSessions(terminalId);
  }

  getShare(terminalId: string): null | TerminalShareRecord {
    const row = this.db
      .prepare('SELECT * FROM terminal_shares WHERE terminal_id = ?')
      .get(terminalId) as Record<string, unknown> | undefined;
    return row ? rowToShare(row) : null;
  }

  /**
   * Resolve a guest bearer token to its terminal + mode.
   * Returns null if unknown, expired, or the share was revoked.
   */
  resolveToken(token: string): null | { mode: ShareMode; terminalId: string } {
    if (!token) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT s.terminal_id, s.expires_at, sh.mode
				 FROM share_sessions s
				 JOIN terminal_shares sh ON sh.terminal_id = s.terminal_id
				 WHERE s.token_hash = ?`
      )
      .get(hashToken(token)) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if ((row.expires_at as number) < Date.now()) {
      this.db.prepare('DELETE FROM share_sessions WHERE token_hash = ?').run(hashToken(token));
      return null;
    }
    return { mode: row.mode as ShareMode, terminalId: row.terminal_id as string };
  }

  /** Create or replace the share for a terminal. */
  setShare(record: TerminalShareRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO terminal_shares
				 (terminal_id, password_hash, mode, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.terminalId, record.passwordHash, record.mode, record.createdAt, record.updatedAt);
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, parts[1], 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

// ── Row mapping ──────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function rowToShare(row: Record<string, unknown>): TerminalShareRecord {
  return {
    createdAt: row.created_at as number,
    mode: row.mode as ShareMode,
    passwordHash: row.password_hash as string,
    terminalId: row.terminal_id as string,
    updatedAt: row.updated_at as number,
  };
}

// ── Singleton (globalThis bridges tsx server.ts + SvelteKit handler) ─

const SS_GLOBAL_KEY = '__shooter_share_store';
export const shareStore: ShareStore =
  ((globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] as ShareStore) || new ShareStore();
(globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] = shareStore;
