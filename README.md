# Shooter

**Mobile terminal access and push notifications for AI coding sessions.**

[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=socket.io&logoColor=white)](#websocket-channels)
[![node-pty](https://img.shields.io/badge/node--pty-339933?logo=node.js&logoColor=white)](https://github.com/nicktaf/node-pty)
[![xterm.js](https://img.shields.io/badge/xterm.js-000000?logo=windowsterminal&logoColor=white)](https://xtermjs.org/)

---

## What is Shooter?

Shooter turns your phone into a remote control for AI coding sessions running on your dev machine. It provides a mobile-optimized web interface for launching and interacting with terminal sessions (shell, Claude Code, OpenCode), streaming real-time output over WebSocket, and viewing structured AI conversations in a chat format -- all accessible from anywhere through a Cloudflare Tunnel.

The system also delivers push notifications to an iOS app when coding events occur, such as tool usage or permission requests. You can approve or deny permission prompts directly from your phone, enabling fully hands-off AI coding workflows where the agent asks for permission and you respond from the couch.

Shooter runs as a single Node.js process on your dev machine. SvelteKit handles the web UI and REST API, a WebSocket server streams terminal I/O and session data, and node-pty manages pseudoterminal processes. Cloudflare Tunnel exposes the local server to the internet with TLS, so your phone connects securely without port forwarding.

### Key Features

- Launch terminal sessions (Shell, Claude Code, OpenCode) from your phone
- Real-time terminal streaming via WebSocket with scrollback replay on reconnect
- Structured Chat view for AI coding sessions (live JSONL tailing)
- Push notifications for coding events (tool usage, permission requests)
- Interactive permission allow/deny from iOS notifications
- Session history browsing across all projects
- Mobile-optimized dark theme UI with quick-access keys for special characters

---

## Screenshots

<!-- TODO: Add screenshots -->

<!--
Recommended screenshots:
1. Terminal list (/terminals) - showing active and exited sessions with status badges
2. Terminal view - Raw mode (/terminals/[id]) - xterm.js with quick keys bar
3. Terminal view - Chat mode (/terminals/[id]?view=chat) - structured AI conversation
4. Launch sheet - bottom sheet with session type presets and project picker
5. Mobile view - full interface on iPhone viewport
6. Session history (/project) - browsing past sessions across projects
-->

---

## Architecture

```
+----------------------------------------------------------+
|  Dev Machine                                             |
|                                                          |
|  SvelteKit Server (adapter-node, port 3000)              |
|    +-- REST API (terminals, sessions, notify, health)    |
|    +-- WebSocket Server (ws)                             |
|    +-- PTY Manager (node-pty)                            |
|    +-- Session Watcher (chokidar)                        |
|    +-- APNs Client (push notifications)                  |
+------------------------------+---------------------------+
                               |
                     Cloudflare Tunnel
                   shooter.yourdomain.com
                               |
+------------------------------+---------------------------+
|  Phone                                                   |
|    +-- Mobile Browser (terminal UI, chat view, controls) |
|    +-- iOS App (push notifications, permission actions)  |
+----------------------------------------------------------+
```

**Three WebSocket channels:**

| Channel | Path | Purpose |
|---------|------|---------|
| Terminal I/O | `/ws/terminal/:id` | Raw PTY byte stream (xterm.js) |
| Session stream | `/ws/session/:id` | Structured AI conversation updates |
| Global events | `/ws/events` | Server broadcasts (new sessions, exits, permissions) |

**REST API** handles terminal CRUD, session discovery, push notifications, WebSocket ticket generation, and health checks. All endpoints require Bearer token authentication.

---

## Prerequisites

- **Node.js 20+** (18+ minimum, 20+ recommended)
- **pnpm** (npm and yarn are blocked by the project)
- **macOS** (required for node-pty native bindings and launchd)
- **Optional:** Apple Developer account (for push notifications to iOS)
- **Optional:** Cloudflare account (for remote access via tunnel)

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/shooter.git
cd shooter
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Rebuild node-pty native bindings

node-pty includes a native `.node` binding that must be compiled for your system:

```bash
npx node-gyp rebuild --directory=node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | Bearer token for authenticating all API requests |
| `APNS_KEY` | No | APNs private key (.p8 contents, for push notifications) |
| `APNS_KEY_ID` | No | APNs key identifier |
| `APNS_TEAM_ID` | No | Apple Team ID |
| `APNS_BUNDLE_ID` | No | iOS app bundle identifier |
| `APNS_PRODUCTION` | No | Set `true` for TestFlight/App Store (default: `false` for sandbox) |
| `DEVICE_TOKEN` | No | Target iOS device token (64-char hex) |

### 5. Set the API key in your shell profile

The Claude Code hook notifier needs the API key available as an environment variable:

```bash
echo 'export SHOOTER_API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### 6. Build and start

```bash
pnpm build
pnpm start
```

### 7. Open in your browser

Navigate to [http://localhost:3000](http://localhost:3000).

### 8. Configure API key in Settings

Visit `/config` in the browser and enter your API key. This is stored in the browser's local storage for authenticating REST and WebSocket requests from the UI.

---

## Usage

### Launching a terminal

1. Navigate to `/terminals`
2. Tap the **+ New Terminal** button
3. Choose a preset (Claude Code, OpenCode, Shell) or configure a custom command
4. Select a working directory from recent projects
5. Tap **Launch Terminal**

### Raw vs Chat view

AI sessions (Claude Code, OpenCode) offer two view modes toggled from the top bar:

- **Raw** -- Full xterm.js terminal showing all PTY output. Use this for complete control and visibility into everything the process outputs.
- **Chat** -- Structured conversation view with message bubbles, tool usage cards, and thinking indicators. Parsed live from the session's JSONL file. This is the default on mobile viewports.

### Quick Keys

On mobile, a horizontal scrollable bar below the terminal provides keys that are difficult to type on a touch keyboard:

`Ctrl+C` | `Tab` | `Up` | `Down` | `Esc` | `Ctrl+D` | `Ctrl+Z`

### Killing and removing terminals

- Tap the **Kill** button in the terminal view top bar to send SIGTERM to the process
- Exited terminals remain visible for 1 hour (scrollback preserved), then are automatically cleaned up
- Use `DELETE /api/terminals/:id` to remove a terminal immediately

---

## Remote Access (Cloudflare Tunnel)

Cloudflare Tunnel provides secure HTTPS and WSS access to your local Shooter server without opening ports on your router.

### 1. Install cloudflared

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared login
```

### 2. Create a tunnel

```bash
cloudflared tunnel create shooter
```

### 3. Configure the tunnel

Create `~/.cloudflared/shooter-config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: shooter.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 10s
      tcpKeepAlive: 30s
  - service: http_status:404
```

Add a DNS record for the tunnel:

```bash
cloudflared tunnel route dns shooter shooter.yourdomain.com
```

### 4. Run the tunnel

```bash
cloudflared tunnel --config ~/.cloudflared/shooter-config.yml run shooter
```

### 5. Open on your phone

Navigate to `https://shooter.yourdomain.com` in your mobile browser.

---

## Auto-Start (launchd)

To keep the Shooter server running persistently (auto-restart on crash, start at login), use a macOS launchd plist.

### 1. Generate the plist from the template

The design spec includes a template at `docs/superpowers/specs/`. Adjust paths to match your system:

```bash
cat > ~/Library/LaunchAgents/com.shooter.server.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.shooter.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>tsx</string>
    <string>SHOOTER_DIR/server.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>SHOOTER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/shooter.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/shooter.err</string>
</dict>
</plist>
PLIST
```

Replace `SHOOTER_DIR` with your actual project path:

```bash
sed -i '' "s|SHOOTER_DIR|$(pwd)|g" ~/Library/LaunchAgents/com.shooter.server.plist
```

### 2. Load the service

```bash
launchctl load ~/Library/LaunchAgents/com.shooter.server.plist
```

### 3. Check logs

```bash
tail -f /tmp/shooter.log
tail -f /tmp/shooter.err
```

To unload: `launchctl unload ~/Library/LaunchAgents/com.shooter.server.plist`

---

## Push Notifications (iOS)

Push notifications are optional and require an Apple Developer account.

### APNs key setup

1. In the Apple Developer portal, create an APNs authentication key (Keys > + > Apple Push Notifications service)
2. Download the `.p8` file
3. Copy the key contents into `APNS_KEY` in your `.env`
4. Set `APNS_KEY_ID`, `APNS_TEAM_ID`, and `APNS_BUNDLE_ID`

### iOS app

The Swift iOS app lives in the `ios/` directory. Open `ios/Shooter/Shooter.xcodeproj` in Xcode, configure your signing team, and build to a device. The app registers for push notifications on launch and displays a notification history.

For TestFlight or App Store builds, set `APNS_PRODUCTION=true` in your server's `.env` to route notifications through the production APNs gateway.

### Hook notifier

The file `.claude/hooks/notifier.cjs` is a Node.js script invoked by Claude Code lifecycle hooks. It sends push notifications to your phone when coding events occur (tool usage, session starts, permission requests). The notifier reads `SHOOTER_API_KEY` from the environment and posts to the Shooter server, which forwards to APNs.

For bidirectional permissions, the `PermissionRequest` hook blocks and polls the server for an allow/deny response from the iOS app.

---

## API Reference

All endpoints require the `Authorization: Bearer <API_KEY>` header unless noted otherwise.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check, returns server status |
| `GET` | `/api/terminals` | List all active and recently exited terminals |
| `POST` | `/api/terminals` | Create a new terminal session |
| `GET` | `/api/terminals/:id` | Get details for a specific terminal |
| `DELETE` | `/api/terminals/:id` | Kill and remove a terminal session |
| `POST` | `/api/terminals/:id/resize` | Resize a terminal (cols, rows) |
| `POST` | `/api/ws-ticket` | Generate a short-lived WebSocket auth ticket |
| `GET` | `/api/ws-status` | Get connected WebSocket client count |
| `POST` | `/api/notify` | Send a push notification via APNs |
| `POST` | `/api/response` | Submit a permission allow/deny response |
| `GET` | `/api/sessions` | List sessions across all projects |

### POST /api/terminals -- request body

```json
{
  "command": "claude",
  "args": ["--resume", "abc123"],
  "cwd": "/Users/me/project",
  "cols": 80,
  "rows": 24
}
```

### POST /api/terminals -- response

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

## WebSocket Channels

All WebSocket connections use ticket-based authentication. First call `POST /api/ws-ticket` with your Bearer token to receive a one-time ticket (valid for 30 seconds), then connect with `?ticket=TICKET` in the query string.

### Terminal I/O (`/ws/terminal/:id`)

Raw PTY byte stream. Client sends `input`, `resize`, and `signal` messages. Server sends `output`, `exit`, `scrollback`, and `error` messages. Used by the xterm.js Raw view.

### Session stream (`/ws/session/:id`)

Structured conversation data for AI sessions. Server sends `history` on connect (all existing messages), then streams new `message`, `tool-use`, `tool-result`, and `thinking` entries as they appear in the session file. Client can send `send-input` (write to PTY stdin) and `cancel` (SIGINT).

### Global events (`/ws/events`)

Server-to-client broadcast channel. Emits `session-started`, `session-ended`, `permission-requested`, `terminal-created`, and `terminal-exited` events. Used by the terminal list page to update in real time.

For the full WebSocket protocol specification, see [docs/superpowers/specs/2026-03-17-mobile-terminal-access-design.md](docs/superpowers/specs/2026-03-17-mobile-terminal-access-design.md).

---

## Project Structure

```
shooter/
  server.ts                        # Custom HTTP + WebSocket server entry point
  .env.example                     # Environment variable template
  package.json                     # Dependencies and scripts (pnpm only)
  svelte.config.js                 # SvelteKit config (adapter-node)
  vite.config.ts                   # Vite config (node-pty external)
  .claude/                         # Claude Code hooks and notifier
    hooks/notifier.cjs             # Unified hook notifier (Node.js)
    settings.json                  # Hook configuration
  src/
    lib/
      modules/
        server/
          apn/                     # APNs push notification service
          auth.ts                  # Shared authentication helper
          terminal/
            pty-manager.ts         # PTY lifecycle, scrollback, cleanup
            session-watcher.ts     # File watcher for JSONL session files
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
      api/                         # REST API endpoints
      terminals/                   # Terminal list and detail pages
      project/                     # Project dashboard
      session/[id]/                # Session viewer
      config/                      # Settings page
  specs/types/                     # Type-crafter YAML specifications
  src/generated/types/             # Auto-generated TypeScript types (DO NOT EDIT)
  ios/Shooter/                     # Swift iOS app (Xcode project)
  docs/                            # Documentation
  plans/                           # Architecture plans and roadmap
```

---

## Development

```bash
# Start Vite dev server with hot reload
pnpm dev

# Build for production (outputs to build/)
pnpm build

# Run production server (custom server.ts with WebSocket support)
pnpm start

# Preview production build via Vite
pnpm preview

# TypeScript type checking
pnpm check

# Generate types from YAML specs
pnpm run gen:types

# Lint and format
pnpm lint
pnpm format

# Run all validation checks (format + lint + typecheck)
pnpm run validate
```

**Note:** `pnpm dev` runs the standard Vite dev server, which does not include the WebSocket server. For full functionality (terminal sessions, live streaming), use `pnpm build && pnpm start`.

---

## Security

- **Command allowlist** -- Only `zsh`, `bash`, `sh`, `fish`, `claude`, and `opencode` can be launched as terminal commands. Arbitrary command execution is blocked.
- **Ticket-based WebSocket auth** -- WebSocket connections use short-lived, single-use tickets (30-second expiry) obtained via an authenticated REST endpoint. Long-lived API keys never appear in WebSocket URLs.
- **Bearer token on all REST endpoints** -- Every API request requires `Authorization: Bearer <API_KEY>`.
- **Working directory validation** -- The `cwd` parameter is resolved through `realpathSync` to follow symlinks, then validated against the user's home directory. Symlink-based path traversal is blocked.
- **No credentials in code** -- All secrets are loaded from `.env` at runtime. The `.env` file is gitignored.
- **APNs JWT rotation** -- Apple Push Notification tokens are generated with short expiry and rotated automatically.

---

## Known Limitations

- **In-memory state** -- Terminal sessions, WebSocket connections, auth tickets, and pending permission requests are stored in memory. If the server restarts, all active terminals are lost.
- **Single user** -- There is no multi-user authentication. The API key acts as a shared secret. Anyone with the key has full access.
- **macOS only** -- node-pty native bindings and launchd integration are macOS-specific. The server may work on Linux with adjustments, but this is untested.
- **OpenCode Chat view** -- Structured Chat view parsing is not yet supported for OpenCode sessions. OpenCode terminals work in Raw mode only.

---

## License

See [LICENSE](LICENSE).
