# Shooter iOS App

## 1. Overview

The Shooter iOS app is a thin native wrapper around the Shooter web dashboard. It provides two things that a plain browser tab cannot:

- **WKWebView shell** -- loads the Shooter web UI (`/config`, `/terminals`, `/session/*`, etc.) inside a native app container, with a JavaScript bridge (`window.ShooterBridge`) that exposes the device token and persisted configuration to the web layer.
- **APNs push notifications** -- registers for remote notifications, receives real-time alerts from the Shooter server (coding events, permission requests), and lets you respond to interactive Allow/Deny prompts directly from the lock screen.

The app has no bespoke native UI screens. Every page you see is rendered by the SvelteKit web app; the native layer handles only push notification registration, Keychain storage of the API key, and the bridge between JavaScript and iOS system APIs.

Bundle ID: `in.juspay.shooter`
Minimum deployment target: iOS 16.0
Language: Swift 5 / SwiftUI

---

## 2. Prerequisites

| Requirement | Details |
|---|---|
| **macOS** | Ventura 13.0 or later (required by modern Xcode) |
| **Xcode** | 15.0 or later (Swift 5, iOS 16+ SDK) |
| **Apple Developer Account** | Free accounts can run on a personal device, but push notifications and TestFlight require a paid Apple Developer Program membership ($99/year) |
| **Physical iOS device** | Push notifications do not work on the Simulator. You need an iPhone or iPad running iOS 16+ connected via USB or on the same Wi-Fi network (wireless debugging) |
| **Shooter server running** | The server must be reachable (locally or via Cloudflare Tunnel) so the app can load the web UI and register its device token |

---

## 3. Apple Developer Portal Setup

Before you can build with push notifications, you need to configure your App ID and create an APNs authentication key in the Apple Developer portal.

### 3.1 Create an App ID

1. Sign in to [developer.apple.com/account](https://developer.apple.com/account).
2. Navigate to **Certificates, Identifiers & Profiles** > **Identifiers**.
3. Click the **+** button to register a new identifier.
4. Select **App IDs**, then click **Continue**.
5. Choose **App** as the type, then click **Continue**.
6. Fill in the details:
   - **Description**: `Shooter`
   - **Bundle ID**: Select **Explicit** and enter `in.juspay.shooter`
7. Scroll down to the **Capabilities** section and check **Push Notifications**.
8. Click **Continue**, review, then click **Register**.

### 3.2 Enable Push Notifications Capability

If you already have an App ID but push notifications are not enabled:

1. Go to **Identifiers** and click on your App ID (`in.juspay.shooter`).
2. Scroll to **Push Notifications** and check the box.
3. Click **Save**.

Xcode will also add this capability automatically when you enable it in the project settings (see section 4).

### 3.3 Create an APNs Authentication Key (.p8)

APNs authentication keys are the recommended way to authenticate with Apple's push notification service. A single key works for all your apps and never expires.

1. Go to **Certificates, Identifiers & Profiles** > **Keys**.
2. Click the **+** button to create a new key.
3. Enter a name (e.g., `Shooter APNs Key`).
4. Check **Apple Push Notifications service (APNs)**.
5. Click **Continue**, then **Register**.
6. **Download the `.p8` file immediately.** Apple only lets you download it once. Store it securely.
7. Note the **Key ID** displayed on the confirmation page (a 10-character alphanumeric string, e.g., `ABC123DEF4`).

### 3.4 Note Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account).
2. Your **Team ID** is displayed in the upper-right of the Membership page, or in the URL when viewing your team details. It is a 10-character alphanumeric string (e.g., `YM9U73Z2JM`).

### 3.5 Configure the Server

The Shooter server needs the following environment variables (set them in the `.env` file at the project root):

```
APNS_KEY=<contents of the .p8 file, including the BEGIN/END PRIVATE KEY lines>
APNS_KEY_ID=<your 10-character Key ID>
APNS_TEAM_ID=<your 10-character Team ID>
APNS_BUNDLE_ID=in.juspay.shooter
APNS_PRODUCTION=false
```

Set `APNS_PRODUCTION=true` when distributing via TestFlight or the App Store (see section 10).

---

## 4. Build & Run

1. Open the Xcode project:

   ```bash
   open ios/Shooter/Shooter.xcodeproj
   ```

2. In the project navigator, select the **Shooter** target.

3. Go to the **Signing & Capabilities** tab:
   - Set **Team** to your Apple Developer team.
   - Verify the **Bundle Identifier** is `in.juspay.shooter`.
   - Confirm the **Push Notifications** capability is listed. If not, click **+ Capability** and add it.

4. Connect your physical iOS device via USB (or enable wireless debugging under Window > Devices and Simulators).

5. Select your device from the scheme/device dropdown in the Xcode toolbar.

6. Press **Cmd+R** to build and run.

7. On first launch the app will request notification permission. Tap **Allow**.

8. Xcode's console will print the APNs device token:
   ```
   Device Token: a1b2c3d4e5f6...
   ```
   This token is automatically sent to the server when an API key is configured.

---

## 5. Configuration

The app loads its configuration (server URL and API key) from two sources:

| Setting | Storage | Mechanism |
|---|---|---|
| **Server URL** | `UserDefaults` (key: `serverUrl`) | Persists across launches; defaults to `https://shooter.breezehq.dev` |
| **API Key** | iOS Keychain (key: `apiKey`) | Stored securely via `KeychainHelper`; never written to `UserDefaults` |

### How to configure

You do not need to edit any Swift code. Configuration is done through the web UI:

1. Launch the Shooter app on your device.
2. The app loads the web dashboard. Navigate to the **/config** page.
3. Enter your **Server URL** (the URL where your Shooter server is reachable, e.g., your Cloudflare Tunnel URL).
4. Enter your **API Key** (the `API_KEY` value from your server's `.env` file).
5. Save. The web page calls `window.ShooterBridge.saveConfig(json)`, which the native layer intercepts via `WKScriptMessageHandler` to persist the values.

The JavaScript bridge (`window.ShooterBridge`) exposes the following to the web layer:

- `getConfig()` -- returns JSON with `serverUrl`, `apiKey`, and `fcmToken` (device token)
- `getFcmToken()` -- returns the APNs device token string
- `getPlatform()` -- returns `"ios"`
- `saveConfig(json)` -- persists server URL to `UserDefaults` and API key to Keychain

---

## 6. Push Notifications

### How they work

1. On launch, `ShooterApp` creates a `NotificationManager` and calls `requestPermission()`.
2. If the user grants permission, the app calls `UIApplication.shared.registerForRemoteNotifications()`.
3. iOS contacts APNs and returns a device token via `AppDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`.
4. `NotificationManager.setDeviceToken(_:)` converts the raw `Data` to a hex string and POSTs it to `POST /api/device-token` on the Shooter server (authenticated with the stored API key).
5. The server stores the token and uses it to send push notifications via APNs when coding events occur.

### Interactive Allow/Deny

When the server sends a permission request notification (e.g., Claude wants to execute a command), the notification arrives with the category `CLAUDE_PERMISSION`, which the app registers with two actions:

- **Allow** (`ALLOW_ACTION`) -- requires device authentication (Face ID / passcode)
- **Deny** (`DENY_ACTION`) -- styled as destructive (red text)

When you tap an action, `NotificationManager` sends the decision to `POST /api/response` with the `requestId` and `decision` (`"allow"` or `"deny"`). The server relays this back to the waiting Claude hook.

If the notification is dismissed without tapping an action, no response is sent and the hook will eventually time out, falling through to the local permission dialog.

### Retry logic

If the permission response fails to send (network error or non-2xx HTTP status), the app retries with exponential backoff: 2 seconds, 4 seconds, 8 seconds (up to 3 attempts total).

### Foreground notifications

Notifications are displayed as banners even when the app is in the foreground, thanks to the `willPresent` delegate method returning `[.banner, .sound, .badge]`.

---

## 7. QR Code Pairing

The Shooter web dashboard's settings page (`/config`) can display a QR code containing the server URL and API key. To pair:

1. Open the Shooter server's web UI in a desktop browser.
2. Navigate to the **/config** page.
3. Click the option to show the QR code.
4. On your iPhone, open the Shooter app and use the QR scanner on the config page to scan the code.
5. The scanned values are saved through the same `ShooterBridge.saveConfig()` mechanism, persisting the server URL and API key.

This avoids manually typing long API keys on a phone keyboard.

---

## 8. Architecture

### App structure

```
ShooterApp (@main)
  |
  +-- AppDelegate (UIApplicationDelegate)
  |     Handles didRegisterForRemoteNotificationsWithDeviceToken
  |     Forwards device token to NotificationManager
  |
  +-- NotificationManager (ObservableObject)
  |     Manages notification permissions
  |     Registers interactive notification categories (Allow/Deny)
  |     Sends device token to server via POST /api/device-token
  |     Handles notification responses (UNUserNotificationCenterDelegate)
  |     Sends permission decisions to server via POST /api/response
  |     Performs server health checks via GET /api/health
  |
  +-- ContentView (SwiftUI View)
        |
        +-- WebView (UIViewRepresentable wrapping WKWebView)
              Loads the Shooter web dashboard URL
              Injects window.ShooterBridge JavaScript at document start
              Handles saveConfig calls via WKScriptMessageHandler
              Pull-to-refresh support
              Debug: WKWebView inspection enabled (iOS 16.4+)
```

### Source files

| File | Purpose |
|---|---|
| `ShooterApp.swift` | App entry point. Creates `NotificationManager`, wires up `AppDelegate`, requests notification permission on appear. |
| `AppDelegate.swift` | Receives the APNs device token from iOS and forwards it to `NotificationManager`. |
| `ContentView.swift` | SwiftUI view hosting the `WebView`. Reads the server URL from `UserDefaults` with a fallback to `AppConfig.defaultServerURL`. Also contains the `WebView` UIViewRepresentable that wraps WKWebView, injects the `ShooterBridge` JavaScript, handles `saveConfig` messages, manages navigation, and supports pull-to-refresh. |
| `NotificationManager.swift` | Central notification logic: permission requests, category registration, device token handling, server registration via `/api/device-token`, permission response sending with exponential-backoff retry via `/api/response`, foreground notification display, and server health checks via `/api/health`. |
| `Config.swift` | Static configuration constants: default server URL (`https://shooter.breezehq.dev`), API endpoint paths, notification action and category identifiers, bundle ID (`in.juspay.shooter`), and debug mode flag. |
| `KeychainHelper.swift` | Thin wrapper around the iOS Keychain Services API. Provides `save`, `read`, and `delete` for secure string storage. Includes a one-time migration that moves any legacy plaintext API key from `UserDefaults` into the Keychain and removes the plaintext copy. |
| `Shooter.entitlements` | Declares `aps-environment = production` so the app can receive push notifications in both sandbox and production APNs environments. |

### Key design decisions

- **No native UI screens.** Every page is rendered by the SvelteKit web app. This means UI updates ship as server deploys, not App Store reviews.
- **Keychain for secrets.** The API key is stored in the iOS Keychain (accessible after first unlock), never in `UserDefaults` or on disk in plaintext. A one-time migration moves any legacy plaintext API key from `UserDefaults` to the Keychain.
- **Bridge injection at document start.** The `ShooterBridge` object is injected via `WKUserScript` at `.atDocumentStart` so it is available before any Svelte `onMount` code runs. It is re-injected in the `didFinish` navigation callback to pick up values (like the device token) that may arrive asynchronously after the initial page load.
- **Dark background anti-flash.** The WKWebView and its scroll view background are set to `#0a0a0a` (matching the web dashboard) and `isOpaque` is set to `false` to prevent a white flash during page loads.

---

## 9. Troubleshooting

### Push notifications do not work on the Simulator

This is an Apple platform limitation. APNs device tokens can only be obtained on a physical device. The Simulator will trigger `didFailToRegisterForRemoteNotificationsWithError`. Use a real iPhone or iPad for testing notifications.

### Device token not registering with the server

Check these in order:

1. **API key not set.** The app skips token registration if no API key is configured. Open `/config` in the app and set the API key. The Xcode console will print `Skipping token registration: no API key configured` if this is the case.
2. **Server not reachable.** Verify the server URL is correct and the server is running. Check the Xcode console for `Failed to register device token with server` errors.
3. **Wrong server URL.** The default is `https://shooter.breezehq.dev`. If you run locally, update the URL to your Cloudflare Tunnel address or local IP.
4. **Bearer token mismatch.** The API key in the app must match the `API_KEY` environment variable on the server. A mismatch produces an HTTP 401 response logged as `Device token registration FAILED: HTTP 401`.

### Notifications arrive but no Allow/Deny buttons

The notification must be sent with `category: "CLAUDE_PERMISSION"` in the APNs payload. Verify the server is setting the `category` field correctly. On the lock screen, long-press or swipe down on the notification to reveal the action buttons.

### Sandbox vs. production APNs

| Scenario | `APNS_PRODUCTION` env var | APNs gateway |
|---|---|---|
| Running from Xcode (debug build) | `false` (default) | `api.sandbox.push.apple.com` |
| TestFlight or App Store | `true` | `api.push.apple.com` |

The `Shooter.entitlements` file declares `aps-environment = production`, which tells iOS the app is eligible for production APNs. The server-side `APNS_PRODUCTION` variable controls which gateway the server connects to. A mismatch (e.g., app installed via TestFlight but server using sandbox) will cause silent notification delivery failures -- no error is returned, but notifications simply do not arrive.

### WebView shows a blank white screen

- Verify the server is running and accessible from the device's network.
- Check Xcode console for WebView navigation errors.
- Try pull-to-refresh (swipe down on the web content).
- Confirm the server URL in `/config` is correct and uses `https://`.

### "Failed to register for remote notifications" in Xcode console

- Ensure you have a valid provisioning profile with Push Notifications enabled.
- Check that the **Push Notifications** capability is added in Xcode under Signing & Capabilities.
- Verify your Apple Developer account is a paid membership (free accounts cannot use push notifications).

### Debugging the WebView

In debug builds (running from Xcode), the WKWebView is inspectable via Safari's Web Inspector:

1. On your Mac, open **Safari** > **Settings** > **Advanced** and enable **Show features for web developers**.
2. Connect your device via USB and run the app from Xcode.
3. In Safari's menu bar, go to **Develop** > *[Your Device Name]* > **Shooter** to open Web Inspector.
4. You can inspect DOM elements, view console logs, debug JavaScript, and profile network requests.

This requires iOS 16.4 or later (the `isInspectable` flag is only set in debug builds).

---

## 10. TestFlight Distribution

### Prepare the build

1. In Xcode, select the **Shooter** target and go to the **General** tab.
2. Increment the **Build** number (e.g., from `1` to `2`). The version number can stay the same for the same release.
3. Set the destination to **Any iOS Device (arm64)** in the scheme/device dropdown (not a specific device or simulator).
4. Go to **Product** > **Archive**. Xcode will build a release archive.

### Upload to App Store Connect

1. When the archive completes, the **Organizer** window opens automatically.
2. Select your archive and click **Distribute App**.
3. Choose **App Store Connect** > **Upload**.
4. Follow the prompts. Automatic signing is recommended.
5. Xcode will validate the build and upload it to App Store Connect.

### Configure in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
2. Navigate to **My Apps** > **Shooter**. If this is your first upload, create the app entry using bundle ID `in.juspay.shooter`.
3. Go to the **TestFlight** tab.
4. Your uploaded build will appear after Apple processes it (typically 5-30 minutes). You may need to answer an export compliance question (select **No** if you do not use non-standard encryption beyond HTTPS).
5. Under **Internal Testing**, create a group and add testers by Apple ID email address.
6. Select the build and enable testing.

### Server configuration for TestFlight

TestFlight builds use the production APNs gateway. Update your server's `.env` file:

```
APNS_PRODUCTION=true
```

Restart the server after changing this variable. If you forget this step, push notifications will silently fail for TestFlight users while still working for Xcode debug builds.

### Testers

- **Internal testers** (up to 25) must be App Store Connect users on your team. They get access immediately with no review required.
- **External testers** (up to 10,000) can be added by email address. The first build sent to external testers requires a brief App Store review before they can install.
- All testers receive an email invitation with a link to install the TestFlight app and then the Shooter app.
