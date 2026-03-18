# Mobile Terminal Access — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebSocket-based terminal access from mobile to launch, control, and monitor coding sessions on the dev machine.

**Architecture:** Unified local SvelteKit server (Node adapter) with WebSocket channels for PTY I/O, structured session streaming, and global events. Cloudflare Tunnel exposes the server. xterm.js on the frontend.

**Tech Stack:** SvelteKit (Node adapter), ws, node-pty, chokidar, @xterm/xterm, tsx

**Spec:** `docs/superpowers/specs/2026-03-17-mobile-terminal-access-design.md`

---

## Wave 1: Foundation (sequential — touches existing files)

### Task 1: Adapter Migration

**Files:**
- Modify: `svelte.config.js` — change adapter-vercel → adapter-node
- Modify: `package.json` — swap deps, add new deps, update scripts
- Modify: `vite.config.js` — add node-pty to SSR externals

- [ ] **Step 1:** Replace adapter in svelte.config.js
  - `import adapter from '@sveltejs/adapter-vercel'` → `import adapter from '@sveltejs/adapter-node'`
  - Remove `runtime: 'nodejs20.x'` from adapter options

- [ ] **Step 2:** Update package.json dependencies
  - Remove: `@sveltejs/adapter-vercel`
  - Add devDeps: `@sveltejs/adapter-node`
  - Add deps: `ws`, `chokidar`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `tsx`
  - Add scripts: `"start": "tsx server.ts"`

- [ ] **Step 3:** Update vite.config.js SSR externals
  - `ssr: { external: ['better-sqlite3', 'node-pty'] }`

- [ ] **Step 4:** Run `pnpm install`

- [ ] **Step 5:** Run `pnpm build` to verify adapter-node works

- [ ] **Step 6:** Commit: `feat: migrate from Vercel adapter to Node adapter`

### Task 2: Custom Server Entry Point

**Files:**
- Create: `server.ts` (project root)

- [ ] **Step 1:** Create server.ts with HTTP server wrapping SvelteKit handler + WebSocket upgrade

```typescript
import { createServer } from 'http';
import { handler } from './build/handler.js';
import { WebSocketServer } from 'ws';

const server = createServer(handler);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const ticket = url.searchParams.get('ticket');
  // TODO: validate ticket, route to handlers
  // For now, reject all upgrades until handlers are implemented
  socket.destroy();
});

const port = parseInt(process.env.PORT || '3000');
server.listen(port, () => {
  console.log(`Shooter running on http://localhost:${port}`);
});
```

- [ ] **Step 2:** Build and test: `pnpm build && npx tsx server.ts`
- [ ] **Step 3:** Commit: `feat: add custom server entry point with WebSocket upgrade`

### Task 3: Terminal Type Spec

**Files:**
- Create: `specs/types/terminal.yaml`
- Modify: `specs/types/index.yaml` (add reference)

- [ ] **Step 1:** Create terminal.yaml with ManagedTerminal, WebSocket message types, API types
- [ ] **Step 2:** Add reference in index.yaml
- [ ] **Step 3:** Run type generation: `pnpm run gen:types`
- [ ] **Step 4:** Commit: `feat: add terminal type specs`

---

## Wave 2: Core Services (parallel — all new files)

### Task 4: PTY Manager

**Files:**
- Create: `src/lib/modules/server/terminal/pty-manager.ts`

Core: singleton PtyManager class with Map<string, ManagedTerminal>, spawn/list/kill/resize/cleanup methods. RingBuffer for scrollback (5000 lines). 1hr TTL for exited terminals, max 10 kept.

Reference: `src/lib/modules/server/cli/runner.ts` for node-pty usage patterns.

### Task 5: Session Watcher

**Files:**
- Create: `src/lib/modules/server/terminal/session-watcher.ts`

Core: chokidar file watcher with byte-offset tracking. Reads new JSONL entries incrementally. Parses entries using existing patterns from `src/lib/modules/server/sessions/jsonl-reader.ts`. Claude Code: uses CLAUDE_SESSION_ID env var for deterministic file path. OpenCode: queries SQLite for newest matching session.

### Task 6: WebSocket Server + Routing

**Files:**
- Create: `src/lib/modules/server/ws/server.ts`

Core: `setupWebSocketHandlers(wss, request, socket, head)` function. Parses URL path, validates ticket, routes to terminal/session/events handler. Manages ticket store (in-memory Map, 30s TTL, single-use).

### Task 7: WebSocket Terminal Handler

**Files:**
- Create: `src/lib/modules/server/ws/terminal-handler.ts`

Core: handles `/ws/terminal/:id` connections. Receives input/resize/signal messages, writes to PTY. Broadcasts PTY output to all connected clients. Sends chunked scrollback on connect (50KB chunks). 1MB output backpressure buffer.

### Task 8: WebSocket Session Handler

**Files:**
- Create: `src/lib/modules/server/ws/session-handler.ts`

Core: handles `/ws/session/:id` connections. On connect: sends full history message from offset 0. Then streams new entries as they appear via SessionWatcher. Handles send-input (write to PTY stdin + newline) and cancel (SIGINT).

### Task 9: WebSocket Events Handler

**Files:**
- Create: `src/lib/modules/server/ws/events-handler.ts`

Core: handles `/ws/events` connections. Broadcast-only channel. Tracks connected client count. Emits: session-started, session-ended, permission-requested, terminal-created, terminal-exited.

### Task 10: WebSocket Keepalive

**Files:**
- Create: `src/lib/modules/server/ws/keepalive.ts`

Core: 30s interval server-initiated WebSocket ping on all connections. 10s pong timeout. Dead connection cleanup.

### Task 11: REST API — Terminals CRUD

**Files:**
- Create: `src/routes/api/terminals/+server.ts` (GET list + POST create)
- Create: `src/routes/api/terminals/[id]/+server.ts` (GET detail + DELETE kill)
- Create: `src/routes/api/terminals/[id]/resize/+server.ts` (POST resize)

Auth pattern: copy from `src/routes/api/response/+server.ts` (Bearer token validation). Response pattern: copy from `src/routes/api/sessions/+server.ts`.

### Task 12: REST API — WS Ticket + Status

**Files:**
- Create: `src/routes/api/ws-ticket/+server.ts` (POST — generate 30s single-use ticket)
- Create: `src/routes/api/ws-status/+server.ts` (GET — connected client count)

### Task 13: Wire WebSocket Handlers into server.ts

**Files:**
- Modify: `server.ts` — import and wire all WebSocket handlers, ticket validation, keepalive

---

## Wave 3: UI (parallel — all new files except layout)

### Task 14: Nav Update

**Files:**
- Modify: `src/routes/+layout.svelte` — add "Terminals" nav link

### Task 15: Terminal List Page

**Files:**
- Create: `src/routes/terminals/+page.svelte`

Reference: `src/routes/+page.svelte` for page structure, polling, sessionStorage caching. Card design from existing session cards in `src/app.css`.

### Task 16: xterm Wrapper

**Files:**
- Create: `src/lib/modules/client/terminal/xterm-wrapper.ts`

Async `createTerminal()` with dynamic imports (SSR-safe). Returns `{ term, fitAddon, dispose }`.

### Task 17: Terminal View Page

**Files:**
- Create: `src/routes/terminals/[id]/+page.svelte`

Top bar with back/command/badge/toggle/kill. Uses xterm-wrapper for Raw mode. Uses ChatView for Chat mode. Defaults to Chat on mobile (<768px). WebSocket connection with ticket auth.

### Task 18: Chat View Component

**Files:**
- Create: `src/lib/modules/client/terminal/ChatView.svelte`

Reuses patterns from `src/routes/session/[id]/+page.svelte`: chat bubbles, tool cards, thinking blocks. Adds: input bar, inline permission Allow/Deny, LIVE badge.

### Task 19: Launch Sheet Component

**Files:**
- Create: `src/lib/modules/client/terminal/LaunchSheet.svelte`

Bottom sheet (mobile) / modal (desktop). Presets: Claude Code, OpenCode, Shell, Custom. Directory picker. Calls POST /api/terminals.

### Task 20: Quick Keys Component

**Files:**
- Create: `src/lib/modules/client/terminal/QuickKeys.svelte`

Horizontal scrollable row: Ctrl+C, Tab, ↑, ↓, Esc, Ctrl+D, Ctrl+Z. Emits key events to parent.

### Task 21: Connection Status Component

**Files:**
- Create: `src/lib/modules/client/terminal/ConnectionStatus.svelte`

Green/amber/red dot with text. Reconnection backoff: 1s, 2s, 4s, 8s, max 30s.

### Task 22: Terminal CSS Styles

**Files:**
- Modify: `src/app.css` — add terminal-specific styles

Add: `.terminal-topbar`, `.terminal-body`, `.terminal-input`, `.term-key`, `.launch-sheet`, `.connection-status`, badge variants for AI/SHELL/ENDED.

---

## Wave 4: Integration (sequential)

### Task 23: Enhanced Session Page (Live Mode)

**Files:**
- Modify: `src/routes/session/[id]/+page.svelte` — add WebSocket live streaming, LIVE badge

### Task 24: notifier.cjs Push/WebSocket Dedup

**Files:**
- Modify: `.claude/hooks/notifier.cjs` — check /api/ws-status before sending push

### Task 25: launchd Plist

**Files:**
- Create: `com.shooter.server.plist`

### Task 26: Server.ts Final Wiring

**Files:**
- Modify: `server.ts` — import PTY manager, session watcher, all WS handlers, keepalive, events

---

## Wave 5: Verification

### Task 27: Build Verification
- `pnpm build && npx tsx server.ts` — verify server starts
- All API endpoints respond with correct auth

### Task 28: Desktop Browser Verification
- agent-browser at 1280x720: terminals list, launch terminal, raw view, chat view

### Task 29: Mobile Browser Verification
- agent-browser at 390x844: terminals list, launch terminal, chat default, quick keys

### Task 30: Regression Check
- Existing pages still work: projects, sessions, session chat, settings
