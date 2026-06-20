# Multi-Device Push Notification Support — Design & Implementation Plan

## 1. Executive Summary

- **Storage overhaul**: The flat `~/.shooter/device-tokens.json` shape `{ ios?: string, android?: string }` (one token per platform) is replaced with a `device_tokens` table in the existing `~/.shooter/shooter.db` (better-sqlite3, WAL mode), storing one row per registered device with metadata for stale-token pruning and admin display.
- **Fan-out dispatch**: `POST /api/notify` currently resolves a single token per call (`src/routes/api/notify/+server.ts:540` for iOS, `:461-463` for Android); it is rewritten to query all active rows for each platform and deliver concurrently via `Promise.allSettled` for APNs (N curl invocations) and `sendEachForMulticast` for FCM.
- **Stale-token pruning**: APNs responses `BadDeviceToken` (HTTP 400, unless environment mismatch) and `Unregistered` (HTTP 410, with timestamp guard) and FCM error `messaging/registration-token-not-registered` trigger immediate row deactivation; transient errors do not. `messaging/invalid-argument` is logged but never pruned (ambiguous signal).
- **Native app updates**: Both iOS (`NotificationManager.swift`) and Android (`ShooterFirebaseService.kt`) must send `deviceId` (stable UUID) and `deviceName` alongside the push token on registration, enabling the server to upsert by `(deviceId, platform)` on token rotation rather than accumulating duplicates.
- **Full backward compatibility**: `DEVICE_TOKEN` and `ANDROID_DEVICE_TOKEN` env vars continue to work as single-element seed fallbacks; old app versions that omit `deviceId` fall back to token-keyed upsert; `DEVICE_PLATFORM` is preserved as a delivery filter, not removed.
- **Notifier polling fix**: The `startPolling` function in `notifier.cjs` is updated to treat a `status === 'not_found'` poll response and an HTTP 404 as terminal "already decided by another device" signals, preventing the 120-second hang when all tokens are dead or a second device answers first.
- **Inter-PR atomicity**: The `process.env.DEVICE_TOKEN = token` mutation removal and the notify fan-out rewrite ship in the **same PR** to eliminate a regression window where new registrations would silently drop iOS delivery.

---

## 2. Goals & Non-Goals

### Goals

- Support any number of simultaneously-registered iOS and Android devices per server instance.
- Fan out every notification to all active registered devices on all configured platforms simultaneously.
- Prune dead tokens automatically on APNs/FCM delivery failure (lazy pruning), plus a periodic startup cleanup.
- Preserve complete backward compatibility: existing `.env`-only deployments with `DEVICE_TOKEN` set work without any reconfiguration.
- Expose a device list in `/config` so the user can see registered devices and manually remove them.
- Maintain the first-responder-wins semantics for bidirectional permission requests (`waitForResponse`), with graceful second-device handling in both iOS and notifier.cjs.

### Non-Goals

- APNs Broadcast Push (channel-based): out of scope; this feature targets authenticated personal devices.
- Push-to-arbitrary-users or multi-tenant device routing.
- Notification history per device (existing single-history table is unchanged; aggregate sent/failed counts may be added).
- Rate limiting or maximum device count enforcement (acceptable for a personal tool; noted as a future concern).
- Replacing the curl-based APNs transport with a native HTTP/2 client (the Node 24 TLS issue documented in `CLAUDE.md` blocks this).
- Mixed sandbox+production APNs tokens on the same server instance — the server's `APNS_PRODUCTION` setting determines the gateway for all deliveries; both gateway types in a single instance require two `LibraryAPNsService` singletons (future enhancement).

---

## 3. Current Single-Device Architecture

### Registration → Storage → Notify → Transport → Device

**Registration** (`src/routes/api/device-token/+server.ts`)

The iOS app (`ios/Shooter/Shooter/NotificationManager.swift:209`) and Android app (`android/.../ShooterFirebaseService.kt:40`) `POST /api/device-token` with body `{ deviceToken|token, platform, bundleId? }`. The handler:

1. `readTokens()` at `:12` reads `~/.shooter/device-tokens.json`, deserializing to `{ android?: string; ios?: string }`. Note: the JSON file is resolved from `join(homedir(), '.shooter')` hardcoded at `:9`, not via `shooterDataDir()` — this will be fixed in PR 2.
2. `tokens[platform] = token` at `:69` — unconditional overwrite; a second device registration silently clobbers the first.
3. For iOS only, `process.env.DEVICE_TOKEN = token` at `:79` — live mutation of the server process environment so that the next read of `env.DEVICE_TOKEN` inside `POST /api/notify` sees the new token without a server restart. This is the root cause of the single-device limitation and is removed in the fan-out PR (atomically with the notify rewrite).

**Storage**: `~/.shooter/device-tokens.json` — a JSON file written with `mode: 0o600`. Shape is `{ ios?: string; android?: string }`. No timestamps, no device identity, no failure counts. Read/written synchronously with `readFileSync`/`writeFileSync`.

**Notification dispatch** (`src/routes/api/notify/+server.ts`)

Token resolution per platform:

- **iOS** (`:540`): `requestDeviceToken?.trim() || env.DEVICE_TOKEN?.trim()` — the persisted file is **never consulted** for iOS; only the in-memory env var is used.
- **Android** (`:461-463`): `requestDeviceToken?.trim() || env.ANDROID_DEVICE_TOKEN?.trim() || readPersistedDeviceToken('android')` — the private helper at `:20-35` reads `parsed[platform]` as a single string.
- **Platform routing** (`:440`): `const platform = env.DEVICE_PLATFORM || 'ios'` — a binary switch; only one platform branch executes per request. When `DEVICE_PLATFORM` is unset, iOS is the hard default. The fan-out rewrite changes this to a per-platform boolean, which is a deliberate behavior change documented in Section 12.

**APNs transport** (`src/lib/modules/server/apn/library-apns.ts`)

`sendNotification(deviceToken: string, payload): Promise<APNsSendResult>` at `:81` delegates to private `deliver(deviceToken, body, pushType, priority)` at `:146` which calls `execFileAsync('curl')` with one URL `https://{host}/3/device/{deviceToken}`. Returns `APNsSendResult { sent: 1, failed: 0, success: true }` on HTTP 200. The `reason` from non-200 responses is logged but not surfaced as a structured field to the caller, and neither `httpStatus` nor `timestampMs` are returned — both are required for the stale-token classification logic added in PR 3.

**FCM transport** (`src/lib/modules/server/fcm/fcm-service.ts`)

`sendFCMNotification(deviceToken: string, payload)` at `:15` builds `admin.messaging.Message` with `token: deviceToken` (scalar, `:46`) and calls `admin.messaging(fcmApp).send(message)` (`:49`) — one HTTP call per invocation.

**Device**: Exactly one device receives each notification.

---

## 4. Target Multi-Device Architecture

### New End-to-End Flow

```
iOS/Android App                 Server                         Push Gateway
      |                            |                                 |
      |--- POST /api/device-token  |                                 |
      |    { token, platform,      |                                 |
      |      deviceId, deviceName, |                                 |
      |      appEnv }              |                                 |
      |                    upsert device_tokens                      |
      |                    ON CONFLICT(token)                        |
      |                    DO UPDATE last_seen_at                    |
      |<--- 200 { deviceId }       |                                 |
      |                            |                                 |
      |                     POST /api/notify                         |
      |                    (from notifier.cjs                        |
      |                     or any caller)                           |
      |                            |                                 |
      |                    dedup check (once,                        |
      |                    before fan-out)                           |
      |                            |                                 |
      |                    SELECT token FROM                         |
      |                    device_tokens                             |
      |                    WHERE is_active=1                         |
      |                    AND app_env=serverEnv                     |
      |                            |                                 |
      |                    ┌── iOS tokens ─────────────> APNs (curl x N, concurrent)
      |                    │   [t1, t2, t3]               api.{sandbox.}push.apple.com
      |                    │                                         |
      |                    └── Android tokens ──────────> FCM sendEachForMulticast
      |                        [t4, t5]                  (batch, 1 HTTP call)
      |                            |                                 |
      |                    collect Promise.allSettled                |
      |                    results                                   |
      |                            |                                 |
      |                    prune stale tokens                        |
      |                    (BadDeviceToken, Unregistered,            |
      |                     UNREGISTERED)                            |
      |                            |                                 |
      |<--- APNs push x N          |                                 |
      |<--- FCM data msg           |                                 |
      |                            |                                 |
      |--- (waitForResponse)       |                                 |
      |    POST /api/response      |                                 |
      |    { requestId, decision } |                                 |
      |                    first responder wins;                     |
      |                    subsequent responses                      |
      |                    get HTTP 404 'not_found'                  |
      |                    (treated as terminal success              |
      |                     by iOS app + notifier)                   |
```

### ASCII Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ~/.shooter/shooter.db                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  device_tokens  │  │  pending_requests│  │  terminal_store  │  │
│  │  id, token,     │  │  requestId,      │  │  (unchanged)     │  │
│  │  platform,      │  │  decision, ...   │  └──────────────────┘  │
│  │  device_id,     │  └──────────────────┘                        │
│  │  app_env,       │                                               │
│  │  is_active, ... │                                               │
│  └─────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
        ▲  read/write                         ▲  read/write
        │                                     │
┌───────┴──────────────────┐    ┌─────────────┴───────────────────┐
│  POST /api/device-token  │    │       POST /api/notify          │
│  upsert by token or      │    │  resolveTokens(platform)        │
│  (deviceId, platform)    │    │  → fan-out APNs (N curl)        │
│  GET  /api/device-token  │    │  → FCM sendEachForMulticast     │
│  DELETE /api/device-token│    │  → prune stale                  │
└──────────────────────────┘    └─────────────────────────────────┘
        ▲                                     ▲
        │  register                           │  notify
  iOS App / Android App              notifier.cjs hook / config page
```

---

## 5. Device Registry Data Model

### DeviceRecord Schema

```typescript
interface DeviceRecord {
  id: string; // UUID v4, server-generated on first insert via crypto.randomUUID()
  token: string; // APNs hex-64 or FCM registration token
  platform: 'ios' | 'android';
  app_env: 'sandbox' | 'production'; // APNs gateway selector; 'production' = api.push.apple.com
  device_id: string | null; // UIDevice.identifierForVendor (iOS) or stable UUID (Android); null for old apps
  friendly_name: string | null; // UIDevice.current.name / Build.MODEL
  bundle_id: string | null;
  registered_at: string; // ISO-8601, first registration
  last_seen_at: string; // ISO-8601, updated on every re-registration
  failure_count: number; // consecutive delivery failures
  is_active: number; // 1 = active, 0 = soft-deleted (pruned but auditable)
}
```

### SQLite DDL

```sql
CREATE TABLE IF NOT EXISTS device_tokens (
  id           TEXT PRIMARY KEY,
  token        TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
  app_env      TEXT NOT NULL DEFAULT 'sandbox'
                             CHECK(app_env IN ('sandbox', 'production')),
  device_id    TEXT,
  friendly_name TEXT,
  bundle_id    TEXT,
  registered_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE(token),
  UNIQUE(device_id, platform)   -- NULL != NULL in SQLite; multiple old-app rows with device_id=NULL are intentionally allowed
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_active
  ON device_tokens(platform, is_active);
```

**SQLite NULL semantics for `UNIQUE(device_id, platform)`**: SQLite follows the SQL standard where NULL is not equal to NULL for uniqueness purposes. This means multiple rows with `device_id = NULL` and the same platform coexist without violating the constraint. This is intentional — old app versions that omit `deviceId` register as separate rows, each keyed by token. The design relies on this behavior for backward compatibility.

### Storage Decision: SQLite (shooter.db), Not JSON File

The existing `~/.shooter/shooter.db` (opened by `src/lib/modules/server/terminal/terminal-store.ts:82-103` via better-sqlite3 with `db.pragma('journal_mode = WAL')`) is the correct substrate. Reasons:

- **Atomic upsert**: `INSERT ... ON CONFLICT(token) DO UPDATE` is a single atomic statement; `writeFileSync(JSON.stringify(...))` is not — a crash mid-write corrupts the file (the current `readTokens()` silently returns `{}` on parse failure, losing all registrations).
- **Concurrent-write safety**: WAL mode allows concurrent reads during a write; JSON file requires an exclusive lock.
- **Indexed fan-out queries**: `SELECT token FROM device_tokens WHERE platform='ios' AND is_active=1` is O(log n); the JSON file requires deserializing the entire file.
- **No new dependency**: better-sqlite3 is already in `package.json`; the `shooterDataDir()` utility already resolves `~/.shooter/shooter.db`.
- **Existing patterns to follow**: `terminal-store.ts` and `pending-requests.ts` provide the exact pattern (globalThis singleton, `migrate()` method for schema evolution, cleanup for TTL).

The JSON file approach is explicitly rejected because concurrent `/api/device-token` POSTs from two devices simultaneously would produce a last-write-wins race that silently drops one registration.

### Idempotent Upsert Logic

**Primary key**: `token` (UNIQUE constraint). Conflict action: update `last_seen_at`, reset `failure_count` to 0, set `is_active=1`, update `friendly_name` if provided.

**Token rotation** (same device, new APNs/FCM token after reinstall or OS upgrade): When the client includes `device_id`, a second conflict target `UNIQUE(device_id, platform)` is used. The rotation upsert is implemented as a two-step transaction to avoid ambiguous conflict resolution when both UNIQUE constraints could fire on the same INSERT:

```typescript
// Two-step transaction for token rotation (avoids ambiguous ON CONFLICT behavior
// when two UNIQUE constraints could both match on the same INSERT row)
db.transaction(() => {
  // Step 1: try rotation upsert (update token in-place for known device)
  const updated = db
    .prepare(
      `
    UPDATE device_tokens SET
      token         = ?,
      last_seen_at  = ?,
      failure_count = 0,
      is_active     = 1,
      friendly_name = COALESCE(?, friendly_name)
    WHERE device_id = ? AND platform = ?
  `
    )
    .run(token, now, friendlyName, deviceId, platform);

  if (updated.changes > 0) return; // rotation done

  // Step 2: fall through to token-keyed upsert (new device or no deviceId)
  // Guard: only update device_id if the conflicting row owns no device_id
  // or already owns this device_id, preventing identity theft.
  db.prepare(
    `
    INSERT INTO device_tokens
      (id, token, platform, app_env, device_id, friendly_name, bundle_id,
       registered_at, last_seen_at, failure_count, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
    ON CONFLICT(token) DO UPDATE SET
      last_seen_at  = excluded.last_seen_at,
      failure_count = 0,
      is_active     = 1,
      friendly_name = COALESCE(excluded.friendly_name, device_tokens.friendly_name),
      app_env       = excluded.app_env,
      device_id     = CASE
        WHEN device_tokens.device_id IS NULL
          OR device_tokens.device_id = excluded.device_id
        THEN excluded.device_id
        ELSE device_tokens.device_id  -- preserve existing owner; log a warning
      END
  `
  ).run(crypto.randomUUID(), token, platform, appEnv, deviceId, friendlyName, bundleId, now, now);
})();
```

The `ON CONFLICT(token) DO UPDATE ... WHERE device_tokens.device_id IS NULL OR device_tokens.device_id = excluded.device_id` guard prevents token identity theft: if device A's new APNs token coincidentally equals device B's current token (APNs does reuse tokens for reinstalled apps), the upsert preserves device B's identity rather than overwriting it with device A's `device_id`. A warning is logged when this case is detected.

### Migration from Legacy device-tokens.json

**Critical**: The migration renames `device-tokens.json` to `device-tokens.json.migrated`. The `readPersistedDeviceToken()` helper in `notify/+server.ts` reads the original filename. Because the migration and the notify fan-out ship in the **same PR** (PR 5, which merges the former PR 2 and PR 5 into one atomic change), there is no window where the file is renamed but the notify route still reads it.

For rollback safety: if the server is reverted after the migration has already renamed the file, re-registering devices via the mobile app will re-populate the registry. The `.migrated` file can be manually renamed back to `.json` to restore the old behavior if needed — document this in the rollback runbook.

```typescript
// In DeviceTokenStore.migrate() — runs at server startup via server.ts import
const legacyPath = path.join(shooterDataDir(), 'device-tokens.json');
if (existsSync(legacyPath)) {
  const raw = JSON.parse(readFileSync(legacyPath, 'utf8'));
  const now = new Date().toISOString();
  // Derive app_env from current server config — matches behavior before migration
  const legacyAppEnv = process.env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
  for (const platform of ['ios', 'android'] as const) {
    const value = raw[platform];
    if (!value) continue;
    // Support both legacy string and intermediate string[] shapes
    const tokens: string[] = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? [value]
        : [];
    for (const token of tokens) {
      if (token) {
        db.prepare(
          `INSERT OR IGNORE INTO device_tokens
          (id, token, platform, app_env, registered_at, last_seen_at, failure_count, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)`
        ).run(crypto.randomUUID(), token, platform, legacyAppEnv, now, now);
      }
    }
  }
  // Rename, not delete — preserve for rollback
  renameSync(legacyPath, legacyPath + '.migrated');
}
```

`app_env` is derived from `process.env.APNS_PRODUCTION` rather than hardcoded to `'sandbox'`. Users running in production mode (`APNS_PRODUCTION=true`) will have their migrated token marked `app_env='production'`, which matches the fan-out filter — silent zero-delivery after migration is prevented.

Additionally, `DEVICE_TOKEN` and `ANDROID_DEVICE_TOKEN` env vars are treated as seed fallbacks at runtime in `resolveTokens()` — they are never written to the DB unless the user explicitly POSTs them via the app. This means existing `.env`-only setups continue working forever without any migration step.

### Startup Import and Cleanup

`DeviceTokenStore` is **imported in `server.ts`** alongside the other singleton imports (around line 28–37), ensuring `migrate()` and `startupCleanup()` execute at server startup, not lazily on first request:

```typescript
// server.ts (add alongside existing singleton imports)
import { deviceTokenStore } from './src/lib/modules/server/push/device-token-store.js';
void deviceTokenStore; // ensure module is evaluated; migrate() runs in constructor
```

Without this, `DeviceTokenStore` would only be instantiated when the `/api/device-token` route is first accessed (lazy SvelteKit route loading), meaning cleanup and migration would not run at startup.

### Startup Cleanup SQL

```sql
-- Only delete INACTIVE rows older than 30 days.
-- Active rows are NOT expired by age — a device that hasn't re-registered for
-- 30 days but is still turned on should not lose notifications silently.
-- last_seen_at is also updated on every successful push delivery (not just re-registration)
-- to reflect actual activity and extend the TTL window.
DELETE FROM device_tokens
WHERE is_active = 0
  AND last_seen_at < datetime('now', '-30 days');
```

Active rows are never deleted by age alone. A device that is powered off, traveling, or simply hasn't launched the app in over 30 days will continue receiving notifications once it reconnects. The `last_seen_at` column is updated on every successful push delivery (not just re-registration) to keep the TTL clock running.

---

## 6. Registration & Deregistration

### POST /api/device-token Changes

**File**: `src/routes/api/device-token/+server.ts`

**Request body** (new fields added; all existing fields preserved):

```typescript
interface RegisterTokenBody {
  token?: string; // the push token (canonical name)
  deviceToken?: string; // iOS legacy alias; server normalizes to `token`
  platform: 'ios' | 'android';
  bundleId?: string;
  deviceId?: string; // NEW: stable UUID from UIDevice.identifierForVendor / Android prefs
  deviceName?: string; // NEW: UIDevice.current.name / Build.MODEL
  appEnv?: 'sandbox' | 'production'; // NEW: defaults to server APNS_PRODUCTION setting
}
```

**Handler changes**:

1. Replace `readTokens()`, `writeTokens()` with `DeviceTokenStore` methods.
2. Remove `process.env.DEVICE_TOKEN = token` (`:79`) — **this change ships atomically with PR 5 (fan-out rewrite) in a single PR to eliminate the regression window**.
3. Update `TOKENS_DIR` to use `shooterDataDir()` instead of `join(homedir(), '.shooter')` so `SHOOTER_HOME` overrides are honored consistently.
4. Call `deviceTokenStore.upsert(record)` which executes the two-step SQLite upsert described above.
5. Response: `{ success: true, deviceId: record.id, platform, timestamp }`.

### New GET /api/device-token

Returns the device list for the config UI. Auth-gated via `validateAuth(request)`.

```typescript
// Response (tokens masked for privacy — never return full tokens over the network)
{
  devices: Array<{
    id: string;
    platform: 'ios' | 'android';
    friendlyName: string | null;
    appEnv: 'sandbox' | 'production';
    registeredAt: string;
    lastSeenAt: string;
    isActive: boolean;
    tokenPrefix: string; // first 8 chars + '...' + last 4 chars
  }>;
}
```

### New DELETE /api/device-token

Body: `{ id: string }` (the registry row id, not the raw token, to avoid token exposure in HTTP bodies).

Executes `UPDATE device_tokens SET is_active=0 WHERE id=?`. Returns `{ success: true, removed: number }`.

### iOS App Changes (NotificationManager.swift)

**File**: `ios/Shooter/Shooter/NotificationManager.swift`

In `registerTokenWithServer(_:)` (`:209`), expand the JSON body:

```swift
let body: [String: Any] = [
    "deviceToken": token,
    "platform": "ios",
    "bundleId": Bundle.main.bundleIdentifier ?? AppConfig.bundleId,
    "deviceId": stableDeviceId(),    // NEW
    "deviceName": UIDevice.current.name,  // NEW
    "appEnv": buildEnvironment()     // NEW: 'sandbox' | 'production'
]

private func stableDeviceId() -> String {
    // UIDevice.identifierForVendor may be nil on background launch
    if let vendor = UIDevice.current.identifierForVendor?.uuidString {
        return vendor
    }
    // Keychain fallback for reinstall/background-nil scenario
    if let stored = KeychainHelper.read(key: "stableDeviceId") { return stored }
    let fallback = UUID().uuidString
    // Use KeychainHelper.save (not .write — which does not exist in KeychainHelper.swift)
    KeychainHelper.save(key: "stableDeviceId", value: fallback)
    return fallback
}

private func buildEnvironment() -> String {
    #if DEBUG
    return "sandbox"
    #else
    return "production"
    #endif
}
```

**`attemptDecisionResponse` fix for multi-device**: When a second device POSTs to `/api/response` after the first-responder has already consumed the pending request, `getDecision()` deletes the row and the server returns HTTP 404. Currently `attemptDecisionResponse` (`:302-333`) retries ALL non-2xx status codes including 404, causing up to 14 seconds of backoff (2s + 4s + 8s). Add a guard to treat 404 as a terminal success:

```swift
if let httpResponse = response as? HTTPURLResponse {
    if (200...299).contains(httpResponse.statusCode) {
        print("Decision response sent (\(decision)): HTTP \(httpResponse.statusCode)")
    } else if httpResponse.statusCode == 404 {
        // HTTP 404 means the pending request was already consumed by another device.
        // Treat as terminal success — do not retry.
        print("Decision response: request already answered by another device (HTTP 404)")
    } else if attempt < Self.maxRetryAttempts {
        // ... existing retry logic
    }
}
```

This change is **required in PR 6** and makes the second-device response path clean instead of generating 14 seconds of noisy backoff and misleading log entries.

**Token rotation**: `setDeviceToken(_:)` at `:199` is called on every app launch by `AppDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`. This already handles token rotation correctly — the server upserts, not inserts. No code change needed; add a comment documenting the behavior.

**Bridge exposure** (`ios/Shooter/Shooter/ContentView.swift:361`): Add `deviceId`, `appEnv`, `getDeviceId()`, `getDeviceName()`, and `getEnvironment()` to `window.ShooterBridge._config` and the bridge script so the web `/config` page can identify "this device" in the registered devices list. These bridge methods are required before PR 8 (config UI) ships.

### Android App Changes

**File**: `android/app/src/main/kotlin/com/shooter/android/ShooterFirebaseService.kt`

In `registerTokenWithServer`:

```kotlin
val prefs = AppPreferences(context)
val body = JSONObject().apply {
    put("token", token)
    put("platform", "android")
    put("deviceId", prefs.stableDeviceId)    // NEW
    put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}")  // NEW
    put("appEnv", "production")              // FCM is always production
}
```

Note: `MainActivity.kt:290-305` calls `ShooterFirebaseService.registerTokenWithServer()` on every config save (Android bridge `saveConfig` triggers re-registration). After the multi-device registry is live, this generates a spurious but idempotent upsert on every config save. This is harmless — the upsert only updates `last_seen_at` — but it will appear in server logs.

**File**: `android/app/src/main/kotlin/com/shooter/android/AppPreferences.kt`

Add `stableDeviceId: String` property:

```kotlin
val stableDeviceId: String
    get() {
        val stored = prefs.getString(KEY_DEVICE_ID, null)
        if (stored != null) return stored
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }
```

**Bridge exposure** (`android/app/src/main/kotlin/com/shooter/android/MainActivity.kt`): In `ShooterBridge.getConfig()`, add `deviceId`, `deviceName`, `getPlatform()`, and `getDeviceId()` to the returned `JSONObject`. These methods are required before PR 8 (config UI) ships.

---

## 7. Dispatch & Fan-Out

### New /api/notify Token Resolution

**File**: `src/routes/api/notify/+server.ts`

Replace the single-token resolution chains with a unified helper:

```typescript
function resolveTokens(platform: 'ios' | 'android', requestOverride?: string): string[] {
  // Single-device test override from config page: bypass registry entirely
  if (requestOverride?.trim()) return [requestOverride.trim()];

  // Query registry — filter by app_env matching the active gateway
  const appEnvFilter = env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
  const active =
    platform === 'ios'
      ? deviceTokenStore.listActiveForEnv(platform, appEnvFilter) // string[]
      : deviceTokenStore.listActive(platform);

  // Backward-compat env var seeds (never written to DB; used only as fallback)
  const envSeed = platform === 'ios' ? env.DEVICE_TOKEN?.trim() : env.ANDROID_DEVICE_TOKEN?.trim();

  const all = active.length > 0 ? active : envSeed ? [envSeed] : [];

  // Deduplicate
  return [...new Set(all)];
}
```

**Behavior change note**: The `DEVICE_PLATFORM` env var moves from a hard binary branch to per-platform booleans. When `DEVICE_PLATFORM` is unset and both APNs and FCM are configured, fan-out targets all platforms — this is new behavior versus the old iOS-default. A startup warning is emitted:

```typescript
// In server.ts or at module init in notify/+server.ts:
if (!env.DEVICE_PLATFORM && apnsClient.isConfigured() && isFCMConfigured()) {
  console.warn(
    '[notify] Both APNs and FCM are configured and DEVICE_PLATFORM is unset — ' +
      'will fan out to all platforms. Set DEVICE_PLATFORM=ios or DEVICE_PLATFORM=android to restrict.'
  );
}
```

Single-platform deployments (APNs only, or FCM only) are unaffected regardless of `DEVICE_PLATFORM`.

```typescript
const shouldSendIOS = apnsClient.isConfigured() && env.DEVICE_PLATFORM !== 'android';
const shouldSendAndroid = isFCMConfigured() && env.DEVICE_PLATFORM !== 'ios';
```

### APNs Fan-Out (sendToMany)

**File**: `src/lib/modules/server/apn/library-apns.ts`

The existing `sendNotification()` builds the `aps` envelope inline at `:92-113`. For `sendToMany`, extract this into a private `buildAlertBody(payload: NotificationPayload): Record<string, unknown>` method and call it once before the fan-out loop. This is a required refactor — `sendToMany` would throw `TypeError: this.buildAlertBody is not a function` without it.

The payload fitting strategy: call `fitApnsPayload` **once** on the shared body before cloning, then pass the already-fitted body to `deliver()`. The `deliver()` method currently calls `fitApnsPayload(body)` again at line 154 — **refactor `deliver()` to accept an optional `preSerializedJson?: string`** so that callers from `sendToMany` bypass the second `fitApnsPayload` call. This eliminates the double-truncation path. Backward compat: `sendNotification` still uses the old `deliver()` path and `fitApnsPayload` runs once as before.

Additionally, all N concurrent curl calls must use the **same JWT** generated before the fan-out begins, since `getJwt()` may rotate the token mid-fan-out (every 30 minutes). Capture the JWT once:

```typescript
async sendToMany(
  tokens: readonly string[],
  payload: NotificationPayload
): Promise<APNsFanOutResult> {
  if (tokens.length === 0) {
    return { results: [], staleTokens: [], totalFailed: 0, totalSent: 0 };
  }

  // Build aps body once (extracted from sendNotification inline code)
  const baseBody = this.buildAlertBody(payload);
  // Fit once — avoids double-truncation if deliver() is called with raw body
  fitApnsPayload(baseBody);
  const fittedJson = JSON.stringify(baseBody);

  // Capture JWT before the concurrent fan-out — prevents rotation mid-flight
  const jwtToken = this.getJwt();

  // Semaphore: cap concurrent curl processes to avoid EMFILE on systems
  // with low ulimit -n. p-limit added to package.json in this PR.
  const limit = pLimit(20);

  const settled = await Promise.allSettled(
    tokens.map((token) =>
      limit(() =>
        this.deliverPreSerialized(token, fittedJson, 'alert', '10', jwtToken)
          .then((r) => ({ token, result: r }))
      )
    )
  );

  const results: APNsTokenResult[] = settled.map((s, i) => {
    const token = tokens[i];
    if (s.status === 'rejected') {
      return { token, success: false, httpStatus: 0,
               reason: String(s.reason), disposition: 'transient_error' as const, timestampMs: 0 };
    }
    const { result } = s.value;
    // Pass appEnv for accurate BadDeviceToken classification
    const storedAppEnv = deviceTokenStore.getAppEnv(token) ?? 'sandbox';
    const serverAppEnv = env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
    const disposition = classifyApnsReason(
      result.httpStatus ?? 0,
      result.error,
      storedAppEnv,
      serverAppEnv
    );
    return { token, success: result.success, httpStatus: result.httpStatus ?? 0,
             reason: result.error ?? null, disposition, timestampMs: result.timestampMs ?? 0 };
  });

  return {
    results,
    staleTokens: results.filter(r => r.disposition === 'stale_token').map(r => r.token),
    totalSent:   results.filter(r => r.success).length,
    totalFailed: results.filter(r => !r.success).length,
  };
}
```

`deliver()` must be updated to surface `httpStatus` and (for HTTP 410) `timestampMs` from the APNs response body in `APNsSendResult`. **This is a required PR 3 change** — without it, `classifyApnsReason` receives `httpStatus: 0` for all non-success responses and always returns `'transient_error'`, silently defeating stale-token pruning. Add these fields to `APNsSendResult` in `src/lib/types/apn.ts` and verify with a test.

`classifyApnsReason()` (new pure function, unit-testable):

```typescript
const STALE_APNS_REASONS = new Set([
  'BadDeviceToken', // HTTP 400 — wrong env or malformed
  'Unregistered', // HTTP 410 — app uninstalled
  'DeviceTokenNotForTopic', // HTTP 400 — wrong bundle ID
  'TopicDisallowed', // HTTP 400 — push disabled at Apple level
]);

function classifyApnsReason(
  httpStatus: number,
  reason: string | undefined,
  storedAppEnv: 'sandbox' | 'production',
  serverAppEnv: 'sandbox' | 'production'
): ApnsTokenDisposition {
  if (httpStatus === 200) return 'sent';
  if (reason === 'BadDeviceToken' && storedAppEnv !== serverAppEnv) {
    // Environment mismatch — token is not dead, server config is wrong.
    // Emit a warning log but do NOT prune.
    console.warn(
      `[apns] BadDeviceToken likely due to app_env mismatch: ` +
        `token is ${storedAppEnv}, server is ${serverAppEnv}`
    );
    return 'transient_error';
  }
  if (reason && STALE_APNS_REASONS.has(reason)) return 'stale_token';
  return 'transient_error';
}
```

**`p-limit` dependency**: Add `pnpm add p-limit` to the PR 3 implementation steps. `p-limit` v5+ is pure ESM. The project has `"type": "module"` in `package.json` so ESM imports work directly. No CJS interop issue for `server.ts` (runs via `tsx`). The test harness uses `.cjs` files — do not import `p-limit` from test files; mock the semaphore or test `sendToMany` via the public API only.

Alternatively, implement the semaphore inline without the dependency (a 10-line counter-based implementation eliminates the ESM interop concern entirely):

```typescript
// Inline semaphore — no new dependency needed
function makeSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            queue.shift()?.();
          });
      };
      active < limit ? run() : queue.push(run);
    });
  };
}
```

**Collapse ID support**: When `payload.data.dedupKey` or `payload.data.requestId` is set, add the APNs collapse header in `deliverPreSerialized()`:

```typescript
if (collapseId) {
  args.push('-H', `apns-collapse-id: ${collapseId.substring(0, 64)}`);
}
```

For FCM (`fcm-service.ts`), add `android.collapseKey: collapseId` to `MulticastMessage`. This can ship in PR 3 alongside `sendToMany` since it is a pure additive change.

### FCM Fan-Out (sendEachForMulticast)

**File**: `src/lib/modules/server/fcm/fcm-service.ts`

```typescript
// Inline chunk helper — lodash is not a direct project dependency
function chunk<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size) as T[]);
  return result;
}

export async function sendFCMNotificationMulti(
  deviceTokens: readonly string[],
  payload: NotificationPayload
): Promise<FCMFanOutResult> {
  if (deviceTokens.length === 0) {
    return { successCount: 0, failureCount: 0, staleTokens: [], results: [] };
  }

  // Use 100-token chunks. While the FCM SDK hard-limit is 500 per sendEachForMulticast
  // call, keeping to 100 avoids HTTP/2 stream pressure on firebase-admin's internal
  // HTTP/2 session (which sets peerMaxConcurrentStreams: 100). If empirical testing
  // shows 500 is safe on the target firebase-admin version, increase CHUNK_SIZE then.
  const CHUNK_SIZE = 100;
  const chunks = chunk(deviceTokens, CHUNK_SIZE);
  const allResults: FCMTokenResult[] = [];

  for (const tokenChunk of chunks) {
    const message: admin.messaging.MulticastMessage = {
      android: { priority: 'high', ttl: 300000 },
      data: buildFCMData(payload),
      tokens: [...tokenChunk],
    };
    const batch = await admin.messaging(getApp()).sendEachForMulticast(message);
    tokenChunk.forEach((token, i) => {
      const resp = batch.responses[i];
      allResults.push({
        token,
        success: resp.success,
        messageId: resp.messageId ?? null,
        error: resp.error?.code ?? null,
      });
    });
  }

  // Only messaging/registration-token-not-registered is an unambiguous dead-token
  // signal. messaging/invalid-argument is NOT pruned — it can indicate a payload
  // format bug (e.g., a data key starting with 'google' or 'gcm', or an invalid
  // key format), which would prune ALL tokens in the batch if treated as stale.
  // Log invalid-argument as an error for human investigation instead.
  const PRUNABLE = new Set(['messaging/registration-token-not-registered']);
  const staleTokens = allResults
    .filter((r) => !r.success && r.error && PRUNABLE.has(r.error))
    .map((r) => r.token);

  // Log invalid-argument occurrences for investigation
  allResults
    .filter((r) => !r.success && r.error === 'messaging/invalid-argument')
    .forEach((r) => {
      const safeToken =
        r.token.length > 12 ? `${r.token.slice(0, 6)}...${r.token.slice(-4)}` : '[token]';
      console.error(
        `[fcm] messaging/invalid-argument for token ${safeToken} — ` +
          'check payload data keys (must not start with "google" or "gcm"). Token NOT pruned.'
      );
    });

  return {
    successCount: allResults.filter((r) => r.success).length,
    failureCount: allResults.filter((r) => !r.success).length,
    staleTokens,
    results: allResults,
  };
}

// Backward-compat thin wrapper
export async function sendFCMNotification(deviceToken: string, payload: NotificationPayload) {
  const r = await sendFCMNotificationMulti([deviceToken], payload);
  return {
    success: r.successCount > 0,
    messageId: r.results[0]?.messageId ?? undefined,
    error: r.results[0]?.error ?? undefined,
  };
}
```

### Fan-Out Orchestration in /api/notify

The new delivery block (replacing the single-token blocks at `:440-598`):

```typescript
// 1. Token resolution
const iosTokens = shouldSendIOS ? resolveTokens('ios', requestDeviceToken) : [];
const androidTokens = shouldSendAndroid ? resolveTokens('android', requestDeviceToken) : [];

if (iosTokens.length === 0 && androidTokens.length === 0) {
  return json(
    {
      error: 'No registered devices or fallback tokens configured',
      timestamp,
    },
    { status: 500 }
  );
}

// 2. Concurrent fan-out across both platforms
const [iosResult, androidResult] = await Promise.all([
  iosTokens.length > 0
    ? apnsClient.sendToMany(iosTokens, payload)
    : Promise.resolve({ results: [], staleTokens: [], totalSent: 0, totalFailed: 0 }),
  androidTokens.length > 0
    ? sendFCMNotificationMulti(androidTokens, payload)
    : Promise.resolve({ successCount: 0, failureCount: 0, staleTokens: [], results: [] }),
]);

// 3. Stale-token pruning (fire-and-forget; non-blocking)
const allStale = [
  ...iosResult.staleTokens.map((t) => ({ platform: 'ios' as const, token: t })),
  ...androidResult.staleTokens.map((t) => ({ platform: 'android' as const, token: t })),
];
if (allStale.length > 0) {
  void deviceTokenStore.pruneByTokens(allStale);
}

// 4. Aggregate result
const totalSent = iosResult.totalSent + androidResult.successCount;
const totalFailed = iosResult.totalFailed + androidResult.failureCount;
const overallSuccess = totalSent > 0;

// 5. Update last_seen_at for successfully-reached tokens (extends TTL)
if (totalSent > 0) {
  const successfulTokens = [
    ...iosResult.results.filter((r) => r.success).map((r) => r.token),
    ...androidResult.results.filter((r) => r.success).map((r) => r.token),
  ];
  void deviceTokenStore.touchLastSeen(successfulTokens);
}

// 6. Record dedup cache entry (ONCE, after fan-out, only on any success)
// Tradeoff: partial success (2/3 devices reached) marks the content as sent.
// A retry within the 10s dedup window will be suppressed even for the failed device.
// This is the accepted behavior — content-level dedup is orthogonal to device count,
// and the notifier already has curl-level retry. Only call if ALL tokens succeeded
// to avoid poisoning the dedup cache on partial transient failure.
if (totalFailed === 0 && totalSent > 0) {
  recordNotification(title, message, data);
}

// 7. Create pending request (ONCE, not per token)
if (waitForResponse && overallSuccess) {
  createPendingRequest(canonicalRequestId, {
    options,
    question: question ?? null,
    responseKind: responseKind ?? 'hook',
    sessionId: (data?.sessionId as string) || '',
    toolInput: (data?.toolInput as Record<string, unknown>) || {},
    toolName: (data?.toolName as string) || '',
  });
}

// 8. Response — HTTP 200 with success:false when all tokens fail
// The notifier.cjs checks body.success (fixed in PR 9) and resolves null immediately.
return json({
  success: overallSuccess,
  sent: totalSent,
  failed: totalFailed,
  pruned: allStale.length,
  requestId: canonicalRequestId,
  timestamp,
  // Per-device detail omitted from response body for token privacy;
  // available in server logs only
});
```

### Dedup, skipPush/forcePush, and Pending Requests with N Devices

**Dedup** (`notificationCache: Map<string, number>` at `:47`): The dedup check runs once, before any fan-out, on the notification content key (`dedupKey || title|message|category`). `recordNotification()` is called only when `totalFailed === 0` (all tokens succeeded) to avoid the dedup-cache-poisoning scenario where a transient APNs failure for one device silently blocks retries for that device within the 10-second window.

**skipPush / forcePush**: The `skipPush && !forcePush` branch at `:395` currently skips push delivery entirely if WS clients are connected. With multi-device, one device may have a WS connection while another does not. **For Phase 1**, preserve the existing semantics (any WS client → skip all pushes). The autopilot engine's direct `POST /api/notify` must use `forcePush: true` to bypass this when autopilot pushes should reach devices even while the app is open (since `AutopilotDriver.svelte.ts:140` maintains a persistent WS connection that always makes `connectedClients > 0` while the app is open, globally suppressing hook pushes otherwise).

**Bidirectional pending requests** (`pending-requests.ts:234`): `createPendingRequest(canonicalRequestId, ...)` is called exactly once per notification event. The pending row is content-addressed by `canonicalRequestId`, the same UUID sent in `data.requestId` to every device's push payload. `getDecision()` at `:258-261` reads and **deletes** the row on first access — first-responder-wins semantics. Subsequent `/api/response` POSTs from other devices receive HTTP 404 (`{ error: 'Request not found or expired' }`). Both the iOS app (after PR 6 fix) and notifier.cjs (after PR 9 fix) treat 404 as "already answered" — terminal success, not an error requiring retry.

---

## 8. Token Lifecycle & Pruning

### APNs Definitive Stale Codes (prune immediately)

| HTTP Status | Reason                   | Action                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400         | `BadDeviceToken`         | Prune ONLY if `storedAppEnv === serverAppEnv`. If mismatched (e.g., sandbox token sent to production gateway), return `transient_error` and emit a warning.                                                                                                                         |
| 410         | `Unregistered`           | Prune ONLY IF `device_tokens.registered_at < apns_410_timestamp`. Parse the `timestamp` field (Unix epoch seconds) from the 410 response body: `{ "reason": "Unregistered", "timestamp": 1701388800 }`. If the stored registration is newer, the device re-installed; do not prune. |
| 400         | `DeviceTokenNotForTopic` | Prune. Token belongs to a different bundle ID.                                                                                                                                                                                                                                      |
| 400         | `TopicDisallowed`        | Prune. Push notifications disabled for this bundle at Apple level.                                                                                                                                                                                                                  |

### APNs 410 Timestamp Guard (Implementation)

```typescript
const registeredEpoch = Math.floor(new Date(record.registered_at).getTime() / 1000);
if (registeredEpoch > apns410Timestamp) {
  // Device re-registered after APNs recorded deregistration — do NOT prune
  console.log(`[apns] Unregistered 410 ignored: device re-registered after APNs timestamp`);
  return;
}
```

`deliver()` (and the new `deliverPreSerialized()`) must parse the `timestamp` field from the 410 response body and return it as `timestampMs` (milliseconds) in `APNsSendResult`.

### APNs Transient (do NOT prune)

`429 TooManyRequests`, `429 TooManyProviderTokenUpdates`, `500 InternalServerError`, `503 ServiceUnavailable`, `503 Shutdown`, `400 IdleTimeout`, `400 BadCollapseId`, `400 BadExpirationDate`, `400 PayloadTooLarge` (handled by `fitApnsPayload`), `403 InvalidProviderToken` / `ExpiredProviderToken` (JWT credential issue — fix the server config, not the device record).

### FCM Definitive Stale Codes

| SDK Error Code                                | Action                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `messaging/registration-token-not-registered` | Prune immediately.                                                                                                                                                                         |
| `messaging/invalid-argument`                  | **Do NOT prune.** Ambiguous — may indicate a payload format bug affecting all tokens in the batch, not a dead token. Log as error for human investigation; increment `failure_count` only. |

### FCM Do NOT Prune

`messaging/mismatched-credential` (server config error), `messaging/unavailable`, `messaging/internal-error`, `messaging/quota-exceeded`, `messaging/invalid-registration-token` (fix token format), `messaging/invalid-argument`.

### Pruning Implementation

**Lazy (reactive)**: After every fan-out, tokens in `staleTokens` from `APNsFanOutResult` and `FCMFanOutResult` are passed to `deviceTokenStore.pruneByTokens(stale)`:

```sql
UPDATE device_tokens SET is_active=0, failure_count=failure_count+1
WHERE token=? AND platform=?;
```

Fire-and-forget (non-blocking for the notify response).

**Startup cleanup** (in `DeviceTokenStore.migrate()` or a separate `startupCleanup()` method):

```sql
DELETE FROM device_tokens
WHERE is_active = 0
  AND last_seen_at < datetime('now', '-30 days');
```

Only inactive rows are deleted. Active rows are never expired by age alone — use a much longer threshold (or never delete active rows) to avoid silently removing devices that simply haven't re-launched the app recently.

### Sandbox vs Production Mismatch

The `app_env` column stores whether the token was registered as `sandbox` or `production`. The server's `APNS_PRODUCTION` env var controls which gateway `LibraryAPNsService` uses (`:48-49`). A token registered as `app_env='sandbox'` will always fail against the production gateway with `BadDeviceToken`.

The `resolveTokens()` helper filters tokens by `app_env` matching the server's current gateway:

```typescript
const appEnvFilter = env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
const active = deviceTokenStore.listActiveForEnv('ios', appEnvFilter);
```

**APNs singleton limitation**: `LibraryAPNsService` captures `env.APNS_PRODUCTION` at construction time and pins `this.host` to one gateway. Mixed sandbox+production tokens on the same server instance are therefore not supported — the server can only fan out to tokens matching the active gateway. This is documented as a Non-Goal. If both are needed, maintain two `LibraryAPNsService` singletons (one per gateway) and route tokens to the matching instance.

---

## 9. Cross-Device Concerns

### Dedup Across Devices

The `notificationCache: Map<string, number>` at `notify/+server.ts:47` is content-keyed (`dedupKey || title|message|category`) and global (not per-device). This is correct for multi-device: the check fires once before fan-out, suppressing duplicate notification events, not per-token sends. No change needed.

### Badge / Read-State Sync

When a user responds to a permission notification on one device, the other devices' notification should be cleared. **Mechanism**: After `setDecision()` resolves a pending request, send a silent background push (`content-available: 1, apns-priority: 5`) with `apns-collapse-id` matching the original notification's `requestId` to all remaining active iOS tokens. This collapse will replace the undelivered notification copy in APNs storage for offline devices and give online devices a background wake to clear the badge.

Implementation: call `apnsClient.sendSilentNotification(token, { dismiss: requestId })` for each iOS token (excluding the responding device's token if its `device_id` is known). For Android, send a data-only FCM message with `"clearNotification": requestId`.

Given that lingering permission notifications on secondary devices can confuse users (they may tap "Allow" on a notification that has already been answered), badge sync via collapse keys should be implemented for permission notifications as part of PR 3 (where collapse key support is added to `deliver()`), not deferred to Phase 2. Non-permission notifications can use Phase 2 badge sync.

### Collapse Keys

**File**: `src/lib/modules/server/apn/library-apns.ts:deliverPreSerialized()`

When `payload.data.dedupKey` or `payload.data.requestId` is set, add the APNs collapse header:

```typescript
if (collapseId) {
  args.push('-H', `apns-collapse-id: ${collapseId.substring(0, 64)}`);
}
```

For FCM (`fcm-service.ts`), add `android.collapseKey: collapseId` to `MulticastMessage`. This is included in PR 3 (apns-send-to-many) as a standalone additive change.

### Autopilot Silent-Push Fan-Out

**File**: `src/lib/modules/server/sessions/autopilot-engine.ts`

The `push()` function at `:307-341` calls `POST /api/notify` via `fetch` — after PR 5, this automatically fans out to all registered devices. No change needed in the engine for alert pushes.

**`forcePush: true` required for autopilot**: The `AutopilotDriver.svelte.ts:140` persistent `/ws/events` WebSocket connection means `getEventsClientCount()` (events-handler.ts) always returns > 0 while the app is open, causing `notifier.cjs` to set `skipPush: true`. The autopilot engine's direct `POST /api/notify` bypasses the notifier and does not set `skipPush`; however, if the WS skip-push logic is also applied in the notify route server-side, autopilot pushes would be suppressed. The current notify route applies skip-push based on the `skipPush` field in the request body (caller-controlled), not server-side WS detection. Autopilot calls should add `forcePush: true` explicitly to be future-proof.

For `sendSilentNotification()` fan-out (Phase 2):

```typescript
// In autopilot-engine.ts, a new wakePush() helper:
const iosTokens = deviceTokenStore.listActive('ios');
await Promise.allSettled(
  iosTokens.map((token) => apnsClient.sendSilentNotification(token, { terminalIds }))
);
```

**Caution**: iOS throttles `content-available` pushes to a few per hour per device. For Phase 1, the autopilot continues using the alert-push path via `/api/notify`.

### Presence/WS Skip-Push With Multiple Devices

**File**: `src/lib/modules/server/ws/presence-store.ts`

The current `PresenceRecord` is a single global record. `isViewerPresent()` returns `true` if ANY client reported foreground within 45 seconds. With multiple devices, device A being in foreground suppresses pushes to device B.

**Phase 1**: Keep existing semantics. This is conservative and safe — if the user is actively watching one device, suppressing duplicate pushes to others prevents notification fatigue.

**Phase 2**: Extend `PresenceRecord` to a `Map<deviceId, { lastForegroundAt: number }>`. `reportPresence(state, deviceId)` updates only the named device's entry. `getAbsentDeviceTokens(allTokens)` returns tokens for devices NOT in foreground. The `POST /api/presence` endpoint must accept an optional `deviceId` field without breaking old clients (which POST only `{ state: 'foreground' | 'background' }`); old clients fall back to `deviceId: 'default'`. This API extension must be listed as a concrete change in the Phase 2 PR plan to avoid it being overlooked.

---

## 10. Type-System Changes

### New Hand-Written File: src/lib/types/device.ts

**Rationale**: The generated `src/lib/types/generated/API.ts` is known to truncate at `HealthConfiguration` (~line 280 of the generated output), silently dropping `DeviceTokenRequest`, `DeviceTokens`, and everything after. New YAML-defined types for the device registry would also be dropped. Therefore, the critical device registry types are hand-written in `src/lib/types/device.ts` following the pattern in `src/lib/types/decision.ts`.

```typescript
// src/lib/types/device.ts
// Device registry types for multi-device push notification fan-out.
// Hand-written because the type-crafter generator currently truncates
// generated/API.ts at ~280 lines, before DeviceTokenRequest or newer types.

import { randomUUID } from 'crypto';

export type DevicePlatform = 'android' | 'ios';
export type AppEnv = 'production' | 'sandbox';
export type ApnsTokenDisposition = 'sent' | 'stale_token' | 'transient_error';

export interface DeviceRecord {
  appEnv: AppEnv;
  bundleId: null | string;
  deviceId: null | string;
  failureCount: number;
  friendlyName: null | string;
  id: string;
  isActive: boolean;
  lastSeenAt: string;
  platform: DevicePlatform;
  registeredAt: string;
  token: string;
}

export interface APNsTokenResult {
  disposition: ApnsTokenDisposition;
  httpStatus: number;
  reason: null | string;
  success: boolean;
  timestampMs: number;
  token: string;
}

export interface APNsFanOutResult {
  results: APNsTokenResult[];
  staleTokens: string[];
  totalFailed: number;
  totalSent: number;
}

export interface FCMTokenResult {
  error: null | string;
  messageId: null | string;
  success: boolean;
  token: string;
}

export interface FCMFanOutResult {
  failureCount: number;
  results: FCMTokenResult[];
  staleTokens: string[];
  successCount: number;
}

export interface MultiDeviceNotifyResult {
  failed: number;
  pruned: number;
  requestId: string;
  sent: number;
  success: boolean;
  timestamp: string;
}

export const MAX_FAILURE_COUNT = 3;

// Re-export for DeviceTokenStore usage
export { randomUUID as newDeviceId };

export function isDeviceRecord(v: unknown): v is DeviceRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.token === 'string' &&
    typeof r.platform === 'string' &&
    (r.platform === 'ios' || r.platform === 'android') &&
    typeof r.registeredAt === 'string' &&
    typeof r.failureCount === 'number'
  );
}
```

**UUID generation**: All row IDs are generated via `crypto.randomUUID()` from Node's built-in `crypto` module (available since Node 14.17, and the project requires Node ≥ 20). No `uuid` package is needed. The migration pseudocode in Section 5 uses `crypto.randomUUID()` consistently.

### YAML Spec Updates (specs/types/api.yaml)

Add to `specs/types/api.yaml` (for documentation and future when truncation bug is fixed):

```yaml
DeviceRecord:
  type: object
  description: A registered push notification device
  required: [id, token, platform, appEnv, registeredAt, lastSeenAt, failureCount]
  properties:
    id: { type: string }
    token: { type: string }
    platform: { type: string, enum: [ios, android] }
    appEnv: { type: string, enum: [sandbox, production] }
    deviceId: { type: string, nullable: true }
    friendlyName: { type: string, nullable: true }
    bundleId: { type: string, nullable: true }
    registeredAt: { type: string }
    lastSeenAt: { type: string }
    failureCount: { type: number }
    isActive: { type: boolean }

DeviceTokenRequest:
  # Extend existing type
  properties:
    deviceId: { type: string, nullable: true } # NEW
    deviceName: { type: string, nullable: true } # NEW
    appEnv: { type: string, enum: [sandbox, production], nullable: true } # NEW
```

Update `HealthChecks` in the YAML to add:

```yaml
registeredDeviceCount:
  type: number
  description: Total active registered devices (all platforms)
```

Keep `hasDeviceToken` as a backward-compat alias: `hasDeviceToken = registeredDeviceCount > 0`.

### Updated HealthConfiguration (specs/types/api.yaml)

Replace `deviceTokenLength: number` with `deviceCounts: { ios: number; android: number }` while keeping `deviceTokenLength` as deprecated (set to `deviceCounts.ios + deviceCounts.android` for backward compat with iOS app versions reading it).

Update the health warning message atomically in PR 2 to avoid confusing post-migration state:

- Old: `'No device token set — push notifications have no target'`
- New: `'No devices registered — push notifications have no target'`

The check `!checks.hasDeviceToken` in `health/+server.ts:70` is updated to `checks.registeredDeviceCount === 0` (registry-based). After PR 2, users with devices in the DB but no `DEVICE_TOKEN` in `.env` (the correct post-migration state) will not see the spurious warning.

### Config YAML Update (specs/types/config.yaml)

Add optional `deviceId` field alongside the existing `deviceToken`:

```yaml
ShooterConfig:
  properties:
    deviceToken: { type: string, nullable: true } # keep (deprecated alias)
    deviceId: { type: string, nullable: true } # NEW: UUID of this device's registry record
```

### Barrel Update (src/lib/types/index.ts)

After the existing hand-written exports:

```typescript
export type * from './device';
export { MAX_FAILURE_COUNT, isDeviceRecord, newDeviceId } from './device';
```

### Config Guard Update (src/lib/modules/client/common/config-guard.ts)

After the `deviceToken` validation block (`:43-62`), add:

```typescript
if (obj.deviceId !== undefined && obj.deviceId !== null && typeof obj.deviceId !== 'string') {
  return false;
}
if (obj.deviceId === undefined) {
  obj.deviceId = null;
}
```

The `deviceToken` field remains in the guard for backward compat — it is not removed from `isShooterConfig`. The localStorage migration in PR 8 will clear it from stored configs (see Section 11).

### pnpm gen:types

Run `pnpm gen:types` after YAML edits. Verify that `generated/API.ts` still truncates (expected); the hand-written `device.ts` is the authoritative source until the truncation bug is diagnosed and fixed.

---

## 11. Config UI / Setup / CLI / QR

### Config Page Registered Devices Panel

**File**: `src/routes/config/+page.svelte`

The following `deviceToken` state references must ALL be removed or updated in PR 8 to avoid compile errors:

| Location   | Current code                                               | Action                                                                    |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `:23`      | `let deviceToken = $state('')`                             | Remove entirely                                                           |
| `:148-151` | `if (bridge?.getFcmToken?.())...deviceToken = ...`         | Rewrite to set `config.deviceId` instead                                  |
| `:190-191` | `if (parsed.deviceToken) deviceToken = parsed.deviceToken` | Remove; `deviceToken` in localStorage is cleared by migration (see below) |
| `:242`     | `deviceToken: deviceToken.trim()` in `saveConfiguration()` | Remove or replace with `deviceId: config.deviceId`                        |
| `:298-299` | `deviceToken` in test notification payload                 | Remove; fan-out handles targeting                                         |
| `:333`     | `deviceToken = ''` in logout/clear handler                 | Remove                                                                    |
| `:388`     | `<Input name="deviceToken" bind:value={deviceToken} />`    | Remove; replaced by devices card                                          |
| `:445`     | Stepper check `apiKey.trim() && deviceToken.trim()`        | Replace with `apiKey.trim() && registeredDevices.length > 0`              |

**localStorage migration (one-time, on `onMount`)**: Users upgrading from old versions will have `deviceToken` in their localStorage `shooter_config`. On `onMount`, after `isShooterConfig(parsed)` passes, clear the `deviceToken` field:

```typescript
onMount(() => {
  const saved = localStorage.getItem('shooter_config');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.deviceToken) {
      delete parsed.deviceToken;
      localStorage.setItem('shooter_config', JSON.stringify(parsed));
    }
  }
  // ... rest of mount logic
});
```

**Registered devices card**:

```svelte
<script lang="ts">
  let registeredDevices = $state<DeviceRecord[]>([]);

  async function loadDevices() {
    if (!apiKey) return;
    const res = await fetch('/api/device-token', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      registeredDevices = data.devices;
    }
  }

  async function removeDevice(id: string) {
    await fetch('/api/device-token', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadDevices();
  }

  $effect(() => {
    void loadDevices();
  });
</script>
```

Render the device list with platform badge, masked token (`{token.slice(0,8)}...{token.slice(-4)}`), `friendlyName`, `registeredAt` relative time, and a Remove button. Highlight "this device" by matching `device.id === config.deviceId` (populated from bridge in `hydrateBridge()`).

### setup.cjs Changes

**File**: `scripts/setup.cjs`

Remove the `DEVICE_TOKEN` prompt (`:422-425`) and `ANDROID_DEVICE_TOKEN` prompt (`:473-478`). In `buildEnvContent()` (`:667`), replace the token lines with a comment block.

**Migration mechanism for `loadExistingPushConfig()`**: `setup.cjs` is a plain CommonJS script (`fs`, `readline`, no `better-sqlite3` import). It cannot call `DeviceTokenStore` methods directly. The correct approach is to write a JSON seed file:

```javascript
// In setup.cjs loadExistingPushConfig(), if DEVICE_TOKEN or ANDROID_DEVICE_TOKEN
// exist in .env and are being removed, write a seed file for server-side pickup:
const seeds = [];
if (config.deviceToken) seeds.push({ platform: 'ios', token: config.deviceToken });
if (config.androidDeviceToken)
  seeds.push({ platform: 'android', token: config.androidDeviceToken });
if (seeds.length > 0) {
  const seedPath = path.join(shooterHome, 'device-token-seeds.json');
  fs.writeFileSync(seedPath, JSON.stringify(seeds), { mode: 0o600 });
  console.log(`[setup] Wrote ${seeds.length} token(s) to ${seedPath} for server migration.`);
}
```

`DeviceTokenStore.migrate()` (in `server.ts` at startup) checks for this seed file after the JSON migration:

```typescript
const seedPath = path.join(shooterDataDir(), 'device-token-seeds.json');
if (existsSync(seedPath)) {
  const seeds = JSON.parse(readFileSync(seedPath, 'utf8'));
  const now = new Date().toISOString();
  const appEnv = process.env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
  for (const { platform, token } of seeds) {
    if (token && !db.prepare(`SELECT 1 FROM device_tokens WHERE token=?`).get(token)) {
      db.prepare(
        `INSERT OR IGNORE INTO device_tokens
        (id, token, platform, app_env, registered_at, last_seen_at, failure_count, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)`
      ).run(crypto.randomUUID(), token, platform, appEnv, now, now);
    }
  }
  renameSync(seedPath, seedPath + '.processed');
}
```

Update the completion banner to: "Pair your phone: open the Settings page and scan the QR code."

### CLI (bin/shooter.cjs)

Add a new subcommand `shooter devices` that calls `GET /api/device-token` and prints a table of registered devices for CLI-level inspection. When the server is not running, the command should fail gracefully (matching `shooter status` behavior — check for the PID file first and warn if the server is down before attempting the API call).

### QR Pairing (src/routes/api/qr-config/+server.ts)

The QR payload currently encodes `{ apiKey, serverUrl }`. Add `registerUrl`:

```typescript
const configPayload = JSON.stringify({
  apiKey,
  serverUrl,
  registerUrl: `${serverUrl}/api/device-token`, // NEW
});
```

The native iOS app hard-codes `"\(serverUrl)/api/device-token"` in `NotificationManager.swift:210` — this is harmless, but `registerUrl` in the QR payload makes the endpoint explicit for future app versions.

**PR dependency order**: The QR scan auto-registration handler in the config page (`src/routes/config/+page.svelte`) uses bridge methods `getDeviceId()`, `getDeviceName()`, `getPlatform()`, and `getApnsToken()`. These are added in PR 6 (iOS) and PR 7 (Android). **PR 8 must depend on PRs 6 and 7 being merged first** so the bridge methods exist when the config page code runs. If PR 8 ships before PRs 6/7 (or on a device with an old app version), the auto-registration silently no-ops because `bridge?.getDeviceId?.()` returns `undefined`. The server receives the registration without `deviceId`, falling back to token-keyed upsert — this is safe but loses the rotation benefit. Make the PR dependency explicit in the PR description.

---

## 12. Backward Compatibility

### env.DEVICE_TOKEN / ANDROID_DEVICE_TOKEN

These remain the fallback of last resort in `resolveTokens()`. The resolution order:

1. `requestDeviceToken` (request-body override for test sends)
2. `deviceTokenStore.listActiveForEnv(platform, appEnvFilter)` (registry, array)
3. `env.DEVICE_TOKEN` / `env.ANDROID_DEVICE_TOKEN` (env var seed, treated as one-element array)

Existing `.env`-only deployments continue working with zero changes.

**`SHOOTER_DEVICE_TOKEN` in notifier.cjs**: `notifier.cjs:58` defines `const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || null` and injects it into notification payloads at `:1562` and `:1815`. This env var is **not documented** in `CLAUDE.md`'s env var table. Users who set `SHOOTER_DEVICE_TOKEN` for a single-device override will lose this functionality when PR 9 removes it. Add a migration note: users should remove `SHOOTER_DEVICE_TOKEN` from their `.env` and register their device token via the mobile app instead.

### Old App Versions

Old iOS/Android app versions that POST without `deviceId` or `deviceName` are handled by the token-keyed upsert (`ON CONFLICT(token) DO UPDATE ...`). The `device_id` column will be `NULL` for these registrations.

**Duplicate push window for old-app token rotation**: When an old iOS app (no `deviceId`) gets a new APNs token after reinstall or OS upgrade, a second row is inserted (since `device_id = NULL` does not trigger `UNIQUE(device_id, platform)` due to SQLite NULL semantics). Both old and new tokens are fanned out to until the old token returns `BadDeviceToken` on the next delivery. This causes a temporary duplicate push for the same physical device. At registration time, when a new token arrives without `device_id`, deactivate other `device_id IS NULL` rows for the same platform to reduce the duplicate window:

```sql
-- Before inserting new null-device_id row:
UPDATE device_tokens SET is_active=0
WHERE device_id IS NULL AND platform=? AND token != ? AND is_active=1;
```

### process.env.DEVICE_TOKEN Shim

The `process.env.DEVICE_TOKEN = token` write at `device-token/+server.ts:79` is removed in the combined PR 5. Code that reads `env.DEVICE_TOKEN` (health endpoint `:43`, debug endpoint `:15`) is updated to query the `device_tokens` table. The debug endpoint query is specified precisely:

```sql
SELECT token FROM device_tokens WHERE platform='ios' AND is_active=1 ORDER BY last_seen_at DESC LIMIT 1
```

Return `{ exists: false, length: 0, valid: false }` when the result is empty.

The env var is still read as a fallback seed in `resolveTokens()`, preserving backward compat for `.env`-only deployments.

### DEVICE_PLATFORM Env Var

Preserved as a delivery filter:

- `DEVICE_PLATFORM=ios` → Android tokens are excluded from fan-out.
- `DEVICE_PLATFORM=android` → iOS tokens are excluded from fan-out.
- Unset → fan out to all configured platforms (new behavior when both APNs and FCM are configured).

**Behavior change disclosure**: When `DEVICE_PLATFORM` is unset and **both** APNs and FCM are configured, the new code fans out to both platforms. This is new behavior versus the old iOS default. For single-platform deployments (only APNs configured, or only FCM configured), the behavior is unchanged regardless of `DEVICE_PLATFORM`. A startup warning is emitted when both platforms are configured and `DEVICE_PLATFORM` is unset (see Section 7). Hand-crafted `.env` files that configure both APNs and FCM without `DEVICE_PLATFORM` should set `DEVICE_PLATFORM=ios` or `DEVICE_PLATFORM=android` explicitly to restore the old behavior.

### Response Shape

The existing `POST /api/notify` success response was `{ success, requestId, result: { sent: 1, failed: 0, success: true }, message, timestamp }`. The new response is `{ success, sent, failed, pruned, requestId, timestamp }`. The `.result.sent` field disappears. The notifier.cjs hook checks `response.ok` (HTTP 2xx) and — after PR 9 — also `body.success` (boolean). The `success: false` on HTTP 200 case (all-tokens-dead) is handled by the PR 9 notifier fix.

---

## 13. Notifier.cjs Fixes (PR 9)

### startPolling 404 / not_found Terminal Handling

**Root cause**: `getDecision()` in `pending-requests.ts:258-261` deletes the row on first read and returns `{ decision, status: 'decided' }`. Subsequent callers find no row and `GET /api/response` returns HTTP 404 with `{ error: 'Request not found or expired' }`. The current `startPolling` in `notifier.cjs:1702` only resolves on `result.status === 'decided'`. HTTP 404 is not HTTP 200, so the poll parser at `:1749` catches a JSON parse (the 404 body is valid JSON) but `result.status` is `'not_found'`-equivalent — the code falls through and keeps polling until the 120-second timeout.

**Fix**: In `startPolling`, add explicit handling for HTTP 404 and for `status === 'not_found'`:

```javascript
res.on('end', () => {
  if (resolved) return;
  try {
    const result = JSON.parse(data);
    if (result.status === 'decided' && result.decision) {
      // ... existing success path
    } else if (result.status === 'not_found' || res.statusCode === 404) {
      // Request already consumed by another device — treat as "already allowed"
      resolved = true;
      clearInterval(pollTimer);
      clearTimeout(overallTimeout);
      debugLog(`Request already decided by another device (${res.statusCode})`);
      resolve({ decision: 'allow' }); // or resolve(null) if prefer local fallback
    }
    // status === 'pending' → keep polling
  } catch (e) {
    debugLog(`Poll parse error: ${e.message}`);
  }
});
```

### success:false Body on HTTP 200 (All-Tokens-Dead)

**Root cause**: `sendBidirectionalNotification` at `notifier.cjs:1674` gates polling on `res.statusCode !== 200`. When all tokens are dead, the server returns HTTP 200 with `{ success: false, sent: 0 }`. The notifier starts polling, but no `pending_requests` row was created (gated on `overallSuccess`). Every poll returns HTTP 404, and the `not_found` fix above would immediately resolve with `{ decision: 'allow' }` — which is incorrect (it should fall through to local dialog, not silently allow).

**Fix**: Check `body.success === false` before calling `startPolling`:

```javascript
res.on('end', () => {
  let body;
  try {
    body = JSON.parse(responseData);
  } catch {
    body = {};
  }

  if (res.statusCode !== 200) {
    debugLog(`Notification send failed: ${res.statusCode} - falling through to local dialog`);
    resolve(null);
    return;
  }

  if (body.success === false) {
    debugLog(`No devices reached (sent=0) — skipping poll, falling through to local dialog`);
    resolve(null);
    return;
  }

  // HTTP 200 + success: true → start polling
  startPolling(requestId, resolve);
});
```

**Alternative**: Return HTTP 503 instead of 200 when `totalSent === 0`. This preserves the existing `res.statusCode !== 200 → resolve(null)` fast-fail path in notifier without requiring the `body.success` check. Either approach is valid; the `body.success` check is more semantically precise.

---

## 14. Security & Privacy

### Token Storage Permissions

`~/.shooter/shooter.db` is created in `shooterDataDir()`, whose directory is created with `mode: 0o700`. The SQLite WAL files (`.db-wal`, `.db-shm`) inherit the directory permissions. No additional `chmod` is needed.

### API Auth on Register / List / Delete

- `POST /api/device-token`: validated by `validateAuth(request)` (existing).
- `GET /api/device-token`: new endpoint; same `validateAuth` guard. Device counts appear only in the authenticated response, not in the public health check body.
- `DELETE /api/device-token`: same `validateAuth` guard. Accepts `{ id }` (UUID), not the raw token.

### Token Redaction in Logs

`library-apns.ts:219-220` already redacts device tokens from curl error output via `device\/[A-Fa-f0-9]+`. FCM tokens are base64-like (not hex) — add redaction in `fcm-service.ts` error paths:

```typescript
const safeToken = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : '[token]';
```

The `GET /api/device-token` response returns only `tokenPrefix` (first 8 + `...` + last 4 chars), never the full token.

The `GET /api/health` and `GET /api/debug` endpoints return `deviceCount` (integer) and token summary (length + validity boolean), never the raw token. Device counts appear only in the authenticated response path.

---

## 15. Edge Cases & Failure Modes

### Empty Registry

`resolveTokens()` returns the env var seeds if the registry is empty. If env vars are also unset, the function returns `[]`. The notify handler returns HTTP 500 with `{ error: 'No registered devices or fallback tokens configured' }`. The notifier.cjs hook receives a non-200 response and calls `resolve(null)` immediately (fast-fail, no 120-second hang).

### All Tokens Dead

If every token in the registry returns `BadDeviceToken` or `Unregistered` in a single fan-out, `totalSent = 0`. The response is HTTP 200 with `{ success: false, sent: 0, failed: N, pruned: N }`. The notifier.cjs `body.success === false` check (PR 9 fix) resolves `null` immediately rather than hanging for 120 seconds.

### Partial Fan-Out Failure

`Promise.allSettled` ensures one APNs curl failure does not abort delivery to other tokens. Transient failures increment `failure_count` but do not prune the token. The response aggregates `{ sent: 2, failed: 1, pruned: 0 }`. `overallSuccess: true` allows `createPendingRequest` to proceed, so the bidirectional permission flow works even if one device is temporarily unreachable.

### Concurrent Writes to the Registry

Two devices registering simultaneously via `POST /api/device-token` is safe with SQLite WAL mode and `better-sqlite3`'s single-threaded write serialization. The two-step transaction is atomic at the SQLite level.

The `pruneByTokens()` call is fire-and-forget. Concurrent prune + register for the same token is safe: the register upsert resets `is_active=1` and `failure_count=0`; the prune sets `is_active=0`. SQLite serializes these writes; the register (if later) wins, which is correct.

### Token Rotation Race (Two UNIQUE Constraints)

The two-step transaction (UPDATE by `device_id` first, then INSERT with token-keyed ON CONFLICT) avoids the SQLite ambiguity that arises when a single INSERT could trigger either UNIQUE constraint. If device A's new APNs token equals device B's current token (rare but possible — APNs recycles tokens after reinstall), the token-keyed ON CONFLICT guard (`WHERE device_tokens.device_id IS NULL OR device_tokens.device_id = excluded.device_id`) preserves device B's identity and logs a warning instead of overwriting it.

### Old-App Token Rotation Duplicate Push Window

When an old app (no `deviceId`) rotates its APNs token, both old and new rows are temporarily active. The deactivation-of-prior-null-device-id rows (see Section 12) reduces this window. The old token returns `BadDeviceToken` on first delivery and is pruned. The expected duplicate window is one delivery cycle.

### Very Large Device Counts

For a personal self-hosted tool, the expected device count is 2–10. The inline semaphore (or `p-limit`) caps concurrent curl processes at 20 to avoid EMFILE. FCM chunks at 100 tokens per `sendEachForMulticast` call to avoid HTTP/2 stream pressure on firebase-admin's internal session.

### APNs JWT Concurrency

All N concurrent curl calls in `sendToMany` use the JWT captured before the fan-out (`const jwtToken = this.getJwt()` called once). This prevents the mid-fan-out rotation scenario where some calls use an expired JWT.

### Concurrent Duplicate notify Calls (Dedup Cache Race)

The `notificationCache` (module-level `Map`) is single-threaded in Node.js. Dedup check and `recordNotification` are synchronous Map operations — no race condition possible.

### APNs Singleton and APNS_PRODUCTION at Runtime

`LibraryAPNsService` captures `env.APNS_PRODUCTION` at construction time. Changing `APNS_PRODUCTION` at runtime requires a server restart. This is expected behavior — document it in the FAQ. Users switching from sandbox to production builds must restart the server after updating `.env`.

### 30-Day Startup Cleanup (Active Row Safety)

The startup cleanup only deletes **inactive** rows older than 30 days. Active rows are never deleted by age, preventing silent removal of devices that haven't re-launched the app recently. `last_seen_at` is updated on every successful push delivery (not just re-registration), so frequently-notified devices naturally extend their TTL.

### Rollback Procedure

If the combined PR 5 (device-token store + notify fan-out) is deployed and then reverted:

1. The `device-tokens.json.migrated` file can be renamed back to `device-tokens.json` to restore the old registration file.
2. The `device_tokens` SQLite table persists but is ignored by the reverted code.
3. The `process.env.DEVICE_TOKEN` mutation (restored in the revert) will re-activate single-device iOS delivery on the first registration POST.

### SHOOTER_HOME Consistency

`src/routes/api/device-token/+server.ts` currently hardcodes `join(homedir(), '.shooter')` (`:9`) instead of using `shooterDataDir()`. PR 5 updates this to `shooterDataDir()`, aligning the registration file path with the migration path and all other server modules.

---

## 16. Test Plan

All tests follow the repo's bespoke harness: plain `.cjs` files with inline `runTest`/`assertEqual`/`assertNotNull` helpers, run with `node tests/<name>.test.cjs`, exit 1 on failure.

### New Test: tests/device-token-store.test.cjs

Pattern: inline `DeviceTokenStore` class using `better-sqlite3` against `/tmp/shooter-test-device-tokens.db`. `freshStore()` wipes the DB before each test.

```
Test 1:  upsert(record) — inserts a new iOS token; SELECT returns it
Test 2:  upsert(same token) — no duplicate; last_seen_at updated
Test 3:  upsert by deviceId rotation (two-step tx) — same deviceId, new token updates existing row
Test 4:  listActive('ios') — returns only iOS is_active=1 rows
Test 5:  listActive('android') — returns only Android is_active=1 rows
Test 6:  listActive on empty table — returns []
Test 7:  two distinct iOS tokens coexist — listActive('ios') returns both
Test 8:  pruneByTokens(['token1']) — sets is_active=0 for token1 only
Test 9:  pruneByTokens([]) — no rows affected
Test 10: pruneByTokens([nonexistent]) — 0 rows affected, no error
Test 11: startupCleanup() — inactive rows with last_seen_at > 30 days deleted
Test 12: startupCleanup() — active recent rows retained
Test 13: startupCleanup() — active rows older than 30 days retained (active rows never pruned by age)
Test 14: migration from legacy device-tokens.json string shape — {ios:'abc'} produces one row
Test 15: migration from legacy string[] shape — {ios:['abc','def']} produces two rows
Test 16: migration is idempotent — running twice does not create duplicates
Test 17: DELETE by id — row sets is_active=0
Test 18: app_env filter — 'sandbox' token excluded when filter='production' via listActiveForEnv
Test 19: token identity theft guard — ON CONFLICT(token) with different device_id preserves original device_id
Test 20: touchLastSeen(['token1']) — updates last_seen_at for that token
Test 21: old-app null deactivation — inserting new null-device_id row deactivates prior null rows for same platform
Test 22: seed file migration — device-token-seeds.json produces rows; file renamed to .processed
```

### New Test: tests/notify-fanout.test.cjs

Pattern: `require('tsx/cjs')` + load a new `src/lib/modules/server/apn/fan-out.ts` module. Uses duck-typed mock `apnsClient`.

```
Test 1:  fanOutAPNs([], payload, mockClient) → { totalSent:0, totalFailed:0, staleTokens:[] }
Test 2:  fanOutAPNs(['t1','t2'], all succeed) → totalSent=2, staleTokens=[]
Test 3:  one token returns BadDeviceToken (env match) → in staleTokens, totalFailed=1, totalSent=1
Test 4:  one token returns BadDeviceToken (env mismatch) → transient_error, NOT staleTokens
Test 5:  one token returns Unregistered (410) with timestamp OLDER than registered_at → staleTokens
Test 6:  Unregistered with timestamp guard: registered_at AFTER 410 timestamp → NOT staleTokens
Test 7:  InternalServerError → totalFailed=1, NOT staleTokens (transient)
Test 8:  Promise.allSettled semantics — one rejected promise does not abort rest
Test 9:  FCM: sendEachForMulticast mock, messaging/registration-token-not-registered → staleTokens
Test 10: FCM: messaging/unavailable → failureCount++, NOT staleTokens
Test 11: FCM: messaging/invalid-argument → NOT staleTokens (logged as error only)
Test 12: mixed: 3 iOS + 2 Android tokens, 1 iOS stale, 1 Android stale → correct aggregation
Test 13: requestDeviceToken override → only that one token sent, registry not consulted
Test 14: success:false response → notifier resolves null immediately (no polling started)
```

### New Test: tests/device-registry-prune.test.cjs

Pattern: `better-sqlite3` directly against `/tmp/shooter-test-prune.db`.

```
Test 1:  pruneByTokens after successful delivery — no rows changed
Test 2:  pruneByTokens after BadDeviceToken (env match) — token's is_active=0, failure_count incremented
Test 3:  pruneByTokens for token not in DB — 0 rows affected, no error
Test 4:  after prune, re-register same token — is_active=1, failure_count=0 restored
Test 5:  two concurrent prune calls (sequential simulation) — idempotent
Test 6:  startup cleanup removes inactive rows older than 30 days
Test 7:  startup cleanup retains active rows older than 30 days
Test 8:  startup cleanup retains recent inactive rows (not yet 30 days)
```

### New Test: tests/classify-apns-reason.test.cjs

Pattern: `require('tsx/cjs')` + load `library-apns.ts` and export `classifyApnsReason`.

```
Test 1:  (200, undefined, 'sandbox', 'sandbox') → 'sent'
Test 2:  (400, 'BadDeviceToken', 'sandbox', 'sandbox') → 'stale_token'
Test 3:  (400, 'BadDeviceToken', 'sandbox', 'production') → 'transient_error' (env mismatch)
Test 4:  (410, 'Unregistered', 'sandbox', 'sandbox') → 'stale_token'
Test 5:  (400, 'DeviceTokenNotForTopic', 'sandbox', 'sandbox') → 'stale_token'
Test 6:  (500, 'InternalServerError', 'sandbox', 'sandbox') → 'transient_error'
Test 7:  (429, 'TooManyRequests', 'sandbox', 'sandbox') → 'transient_error'
Test 8:  (400, 'PayloadTooLarge', 'sandbox', 'sandbox') → 'transient_error'
Test 9:  (403, 'InvalidProviderToken', 'sandbox', 'sandbox') → 'transient_error'
Test 10: (0, undefined, 'sandbox', 'sandbox') — rejected promise → 'transient_error'
```

### Updated package.json test script

```json
"test": "node tests/terminal-store.test.cjs && node tests/pending-requests.test.cjs && node tests/tunnel-discovery.test.cjs && node tests/plan-mode-routing.test.cjs && node tests/dynamic-options-extraction.test.cjs && node tests/next-step-consensus.test.cjs && node tests/summaries-route.test.cjs && node tests/litellm-client.test.cjs && node tests/decide-injection.test.cjs && node tests/presence-store.test.cjs && node tests/autopilot-context.test.cjs && node tests/apns-payload.test.cjs && node tests/device-token-store.test.cjs && node tests/notify-fanout.test.cjs && node tests/device-registry-prune.test.cjs && node tests/classify-apns-reason.test.cjs"
```

---

## 17. Phased Implementation Plan

### Branch Policy

All changes go on `feat/*` branches, open PRs to `release`. No direct pushes to `release`. PRs are independently shippable (tests pass, app builds, backward compat preserved at each stage).

---

### PR 1: feat/device-registry-store

**Goal**: New SQLite-backed `DeviceTokenStore`; migration from legacy JSON; exported from a shared module. Does not change any API behavior.

**Files**:

- `src/lib/modules/server/push/device-token-store.ts` (**NEW**)
  - `DeviceTokenStore` class using `better-sqlite3` singleton pattern (same as `terminal-store.ts`)
  - DDL: `device_tokens` table with all columns; `UNIQUE(token)`, `UNIQUE(device_id, platform)` with NULL semantics documented
  - Methods: `upsert(record)`, `listActive(platform)`, `listActiveForEnv(platform, appEnv)`, `getAppEnv(token)`, `pruneByTokens(stale)`, `deleteById(id)`, `touchLastSeen(tokens)`, `startupCleanup()`, `migrate()`
  - `migrate()` reads legacy `~/.shooter/device-tokens.json` if present; reads `device-token-seeds.json` if present; inserts rows; renames files to `.migrated` / `.processed`
  - Uses `crypto.randomUUID()` for row IDs — no uuid package needed
  - Uses `shooterDataDir()` for DB path (not hardcoded `~/.shooter`)
- `src/lib/types/device.ts` (**NEW**) — all types, `MAX_FAILURE_COUNT`, `isDeviceRecord`, `newDeviceId`
- `src/lib/types/index.ts` (EDIT) — add device exports
- `specs/types/api.yaml` (EDIT) — add `DeviceRecord`, `DeviceRegistry`, updated `DeviceTokenRequest` (additive; for documentation)
- `tests/device-token-store.test.cjs` (**NEW**) — all 22 tests
- `package.json` (EDIT) — add `&& node tests/device-token-store.test.cjs` to test script

**Gate**: `pnpm test` passes. `pnpm build` passes. No API behavior changes.

---

### PR 2: feat/device-token-api-get-delete

**Goal**: Add `GET` and `DELETE` to `/api/device-token`; update health and debug endpoints to read from the registry. **Does NOT** remove `process.env.DEVICE_TOKEN = token` or change notify behavior — that ships atomically in PR 5.

**Files**:

- `src/routes/api/device-token/+server.ts` (EDIT)
  - Import `DeviceTokenStore`; keep existing `POST` handler body but ADD registry upsert alongside the existing `readTokens`/`writeTokens` (dual-write for safety during transition)
  - ADD `GET`: auth-gated; return device list with masked tokens
  - ADD `DELETE`: accept `{ id }`; call `deleteById(id)`
  - Update `TOKENS_DIR` to use `shooterDataDir()`
- `src/routes/api/health/+server.ts` (EDIT)
  - Replace `hasDeviceToken: !!env.DEVICE_TOKEN?.trim()` (`:43`) with `hasDeviceToken = deviceCount > 0` using registry count
  - Add `iosDeviceCount`, `androidDeviceCount` to authenticated response
  - Keep `hasDeviceToken` as backward-compat alias
  - Update warning message to `'No devices registered — push notifications have no target'`
- `src/routes/api/debug/+server.ts` (EDIT)
  - Replace single `env.DEVICE_TOKEN` check (`:15`) with registry query: `SELECT token FROM device_tokens WHERE platform='ios' AND is_active=1 ORDER BY last_seen_at DESC LIMIT 1`
  - Keep `deviceToken: { exists, length, valid }` shape; return `{ exists: false, length: 0, valid: false }` when no rows
- `specs/types/api.yaml` (EDIT) — `HealthChecks.registeredDeviceCount`, `HealthConfiguration.deviceCounts`, deprecated `deviceTokenLength`
- `src/lib/modules/client/common/config-guard.ts` (EDIT) — add `deviceId` validation
- `specs/types/config.yaml` (EDIT) — add `deviceId?: string | null`
- Run `pnpm gen:types` after YAML edits

**Gate**: `pnpm gen:types` produces valid TS. `pnpm build` passes. `pnpm test` passes. Manual: POST two devices via curl; GET returns both with masked tokens; DELETE removes one; GET returns one. iOS push still works (dual-write preserves env var).

---

### PR 3: feat/apns-send-to-many

**Goal**: Add `sendToMany()` and `deliverPreSerialized()` to `LibraryAPNsService`; extract `buildAlertBody()` from `sendNotification()`; expose `httpStatus` and `timestampMs` in `APNsSendResult`; add `classifyApnsReason()` with `appEnv` parameter; add collapse key support; add inline semaphore or `p-limit`.

**Files**:

- `src/lib/modules/server/apn/library-apns.ts` (EDIT)
  - Extract `private buildAlertBody(payload: NotificationPayload): Record<string, unknown>` from `sendNotification()` inline code `:92-113`
  - Add `private async deliverPreSerialized(token, bodyJson, pushType, priority, jwtToken, collapseId?)` — accepts pre-serialized JSON and pre-captured JWT; skips `fitApnsPayload` and `getJwt()` calls; adds `apns-collapse-id` header when `collapseId` is set
  - Add `httpStatus?: number` and `timestampMs?: number` to return path of `deliver()` (parse from curl stdout)
  - Add `classifyApnsReason(httpStatus, reason, storedAppEnv, serverAppEnv): ApnsTokenDisposition`
  - Add `public async sendToMany(tokens, payload): Promise<APNsFanOutResult>` — captures JWT once; uses semaphore; calls `deliverPreSerialized`
  - Add inline semaphore (10-line counter-based) — no new dependency
- `src/lib/types/apn.ts` (EDIT) — add `httpStatus?: number` and `timestampMs?: number` to `APNsSendResult`
- `tests/classify-apns-reason.test.cjs` (**NEW**) — all 10 tests
- `package.json` (EDIT) — add classify-apns-reason test

**Gate**: `pnpm test` passes. Unit test verifies `classifyApnsReason` returns `'transient_error'` for `BadDeviceToken` with env mismatch and `'stale_token'` with env match. `sendToMany` with a mock token list returns correct aggregation.

---

### PR 4: feat/fcm-send-each-multicast

**Goal**: Update FCM service to use `sendEachForMulticast`; keep backward-compat wrapper; use inline chunk helper (no lodash); use 100-token chunks; remove `messaging/invalid-argument` from prunable set.

**Files**:

- `src/lib/modules/server/fcm/fcm-service.ts` (EDIT)
  - Add inline `chunk<T>()` helper
  - Add `sendFCMNotificationMulti(tokens: readonly string[], payload): Promise<FCMFanOutResult>` with 100-token chunks
  - Only `messaging/registration-token-not-registered` in PRUNABLE set
  - Log `messaging/invalid-argument` as error (not prune)
  - Keep `sendFCMNotification(deviceToken, payload)` as thin backward-compat wrapper

**Gate**: `pnpm build` passes. Manual integration test: register two Android tokens; call `sendFCMNotificationMulti`; both receive data messages.

---

### PR 5: feat/notify-fan-out (MERGED with former PR 2 device-token POST change)

**Goal**: Rewrite `/api/notify` delivery block to fan out; atomically remove `process.env.DEVICE_TOKEN = token` mutation from device-token POST; update response shape; add `server.ts` import for startup.

**Why merged**: Removing `process.env.DEVICE_TOKEN = token` in an earlier PR would break iOS delivery between that PR and this one. By merging them, new registrations and fan-out dispatch ship together with no regression window.

**Files**:

- `src/routes/api/notify/+server.ts` (EDIT — major)
  - Remove `readPersistedDeviceToken()` (`:20-35`)
  - Add `resolveTokens(platform, requestOverride?)` helper with `listActiveForEnv` for iOS
  - Replace `const platform = env.DEVICE_PLATFORM || 'ios'` (`:440`) with per-platform booleans
  - Emit startup warning when both platforms configured and `DEVICE_PLATFORM` unset
  - Replace single APNs call (`:554`) with `apnsClient.sendToMany(iosTokens, payload)`
  - Replace single FCM call (`:476`) with `sendFCMNotificationMulti(androidTokens, payload)`
  - Move `recordNotification()` call to after fan-out; call only when `totalFailed === 0`
  - Move `createPendingRequest()` call to after fan-out, conditional on `overallSuccess`
  - Add `touchLastSeen()` call for successful tokens
  - Fire-and-forget stale-token pruning after fan-out
  - New response shape: `{ success, sent, failed, pruned, requestId, timestamp }`
- `src/routes/api/device-token/+server.ts` (EDIT)
  - Remove `process.env.DEVICE_TOKEN = token` (`:79`)
  - Remove dual-write to JSON file (now fully SQLite-only)
- `server.ts` (EDIT) — add `import { deviceTokenStore } from './src/lib/modules/server/push/device-token-store.js'` for startup migrate/cleanup
- `tests/notify-fanout.test.cjs` (**NEW**) — all 14 tests
- `tests/device-registry-prune.test.cjs` (**NEW**) — all 8 tests
- `package.json` (EDIT) — add both new tests

**Gate**: `pnpm test` passes. `pnpm build` passes. Manual smoke test: register two iOS devices; POST `/api/notify`; both devices receive notification. Manual: kill all tokens; POST `/api/notify`; notifier resolves null immediately (no 120s hang).

---

### PR 6: feat/ios-app-device-metadata

**Goal**: iOS app sends `deviceId`, `deviceName`, `appEnv` on registration; handle HTTP 404 in `attemptDecisionResponse`; expose bridge methods for config UI.

**Files** (all in `ios/Shooter/Shooter/`):

- `NotificationManager.swift` (EDIT)
  - Add `stableDeviceId()` using `UIDevice.current.identifierForVendor` + `KeychainHelper.save` fallback (NOT `KeychainHelper.write` — which does not exist)
  - Add `buildEnvironment()` compile-time `#if DEBUG` flag
  - Expand `registerTokenWithServer` POST body with `deviceId`, `deviceName`, `appEnv`
  - Fix `attemptDecisionResponse` (`:302-333`): treat HTTP 404 as terminal success ("already answered by another device") — do not retry on 404
- `ContentView.swift` (EDIT)
  - Add `getDeviceId()`, `getDeviceName()`, `getEnvironment()`, `getApnsToken()` to `WebView.bridgeScript()`
  - Add `deviceId` and `appEnv` to `window.ShooterBridge._config`

**Gate**: Build in Xcode (debug). Register on device; `GET /api/device-token` returns row with `device_id` populated and `friendly_name` set. Test: trigger a permission request on two registered devices; second device's response logs "already answered" instead of retrying 3 times.

---

### PR 7: feat/android-app-device-metadata

**Goal**: Android app sends `deviceId`, `deviceName` on registration.

**Files** (all in `android/app/src/main/kotlin/com/shooter/android/`):

- `AppPreferences.kt` (EDIT) — add `stableDeviceId: String` with UUID generation
- `ShooterFirebaseService.kt` (EDIT) — expand `registerTokenWithServer` body
- `MainActivity.kt` (EDIT) — expose `deviceId`, `deviceName`, `getPlatform()`, `getDeviceId()` in `ShooterBridge.getConfig()`

**Gate**: Build in Android Studio. Register on device; server registry shows `device_id` and `friendly_name`.

---

### PR 8: feat/config-ui-devices

**Goal**: Config page shows registered devices list; remove ALL `deviceToken` state references (see exhaustive list in Section 11); add localStorage migration; update setup wizard; add `registerUrl` to QR payload.

**Depends on**: PR 6 and PR 7 must be merged first (bridge methods `getDeviceId`, `getDeviceName`, `getPlatform` required for QR auto-registration).

**Files**:

- `src/routes/config/+page.svelte` (EDIT)
  - Remove `let deviceToken = $state('')` and ALL references (lines `:23`, `:148-151`, `:190-191`, `:242`, `:298-299`, `:333`, `:388`, `:445`)
  - Add localStorage migration on `onMount` to clear `deviceToken` from stored config
  - Add registered devices card with `loadDevices()`, list rendering, Remove button, "this device" highlight
  - Update Stepper completion check to `registeredDevices.length > 0`
  - Update bridge hydration to write `config.deviceId`
- `scripts/setup.cjs` (EDIT)
  - Remove `DEVICE_TOKEN` and `ANDROID_DEVICE_TOKEN` prompts
  - Update `buildEnvContent()` to emit comment block
  - Add seed file mechanism in `loadExistingPushConfig()` (write `device-token-seeds.json`, not direct SQLite write)
  - Update completion banner
- `src/routes/api/qr-config/+server.ts` (EDIT) — add `registerUrl` to QR payload

**Gate**: `pnpm build` passes. Manual: open `/config`, verify device list loads; scan QR from new device (with PR 6/7 app); verify it appears in the list. Old app version: QR scan still works (auto-registration silently no-ops, device registers on next push token POST from the app).

---

### PR 9: feat/notifier-hook-cleanup

**Goal**: Fix `startPolling` to treat 404/not_found as terminal; fix `body.success === false` early-exit; remove `SHOOTER_DEVICE_TOKEN`; update documentation.

**Files**:

- `.claude/hooks/notifier.cjs` (EDIT)
  - `sendBidirectionalNotification`: check `body.success === false` after HTTP 200; call `resolve(null)` immediately
  - `startPolling`: treat `result.status === 'not_found'` and `res.statusCode === 404` as terminal (resolve `{ decision: 'allow' }` — already decided by another device)
  - Delete `const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || null` (`:58`)
  - Delete `...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN })` at `:1562` and `:1815`
  - Add migration comment for `SHOOTER_DEVICE_TOKEN` users
- `CLAUDE.md` (EDIT) — update env var table; add multi-device note; document `SHOOTER_DEVICE_TOKEN` removal; clarify `forcePush: true` for autopilot
- `.env.example` (EDIT) — update comments for `DEVICE_TOKEN`, `ANDROID_DEVICE_TOKEN`, `DEVICE_PLATFORM`; note `SHOOTER_DEVICE_TOKEN` removal
- `docs/GUIDANCE.md` (EDIT) — add `device-token-store.ts` to server directory listing; document fan-out module; document `push/` module directory
- `docs/CLAUDE-CODE-INTEGRATION.md` (EDIT) — update `DEVICE_TOKEN` description; add multi-device section

**Gate**: All hook events result in fan-out to all registered devices. `pnpm test` passes. Test: with all tokens pruned, trigger a permission hook — Claude Code resumes immediately (no 120s hang). Test: with two devices registered, answer on device A; device B's notifier resolves immediately (no 14s backoff in iOS app logs).

---

## 18. Open Design Decisions

**1. Storage backend: SQLite vs JSON with locking**

- **Chosen**: SQLite (Option B). Atomic upserts, concurrent-write safety, indexed queries. JSON requires `proper-lockfile` dependency and still cannot provide atomic multi-row operations.

**2. All-tokens-dead HTTP response: 200+`success:false` vs 503**

- **Chosen**: 200+`success:false` (Option A). Semantically cleaner — distinguishes delivery failure from server error. The PR 9 notifier fix makes `body.success === false` a fast-fail path, eliminating the 120s hang risk. If PR 9 is delayed, use 503 as a safe interim to preserve the existing fast-fail behavior.

**3. DEVICE_PLATFORM env var: deprecated vs delivery filter**

- **Chosen**: Preserved as delivery filter (Option B). Single-platform deployments are a legitimate use case. Emit a startup warning when both platforms are configured and `DEVICE_PLATFORM` is unset to give operators visibility into the new fan-out behavior.

**4. QR pairing: permanent API key vs short-lived pairing token**

- **Chosen**: API key in QR (Option A) for Phase 1. Option B (pairing token exchange) is a future security hardening PR.

**5. Per-device presence gating: global boolean vs per-device map**

- **Chosen**: Global boolean (Option A) for Phase 1; per-device map (Option B) in a follow-up PR after `deviceId` propagation is established end-to-end. The `POST /api/presence` endpoint must accept an optional `deviceId` field (backward-compat) in the Phase 2 PR.

**6. Notification badge sync across devices**

- **Chosen**: Collapse key support in PR 3 (for permission notifications specifically, to prevent lingering permission prompts on secondary devices); full badge sync (dismiss push to all other tokens after response) in Phase 2.

**7. Proactive staleness TTL: 30-day vs configurable**

- **Chosen**: Only **inactive** rows are deleted after 30 days. Active rows are never deleted by age. `last_seen_at` is updated on every successful delivery, not just re-registration.

**8. `messaging/invalid-argument` FCM pruning**

- **Chosen**: Do NOT prune on `messaging/invalid-argument`. It is ambiguous and would silently delete all Android devices on a payload format bug. Only `messaging/registration-token-not-registered` is an unambiguous dead-token signal.

**9. `sendToMany` double-fitApnsPayload: pre-fit vs per-call fit**

- **Chosen**: Pre-fit once via `fitApnsPayload`, then pass pre-serialized JSON to `deliverPreSerialized()`. The `deliverPreSerialized` method bypasses the second `fitApnsPayload` call, eliminating the double-truncation path entirely.

**10. Semaphore for curl concurrency: `p-limit` vs inline**

- **Chosen**: Inline counter-based semaphore (10 lines, no new dependency). Eliminates ESM/CJS interop complexity for the `.cjs` test harness.

**11. Inter-PR atomicity: separate vs merged PR for device-token POST change and notify fan-out**

- **Chosen**: Merged into a single PR 5. Removing `process.env.DEVICE_TOKEN = token` without simultaneously updating the notify route would silently break iOS delivery for new registrations. A single atomic PR eliminates the regression window.
