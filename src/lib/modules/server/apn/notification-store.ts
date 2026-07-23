// Persistent telemetry for every notification event — durable so we can account
// for exactly what was sent, coalesced, dropped, filtered, skipped, or failed.
// The in-memory notification-history.ts ring buffer is capped (100) and wiped on
// restart; this SQLite table is the source of truth for "what did we send?".
//
// Same better-sqlite3 + WAL + globalThis-singleton pattern as device-token-store.

import type {
  NotificationBurst,
  NotificationEventInput,
  NotificationEventRow,
  NotificationStats,
} from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

import { shooterDataDir } from '../utils/shooter-home.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STR = 512; // defensive cap on stored strings
/** Burst detection: N sends to one project within this window is a burst. */
export const BURST_WINDOW_MS = 30_000;
export const BURST_THRESHOLD = 3;

export class NotificationStore {
  private db: Database.Database;

  constructor(dataDir: string = shooterDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'shooter.db'));
    this.db.pragma('journal_mode = WAL');
    // Implicit rowid PK (no explicit id): a requestId can recur across events, so
    // it is a plain column, not a key.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id            TEXT,
        ts            INTEGER NOT NULL,
        category      TEXT,
        tier          TEXT NOT NULL,
        project       TEXT,
        session_id    TEXT,
        disposition   TEXT NOT NULL,
        reason        TEXT,
        device_count  INTEGER NOT NULL DEFAULT 0,
        sent          INTEGER NOT NULL DEFAULT 0,
        failed        INTEGER NOT NULL DEFAULT 0,
        detail        TEXT,
        title         TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notif_events_ts ON notification_events(ts);
    `);
  }

  close(): void {
    this.db.close();
  }

  /** Most-recent events, newest first. */
  recent(limit = 100): NotificationEventRow[] {
    const rows = this.db
      .prepare('SELECT * FROM notification_events ORDER BY ts DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToEvent);
  }

  /** Persist one notification event. */
  record(evt: NotificationEventInput, now: Date = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO notification_events
           (id, ts, category, tier, project, session_id, disposition, reason,
            device_count, sent, failed, detail, title)
         VALUES
           (@id, @ts, @category, @tier, @project, @sessionId, @disposition, @reason,
            @deviceCount, @sent, @failed, @detail, @title)`
      )
      .run({
        category: clip(evt.category),
        detail: clip(evt.detail),
        deviceCount: evt.deviceCount ?? 0,
        disposition: evt.disposition,
        failed: evt.failed ?? 0,
        id: clip(evt.id),
        project: clip(evt.project),
        reason: clip(evt.reason),
        sent: evt.sent ?? 0,
        sessionId: clip(evt.sessionId),
        tier: evt.tier,
        title: clip(evt.title),
        ts: evt.ts ?? now.getTime(),
      });
  }

  /** Delete events older than 30 days. Returns rows removed. */
  startupCleanup(now: Date = new Date()): number {
    return this.db
      .prepare('DELETE FROM notification_events WHERE ts < ?')
      .run(now.getTime() - THIRTY_DAYS_MS).changes;
  }

  /** Aggregate telemetry over the window [sinceMs, now]. */
  stats(sinceMs: number, now: number = Date.now()): NotificationStats {
    const rows = (
      this.db
        .prepare('SELECT * FROM notification_events WHERE ts >= ? ORDER BY ts DESC')
        .all(sinceMs) as Record<string, unknown>[]
    ).map(rowToEvent);
    const bursts = detectBursts(rows, BURST_WINDOW_MS, BURST_THRESHOLD);
    return computeStats(rows, now - sinceMs, bursts);
  }
}

/** Pure aggregation of event rows into stats. */
export function computeStats(
  rows: readonly NotificationEventRow[],
  windowMs: number,
  bursts: NotificationBurst[]
): NotificationStats {
  const byCategory: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let sent = 0;
  let failed = 0;

  for (const r of rows) {
    bump(byDisposition, r.disposition);
    bump(byTier, r.tier);
    bump(byCategory, r.category ?? 'unknown');
    bump(byProject, r.project ?? 'unknown');
    sent += r.sent;
    failed += r.failed;
    if (r.detail) {
      const apns = parseApnsHistogram(r.detail);
      for (const [code, n] of Object.entries(apns)) {
        byStatus[code] = (byStatus[code] ?? 0) + n;
      }
    }
  }

  return {
    bursts,
    byCategory,
    byDisposition,
    byProject,
    byTier,
    delivery: { byStatus, failed, sent },
    total: rows.length,
    windowMs,
  };
}

/**
 * Pure: flag projects that received >= threshold actual PUSH ATTEMPTS within
 * windowMs. An attempt is a `sent` or `failed` disposition — both left the server
 * toward a device; coalesced/dropped/filtered/skipped never did, so they don't
 * count toward "how many are we sending".
 */
export function detectBursts(
  rows: readonly NotificationEventRow[],
  windowMs: number,
  threshold: number
): NotificationBurst[] {
  const byProject = new Map<string, number[]>();
  for (const r of rows) {
    if (r.disposition !== 'sent' && r.disposition !== 'failed') {
      continue;
    }
    const key = r.project ?? 'unknown';
    const list = byProject.get(key) ?? [];
    list.push(r.ts);
    byProject.set(key, list);
  }

  const bursts: NotificationBurst[] = [];
  for (const [project, tsList] of byProject) {
    const sorted = [...tsList].sort((a, b) => a - b);
    let max = 0;
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      while (sorted[end] - sorted[start] > windowMs) {
        start++;
      }
      max = Math.max(max, end - start + 1);
    }
    if (max >= threshold) {
      bursts.push({ count: max, project, windowSec: Math.round(windowMs / 1000) });
    }
  }
  return bursts.sort((a, b) => b.count - a.count);
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function clip(value: null | string | undefined): null | string {
  return typeof value === 'string' ? value.slice(0, MAX_STR) : null;
}

/** Extract an `{ apns: {code: n} }` histogram from a stored detail JSON string. */
function parseApnsHistogram(detail: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === 'object' && 'apns' in parsed) {
      const apns = (parsed as { apns: unknown }).apns;
      if (apns && typeof apns === 'object') {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(apns as Record<string, unknown>)) {
          if (typeof v === 'number') {
            out[k] = v;
          }
        }
        return out;
      }
    }
  } catch {
    // malformed detail — ignore
  }
  return {};
}

function rowToEvent(row: Record<string, unknown>): NotificationEventRow {
  const str = (v: unknown): null | string => (typeof v === 'string' ? v : null);
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  return {
    category: str(row.category),
    detail: str(row.detail),
    deviceCount: num(row.device_count),
    disposition: str(row.disposition) ?? '',
    failed: num(row.failed),
    id: str(row.id) ?? '',
    project: str(row.project),
    reason: str(row.reason),
    sent: num(row.sent),
    sessionId: str(row.session_id),
    tier: str(row.tier) ?? '',
    title: str(row.title),
    ts: num(row.ts),
  };
}

// ── Singleton ────────────────────────────────────────────────────────
const NS_GLOBAL_KEY = '__shooter_notification_store';
export const notificationStore: NotificationStore =
  ((globalThis as Record<string, unknown>)[NS_GLOBAL_KEY] as NotificationStore) ||
  new NotificationStore();
(globalThis as Record<string, unknown>)[NS_GLOBAL_KEY] = notificationStore;
