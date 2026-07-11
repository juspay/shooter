# Widget / Live Activity Deep Links — Design

Tapping the home-screen widget or the Lock Screen Live Activity opens the app to
the session it represents.

## Flow

1. **Widget / Live Activity** carry a `.widgetURL(shooter://session/<id>)`
   (home widget nil-guards an empty sessionId → opens the app; Live Activity uses
   `context.attributes.sessionId`).
2. **URL scheme `shooter`** is registered via a partial `ios/Shooter/Shooter/Info.plist`
   (`CFBundleURLTypes`) with `INFOPLIST_FILE` set while `GENERATE_INFOPLIST_FILE`
   stays `YES` — the generated keys merge on top. Verified by inspecting the built
   `Info.plist`: it contains both the `shooter` scheme AND every generated key
   (`NSSupportsLiveActivities`, `CFBundleName`, `UILaunchScreen`).
3. **`ContentView.onOpenURL`** parses `shooter://session/<id>` / `shooter://terminal/<id>`
   into a path, joins it to the stored `serverUrl` (trailing-slash-safe), and posts
   `.shooterDeepLink { url }`.
4. **The WebView coordinator** observes `.shooterDeepLink` (same pattern as the
   existing `.shooterSilentWake`) and `webView.load(URLRequest(url:))` — navigating
   to `<serverUrl>/session/<id>`.

Unrecognized links just bring the app forward; if the app is unpaired (no WebView)
the link is safely dropped.

## Verification

- `xcodebuild -scheme Shooter -sdk iphonesimulator` → `** BUILD SUCCEEDED **` (twice).
- Built `Info.plist` merge inspected (scheme + generated keys coexist).
- Adversarial review (3 dimensions → verify): 3 candidate findings, **0 confirmed**
  — the id-in-URL and observer-lifecycle concerns were refuted (UUID ids are
  URL-safe; iOS 9+ auto-removes selector observers); the "generic scheme" note is
  defense-in-depth, not a defect.

## On-device caveat

The actual tap→open→navigate round-trip is the on-device acceptance step (custom
schemes require a real launch). Scheme registration + navigation wiring are
compile- and Info.plist-verified.
