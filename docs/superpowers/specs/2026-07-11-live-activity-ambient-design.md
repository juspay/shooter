# Ambient Status / Live Activity — Design (Slice 6)

**Program:** "Make Shooter feel native" — Slice 6 of 6.

## Split: verifiable server foundation now, Xcode-gated iOS extension provided as reference

Slice 6's on-screen payoff (Lock Screen Live Activity + Dynamic Island) needs an
iOS **widget-extension target**, which can only be created in Xcode — adding an
app-extension target rewrites dozens of interlinked `pbxproj` UUIDs (target,
build phases, embed step, Info.plist, entitlements) and hand-editing that blind
would likely corrupt the project. So this slice ships:

1. **The full server-side push foundation** — real, tested, buildable.
2. **The complete iOS ActivityKit reference** under `ios/Shooter/LiveActivityReference/`
   plus a step-by-step Xcode integration guide, so the extension is a
   drag-and-drop + wire-up rather than net-new code.

## Server (built + tested)

- **APNs transport:** `LibraryAPNsService.sendLiveActivity(token, input, nowSec?)`.
  `deliverPreSerialized` gained a `liveactivity` push type and a topic override so
  the same curl/HTTP-2 path targets `<bundleId>.push-type.liveactivity` with
  `apns-push-type: liveactivity`. The existing alert/background paths are unchanged
  (options-object refactor kept param count within lint limits).
- **Pure builder** (`apns-liveactivity.ts`): `buildLiveActivityBody` (timestamp,
  event, content-state; dismissal-date only on `end`; optional stale-date /
  relevance-score / alert) + `liveActivityTopic`. `nowSec` injected → 12 unit tests.
- **Token store** (`live-activity-store.ts`): session → rotating activity push
  token; idempotent upsert, remove by session, remove by token (410 cleanup). 6 tests.
- **Endpoints:** `POST/DELETE /api/live-activity/register` (app registers its
  token); `POST /api/live-activity` pushes a `start`/`update`/`end` — targets an
  explicit token or a registered `sessionId`, and forgets the token on `end`/410.
- **Types** (`src/lib/types/live-activity.ts`): `LiveActivityContentState` is the
  contract the Swift `ContentState` must mirror.

## iOS reference (`ios/Shooter/LiveActivityReference/`)

`ShooterActivityAttributes.swift` (shared), `ShooterLiveActivity.swift` (Lock
Screen + Dynamic Island, Amber Phosphor), `ShooterWidgetBundle.swift`,
`LiveActivityManager.swift` (start/end + streams the push token to
`/api/live-activity/register`), and `README.md` with the exact Xcode steps.
SourceKit flags these outside a target (ActivityKit/WidgetKit are iOS-only) — expected.

## Verification

- Unit: 12 (builder) + 6 (store) tests.
- Integration (curl): register → `success`, store persists the token, update-by-
  `sessionId` resolves the token and reaches the real APNs curl; missing
  token/session → 400.
- Gates: `pnpm check` / `build` / full `test` / eslint `--max-warnings 0` green.

## On-device / Xcode caveat

The Live Activity UI, Dynamic Island, and push-driven updates are the on-device
acceptance step (create the widget target in Xcode per the README, build for a
device, iOS 16.2+). The server push path + token lifecycle are unit- and
curl-verified here.
