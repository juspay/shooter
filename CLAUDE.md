# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📖 Required Reading

**BEFORE making ANY changes, read these documents:**

1. **`docs/GUIDANCE.md`** - Complete development guide including:
   - Project organization and directory structure
   - Type system (type-crafter workflow)
   - Code location guidelines (where to write what)
   - Development workflow and best practices
   - Import patterns and conventions

2. **`CLAUDE.md`** (this file) - High-level project overview and context

## Project Overview

This repository contains a **WORKING** bidirectional communication system between Shooter and iOS applications. Features include push notifications for coding events, mobile terminal access via WebSocket streaming, and session viewing. The system enables real-time notifications to iOS devices, interactive permission responses, remote terminal sessions from a phone, and browsing of coding session history.

## Project Structure

### Core Implementation

- `docs/GUIDANCE.md` - **READ THIS FIRST** - Complete development guide
- `docs/CLAUDE-CODE-INTEGRATION.md` - **WORKING** Shooter lifecycle hooks integration
- `.claude/` - Shooter hook configuration and unified Node.js notifier (`notifier.cjs`)
- `src/lib/modules/` - Organized modular code (client + server)
  - `server/apn/` - Apple Push Notification service implementations
  - `server/cli/` - CLI command execution utilities
  - `server/terminal/` - PTY manager, session watcher, PTY persistence
    - `pty-manager.ts` - Creates/manages terminals, reconnects after restart
    - `pty-holder.cjs` - Standalone detached process that owns a single PTY (survives server restarts)
    - `holder-client.ts` - Unix socket client connecting PtyManager to holder processes
    - `terminal-store.ts` - SQLite persistence for terminal metadata (`~/.shooter/shooter.db`)
    - `session-watcher.ts` - Watches Claude Code JSONL session files
    - `opencode-watcher.ts` - Watches OpenCode sessions via SQLite
  - `server/ws/` - WebSocket server, handlers, ticket-store, keepalive
  - `server/sessions/` - JSONL reader, OpenCode reader, types
  - `server/auth.ts` - Shared authentication
  - `client/common/` - Reusable UI components (Button, Card, Alert, EmptyState, StatusBadge, Tag, Icon, Input) and shared utilities (markdown, cache, time, tool-title, config-guard)
  - `client/terminal/` - ChatView (shared rendering component), LaunchSheet, QuickKeys, ConnectionStatus, xterm-wrapper
- `server.ts` - Custom server entry point (Node.js with WebSocket upgrade handling)
- `scripts/setup.cjs` - Interactive first-run setup wizard (`pnpm setup`); supports `--auto` flag for non-interactive mode
- `scripts/install.sh` - One-command install script (auto-generates API key, builds, installs cloudflared, enables autostart, starts server)
- `bin/shooter.cjs` - CLI entry point with commands: start, stop, status, autostart on/off, logs, setup, version, help
- `Dockerfile` + `docker-compose.yml` - Docker deployment
- `Dockerfile.test` - Test image for verifying fresh-user install experience
- `src/lib/types/` - Auto-generated TypeScript types (DO NOT EDIT)
- `specs/types/` - Type-crafter YAML specifications (EDIT HERE for types)
  - `index.yaml` - Main spec file (top file with references)
  - `jwt.yaml` - JWT authentication types
  - `apn.yaml` - APNs notification types
  - `cli.yaml` - CLI module types
  - `terminal.yaml` - Terminal and WebSocket types
- `ios/` - Swift iOS app (working, receiving notifications + interactive permission responses)
- `android/` - Android app scaffold (Kotlin, WebView + FCM push notifications)

### Architecture Documentation (in `plans/` and `docs/`)

- `plans/PLAN-A.MD` - Basic SvelteKit + Vercel + APNs architecture (✅ IMPLEMENTED)
- `plans/PLAN-B.MD` - Comprehensive bidirectional communication system with detailed implementation guide
- `plans/NEXT-PHASES.md` - Roadmap for enhanced features and production readiness
- `docs/POC-IMPLEMENTATION-GUIDE.md` - POC implementation details
- `docs/POC-ACHIEVEMENT-SUMMARY.md` - POC achievements summary
- `docs/GUIDANCE.md` - Development guidance (code organization, type system, best practices)

## Key Technologies

- **SvelteKit** - Central server framework for API endpoints and admin interface
- **Local Node.js server (adapter-node)** - Self-hosted behind Cloudflare Tunnel
- **Apple Push Notifications (APNs)** - iOS notification delivery
- **Cloudflare Tunnel** - Secure public access to local server
- **ws** - WebSocket server for terminal streaming and session events
- **node-pty** - Pseudoterminal management for remote shell sessions
- **better-sqlite3** - SQLite persistence for terminal state (`~/.shooter/shooter.db`)
- **@xterm/xterm** - Terminal emulator UI in the browser
- **chokidar** - File system watching for session changes
- **firebase-admin** - Firebase Cloud Messaging for Android push notifications
- **TypeScript** - Primary development language
- **Swift/SwiftUI** - iOS application development
- **Kotlin** - Android application development

## Implementation Phases

The system is designed to be built in four phases:

1. **Phase 1**: Basic push notifications (one-way communication)
2. **Phase 2**: Interactive notifications with simple responses
3. **Phase 3**: Full bidirectional communication with webhooks
4. **Phase 4**: Reliability enhancements and state management

## Core Components

### SvelteKit Application

- API routes: `/api/notify`, `/api/response`, `/api/webhook`, `/api/health`, `/api/debug`
- Terminal API routes: `/api/terminals`, `/api/terminals/[id]`, `/api/terminals/[id]/resize`, `/api/ws-ticket`, `/api/ws-status`
- Session API route: `/api/sessions`
- Device/config API routes: `/api/device-token`, `/api/qr-config`
- APNs integration with JWT authentication (sandbox/production via `APNS_PRODUCTION` env var)
- In-memory pending request store for bidirectional permission flow
- Request validation and error handling
- Navigation: top header bar (logo + status badge + gear icon for Settings), bottom tab bar (Projects + Terminals)
- UI pages: `/` (home/projects list), `/terminals` (list), `/terminals/[id]` (live terminal), `/project` (project dashboard), `/session/[id]` (session viewer), `/config` (settings)
- ChatView: shared Svelte rendering component used by both `/session/[id]` and `/terminals/[id]` pages to display conversation messages
- WebSocket channels: `terminal` (PTY I/O, resize), `session` (live session updates), `events` (server-sent events)

### iOS Application

- Push notification registration and handling
- Interactive notification categories (confirmation, text input)
- Response handling and server communication
- Local notification history

### Terminal Subsystem (Persistent)

Terminals survive server restarts via a holder-process architecture:

- **PTY Holder** (`pty-holder.cjs`): Standalone detached Node.js process that owns a single PTY via node-pty. Forked with `detached: true` and `unref()`'d so it outlives the server. Communicates over a Unix domain socket (`/tmp/shooter-term-<id>.sock`) using ndjson. Maintains its own scrollback ring buffer (5000 lines). On PTY exit, writes a `.exit` sidecar file and stays alive for a 60-second grace period so the server can reconnect.
- **Holder Client** (`holder-client.ts`): Connects PtyManager to a holder process over Unix socket. Handles the info+scrollback handshake on connect and streams output/exit events afterward.
- **PTY Manager** (`pty-manager.ts`): Creates terminals (forks holder, waits for ready signal, connects via HolderClient), manages attach/detach of WebSocket clients, broadcasts output with backpressure, and runs session discovery polling. On server startup, calls `reconnectAll()` to recover persisted terminals from SQLite.
- **Terminal Store** (`terminal-store.ts`): SQLite persistence (`~/.shooter/shooter.db`) for terminal metadata. Stores command, cwd, pid, holder pid, socket path, session file, status. Enables recovery after server restart. Cleans up records older than 24 hours.
- **Session Watcher**: Monitors Claude Code JSONL session directories with chokidar, detects new and updated sessions
- **OpenCode Watcher**: Monitors OpenCode sessions via SQLite database lookup
- **WebSocket Server**: Runs alongside SvelteKit via custom `server.ts` entry point, handles upgrade requests with ticket-based auth, multiplexes terminal/session/events channels
- **Ticket Store**: Short-lived auth tickets for WebSocket connections (avoids sending API keys over WS URL)
- **Keepalive**: Ping/pong heartbeat to detect stale connections

### Claude Code Integration (WORKING)

- **Lifecycle Hooks**: Automatic detection of tool usage, user prompts, session events
- **Unified Notifier**: Single `notifier.cjs` (Node.js) handles all hook events with async polling for bidirectional permissions
- **Context-Aware Notifications**: Smart categorization (debug, feature, testing, learning)
- **Bidirectional Permissions**: PermissionRequest hook blocks, sends interactive iOS notification, polls for Allow/Deny response
- **Configuration**: `.claude/settings.json` + `notifier.cjs` in `.claude/hooks/`
- **Hook Paths**: Relative paths (`.claude/hooks/notifier.cjs`) in `.claude/settings.json`, not absolute
- **Environment Variables**: `SHOOTER_USE_LOCAL`, `SHOOTER_LOCAL_PORT`, `API_KEY`, `SHOOTER_PERMISSION_TIMEOUT`

## CLI Commands

The `shooter` CLI (via `bin/shooter.cjs`) supports the following commands:

| Command           | Description                                        |
| ----------------- | -------------------------------------------------- |
| `start`           | Start the server (default if no command given)     |
| `stop`            | Stop the running server (via PID file)             |
| `status`          | Show server status, PID, port, autostart state     |
| `autostart on`    | Enable autostart on login (LaunchAgent / systemd)  |
| `autostart off`   | Disable autostart                                  |
| `logs`            | Tail server logs (LaunchAgent log file or journalctl) |
| `setup`           | Run the interactive setup wizard (`--auto` for non-interactive) |
| `version`         | Show version number                                |
| `help`            | Show help message                                  |

PID file: `~/.shooter/shooter.pid`. Logs: `~/.shooter/logs/shooter.log`.

## Security Requirements

- Bearer token authentication for Shooter → SvelteKit communication
- Apple APNs JWT tokens with automatic rotation
- HMAC signature validation for webhook security
- Environment-based configuration management
- No secrets in code or commits

## Development Workflow

✅ **IMPLEMENTED AND WORKING** - Shooter notification system is live and comprehensive:

1. Follow `plans/PLAN-A.MD` for basic implementation
2. Use `plans/PLAN-B.MD` for comprehensive system architecture
3. Implement in phases as outlined in the plans
4. Test components individually before integration

## Environment Setup

See `.env.example` for the full template. Required environment variables (set in `.env` for local dev):

- `API_KEY` - Shared auth key used by the server AND hooks (unified; not `SHOOTER_API_KEY`)
- `PORT` - Server port (default: 54007)

Optional (iOS push notifications):

- `APNS_KEY` - APNs private key (.p8 contents)
- `APNS_KEY_ID` - APNs key ID
- `APNS_TEAM_ID` - Apple Team ID
- `APNS_BUNDLE_ID` - iOS app bundle identifier
- `APNS_PRODUCTION` - Set to `true` for TestFlight/App Store builds (default: sandbox)
- `DEVICE_TOKEN` - Target iOS device token

Optional (Android push notifications):

- `FCM_PROJECT_ID` - Firebase project ID
- `FCM_CLIENT_EMAIL` - Firebase service account email
- `FCM_PRIVATE_KEY` - Firebase service account private key
- `ANDROID_DEVICE_TOKEN` - Target Android device token
- `DEVICE_PLATFORM` - Which platform to send to: `ios` or `android` (default: `ios`)

The env module (`env.ts`) checks `~/.shooter/.env` automatically as a fallback even without `SHOOTER_HOME` set.

You'll also need:

- Apple Developer account with Push Notifications capability (for iOS)
- Firebase project (for Android)
- Local machine running the server (`pnpm setup` for first run, then `pnpm build && pnpm start`; or use the one-command installer)
- Cloudflare Tunnel for public HTTPS access (install.sh offers to install cloudflared automatically)

## Testing Strategy

The plans include comprehensive testing approaches:

- Unit tests for API endpoints
- Integration tests for end-to-end flows
- Performance testing with load scenarios
- Network failure simulation
- Security validation

## Deployment

- **One-command install**: `curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh | sh` -- clones to `~/.shooter/repo`, auto-generates API key, installs deps, builds, offers cloudflared install, enables autostart, and starts the server
- **First-time setup**: `pnpm setup` runs interactive wizard (generates `.env`, configures hooks); pass `--auto` for non-interactive mode
- **Build and run**: `pnpm build && pnpm start` (adapter-node, runs custom `server.ts` on port 54007)
- **Build guard**: `server.ts` checks for `build/handler.js` before starting and exits with a clear error if missing
- **Autostart**: `shooter autostart on` installs a LaunchAgent (macOS) or systemd user unit (Linux) so the server starts on login
- **Process management**: `shooter stop` / `shooter status` / `shooter logs` use PID file at `~/.shooter/shooter.pid`
- **Docker**: `docker compose up` using `Dockerfile` and `docker-compose.yml`; `Dockerfile.test` for testing the fresh-user install experience
- **npm package**: Published as `@juspay/shooter` with `bin/shooter.cjs` entry point
- **Install script**: `scripts/install.sh` checks for build tools (python3, make, g++ on Linux; Xcode CLT on macOS) and offers to install cloudflared
- iOS app requires Xcode and device/simulator
- Android app requires Android Studio
- Cloudflare Tunnel provides public HTTPS + WSS access to the local server (install.sh can set up a quick tunnel automatically)
- Environment variables managed via `.env` file (falls back to `~/.shooter/.env`)

## Known Limitations

### In-Memory State (Partial)

Terminal state is now persisted via PTY holder processes + SQLite and survives server restarts. However, pending permission requests, WebSocket connections, and auth tickets are still in-memory. If the server restarts, in-flight permission requests are lost (but terminals reconnect automatically).

### Hook Completion Timer

The 45-second completion timer in `notifier.cjs` only works for OpenCode (persistent plugin). For Claude Code, each hook invocation is a separate process, so timers cannot fire across invocations. The code is guarded with `IS_CLAUDE_CODE` checks to skip this path.

### Hook Timeout Mismatch

The `PermissionRequest` hook has a 180-second timeout in `.claude/settings.json`, but the notifier's internal `PERMISSION_TIMEOUT` defaults to 120 seconds. The 60-second buffer ensures the notifier resolves before Claude Code kills the process.

### Health Endpoint

The `/api/health` endpoint returns `"healthy"` with a `warnings` array (e.g., when APNs is not configured) instead of reporting `"degraded"`. This means a server without push notification credentials is still considered healthy -- warnings are informational only.

### APNs Environment

The iOS app entitlements declare `aps-environment = production`. The server's `APNS_PRODUCTION` env var controls which APNs gateway is used (default: sandbox). For TestFlight/App Store builds, set `APNS_PRODUCTION=true` in the server environment.
