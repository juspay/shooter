# Ambient Status / Live Activity — Design (Slice 6)

**Program:** "Make Shooter feel native" — Slice 6 of 6.

## Server foundation + a real, compile-verified iOS widget-extension target

Slice 6's on-screen payoff (Lock Screen Live Activity + Dynamic Island) needs an
iOS **widget-extension target**. Rather than hand-edit `pbxproj` (fragile), the
target was created programmatically with the `xcodeproj` gem and **verified with
`xcodebuild`** (`** BUILD SUCCEEDED **`, app + widget, iOS 26 SDK). So this slice ships:

1. **The full server-side push foundation** — real, tested, buildable.
2. **A working `ShooterWidget` app-extension target** — the ActivityKit code lives
   in `ios/Shooter/ShooterWidget/` (attributes shared with the app, Live Activity
   SwiftUI, widget bundle, Info.plist) and `ios/Shooter/Shooter/LiveActivityManager.swift`;
   the app has an Embed App Extensions phase, a build dependency, and
   `NSSupportsLiveActivities = YES`. It compiles today.

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

## iOS widget-extension target (`ShooterWidget`, compile-verified)

- `ios/Shooter/ShooterWidget/ShooterActivityAttributes.swift` — shared with the
  app target (its `ContentState` mirrors `LiveActivityContentState`).
- `ios/Shooter/ShooterWidget/ShooterLiveActivity.swift` — Lock Screen + Dynamic
  Island, Amber Phosphor.
- `ios/Shooter/ShooterWidget/ShooterWidgetBundle.swift` — `@main` widget bundle.
- `ios/Shooter/ShooterWidget/Info.plist` — `NSExtensionPointIdentifier =
com.apple.widgetkit-extension`.
- `ios/Shooter/Shooter/LiveActivityManager.swift` — app-side start/end; streams
  the `Activity.pushToken` to `/api/live-activity/register` (reads serverUrl from
  UserDefaults + apiKey from Keychain, matching `NotificationManager`).
- Project wiring (via `xcodeproj`): new `ShooterWidget` app-extension target
  (bundle `in.juspay.shooter.ShooterWidget`, iOS 16.2, team YM9U73Z2JM), an Embed
  App Extensions phase + build dependency on the app, and
  `INFOPLIST_KEY_NSSupportsLiveActivities = YES` on the app.

## Verification

- Unit: 12 (builder) + 6 (store) tests.
- Integration (curl): register → `success`, store persists the token, update-by-
  `sessionId` resolves the token and reaches the real APNs curl; missing
  token/session → 400.
- **iOS build:** `xcodebuild -scheme Shooter -sdk iphonesimulator` → `** BUILD
SUCCEEDED **` with the `ShooterWidget` extension built as a dependency (iOS 26 SDK).
- Gates: `pnpm check` / `build` / full `test` / eslint `--max-warnings 0` green.

## On-device caveat

The target compiles; the remaining on-device acceptance step is that the Live
Activity actually _renders_ and _updates_ — call `LiveActivityManager.shared.start(...)`
when a session begins, `.end()` when it finishes, and run on a real device
(iOS 16.2+). The server push path + token lifecycle are unit- and curl-verified;
the widget target is compile-verified.
