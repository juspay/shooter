# Bidirectional Permission Responses from iPhone

## Goal

When Claude Code needs permission to run a tool (e.g., `Bash: rm -rf /tmp/build`), the user receives an interactive push notification on their iPhone with **Allow / Deny** buttons. Tapping a button sends the decision back through the server to the waiting hook process, which feeds it into Claude Code — no keyboard required.

## Architecture

```text
Claude Code (blocked, waiting)
  │
  ▼
PermissionRequest hook fires (blocking)
  │
  ▼
notifier.cjs reads stdin JSON: { tool_name, tool_input, session_id, ... }
  │
  ├──► POST /api/notify with { ..., requestId, waitForResponse: true }
  │       │
  │       ▼
  │    SvelteKit server stores pending request in Map
  │       │
  │       ▼
  │    Sends APNs with category: "CLAUDE_PERMISSION" (Allow/Deny buttons)
  │       │
  │       ▼
  │    iPhone shows interactive notification
  │       │
  │       ▼
  │    User taps "Allow"
  │       │
  │       ▼
  │    iOS app POST /api/response { requestId, decision: "allow" }
  │       │
  │       ▼
  │    Server stores decision in pending request Map
  │
  ├──► Meanwhile: notifier.cjs polls GET /api/response?requestId=... every 2s
  │       │
  │       ▼
  │    Poll returns { decision: "allow" }
  │
  ▼
notifier.cjs writes to stdout:
  { "hookSpecificOutput": { "hookEventName": "PermissionRequest", "permissionDecision": "allow" } }
  │
  ▼
Claude Code unblocks, tool executes
```

## Changes by File

---

### 1. SvelteKit Server

#### 1a. New file: `src/routes/api/response/+server.ts`

Handles both storing responses (from iOS) and polling (from notifier.cjs).

**In-memory pending requests store** (module-level Map):

```typescript
pendingRequests: Map<
  requestId,
  {
    createdAt: number;
    decision: 'allow' | 'deny' | null; // null = still waiting
    decidedAt: number | null;
    toolName: string;
    toolInput: object;
    sessionId: string;
  }
>;
```

**`POST /api/response`** — Called by iOS app when user taps Allow/Deny:

- Auth: Bearer token (same API_KEY as /api/notify)
- Body: `{ requestId: string, decision: "allow" | "deny" }`
- Validates requestId exists in Map
- Stores decision + decidedAt timestamp
- Returns 200 `{ success: true }`

**`GET /api/response?requestId=...`** — Called by notifier.cjs polling loop:

- Auth: Bearer token
- If requestId not found → 404
- If decision is null → 200 `{ status: "pending" }`
- If decision is set → 200 `{ status: "decided", decision: "allow" | "deny" }`
- Cleanup: delete entry from Map after returning a decided response

**TTL cleanup**: Entries older than 5 minutes are automatically purged on each request.

Note: Use URL search params for the GET (`?requestId=xxx`) since SvelteKit dynamic route params would require a subdirectory.

#### 1b. Modify: `src/routes/api/notify/+server.ts`

When the incoming request has `waitForResponse: true` in the body:

1. Generate/use the `requestId` from the request payload
2. Store the pending request in the shared Map (import from response endpoint or use a shared module)
3. Add `category: "CLAUDE_PERMISSION"` to the APNs notification payload so iOS shows action buttons
4. Include `requestId` in the custom data payload so iOS can reference it in the response

The APNs notification object needs:

```typescript
notification.category = 'CLAUDE_PERMISSION'; // triggers iOS action buttons
notification.payload = {
  ...existingPayload,
  requestId: requestId,
  waitForResponse: true,
};
```

#### 1c. New file: `src/lib/modules/server/apn/pending-requests.ts`

Shared module for the pending requests Map so both `/api/notify` and `/api/response` can access it.

```typescript
interface PendingRequest {
  createdAt: number;
  decision: 'allow' | 'deny' | null;
  decidedAt: number | null;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
}

// Module-level singleton Map
const pendingRequests = new Map<string, PendingRequest>();

export function createPendingRequest(
  requestId: string,
  data: Omit<PendingRequest, 'createdAt' | 'decision' | 'decidedAt'>
): void;
export function setDecision(requestId: string, decision: 'allow' | 'deny'): boolean;
export function getDecision(requestId: string): {
  status: 'pending' | 'decided' | 'not_found';
  decision?: string;
};
export function cleanup(maxAgeMs?: number): void; // default 5 minutes
```

---

### 2. notifier.cjs

#### 2a. New function: `sendNotificationAndPoll(title, body, category, source, requestId, stdinData)`

This replaces the fire-and-forget `sendNotification()` call for permission events specifically.

```text
1. POST to /api/notify with:
   - title, message, category: 'permission'
   - data.requestId, data.waitForResponse: true
   - data.toolName, data.toolInput, data.sessionId
2. Wait for POST response (confirms notification was sent)
3. Start polling loop:
   - GET /api/response?requestId={requestId}
   - Every 2 seconds
   - Up to PERMISSION_TIMEOUT (default 120s, configurable via SHOOTER_PERMISSION_TIMEOUT env)
4. Return { decision: 'allow' | 'deny' } or null on timeout
```

Implementation: Promise-based with `setInterval` for polling and `setTimeout` for overall timeout. Uses `http`/`https` modules already imported.

#### 2b. Modify: `handlePermission(event)` → make async and blocking

Current (fire-and-forget):

```javascript
function handlePermission(event) {
  const { title, body } = buildPermissionNotification(event);
  sendNotification(title, body, 'permission', event.source);
}
```

New (blocking with response):

```javascript
async function handlePermission(event) {
  const { title, body } = buildPermissionNotification(event);
  const requestId = generateRequestId();

  const result = await sendNotificationAndPoll(
    title,
    body,
    'permission',
    event.source,
    requestId,
    event.data
  );

  if (result && result.decision) {
    // Output hook decision JSON to stdout for Claude Code
    const hookResponse = {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        permissionDecision: result.decision,
        permissionDecisionReason: `User ${result.decision === 'allow' ? 'approved' : 'denied'} via iPhone notification`,
      },
    };
    process.stdout.write(JSON.stringify(hookResponse));
  }
  // If null (timeout): output nothing → falls through to normal permission dialog
}
```

#### 2c. Modify: `processEvent(event)` → make async

Change from sync switch to async:

```javascript
async function processEvent(event) {
  switch (event.eventType) {
    case 'permission':
      await handlePermission(event); // only this one needs await
      break;
    // ... rest stay sync (no await needed)
  }
}
```

#### 2d. Modify: `claudeCodeMain()` → properly await processEvent

Already async, just needs to await `processEvent`:

```javascript
async function claudeCodeMain() {
  // ... existing stdin reading ...
  const event = adaptClaudeCodeEvent(cliArg, stdinData);
  await processEvent(event); // was just processEvent(event)
}
```

#### 2e. New config constants

```javascript
const PERMISSION_TIMEOUT = parseInt(process.env.SHOOTER_PERMISSION_TIMEOUT || '120') * 1000;
const POLL_INTERVAL = 2000; // 2 seconds between polls
```

#### 2f. Modify: `adaptClaudeCodeEvent` for PermissionRequest

Pass through `session_id` from stdin data so the server can track it:

```javascript
if (cliArg === 'PermissionRequest') {
  data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
  data.toolInput = stdinData?.tool_input || {};
  data.command = data.toolInput.command || '';
  data.filePath = data.toolInput.file_path || '';
  data.description = data.toolInput.description || '';
  data.sessionId = stdinData?.session_id || ''; // NEW
  return createCommonEvent('claude-code', 'permission', data);
}
```

---

### 3. iOS App

#### 3a. Modify: `NotificationManager.swift` — Register interactive category

In `requestPermission()` or a new `setupNotificationCategories()` method:

```swift
func setupNotificationCategories() {
    let allowAction = UNNotificationAction(
        identifier: "ALLOW_ACTION",
        title: "Allow",
        options: [.authenticationRequired]
    )

    let denyAction = UNNotificationAction(
        identifier: "DENY_ACTION",
        title: "Deny",
        options: [.destructive]
    )

    let permissionCategory = UNNotificationCategory(
        identifier: "CLAUDE_PERMISSION",
        actions: [allowAction, denyAction],
        intentIdentifiers: [],
        options: []
    )

    UNUserNotificationCenter.current().setNotificationCategories([permissionCategory])
}
```

Call from `requestPermission()` after authorization is granted.

#### 3b. Modify: `NotificationManager.swift` — Handle action responses

In the existing `userNotificationCenter(_:didReceive:withCompletionHandler:)`:

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
) {
    let userInfo = response.notification.request.content.userInfo
    let actionIdentifier = response.actionIdentifier

    // Handle permission responses
    if response.notification.request.content.categoryIdentifier == "CLAUDE_PERMISSION" {
        let requestId = userInfo["requestId"] as? String
        var decision: String? = nil

        switch actionIdentifier {
        case "ALLOW_ACTION":
            decision = "allow"
        case "DENY_ACTION":
            decision = "deny"
        case UNNotificationDismissActionIdentifier:
            // User dismissed — do nothing (hook will timeout → falls through to local dialog)
            break
        default:
            // User tapped notification body (opened app) — do nothing
            break
        }

        if let decision = decision, let requestId = requestId {
            sendPermissionResponse(requestId: requestId, decision: decision)
        }
    }

    // Existing notification handling...
    handleNotification(userInfo: userInfo)
    completionHandler()
}
```

#### 3c. New method: `NotificationManager.swift` — `sendPermissionResponse()`

```swift
func sendPermissionResponse(requestId: String, decision: String) {
    let serverUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? AppConfig.defaultServerURL
    // Read API key from UserDefaults (saved via ConfigurationView); fail gracefully if absent
    guard let apiKey = UserDefaults.standard.string(forKey: "apiKey"), !apiKey.isEmpty else {
        print("Permission response FAILED: no API key configured")
        return
    }

    guard let url = URL(string: "\(serverUrl)/api/response") else { return }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

    let body: [String: Any] = [
        "requestId": requestId,
        "decision": decision
    ]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)

    URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            print("Failed to send permission response: \(error)")
        }
        if let httpResponse = response as? HTTPURLResponse {
            if (200...299).contains(httpResponse.statusCode) {
                print("Permission response sent (\(decision)): HTTP \(httpResponse.statusCode)")
            } else {
                print("Permission response FAILED (\(decision)): HTTP \(httpResponse.statusCode)")
            }
        }
    }.resume()
}
```

#### 3d. Modify: `Config.swift` — Add response endpoint

```swift
struct Endpoints {
    static let notify = "/api/notify"
    static let health = "/api/health"
    static let webhook = "/api/webhook"
    static let response = "/api/response"  // NEW
}
```

---

### 4. settings.json

Add timeout to PermissionRequest hook so Claude Code doesn't kill the process during polling:

```json
"PermissionRequest": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=5175 node /Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/notifier.cjs PermissionRequest",
        "timeout": 180
      }
    ]
  }
]
```

180 seconds (3 min) gives the user enough time to respond on their phone. The notifier's internal polling timeout (120s) is shorter, so the process will exit cleanly before Claude Code kills it.

---

## Implementation Order

1. **`src/lib/modules/server/apn/pending-requests.ts`** — Shared pending requests store (no dependencies)
2. **`src/routes/api/response/+server.ts`** — POST + GET response endpoint (depends on #1)
3. **`src/routes/api/notify/+server.ts`** — Add category to APNs payload when waitForResponse (depends on #1)
4. **`notifier.cjs`** — Make PermissionRequest blocking with polling (depends on #2, #3)
5. **`.claude/settings.json`** — Add timeout to PermissionRequest hook
6. **iOS `NotificationManager.swift`** — Register category + handle action responses + POST back
7. **iOS `Config.swift`** — Add response endpoint constant

## Testing Plan

**Step 1: Server endpoints** (curl)

- POST /api/response with a test requestId + decision → verify 200
- GET /api/response?requestId=xxx → verify pending/decided status
- POST /api/notify with waitForResponse:true → verify APNs payload includes category

**Step 2: notifier.cjs polling** (manual CLI)

- Run notifier with PermissionRequest, then POST a decision via curl while it polls → verify stdout output

**Step 3: End-to-end without iOS**

- Trigger a real PermissionRequest hook, POST the decision via curl → verify Claude Code unblocks

**Step 4: iOS**

- Build and run iOS app → verify interactive notification buttons appear
- Tap Allow → verify response reaches server → verify Claude Code unblocks

## Timeout Behavior / Edge Cases

| Scenario                       | Behavior                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| User taps Allow within 120s    | Hook outputs `allow`, Claude Code proceeds                                                                     |
| User taps Deny within 120s     | Hook outputs `deny`, Claude Code skips tool                                                                    |
| User dismisses notification    | No response posted, hook times out (120s), outputs nothing → falls through to local terminal permission dialog |
| User doesn't see notification  | Same as dismiss — timeout → local dialog                                                                       |
| Server is down                 | sendNotificationAndPoll fails immediately, outputs nothing → local dialog                                      |
| Multiple permissions in-flight | Each has unique requestId, polled independently                                                                |
