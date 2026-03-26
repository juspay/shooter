# API Reference

All HTTP endpoints are served by the SvelteKit application. WebSocket channels are handled by the custom Node.js server that wraps SvelteKit.

Base URL: `https://your-host` (or `http://localhost:5173` for local development).

## Authentication

Most endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <API_KEY>
```

The token is validated against the `API_KEY` environment variable on the server. Endpoints that do not require authentication are noted individually.

---

## Terminal Management

### GET /api/terminals

List all terminals (running and recently exited).

**Authentication:** Required

**Response:**

```json
{
  "count": 2,
  "terminals": [
    {
      "id": "a1b2c3d4",
      "command": "zsh",
      "args": [],
      "cwd": "/Users/you/project",
      "pid": 12345,
      "status": "running",
      "exitCode": null,
      "createdAt": "2026-03-19T10:00:00.000Z",
      "exitedAt": null,
      "clientCount": 1,
      "lastOutput": "$ "
    }
  ],
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

| Field                     | Type                      | Description                       |
| ------------------------- | ------------------------- | --------------------------------- |
| `count`                   | number                    | Total number of terminals         |
| `terminals[].id`          | string                    | 8-character hex terminal ID       |
| `terminals[].command`     | string                    | Command that was launched         |
| `terminals[].args`        | string[]                  | Arguments passed to the command   |
| `terminals[].cwd`         | string                    | Working directory                 |
| `terminals[].pid`         | number                    | OS process ID                     |
| `terminals[].status`      | `"running"` \| `"exited"` | Current process state             |
| `terminals[].exitCode`    | number \| null            | Exit code (null if still running) |
| `terminals[].createdAt`   | string                    | ISO 8601 creation timestamp       |
| `terminals[].exitedAt`    | string \| null            | ISO 8601 exit timestamp           |
| `terminals[].clientCount` | number                    | Connected WebSocket viewers       |
| `terminals[].lastOutput`  | string \| null            | Last chunk of terminal output     |

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Success                          |
| 401  | Missing or invalid authorization |
| 500  | Server error                     |

**Example:**

```bash
curl https://your-host/api/terminals \
  -H "Authorization: Bearer $API_KEY"
```

---

### POST /api/terminals

Create a new terminal session.

**Authentication:** Required

**Request body:**

```json
{
  "command": "zsh",
  "args": [],
  "cwd": "/Users/you/project",
  "cols": 120,
  "rows": 40
}
```

| Field     | Type     | Required | Default | Description                                                                       |
| --------- | -------- | -------- | ------- | --------------------------------------------------------------------------------- |
| `command` | string   | Yes      | -       | Command to run. Must be one of: `zsh`, `bash`, `sh`, `fish`, `claude`, `opencode` |
| `args`    | string[] | No       | `[]`    | Arguments passed to the command                                                   |
| `cwd`     | string   | Yes      | -       | Working directory (must be under `$HOME`)                                         |
| `cols`    | number   | No       | `80`    | Terminal width in columns                                                         |
| `rows`    | number   | No       | `24`    | Terminal height in rows                                                           |

**Response (201):**

```json
{
  "id": "a1b2c3d4",
  "pid": 12345,
  "command": "zsh",
  "cwd": "/Users/you/project",
  "createdAt": "2026-03-19T10:00:00.000Z",
  "ws": "/ws/terminal/a1b2c3d4",
  "sessionWs": "/ws/session/a1b2c3d4"
}
```

| Field       | Type   | Description                                  |
| ----------- | ------ | -------------------------------------------- |
| `id`        | string | 8-character hex terminal ID                  |
| `pid`       | number | OS process ID                                |
| `command`   | string | Command that was launched                    |
| `cwd`       | string | Resolved working directory                   |
| `createdAt` | string | ISO 8601 creation timestamp                  |
| `ws`        | string | WebSocket path for raw PTY I/O               |
| `sessionWs` | string | WebSocket path for structured session stream |

**Status codes:**

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 201  | Terminal created                                                              |
| 400  | Validation error (missing command, invalid cwd, disallowed command, bad args) |
| 401  | Missing or invalid authorization                                              |
| 500  | Server error                                                                  |

**Example:**

```bash
curl -X POST https://your-host/api/terminals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "claude", "args": [], "cwd": "/Users/you/project"}'
```

---

### GET /api/terminals/:id

Get details for a single terminal.

**Authentication:** Required

**Response:**

```json
{
  "id": "a1b2c3d4",
  "command": "zsh",
  "args": [],
  "cwd": "/Users/you/project",
  "pid": 12345,
  "status": "running",
  "exitCode": null,
  "createdAt": "2026-03-19T10:00:00.000Z",
  "exitedAt": null,
  "clientCount": 1,
  "lastOutput": "$ ",
  "ws": "/ws/terminal/a1b2c3d4",
  "sessionWs": "/ws/session/a1b2c3d4",
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Success                          |
| 401  | Missing or invalid authorization |
| 404  | Terminal not found               |
| 500  | Server error                     |

**Example:**

```bash
curl https://your-host/api/terminals/a1b2c3d4 \
  -H "Authorization: Bearer $API_KEY"
```

---

### DELETE /api/terminals/:id

Kill a running terminal or remove an exited one.

- If the terminal is **running**: sends SIGTERM, then SIGKILL after 5 seconds if still alive.
- If the terminal has **exited**: removes it from the server's terminal list.

**Authentication:** Required

**Response (running terminal killed):**

```json
{
  "success": true,
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

**Response (exited terminal removed):**

```json
{
  "success": true,
  "removed": true,
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Terminal killed or removed       |
| 401  | Missing or invalid authorization |
| 404  | Terminal not found               |
| 500  | Server error                     |

**Example:**

```bash
curl -X DELETE https://your-host/api/terminals/a1b2c3d4 \
  -H "Authorization: Bearer $API_KEY"
```

---

### POST /api/terminals/:id/resize

Resize a running terminal.

**Authentication:** Required

**Request body:**

```json
{
  "cols": 120,
  "rows": 40
}
```

| Field  | Type   | Required | Constraints | Description          |
| ------ | ------ | -------- | ----------- | -------------------- |
| `cols` | number | Yes      | 1-500       | New width in columns |
| `rows` | number | Yes      | 1-200       | New height in rows   |

**Response:**

```json
{
  "success": true,
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Terminal resized                 |
| 400  | Missing or invalid cols/rows     |
| 401  | Missing or invalid authorization |
| 404  | Terminal not found               |
| 409  | Terminal has already exited      |
| 500  | Server error                     |

**Example:**

```bash
curl -X POST https://your-host/api/terminals/a1b2c3d4/resize \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cols": 200, "rows": 50}'
```

---

## WebSocket Authentication

### POST /api/ws-ticket

Generate a short-lived, single-use ticket for authenticating WebSocket connections. This keeps the long-lived API key out of WebSocket URL query parameters (which appear in proxy logs and browser history).

**Authentication:** Required (Bearer token)

**Rate limit:** 10 requests per minute per API key.

**Response:**

```json
{
  "ticket": "a1b2c3d4e5f6...64-hex-chars",
  "expiresIn": 30
}
```

| Field       | Type   | Description                                  |
| ----------- | ------ | -------------------------------------------- |
| `ticket`    | string | 64-character hex ticket (32 random bytes)    |
| `expiresIn` | number | Seconds until the ticket expires (always 30) |

The ticket is passed as a query parameter when opening a WebSocket:

```
ws://your-host/ws/terminal/a1b2c3d4?ticket=<ticket>
```

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Ticket generated                 |
| 401  | Missing or invalid authorization |
| 429  | Rate limit exceeded              |

**Example:**

```bash
curl -X POST https://your-host/api/ws-ticket \
  -H "Authorization: Bearer $API_KEY"
```

---

### GET /api/ws-status

Return the number of clients currently connected to the `/ws/events` channel. Used by the notification hook to decide whether to send an APNs push (skip if a WebSocket client is already listening).

**Authentication:** Required

**Response:**

```json
{
  "connectedClients": 2
}
```

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Success                          |
| 401  | Missing or invalid authorization |

**Example:**

```bash
curl https://your-host/api/ws-status \
  -H "Authorization: Bearer $API_KEY"
```

---

## Sessions

### GET /api/sessions

List projects and their Claude Code / OpenCode sessions, or fetch messages for a specific session.

**Authentication:** Required

#### List projects

Returns all projects that have session data on disk, sorted by most recently modified.

**Query parameters:**

| Param    | Type   | Default   | Description             |
| -------- | ------ | --------- | ----------------------- |
| `limit`  | number | `0` (all) | Max projects to return  |
| `offset` | number | `0`       | Skip this many projects |

**Response:**

```json
{
  "count": 15,
  "total": 3,
  "projects": [
    {
      "id": "f8a3b1c2",
      "name": "shooter",
      "fullPath": "/Users/you/project",
      "sessionCount": 5,
      "lastModified": "2026-03-19T10:00:00.000Z",
      "sessions": [
        {
          "id": "abc123-def456",
          "title": "Fix terminal resize",
          "summary": "Fixed terminal resize handling...",
          "source": "claude-code",
          "created": "2026-03-19T09:00:00.000Z",
          "modified": "2026-03-19T10:00:00.000Z",
          "messageCount": 42,
          "gitBranch": "main",
          "projectPath": "/Users/you/project"
        }
      ]
    }
  ],
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

| Field                                | Type                            | Description                                        |
| ------------------------------------ | ------------------------------- | -------------------------------------------------- |
| `count`                              | number                          | Total sessions across all projects                 |
| `total`                              | number                          | Total number of projects                           |
| `projects[].id`                      | string                          | Short hash project ID                              |
| `projects[].name`                    | string                          | Project directory name                             |
| `projects[].fullPath`                | string                          | Absolute path on disk                              |
| `projects[].sessionCount`            | number                          | Number of sessions in this project                 |
| `projects[].lastModified`            | string                          | ISO 8601 timestamp of most recent session activity |
| `projects[].sessions[].id`           | string                          | Session UUID                                       |
| `projects[].sessions[].title`        | string                          | Session title (from first prompt or metadata)      |
| `projects[].sessions[].summary`      | string                          | Brief summary of the session                       |
| `projects[].sessions[].source`       | `"claude-code"` \| `"opencode"` | Which AI tool created the session                  |
| `projects[].sessions[].created`      | string                          | ISO 8601 creation timestamp                        |
| `projects[].sessions[].modified`     | string                          | ISO 8601 last modification timestamp               |
| `projects[].sessions[].messageCount` | number                          | Number of messages in the session                  |
| `projects[].sessions[].gitBranch`    | string                          | Git branch active when session was created         |
| `projects[].sessions[].projectPath`  | string                          | Project working directory                          |

#### Get session messages

Fetch parsed conversation messages for a specific session.

**Query parameters:**

| Param     | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| `id`      | string | Yes      | Session ID                                   |
| `project` | string | No       | Project ID (helps locate the session faster) |
| `offset`  | number | No       | Message offset (default: 0)                  |
| `limit`   | number | No       | Max messages to return (default: 100)        |

**Response:**

```json
{
  "session": {
    "id": "abc123-def456",
    "title": "Fix terminal resize",
    "summary": "Fixed terminal resize handling...",
    "source": "claude-code",
    "created": "2026-03-19T09:00:00.000Z",
    "modified": "2026-03-19T10:00:00.000Z",
    "messageCount": 42,
    "gitBranch": "main",
    "projectPath": "/Users/you/project"
  },
  "messages": [
    {
      "id": "user-0",
      "role": "user",
      "parts": [{ "type": "text", "content": "Fix the resize bug" }],
      "timestamp": "2026-03-19T09:00:01.000Z"
    },
    {
      "id": "msg_abc123",
      "role": "assistant",
      "parts": [
        { "type": "thinking", "content": "Let me look at the resize handler..." },
        { "type": "text", "content": "I found the issue..." },
        { "type": "tool_use", "id": "tu_1", "toolName": "Edit", "input": {} }
      ],
      "timestamp": "2026-03-19T09:00:02.000Z"
    }
  ],
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

**Status codes:**

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 200  | Success                                   |
| 401  | Missing or invalid authorization          |
| 404  | Session not found (when querying by `id`) |

**Example (list projects):**

```bash
curl https://your-host/api/sessions \
  -H "Authorization: Bearer $API_KEY"
```

**Example (get session messages):**

```bash
curl "https://your-host/api/sessions?id=abc123-def456&project=f8a3b1c2" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Notifications

### POST /api/notify

Send an APNs push notification to the configured iOS device. Includes intelligent deduplication and spam filtering.

**Authentication:** Required

**Request body:**

```json
{
  "title": "Claude Code | shooter",
  "message": "Session complete - 5 files changed",
  "data": {
    "category": "completion",
    "source": "stop-hook",
    "project": "shooter",
    "tool": "Edit",
    "files": "pty-manager.ts, server.ts"
  },
  "waitForResponse": false
}
```

| Field             | Type    | Required | Description                                                            |
| ----------------- | ------- | -------- | ---------------------------------------------------------------------- |
| `title`           | string  | Yes      | Notification title                                                     |
| `message`         | string  | Yes      | Notification body text                                                 |
| `data`            | object  | No       | Arbitrary metadata included in the push payload                        |
| `data.category`   | string  | No       | Notification category (e.g., `"completion"`, `"debug"`)                |
| `data.source`     | string  | No       | Hook source (e.g., `"stop-hook"`, `"smart-completion-detector"`)       |
| `data.project`    | string  | No       | Project name                                                           |
| `data.tool`       | string  | No       | Tool that triggered the notification                                   |
| `data.requestId`  | string  | No       | Custom request ID (auto-generated if omitted)                          |
| `waitForResponse` | boolean | No       | If `true`, creates a pending permission request for bidirectional flow |

**Response (sent):**

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "requestId": "abc123def456",
  "result": { "statusCode": 200, "apnsId": "..." },
  "timestamp": "2026-03-19T10:00:00.000Z"
}
```

**Response (filtered):**

```json
{
  "success": true,
  "message": "Notification filtered (not sent)",
  "reason": "Duplicate notification within 10-second window",
  "timestamp": "2026-03-19T10:00:00.000Z"
}
```

**Status codes:**

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 200  | Notification sent or filtered                             |
| 400  | Missing title or message                                  |
| 401  | Missing or invalid authorization                          |
| 500  | APNs not configured, no device token, or delivery failure |

**Example:**

```bash
curl -X POST https://your-host/api/notify \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Task Complete",
    "message": "All tests passing",
    "data": { "source": "stop-hook", "project": "myapp" }
  }'
```

---

### GET /api/notify

List recent notification history (sent, filtered, and failed).

**Authentication:** Required

**Query parameters:**

| Param   | Type   | Default | Description                             |
| ------- | ------ | ------- | --------------------------------------- |
| `limit` | number | `50`    | Max records to return (server cap: 100) |

**Response:**

```json
{
  "count": 10,
  "notifications": [
    {
      "id": "abc123def456",
      "title": "Task Complete",
      "message": "All tests passing",
      "status": "sent",
      "timestamp": "2026-03-19T10:00:00.000Z",
      "source": "stop-hook",
      "project": "myapp",
      "category": "completion",
      "tool": null,
      "data": {},
      "error": null
    }
  ],
  "timestamp": "2026-03-19T10:05:00.000Z"
}
```

| Field                       | Type                                   | Description                                    |
| --------------------------- | -------------------------------------- | ---------------------------------------------- |
| `notifications[].id`        | string                                 | Request ID                                     |
| `notifications[].title`     | string                                 | Notification title                             |
| `notifications[].message`   | string                                 | Notification body                              |
| `notifications[].status`    | `"sent"` \| `"filtered"` \| `"failed"` | Delivery outcome                               |
| `notifications[].timestamp` | string                                 | ISO 8601 timestamp                             |
| `notifications[].source`    | string \| undefined                    | Hook source                                    |
| `notifications[].project`   | string \| undefined                    | Project name                                   |
| `notifications[].category`  | string \| undefined                    | Notification category                          |
| `notifications[].tool`      | string \| undefined                    | Tool name                                      |
| `notifications[].data`      | object \| undefined                    | Full metadata payload                          |
| `notifications[].error`     | string \| undefined                    | Error message (for `"failed"` or `"filtered"`) |

**Status codes:**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 200  | Success                          |
| 401  | Missing or invalid authorization |

**Example:**

```bash
curl "https://your-host/api/notify?limit=20" \
  -H "Authorization: Bearer $API_KEY"
```

---

### POST /api/response

Submit a permission decision from the iOS app (or any client). Completes the bidirectional permission flow started by a `POST /api/notify` with `waitForResponse: true`.

**Authentication:** Required

**Request body:**

```json
{
  "requestId": "abc123def456",
  "decision": "allow"
}
```

| Field       | Type                  | Required | Description                          |
| ----------- | --------------------- | -------- | ------------------------------------ |
| `requestId` | string                | Yes      | The request ID from the notification |
| `decision`  | `"allow"` \| `"deny"` | Yes      | The user's permission decision       |

**Response:**

```json
{
  "success": true,
  "message": "Decision recorded",
  "timestamp": "2026-03-19T10:00:05.000Z"
}
```

**Status codes:**

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 200  | Decision recorded                                              |
| 400  | Missing requestId or decision, or invalid decision value       |
| 401  | Missing or invalid authorization                               |
| 404  | Request not found or expired (requests expire after 5 minutes) |
| 500  | Server error                                                   |

**Example:**

```bash
curl -X POST https://your-host/api/response \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "abc123def456", "decision": "allow"}'
```

---

### GET /api/response

Poll for a permission decision. Used by the CLI notifier hook to block until the user responds via the iOS app.

**Authentication:** Required

**Query parameters:**

| Param       | Type   | Required | Description             |
| ----------- | ------ | -------- | ----------------------- |
| `requestId` | string | Yes      | The request ID to check |

**Response (pending):**

```json
{
  "status": "pending",
  "decision": null,
  "timestamp": "2026-03-19T10:00:03.000Z"
}
```

**Response (decided):**

```json
{
  "status": "decided",
  "decision": "allow",
  "timestamp": "2026-03-19T10:00:05.000Z"
}
```

| Field      | Type                          | Description                       |
| ---------- | ----------------------------- | --------------------------------- |
| `status`   | `"pending"` \| `"decided"`    | Whether a decision has been made  |
| `decision` | `"allow"` \| `"deny"` \| null | The decision (null while pending) |

**Status codes:**

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | Status returned (pending or decided) |
| 400  | Missing requestId query parameter    |
| 401  | Missing or invalid authorization     |
| 404  | Request not found or expired         |

**Example:**

```bash
curl "https://your-host/api/response?requestId=abc123def456" \
  -H "Authorization: Bearer $API_KEY"
```

---

### GET /api/health

Health check endpoint. Reports server status and configuration readiness. Does **not** require authentication.

**Authentication:** Not required

**Response:**

```json
{
  "status": "healthy",
  "environment": "development",
  "version": "1.1.0",
  "timestamp": "2026-03-19T10:00:00.000Z",
  "checks": {
    "hasApiKey": true,
    "hasAPNsConfig": true,
    "hasBundleId": true,
    "hasDeviceToken": true
  },
  "configuration": {
    "apnsKeyId": "AB12...",
    "bundleId": "com.example.app",
    "deviceTokenLength": 64,
    "production": false
  }
}
```

| Field                             | Type                        | Description                                               |
| --------------------------------- | --------------------------- | --------------------------------------------------------- |
| `status`                          | `"healthy"` \| `"degraded"` | Overall health (`"degraded"` if any critical check fails) |
| `environment`                     | string                      | `NODE_ENV` value                                          |
| `version`                         | string                      | Server version                                            |
| `checks.hasApiKey`                | boolean                     | Whether `API_KEY` is set                                  |
| `checks.hasAPNsConfig`            | boolean                     | Whether APNs key, key ID, and team ID are all set         |
| `checks.hasBundleId`              | boolean                     | Whether `APNS_BUNDLE_ID` is set                           |
| `checks.hasDeviceToken`           | boolean                     | Whether `DEVICE_TOKEN` is set                             |
| `configuration.apnsKeyId`         | string \| null              | First 4 characters of the APNs key ID (masked)            |
| `configuration.bundleId`          | string \| null              | iOS app bundle identifier                                 |
| `configuration.deviceTokenLength` | number                      | Length of the device token string                         |
| `configuration.production`        | boolean                     | Whether APNs production gateway is enabled                |

**Status codes:**

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| 200  | Always returns 200 (check `status` field for health) |

**Example:**

```bash
curl https://your-host/api/health
```

---

## WebSocket Channels

All WebSocket connections are authenticated via a single-use ticket obtained from `POST /api/ws-ticket`. Pass the ticket as a query parameter on the upgrade URL:

```
ws://your-host/ws/terminal/a1b2c3d4?ticket=<ticket>
```

Connections are kept alive with protocol-level ping/pong frames every 30 seconds. A client that does not respond to a ping within 10 seconds is terminated.

For the full wire protocol and message schemas, see the sections below. For architectural details, see `docs/GUIDANCE.md`.

---

### ws://host/ws/terminal/:id

Raw PTY I/O stream. Bidirectional: the server sends terminal output and the client sends keystrokes, resize events, and signals.

**Client-to-server messages:**

| Type     | Fields                                       | Description                                    |
| -------- | -------------------------------------------- | ---------------------------------------------- |
| `input`  | `data: string`                               | Keystrokes / pasted text to write to the PTY   |
| `resize` | `cols: number, rows: number`                 | Resize the terminal (cols: 1-500, rows: 1-200) |
| `signal` | `signal: "SIGINT" \| "SIGTERM" \| "SIGTSTP"` | Send a signal to the process                   |

**Server-to-client messages:**

| Type             | Fields                                         | Description                                         |
| ---------------- | ---------------------------------------------- | --------------------------------------------------- |
| `scrollback`     | `data: string, chunk: number, total: number`   | Scrollback replay (sent in 50 KB chunks on connect) |
| `output`         | `data: string`                                 | New terminal output                                 |
| `output-dropped` | `bytes: number`                                | Output was dropped due to backpressure              |
| `exit`           | `code: number \| null, signal: string \| null` | Terminal process exited                             |
| `error`          | `message: string`                              | Error message                                       |

---

### ws://host/ws/session/:id

Structured session stream for the Chat view. Sends parsed conversation history on connect and streams new messages, tool calls, and thinking blocks in real time.

**Client-to-server messages:**

| Type         | Fields              | Description                                                                          |
| ------------ | ------------------- | ------------------------------------------------------------------------------------ |
| `send-input` | `text: string`      | Send a complete message to the AI (written to PTY with trailing newline). Max 10 KB. |
| `cancel`     | _(none)_            | Send SIGINT to interrupt the AI process                                              |
| `subscribe`  | `sessionId: string` | Switch to a different terminal's session stream                                      |

**Server-to-client messages:**

| Type          | Fields                                                         | Description                                      |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `history`     | `messages: HistoryMessage[]`                                   | Full conversation history (sent once on connect) |
| `message`     | `role: string, content: ContentBlock[], timestamp: string`     | New user or assistant message                    |
| `tool-use`    | `name: string, input: object, status: string, id: string`      | AI invoked a tool                                |
| `tool-result` | `id: string, output: string, status: string, isError: boolean` | Tool execution result (output truncated to 2 KB) |
| `thinking`    | `text: string`                                                 | AI thinking/reasoning block                      |
| `session-end` | _(none)_                                                       | The AI turn completed (stop_reason = end_turn)   |
| `error`       | `message: string`                                              | Error message                                    |

**HistoryMessage schema:**

```json
{
  "id": "msg_abc123",
  "role": "user | assistant",
  "content": [
    { "type": "text", "content": "..." },
    { "type": "thinking", "content": "..." },
    { "type": "tool_use", "id": "tu_1", "toolName": "Edit", "input": {} },
    { "type": "tool_result", "toolUseId": "tu_1", "output": "...", "isError": false }
  ],
  "timestamp": "2026-03-19T09:00:01.000Z"
}
```

---

### ws://host/ws/events

Global event bus. Broadcast-only channel that pushes system-wide events to all connected clients. No client-to-server messages are expected.

**Server-to-client messages (on connect):**

```json
{
  "type": "welcome",
  "channel": "events",
  "clients": 3,
  "timestamp": "2026-03-19T10:00:00.000Z"
}
```

**Event types broadcast to all clients:**

| Type                   | Fields                       | Description                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `session-started`      | `sessionId, project, source` | An AI session began. `source` is `"claude-code"` or `"opencode"`. |
| `session-ended`        | `sessionId, summary`         | An AI session completed                                           |
| `permission-requested` | `requestId, tool, input`     | A permission request was sent to the iOS device                   |
| `permission-resolved`  | `requestId, decision`        | A permission request was resolved (`"allow"` or `"deny"`)         |
| `terminal-created`     | `terminalId, command`        | A new terminal was launched                                       |
| `terminal-exited`      | `terminalId, code`           | A terminal process exited                                         |

All events include a `timestamp` field (ISO 8601).
