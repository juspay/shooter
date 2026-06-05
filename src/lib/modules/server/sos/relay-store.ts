/**
 * RelayStore — SQLite persistence for Session-Over-Sessions metadata.
 *
 * Persists super-sessions and their member rows to ~/.shooter/shooter.db so a
 * super-session survives a server restart (the coordinator re-subscribes each
 * member on boot). The merged transcript itself is an in-memory ring buffer and
 * is intentionally NOT persisted — it is rebuilt from each member's history on
 * reconnect. Uses its own WAL connection to the shared db, exactly like
 * terminal-store.
 *
 * The Phase 2/3 tables (sos_relay_log, relay_decisions, sos_memory) from the
 * design are not created here yet — this is the Phase 1 MVP.
 */

import type { SosMember, SuperSession } from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DB_DIR = path.join(os.homedir(), '.shooter');
const DB_PATH = path.join(DB_DIR, 'shooter.db');

class RelayStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS super_sessions (
        id            TEXT PRIMARY KEY,
        label         TEXT NOT NULL,
        routing_rules TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sos_sessions (
        id                TEXT PRIMARY KEY,
        super_session_id  TEXT NOT NULL,
        session_key       TEXT NOT NULL,
        terminal_id       TEXT,
        provider          TEXT NOT NULL,
        capability        TEXT NOT NULL DEFAULT '',
        status            TEXT NOT NULL DEFAULT 'Idle',
        registered_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sos_sessions_super ON sos_sessions(super_session_id);
    `);
  }

  addMember(superSessionId: string, member: SosMember): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sos_sessions
         (id, super_session_id, session_key, terminal_id, provider, capability, status, registered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        member.id,
        superSessionId,
        member.sessionKey,
        member.terminalId,
        member.provider,
        member.capability,
        member.status,
        member.registeredAt
      );
  }

  createSuperSession(session: SuperSession): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO super_sessions (id, label, routing_rules, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.label,
        JSON.stringify(session.routingRules),
        session.status,
        session.createdAt
      );
  }

  deleteSuperSession(id: string): void {
    // Atomic: both dependent deletes succeed or neither does, so an interruption
    // cannot leave orphaned member rows behind their parent super-session.
    const tx = this.db.transaction((sid: string) => {
      this.db.prepare('DELETE FROM sos_sessions WHERE super_session_id = ?').run(sid);
      this.db.prepare('DELETE FROM super_sessions WHERE id = ?').run(sid);
    });
    tx(id);
  }

  /** Rebuild every persisted super-session (members included, transcript empty). */
  loadAll(): SuperSession[] {
    const rows = this.db.prepare('SELECT * FROM super_sessions').all() as Record<string, unknown>[];
    return rows.map((row) => {
      const id = row.id as string;
      const memberRows = this.db
        .prepare('SELECT * FROM sos_sessions WHERE super_session_id = ? ORDER BY registered_at')
        .all(id) as Record<string, unknown>[];
      return {
        createdAt: row.created_at as string,
        id,
        label: row.label as string,
        members: memberRows.map(rowToMember),
        routingRules: safeParseRules(row.routing_rules),
        status: row.status as SuperSession['status'],
        transcript: [],
      };
    });
  }

  removeMember(memberId: string): void {
    this.db.prepare('DELETE FROM sos_sessions WHERE id = ?').run(memberId);
  }

  updateMemberStatus(memberId: string, status: SosMember['status']): void {
    this.db.prepare('UPDATE sos_sessions SET status = ? WHERE id = ?').run(status, memberId);
  }

  updateSuperSessionStatus(id: string, status: SuperSession['status']): void {
    this.db.prepare('UPDATE super_sessions SET status = ? WHERE id = ?').run(status, id);
  }
}

function rowToMember(row: Record<string, unknown>): SosMember {
  return {
    capability: (row.capability as string) ?? '',
    id: row.id as string,
    provider: row.provider as SosMember['provider'],
    registeredAt: row.registered_at as string,
    sessionKey: row.session_key as string,
    status: row.status as SosMember['status'],
    terminalId: (row.terminal_id as string) ?? null,
  };
}

function safeParseRules(raw: unknown): SuperSession['routingRules'] {
  if (typeof raw !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SuperSession['routingRules']) : [];
  } catch {
    return [];
  }
}

// Single shared instance across module loaders.
const RS_GLOBAL_KEY = '__shooter_relay_store';
export const relayStore: RelayStore =
  ((globalThis as Record<string, unknown>)[RS_GLOBAL_KEY] as RelayStore) || new RelayStore();
(globalThis as Record<string, unknown>)[RS_GLOBAL_KEY] = relayStore;
