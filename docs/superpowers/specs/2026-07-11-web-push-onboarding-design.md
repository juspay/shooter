# Web Push + Onboarding — Design (Slice 5)

**Program:** "Make Shooter feel native" — Slice 5 of 6. Stacked on `feat/native-nav-shell`.

## Why

Native push (APNs/FCM) needs an app-store build. The PWA promise of Shooter is
"open it in Safari/Chrome, add to Home Screen, get pushed" with no store. This
slice adds real **Web Push** as a third delivery channel, plus the Settings UX
to enable it with a permission rehearsal and a self-test.

## Architecture

Web Push is structurally different from the APNs/FCM `device_tokens` table (flat
opaque token, `platform IN ('ios','android')`, no key columns). A subscription is
an endpoint URL + a p256dh/auth key pair, so it gets its **own** store and table —
`web_push_subscriptions` in the same `~/.shooter/shooter.db`. The existing native
registry is untouched.

### Server

- `webpush/vapid.ts` — resolves VAPID keys from env (`VAPID_PUBLIC_KEY/_PRIVATE_KEY/_SUBJECT`),
  else generates once and persists to `~/.shooter/vapid.json` (mode 0600). Stable
  keys across restarts — rotating the public key would invalidate every subscription.
- `webpush/web-push-store.ts` — SQLite store (same better-sqlite3 + WAL +
  globalThis-singleton idiom as device-token-store). Idempotent upsert keyed by
  endpoint, key rotation, lazy prune-by-endpoint on 404/410, 30-day cleanup.
- `webpush/web-push-service.ts` — `web-push` library transport. `isWebPushConfigured()`,
  `getWebPushPublicKey()`, `sendWebPushMulti(subs, payload)` returning a
  `WebPushFanOutResult` (success/failure counts + stale endpoints), mirroring FCM.
- `/api/web-push/vapid-public-key` GET (public — a client needs it to subscribe).
- `/api/web-push/subscribe` POST (upsert) / DELETE (unsubscribe by endpoint), auth-gated.
- `/api/notify` folds web push into the parallel fan-out: skipped on a single-token
  override send; stale endpoints pruned; delivered endpoints touched; the web
  success/failure counts merge into the aggregate delivery summary.
- `static/sw.js` — minimal service worker: `push` → `showNotification`,
  `notificationclick` → focus/navigate an existing window or open one.

### Client

- `client/push/web-push.ts` — `isWebPushSupported`, `getWebPushPermission`,
  `isWebPushSubscribed`, `enableWebPush` (rehearse permission → register SW →
  fetch VAPID key → subscribe → POST), `disableWebPush` (unsubscribe + DELETE).
  Every entry point guards on support and returns a typed `WebPushStatus`.
- Settings "Browser Notifications" grouped section: status dot + state label
  (enabled / not enabled / blocked), Enable / Turn off, and a "Send test push"
  that fires a real notify so the user sees it land.

### Types (`src/lib/types/webpush.ts`)

`WebPushSubscriptionInput` (+ `isWebPushSubscriptionInput` guard),
`WebPushSubscriptionRecord`, `WebPushFanOutResult`, `WebPushPayload`, `VapidKeys`,
`WebPushStatus`. Hand-written (nested shape + runtime guard), re-exported from the barrel.

## Verification

- Unit: `tests/web-push-store.test.cjs` — 9 tests (upsert/rotate/COALESCE/prune/
  reactivate/touch/delete/cleanup/validation).
- Integration (curl against dev server): VAPID key endpoint returns a key and
  persists `vapid.json`; subscribe stores an active row; notify runs the web
  fan-out and folds its result into the summary; DELETE removes the row.
- UI: Settings "Browser Notifications" section renders with correct support/permission
  state (screenshot, phone width).
- SW: `/sw.js` served (HTTP 200, text/javascript) with both handlers.
- Gates: `pnpm check` / `build` / full `test` / eslint `--max-warnings 0` green.

## Needs a real browser grant (NOT reproducible in automated Chrome)

The final step — an actual push arriving in a live browser — needs a genuine
Notification-permission grant and an FCM/Mozilla push-service roundtrip. Automated
Chrome keeps permission at "default" and blocks `pushManager.subscribe`, so live
delivery is confirmed on a real device the same way the iOS on-device pieces are.
Everything up to and including the SW registration + VAPID key fetch is verified here.
