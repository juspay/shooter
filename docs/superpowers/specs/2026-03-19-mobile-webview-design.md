# Mobile Apps as WebView + Native Push — Design Spec

## Problem

The iOS app has a native SwiftUI notification list that duplicates what the web dashboard already provides. The Android app needs to be built. Building native screens for terminals, sessions, and projects on each platform is unnecessary work since the SvelteKit web dashboard is already mobile-responsive.

## Decision

Both mobile apps (iOS and Android) follow the same architecture:

1. **WebView as the entire UI** — loads the Shooter web dashboard URL
2. **Native push notification handling** — the only part that requires native code (APNs for iOS, FCM for Android)
3. **First-launch setup screen** — configure server URL and API key
4. **Interactive notification actions** — Allow/Deny buttons for permission requests, with `POST /api/response` to send decisions

The web dashboard already handles terminals, sessions, projects, and configuration. Wrapping it in a WebView gives both platforms full functionality with zero duplicated UI code.

## iOS Changes (Refactor)

Strip the native UI down to WebView + push handling:

- **Replace** `ContentView` (notification list) with `WKWebView` pointing at the configured server URL
- **Delete** `NotificationCardView.swift`, `NotificationModels.swift` — the web dashboard renders notification history
- **Strip** `NotificationManager.swift` to only push registration and permission response handling
- **Replace** `ConfigurationView` with `SetupView` (first-launch only, not a persistent settings tab)
- **Keep unchanged**: `AppDelegate` (device token registration), APNs registration, `CLAUDE_PERMISSION` notification category

### Resulting file count

~5 Swift files (down from 8):

| File | Purpose |
|------|---------|
| `AppDelegate.swift` | APNs registration, device token forwarding |
| `ShooterApp.swift` | App entry point, setup-vs-webview routing |
| `SetupView.swift` | First-launch server URL + API key entry |
| `WebViewScreen.swift` | `WKWebView` loading the dashboard |
| `NotificationManager.swift` | Push handling + permission response POST |

## Android App (New)

~8 Kotlin files total. No Compose, Hilt, or Room — the WebView eliminates the need for a UI framework. Simple Activities + XML layouts keep the app minimal.

| File | Purpose |
|------|---------|
| `MainActivity.kt` | `WebView` loading the dashboard URL |
| `SetupActivity.kt` | First-launch server URL + API key entry |
| `ShooterFirebaseService.kt` | `FirebaseMessagingService` — handles incoming FCM data messages |
| `PermissionActionReceiver.kt` | `BroadcastReceiver` for Allow/Deny notification actions |
| `NotificationHelper.kt` | Constructs notifications with action buttons |
| `AppPreferences.kt` | `EncryptedSharedPreferences` wrapper for server URL, API key, device token |
| `ShooterApplication.kt` | `Application` subclass — notification channel creation |
| `ApiClient.kt` | HTTP calls to `POST /api/response` and `POST /api/register` |

### WebView configuration

- JavaScript enabled
- DOM storage enabled
- WebSocket connections allowed (required for terminal streaming)
- File upload support for any future config import
- Back button navigates WebView history before exiting the app

## Server Changes

### New: FCM sender module

Location: `src/lib/modules/server/fcm/`

- `sender.ts` — sends data-only FCM messages via the HTTP v1 API
- Uses `firebase-admin` npm package for auth and message delivery
- Mirrors the existing `src/lib/modules/server/apn/` structure

### Modified: notification routing

- `/api/notify` endpoint gains platform routing based on `DEVICE_PLATFORM` env var
- `"ios"` routes to the existing APNs sender
- `"android"` routes to the new FCM sender
- Default remains `"ios"` for backward compatibility

### New environment variables

| Variable | Purpose |
|----------|---------|
| `DEVICE_PLATFORM` | `"ios"` or `"android"` — selects push transport |
| `FCM_PROJECT_ID` | Firebase project ID |
| `FCM_CLIENT_EMAIL` | Firebase service account email |
| `FCM_PRIVATE_KEY` | Firebase service account private key |
| `ANDROID_DEVICE_TOKEN` | FCM registration token for the Android device |

## What Stays the Same

- All REST API endpoints — unchanged
- All WebSocket channels (`terminal`, `session`, `events`) — unchanged
- Ticket-based WebSocket auth — unchanged
- Permission polling flow in `notifier.cjs` — unchanged
- Web dashboard — unchanged (both apps load it via WebView)
- iOS APNs flow — unchanged, just no longer duplicated by native UI

## Key Technical Decisions

### 1. Data-only FCM messages

Android notification messages (sent with a `notification` key) are auto-displayed by the system and cannot have custom actions attached. Data-only messages (sent with only a `data` key) reach `onMessageReceived()` in the `FirebaseMessagingService`, giving full control over notification construction, action buttons, and response handling. This is required for the Allow/Deny permission flow.

### 2. EncryptedSharedPreferences for Android

The API key is encrypted at rest using AES-256-GCM via Android's `EncryptedSharedPreferences`. This is stronger than the iOS approach, which currently uses plain `UserDefaults`. A future iOS improvement could migrate to Keychain storage.

### 3. No Compose/Hilt/Room on Android

The WebView is the entire UI. There are no lists to render, no local database to query, no dependency graph to manage. Simple Activities with XML layouts keep the APK small and the codebase trivial to maintain.

### 4. Single DEVICE_PLATFORM env var

The server routes notifications to exactly one platform based on this variable. This matches the current single-device model (one `DEVICE_TOKEN` for iOS). Future enhancement: support multi-device delivery with an array of `{token, platform}` pairs, removing the need for separate env vars per platform.

## File Count Summary

| Component | Files | Status |
|-----------|-------|--------|
| iOS app | ~5 Swift files | Refactor (down from 8) |
| Android app | ~8 Kotlin files | New |
| Server | 1 new module + 2 modified files | Addition |
