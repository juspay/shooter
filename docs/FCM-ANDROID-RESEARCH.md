# FCM for Android - Research Document

Research covering Firebase Cloud Messaging (FCM) as the Android equivalent to the existing Apple Push Notifications (APNs) implementation in Shooter.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [FCM Setup - Firebase Project and Dependencies](#2-fcm-setup)
3. [Token Registration](#3-token-registration)
4. [Message Types - Data vs Notification](#4-message-types)
5. [Interactive Notifications - Action Buttons](#5-interactive-notifications)
6. [Notification Channels (Android 8+)](#6-notification-channels)
7. [Background Handling](#7-background-handling)
8. [Server-Side Changes](#8-server-side-changes)
9. [FCM HTTP v1 API](#9-fcm-http-v1-api)
10. [Replicating iOS Notification Categories](#10-replicating-ios-notification-categories)
11. [Permission Handling (Android 13+)](#11-permission-handling)
12. [Deep Linking](#12-deep-linking)
13. [Token Refresh](#13-token-refresh)
14. [iOS-to-Android Feature Mapping](#14-ios-to-android-feature-mapping)

---

## 1. Architecture Overview

### Current iOS Architecture

```
Claude hooks (notifier.cjs)
    --> POST /api/notify (SvelteKit server)
        --> LibraryAPNsService (@parse/node-apn)
            --> Apple APNs gateway
                --> iOS device

iOS device action (Allow/Deny)
    --> POST /api/response (SvelteKit server)
        --> pending-requests store
            --> notifier.cjs polls GET /api/response?requestId=xxx
```

### Proposed Android Architecture

```
Claude hooks (notifier.cjs)
    --> POST /api/notify (SvelteKit server)
        --> PushDispatcher (routes to correct service based on device platform)
            --> LibraryAPNsService (iOS, existing)
            --> FCMService (Android, new -- uses firebase-admin SDK)
                --> FCM HTTP v1 API
                    --> Android device

Android device action (Allow/Deny)
    --> POST /api/response (SvelteKit server)
        --> pending-requests store (same as iOS, no changes needed)
            --> notifier.cjs polls GET /api/response?requestId=xxx
```

### Key Architectural Decision: Direct FCM vs FCM-for-iOS-too

There are two possible approaches:

**Option A: Keep APNs direct + add FCM for Android only (recommended)**

- Existing iOS APNs path stays unchanged (proven, working)
- New FCM path added only for Android devices
- Server maintains two sender modules side by side
- No Firebase SDK needed in the iOS app

**Option B: Route everything through FCM (both iOS and Android)**

- FCM can proxy iOS notifications through APNs automatically
- Simplifies server to a single sender API
- Requires adding Firebase SDK to the iOS app and uploading the APNs key to Firebase console
- Adds a dependency on Firebase/Google infrastructure for iOS delivery

Option A is recommended because the iOS app already works with direct APNs, and adding Firebase to iOS introduces an unnecessary dependency. The server can abstract the platform difference behind a common dispatcher interface.

---

## 2. FCM Setup

### Firebase Project Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Add an Android app to the project with the package name (e.g., `in.juspay.shooter`)
3. Download the `google-services.json` file and place it in the Android app's `app/` directory
4. Generate a **service account private key** (Project Settings > Service accounts > Generate new private key) -- this JSON file is used by the Node.js server

### Android App Dependencies

```kotlin
// project-level build.gradle.kts
plugins {
    id("com.google.gms.google-services") version "4.4.2" apply false
}

// app-level build.gradle.kts
plugins {
    id("com.google.gms.google-services")
}

dependencies {
    // Firebase BoM (Bill of Materials) -- manages versions
    implementation(platform("com.google.firebase:firebase-bom:33.8.0"))

    // Firebase Cloud Messaging
    implementation("com.google.firebase:firebase-messaging-ktx")

    // WorkManager for reliable background processing
    implementation("androidx.work:work-runtime-ktx:2.10.0")
}
```

### Server-Side Dependency

```bash
pnpm add firebase-admin
```

The `firebase-admin` package (use a current stable version) provides `getMessaging().send()` for the FCM HTTP v1 API. It handles OAuth 2.0 token management automatically.

### Environment Variables (new, for server)

```env
# Firebase service account JSON (file path or inline JSON)
FCM_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
# OR inline:
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}

# Android device token (FCM registration token)
FCM_DEVICE_TOKEN=<fcm-registration-token>
```

---

## 3. Token Registration

### APNs (iOS) - Current

```swift
// AppDelegate.swift
func application(_ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
    // token is a hex string like "a1b2c3d4..."
}
```

### FCM (Android) - Equivalent

```kotlin
class ShooterFirebaseMessagingService : FirebaseMessagingService() {

    // Called when a new FCM token is generated
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "New token: $token")
        // Send token to your server
        sendTokenToServer(token)
    }

    private fun sendTokenToServer(token: String) {
        // POST to your server endpoint to register this device
        // Same pattern as iOS sending its device token
    }
}
```

To retrieve the token on demand (e.g., on app launch):

```kotlin
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (task.isSuccessful) {
        val token = task.result
        // token is a string like "dGhpcyBpcyBhIHRva2Vu..."
        Log.d("FCM", "Current token: $token")
    }
}
```

### Key Differences from APNs

| Aspect              | APNs (iOS)                                              | FCM (Android)                                     |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Token format        | Hex-encoded binary (64 chars)                           | Opaque string (~163 chars)                        |
| Token source        | `didRegisterForRemoteNotificationsWithDeviceToken`      | `FirebaseMessagingService.onNewToken()`           |
| On-demand retrieval | Not directly available                                  | `FirebaseMessaging.getInstance().token`           |
| Token rotation      | Rare (app reinstall, device restore)                    | More frequent (security rotation, app data clear) |
| Registration call   | `UIApplication.shared.registerForRemoteNotifications()` | Automatic on app start (Firebase SDK handles it)  |

---

## 4. Message Types

FCM has two fundamentally different message types. The choice matters for interactive notifications.

### Notification Messages

```json
{
  "message": {
    "token": "<device-token>",
    "notification": {
      "title": "SHOOTER: Session Complete",
      "body": "Claude finished working on feature X"
    }
  }
}
```

- Automatically displayed by the system when app is in background
- `onMessageReceived()` is called ONLY when app is in foreground
- **Cannot** add custom action buttons when delivered automatically
- Good for simple informational alerts

### Data Messages

```json
{
  "message": {
    "token": "<device-token>",
    "data": {
      "title": "SHOOTER: Permission Request",
      "body": "Claude wants to run: rm -rf node_modules",
      "type": "permission_request",
      "requestId": "abc123",
      "toolName": "Bash",
      "category": "CLAUDE_PERMISSION"
    }
  }
}
```

- Delivered to `onMessageReceived()` in foreground and background, but **not guaranteed** if the user has force-stopped the app or OEM battery optimization has killed the process
- App is responsible for creating and displaying the notification
- **Can** add custom action buttons, RemoteInput, etc.
- Full control over notification appearance and behavior
- **Required for interactive notifications (Allow/Deny buttons)**

### Recommendation for Shooter

Use **data-only messages** for all notifications. This matches the iOS approach where the `category` field controls what actions appear, and gives the Android app full control over notification construction.

The server should send:

- **Permission requests**: data message with `category: "CLAUDE_PERMISSION"` and `requestId`
- **Informational notifications**: data message with notification content (title, body, type, metadata)

The Android app's `onMessageReceived()` handler inspects the `category` field and constructs the appropriate notification with or without action buttons.

---

## 5. Interactive Notifications

### iOS - Current Implementation

```swift
// Config.swift
struct Actions {
    static let allow = "ALLOW_ACTION"
    static let deny = "DENY_ACTION"
}
struct Categories {
    static let permission = "CLAUDE_PERMISSION"
}

// NotificationManager.swift
let allowAction = UNNotificationAction(identifier: "ALLOW_ACTION", title: "Allow",
    options: [.authenticationRequired])
let denyAction = UNNotificationAction(identifier: "DENY_ACTION", title: "Deny",
    options: [.destructive])
let permissionCategory = UNNotificationCategory(identifier: "CLAUDE_PERMISSION",
    actions: [allowAction, denyAction], intentIdentifiers: [], options: [])
```

### Android - Equivalent

```kotlin
// In FirebaseMessagingService.onMessageReceived():

private fun showPermissionNotification(data: Map<String, String>) {
    val requestId = data["requestId"] ?: return
    val toolName = data["toolName"] ?: "Unknown"
    val title = data["title"] ?: "SHOOTER: Permission Request"
    val body = data["body"] ?: "Claude wants to use: $toolName"

    // Allow action -- BroadcastReceiver handles it
    val allowIntent = Intent(this, NotificationActionReceiver::class.java).apply {
        action = "ALLOW_ACTION"
        putExtra("requestId", requestId)
    }
    val allowPending = PendingIntent.getBroadcast(
        this, requestId.hashCode(),
        allowIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    // Deny action
    val denyIntent = Intent(this, NotificationActionReceiver::class.java).apply {
        action = "DENY_ACTION"
        putExtra("requestId", requestId)
    }
    val denyPending = PendingIntent.getBroadcast(
        this, requestId.hashCode() + 1,
        denyIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(this, PERMISSION_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .addAction(R.drawable.ic_allow, "Allow", allowPending)
        .addAction(R.drawable.ic_deny, "Deny", denyPending)
        .setAutoCancel(true)
        .build()

    NotificationManagerCompat.from(this).notify(requestId.hashCode(), notification)
}
```

### BroadcastReceiver for Action Handling

```kotlin
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra("requestId") ?: return
        val decision = when (intent.action) {
            "ALLOW_ACTION" -> "allow"
            "DENY_ACTION" -> "deny"
            else -> return
        }

        // Dismiss the notification
        NotificationManagerCompat.from(context).cancel(requestId.hashCode())

        // Send decision to server (same endpoint as iOS)
        // POST /api/response { requestId, decision }
        sendPermissionResponse(context, requestId, decision)
    }

    private fun sendPermissionResponse(context: Context, requestId: String, decision: String) {
        // Use WorkManager or coroutine to POST to server
        // Endpoint: /api/response
        // Body: { "requestId": requestId, "decision": decision }
        // Header: Authorization: Bearer <apiKey>
    }
}
```

### Text Input (Direct Reply) from Notifications

Android supports inline text reply via `RemoteInput`, equivalent to iOS text input notification actions:

```kotlin
val remoteInput = RemoteInput.Builder("reply_key")
    .setLabel("Type a response...")
    .build()

val replyAction = NotificationCompat.Action.Builder(
    R.drawable.ic_reply, "Reply", replyPending
)
    .addRemoteInput(remoteInput)
    .build()

// In the BroadcastReceiver:
val results = RemoteInput.getResultsFromIntent(intent)
val replyText = results?.getCharSequence("reply_key")?.toString()
```

---

## 6. Notification Channels

Android 8.0 (API 26) and higher require notification channels. Each notification must be assigned to a channel. Users can control per-channel settings (sound, vibration, importance).

### Channel Setup (in Application class or on first launch)

```kotlin
object NotificationChannels {
    const val PERMISSION_CHANNEL_ID = "shooter_permissions"
    const val EVENTS_CHANNEL_ID = "shooter_events"
    const val SESSIONS_CHANNEL_ID = "shooter_sessions"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(NotificationManager::class.java)

            // Permission requests -- high importance (heads-up notification)
            val permissionChannel = NotificationChannel(
                PERMISSION_CHANNEL_ID,
                "Permission Requests",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Claude permission requests requiring Allow/Deny response"
                enableVibration(true)
                setShowBadge(true)
            }

            // Session events -- default importance
            val eventsChannel = NotificationChannel(
                EVENTS_CHANNEL_ID,
                "Session Events",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Tool usage, completions, and session activity"
            }

            // Session lifecycle -- low importance
            val sessionsChannel = NotificationChannel(
                SESSIONS_CHANNEL_ID,
                "Session Lifecycle",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Session start/end notifications"
            }

            notificationManager.createNotificationChannels(
                listOf(permissionChannel, eventsChannel, sessionsChannel)
            )
        }
    }
}
```

### Importance Levels Mapping

| iOS Sound/Alert Behavior | Android Importance   | Behavior                     |
| ------------------------ | -------------------- | ---------------------------- |
| Critical alert           | `IMPORTANCE_HIGH`    | Heads-up notification, sound |
| Default (sound + banner) | `IMPORTANCE_DEFAULT` | Sound, status bar            |
| No sound                 | `IMPORTANCE_LOW`     | No sound, status bar only    |
| Silent                   | `IMPORTANCE_MIN`     | No sound, no status bar      |

### Key Rules

- Once created, the app cannot change a channel's importance level -- only the user can
- If a channel is deleted and recreated with the same ID, it retains the user's previous settings
- Apps targeting Android 8+ that post without a channel will have notifications dropped silently

---

## 7. Background Handling

### iOS - Current Behavior

iOS handles background notifications automatically. The `willPresent` delegate shows notifications when the app is in the foreground, and `didReceive` handles tapped notifications regardless of app state.

### Android - FirebaseMessagingService

```kotlin
class ShooterFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Data messages are delivered here while the app is in the foreground or background.
        // WARNING: Delivery is NOT guaranteed when the app has been force-killed by the
        // user, killed by the OS under memory pressure, or killed by OEM-specific battery
        // optimization (e.g., Xiaomi, Samsung, Huawei aggressive app killers). This
        // applies to ALL Android OEMs, not just AOSP. See https://dontkillmyapp.com/
        if (remoteMessage.data.isNotEmpty()) {
            val category = remoteMessage.data["category"]

            when (category) {
                "CLAUDE_PERMISSION" -> showPermissionNotification(remoteMessage.data)
                else -> showInfoNotification(remoteMessage.data)
            }

            // Store in local notification history
            saveToHistory(remoteMessage.data)
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        sendTokenToServer(token)
    }
}
```

### Manifest Registration

```xml
<service
    android:name=".ShooterFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### Important Constraints

- `onMessageReceived()` must complete within **10 seconds**
- For longer processing, use `WorkManager` to schedule background work:

```kotlin
override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // Quick: show notification immediately
    showNotification(remoteMessage.data)

    // Deferred: schedule background work if needed
    val workRequest = OneTimeWorkRequestBuilder<NotificationProcessingWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setInputData(workDataOf("data" to remoteMessage.data.toString()))
        .build()
    WorkManager.getInstance(this).enqueue(workRequest)
}
```

### Data Messages vs Notification Messages in Background

| Message Type         | App in Foreground     | App in Background                          | App Killed                             |
| -------------------- | --------------------- | ------------------------------------------ | -------------------------------------- |
| Notification message | `onMessageReceived()` | System tray (auto)                         | System tray (auto)                     |
| Data message         | `onMessageReceived()` | `onMessageReceived()`                      | `onMessageReceived()`\* (with caveats) |
| Both                 | `onMessageReceived()` | System tray (notification), data in extras | System tray, data in extras            |

_\*Caveats: data messages are **not** delivered if (a) the user **force-stops** the app (Settings > Apps > Force Stop), (b) aggressive OEM battery optimization kills the process (common on Xiaomi, Samsung, Huawei), or (c) the system reclaims the process under heavy memory pressure. Force-stop puts the app in a "stopped state" where no broadcasts, alarms, or FCM messages arrive until the user manually re-launches. Regular swipe-away from recents does **not** trigger this restriction._

This is why **data-only messages are essential** for the permission flow -- they reach `onMessageReceived()` as long as the app has not been force-stopped, allowing the app to construct notifications with action buttons.

---

## 8. Server-Side Changes

### New Module: `src/lib/modules/server/fcm/`

The server needs a new FCM sender module alongside the existing APNs module.

#### File Structure

```
src/lib/modules/server/
  apn/                    # existing, unchanged
    library-apns.ts
    types.ts
    pending-requests.ts   # shared between APNs and FCM
    notification-history.ts
    notification-sessions.ts
  fcm/                    # new
    fcm-service.ts        # FCM sender using firebase-admin
    types.ts              # FCM-specific types
  push/                   # new, optional dispatcher layer
    push-dispatcher.ts    # routes to APNs or FCM based on platform
    types.ts
```

#### FCM Service Implementation

```typescript
// src/lib/modules/server/fcm/fcm-service.ts
import admin from 'firebase-admin';
import type { Message } from 'firebase-admin/messaging';

export class FCMService {
  private configured = false;
  private app: admin.app.App | null = null;

  constructor() {
    try {
      const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
      const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;

      let credential: admin.credential.Credential;

      if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson);
        credential = admin.credential.cert(serviceAccount);
      } else if (serviceAccountPath) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const serviceAccount = require(serviceAccountPath);
        credential = admin.credential.cert(serviceAccount);
      } else {
        console.error('[fcm] Missing FCM_SERVICE_ACCOUNT_PATH or FCM_SERVICE_ACCOUNT_JSON');
        return;
      }

      this.app = admin.initializeApp({ credential });
      this.configured = true;
      console.log('[fcm] Firebase Admin initialized');
    } catch (error) {
      const err = error as Error;
      console.error('[fcm] Failed to initialize:', err.message);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: {
      body: string;
      category?: string;
      data?: Record<string, string>;
      title: string;
    }
  ): Promise<{ error?: string; messageId?: string; success: boolean }> {
    if (!this.configured || !this.app) {
      throw new Error('FCM service not configured');
    }

    // Always use data messages for full control over notification display
    const message: Message = {
      token: deviceToken,
      data: {
        title: payload.title,
        body: payload.body,
        ...(payload.category && { category: payload.category }),
        ...payload.data,
      },
      android: {
        priority: 'high' as const,
        // TTL: 5 minutes for permission requests, 1 hour for others
        ttl: payload.category === 'CLAUDE_PERMISSION' ? 300000 : 3600000,
      },
    };

    try {
      const messageId = await admin.messaging().send(message);
      return { success: true, messageId };
    } catch (error) {
      const err = error as Error;
      console.error(`[fcm] Send failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
```

#### Push Dispatcher (routes to correct service)

```typescript
// src/lib/modules/server/push/push-dispatcher.ts

import { LibraryAPNsService } from '../apn/library-apns';
import { FCMService } from '../fcm/fcm-service';

export type Platform = 'android' | 'ios';

export interface DeviceRegistration {
  platform: Platform;
  token: string;
}

export class PushDispatcher {
  private apns: LibraryAPNsService;
  private fcm: FCMService;

  constructor(apns: LibraryAPNsService, fcm: FCMService) {
    this.apns = apns;
    this.fcm = fcm;
  }

  async send(device: DeviceRegistration, payload: NotificationPayload) {
    if (device.platform === 'ios') {
      return this.apns.sendNotification(device.token, payload);
    } else {
      return this.fcm.sendNotification(device.token, {
        title: payload.title,
        body: payload.body ?? payload.message ?? '',
        category: payload.category ?? undefined,
        data: serializeData(payload.data),
      });
    }
  }
}
```

### Changes to `/api/notify`

The notify endpoint currently hardcodes `DEVICE_TOKEN` and always sends via APNs. To support both platforms:

1. Add `DEVICE_PLATFORM` env var (or detect from token format)
2. Use the `PushDispatcher` instead of direct `LibraryAPNsService`
3. Alternatively, support multiple devices with a device registry

Minimal change approach (env-var based):

```typescript
// In /api/notify/+server.ts
const platform = env.DEVICE_PLATFORM ?? 'ios'; // default to iOS for backward compat
const deviceToken = platform === 'android'
  ? env.FCM_DEVICE_TOKEN?.trim()
  : env.DEVICE_TOKEN?.trim();

if (platform === 'android') {
  const result = await fcmClient.sendNotification(deviceToken, { ... });
} else {
  const result = await apnsClient.sendNotification(deviceToken, { ... });
}
```

### No Changes Needed

The following server components need **no changes** for FCM support:

- `/api/response` endpoint -- Android app posts to the same endpoint with `{ requestId, decision }`
- `pending-requests.ts` -- platform-agnostic, stores requestId/decision pairs
- `notification-history.ts` -- platform-agnostic
- `notification-sessions.ts` -- platform-agnostic
- `notifier.cjs` -- polls `/api/response` regardless of which platform the notification was sent to
- WebSocket server, terminal subsystem, session watcher -- all independent of push notification transport

---

## 9. FCM HTTP v1 API

### Endpoint

```
POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
Authorization: Bearer {oauth2_access_token}
Content-Type: application/json
```

### Message Structure

```json
{
  "message": {
    "token": "device-registration-token",
    "data": {
      "title": "SHOOTER: Permission Request",
      "body": "Claude wants to run: npm install",
      "requestId": "abc123",
      "toolName": "Bash",
      "category": "CLAUDE_PERMISSION",
      "source": "fcm-api",
      "timestamp": "2026-03-19T10:30:00Z"
    },
    "android": {
      "priority": "HIGH",
      "ttl": "300s"
    }
  }
}
```

### Authentication

The firebase-admin SDK handles OAuth 2.0 token generation and refresh automatically using the service account credentials. When using the SDK's `getMessaging().send()`, you never need to manage tokens manually.

### Deprecated APIs (avoid)

- Legacy FCM HTTP API (`https://fcm.googleapis.com/fcm/send`) -- **deprecated, do not use**
- `sendAll()` and `sendMulticast()` in firebase-admin -- **deprecated, use `sendEach()` / `sendEachForMulticast()` instead**

### Rate Limits

- Per-device: ~240 messages/minute, ~5,000 messages/hour
- Per-project: varies by plan, but generous for this use case
- Messages to offline devices are stored for up to 28 days

---

## 10. Replicating iOS Notification Categories

### iOS Approach

iOS uses `UNNotificationCategory` objects registered at app launch. Each category has a set of `UNNotificationAction` items. The server sets `aps.category` in the push payload, and iOS matches it to the registered category to show the correct actions.

### Android Equivalent

Android does not have a built-in "notification category" registry that maps to action buttons. Instead, the app constructs notifications programmatically based on data in the message payload.

The pattern:

```kotlin
// Map from data message "category" field to notification construction
fun buildNotification(data: Map<String, String>): Notification {
    val category = data["category"]
    val builder = NotificationCompat.Builder(context, getChannelForCategory(category))
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(data["title"])
        .setContentText(data["body"])

    when (category) {
        "CLAUDE_PERMISSION" -> {
            // Add Allow/Deny action buttons
            builder.addAction(allowAction(data["requestId"]))
            builder.addAction(denyAction(data["requestId"]))
            builder.setPriority(NotificationCompat.PRIORITY_HIGH)
            builder.setCategory(NotificationCompat.CATEGORY_ALARM)
        }
        "BUILD_STATUS" -> {
            // Add "View" action button
            builder.addAction(viewAction(data))
            builder.setPriority(NotificationCompat.PRIORITY_DEFAULT)
        }
        else -> {
            // Informational -- no action buttons
            builder.setPriority(NotificationCompat.PRIORITY_DEFAULT)
        }
    }

    return builder.build()
}

fun getChannelForCategory(category: String?): String {
    return when (category) {
        "CLAUDE_PERMISSION" -> NotificationChannels.PERMISSION_CHANNEL_ID
        else -> NotificationChannels.EVENTS_CHANNEL_ID
    }
}
```

### Mapping Table

| iOS Category          | iOS Actions                               | Android Equivalent                                                                                             |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_PERMISSION`   | Allow (auth required), Deny (destructive) | `addAction("Allow", allowPendingIntent)` + `addAction("Deny", denyPendingIntent)` on `IMPORTANCE_HIGH` channel |
| Default (no category) | Tap to open                               | `setContentIntent(openAppPendingIntent)` on `IMPORTANCE_DEFAULT` channel                                       |

---

## 11. Permission Handling

### iOS - Current

```swift
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
```

iOS has always required permission for notifications. The prompt appears once; subsequent calls check cached status.

### Android 13+ (API 33) - POST_NOTIFICATIONS

Android 13 introduced the `POST_NOTIFICATIONS` runtime permission. Prior to Android 13, notification permission was granted implicitly at install time.

#### Manifest Declaration

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

#### Runtime Permission Request

```kotlin
class MainActivity : ComponentActivity() {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Permission granted -- notifications will be delivered
        } else {
            // Permission denied -- show rationale or guide to settings
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Already granted
                }
                shouldShowRequestPermissionRationale(
                    Manifest.permission.POST_NOTIFICATIONS
                ) -> {
                    // Show UI explaining why notifications matter
                    showPermissionRationale()
                }
                else -> {
                    requestPermissionLauncher.launch(
                        Manifest.permission.POST_NOTIFICATIONS
                    )
                }
            }
        }
    }
}
```

#### Best Practices

- Request at a contextually relevant moment (e.g., after user sets up server connection)
- Explain the value before showing the system dialog
- Handle "Don't ask again" gracefully by guiding to Settings
- Apps upgrading to Android 13 on existing devices get permission auto-granted if they had existing notification channels

---

## 12. Deep Linking

### iOS - Current

The iOS app handles tapped notifications in `didReceive response:`, extracting `userInfo` and navigating based on notification type.

### Android - PendingIntent with Deep Links

```kotlin
// Open specific screen when notification is tapped
private fun createContentIntent(data: Map<String, String>): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        // Pass data for deep linking
        putExtra("screen", data["type"]) // e.g., "session", "terminal", "permission"
        putExtra("sessionId", data["sessionId"])
        putExtra("requestId", data["requestId"])
    }

    return PendingIntent.getActivity(
        this, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}

// Use with notification
builder.setContentIntent(createContentIntent(data))
```

### With Jetpack Compose Navigation

```kotlin
// In MainActivity, handle the deep link intent
val intent = intent
val screen = intent.getStringExtra("screen")
val sessionId = intent.getStringExtra("sessionId")

// Navigate using NavController
when (screen) {
    "session" -> navController.navigate("session/$sessionId")
    "terminal" -> navController.navigate("terminals")
    "permission" -> navController.navigate("permissions/$requestId")
    else -> navController.navigate("home")
}
```

### With TaskStackBuilder (proper back stack)

```kotlin
val resultIntent = Intent(this, SessionDetailActivity::class.java).apply {
    putExtra("sessionId", sessionId)
}

val pendingIntent = TaskStackBuilder.create(this).run {
    addNextIntentWithParentStack(resultIntent)
    getPendingIntent(0, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}
```

---

## 13. Token Refresh

### When FCM Tokens Change

- App is restored on a new device
- User uninstalls/reinstalls the app
- User clears app data
- FCM performs periodic security rotation
- Token becomes stale (270 days of inactivity, FCM marks it expired)

### Handling Token Refresh

```kotlin
class ShooterFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "Token refreshed: $token")

        // Store locally
        getSharedPreferences("shooter", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .putLong("fcm_token_timestamp", System.currentTimeMillis())
            .apply()

        // Send to server
        sendTokenToServer(token)
    }
}
```

### Best Practices

- Call `FirebaseMessaging.getInstance().token` on every app launch to check freshness
- Store a timestamp alongside the token; re-register monthly even if unchanged
- Server should handle `messaging/registration-token-not-registered` errors by marking the device as inactive
- On the server side, if a send fails with `UNREGISTERED`, remove or flag that token

### Comparison with APNs Token Lifecycle

| Aspect                        | APNs (iOS)                    | FCM (Android)                             |
| ----------------------------- | ----------------------------- | ----------------------------------------- |
| Token rotation frequency      | Rare                          | Periodic (security-driven)                |
| Stale token handling          | APNs returns `BadDeviceToken` | FCM returns `UNREGISTERED` after 270 days |
| Recommended refresh check     | On app launch                 | On app launch + monthly `getToken()` call |
| Server error on invalid token | HTTP 400 + `BadDeviceToken`   | HTTP 404 + `UNREGISTERED`                 |

---

## 14. iOS-to-Android Feature Mapping

Complete mapping of current iOS features to their Android equivalents:

| iOS Feature                      | iOS Implementation                                                     | Android Equivalent                                              | Notes                                       |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Push notification permission     | `UNUserNotificationCenter.requestAuthorization()`                      | `POST_NOTIFICATIONS` runtime permission (API 33+)               | Auto-granted below Android 13               |
| Device token registration        | `didRegisterForRemoteNotificationsWithDeviceToken`                     | `FirebaseMessagingService.onNewToken()`                         | FCM tokens are longer strings               |
| Notification categories          | `UNNotificationCategory` + `UNNotificationAction`                      | `NotificationCompat.Builder.addAction()` per notification       | No pre-registration; built per-notification |
| Allow/Deny buttons               | `UNNotificationAction` with `.authenticationRequired` / `.destructive` | `NotificationCompat.Action` with `PendingIntent.getBroadcast()` | Handled by `BroadcastReceiver`              |
| Text input from notification     | `UNTextInputNotificationAction`                                        | `RemoteInput.Builder` + `NotificationCompat.Action`             | Direct reply inline                         |
| Notification history (local)     | `UserDefaults` + `[NotificationItem]` Codable                          | `SharedPreferences` or Room database                            | Room recommended for larger datasets        |
| Background notification handling | Automatic via APNs + delegate                                          | `FirebaseMessagingService.onMessageReceived()`                  | Requires data-only messages                 |
| Foreground notification display  | `willPresent` delegate with `.banner, .sound, .badge`                  | Build notification in `onMessageReceived()`                     | Always manual with data messages            |
| Notification sound               | `UNNotificationSound.default`                                          | `NotificationChannel` sound setting                             | Per-channel in Android 8+                   |
| Badge count                      | `notification.badge = 1`                                               | `NotificationCompat.Builder.setNumber()`                        | Behavior varies by launcher                 |
| Server connection check          | `URLSession` GET to `/api/health`                                      | `OkHttp` / `Retrofit` GET to `/api/health`                      | Same endpoint                               |
| Permission response to server    | `URLSession` POST to `/api/response`                                   | `OkHttp` / `Retrofit` POST to `/api/response`                   | Same endpoint, same payload                 |
| Configuration storage            | `UserDefaults`                                                         | `SharedPreferences` or `DataStore`                              | DataStore is newer/preferred                |
| Notification tap handling        | `didReceive response:` delegate                                        | `PendingIntent` on notification + `Intent` extras               | Deep link via intent extras                 |

---

## Appendix: Server Environment Variables Summary

### Existing (iOS / APNs)

```env
API_KEY=           # Bearer token for hook -> server auth
APNS_KEY=          # APNs private key (.p8 contents)
APNS_KEY_ID=       # APNs key ID
APNS_TEAM_ID=      # Apple Team ID
APNS_BUNDLE_ID=    # iOS app bundle identifier
APNS_PRODUCTION=   # "true" for production APNs gateway
DEVICE_TOKEN=      # iOS APNs device token
```

### New (Android / FCM)

```env
FCM_SERVICE_ACCOUNT_PATH=   # Path to Firebase service account JSON file
# OR
FCM_SERVICE_ACCOUNT_JSON=   # Inline Firebase service account JSON
FCM_DEVICE_TOKEN=           # Android FCM registration token
DEVICE_PLATFORM=            # "ios" or "android" (default: "ios")
```

### Multi-Device Future (optional)

For supporting multiple devices simultaneously, replace single token env vars with a device registry (database or config file):

```json
{
  "devices": [
    { "id": "iphone-14", "platform": "ios", "token": "a1b2c3..." },
    { "id": "pixel-8", "platform": "android", "token": "dGhpcyBp..." }
  ]
}
```

---

## Sources

- [Send a Message using FCM HTTP v1 API](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
- [Send a Message using Firebase Admin SDK](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)
- [Your server environment and FCM](https://firebase.google.com/docs/cloud-messaging/server)
- [Migrate from legacy FCM APIs to HTTP v1](https://firebase.google.com/docs/cloud-messaging/migrate-v1)
- [REST Resource: projects.messages](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
- [firebase-admin on npm](https://www.npmjs.com/package/firebase-admin)
- [firebase-admin.messaging package](https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging)
- [Get started with FCM in Android apps](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [Best practices for FCM registration token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)
- [Receive messages in Android apps](https://firebase.google.com/docs/cloud-messaging/android/receive-messages)
- [Create and manage notification channels](https://developer.android.com/develop/ui/views/notifications/channels)
- [About notifications](https://developer.android.com/develop/ui/views/notifications)
- [Create a notification](https://developer.android.com/develop/ui/views/notifications/build-notification)
- [Notification runtime permission (Android 13)](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Start an Activity from a Notification](https://developer.android.com/develop/ui/views/notifications/navigation)
- [Create a deep link for a destination](https://developer.android.com/guide/navigation/design/deep-link)
- [Customize messages across platforms](https://firebase.google.com/docs/cloud-messaging/customize-messages/cross-platform)
- [Get started with FCM in Apple platform apps](https://firebase.google.com/docs/cloud-messaging/ios/get-started)
- [Managing Cloud Messaging Tokens](https://firebase.blog/posts/2023/04/managing-cloud-messaging-tokens/)
- [FCM Admin Node.js SDK Discussion #2518](https://github.com/firebase/firebase-admin-node/discussions/2518)
- [node-pushnotifications](https://github.com/appfeel/node-pushnotifications)
