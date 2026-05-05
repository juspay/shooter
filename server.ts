// Custom server entry point — run with `npx tsx server.ts`.
// Wraps the SvelteKit build output with a WebSocket server for terminal I/O,
// live session streaming, and a global event bus. NOT compiled by SvelteKit.

// Load .env before any other imports so all modules see populated process.env.
import './src/lib/env.js';

import type { ConversationMessage } from '$lib/types';

import { existsSync } from 'fs';
import { createServer, type Server } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { type WebSocket, WebSocketServer } from 'ws';

// ── Build guard ─────────────────────────────────────────────────────────
// Fail fast with a clear message instead of a cryptic ERR_MODULE_NOT_FOUND.
const __dirname = dirname(fileURLToPath(import.meta.url));
const handlerPath = join(__dirname, 'build', 'handler.js');
if (!existsSync(handlerPath)) {
  console.error("Build not found. Run 'pnpm build' first.");
  process.exit(1);
}

const { handler } = await import('./build/handler.js');
import { openCodeWatcher } from './src/lib/modules/server/terminal/opencode-watcher.js';
import { ptyManager } from './src/lib/modules/server/terminal/pty-manager.js';
import { sessionWatcher } from './src/lib/modules/server/terminal/session-watcher.js';
import { startKeepalive, stopKeepalive } from './src/lib/modules/server/ws/keepalive.js';
import { setupWebSocketHandlers } from './src/lib/modules/server/ws/server.js';
import {
  setPtyManager as setSessionHandlerPtyManager,
  setSessionWatcher,
} from './src/lib/modules/server/ws/session-handler.js';
import { setPtyManager as setTerminalHandlerPtyManager } from './src/lib/modules/server/ws/terminal-handler.js';
import { validateTicket } from './src/lib/modules/server/ws/ticket-store.js';

// ── Adapters ─────────────────────────────────────────────────────────
// The WS handlers define their own duck-typed interfaces (PtyManagerLike,
// SessionWatcherLike) that differ slightly from the real singletons'
// public APIs. Thin adapters bridge the gap without modifying either side.

/** Adapt PtyManager (`.get()`) to the handlers' expected `.getTerminal()`. */
const ptyManagerAdapter = {
  attach(id: string, ws: WebSocket) {
    return ptyManager.attach(id, ws);
  },
  detach(id: string, ws: WebSocket) {
    return ptyManager.detach(id, ws);
  },
  getTerminal(id: string) {
    return ptyManager.get(id) ?? undefined;
  },
  list() {
    return ptyManager.list();
  },
};

/**
 * Adapt SessionWatcher (`.watch()` + `.getHistory()`) to the session
 * handler's expected `.subscribe()` + `.getHistory()` interface.
 *
 * Both watchers now deliver ConversationMessage[] — the adapter just
 * routes to the correct watcher based on the session key format.
 */
const sessionWatcherAdapter = {
  getHistory(sessionFile: string) {
    // Check if this is an OpenCode session ID (not a file path)
    if (!sessionFile.includes('/') && !sessionFile.includes('.jsonl')) {
      return openCodeWatcher.getHistory(sessionFile);
    }
    return sessionWatcher.getHistory(sessionFile);
  },
  subscribe(sessionFile: string, callback: Parameters<typeof sessionWatcher.watch>[1]) {
    if (!sessionFile.includes('/') && !sessionFile.includes('.jsonl')) {
      openCodeWatcher.watch(sessionFile, callback as (messages: ConversationMessage[]) => void);
      return () =>
        openCodeWatcher.stop(sessionFile, callback as (messages: ConversationMessage[]) => void);
    }
    // Use subscribe() which returns a ref-counted unsubscribe function.
    // The watcher is only torn down when the last subscriber disconnects.
    return sessionWatcher.subscribe(sessionFile, callback);
  },
};

// ── Startup warnings ────────────────────────────────────────────────

if (!process.env.API_KEY) {
  console.warn(
    `\n⚠ WARNING: API_KEY is not set. Authenticated API routes will return 401.\n  Run 'shooter setup' to configure, or set API_KEY in your environment.\n`
  );
}

// ── Wire singletons into WebSocket handlers ──────────────────────────

// The adapters bridge the gap between the real singletons' public APIs and
// the duck-typed interfaces expected by each WS handler.
setTerminalHandlerPtyManager(ptyManagerAdapter);
setSessionHandlerPtyManager(ptyManagerAdapter);
setSessionWatcher(sessionWatcherAdapter);

// Recover persisted terminals before accepting connections
await ptyManager.reconnectAll();

// ── HTTP server wrapping SvelteKit ───────────────────────────────────

const server: Server = createServer((req, res) => {
  handler(req, res, () => {
    res.writeHead(404).end();
  });
});

// ── WebSocket server (noServer mode — we handle upgrades manually) ───

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  let url: URL;
  try {
    url = new URL(request.url || '', `http://${request.headers.host}`);
  } catch {
    socket.destroy();
    return;
  }

  const ticket = url.searchParams.get('ticket');

  if (!validateTicket(ticket)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Delegate routing to the WS server module which inspects the pathname
  // and dispatches to terminal, session, or events handlers.
  setupWebSocketHandlers(wss, request, socket, head);
});

// ── Start keepalive pings (30s interval, keeps Cloudflare Tunnel alive) ──

startKeepalive();

// ── Listen ───────────────────────────────────────────────────────────
// Port resolution priority: CLI flag (--port / -p) > PORT env > default.
// Server fails fast on EADDRINUSE so the CLI's tunnel can stay in sync
// with the actual listen port.

function parseEnvPort(): number | undefined {
  const raw = process.env.PORT;
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 && n < 65536 ? n : undefined;
}

// Keep in sync with `parsePortFlag` in bin/shooter.cjs.
function parsePortArg(): number | undefined {
  const argv = process.argv.slice(2);
  const isValid = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < 65536;
  const fail = (raw: string): never => {
    console.error(`Error: invalid --port value "${raw}" — expected an integer in 0–65535.`);
    process.exit(2);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--port' || a === '-p') && argv[i + 1] !== undefined) {
      const raw = argv[i + 1];
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    } else if (a.startsWith('--port=')) {
      const raw = a.slice('--port='.length);
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    } else if (a.startsWith('-p=')) {
      const raw = a.slice('-p='.length);
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    }
  }
  return undefined;
}

const DEFAULT_PORT = 54007;
const requestedPort = parsePortArg() ?? parseEnvPort() ?? DEFAULT_PORT;

server.once('error', (err: NodeJS.ErrnoException): void => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Error: Port ${requestedPort} is already in use. Stop the existing process or pass --port <num>.`
    );
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(requestedPort, () => {
  console.log(`Shooter server running on http://localhost:${requestedPort}`);
});

// ── Graceful shutdown ────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n${signal} received — shutting down…`);

  stopKeepalive();
  ptyManager.disconnectAll();
  sessionWatcher.stopAll();
  openCodeWatcher.stopAll();

  // Terminate all remaining WebSocket clients (/ws/session, /ws/events)
  // so wss.close() doesn't hang waiting for them to disconnect.
  for (const client of wss.clients) {
    client.terminate();
  }

  wss.close(() => {
    server.close(() => {
      console.log('Shooter server stopped.');
      process.exit(0);
    });
  });

  // Force exit if graceful shutdown takes too long (10 seconds)
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
