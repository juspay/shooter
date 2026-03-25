# Shooter

**Mobile push notifications and remote terminal access for AI coding sessions.**

[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js_20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=socket.io&logoColor=white)](#websocket-channels)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](#docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What is Shooter?

Shooter turns your phone into a remote control for AI coding sessions running on your dev machine. It delivers push notifications to iOS and Android when Claude Code or OpenCode events occur -- tool usage, permission requests, session completions -- and lets you approve or deny permission prompts directly from a notification. You can also launch remote terminal sessions, stream output in real time, and browse structured AI conversation history, all from a mobile-optimized web interface accessible anywhere through a Cloudflare Tunnel.

## Features

- **Push notifications** -- Real-time alerts for tool usage, permission requests, session starts/stops, errors, and task completions (iOS via APNs, Android via FCM)
- **Bidirectional permissions** -- Approve or deny Claude Code permission prompts from your phone; the hook blocks until you respond
- **Remote terminal** -- Launch shell, Claude Code, or OpenCode sessions from your phone with full xterm.js rendering
- **Terminal persistence** -- PTY processes run in holder processes that survive server restarts; metadata persisted in SQLite
- **Structured Chat view** -- AI conversations rendered as message bubbles with tool-use cards and thinking indicators, parsed live from JSONL session files
- **Session browser** -- Browse coding session history across all projects
- **QR code pairing** -- Scan a QR code from the `/config` page to connect mobile apps to the server
- **WebSocket streaming** -- Three multiplexed channels: terminal I/O, session updates, and global events
- **Quick keys** -- Mobile-optimized touch bar for Ctrl+C, Tab, arrow keys, Esc, and other special characters
- **Claude Code hooks** -- Lifecycle hooks for 13 event types with context-aware notification categorization
- **Docker support** -- Multi-stage Dockerfile with arm64 and amd64 support

---

## Quick Start

```bash
git clone https://github.com/juspay/shooter.git
cd shooter
pnpm install
pnpm setup        # interactive wizard: generates .env, builds, runs health check
pnpm start        # start the server on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Visit `/config` to enter your API key for the web UI.

---

## All Setup Methods

| Method | Command | Notes |
|--------|---------|-------|
| Interactive wizard | `pnpm setup` | Recommended. Walks through env config, builds, and verifies. |
| CLI (npx) | `npx @juspay/shooter setup` | No clone needed -- runs the setup wizard directly from npm |
| One-command install | `curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh \| sh` | Clones to `~/.shooter`, installs deps, runs wizard |
| Docker | `docker compose up -d` | See [Docker](#docker) |
| Manual | See [Manual Setup](#manual-setup) | For advanced users |

### Manual Setup

```bash
git clone https://github.com/juspay/shooter.git
cd shooter
pnpm install
cp .env.example .env
# Edit .env with your values (at minimum, set API_KEY)
pnpm build
pnpm start
```

The hook notifier reads `API_KEY` from the environment. Export it in your shell profile so hooks can authenticate with the server:

```bash
echo 'export API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

---

## Architecture

```
+----------------------------------------------------------+
|  Dev Machine                                             |
|                                                          |
|  SvelteKit Server (adapter-node, port 3000)              |
|    +-- REST API (/api/terminals, /api/notify, ...)       |
|    +-- WebSocket Server (ws, noServer mode)              |
|    +-- PTY Manager (node-pty + holder processes)         |
|    +-- Terminal Store (SQLite persistence)                |
|    +-- Session Watcher (chokidar file watching)          |
|    +-- APNs Client (iOS push via @parse/node-apn)        |
|    +-- FCM Client (Android push via firebase-admin)      |
+------------------------------+---------------------------+
                               |
                     Cloudflare Tunnel
                   shooter.yourdomain.com
                               |
        +----------------------+----------------------+
        |                      |                      |
+-------+--------+   +--------+-------+   +----------+------+
| Mobile Browser  |   | iOS App        |   | Android App     |
| (web UI)        |   | (APNs push +   |   | (FCM push +     |
| Terminal, Chat, |   |  permission    |   |  WebView)       |
| Session viewer  |   |  responses)    |   |                 |
+-----------------+   +----------------+   +-----------------+
```

**Server entry point:** `server.ts` creates an HTTP server wrapping the SvelteKit handler, attaches a WebSocket server in `noServer` mode, and handles upgrade requests with ticket-based authentication.

**Terminal persistence:** PTY processes run inside separate holder processes (`pty-holder.cjs`) that survive server restarts. Terminal metadata (ID, PID, command, cwd) is persisted in SQLite so the server can reattach on restart.

**Three WebSocket channels:**

| Channel | Path | Purpose |
|---------|------|---------|
| Terminal I/O | `/ws/terminal/:id` | Raw PTY byte stream (xterm.js) |
| Session stream | `/ws/session/:id` | Structured AI conversation updates |
| Global events | `/ws/events` | Server broadcasts (new sessions, exits, permissions) |

---

## Configuration

Copy `.env.example` to `.env` and fill in your values. The `pnpm setup` wizard handles this interactively.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | **Yes** | -- | Bearer token for authenticating all API and hook requests |
| `PORT` | No | `3000` | HTTP server port |
| `DEVICE_PLATFORM` | No | `ios` | Push notification target: `ios` or `android` |
| `APNS_KEY` | No | -- | APNs private key (`.p8` file contents, newlines escaped as `\n`) |
| `APNS_KEY_ID` | No | -- | 10-character APNs key identifier from Apple Developer portal |
| `APNS_TEAM_ID` | No | -- | 10-character Apple Team ID |
| `APNS_BUNDLE_ID` | No | -- | iOS app bundle identifier (must match Xcode project) |
| `APNS_PRODUCTION` | No | `false` | Set `true` for TestFlight / App Store builds |
| `DEVICE_TOKEN` | No | -- | Target iOS device token (64-character hex) |
| `FCM_PROJECT_ID` | No | -- | Firebase project ID |
| `FCM_CLIENT_EMAIL` | No | -- | Firebase service account email |
| `FCM_PRIVATE_KEY` | No | -- | Firebase service account private key (PEM format) |
| `ANDROID_DEVICE_TOKEN` | No | -- | Target Android FCM device token |

---

## iOS Setup

### Prerequisites

- macOS with Xcode installed
- Apple Developer account with Push Notifications capability
- Physical iOS device (push notifications do not work in the simulator)

### APNs Key Setup

1. Go to [Apple Developer > Keys](https://developer.apple.com/account/resources/authkeys/list) and create a new key with **Apple Push Notifications service (APNs)** enabled
2. Download the `.p8` file
3. Note the **Key ID** (10 characters) shown after creation
4. Find your **Team ID** in [Membership Details](https://developer.apple.com/account/#/membership)

Add these to your `.env`:

```
APNS_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_KEY_ID=ABC123DEFG
APNS_TEAM_ID=XYZ789KLMN
APNS_BUNDLE_ID=com.yourcompany.shooter
DEVICE_TOKEN=<64-char-hex-from-device>
```

### Building the iOS App

```bash
cd ios/Shooter
open Shooter.xcodeproj
```

1. Select your signing team in **Signing & Capabilities**
2. Ensure the **Push Notifications** capability is enabled
3. Build and run on a physical device
4. The device token is printed to the Xcode console on first launch

For TestFlight or App Store builds, set `APNS_PRODUCTION=true` in your server `.env` to route through the production APNs gateway.

---

## Android Setup

### Prerequisites

- Android Studio
- Gradle 8.12+ (for generating the wrapper)
- Firebase project with Cloud Messaging enabled

### Firebase Setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/)
2. Add an Android app with application ID `com.shooter.android`
3. Download `google-services.json` and place it in `android/app/`
4. Go to **Project Settings > Service Accounts** and generate a new private key
5. Copy `project_id`, `client_email`, and `private_key` from the downloaded JSON into your `.env`:

```
FCM_PROJECT_ID=your-firebase-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
ANDROID_DEVICE_TOKEN=<fcm-device-token>
DEVICE_PLATFORM=android
```

### Building the Android App

```bash
cd android
chmod +x setup.sh
./setup.sh              # generates Gradle wrapper
./gradlew assembleDebug
```

The app targets SDK 35 (min SDK 26) and uses a WebView that connects to your Shooter server URL.

---

## Claude Code Hooks

Shooter integrates with Claude Code through lifecycle hooks defined in `.claude/settings.json`. A unified notifier script (`.claude/hooks/notifier.cjs`) handles all hook events.

### Captured Events

| Hook | Description |
|------|-------------|
| `PreToolUse` | Before a tool executes (file edit, bash command, etc.) |
| `PostToolUse` | After a tool completes successfully |
| `PostToolUseFailure` | After a tool fails |
| `PermissionRequest` | Claude Code asks for permission -- **blocks until you respond** |
| `SessionStart` | A new coding session begins |
| `SessionEnd` | A coding session ends |
| `Stop` | Claude Code stops execution |
| `Notification` | General notification from Claude Code |
| `SubagentStart` | A subagent is spawned |
| `SubagentStop` | A subagent completes |
| `UserPromptSubmit` | User submits a prompt |
| `TeammateIdle` | A teammate agent becomes idle |
| `TaskCompleted` | A task finishes |
| `PreCompact` | Before context compaction |

### Permission Flow

1. Claude Code triggers `PermissionRequest` hook
2. Notifier sends a push notification with the tool name and details to your phone
3. You tap **Allow** or **Deny** on the interactive notification (iOS) or in the app
4. Notifier polls `GET /api/response?requestId=...` until your decision arrives
5. The hook returns the decision to Claude Code, which proceeds or aborts

The `PermissionRequest` hook has a 180-second timeout in `.claude/settings.json`. The notifier's internal poll timeout is 120 seconds, providing a 60-second safety buffer.

### Hook Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHOOTER_USE_LOCAL` | -- | Set `true` to connect to local server instead of remote URL |
| `SHOOTER_LOCAL_PORT` | `3000` | Local server port when using `SHOOTER_USE_LOCAL` |
| `SHOOTER_API_URL` | -- | Remote server URL (when not using local) |
| `SHOOTER_PERMISSION_TIMEOUT` | `120` | Seconds to wait for a permission response |
| `API_KEY` | -- | Bearer token (must match the server's `API_KEY`) |

---

## Docker

### Quick Start

```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

### Manual Build and Run

```bash
docker build -t shooter .

docker run -d \
  --name shooter \
  --env-file .env \
  -p 3000:3000 \
  -v shooter-data:/root/.shooter \
  --restart unless-stopped \
  shooter
```

The multi-stage Dockerfile uses `node:20-slim` and includes build tools for `node-pty` and `better-sqlite3` native addons. SQLite data is persisted in the `shooter-data` volume. The `.env` file is injected at runtime and never baked into the image.

### docker-compose.yml

```yaml
services:
  shooter:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - shooter-data:/root/.shooter
    restart: unless-stopped

volumes:
  shooter-data:
```

---

## API Reference

All endpoints require the `Authorization: Bearer <API_KEY>` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check with server status |
| `GET` | `/api/terminals` | List all active and recently exited terminals |
| `POST` | `/api/terminals` | Create a new terminal session |
| `GET` | `/api/terminals/:id` | Get details for a specific terminal |
| `DELETE` | `/api/terminals/:id` | Kill and remove a terminal session |
| `POST` | `/api/terminals/:id/resize` | Resize a terminal (cols, rows) |
| `POST` | `/api/ws-ticket` | Generate a short-lived WebSocket auth ticket |
| `GET` | `/api/ws-status` | Get connected WebSocket client count |
| `POST` | `/api/notify` | Send a push notification via APNs or FCM |
| `GET` | `/api/notify` | Check notification status and history |
| `POST` | `/api/response` | Submit a permission allow/deny decision |
| `GET` | `/api/response` | Poll for a pending permission decision |
| `GET` | `/api/sessions` | List sessions across all projects |
| `POST` | `/api/webhook` | Receive external webhook events |
| `GET` | `/api/qr-config` | Generate QR code for mobile app pairing |
| `POST` | `/api/device-token` | Register a device token (iOS or Android) |
| `GET` | `/api/debug` | Debug information (APNs config, device token status) |

### WebSocket Authentication

WebSocket connections use ticket-based auth. First call `POST /api/ws-ticket` with your Bearer token to receive a single-use ticket (valid 30 seconds), then connect with `?ticket=TICKET` in the query string.

### Example: Create Terminal

```bash
curl -X POST http://localhost:3000/api/terminals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "claude", "cwd": "/Users/me/project", "cols": 80, "rows": 24}'
```

Response:

```json
{
  "id": "term_a1b2c3",
  "pid": 45231,
  "command": "claude",
  "cwd": "/Users/me/project",
  "ws": "/ws/terminal/term_a1b2c3",
  "sessionWs": "/ws/session/term_a1b2c3",
  "createdAt": "2026-03-17T10:00:00Z"
}
```

---

## Development

```bash
pnpm dev           # Vite dev server with hot reload (no WebSocket server)
pnpm build         # Production build (outputs to build/)
pnpm start         # Production server with WebSocket support (tsx server.ts)
pnpm preview       # Preview production build via Vite
pnpm check         # TypeScript type checking
pnpm run gen:types # Generate types from YAML specs (specs/types/)
pnpm lint          # ESLint
pnpm lint:fix      # ESLint with auto-fix
pnpm format        # Prettier formatting
pnpm format:check  # Check formatting without writing
```

**Note:** `pnpm dev` runs the Vite dev server, which does not include the WebSocket server or PTY manager. For full functionality (terminal sessions, live streaming), use `pnpm build && pnpm start`.

### Type System

Types are auto-generated from YAML specifications in `specs/types/` using [type-crafter](https://github.com/nicktaf/type-crafter). Never edit files in `src/generated/types/` directly -- edit the YAML specs and run `pnpm run gen:types`.

---

## Project Structure

```
shooter/
  server.ts                        # HTTP + WebSocket server entry point
  package.json                     # Dependencies and scripts (pnpm only)
  Dockerfile                       # Multi-stage Docker build
  docker-compose.yml               # Docker Compose config
  .env.example                     # Environment variable template
  svelte.config.js                 # SvelteKit config (adapter-node)
  vite.config.ts                   # Vite config (node-pty external)
  bin/
    shooter.cjs                    # CLI entry point (shooter start|setup|help)
  scripts/
    setup.cjs                      # Interactive setup wizard
    install.sh                     # One-command curl installer
  .claude/
    hooks/notifier.cjs             # Unified hook notifier (Node.js)
    settings.json                  # Hook configuration (13 event types)
  src/
    generated/types/               # Auto-generated TypeScript types (DO NOT EDIT)
    lib/
      modules/
        server/
          apn/                     # APNs push notification service
          auth.ts                  # Shared authentication helper
          cli/                     # CLI command utilities
          terminal/
            pty-manager.ts         # PTY lifecycle, scrollback, cleanup
            pty-holder.cjs         # Standalone holder process for persistence
            terminal-store.ts      # SQLite persistence for terminal metadata
            session-watcher.ts     # JSONL file watcher (chokidar)
            opencode-watcher.ts    # OpenCode session watcher
          ws/
            server.ts              # WebSocket upgrade routing
            terminal-handler.ts    # Terminal I/O channel
            session-handler.ts     # Session stream channel
            events-handler.ts      # Global event bus channel
            ticket-store.ts        # One-time auth ticket store
            keepalive.ts           # Ping/pong heartbeat
          sessions/
            jsonl-reader.ts        # Parse JSONL session files
            opencode-reader.ts     # Parse OpenCode sessions
        client/
          common/                  # Reusable UI components
          terminal/
            ChatView.svelte        # Structured AI conversation view
            LaunchSheet.svelte     # Terminal launch dialog
            QuickKeys.svelte       # Mobile quick key bar
            ConnectionStatus.svelte # Connection state indicator
            xterm-wrapper.ts       # Async xterm.js initialization
    routes/
      api/                         # REST API endpoints (17 endpoints)
      terminals/                   # Terminal list and detail pages
      project/                     # Project dashboard
      session/[id]/                # Session viewer
      config/                      # Settings page with QR pairing
  specs/types/                     # Type-crafter YAML specifications
  ios/Shooter/                     # Swift iOS app (Xcode project)
  android/                         # Kotlin Android app (Gradle project)
  docs/                            # Documentation
  plans/                           # Architecture plans and roadmap
```

---

## Troubleshooting

### Server does not start

- Verify Node.js 20+ is installed: `node --version`
- Ensure pnpm is used (npm and yarn are blocked): `pnpm --version`
- Check that `pnpm build` completed without errors before running `pnpm start`
- Confirm `.env` exists and `API_KEY` is set

### WebSocket connections fail

- `pnpm dev` does **not** run the WebSocket server. Use `pnpm build && pnpm start` for full functionality.
- Ensure you are obtaining a ticket via `POST /api/ws-ticket` before connecting
- Tickets expire after 30 seconds and are single-use

### Push notifications not arriving

- **iOS:** Verify `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, and `DEVICE_TOKEN` are all set in `.env`
- **iOS (TestFlight/App Store):** Set `APNS_PRODUCTION=true` -- sandbox tokens do not work with the production gateway and vice versa
- **Android:** Ensure `google-services.json` is in `android/app/` and FCM credentials are in `.env`
- Check `GET /api/debug` for APNs configuration status and device token validity
- Check server logs for APNs or FCM error responses

### Hooks not sending notifications

- `API_KEY` must be exported in your shell environment, not just in `.env`: `export API_KEY="..."`
- Verify the hooks are configured in `.claude/settings.json`
- Test connectivity: `curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/health`

### Terminal sessions lost after restart

- Terminal metadata is persisted in SQLite and PTY holder processes survive restarts, so running terminals are reattached automatically
- In-memory state (WebSocket connections, auth tickets, pending permission requests) is lost on restart

### node-pty build errors

- Ensure Python 3, make, and a C++ compiler are installed
- On macOS, install Xcode Command Line Tools: `xcode-select --install`
- Try rebuilding: `pnpm rebuild node-pty`

### Port already in use

- Default port is 3000. Set `PORT=<number>` in `.env` to use a different port.
- Check what is using the port: `lsof -i :3000`

---

## Security

- **Command allowlist** -- Only `zsh`, `bash`, `sh`, `fish`, `claude`, and `opencode` can be launched as terminal commands
- **Ticket-based WebSocket auth** -- Short-lived, single-use tickets (30-second expiry) keep API keys out of WebSocket URLs
- **Bearer token on all REST endpoints** -- Every request requires `Authorization: Bearer <API_KEY>`
- **Working directory validation** -- The `cwd` parameter is validated against the user's home directory; symlink traversal is blocked
- **No credentials in code** -- All secrets loaded from `.env` at runtime; `.env` is gitignored
- **APNs JWT rotation** -- Push notification tokens are generated with short expiry and rotated automatically

---

## License

MIT
