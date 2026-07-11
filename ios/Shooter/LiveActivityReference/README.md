# Live Activity (Slice 6) — iOS integration guide

The server side of Slice 6 (Ambient status) is built and tested:

- **APNs transport:** `LibraryAPNsService.sendLiveActivity(token, input)` pushes to
  `<bundleId>.push-type.liveactivity` with `apns-push-type: liveactivity`.
- **Pure body builder:** `apns-liveactivity.ts` (`buildLiveActivityBody`, `liveActivityTopic`)
  — 12 unit tests.
- **Token store:** `live-activity-store.ts` maps a session → its rotating activity
  push token — 6 unit tests.
- **Endpoints:** `POST /api/live-activity/register` (+ `DELETE`) to register a
  session's token; `POST /api/live-activity` to push a `start`/`update`/`end`
  update (targets an explicit token or a registered `sessionId`; forgets the token
  on `end`/410).
- **Types:** `src/lib/types/live-activity.ts` — `LiveActivityContentState` is the
  contract the Swift `ContentState` must mirror.

The iOS half needs an Xcode **widget-extension target**, which must be created in
Xcode (adding an app-extension target rewrites dozens of interlinked `pbxproj`
UUIDs — too fragile to hand-edit safely). The Swift here is the ready-to-use
reference; the SourceKit errors you see on these files in a plain editor are
expected — ActivityKit/WidgetKit only resolve inside a real iOS target.

## Files

| File | Target |
|------|--------|
| `ShooterActivityAttributes.swift` | **both** app + widget extension |
| `ShooterLiveActivity.swift` | widget extension only |
| `ShooterWidgetBundle.swift` | widget extension only (`@main`) |
| `LiveActivityManager.swift` | app target only |

## Xcode steps

1. **File ▸ New ▸ Target… ▸ Widget Extension.** Name it `ShooterWidget`. Check
   **Include Live Activity**; uncheck Configuration Intent. This creates the
   target, its `Info.plist`, and the embed build phase automatically.
2. **Delete** the template `ShooterWidget.swift`/bundle Xcode generated.
3. **Add the reference files** (drag them out of `LiveActivityReference/` into the
   project, or copy their contents):
   - `ShooterActivityAttributes.swift` → Target Membership: **app + ShooterWidget**.
   - `ShooterLiveActivity.swift`, `ShooterWidgetBundle.swift` → **ShooterWidget** only.
   - `LiveActivityManager.swift` → **app** only.
4. **App target ▸ Info.plist:** add `NSSupportsLiveActivities = YES`.
5. **Capabilities:** the app already has Push Notifications; no new entitlement is
   needed for Live Activity push (it reuses the APNs key).
6. **Wire it up:** call `LiveActivityManager.shared.start(sessionId:title:status:)`
   when a session begins (e.g. from the existing notification/session handling in
   `ContentView`/`AppDelegate`) and `.end()` when it completes. The manager streams
   the activity push token to `POST /api/live-activity/register`; the server then
   drives updates via `POST /api/live-activity`.
7. **Build for a device** (Live Activities don't run in older simulators; iOS 16.2+
   for push-token updates). Verify the Lock Screen + Dynamic Island presentation.

## Server → activity update example

```bash
curl -X POST "$BASE/api/live-activity" \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id>","event":"update",
       "contentState":{"title":"claude","status":"Awaiting input",
                        "detail":"Permission: Edit file","updatedAt":"2026-07-11T00:00:00Z"}}'
```

## On-device caveat

Live Activity rendering, the Dynamic Island, and push-driven updates are the
on-device acceptance step (real device, iOS 16.2+, `xcodebuild` on the created
target). The server push path + token lifecycle are unit-tested here.
