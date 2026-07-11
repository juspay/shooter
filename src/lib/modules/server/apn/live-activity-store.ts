/**
 * Live Activity push-token store — maps a session to its current ActivityKit
 * push token so the server can push updates by sessionId.
 *
 * ActivityKit rotates the push token over an activity's life, so registration is
 * an idempotent upsert keyed by sessionId (latest token wins). Small table in the
 * shared `~/.shooter/shooter.db`; same better-sqlite3 + globalThis-singleton idiom
 * as the other stores. Tokens are dropped on end() or a 410 from APNs.
 */

import type { LiveActivityRecord } from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

import { shooterDataDir } from '../utils/shooter-home.js';

export class LiveActivityStore {
  private db: Database.Database;

  constructor(dataDir: string = shooterDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'shooter.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS live_activities (
        session_id          TEXT PRIMARY KEY,
        activity_push_token TEXT NOT NULL,
        registered_at       TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  getBySession(sessionId: string): LiveActivityRecord | null {
    const row = this.db
      .prepare('SELECT * FROM live_activities WHERE session_id = ?')
      .get(sessionId) as Record<string, unknown> | undefined;
    return row
      ? {
          activityPushToken: row.activity_push_token as string,
          registeredAt: row.registered_at as string,
          sessionId: row.session_id as string,
        }
      : null;
  }

  remove(sessionId: string): number {
    return this.db.prepare('DELETE FROM live_activities WHERE session_id = ?').run(sessionId)
      .changes;
  }

  /** Drop any row holding a dead token (after a 410 from APNs). */
  removeByToken(token: string): number {
    return this.db.prepare('DELETE FROM live_activities WHERE activity_push_token = ?').run(token)
      .changes;
  }

  upsert(sessionId: string, activityPushToken: string, now: Date = new Date()): LiveActivityRecord {
    const id = sessionId.trim();
    const token = activityPushToken.trim();
    if (id.length === 0 || token.length === 0) {
      throw new Error('LiveActivityStore.upsert: sessionId and token must be non-empty');
    }
    this.db
      .prepare(
        `INSERT INTO live_activities (session_id, activity_push_token, registered_at)
         VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           activity_push_token = excluded.activity_push_token,
           registered_at       = excluded.registered_at`
      )
      .run(id, token, now.toISOString());
    return { activityPushToken: token, registeredAt: now.toISOString(), sessionId: id };
  }
}

const LAS_GLOBAL_KEY = '__shooter_live_activity_store';
export const liveActivityStore: LiveActivityStore =
  ((globalThis as Record<string, unknown>)[LAS_GLOBAL_KEY] as LiveActivityStore) ||
  new LiveActivityStore();
(globalThis as Record<string, unknown>)[LAS_GLOBAL_KEY] = liveActivityStore;
