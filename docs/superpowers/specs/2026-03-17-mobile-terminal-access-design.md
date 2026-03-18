# Mobile Terminal Access — Design Spec

## Overview

Add the ability to launch, control, and monitor terminal sessions on the dev machine from a mobile phone. The existing Shooter system (SvelteKit + iOS push notifications) gains WebSocket-based terminal streaming, PTY management, and a mobile-optimized terminal UI.

## Scope

### In Scope (Phase 1)

- **Launch & Control**: Spawn new shell, Claude Code, or OpenCode sessions from the phone with full interactive PTY access
- **Two view modes**: Raw terminal (xterm.js) with Raw/Chat toggle for AI sessions showing structured conversation
- **Monitor existing sessions** (read-only): Watch JSONL/SQLite files for structured view of sessions started outside Shooter
- **Intervention**: Send text input, cancel operations (SIGINT), approve/deny permissions inline
- **Session lifecycle from phone**: Start new sessions, kill sessions

### Phase 2 (after Phase 1 ships)

- Quick actions system (`/api/actions` — run tests, commit, deploy)
- Configurable action presets per project

### Out of Scope (Future)

- Attaching to non-Shooter-launched processes with full PTY control
- Multi-user access / concurrent viewers with conflict resolution
- Cloud relay fallback when tunnel is down
- Recording/playback of terminal sessions

## Architecture

### Approach: Unified Local Server

Migrate SvelteKit from Vercel adapter to Node adapter. The server runs locally on the dev machine as a persistent Node.js process. Cloudflare Tunnel exposes it to the internet.

**Why this approach:**
- Terminal access requires the dev machine to be on — Vercel's always-on hosting provides no value
- Solves the existing in-memory pending request store problem (single instance)
- Single codebase, single process, single auth model
- Lowest latency: phone → Cloudflare Tunnel → local server
- Direct filesystem and PTY access

### System Layers

```
┌─ Unified SvelteKit Server (Node adapter, port 3000) ─────────────┐
│                                                                    │
│  REST API Layer                                                    │
│    /api/notify      → Push notifications via APNs (existing)       │
│    /api/response    → Permission allow/deny flow (existing)        │
│    /api/sessions    → Session discovery + history (existing)       │
│    /api/terminals   → NEW: CRUD for terminal sessions              │
│    /api/ws-ticket   → NEW: Short-lived WebSocket auth tickets      │
│    /api/health      → System health check (existing)               │
│                                                                    │
│  WebSocket Layer                                                   │
│    ws://host/ws/terminal/:id  → Raw PTY I/O stream                 │
│    ws://host/ws/session/:id   → Live structured session stream     │
│    ws://host/ws/events        → Global event bus (broadcasts)      │
│                                                                    │
│  Core Services                                                     │
│    PTY Manager      → Spawn, track, multiplex terminal sessions    │
│    Session Watcher  → JSONL + SQLite file change detection         │
│    APNs Client      → Push notification delivery (existing)        │
│                                                                    │
│  Data Sources                                                      │
│    ~/.claude/projects/*/     → JSONL session files                 │
│    ~/.local/share/opencode/  → SQLite database                     │
│    Managed PTY processes     → node-pty sessions                   │
└────────────────────────────────────────────────────────────────────┘
                              │
                    Cloudflare Tunnel
                 shooter.yourdomain.com
                              │
┌─ Phone ───────────────────────────────────────────────────────────┐
│  iOS App    → Push notifications, quick actions, session list      │
│  Mobile Web → Terminal UI (xterm.js), live sessions, controls      │
└────────────────────────────────────────────────────────────────────┘
```

### What Changes vs. What Stays

**Stays the same:**
- All existing REST API endpoints and their behavior
- APNs push notification delivery
- iOS app notification handling
- Session JSONL + SQLite readers
- notifier.cjs hook system
- Bearer token authentication pattern
- Existing pages: `/` (projects), `/project` (sessions), `/session/[id]` (chat view), `/config` (settings)

**Changes:**
- Replace `@sveltejs/adapter-vercel` with `@sveltejs/adapter-node` in `package.json` and `svelte.config.js`; remove `@sveltejs/adapter-vercel` from dev dependencies
- Add custom server entry point (`server.ts` at project root) — see WebSocket Integration section
- Add `ws` library for WebSocket server
- Add `chokidar` for file watching
- Add `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` for browser terminal
- Extend existing CLIRunner into PTY Manager service
- New routes: `/terminals` (list), `/terminals/[id]` (detail) — both plural, consistent
- New API endpoints: `/api/terminals`, `/api/ws-ticket`
- New nav item: "Terminals" alongside Projects and Settings
- Replace `pnpm run deploy` (Vercel) with `pnpm run start` (local Node server)

## Two-Tier Terminal Model

| Capability | Shooter-launched sessions | External sessions |
|---|---|---|
| Structured live view | Yes (watch JSONL/SQLite) | Yes (watch JSONL/SQLite) |
| Raw terminal view | Yes (we own the PTY) | No |
| Send text input | Yes (write to PTY stdin) | No |
| Cancel/SIGINT | Yes (kill process) | No (PID not discoverable from session files) |
| Full terminal output | Yes (all I/O captured) | No |

**External sessions** are viewed through the existing `/session/[id]` page, enhanced with a live file watcher. No new routes needed for external sessions.

**Shooter-launched sessions** use the new `/terminals/[id]` page with full PTY control.

## WebSocket Protocol

### Channel 1: Terminal I/O — `ws://host/ws/terminal/:id`

Used by the **Raw terminal view** (xterm.js). Carries raw PTY bytes.

**Client → Server:**
```json
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "signal", "signal": "SIGINT" }
```

**Server → Client:**
```json
{ "type": "output", "data": "..." }
{ "type": "exit", "code": 0, "signal": null }
{ "type": "scrollback", "data": "...", "chunk": 1, "total": 3 }
{ "type": "error", "message": "..." }
```

### Channel 2: Live Session — `ws://host/ws/session/:id`

Used by the **Chat view** for AI sessions. Carries structured conversation data.

**Client → Server:**
```json
{ "type": "subscribe", "sessionId": "..." }
{ "type": "send-input", "text": "fix the bug" }
{ "type": "cancel" }
```

`send-input` writes the text + newline to PTY stdin (same PTY as Channel 1). `cancel` sends SIGINT.

**Server → Client:**
```json
{ "type": "history", "messages": [...] }
{ "type": "message", "role": "user", "content": [...], "timestamp": "..." }
{ "type": "message", "role": "assistant", "content": [...], "timestamp": "..." }
{ "type": "tool-use", "name": "Edit", "input": {...}, "status": "running" }
{ "type": "tool-result", "id": "...", "output": "...", "status": "done" }
{ "type": "thinking", "text": "..." }
{ "type": "session-end" }
```

On connect, the server sends a `history` message with all existing messages (parsed from the JSONL/SQLite file up to the current offset). After that, only new entries are streamed as they appear.

**Dual-channel clarification:** Both channels can write to the same PTY stdin. The Raw view sends raw keystrokes (`input`), the Chat view sends complete messages (`send-input` with auto-newline). If both fire simultaneously, writes are serialized by the OS — PTY stdin is a sequential byte stream. In practice, only one view is active at a time (the toggle switches between them).

### Channel 3: Global Events — `ws://host/ws/events`

**Server → Client (broadcast):**
```json
{ "type": "session-started", "sessionId": "...", "project": "...", "source": "claude-code" }
{ "type": "session-ended", "sessionId": "...", "summary": "..." }
{ "type": "permission-requested", "requestId": "...", "tool": "Bash", "input": {...} }
{ "type": "terminal-created", "terminalId": "...", "command": "claude" }
{ "type": "terminal-exited", "terminalId": "...", "code": 0 }
```

### Keepalive (All Channels)

Cloudflare Tunnel terminates idle WebSocket connections after ~100 seconds. To prevent this:

- **Server sends `ping` frames** (WebSocket protocol-level, not application messages) every **30 seconds** on all three channels
- Client responds with `pong` automatically (handled by the WebSocket spec)
- If no `pong` received within 10 seconds, server considers the connection dead and cleans up

### Authentication

WebSocket connections use a **ticket-based auth** flow to avoid leaking tokens in URLs:

1. Client calls `POST /api/ws-ticket` with `Authorization: Bearer {API_KEY}` header
2. Server returns a short-lived ticket (random string, expires in 30 seconds, single use)
3. Client connects to `ws://host/ws/terminal/abc?ticket=TICKET`
4. Server validates ticket on upgrade, rejects if expired or already used
5. Ticket endpoint is rate-limited to 10 requests per minute per API key

This avoids putting the long-lived API_KEY in URL query parameters (which appear in proxy logs, Cloudflare access logs, and browser history).

### Push Notification vs. WebSocket Deduplication

When a `permission-requested` event occurs:
- If the events WebSocket has **at least one connected client**: broadcast via WebSocket only, skip push notification
- If **no WebSocket clients** are connected: send push notification via APNs (existing flow)

This prevents double-prompting. The notifier.cjs hook checks the server's connected client count via `GET /api/ws-status` before deciding whether to trigger APNs.

## PTY Manager

### ManagedTerminal

```typescript
interface ManagedTerminal {
  id: string;                      // "term_a1b2c3"
  pty: IPty;                       // node-pty process
  command: string;                 // "zsh", "claude", "opencode"
  args: string[];                  // command arguments
  cwd: string;                    // working directory
  createdAt: Date;
  exitedAt: Date | null;          // when process exited
  pid: number;                    // OS process ID
  clients: Set<WebSocket>;        // connected viewers
  scrollback: RingBuffer;         // last 5000 lines cached
  sessionFile: string | null;     // JSONL path if AI session
  watcher: FSWatcher | null;      // chokidar if AI session
  watcherOffset: number;          // byte offset for incremental reads
  status: 'running' | 'exited';
  exitCode: number | null;
}
```

### Exited Terminal Cleanup

Exited terminals are kept in memory for **1 hour** (scrollback still available for review). After 1 hour, or when the count exceeds **10 exited terminals**, the oldest are evicted. The scrollback buffer (up to ~500KB per terminal) is freed on eviction.

### REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/terminals` | Create new terminal session |
| `GET` | `/api/terminals` | List active + recently exited terminals |
| `GET` | `/api/terminals/:id` | Get terminal details |
| `DELETE` | `/api/terminals/:id` | Kill terminal session |
| `POST` | `/api/terminals/:id/resize` | Resize terminal |
| `POST` | `/api/ws-ticket` | Generate short-lived WebSocket auth ticket |
| `GET` | `/api/ws-status` | Connected WebSocket client count |

### POST /api/terminals Request

```json
{
  "command": "claude",
  "args": ["--resume", "abc123"],
  "cwd": "/Users/me/project",
  "cols": 80,
  "rows": 24
}
```

### POST /api/terminals Response

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

### Scrollback Buffer & Reconnection

When the phone reconnects after a network blip, the server replays cached scrollback. To avoid blasting a large payload over a flaky connection:

- Scrollback is sent in **chunks of 50KB** max per WebSocket message
- Each chunk includes `{ "type": "scrollback", "data": "...", "chunk": 1, "total": 3 }`
- Client waits for all chunks before rendering
- Maximum scrollback: 5000 lines (ring buffer)

### Output Backpressure

If a command produces output faster than the WebSocket can deliver (e.g., `cat large-file.log`):

- The server buffers up to **1MB** of pending output per client
- If the buffer exceeds 1MB, older output is dropped (the client will see a gap)
- A `{ "type": "output-dropped", "bytes": 12345 }` message notifies the client

### AI Session File Discovery

When `command` is `claude` or `opencode`, the PTY Manager must find the session file the process creates.

**Claude Code**: Set `CLAUDE_SESSION_ID` environment variable when spawning the process. Claude Code uses this as the session ID, making the file path deterministic: `~/.claude/projects/{encoded-project-path}/{session-id}.jsonl`. The PTY Manager generates a UUID, passes it as env, and watches that specific file.

**OpenCode**: Query the SQLite database for the newest session matching the `cwd` directory, created within the last 5 seconds of process start. Less deterministic but OpenCode doesn't support injecting session IDs.

Steps:
1. Spawn the process via node-pty with `CLAUDE_SESSION_ID` env var (for Claude Code)
2. Poll for the session file to appear (max 10 seconds, 500ms interval)
3. Start chokidar watcher on the file
4. Track `watcherOffset` (byte position for JSONL, row ID for SQLite) per terminal
5. On file change: read from `watcherOffset`, parse new entries, broadcast to session WebSocket clients
6. New clients connecting mid-session get a `history` message with all entries from offset 0 to current, then receive live updates

## Mobile UI

### New Pages

All new pages use the existing Shooter design system: dark theme (#0a0a0f background, #111827 cards), green accent (#22c55e), same nav bar, same card layout.

#### 1. Terminals List (`/terminals`)

- New nav item "Terminals" between Projects and Settings
- Card per active terminal: command, working directory, status dot (live/ended), badge (AI/SHELL/ENDED), one-line preview of recent output, time ago
- "+ New Terminal" button in header
- Ended sessions shown dimmed with exit code

#### 2. Terminal View — Raw Mode (`/terminals/[id]`)

- Top bar: back button, command name, AI/SHELL badge, Raw/Chat toggle (only for AI sessions), Kill button
- xterm.js rendering area (full width, fills viewport)
- Input bar at bottom with text field
- Quick keys row: Ctrl+C, Tab, ↑, ↓, Esc, Ctrl+D, Ctrl+Z (critical for mobile where these keys are hard to type)
- **Raw mode is a secondary experience on mobile** — touch keyboards, focus issues, and viewport resizing make it less reliable than Chat mode. The toggle defaults to Chat for AI sessions on mobile viewports.

#### 3. Terminal View — Chat Mode (`/terminals/[id]?view=chat`)

- Same top bar with toggle switched to "Chat"
- LIVE badge next to session name
- Reuses existing chat view component (green C avatar, tool cards with amber badges, collapsible tool results, timestamps)
- Adds: input bar for sending messages to Claude, inline permission request with Allow/Deny buttons
- New messages stream in at the bottom
- **This is the primary mobile experience for AI sessions**

#### 4. Launch Sheet

- Mobile: bottom sheet overlay
- Desktop: centered modal
- Quick launch presets: Claude Code (purple), OpenCode (blue), Shell/zsh (green), Custom (amber)
- Working directory picker showing recent projects
- "Launch Terminal" button

#### 5. Enhanced existing session page (`/session/[id]`)

The existing read-only session chat view gains a **live mode** for external sessions that are still active:
- File watcher streams new messages as they appear
- "LIVE" badge when the session file is being actively written
- No input bar (we don't own the PTY)
- Permission allow/deny still works via existing push notification flow

### Responsive Behavior

The terminal view is the most mobile-critical screen:
- xterm.js font size adjusts based on viewport width
- Quick keys row scrolls horizontally
- Input bar has large touch targets (44px minimum)
- Chat view constrains bubbles to viewport width (existing mobile overflow fix applies)
- **AI sessions default to Chat view on mobile** (< 768px viewport), Raw view on desktop

### xterm.js on Mobile Safari

Known platform issues:
- Focus management: virtual keyboard may not appear reliably
- Touch selection conflicts with terminal text selection
- Viewport resizing when keyboard opens/closes

Mitigations:
- Dedicated input bar below the terminal (user types there, not directly in xterm)
- Quick keys row provides special keys without keyboard
- Chat mode as default on mobile sidesteps most issues

### Connection State UI

The terminal view shows connection state:
- **Connected**: green dot, normal operation
- **Reconnecting**: amber dot + "Reconnecting..." banner, queued input buffered locally
- **Disconnected**: red dot + "Connection lost" banner with retry button
- Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, max 30s
- On reconnect, scrollback is replayed and any queued input is flushed

### xterm.js SSR Handling

xterm.js accesses `document` and `window`, which breaks SvelteKit's server-side rendering. The xterm wrapper must:
- Use **dynamic import** (`await import('@xterm/xterm')`) inside `onMount` only
- Never import xterm at the module top level
- The `xterm-wrapper.ts` module exports an async `createTerminal()` function that is only called client-side

## WebSocket Server Integration

SvelteKit's Node adapter does not natively support WebSocket upgrades in route files. We need a custom server entry point.

### Custom Server Entry (`server.ts` at project root)

This file lives at the **project root** (not inside `src/`). It is NOT part of the SvelteKit build — it is a standalone script that imports the SvelteKit build output.

```typescript
// server.ts (project root — run with tsx, not compiled by SvelteKit)
import { createServer } from 'http';
import { handler } from './build/handler.js';
import { WebSocketServer } from 'ws';
import { setupWebSocketHandlers } from './src/lib/modules/server/ws/server.js';

const server = createServer(handler);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  setupWebSocketHandlers(wss, request, socket, head);
});

const port = parseInt(process.env.PORT || '3000');
server.listen(port, () => {
  console.log(`Shooter server running on port ${port}`);
});
```

### Build & Run

```bash
pnpm build              # SvelteKit compiles to build/
npx tsx server.ts        # Run custom entry with TypeScript support
```

For production, use `tsx` (esbuild-based TS runner) to execute the entry point directly. No separate compile step needed. Add to `package.json`:

```json
{
  "scripts": {
    "start": "tsx server.ts",
    "build": "vite build",
    "dev": "vite dev"
  }
}
```

### node-pty Native Binding

`node-pty` has a native `.node` binding that cannot be bundled by Vite. Mark as external in `vite.config.js`:

```javascript
ssr: { external: ['better-sqlite3', 'node-pty'] }
```

### Process Supervisor (launchd)

The server must stay running to handle terminal sessions and notifications. On macOS, use a launchd plist:

```xml
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
    <string>/Users/sachinsharma/Developer/Personal/shooter/server.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/sachinsharma/Developer/Personal/shooter</string>
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
```

Install: `cp com.shooter.server.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.shooter.server.plist`

## Security

- Bearer token authentication for all REST endpoints (existing pattern)
- WebSocket auth via short-lived tickets (not long-lived tokens in URLs)
- Ticket endpoint rate-limited to 10 requests/minute
- Terminal commands run as the current OS user (same as running them locally)
- Cloudflare Tunnel handles TLS termination
- No new secret types introduced

## Deployment Changes

### Before (Vercel)
- `@sveltejs/adapter-vercel` with Node 20.x runtime
- Serverless functions with execution time limits
- Environment variables in Vercel dashboard

### After (Local + Cloudflare Tunnel)
- `@sveltejs/adapter-node` producing standalone Node.js server
- `tsx server.ts` as custom entry point wrapping SvelteKit handler + WebSocket
- `launchd` plist for process supervision (auto-restart on crash, start at login)
- `cloudflared tunnel` exposing local port to `shooter.yourdomain.com`
- Environment variables in `.env` file

## Dependencies

### New packages
- `ws` — WebSocket server
- `chokidar` — File system watcher
- `@xterm/xterm` — Terminal UI for browser (v5+ scoped package)
- `@xterm/addon-fit` — Auto-resize xterm to container
- `@xterm/addon-web-links` — Clickable links in terminal
- `tsx` — TypeScript execution for custom server entry

### Existing (no changes)
- `node-pty` (1.1.0) — Already installed, used by CLIRunner; must be marked as SSR external
- `better-sqlite3` — OpenCode session reader; already SSR external
- `@parse/node-apn` — Push notifications
- `marked` + `dompurify` — Markdown rendering in chat view

## File Locations

Following existing project conventions from `docs/GUIDANCE.md`:

### Project root
- `server.ts` — Custom server entry point (WebSocket + SvelteKit handler)
- `com.shooter.server.plist` — launchd service definition

### Server modules (`src/lib/modules/server/`)
- `terminal/pty-manager.ts` — ManagedTerminal, PTY lifecycle, scrollback, cleanup
- `terminal/session-watcher.ts` — chokidar-based JSONL/SQLite tailing with offset tracking
- `ws/server.ts` — WebSocket upgrade handler and channel routing
- `ws/terminal-handler.ts` — Terminal I/O WebSocket logic
- `ws/session-handler.ts` — Live session WebSocket logic
- `ws/events-handler.ts` — Global event bus WebSocket logic
- `ws/keepalive.ts` — 30s ping interval, dead connection cleanup

### API routes (`src/routes/api/`)
- `terminals/+server.ts` — GET (list) + POST (create)
- `terminals/[id]/+server.ts` — GET (detail) + DELETE (kill)
- `terminals/[id]/resize/+server.ts` — POST (resize)
- `ws-ticket/+server.ts` — POST (generate auth ticket)
- `ws-status/+server.ts` — GET (connected client count)

### Pages (`src/routes/`)
- `terminals/+page.svelte` — Terminal list
- `terminals/[id]/+page.svelte` — Terminal view (raw + chat toggle)

### Client modules (`src/lib/modules/client/`)
- `terminal/xterm-wrapper.ts` — Async xterm.js init (dynamic import, onMount only), WebSocket binding, fit addon
- `terminal/TerminalView.svelte` — Raw terminal component
- `terminal/ChatView.svelte` — Structured live chat component (extends existing)
- `terminal/LaunchSheet.svelte` — New terminal creation UI
- `terminal/QuickKeys.svelte` — Mobile quick key bar
- `terminal/ConnectionStatus.svelte` — Connected/Reconnecting/Disconnected indicator

### Types (`specs/types/`)
- `terminal.yaml` — Type-crafter spec for terminal types (ManagedTerminal, WebSocket messages)
- Generated types output to `src/generated/types/` (imported as `$generated/types` — matches existing codebase pattern, not the outdated `$lib/types` path in GUIDANCE.md)

## Resolved Questions

1. **Process persistence**: No. If the server restarts, managed PTY processes die. Exited terminals are ephemeral (1hr TTL, max 10 kept).

2. **Scrollback size**: 5000 lines, sent in 50KB chunks on reconnect. Sufficient for mobile without being heavy.

3. **AI session file discovery**: Deterministic for Claude Code (inject `CLAUDE_SESSION_ID` env var). Best-effort for OpenCode (newest matching session within 5s of spawn).

4. **Quick actions**: Deferred to Phase 2. Phase 1 focuses on terminal launch/control and session monitoring.
