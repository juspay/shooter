/**
 * Web Push Subscription Store — SQLite registry for browser / PWA push.
 *
 * A separate table from device_tokens (which is APNs/FCM-only: flat opaque
 * tokens, platform CHECK IN ('ios','android'), no key columns). A web-push
 * subscription is structurally different — an endpoint URL plus a p256dh/auth
 * key pair — so it gets its own `web_push_subscriptions` table in the same
 * `~/.shooter/shooter.db`.
 *
 * Same better-sqlite3 + WAL + globalThis-singleton pattern as
 * device-token-store.ts. Idempotent upsert keyed by endpoint (the browser
 * rotates the endpoint, not the keys, on refresh), lazy stale pruning after a
 * 404/410 from the push service, and a 30-day inactive-row cleanup.
 */

import type { WebPushSubscriptionInput, WebPushSubscriptionRecord } from '$lib/types';

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Relative import (not the `$lib` alias) so this module loads under tsx in
// server.ts at startup, where the SvelteKit alias is unresolvable.
import { shooterDataDir } from '../utils/shooter-home.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Defensive upper bounds — real endpoints are ~200 chars, keys are fixed-size
// base64url. These only reject pathological input that would bloat a row.
export const MAX_ENDPOINT_LENGTH = 2048;
export const MAX_KEY_LENGTH = 256;
export const MAX_DEVICE_ID_LENGTH = 256;
export const MAX_NAME_LENGTH = 256;

export class WebPushStore {
  private dataDir: string;
  private db: Database.Database;

  constructor(dataDir: string = shooterDataDir()) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });

    this.db = new Database(path.join(dataDir, 'shooter.db'));
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id            TEXT PRIMARY KEY,
        endpoint      TEXT NOT NULL UNIQUE,
        p256dh        TEXT NOT NULL,
        auth          TEXT NOT NULL,
        device_id     TEXT,
        friendly_name TEXT,
        registered_at TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_web_push_active
        ON web_push_subscriptions(is_active);
    `);
  }

  close(): void {
    this.db.close();
  }

  /** Remove a subscription by endpoint (explicit unsubscribe → hard delete). */
  deleteByEndpoint(endpoint: string): number {
    return this.db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint = ?').run(endpoint)
      .changes;
  }

  /** All active subscriptions, most-recently-seen first. */
  listActive(): WebPushSubscriptionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM web_push_subscriptions WHERE is_active = 1 ORDER BY last_seen_at DESC'
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  /** Soft-delete dead subscriptions (lazy pruning after a 404/410 from the push service). */
  pruneByEndpoints(endpoints: readonly string[]): number {
    if (endpoints.length === 0) {
      return 0;
    }
    const placeholders = endpoints.map(() => '?').join(', ');
    return this.db
      .prepare(
        `UPDATE web_push_subscriptions SET is_active = 0 WHERE endpoint IN (${placeholders})`
      )
      .run(...endpoints).changes;
  }

  /** Hard-delete inactive rows whose last_seen_at is older than 30 days. */
  startupCleanup(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
    return this.db
      .prepare('DELETE FROM web_push_subscriptions WHERE is_active = 0 AND last_seen_at < ?')
      .run(cutoff).changes;
  }

  /** Bump last_seen_at for subscriptions that just delivered successfully. */
  touchLastSeen(endpoints: readonly string[], now: Date = new Date()): number {
    if (endpoints.length === 0) {
      return 0;
    }
    const placeholders = endpoints.map(() => '?').join(', ');
    return this.db
      .prepare(
        `UPDATE web_push_subscriptions SET last_seen_at = ? WHERE endpoint IN (${placeholders})`
      )
      .run(now.toISOString(), ...endpoints).changes;
  }

  /** Register or refresh a subscription, keyed by endpoint (idempotent). */
  upsert(input: WebPushSubscriptionInput, now: Date = new Date()): WebPushSubscriptionRecord {
    const ts = now.toISOString();
    const endpoint = input.endpoint.trim();
    const p256dh = input.keys.p256dh.trim();
    const auth = input.keys.auth.trim();
    const deviceId = input.deviceId?.trim() || null;
    const friendlyName = input.friendlyName?.trim() || null;

    if (endpoint.length === 0 || p256dh.length === 0 || auth.length === 0) {
      throw new Error('WebPushStore.upsert: endpoint and keys must be non-empty');
    }
    if (endpoint.length > MAX_ENDPOINT_LENGTH) {
      throw new Error(`WebPushStore.upsert: endpoint exceeds ${MAX_ENDPOINT_LENGTH} chars`);
    }
    if (p256dh.length > MAX_KEY_LENGTH || auth.length > MAX_KEY_LENGTH) {
      throw new Error(`WebPushStore.upsert: key exceeds ${MAX_KEY_LENGTH} chars`);
    }
    if (deviceId !== null && deviceId.length > MAX_DEVICE_ID_LENGTH) {
      throw new Error(`WebPushStore.upsert: deviceId exceeds ${MAX_DEVICE_ID_LENGTH} chars`);
    }
    if (friendlyName !== null && friendlyName.length > MAX_NAME_LENGTH) {
      throw new Error(`WebPushStore.upsert: friendlyName exceeds ${MAX_NAME_LENGTH} chars`);
    }

    this.db
      .prepare(
        `INSERT INTO web_push_subscriptions
           (id, endpoint, p256dh, auth, device_id, friendly_name,
            registered_at, last_seen_at, failure_count, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
         ON CONFLICT(endpoint) DO UPDATE SET
           p256dh        = excluded.p256dh,
           auth          = excluded.auth,
           last_seen_at  = excluded.last_seen_at,
           failure_count = 0,
           is_active     = 1,
           device_id     = COALESCE(excluded.device_id, web_push_subscriptions.device_id),
           friendly_name = COALESCE(excluded.friendly_name, web_push_subscriptions.friendly_name)`
      )
      .run(randomUUID(), endpoint, p256dh, auth, deviceId, friendlyName, ts, ts);

    const rec = this.getByEndpoint(endpoint);
    if (!rec) {
      throw new Error('WebPushStore.upsert: row not found after write');
    }
    return rec;
  }

  private getByEndpoint(endpoint: string): null | WebPushSubscriptionRecord {
    const row = this.db
      .prepare('SELECT * FROM web_push_subscriptions WHERE endpoint = ?')
      .get(endpoint) as Record<string, unknown> | undefined;
    return row ? rowToRecord(row) : null;
  }
}

function rowToRecord(row: Record<string, unknown>): WebPushSubscriptionRecord {
  return {
    auth: row.auth as string,
    deviceId: (row.device_id as string) ?? null,
    endpoint: row.endpoint as string,
    failureCount: row.failure_count as number,
    friendlyName: (row.friendly_name as string) ?? null,
    id: row.id as string,
    isActive: row.is_active === 1,
    lastSeenAt: row.last_seen_at as string,
    p256dh: row.p256dh as string,
    registeredAt: row.registered_at as string,
  };
}

// ── Singleton ────────────────────────────────────────────────────────
const WPS_GLOBAL_KEY = '__shooter_web_push_store';
export const webPushStore: WebPushStore =
  ((globalThis as Record<string, unknown>)[WPS_GLOBAL_KEY] as WebPushStore) || new WebPushStore();
(globalThis as Record<string, unknown>)[WPS_GLOBAL_KEY] = webPushStore;
