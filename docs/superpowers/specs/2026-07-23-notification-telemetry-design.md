# Notification telemetry — design

- **Date:** 2026-07-23
- **Status:** Implemented (2026-07-23). All 5 surfaces built + verified (unit suite, tsc, lint, build, live e2e).
- **Branch:** `feat/notification-telemetry`
- **Base:** `release` @ v1.32.0 (notification coalescing already shipped)

## Problem

Even after coalescing, ~5+ notifications still arrive, and we **can't account for
what we've sent** — `notification-history.ts` is an in-memory ring buffer
(`MAX_HISTORY = 100`, wiped on restart, no DB table). Live evidence (last 50
in-memory records on v1.32.0): sent 40 (`permission` 20, `question` 10,
`status_rollup` 10), filtered 10 (`idle_input` coalesced). Coalescing works; the
remaining volume is **decision-tier** — each active project fires \*\*1 `question`

- ~2 `permission`\*\* pushes per interaction, and with several projects running at
  once that is the "5+". We need durable telemetry to see this precisely and decide
  what to tame next.

## Goals

1. **Record every notification event** durably (survives restart) at each
   disposition: `sent` / `coalesced` / `dropped` / `filtered` / `skipped` /
   `failed`, with category, tier, project, session, reason, per-channel delivery
   outcome, device count, requestId, timestamp.
2. **Analyze** it: aggregations (by tier / category / project / disposition /
   time) + **burst detection** (N to the same project within X seconds) + delivery
   health (200 / 400 / 413 / transport-0 rates).
3. **Read it two ways**: a `shooter notifications` CLI report and an in-app
   `/notifications` page (phone-first).

## Non-goals

- No change to _what_ is sent (that's a follow-up informed by this telemetry).
- No external analytics/telemetry service — local SQLite only.

## Architecture

### 1. Persistent store — `src/lib/modules/server/apn/notification-store.ts`

SQLite (`~/.shooter/shooter.db`, better-sqlite3, WAL, globalThis singleton) —
mirrors `device-token-store.ts` exactly.

```
CREATE TABLE notification_events (
  id            TEXT PRIMARY KEY,   -- requestId (or generated)
  ts            INTEGER NOT NULL,   -- ms epoch
  category      TEXT,               -- permission / question / idle_input / …
  tier          TEXT NOT NULL,      -- decision / status / drop / unknown
  project       TEXT,
  session_id    TEXT,
  disposition   TEXT NOT NULL,      -- sent/coalesced/dropped/filtered/skipped/failed
  reason        TEXT,
  device_count  INTEGER NOT NULL DEFAULT 0,
  sent          INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  detail        TEXT,               -- JSON: {apns:{"200":1,"413":1}, fcm:…, web:…}
  title         TEXT
);
CREATE INDEX idx_notif_events_ts ON notification_events(ts);
```

Methods (all timestamps injectable for tests):

- `record(evt: NotificationEventInput): void`
- `recent(limit = 100): NotificationEventRow[]`
- `stats(sinceMs: number): NotificationStats` — pure aggregation over rows since.
- `bursts(sinceMs, windowMs, threshold): NotificationBurst[]` — group by project,
  slide a window, flag ≥ threshold sends.
- `startupCleanup(now): number` — delete rows older than 30 days.

### 2. Recording — one helper, replace existing calls

Add `recordDisposition(id, title, message, disposition, data, reason?, delivery?)`
in the notify route that does BOTH the existing in-memory `addNotification(
buildNotificationRecord(...))` AND `notificationStore.record(...)` (deriving
`tier` via `classifyNotificationTier(category)`). Replace each of the 6 existing
`addNotification(buildNotificationRecord(...))` sites with it — no net line growth
in the 300-line-capped POST handler. The two send sites pass `delivery`
(`{apns, fcm, web, deviceCount}`) built from the fan-out results.

Wire `notificationStore.startupCleanup()` in `server.ts` alongside the others.

### 3. Stats API — `GET /api/notify/stats?since=24h`

Auth via `validateAuth`. Returns `NotificationStats`:
`{ window, total, byDisposition, byTier, byCategory, byProject, delivery: {sent,
failed, byStatus}, bursts }`. `since` accepts `24h` / `7d` / ms.

### 4. CLI — `shooter notifications [--since 24h]`

New `case 'notifications'` in `bin/shooter.cjs`. Reads `API_KEY` from
`~/.shooter/.env`, GETs `/api/notify/stats`, prints a formatted terminal report
(by tier / project / disposition, bursts ⚠, delivery health). Fails gracefully if
the server is down.

### 5. In-app page — `/notifications`

`src/routes/notifications/+page.svelte`, mirrors `/sos`: `<NavBar>` +
config-guard (`localStorage.shooter_config` → apiKey) + `fetch('/api/notify/stats')`

- `PullToRefresh`. Renders the same breakdown with counts, burst warnings, and
  delivery health. Reachable via a link on the Settings (`/config`) page.

## Types (in `src/lib/types/apn.ts`)

`NotificationEventInput`, `NotificationEventRow`, `NotificationStats`,
`NotificationBurst`, `NotificationDisposition`.

## Testing

- **Unit** (`tests/notification-store.test.cjs`, isolated `SHOOTER_HOME` temp db):
  record → recent; stats aggregation (by tier/category/project/disposition);
  burst detection (3 sends to one project in a window → 1 burst; spread out → 0);
  30-day cleanup.
- **Live e2e**: fire the same mix as the coalescing e2e against an isolated temp
  server, then `GET /api/notify/stats` and assert the counts match + a burst is
  detected; run the CLI against it.

## Retention & safety

30-day retention (startup cleanup). Isolated `SHOOTER_HOME` for all tests — never
the real registry. No PII beyond what's already in notifications (titles/projects).
