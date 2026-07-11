# Home-Screen Widget — Design (Slice 6 extra)

A WidgetKit home-screen widget for `ShooterWidget` showing the latest coding
session and its status, alongside the Live Activity from #118/#119.

## Data flow — App Group shared snapshot (no network in the widget)

The widget is network- and credential-free: the **app writes** a tiny snapshot to
an App Group `UserDefaults`; the **widget reads** it in its timeline provider.

- **App Group:** `group.in.juspay.shooter` — declared identically in the app
  entitlements, the widget entitlements, and `WidgetShared.appGroup`; the widget
  target's `CODE_SIGN_ENTITLEMENTS` points at `ShooterWidget/ShooterWidget.entitlements`.
- **`WidgetShared` (both targets):** a `Snapshot { sessionId, title, status,
hasActivity, updatedAt }` Codable, `write()` (persist + `WidgetCenter.reloadAllTimelines()`)
  and `read()` (→ `.empty` sentinel when nothing written yet).
- **`ShooterHomeWidget` (widget target):** `StaticConfiguration` + `TimelineProvider`
  reading the snapshot; small + medium families, Amber Phosphor; `.after(15m)`
  fallback refresh; `containerBackground` guarded behind `#available(iOS 17)`.
- **App write path (`NotificationManager`):** `updateWidgetSnapshot()` runs on
  foreground arrival (`willPresent`), tap (`syncLiveActivity`), and lock-screen
  decision actions.

## Correctness — the 5 fixes from adversarial review

A 4-dimension review (9 agents) found 5 confirmed defects; all fixed:

1. **(HIGH) Status derivation read `userInfo["eventType"]`, which the server never
   sends.** The delivered push carries session state in top-level `data.category`
   (`permission`/`question`/`idle_input`/`intervention`/`completion`). Now reads
   `category` (eventType as fallback). **This also repairs the same bug in the
   already-merged #119 Live Activity wiring** (shared `syncLiveActivity` path).
2. **(HIGH) Completion was unreachable** — keyed on `source.contains("completion")`,
   but the server overwrites `source` with `"modern-apns-api"`. Now `category ==
"completion"` drives `isDone` / `LiveActivityManager.end()`.
3. **(MED) Decision-button taps didn't refresh the widget** — now call
   `updateWidgetSnapshot()` in the decision branch (cheap App-Group write).
4. **(LOW) Redundant double-write** (arrival + tap) — deduped by `requestId|status`.
5. **(LOW) `sessionId` was discarded** — added to the snapshot with a session-affinity
   - urgency rule so a lower-urgency event from another session can't downgrade an
     unacted urgent snapshot (with a 1h staleness escape hatch).

## Verification

- `xcodebuild -scheme Shooter -sdk iphonesimulator` → `** BUILD SUCCEEDED **`
  (app + `ShooterWidget` with both widgets, iOS 26 SDK).
- App Group id verified identical across app/widget entitlements + `WidgetShared.appGroup`.
- Root cause of the status/completion fixes verified against `.claude/hooks/notifier.cjs`
  (category values) and `src/routes/api/notify/+server.ts` (payload spread).

## On-device caveat

Widget rendering on the Home Screen (small/medium), the App Group hand-off, and
timeline refresh are the on-device acceptance step (real device; App Group must be
registered in the Apple Developer portal for signed builds). Compile-verified here.
