# Shooter Manual Testing Guide

Comprehensive guide for manually testing and verifying every feature of the Shooter notification and terminal system. All commands use placeholder values (`YOUR_API_KEY`, `YOUR_DEVICE_TOKEN`) -- replace them with real values from your `.env` file before running.

**Prerequisites:**
- Server running: `pnpm build && node --import tsx server.ts` (or `pnpm start`)
- `.env` file populated with required variables (see `docs/ENVIRONMENT.md`)
- `API_KEY` exported in your shell: `export API_KEY=$(grep API_KEY .env | cut -d= -f2)`

---

## Table of Contents

1. [Server Health](#1-server-health)
2. [Authentication](#2-authentication)
3. [Terminal Lifecycle](#3-terminal-lifecycle)
4. [Session Viewer](#4-session-viewer)
5. [Web UI Pages](#5-web-ui-pages)
6. [Push Notifications](#6-push-notifications)
7. [Permission Flow (Bidirectional)](#7-permission-flow-bidirectional)
8. [QR Code Pairing](#8-qr-code-pairing)
9. [Device Token Registration](#9-device-token-registration)
10. [WebSocket Connections](#10-websocket-connections)
11. [Docker](#11-docker)
12. [Hooks](#12-hooks)

---

## 1. Server Health

### 1.1 Public health check (no auth required)

```bash
curl -s http://localhost:3000/api/health | jq .
```

**Expected response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

The `status` field will be `"healthy"` when all critical checks pass (APNs configured, device token present, bundle ID set). It will be `"degraded"` if any critical check fails. This endpoint is intentionally public -- the layout status badge polls it every 30 seconds.

### 1.2 Authenticated health check with full details

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/health?details=true" | jq .
```

**Expected response:**

```json
{
  "checks": {
    "hasApiKey": true,
    "hasAPNsConfig": true,
    "hasBundleId": true,
    "hasDeviceToken": true,
    "hasFCMConfig": false
  },
  "configuration": {
    "apnsKeyId": "AB12...",
    "bundleId": "com.example.shooter",
    "deviceTokenLength": 64,
    "fcm": {
      "configured": false,
      "hasClientEmail": false,
      "hasPrivateKey": false,
      "hasProjectId": false
    },
    "production": false
  },
  "environment": "development",
  "status": "healthy",
  "timestamp": "2026-03-22T12:00:00.000Z",
  "version": "1.1.0"
}
```

**Verify:**
- `checks.hasApiKey` is `true`
- `checks.hasAPNsConfig` is `true` (requires `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`)
- `checks.hasBundleId` is `true`
- `checks.hasDeviceToken` is `true`
- `configuration.apnsKeyId` shows first 4 chars + `...`
- `configuration.production` matches your `APNS_PRODUCTION` env var
- `hasFCMConfig` is `true` only if all three FCM vars are set (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`)

### 1.3 Detailed health without auth must fail

```bash
curl -s "http://localhost:3000/api/health?details=true" | jq .
```

**Expected:** `401` with `{"error": "Missing authorization"}`.

---

## 2. Authentication

All endpoints except `GET /api/health` (without `?details=true`) require `Authorization: Bearer <API_KEY>`. Test each protected endpoint in three ways.

### 2.1 Endpoints to test

| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| GET | `/api/health` | No |
| GET | `/api/health?details=true` | Yes |
| POST | `/api/notify` | Yes |
| GET | `/api/notify?limit=10` | Yes |
| GET | `/api/terminals` | Yes |
| POST | `/api/terminals` | Yes |
| GET | `/api/terminals/:id` | Yes |
| DELETE | `/api/terminals/:id` | Yes |
| POST | `/api/terminals/:id/resize` | Yes |
| GET | `/api/sessions` | Yes |
| GET | `/api/sessions?id=SESSION_ID` | Yes |
| POST | `/api/response` | Yes |
| GET | `/api/response?requestId=XXX` | Yes |
| POST | `/api/ws-ticket` | Yes |
| GET | `/api/ws-status` | Yes |
| POST | `/api/device-token` | Yes |
| GET | `/api/qr-config` | Yes |

### 2.2 Test without auth (expect 401)

```bash
curl -s http://localhost:3000/api/terminals | jq .
```

**Expected:**
```json
{
  "error": "Missing authorization"
}
```
HTTP status: `401`.

### 2.3 Test with wrong key (expect 401)

```bash
curl -s -H "Authorization: Bearer WRONG_KEY_12345" \
  http://localhost:3000/api/terminals | jq .
```

**Expected:**
```json
{
  "error": "Invalid API key"
}
```
HTTP status: `401`. The server uses timing-safe comparison (`crypto.timingSafeEqual`), so the response time should not vary with how many characters match.

### 2.4 Test with correct key (expect 200)

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/terminals | jq .
```

**Expected:** `200` with JSON containing `terminals` array and `count`.

### 2.5 Bulk auth smoke test

Run this to test all protected endpoints in one pass:

```bash
API_KEY="YOUR_API_KEY"
BASE="http://localhost:3000"

echo "=== No auth (expect 401) ==="
for ep in "/api/terminals" "/api/sessions" "/api/ws-status" "/api/qr-config" "/api/notify?limit=1"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$ep")
  echo "  GET $ep -> $STATUS"
done

echo ""
echo "=== Wrong key (expect 401) ==="
for ep in "/api/terminals" "/api/sessions" "/api/ws-status"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer WRONG" "$BASE$ep")
  echo "  GET $ep -> $STATUS"
done

echo ""
echo "=== Correct key (expect 200) ==="
for ep in "/api/terminals" "/api/sessions" "/api/ws-status" "/api/qr-config" "/api/notify?limit=1"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" "$BASE$ep")
  echo "  GET $ep -> $STATUS"
done
```

**Expected:** All "No auth" and "Wrong key" lines show `401`. All "Correct key" lines show `200`.

---

## 3. Terminal Lifecycle

### 3.1 Create a bash terminal

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "bash",
    "cwd": "'$HOME'",
    "cols": 120,
    "rows": 40
  }' | jq .
```

**Expected response (201 Created):**

```json
{
  "id": "a1b2c3d4",
  "pid": 12345,
  "command": "bash",
  "cwd": "/Users/yourname",
  "createdAt": "2026-03-22T12:00:00.000Z",
  "ws": "/ws/terminal/a1b2c3d4",
  "sessionWs": "/ws/session/a1b2c3d4"
}
```

**Save the terminal ID for subsequent tests:**

```bash
TERM_ID=$(curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"'$HOME'","cols":120,"rows":40}' | jq -r '.id')
echo "Created terminal: $TERM_ID"
```

### 3.2 Create a Claude Code terminal

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "claude",
    "cwd": "'$HOME'/Developer/Personal/shooter",
    "cols": 120,
    "rows": 40
  }' | jq .
```

**Expected:** `201` with the same structure. `command` will be `"claude"`.

**Allowed commands:** `zsh`, `bash`, `sh`, `fish`, `claude`, `opencode`. Any other command returns `400`:

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"rm","cwd":"'$HOME'"}' | jq .
```

**Expected:** `400` with `{"error": "Command not allowed. Allowed: zsh, bash, sh, fish, claude, opencode"}`.

### 3.3 Create terminal -- validation errors

**Missing command:**

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cwd":"'$HOME'"}' | jq .
```

**Expected:** `400` with `{"error": "command is required"}`.

**Missing cwd:**

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash"}' | jq .
```

**Expected:** `400` with `{"error": "cwd is required"}`.

**cwd outside home directory:**

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"/etc"}' | jq .
```

**Expected:** `400` with `{"error": "Working directory must be under home directory"}`.

### 3.4 List all terminals

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/terminals | jq .
```

**Expected response:**

```json
{
  "count": 1,
  "terminals": [
    {
      "id": "a1b2c3d4",
      "command": "bash",
      "args": [],
      "cwd": "/Users/yourname",
      "pid": 12345,
      "status": "running",
      "exitCode": null,
      "exitedAt": null,
      "clientCount": 0,
      "createdAt": "2026-03-22T12:00:00.000Z"
    }
  ],
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

**Verify:**
- `count` matches number of terminals you created
- Each terminal has `status: "running"` if still alive
- `clientCount` shows how many WebSocket clients are attached

### 3.5 Get a single terminal

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/terminals/$TERM_ID" | jq .
```

**Expected:** Terminal details including `lastOutput` (last scrollback line), `ws` and `sessionWs` paths.

**Non-existent terminal:**

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/terminals/nonexistent123 | jq .
```

**Expected:** `404` with `{"error": "Terminal not found"}`.

### 3.6 Resize a terminal

```bash
curl -s -X POST "http://localhost:3000/api/terminals/$TERM_ID/resize" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cols": 200, "rows": 50}' | jq .
```

**Expected:** `200` with `{"success": true, "timestamp": "..."}`.

**Validation -- values too large:**

```bash
curl -s -X POST "http://localhost:3000/api/terminals/$TERM_ID/resize" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cols": 600, "rows": 50}' | jq .
```

**Expected:** `400` with `{"error": "cols must be <= 500 and rows must be <= 200"}`.

### 3.7 Kill a terminal

```bash
curl -s -X DELETE "http://localhost:3000/api/terminals/$TERM_ID" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .
```

**Expected:** `200` with `{"success": true, "timestamp": "..."}`.

After killing, list terminals again -- the terminal should show `"status": "exited"` with an `exitCode`. Exited terminals are cleaned up after 1 hour or when the count exceeds 10.

**Delete an already-exited terminal to remove it immediately:**

```bash
curl -s -X DELETE "http://localhost:3000/api/terminals/$TERM_ID" \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .
```

**Expected:** `200` with `{"success": true, "removed": true, "timestamp": "..."}`.

### 3.8 Verify SQLite persistence

Terminal metadata is persisted to `~/.shooter/shooter.db` (SQLite with WAL mode).

```bash
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.env.HOME, '.shooter', 'shooter.db'));
const rows = db.prepare('SELECT id, command, cwd, status, pid, holder_pid FROM terminals ORDER BY created_at DESC LIMIT 10').all();
console.table(rows);
db.close();
"
```

**Expected:** A table showing your terminals with columns `id`, `command`, `cwd`, `status`, `pid`, `holder_pid`.

**Verify running terminals have a live holder process:**

```bash
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.env.HOME, '.shooter', 'shooter.db'));
const rows = db.prepare(\"SELECT id, holder_pid FROM terminals WHERE status = 'running'\").all();
for (const row of rows) {
  try {
    process.kill(row.holder_pid, 0);
    console.log('Terminal ' + row.id + ': holder PID ' + row.holder_pid + ' is ALIVE');
  } catch {
    console.log('Terminal ' + row.id + ': holder PID ' + row.holder_pid + ' is DEAD');
  }
}
db.close();
"
```

### 3.9 Server restart recovery

This tests that the holder process (forked, detached) survives server restarts and reconnects after the server comes back.

**Step 1 -- Create a terminal and note the ID:**

```bash
TERM_ID=$(curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"'$HOME'"}' | jq -r '.id')
echo "Terminal ID: $TERM_ID"
```

**Step 2 -- Stop the server (Ctrl+C or kill the process).**

**Step 3 -- Verify the holder process is still alive:**

```bash
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.env.HOME, '.shooter', 'shooter.db'));
const row = db.prepare(\"SELECT holder_pid FROM terminals WHERE id = '$TERM_ID'\").get();
if (row) {
  try {
    process.kill(row.holder_pid, 0);
    console.log('Holder PID ' + row.holder_pid + ' is ALIVE (survived server shutdown)');
  } catch {
    console.log('Holder PID ' + row.holder_pid + ' is DEAD');
  }
}
db.close();
"
```

**Expected:** Holder is ALIVE.

**Step 4 -- Restart the server:**

```bash
node --import tsx server.ts
```

Watch the startup logs. You should see messages like:

```
[pty-manager] Reconnecting terminal a1b2c3d4 (holder PID 12345)...
```

**Step 5 -- Verify the terminal reappears:**

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/terminals/$TERM_ID" | jq '.status'
```

**Expected:** `"running"`.

---

## 4. Session Viewer

### 4.1 List all projects with sessions

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/sessions | jq .
```

**Expected response:**

```json
{
  "count": 42,
  "projects": [
    {
      "id": "abc123",
      "name": "shooter",
      "fullPath": "/Users/yourname/Developer/Personal/shooter",
      "sessionCount": 15,
      "lastModified": "2026-03-22T10:00:00.000Z",
      "sessions": [
        {
          "id": "session-uuid",
          "title": "Add terminal resize support",
          "modified": "2026-03-22T10:00:00.000Z",
          "messageCount": 28
        }
      ]
    }
  ],
  "timestamp": "2026-03-22T12:00:00.000Z",
  "total": 5
}
```

**Verify:**
- `total` is greater than 0 (you have at least one project with Claude Code or OpenCode sessions)
- `count` is the sum of all `sessionCount` values across all projects
- Each project has a non-empty `sessions` array
- Sessions are sorted by `modified` (newest first)

### 4.2 List projects with pagination

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/sessions?limit=2&offset=0" | jq '.projects | length'
```

**Expected:** `2` (or fewer if you have fewer than 2 projects).

### 4.3 Get messages for a specific session

First, grab a session ID and its project ID from the project listing:

```bash
# Get the first session from the first project
SESSION_INFO=$(curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/sessions | jq -r '.projects[0] | "\(.id) \(.sessions[0].id)"')
PROJECT_ID=$(echo $SESSION_INFO | cut -d' ' -f1)
SESSION_ID=$(echo $SESSION_INFO | cut -d' ' -f2)
echo "Project: $PROJECT_ID, Session: $SESSION_ID"
```

Then fetch the session messages:

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/sessions?id=$SESSION_ID&project=$PROJECT_ID" | jq .
```

**Expected response:**

```json
{
  "session": {
    "id": "session-uuid",
    "title": "Add terminal resize support",
    "modified": "2026-03-22T10:00:00.000Z",
    "messageCount": 28
  },
  "messages": [
    {
      "role": "human",
      "content": "...",
      "timestamp": "..."
    },
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "..."
    }
  ],
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

**Verify:**
- `messages` array is not empty
- Messages alternate between `"human"` and `"assistant"` roles (approximately)
- `session.title` is a real title, not `"Untitled Session"` (unless the session was genuinely untitled)
- `session.messageCount` is greater than 0

### 4.4 Session pagination

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/sessions?id=$SESSION_ID&project=$PROJECT_ID&offset=0&limit=5" \
  | jq '.messages | length'
```

**Expected:** `5` (or fewer if the session has fewer than 5 messages).

### 4.5 Non-existent session

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/sessions?id=nonexistent-session-id" | jq .
```

**Expected:** `404` with `{"error": "Session not found"}`.

---

## 5. Web UI Pages

Open each page in a browser at `http://localhost:3000`. The layout provides a header (logo + status badge + gear icon) and a bottom tab bar with "Projects" and "Terminals" tabs.

### 5.1 Home page (`/`)

Open: `http://localhost:3000/`

**Check:**
- [ ] Header shows the Shooter logo (app-icon.png) and "Shooter" text
- [ ] Status badge in the header shows "healthy" (green) or "degraded" (yellow)
- [ ] Bottom tab bar shows "Projects" and "Terminals" tabs
- [ ] "Projects" tab is highlighted/active (green color)
- [ ] A list of projects appears, each showing project name, session count, and last modified date
- [ ] Tapping a project navigates to `/project` with its sessions listed
- [ ] Sessions within a project show title, message count, and modification date

### 5.2 Project detail page (`/project`)

Open: navigate from home page by clicking a project.

**Check:**
- [ ] Project name displayed
- [ ] Sessions listed with titles and dates
- [ ] Clicking a session navigates to `/session/[id]`

### 5.3 Session detail page (`/session/[id]`)

Open: navigate from a project by clicking a session.

**Check:**
- [ ] Session title displayed in the page header
- [ ] Messages render as a conversation (human messages and assistant messages)
- [ ] The ChatView component displays formatted messages
- [ ] Code blocks within messages are rendered with syntax highlighting (if applicable)
- [ ] Scroll through the conversation to verify all messages load
- [ ] If this is a live/active session, new messages should appear in real-time via WebSocket

### 5.4 Terminals page (`/terminals`)

Open: `http://localhost:3000/terminals` or tap the "Terminals" tab.

**Check:**
- [ ] "Terminals" tab in the bottom bar is highlighted/active
- [ ] If no terminals exist, an empty state is shown
- [ ] If terminals exist, each shows as a card with command, cwd, status (running/exited), PID
- [ ] Running terminals show a "running" indicator
- [ ] Exited terminals show exit code
- [ ] A launch sheet (button or UI) allows creating new terminals
- [ ] The launch sheet lets you pick command (bash/zsh/claude/opencode), set cwd, and optionally set cols/rows

### 5.5 Terminal detail page (`/terminals/[id]`)

Open: click a terminal card on the `/terminals` page.

**Check:**
- [ ] Terminal renders in an xterm.js instance (dark background, monospace font)
- [ ] You can type commands and see output in real-time
- [ ] A Raw/Chat toggle exists -- Raw shows raw terminal output, Chat shows ChatView (for claude/opencode terminals)
- [ ] The terminal auto-connects via WebSocket
- [ ] ConnectionStatus indicator shows connected state
- [ ] QuickKeys bar provides shortcut buttons for common actions
- [ ] Resizing the browser window resizes the terminal (if resize handler is wired up)

### 5.6 Settings page (`/config`)

Open: `http://localhost:3000/config` or click the gear icon in the header.

**Check:**
- [ ] The gear icon in the header is highlighted when on this page
- [ ] A configuration form is displayed
- [ ] A QR code is shown for mobile app pairing (contains `{apiKey, serverUrl}`)
- [ ] A "Test Connection" button exists -- clicking it sends a test notification
- [ ] Server URL displayed matches the tunnel or local address

---

## 6. Push Notifications

### 6.1 Send a test notification (iOS/APNs)

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "message": "This is a manual test from the testing guide.",
    "data": {
      "source": "manual-test",
      "category": "test",
      "project": "shooter"
    }
  }' | jq .
```

**Expected response:**

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "requestId": "abc123def456",
  "result": { "statusCode": 200 },
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

**Verify:**
- Response shows `"success": true`
- Your iOS device receives the push notification
- The notification title is "Test Notification" and body is the message text

### 6.2 Send notification -- validation errors

**Missing title:**

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "no title"}' | jq .
```

**Expected:** `400` with `{"error": "Title and message are required"}`.

**Missing message:**

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "no message"}' | jq .
```

**Expected:** `400` with `{"error": "Title and message are required"}`.

### 6.3 Notification deduplication

Send the same notification twice within 10 seconds:

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Dedup Test","message":"Same message","data":{"category":"test"}}' | jq .success

# Immediately send the same one again
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Dedup Test","message":"Same message","data":{"category":"test"}}' | jq .
```

**Expected:** First call returns `"success": true` with `"message": "Notification sent successfully"`. Second call returns `"success": true` with `"message": "Notification filtered (not sent)"` and a `reason` mentioning "Duplicate notification within 10-second window".

### 6.4 Notification filtering (spam patterns)

The server filters notifications matching spam patterns. These should be filtered:

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"PreToolUse","message":"Read Starting | shooter"}' | jq .message
```

**Expected:** `"Notification filtered (not sent)"`.

### 6.5 View notification history

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/notify?limit=10" | jq .
```

**Expected response:**

```json
{
  "count": 3,
  "notifications": [
    {
      "id": "abc123",
      "title": "Test Notification",
      "message": "This is a manual test...",
      "status": "sent",
      "timestamp": "2026-03-22T12:00:00.000Z",
      "source": "manual-test",
      "category": "test",
      "project": "shooter"
    }
  ],
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

**Verify:**
- `notifications` array contains your recent test notifications
- Sent notifications have `"status": "sent"`
- Filtered notifications have `"status": "filtered"` with an `error` explaining why
- Failed notifications have `"status": "failed"` with the error details

### 6.6 Send notification for Android (FCM)

This requires `DEVICE_PLATFORM=android` in the server environment and FCM credentials configured.

```bash
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Android Test",
    "message": "Testing FCM delivery.",
    "data": {"source": "manual-test"}
  }' | jq .
```

**Expected:** If FCM is configured, `"success": true` with a `messageId` in the result. If not configured, `500` with `"error": "FCM not configured"`.

---

## 7. Permission Flow (Bidirectional)

### 7.1 Send a permission request notification

```bash
REQUEST_ID="test-perm-$(date +%s)"

curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Permission Required",
    "message": "Claude wants to run: rm -rf node_modules",
    "waitForResponse": true,
    "data": {
      "requestId": "'$REQUEST_ID'",
      "source": "manual-test",
      "toolName": "Bash",
      "toolInput": {"command": "rm -rf node_modules"},
      "sessionId": "test-session-123"
    }
  }' | jq .
```

**Expected:**
- `"success": true`
- `requestId` in response matches your `$REQUEST_ID`
- iOS notification arrives with the `CLAUDE_PERMISSION` category (showing Allow/Deny buttons)

### 7.2 Poll for a decision (before responding)

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/response?requestId=$REQUEST_ID" | jq .
```

**Expected:** `200` with `{"status": "pending", "decision": null, "timestamp": "..."}`.

### 7.3 Submit a decision (allow)

```bash
curl -s -X POST http://localhost:3000/api/response \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "'$REQUEST_ID'",
    "decision": "allow"
  }' | jq .
```

**Expected:** `200` with `{"success": true, "message": "Decision recorded", "timestamp": "..."}`.

### 7.4 Poll for a decision (after responding)

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/response?requestId=$REQUEST_ID" | jq .
```

**Expected:** `200` with `{"status": "decided", "decision": "allow", "timestamp": "..."}`.

### 7.5 Submit a deny decision

```bash
REQUEST_ID2="test-deny-$(date +%s)"

# First create the pending request
curl -s -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Permission Required",
    "message": "Claude wants to delete files",
    "waitForResponse": true,
    "data": {"requestId": "'$REQUEST_ID2'", "source": "manual-test"}
  }' | jq .requestId

# Submit deny
curl -s -X POST http://localhost:3000/api/response \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "'$REQUEST_ID2'", "decision": "deny"}' | jq .
```

**Expected:** `"success": true` and decision `"deny"`.

### 7.6 Validation errors

**Missing requestId:**

```bash
curl -s -X POST http://localhost:3000/api/response \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"decision": "allow"}' | jq .
```

**Expected:** `400` with `{"error": "requestId and decision are required"}`.

**Invalid decision value:**

```bash
curl -s -X POST http://localhost:3000/api/response \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "test", "decision": "maybe"}' | jq .
```

**Expected:** `400` with `{"error": "decision must be \"allow\" or \"deny\""}`.

**Non-existent/expired request:**

```bash
curl -s -X POST http://localhost:3000/api/response \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "expired-request-xyz", "decision": "allow"}' | jq .
```

**Expected:** `404` with `{"error": "Request not found or expired"}`.

### 7.7 End-to-end permission test with Claude Code

**Step 1:** Start Claude Code in a project that has Shooter hooks configured.

**Step 2:** Give Claude a prompt that requires tool use with a permission gate (e.g., remove a file from the permissions allow list in `.claude/settings.json` so it triggers a `PermissionRequest` hook).

**Step 3:** Verify your phone receives the push notification with Allow/Deny buttons.

**Step 4:** Tap "Allow" or "Deny" on the phone notification.

**Step 5:** Verify Claude Code continues (if allowed) or shows a blocked message (if denied). The notifier polls `GET /api/response?requestId=XXX` every 2 seconds with a 120-second timeout.

---

## 8. QR Code Pairing

### 8.1 Generate QR configuration

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/qr-config | jq .
```

**Expected response:**

```json
{
  "dataUrl": "data:image/png;base64,iVBOR...",
  "serverUrl": "http://localhost:3000"
}
```

**Verify:**
- `dataUrl` is a valid base64 PNG data URL
- `serverUrl` matches your server address (may show tunnel URL if behind Cloudflare)
- The QR code encodes a JSON payload: `{"apiKey": "YOUR_API_KEY", "serverUrl": "http://..."}`

### 8.2 Verify QR code renders

**In terminal (decode the QR content):**

```bash
QR_DATA=$(curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/qr-config | jq -r '.dataUrl')
echo "$QR_DATA" | head -c 50
```

**Expected:** Starts with `data:image/png;base64,`.

**In browser:** Navigate to `http://localhost:3000/config`. The QR code should be visually displayed on the settings page.

### 8.3 Scan with phone app

**Step 1:** Open the Shooter iOS app (or Android app).

**Step 2:** Navigate to the pairing/settings screen.

**Step 3:** Scan the QR code displayed on `http://localhost:3000/config`.

**Step 4:** Verify the app connects to the server and registers its device token.

---

## 9. Device Token Registration

### 9.1 Register an iOS device token

```bash
curl -s -X POST http://localhost:3000/api/device-token \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "ios",
    "deviceToken": "YOUR_DEVICE_TOKEN"
  }' | jq .
```

**Expected response:**

```json
{
  "success": true,
  "platform": "ios",
  "timestamp": "2026-03-22T12:00:00.000Z"
}
```

### 9.2 Register an Android device token

```bash
curl -s -X POST http://localhost:3000/api/device-token \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "android",
    "token": "YOUR_ANDROID_FCM_TOKEN"
  }' | jq .
```

**Expected:** `200` with `"success": true` and `"platform": "android"`.

Note: iOS sends `deviceToken`, Android sends `token`. Both are accepted.

### 9.3 Verify device-tokens.json is updated

```bash
cat ~/.shooter/device-tokens.json | jq .
```

**Expected:**

```json
{
  "ios": "YOUR_DEVICE_TOKEN",
  "android": "YOUR_ANDROID_FCM_TOKEN"
}
```

### 9.4 Validation errors

**Missing platform:**

```bash
curl -s -X POST http://localhost:3000/api/device-token \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"deviceToken": "abc123"}' | jq .
```

**Expected:** `400` with `{"error": "Missing or invalid platform (must be \"ios\" or \"android\")"}`.

**Invalid platform:**

```bash
curl -s -X POST http://localhost:3000/api/device-token \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "windows", "token": "abc123"}' | jq .
```

**Expected:** `400` with `{"error": "Missing or invalid platform (must be \"ios\" or \"android\")"}`.

**Missing token:**

```bash
curl -s -X POST http://localhost:3000/api/device-token \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "ios"}' | jq .
```

**Expected:** `400` with `{"error": "Missing device token (deviceToken or token)"}`.

---

## 10. WebSocket Connections

### 10.1 Get a WebSocket ticket

WebSocket connections are authenticated via short-lived tickets (32-byte hex, valid 30 seconds) to avoid exposing the API key in URL query strings.

```bash
curl -s -X POST http://localhost:3000/api/ws-ticket \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .
```

**Expected response:**

```json
{
  "ticket": "a1b2c3d4e5f6...",
  "expiresIn": 30
}
```

**Verify:**
- `ticket` is a 64-character hex string (32 bytes)
- `expiresIn` is `30` (seconds)

### 10.2 Rate limiting on ticket endpoint

The ticket endpoint is rate-limited to 10 requests per minute per API key.

```bash
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    http://localhost:3000/api/ws-ticket \
    -H "Authorization: Bearer YOUR_API_KEY")
  echo "Request $i: $STATUS"
done
```

**Expected:** First 10 requests return `200`. Requests 11 and 12 return `429` with `{"error": "Rate limit exceeded. Maximum 10 ticket requests per minute."}`.

### 10.3 Check WebSocket status

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/ws-status | jq .
```

**Expected response:**

```json
{
  "connectedClients": 0
}
```

`connectedClients` shows the number of active WebSocket connections. Open a terminal page in the browser and check again -- the count should increase.

### 10.4 Connect to a terminal WebSocket

WebSocket connections require a valid ticket and connect to paths like `/ws/terminal/:id`, `/ws/session/:id`, or `/ws/events`.

**Using websocat (install: `brew install websocat`):**

```bash
# Get a ticket
TICKET=$(curl -s -X POST http://localhost:3000/api/ws-ticket \
  -H "Authorization: Bearer YOUR_API_KEY" | jq -r '.ticket')

# Connect to a terminal WebSocket
websocat "ws://localhost:3000/ws/terminal/$TERM_ID?ticket=$TICKET"
```

**Expected:** Connection opens, you see terminal output (scrollback), and can type commands.

**Using wscat (install: `npm install -g wscat`):**

```bash
TICKET=$(curl -s -X POST http://localhost:3000/api/ws-ticket \
  -H "Authorization: Bearer YOUR_API_KEY" | jq -r '.ticket')

wscat -c "ws://localhost:3000/ws/terminal/$TERM_ID?ticket=$TICKET"
```

### 10.5 Connect to the events WebSocket

```bash
TICKET=$(curl -s -X POST http://localhost:3000/api/ws-ticket \
  -H "Authorization: Bearer YOUR_API_KEY" | jq -r '.ticket')

websocat "ws://localhost:3000/ws/events?ticket=$TICKET"
```

**Expected:** Connection opens. Server-sent events (terminal creation/exit, session updates) will appear as JSON messages.

### 10.6 Invalid ticket

```bash
websocat "ws://localhost:3000/ws/events?ticket=invalidticket123"
```

**Expected:** Connection refused with 401 Unauthorized.

---

## 11. Docker

### 11.1 Build and start with Docker Compose

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
docker compose up --build -d
```

**Expected:** Container starts, exposes port 3000. Logs show `Shooter server running on http://localhost:3000`.

### 11.2 Verify health endpoint in Docker

```bash
curl -s http://localhost:3000/api/health | jq .
```

**Expected:** `{"status": "healthy", "timestamp": "..."}` (or `"degraded"` if env vars are missing in the container).

### 11.3 Verify terminal creation in Docker

```bash
curl -s -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"/root"}' | jq .
```

**Expected:** `201` with terminal details. Note: `cwd` must be under the container's home directory (`/root`).

### 11.4 Verify data persistence

The `docker-compose.yml` mounts a named volume at `/root/.shooter` for SQLite persistence.

```bash
# Stop and restart the container
docker compose down
docker compose up -d

# Verify terminal records survived
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/terminals | jq .count
```

### 11.5 View container logs

```bash
docker compose logs -f shooter
```

### 11.6 Cleanup

```bash
docker compose down -v   # -v removes the named volume too
```

---

## 12. Hooks

### 12.1 Verify hook configuration

Check that `.claude/settings.json` has hooks configured with relative paths:

```bash
cat /Users/sachinsharma/Developer/Personal/shooter/.claude/settings.json | jq '.hooks | keys'
```

**Expected:** An array of hook event names:

```json
[
  "Notification",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "PreCompact",
  "PreToolUse",
  "SessionEnd",
  "SessionStart",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "TaskCompleted",
  "TeammateIdle",
  "UserPromptSubmit"
]
```

### 12.2 Verify each hook command structure

```bash
cat /Users/sachinsharma/Developer/Personal/shooter/.claude/settings.json \
  | jq '.hooks | to_entries[] | {event: .key, command: .value[0].hooks[0].command}'
```

**Expected:** Each hook command follows the pattern:

```
SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY node .claude/hooks/notifier.cjs <EventName>
```

**Verify:**
- All commands use relative path `.claude/hooks/notifier.cjs` (not absolute)
- All commands pass `SHOOTER_USE_LOCAL=true` and `SHOOTER_LOCAL_PORT=3000`
- All commands reference `API_KEY=$API_KEY` (uses shell env variable)
- `PermissionRequest` hook has `"timeout": 180` (3 minutes)

### 12.3 Verify API_KEY is in shell environment

```bash
echo "API_KEY is: ${API_KEY:+set (length ${#API_KEY})}"
```

**Expected:** `API_KEY is: set (length XX)`. If it says nothing after "is:", the key is not exported. Fix with:

```bash
export API_KEY=$(grep '^API_KEY=' /Users/sachinsharma/Developer/Personal/shooter/.env | cut -d= -f2)
```

### 12.4 Verify notifier.cjs exists and is valid

```bash
node -e "require('/Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/notifier.cjs')" 2>&1 && echo "OK: notifier.cjs loads without errors" || echo "FAIL: notifier.cjs has syntax errors"
```

**Expected:** `OK: notifier.cjs loads without errors` (the script may print a warning about missing API_KEY if not set, but should not have syntax errors).

### 12.5 Trigger a hook event manually

Simulate what Claude Code does when it invokes a hook -- pipe JSON to stdin and pass the event name as an argument:

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"/tmp/test.txt"}}' | \
  SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY \
  node /Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/notifier.cjs PreToolUse
```

**Expected:** The notifier processes the event. Check the server logs for:
```
[notify] ... (or the notification may be filtered as a PreToolUse spam pattern)
```

### 12.6 Trigger a Stop hook (completion notification)

```bash
echo '{"session_id":"test-123","stop_hook_active":true}' | \
  SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY \
  node /Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/notifier.cjs Stop
```

**Expected:** A notification is sent to your device (Stop hook notifications are always allowed through the filter). Check server logs for a successful send.

### 12.7 Trigger a Notification hook

```bash
echo '{"title":"Task Complete","message":"Finished refactoring auth module","notification_type":"completion"}' | \
  SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY \
  node /Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/notifier.cjs Notification
```

**Expected:** Push notification delivered to your device with the title and message.

### 12.8 Full hook integration test

**Step 1:** Start the Shooter server if not running:

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && node --import tsx server.ts
```

**Step 2:** In a separate terminal, start Claude Code in the shooter project:

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && claude
```

**Step 3:** Give Claude a task (e.g., "read the README"). This triggers `PreToolUse`, `PostToolUse`, and eventually `Stop` hooks.

**Step 4:** Watch the server logs for hook notification events. You should see log lines like:

```
[notify] ... source: stop-hook ...
```

**Step 5:** Verify push notifications arrive on your device for significant events (session completion, errors).

---

## Quick Reference: All API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Public status check (status + timestamp only) |
| GET | `/api/health?details=true` | Yes | Full health with checks and configuration |
| POST | `/api/notify` | Yes | Send push notification (APNs or FCM) |
| GET | `/api/notify?limit=N` | Yes | Get notification history (default limit: 50) |
| GET | `/api/terminals` | Yes | List all terminals (active + exited) |
| POST | `/api/terminals` | Yes | Create terminal (body: command, cwd, cols, rows, args) |
| GET | `/api/terminals/:id` | Yes | Get terminal details |
| DELETE | `/api/terminals/:id` | Yes | Kill/remove terminal |
| POST | `/api/terminals/:id/resize` | Yes | Resize terminal (body: cols, rows) |
| GET | `/api/sessions` | Yes | List projects with sessions (query: limit, offset) |
| GET | `/api/sessions?id=X&project=Y` | Yes | Get session messages (query: offset, limit) |
| POST | `/api/response` | Yes | Submit permission decision (body: requestId, decision) |
| GET | `/api/response?requestId=X` | Yes | Poll for permission decision |
| POST | `/api/ws-ticket` | Yes | Generate WebSocket auth ticket (rate-limited: 10/min) |
| GET | `/api/ws-status` | Yes | Get connected WebSocket client count |
| POST | `/api/device-token` | Yes | Register device token (body: platform, deviceToken/token) |
| GET | `/api/qr-config` | Yes | Generate QR code for mobile pairing |

| WebSocket Path | Auth | Description |
|----------------|------|-------------|
| `/ws/terminal/:id?ticket=T` | Ticket | Terminal I/O (stdin/stdout) |
| `/ws/session/:id?ticket=T` | Ticket | Live session message stream |
| `/ws/events?ticket=T` | Ticket | Global server event bus |
