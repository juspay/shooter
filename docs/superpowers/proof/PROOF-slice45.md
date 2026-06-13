# Slice 4 + 5 Proof (native — compile-verified)

Per the agreed scope, the native Swift is **compiled and linked**, not device-run. The bar set was
"compile-only"; this clears it with a full **simulator app build** (stronger than a syntax check),
against the **iOS 26 SDK** (Xcode 26.5). Real-device behaviors are explicitly NOT claimed here — see
"Needs your device" below.

## Build result

- Baseline (before changes): `** BUILD SUCCEEDED **`.
- After all native changes: `** BUILD SUCCEEDED **`, `0` Swift errors.
- Command: `xcodebuild -project ios/Shooter/Shooter.xcodeproj -scheme Shooter -sdk iphonesimulator
-destination 'platform=iOS Simulator,name=iPhone 17 Pro' -configuration Debug build
CODE_SIGNING_ALLOWED=NO`.
- Notably, the **Foundation Models** usage (`SystemLanguageModel.default`, `model.availability`,
  `LanguageModelSession(instructions:)`, `await session.respond(to:)`, `response.content`) compiles
  against the iOS 26 SDK — so the on-device API surface is correct, not guessed.

## Slice 4 — background-wake

- `library-apns.ts`: new `sendSilentNotification()` — `apns-push-type: background`,
  `apns-priority: 5`, `aps.content-available = 1`, no alert. Shares the existing curl/HTTP-2
  `deliver()` path (alert path byte-for-byte unchanged). Type-checks; payload correct by
  construction.
- `AppDelegate.swift`: `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` posts
  `.shooterSilentWake` and reports `.newData` after a short window.
- `project.pbxproj`: `INFOPLIST_KEY_UIBackgroundModes = "remote-notification"` added to **both**
  Debug and Release configs (the project uses `GENERATE_INFOPLIST_FILE = YES`).
- `ContentView.swift` Coordinator observes `.shooterSilentWake` → `evaluateJavaScript` dispatches a
  `shooter:wake` DOM event.
- `autopilot-driver.svelte.ts`: listens for `shooter:wake` → `refresh()` (a burst).

## Slice 5 — bridge file persistence + on-device decide

- `ContentView.swift` bridge: new `window.ShooterBridge.files.{write,read,list}` and
  `window.ShooterBridge.agentDecide(context)`, backed by `shooterFiles` / `shooterAgentDecide`
  `WKScriptMessageHandler`s, returning via the existing `sendNativeResponse` channel.
- File I/O is sandboxed to `Application Support/shooter-agent` with a **path-traversal guard**
  (`safeFileURL` rejects `/` and `..`).
- `AgentDecider.decideCommand(context:)` — on-device model via Foundation Models, guarded by
  `#if canImport(FoundationModels)` + `#available(iOS 26.0, *)` + `model.availability == .available`;
  returns `nil` (→ caller falls back) when unavailable.
- `autopilot-driver.svelte.ts`: `defaultProduceCommand` now tries `window.ShooterBridge.agentDecide`
  first (on-device), then the conservative heuristic.

## Needs your device (NOT verified here)

- That a silent push actually **wakes** the backgrounded app and the loop runs (iOS background
  execution + APNs delivery — requires a real device; simulator + production APNs can't show this).
- The Foundation Models model actually **producing** a command on-device (needs an Apple-Intelligence
  capable device on iOS 26; the simulator build proves it compiles, not that it runs).
- Real `FileManager` read/write round-trip on device through the bridge.

A device checklist lives in the PR description.
