# Shooter: Complete Bug Report & Fix Priority List

> Last updated: 2026-03-26. Verified by 5 parallel deep-scan agents reading every source file.
> Supersedes all previous analysis. All line numbers verified against current working tree.

---

## CRITICAL — Fix Immediately

### C1. wsActive Permission Path Never Creates Pending Request

**Files:** `.claude/hooks/notifier.cjs:617-626`

When WebSocket clients are connected, `handlePermission()` skips `POST /api/notify` and calls `startPolling(requestId, resolve)` directly. But `createPendingRequest()` is only called by the `/api/notify` handler. The polling loop hits `GET /api/response?requestId=X` which returns 404 every time because no request was registered. Result: **permission flow times out (120s) and falls back to local dialog every time the web UI is open.**

**Fix:** Before `startPolling`, POST to `/api/notify` (or a new lightweight `/api/register-request` endpoint) to register the pending request.

---

### C2. FCM Category Not Forwarded — Android Allow/Deny Buttons Never Appear

**Three-sided bug:**

1. **Server** (`notify/+server.ts:205`): Sets `payload.category = 'CLAUDE_PERMISSION'` as a top-level field
2. **FCM sender** (`fcm-service.ts:44`): Reads `payload.data?.category` — the **wrong** field. Gets the notifier's lowercase `'permission'` from `data.category` instead of the top-level `'CLAUDE_PERMISSION'`
3. **Android** (`ShooterFirebaseService.kt:19`): Checks `category == "permission"` — even if the server fixed its side, the Android check string doesn't match `"CLAUDE_PERMISSION"`

**Result:** Android permission notifications always render as plain events with no action buttons.

**Fix:** In `fcm-service.ts`, read `payload.category || payload.data?.category`. In `ShooterFirebaseService.kt`, check `"CLAUDE_PERMISSION"` to match iOS behavior.

---

### C3. iOS API Key in Plaintext UserDefaults

**Files:** `SetupView.swift:135`, `NotificationManager.swift:15`

Android uses `EncryptedSharedPreferences` (AES-256-GCM). iOS stores the API key via `UserDefaults.standard.set(apiKey, forKey: "apiKey")` — plaintext plist, accessible in unencrypted backups.

**Fix:** Use iOS Keychain (`SecItemAdd`/`SecItemCopyMatching`) or `KeychainSwift` library.

---

### C4. `google-services.json` Is Placeholder

**File:** `android/app/google-services.json`

All IDs zeroed out (`000000000000`), API key is `"placeholder-key-for-build-only"`. FCM cannot connect. Token fetch fails silently.

**Fix:** Replace with real Firebase project config. Add to `.gitignore` if repo is public.

---

## HIGH — Fix This Sprint

### H1. `/api/notify` Inline Auth — Timing-Unsafe

**Files:** `notify/+server.ts:160` (POST), `notify/+server.ts:413` (GET)

Uses `apiKey !== expectedKey` (plain `!==`). Every other route uses `validateAuth()` which has `timingSafeEqual`. This is the most sensitive endpoint (triggers push notifications).

**Fix:** Replace both inline auth blocks with `const authError = validateAuth(request); if (authError) return authError;`

---

### H2. Session Watcher Single-Subscriber Guard

**Files:** `session-watcher.ts:62-65`, `pty-manager.ts:155,177`

`watch()` has an early-return `if (this.watchedFiles.has(filePath))`. PtyManager calls `watch(file, () => {})` with a no-op when it discovers the session file. When a browser later subscribes via `session-handler.ts`, the second `watch()` call is silently rejected. **Live streaming works for the first client only if the timing is right; a second concurrent client gets nothing.**

`OpenCodeWatcher` already uses a `Set<callback>` multi-subscriber pattern. `SessionWatcher` should match.

**Fix:** Convert `WatchedFile.callback` to `callbacks: Set<OnNewEntries>`. Add `subscribe()` method returning unsubscribe function. Remove no-op `watch()` calls from `pty-manager.ts`.

---

### H3. Wire Format Inconsistency: History `content` vs Live `text`

**File:** `session-handler.ts:145,181`

History sends `{ type: 'text', content: string }` (via `partToHistoryPart`). Live sends `{ type: 'text', text: string }` (via `conversationToLive` → `TextContentBlock`). Clients must handle both field names. `terminals/[id]/+page.svelte` casts history to `ChatMessage[]` and reads `.content`, but live messages arrive with `.text` — **live assistant text renders as blank bubbles in the terminal chat view**.

**Fix:** Standardize on one field name. Either change `TextContentBlock` to `{ type: 'text', content: string }` or update all clients to read both.

---

### H4. No Reconfiguration Path on Either Platform

**iOS:** `ShooterApp.swift` shows `ContentView` when `serverUrl` is non-empty — no settings button, no gear icon, no way back to `SetupView`.
**Android:** `MainActivity.kt` redirects to `SetupActivity` only when `!prefs.isConfigured()` — no menu item for settings.

**Fix:** Add a long-press/menu entry on both platforms to re-open setup.

---

### H5. No Permission Response Retry on Either Platform

**iOS:** `NotificationManager.swift:139-152` — `URLSession.dataTask` with no retry. Network failure silently drops the Allow/Deny decision.
**Android:** `PermissionActionReceiver.kt:63-72` — `onFailure` calls `pendingResult.finish()` with no retry.

**Fix:** Add 2-3 retry attempts with exponential backoff before giving up.

---

### H6. Client Missing WS Message Types

| Message Type           | `session/[id]` | `terminals/[id]` | `ChatView.svelte`   |
| ---------------------- | -------------- | ---------------- | ------------------- |
| `error`                | NOT HANDLED    | NOT HANDLED      | NOT HANDLED         |
| `thinking`             | Handled        | **NOT HANDLED**  | Handled             |
| `permission-requested` | NOT HANDLED    | NOT HANDLED      | Handled (dead code) |

**Fix:** Add `error` handling to all three. Add `thinking` to `terminals/[id]`. Either integrate `ChatView.svelte` (which handles everything) or add missing types to inline handlers.

---

### H7. `isError` Field Mismatch in Terminal Chat

**File:** `terminals/[id]/+page.svelte:377`

```typescript
isError: msg.status === 'error',  // WRONG — status is always 'done'
```

Server sends `{ isError: boolean, status: 'done' }`. Correct check: `msg.isError || false`. `session/[id]` and `ChatView.svelte` both use `data.isError` correctly.

---

## MEDIUM — Fix Next Sprint

### M1. `--border-default` CSS Token Undefined

**File:** `+layout.svelte:87` — `background: var(--border-default)`. Token not defined in `app.css`. Nav divider is invisible.

**Fix:** Change to `var(--border)` (the defined token).

---

### M2. No WS Reconnect in `session/[id]/+page.svelte`

`socket.onclose` sets `connectionState = 'disconnected'` and nulls `ws` — no retry. A network blip permanently kills live updates. `terminals/[id]` has 2-second reconnect; `xterm-wrapper.ts` has exponential backoff.

---

### M3. `ChatView.svelte` Is Dead Code

Never imported by any page. `terminals/[id]/+page.svelte` duplicates the entire chat rendering inline. Either integrate it or delete it.

---

### M4. Android `MainActivity` Loads Unvalidated Intent URL

**File:** `MainActivity.kt:82` — `webView.loadUrl(deepLinkUrl)` where `deepLinkUrl` comes from `intent.getStringExtra(EXTRA_URL)`. `MainActivity` is `exported=true`. A malicious app could send an Intent with an arbitrary URL.

**Fix:** Validate `deepLinkUrl` starts with `prefs.serverUrl`.

---

### M5. `openCodeWatcher.stopAll()` Not Called on Shutdown

**File:** `server.ts:116-118` — graceful shutdown calls `sessionWatcher.stopAll()` but not `openCodeWatcher.stopAll()`. OpenCode poll intervals leak.

---

### M6. Token Refresh Not Registered With Server

**iOS:** `NotificationManager.setDeviceToken` stores locally only.
**Android:** `ShooterFirebaseService.onNewToken` stores locally only.
Neither platform pushes refreshed tokens to the server. After token rotation, push delivery fails silently.

---

### M7. Dedup Cache Poisoned on FCM Failure

**File:** `notify/+server.ts:132` — `isDuplicateNotification` records the key before checking delivery success. A failed FCM send blocks a legitimate retry for 10 seconds.

---

## LOW — Technical Debt

| ID  | Issue                                                                                                                                          | File                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| L1  | `pty-manager.ts:244-246` — sort comparator variables swapped (exited terminals sort ascending instead of descending)                           | `pty-manager.ts`                                |
| L2  | `ManagedTerminal.watcherOffset` field declared but never used                                                                                  | `pty-manager.ts:34`                             |
| L3  | `getCached`/`setCache` duplicated in 4 Svelte files                                                                                            | `+page`, `project`, `session/[id]`, `terminals` |
| L4  | `renderMarkdown` duplicated in 3 files                                                                                                         | `session/[id]`, `terminals/[id]`, `ChatView`    |
| L5  | `getToolDescription` duplicated in 3 files (no `input.description` fallback)                                                                   | `session/[id]`, `terminals/[id]`, `ChatView`    |
| L6  | `isShooterConfig` type guard duplicated in 4 files                                                                                             | Multiple pages                                  |
| L7  | `formatRelativeTime` duplicated in 3 files                                                                                                     | `+page`, `project`, `terminals`                 |
| L8  | Chat message rendering HTML block duplicated in 3 files                                                                                        | `session/[id]`, `terminals/[id]`, `ChatView`    |
| L9  | ~~Triple `StatusEnum` in generated `Terminal.ts` (compile error, dead code)~~ **RESOLVED** — type-crafter migration eliminated duplicate enums | `src/generated/types/Terminal.ts`               |
| L10 | Generated JWT types unused/unreachable — re-exported from index.ts but never imported by app code                                              | `src/generated/types/JWT.ts`                    |
| L11 | `/api/webhook` is dead stub code with no auth                                                                                                  | `src/routes/api/webhook/+server.ts`             |
| L12 | `/api/health` exposes config details without auth (including new FCM status)                                                                   | `src/routes/api/health/+server.ts`              |
| L13 | `APNS_KEY_BASE64` referenced in health check but never used by APNs service                                                                    | `health/+server.ts:49`                          |
| L14 | `.page-title` letter-spacing: global `-0.04em` vs scoped `-0.03em` in 3 pages                                                                  | `app.css` vs page styles                        |
| L15 | `--ds-red-200`, `--bg-secondary`, `--bg-tertiary`, `--gray-600` CSS tokens undefined (fallbacks used)                                          | Various                                         |
| L16 | `security-crypto:1.1.0-alpha06` (Android) — alpha dependency for credential storage                                                            | `libs.versions.toml:10`                         |
| L17 | iOS `SetupView` accepts blank API key (empty string saved)                                                                                     | `SetupView.swift:106`                           |
| L18 | iOS `isSetupComplete` binding setter is no-op (works via UserDefaults side-channel)                                                            | `ShooterApp.swift:15`                           |
| L19 | Scrollback chunking can split multi-byte UTF-8 characters                                                                                      | `pty-manager.ts:540-541`                        |
| L20 | `jsonl-parser.ts` has no declarative skip list for known internal event types                                                                  | `jsonl-parser.ts`                               |

---

## Happy Patterns Still Worth Extracting

| Pattern                                | Status                | Complexity | What to Do                                                                                |
| -------------------------------------- | --------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Multi-subscriber watcher               | **STILL NEEDED** (H2) | Low        | Convert `SessionWatcher` to `Set<callback>` like `OpenCodeWatcher`                        |
| Turn lifecycle (turn-start/turn-end)   | **STILL NEEDED**      | Medium     | Add to `ServerMessage` union in `session-handler.ts`; handle in both page clients         |
| Generic `toolTitle()` from description | **STILL NEEDED**      | Low        | Extract shared `toolTitle.ts` utility, replace 3 duplicate `getToolDescription` functions |
| Declarative JSONL skip list            | **STILL NEEDED**      | Trivial    | Add `INTERNAL_EVENT_TYPES` Set to `jsonl-parser.ts`                                       |
| UUID dedup for --resume                | **NOT APPLICABLE**    | —          | Shooter uses single-file byte-offset tracking, not multi-file scanning                    |
| Session-level tool allowlists          | **NOT APPLICABLE**    | —          | Shooter uses hook-based permissions, not SDK-based                                        |

---

## Recommended Fix Order

```
WEEK 1 — Critical (blocks core features):
  C1: wsActive permission path (notifier.cjs)
  C2: FCM category mismatch (fcm-service.ts + ShooterFirebaseService.kt + notify/+server.ts)
  C3: iOS Keychain migration (SetupView.swift + NotificationManager.swift)
  C4: Replace google-services.json placeholder

WEEK 2 — High (broken UX):
  H1: /api/notify → validateAuth()
  H2: SessionWatcher multi-subscriber
  H3: Wire format text/content standardization
  H6: Missing WS message handlers (error, thinking, permission-requested)
  H7: isError field fix

WEEK 3 — High (platform gaps):
  H4: Reconfiguration path on both platforms
  H5: Permission response retry logic
  M1: --border-default CSS fix
  M2: session/[id] WS reconnect
  M5: openCodeWatcher shutdown cleanup
  M6: Token refresh server registration

LATER — Consolidation:
  M3: Integrate or delete ChatView.svelte
  L3-L8: Extract shared utilities (cache, markdown, toolTitle, config, chat renderer)
  L20: Add declarative JSONL skip list
  Turn lifecycle events from Happy
```
