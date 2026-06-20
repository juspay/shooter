/**
 * Device Token Store — SQLite registry for multi-device push notifications.
 *
 * Replaces the flat `~/.shooter/device-tokens.json` ({ ios?, android? }) with
 * a `device_tokens` table in the existing `~/.shooter/shooter.db`. Supports any
 * number of devices per platform, idempotent upsert with token rotation keyed
 * by a stable deviceId, lazy stale-token pruning, a 30-day inactive-row
 * cleanup, and migration from the legacy JSON file + a setup-wizard seed file.
 *
 * Same better-sqlite3 + WAL + globalThis-singleton pattern as terminal-store.ts.
 * Timestamps are injectable (`now`) for deterministic tests — the presence-store
 * idiom. Migration/cleanup are explicit methods (called from server.ts at
 * startup in a later PR), not constructor side effects, so importing the module
 * never touches the registry.
 *
 * Deferred to PR 3 (added where first used, inside APNs sendToMany): a
 * `getAppEnv(token)` accessor and `failure_count` accumulation. `pruneByTokens`
 * here only soft-deactivates; the failure-count threshold lives with PR 3.
 */

import type { AppEnv, DevicePlatform, DeviceRecord, DeviceUpsertInput } from '$lib/types';

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { shooterDataDir } from '../utils/shooter-home.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class DeviceTokenStore {
  private dataDir: string;
  private db: Database.Database;

  constructor(dataDir: string = shooterDataDir()) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });

    this.db = new Database(path.join(dataDir, 'shooter.db'));
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id            TEXT PRIMARY KEY,
        token         TEXT NOT NULL,
        platform      TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
        app_env       TEXT NOT NULL DEFAULT 'sandbox'
                                    CHECK(app_env IN ('sandbox', 'production')),
        device_id     TEXT,
        friendly_name TEXT,
        bundle_id     TEXT,
        registered_at TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        UNIQUE(token),
        UNIQUE(device_id, platform)
      );
      CREATE INDEX IF NOT EXISTS idx_device_tokens_active
        ON device_tokens(platform, is_active);
    `);
  }

  close(): void {
    this.db.close();
  }

  /** Soft-delete a device by id (sets is_active = 0; auditable until cleanup). */
  deleteById(id: string): number {
    return this.db.prepare('UPDATE device_tokens SET is_active = 0 WHERE id = ?').run(id).changes;
  }

  getByToken(token: string): DeviceRecord | null {
    const row = this.db.prepare('SELECT * FROM device_tokens WHERE token = ?').get(token) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  /** All active tokens for a platform, most-recently-seen first. */
  listActive(platform: DevicePlatform): DeviceRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM device_tokens WHERE platform = ? AND is_active = 1 ORDER BY last_seen_at DESC'
      )
      .all(platform) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  /** Active tokens for a platform filtered by APNs gateway env. */
  listActiveForEnv(platform: DevicePlatform, appEnv: AppEnv): DeviceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM device_tokens
         WHERE platform = ? AND app_env = ? AND is_active = 1
         ORDER BY last_seen_at DESC`
      )
      .all(platform, appEnv) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  /**
   * Import tokens from the legacy device-tokens.json and the setup-wizard
   * device-token-seeds.json, then rename the consumed files. Idempotent: the
   * rename prevents re-import, and INSERT OR IGNORE prevents UNIQUE(token) dups.
   */
  migrate(now: Date = new Date()): void {
    this.importFile(path.join(this.dataDir, 'device-tokens.json'), '.migrated', now);
    this.importFile(path.join(this.dataDir, 'device-token-seeds.json'), '.processed', now);
  }

  /** Soft-delete a set of dead tokens (lazy pruning after a failed delivery). */
  pruneByTokens(tokens: readonly string[]): number {
    if (tokens.length === 0) {
      return 0;
    }
    const placeholders = tokens.map(() => '?').join(', ');
    return this.db
      .prepare(`UPDATE device_tokens SET is_active = 0 WHERE token IN (${placeholders})`)
      .run(...tokens).changes;
  }

  /**
   * Hard-delete inactive rows whose last_seen_at is older than 30 days.
   * Active rows are NEVER deleted by age — a device that is still on but
   * hasn't re-registered should keep receiving notifications.
   */
  startupCleanup(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
    return this.db
      .prepare('DELETE FROM device_tokens WHERE is_active = 0 AND last_seen_at < ?')
      .run(cutoff).changes;
  }

  /** Bump last_seen_at for tokens that just delivered successfully. */
  touchLastSeen(tokens: readonly string[], now: Date = new Date()): number {
    if (tokens.length === 0) {
      return 0;
    }
    const placeholders = tokens.map(() => '?').join(', ');
    return this.db
      .prepare(`UPDATE device_tokens SET last_seen_at = ? WHERE token IN (${placeholders})`)
      .run(now.toISOString(), ...tokens).changes;
  }

  /**
   * Register or refresh a device. Three cases, resolved in one transaction:
   *  1. Known device (deviceId matches an existing row) → rotate token in place.
   *     If the incoming token is currently held by a DIFFERENT row, APNs has
   *     recycled it to us, so that stale row is hard-deleted first — otherwise
   *     the rotation UPDATE would violate UNIQUE(token). (A soft-delete would
   *     NOT free the constraint: the token value stays in the inactive row.)
   *  2. New legacy device (no deviceId) → deactivate prior null-device rows for
   *     the platform (can't tell them apart) then insert/refresh by token.
   *  3. New device (deviceId not yet known) → insert; on token conflict, refresh
   *     but guard the deviceId against identity theft via the CASE clause: an
   *     unknown device cannot steal a token already owned by another device.
   */
  upsert(input: DeviceUpsertInput, now: Date = new Date()): DeviceRecord {
    const ts = now.toISOString();
    // Old apps omit appEnv → default to the server's configured APNs gateway
    // (matches importTokenMap and the spec), NOT a hardcoded 'sandbox' — else a
    // production server would file old-app tokens under 'sandbox' and the
    // listActiveForEnv('ios','production') fan-out would silently skip them.
    const appEnv: AppEnv =
      input.appEnv ?? (process.env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox');
    const deviceId = input.deviceId ?? null;
    const friendlyName = input.friendlyName ?? null;
    const bundleId = input.bundleId ?? null;
    const { platform, token } = input;

    this.db.transaction(() => {
      if (deviceId !== null) {
        const ownRow = this.db
          .prepare('SELECT id FROM device_tokens WHERE device_id = ? AND platform = ?')
          .get(deviceId, platform) as undefined | { id: string };
        if (ownRow) {
          // Retire any other row holding the (possibly recycled) incoming token
          // before the rotation UPDATE touches UNIQUE(token). Tokens are globally
          // unique, so at most one other row can hold it; if APNs gave it to us,
          // its previous owner is dead.
          this.db
            .prepare('DELETE FROM device_tokens WHERE token = ? AND id != ?')
            .run(token, ownRow.id);
          this.db
            .prepare(
              `UPDATE device_tokens SET
                 token         = ?,
                 last_seen_at  = ?,
                 app_env       = ?,
                 failure_count = 0,
                 is_active     = 1,
                 friendly_name = COALESCE(?, friendly_name),
                 bundle_id     = COALESCE(?, bundle_id)
               WHERE id = ?`
            )
            .run(token, ts, appEnv, friendlyName, bundleId, ownRow.id);
          return;
        }
        // No row for this device yet → fall through to the token-keyed INSERT,
        // whose CASE guard preserves an existing token owner (identity theft).
      } else {
        // Legacy device: collapse indistinguishable null-device rows so an old
        // app's token rotation doesn't leave a dead row drawing duplicate pushes.
        this.db
          .prepare(
            `UPDATE device_tokens SET is_active = 0
             WHERE platform = ? AND device_id IS NULL AND token != ? AND is_active = 1`
          )
          .run(platform, token);
      }

      this.db
        .prepare(
          `INSERT INTO device_tokens
             (id, token, platform, app_env, device_id, friendly_name, bundle_id,
              registered_at, last_seen_at, failure_count, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
           ON CONFLICT(token) DO UPDATE SET
             last_seen_at  = excluded.last_seen_at,
             app_env       = excluded.app_env,
             failure_count = 0,
             is_active     = 1,
             friendly_name = COALESCE(excluded.friendly_name, device_tokens.friendly_name),
             bundle_id     = COALESCE(excluded.bundle_id, device_tokens.bundle_id),
             device_id     = CASE
               WHEN device_tokens.device_id IS NULL
                 OR device_tokens.device_id = excluded.device_id
                 OR device_tokens.is_active = 0
               THEN excluded.device_id
               ELSE device_tokens.device_id
             END`
        )
        .run(randomUUID(), token, platform, appEnv, deviceId, friendlyName, bundleId, ts, ts);
    })();

    const rec = this.getByToken(token);
    if (!rec) {
      throw new Error('DeviceTokenStore.upsert: row not found after write');
    }
    return rec;
  }

  private importFile(filePath: string, renameSuffix: string, now: Date): void {
    if (!fs.existsSync(filePath)) {
      return;
    }
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.importTokenMap(raw, now);
      fs.renameSync(filePath, filePath + renameSuffix);
    } catch (err) {
      // Corrupt/unreadable file: skip without crashing startup or losing data
      // (left in place, harmlessly retried next startup).
      console.warn(`[device-token-store] failed to import ${filePath}:`, err);
    }
  }

  private importTokenMap(raw: unknown, now: Date): void {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return;
    }
    const obj = raw as Record<string, unknown>;
    const ts = now.toISOString();
    const appEnv: AppEnv = process.env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO device_tokens
         (id, token, platform, app_env, device_id, friendly_name, bundle_id,
          registered_at, last_seen_at, failure_count, is_active)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 0, 1)`
    );
    for (const platform of ['ios', 'android'] as const) {
      const value = obj[platform];
      const tokens = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
      for (const tok of tokens) {
        if (typeof tok === 'string' && tok.length > 0) {
          insert.run(randomUUID(), tok, platform, appEnv, ts, ts);
        }
      }
    }
  }
}

function rowToRecord(row: Record<string, unknown>): DeviceRecord {
  return {
    appEnv: row.app_env as AppEnv,
    bundleId: (row.bundle_id as string) ?? null,
    deviceId: (row.device_id as string) ?? null,
    failureCount: row.failure_count as number,
    friendlyName: (row.friendly_name as string) ?? null,
    id: row.id as string,
    isActive: row.is_active === 1,
    lastSeenAt: row.last_seen_at as string,
    platform: row.platform as DevicePlatform,
    registeredAt: row.registered_at as string,
    token: row.token as string,
  };
}

// ── Singleton ────────────────────────────────────────────────────────
// globalThis-keyed so a single instance is shared across module loaders
// (same pattern as terminal-store / pty-manager). Schema-only side effect at
// import; migrate()/startupCleanup() are invoked explicitly at server startup.

const DTS_GLOBAL_KEY = '__shooter_device_token_store';
export const deviceTokenStore: DeviceTokenStore =
  ((globalThis as Record<string, unknown>)[DTS_GLOBAL_KEY] as DeviceTokenStore) ||
  new DeviceTokenStore();
(globalThis as Record<string, unknown>)[DTS_GLOBAL_KEY] = deviceTokenStore;
