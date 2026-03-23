# Android App Implementation Plan

> **Status**: PLANNING
> **Created**: 2026-03-19
> **Approach**: Native notifications + WebView for dashboard (mirrors iOS vision)

---

## Concept

The Android app is a **thin native wrapper** with two responsibilities:

1. **FCM push notifications** (native) -- receive alerts, show interactive Allow/Deny actions, send permission responses back to server
2. **WebView** -- load the Shooter web dashboard (`https://your-server/`) for everything else (terminals, sessions, projects, config)

This mirrors the original iOS app vision: native notification handling (because push requires it) + embedded WebView for the full dashboard UI that already works and is mobile-responsive.

---

## Architecture

```
┌─────────────────────────────────────┐
│           ANDROID APP               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │     MainActivity              │  │
│  │                               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │       WebView           │  │  │
│  │  │  (Shooter dashboard)    │  │  │
│  │  │  terminals, sessions,   │  │  │
│  │  │  config - all here      │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  ShooterFirebaseService       │  │
│  │  (background, no UI)          │  │
│  │  - receive FCM messages       │  │
│  │  - show notifications         │  │
│  │  - Allow/Deny actions         │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  PermissionActionReceiver     │  │
│  │  - handle Allow/Deny taps     │  │
│  │  - POST /api/response         │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  SetupActivity (first launch) │  │
│  │  - server URL input           │  │
│  │  - API key input              │  │
│  │  - FCM token display          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Project Structure

```
android/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── gradle/
│   ├── wrapper/
│   └── libs.versions.toml
├── gradlew
├── gradlew.bat
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── kotlin/com/shooter/android/
│       │   │   ├── ShooterApplication.kt         # App entry, create notification channels
│       │   │   ├── MainActivity.kt               # WebView host
│       │   │   ├── SetupActivity.kt              # First-launch config (URL, API key, token)
│       │   │   ├── ShooterFirebaseService.kt     # FCM message handler
│       │   │   ├── PermissionActionReceiver.kt   # Allow/Deny BroadcastReceiver
│       │   │   ├── AppPreferences.kt             # SharedPreferences wrapper
│       │   │   └── NotificationHelper.kt         # Build & show notifications
│       │   └── res/
│       │       ├── layout/
│       │       │   ├── activity_main.xml         # WebView
│       │       │   └── activity_setup.xml        # Config form
│       │       ├── drawable/
│       │       │   └── ic_notification.xml       # Notification icon
│       │       ├── mipmap-*/                     # Launcher icons
│       │       ├── values/
│       │       │   ├── strings.xml
│       │       │   ├── colors.xml
│       │       │   └── themes.xml
│       │       └── xml/
│       │           └── backup_rules.xml
│       ├── debug/
│       │   └── AndroidManifest.xml               # cleartext for local dev
│       └── test/
└── scripts/
    └── setup.sh
```

**~10 Kotlin files. That's it.**

---

## Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| UI (dashboard) | WebView | Web app already works, mobile-responsive |
| Push notifications | Firebase Cloud Messaging | Android's APNs equivalent |
| HTTP (permission responses) | OkHttp | Lightweight, one dependency |
| Storage (config) | SharedPreferences | Simple key-value, no Room needed |
| Security (API key) | EncryptedSharedPreferences | AES-256-GCM encryption |
| Min SDK | API 26 (Android 8.0) | Notification channels required |

### Dependencies

```toml
# gradle/libs.versions.toml
[versions]
agp = "8.8.2"
kotlin = "2.1.20"
firebase-bom = "33.12.0"
okhttp = "4.12.0"
security-crypto = "1.1.0-alpha06"

[libraries]
firebase-bom = { group = "com.google.firebase", name = "firebase-bom", version.ref = "firebase-bom" }
firebase-messaging = { group = "com.google.firebase", name = "firebase-messaging-ktx" }
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
security-crypto = { group = "androidx.security", name = "security-crypto", version.ref = "security-crypto" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
google-services = { id = "com.google.gms.google-services", version = "4.4.2" }
```

No Hilt, no Retrofit, no Room, no Compose, no Navigation. Just the essentials.

---

## Implementation Details

### 1. ShooterApplication.kt

```kotlin
class ShooterApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        // High importance -- heads-up for permission requests
        manager.createNotificationChannel(
            NotificationChannel("permissions", "Permission Requests", NotificationManager.IMPORTANCE_HIGH)
        )
        // Default -- session events, tool completions
        manager.createNotificationChannel(
            NotificationChannel("events", "Session Events", NotificationManager.IMPORTANCE_DEFAULT)
        )
    }
}
```

### 2. MainActivity.kt (WebView host)

```kotlin
class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if setup is needed
        val prefs = AppPreferences(this)
        if (prefs.serverUrl.isNullOrEmpty()) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = WebViewClient()  // Keep navigation in-app
        webView.loadUrl(prefs.serverUrl!!)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
```

### 3. SetupActivity.kt (first-launch config)

Simple form with:
- Server URL text field (default: `http://10.0.2.2:3000` for emulator)
- API key text field (password input)
- FCM token display (with copy button)
- "Connect" button → validates via `GET /api/health` → saves → launches MainActivity
- Can be re-opened from a menu/deep link if needed

### 4. ShooterFirebaseService.kt

```kotlin
class ShooterFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Save token for display in SetupActivity
        AppPreferences(this).fcmToken = token
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"] ?: ""
        val category = data["category"] ?: ""
        val requestId = data["requestId"]

        if (category == "permission" && requestId != null) {
            NotificationHelper.showPermissionNotification(this, title, body, requestId)
        } else {
            NotificationHelper.showEventNotification(this, title, body)
        }
    }
}
```

### 5. NotificationHelper.kt

```kotlin
object NotificationHelper {

    fun showPermissionNotification(context: Context, title: String, body: String, requestId: String) {
        val allowIntent = Intent(context, PermissionActionReceiver::class.java).apply {
            action = "ACTION_ALLOW"
            putExtra("requestId", requestId)
        }
        val denyIntent = Intent(context, PermissionActionReceiver::class.java).apply {
            action = "ACTION_DENY"
            putExtra("requestId", requestId)
        }

        val notification = NotificationCompat.Builder(context, "permissions")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .addAction(0, "Allow", PendingIntent.getBroadcast(
                context, requestId.hashCode(),
                allowIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))
            .addAction(0, "Deny", PendingIntent.getBroadcast(
                context, requestId.hashCode() + 1,
                denyIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(requestId.hashCode(), notification)
    }

    fun showEventNotification(context: Context, title: String, body: String) {
        val openIntent = Intent(context, MainActivity::class.java)
        val notification = NotificationCompat.Builder(context, "events")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(PendingIntent.getActivity(
                context, 0, openIntent, PendingIntent.FLAG_IMMUTABLE
            ))
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(body.hashCode(), notification)
    }
}
```

### 6. PermissionActionReceiver.kt

```kotlin
class PermissionActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra("requestId") ?: return
        val decision = when (intent.action) {
            "ACTION_ALLOW" -> "allow"
            "ACTION_DENY" -> "deny"
            else -> return
        }

        // Dismiss notification
        NotificationManagerCompat.from(context).cancel(requestId.hashCode())

        // Send decision to server in background
        val prefs = AppPreferences(context)
        val pendingResult = goAsync()

        Thread {
            try {
                val client = OkHttpClient()
                val body = """{"requestId":"$requestId","decision":"$decision"}"""
                    .toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("${prefs.serverUrl}/api/response")
                    .header("Authorization", "Bearer ${prefs.apiKey}")
                    .post(body)
                    .build()
                client.newCall(request).execute().close()
            } finally {
                pendingResult.finish()
            }
        }.start()
    }
}
```

### 7. AppPreferences.kt

```kotlin
class AppPreferences(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "shooter_prefs",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var serverUrl: String?
        get() = prefs.getString("server_url", null)
        set(value) = prefs.edit().putString("server_url", value).apply()

    var apiKey: String?
        get() = prefs.getString("api_key", null)
        set(value) = prefs.edit().putString("api_key", value).apply()

    var fcmToken: String?
        get() = prefs.getString("fcm_token", null)
        set(value) = prefs.edit().putString("fcm_token", value).apply()
}
```

---

## Server-Side Changes

Only one change needed: add FCM sender alongside existing APNs.

### New module: `src/lib/modules/server/fcm/`

- Install `firebase-admin` npm package
- Create `FCMService` that sends **data-only messages** (required for interactive notifications on Android)
- Route `/api/notify` based on `DEVICE_PLATFORM` env var (`ios` or `android`)

### New env vars:

```bash
DEVICE_PLATFORM=android              # 'ios' or 'android'
FCM_PROJECT_ID=shooter-xxxxx
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@...
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

**Everything else stays the same** -- the WebView loads the same web dashboard, which already talks to all the existing endpoints.

---

## Implementation Order

```
Step 1 ─── Scaffold Android project (Gradle, manifest, icons)
Step 2 ─── SetupActivity (server URL, API key, health check)
Step 3 ─── MainActivity with WebView (load dashboard URL)
Step 4 ─── Firebase setup (google-services.json, FCM service)
Step 5 ─── Receive & display notifications
Step 6 ─── Interactive Allow/Deny actions + POST /api/response
Step 7 ─── Server: add FCM sender module
Step 8 ─── POST_NOTIFICATIONS permission (Android 13+)
Step 9 ─── Polish (deep links from notifications, back nav, icons)
```

---

## iOS Parity Note

The iOS app currently does NOT have the WebView either -- it was planned (commit `0ab1b87`) but never shipped. To complete the original vision, the iOS app should also get a WKWebView tab that loads the same dashboard URL. Both apps then become:

- **Native**: push notification handling (APNs / FCM)
- **WebView**: everything else (same responsive web dashboard)

This keeps the apps thin and lets us iterate on the dashboard once for all platforms (web, iOS, Android).
