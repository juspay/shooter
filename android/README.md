# Shooter Android App

## 1. Overview

The Shooter Android app is a thin native wrapper around the Shooter web dashboard. It provides two capabilities that a browser alone cannot:

- **WebView shell** -- loads the full Shooter web UI (sessions, terminals, config) inside a native Activity so the app feels like a first-class citizen on Android.
- **FCM push notifications** -- receives Firebase Cloud Messaging data messages from the Shooter server, including interactive permission requests (Allow / Deny) that let you approve or reject tool actions from the notification shade.

The app does not duplicate any web UI. All dashboard rendering happens in the WebView; the native layer handles push delivery, encrypted credential storage, and the JavaScript bridge that syncs configuration between the web page and the device.

---

## 2. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Android Studio | Ladybug (2024.2) or later | Needed for SDK management and device tooling |
| Android SDK | API 35 (compileSdk) | Install via Android Studio SDK Manager |
| Minimum device API | 26 (Android 8.0) | Set in `app/build.gradle.kts` as `minSdk` |
| JDK | 17 | `compileOptions` and `kotlinOptions` both target Java 17 |
| Gradle | 8.12+ | Only required locally if generating the wrapper via `setup.sh` |
| Firebase account | -- | Free Spark plan is sufficient for FCM |
| Shooter server | Running | The web dashboard the app loads must be reachable |

### Installing the JDK

Android Studio bundles a JDK, but if you need a standalone installation:

```bash
# macOS (Homebrew)
brew install openjdk@17

# Ubuntu / Debian
sudo apt install openjdk-17-jdk
```

---

## 3. Firebase Setup

FCM is the transport for push notifications. You must create a Firebase project and download a real `google-services.json` before the app can receive messages.

### 3.1 Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and give it a name (e.g. "Shooter").
3. Disable Google Analytics if you do not need it -- it is not used by the app.
4. Click **Create project**.

### 3.2 Add an Android App

1. In the Firebase project dashboard, click the **Android** icon to add an app.
2. Enter the package name: **`com.shooter.android`** (must match `applicationId` in `app/build.gradle.kts`).
3. Optionally enter a nickname (e.g. "Shooter Android").
4. You can skip the SHA-1 fingerprint for now; it is not required for FCM.
5. Click **Register app**.

### 3.3 Download google-services.json

1. Firebase will present a **Download google-services.json** button. Click it.
2. Save the file.

### 3.4 Place the File

Replace the placeholder file that ships with the repository:

```bash
cp ~/Downloads/google-services.json android/app/google-services.json
```

The repository ships a placeholder at `android/app/google-services.json` with dummy values (`project_id: "shooter-dev"`, `current_key: "placeholder-key-for-build-only"`). **The app will compile with the placeholder, but FCM will not function until you replace it with a real file.**

### 3.5 Obtain the Server Key

The Shooter server needs an FCM credential to send messages to devices.

1. In the Firebase Console, go to **Project settings > Cloud Messaging**.
2. If the Cloud Messaging API (V1) is not enabled, click the link to enable it in the Google Cloud Console.
3. Go to **Project settings > Service accounts** and click **Generate new private key**. This downloads a JSON file the server uses for FCM v1 API authentication.

Place this key file where your Shooter server can read it and configure the server's FCM environment variables accordingly.

---

## 4. Build and Run

### 4.1 Generate the Gradle Wrapper

The repository does not commit Gradle wrapper JARs. Run the setup script once to generate them:

```bash
cd android/
chmod +x setup.sh
./setup.sh
```

This requires a local Gradle 8.12+ installation. If you do not have one:

```bash
# macOS
brew install gradle

# SDKMAN
sdk install gradle 8.12
```

### 4.2 Build a Debug APK

```bash
cd android/
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

### 4.3 Install on a Device or Emulator

With a device connected via USB (or an emulator running):

```bash
./gradlew installDebug
```

Or install the APK directly:

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 4.4 Run from Android Studio

1. Open the `android/` directory as a project in Android Studio.
2. Let Gradle sync finish.
3. Select a device or emulator from the toolbar.
4. Click **Run** (the green play button).

---

## 5. Configuration

### 5.1 Server URL

The default server URL is compiled into the build:

```kotlin
// build.gradle.kts
buildConfigField("String", "DEFAULT_SERVER_URL", "\"https://shooter.breezehq.dev\"")
```

This value is used on first launch if no URL has been saved. To point the app at a different server, change the value in `app/build.gradle.kts` for both `debug` and `release` build types and rebuild.

At runtime the URL is persisted in encrypted preferences. If the web dashboard saves a different `serverUrl` in `localStorage` under the key `shooter_config`, the native side picks it up automatically on page load.

### 5.2 API Key

The API key authenticates the app when sending permission responses and registering the FCM token with the server. Enter it through the web UI:

1. Open the app.
2. Tap the overflow menu (three dots) and select **Settings**, or invoke `ShooterNative.openSettings()` from the web page.
3. The WebView navigates to `/config` where you can enter the API key.
4. The web page calls `ShooterBridge.saveConfig(json)` to persist the key in encrypted storage.

### 5.3 JavaScript Bridge

The app exposes two JavaScript interfaces to the WebView:

| Interface | Method | Description |
|---|---|---|
| `ShooterNative` | `openSettings()` | Navigates the WebView to the `/config` page |
| `ShooterBridge` | `getConfig()` | Returns JSON with `serverUrl`, `apiKey`, `fcmToken` |
| `ShooterBridge` | `saveConfig(json)` | Persists `serverUrl` and `apiKey` from the JSON argument |
| `ShooterBridge` | `getFcmToken()` | Returns the cached FCM registration token |
| `ShooterBridge` | `getPlatform()` | Returns the string `"android"` |

The web dashboard can call these from JavaScript (e.g. `ShooterBridge.getConfig()`) to synchronize settings between the native layer and the browser context.

---

## 6. Push Notifications

### 6.1 FCM Data Messages

The server sends FCM **data-only** messages (no `notification` block). This ensures `ShooterFirebaseService.onMessageReceived()` is called whether the app is in the foreground or background. The data payload contains:

| Key | Required | Description |
|---|---|---|
| `title` | Yes | Notification title |
| `body` | Yes | Notification body text |
| `category` | No | If `"CLAUDE_PERMISSION"`, the notification gets Allow/Deny actions |
| `requestId` | No | Identifies the permission request; required when `category` is `"CLAUDE_PERMISSION"` |

### 6.2 Notification Channels

The app creates two Android notification channels at startup (in `ShooterApplication`):

| Channel ID | Name | Importance | Purpose |
|---|---|---|---|
| `permissions` | Permission Requests | HIGH | Interactive Allow/Deny notifications with vibration |
| `events` | Session Events | DEFAULT | Informational notifications for coding session activity |

Users can independently configure sound, vibration, and visibility for each channel in Android system settings.

### 6.3 Interactive Permission Flow

When a `CLAUDE_PERMISSION` message arrives:

1. `ShooterFirebaseService` delegates to `NotificationHelper.showPermissionNotification()`.
2. The notification displays with two action buttons: **Allow** and **Deny**.
3. Tapping either button fires an intent to `PermissionActionReceiver`.
4. The receiver cancels the notification, then POSTs the decision to the server at `/api/response` with the `requestId` and `decision` fields.
5. The request includes `Authorization: Bearer <apiKey>` from encrypted preferences.

### 6.4 Retry Logic

`PermissionActionReceiver` retries failed HTTP calls with exponential backoff:

- **Max retries:** 3
- **Initial backoff:** 1 000 ms
- **Backoff formula:** `1000 * 2^(attempt - 1)` ms (1s, 2s, 4s)
- Uses `BroadcastReceiver.goAsync()` to keep the receiver alive during retries.

### 6.5 Token Registration

When the FCM SDK issues a new token (on first launch or token rotation), `ShooterFirebaseService.onNewToken()` stores it in encrypted preferences and POSTs it to `<serverUrl>/api/device-token` with the platform set to `"android"`. The token is also fetched proactively in `MainActivity.onCreate()` so it is available to the JavaScript bridge immediately.

---

## 7. Architecture

```
android/app/src/main/kotlin/com/shooter/android/
    ShooterApplication.kt      Application subclass; creates notification channels
    MainActivity.kt            Single Activity; hosts WebView + SwipeRefreshLayout
    ShooterFirebaseService.kt  FirebaseMessagingService; receives data messages, manages token
    NotificationHelper.kt      Builds and posts notifications (permission + event)
    PermissionActionReceiver.kt BroadcastReceiver; handles Allow/Deny button taps
    AppPreferences.kt          EncryptedSharedPreferences wrapper for credentials
```

### Component Relationships

```
FCM cloud
  |
  v
ShooterFirebaseService
  |-- onNewToken() --> AppPreferences (store) + POST /api/device-token
  |-- onMessageReceived() --> NotificationHelper
                                |-- showPermissionNotification() --> Android notification with actions
                                |-- showEventNotification()      --> Android notification (info only)
                                          |
                                          v  (user taps Allow or Deny)
                                PermissionActionReceiver
                                          |
                                          v
                                POST /api/response (with retry)

MainActivity
  |-- WebView loads Shooter dashboard
  |-- ShooterBridge (JS interface) <--> AppPreferences
  |-- ShooterNative (JS interface) --> navigateToConfig()
  |-- SwipeRefreshLayout --> webView.reload()
```

### Manifest Highlights

- **`android.permission.INTERNET`** -- required for WebView and HTTP calls.
- **`android.permission.POST_NOTIFICATIONS`** -- required on Android 13+ (API 33) to show notifications; the system prompts the user at runtime.
- **`launchMode="singleTask"`** on `MainActivity` -- ensures deep links and notification taps reuse the existing Activity instead of creating a new one.
- **`ShooterFirebaseService`** is declared with `exported="false"` and the `com.google.firebase.MESSAGING_EVENT` intent filter so only the Firebase SDK can invoke it.
- **`PermissionActionReceiver`** is declared with `exported="false"` so only the app's own PendingIntents can trigger it.

---

## 8. Features

### Deep Link Validation

When a notification tap or intent passes a URL via `MainActivity.EXTRA_URL`, the app validates that the URL starts with the configured server URL before loading it. This prevents external intents from navigating the WebView to arbitrary sites.

### Encrypted Storage

All credentials (server URL, API key, FCM token) are stored using `EncryptedSharedPreferences` backed by an AES-256-GCM master key from the Android Keystore. Keys are encrypted with AES-256-SIV and values with AES-256-GCM. The data is not included in device backups (`android:allowBackup="false"`).

### Settings Menu

The overflow menu on the toolbar provides a **Settings** item that navigates the WebView to the `/config` route. The web page can also trigger this programmatically by calling `ShooterNative.openSettings()`.

### Pull-to-Refresh

`SwipeRefreshLayout` wraps the WebView. Pulling down reloads the current page. The refresh indicator is dismissed in `onPageFinished()`.

### Splash Screen

The app uses the `androidx.core:core-splashscreen` library. The splash theme (`Theme.Shooter.Splash`) is applied to `MainActivity` in the manifest and replaced by the main theme during `onCreate()` via `installSplashScreen()`.

### Back Navigation

Pressing the system back button navigates back within the WebView history. When there is no more history, the default Activity back behavior applies (the app closes).

### Dark Background

The WebView, SwipeRefreshLayout, and root FrameLayout all use a dark background color (`#0A0A0A`) that matches the web dashboard to prevent a white flash during page loads.

---

## 9. Troubleshooting

### Placeholder google-services.json

**Symptom:** The app builds and launches but never receives push notifications.

**Cause:** The repository ships a placeholder `google-services.json` with dummy values. FCM cannot connect without a real configuration file.

**Fix:** Follow the [Firebase Setup](#3-firebase-setup) instructions to download and place a real `google-services.json`.

### FCM Not Connecting

**Symptom:** The FCM token is empty or notifications are not delivered.

Checklist:

1. Confirm `google-services.json` has real values (check that `project_id` is not `"shooter-dev"` and `current_key` is not `"placeholder-key-for-build-only"`).
2. Verify the device has Google Play Services installed and updated. FCM requires Play Services. Emulators must use a system image that includes the Google APIs.
3. Check that the server is configured with the correct FCM service account key for the same Firebase project.
4. Inspect `adb logcat -s FirebaseMessaging` for registration errors.

### Notification Permissions on Android 13+

**Symptom:** Notifications are silently dropped on Android 13 (API 33) and above.

**Cause:** Android 13 introduced a runtime permission (`POST_NOTIFICATIONS`). The app declares this permission in the manifest but does not yet include a runtime permission request dialog. On Android 13+ the system may prompt the user automatically the first time a notification is posted, but behavior varies by device.

**Fix (temporary):** Go to the device's system settings and manually grant notification permission to Shooter:

> Settings > Apps > Shooter > Notifications > enable "All Shooter notifications"

**Fix (permanent):** A future release will add an explicit `ActivityCompat.requestPermissions()` call on first launch.

### WebView Shows a Blank Page

**Symptom:** The app opens but the WebView stays dark with no content.

Checklist:

1. Confirm the server URL is correct. Check encrypted preferences by inspecting `ShooterBridge.getConfig()` output in Chrome DevTools remote debugging.
2. Verify the Shooter server is running and reachable from the device. If the server is on localhost, use `adb reverse tcp:3000 tcp:3000` (adjust the port) to make it accessible to the emulator.
3. Enable WebView debugging (automatic in debug builds) and connect Chrome DevTools at `chrome://inspect`.

### Permission Response Not Reaching Server

**Symptom:** You tap Allow or Deny but the coding session does not proceed.

Checklist:

1. Verify the API key is configured. Open the config page and confirm the key is present.
2. Check network connectivity. The `PermissionActionReceiver` retries up to 3 times, but the device must be able to reach the server.
3. Inspect `adb logcat -s OkHttp` for HTTP errors.

---

## 10. Release Build

### 10.1 Create a Signing Key

If you do not already have a keystore:

```bash
keytool -genkey -v \
  -keystore shooter-release.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias shooter
```

Keep the keystore file and passwords safe. You cannot update the app on the Play Store without the same signing key.

### 10.2 Configure Signing in Gradle

Create a `keystore.properties` file in the `android/` directory (do **not** commit this file):

```properties
storeFile=../shooter-release.jks
storePassword=your_store_password
keyAlias=shooter
keyPassword=your_key_password
```

Then add a signing config to `app/build.gradle.kts`:

```kotlin
android {
    signingConfigs {
        create("release") {
            val props = java.util.Properties().apply {
                load(rootProject.file("keystore.properties").inputStream())
            }
            storeFile = file(props["storeFile"] as String)
            storePassword = props["storePassword"] as String
            keyAlias = props["keyAlias"] as String
            keyPassword = props["keyPassword"] as String
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            // ... existing release config ...
        }
    }
}
```

### 10.3 Build the Release APK or Bundle

```bash
# APK
./gradlew assembleRelease

# Android App Bundle (required for Play Store)
./gradlew bundleRelease
```

Output locations:

- APK: `app/build/outputs/apk/release/app-release.apk`
- AAB: `app/build/outputs/bundle/release/app-release.aab`

### 10.4 ProGuard / R8

The release build type already enables minification and resource shrinking:

```kotlin
isMinifyEnabled = true
isShrinkResources = true
proguardFiles(
    getDefaultProguardFile("proguard-android-optimize.txt"),
    "proguard-rules.pro"
)
```

The custom `proguard-rules.pro` keeps OkHttp, Firebase, and `PermissionActionReceiver` classes from being stripped. If you add new libraries that use reflection, add corresponding keep rules.

### 10.5 Play Store Preparation

1. **Version bump** -- increment `versionCode` and `versionName` in `app/build.gradle.kts` before each release.
2. **App signing** -- Google Play App Signing is recommended. Upload the AAB and let Google manage the signing key distribution.
3. **google-services.json** -- make sure the production Firebase project is configured. The `google-services.json` in the release build must match the Firebase project whose server key the Shooter server uses.
4. **Target API compliance** -- the app targets API 35. Google Play requires new apps to target the latest stable API level.
5. **Content rating** -- complete the content rating questionnaire in the Play Console.
6. **Privacy policy** -- required if the app collects any user data. The app stores an API key and FCM token on-device; disclose this.

### 10.6 Files to Exclude from Version Control

Ensure these are in `.gitignore`:

```
android/shooter-release.jks
android/keystore.properties
android/app/google-services.json   # real one; placeholder is committed
```
