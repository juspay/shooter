# Notification Telemetry Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Durably record every notification event and expose it via a stats API, a `shooter notifications` CLI report, and an in-app `/notifications` page.

**Base:** `feat/notification-telemetry` off `release` @ v1.32.0.

## Global Constraints

- TS strict, no `any`; named exports only; types in `src/lib/types/` (barrel), tests are `.cjs` under `tests/` appended to the `package.json` `test` script; `pnpm run check` + `pnpm run lint` clean before each commit; POST handler stays ≤ 300 lines. Single-commit PR (squash at the end). Run `pnpm exec svelte-kit sync` in a fresh worktree so eslint resolves `$lib/types`.

---

### Task 1: Types + persistent store

- Files: create `src/lib/modules/server/apn/notification-store.ts`; add types to `src/lib/types/apn.ts`; test `tests/notification-store.test.cjs` (append to `test` script).
- Types: `NotificationDisposition = 'coalesced'|'dropped'|'failed'|'filtered'|'sent'|'skipped'`; `NotificationEventInput`, `NotificationEventRow`, `NotificationBurst`, `NotificationStats`.
- Store: mirror `device-token-store.ts` (better-sqlite3, WAL, `shooterDataDir()`, globalThis singleton, schema per spec). Methods `record`, `recent`, `stats(sinceMs)`, `bursts(sinceMs, windowMs, threshold)`, `startupCleanup(now)`; timestamps injectable.
- TDD: write `tests/notification-store.test.cjs` (isolated temp `SHOOTER_HOME`): record→recent; stats by tier/category/project/disposition; bursts (3-in-window → 1 burst; spread → 0); cleanup drops >30d. Run → fail → implement → pass.
- Commit: `feat(telemetry): persistent notification_events store`.

### Task 2: Record at every disposition

- Files: `src/routes/api/notify/+server.ts`, `server.ts`.
- Add `recordDisposition(id, title, message, disposition, data, reason?, delivery?)` that calls the existing `addNotification(buildNotificationRecord(...))` AND `notificationStore.record(...)` (tier via `classifyNotificationTier`). Replace the 6 existing `addNotification(buildNotificationRecord(...))` sites (filtered, skipped, dropped, coalesced, main-send, rollup-send). Send sites pass `delivery` built from apns/fcm/web results (per-channel sent/failed + apns status histogram from `apnsResult.results`).
- Wire `notificationStore.startupCleanup()` in `server.ts` near the other stores.
- Verify `pnpm run check` + handler ≤ 300 lines. Commit: `feat(telemetry): record every notification disposition`.

### Task 3: Stats API

- File: create `src/routes/api/notify/stats/+server.ts`; test `tests/notify-stats-route.test.cjs` (or fold into store test).
- `GET` with `validateAuth`; parse `since` (`24h`/`7d`/ms, default 24h); return `notificationStore.stats(sinceMs)` + `bursts`. Commit: `feat(telemetry): GET /api/notify/stats`.

### Task 4: CLI report

- File: `bin/shooter.cjs` (`case 'notifications'` + help text).
- Read `API_KEY` from `~/.shooter/.env`; GET `http://localhost:<port>/api/notify/stats?since=<arg>`; print formatted report (tiers, top projects, dispositions, bursts ⚠, delivery health). Graceful message if server down. Commit: `feat(telemetry): shooter notifications CLI report`.

### Task 5: In-app page

- File: create `src/routes/notifications/+page.svelte`; add a link on `/config`.
- Mirror `/sos`: `<NavBar>` + config-guard apiKey + `fetch('/api/notify/stats')` + `PullToRefresh`; render tier/project/disposition counts, burst warnings, delivery health. Commit: `feat(telemetry): /notifications in-app page`.

### Task 6: Verify

- `pnpm test` (full) + `pnpm run check` + `pnpm run lint` + `pnpm build`.
- Live e2e (isolated temp `SHOOTER_HOME`): fire mixed notifications, `GET /api/notify/stats` asserts counts + a burst; run the CLI against it. Update spec Status → Implemented.

## Self-review

Covers spec §1 (store, T1) §2 (recording, T2) §3 (API, T3) §4 (CLI, T4) §5 (page, T5) + verify (T6). Store is foundational; T4/T5 both consume T3. Risk: handler line limit (T2) — recording replaces existing calls, no net growth; and the apns status histogram (build compactly in the send sites or a tiny helper).
