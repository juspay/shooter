// Custom server entry point — run with `npx tsx server.ts`.
// Wraps the SvelteKit build output with a WebSocket server for terminal I/O,
// live session streaming, and a global event bus. NOT compiled by SvelteKit.

// Load .env into process.env before anything else (adapter-node reads process.env at runtime).
import 'dotenv/config';

import { createServer, type Server } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';

import { handler } from './build/handler.js';
import { validateTicket } from './src/lib/modules/server/ws/ticket-store.js';
import { setupWebSocketHandlers } from './src/lib/modules/server/ws/server.js';
import { startKeepalive, stopKeepalive } from './src/lib/modules/server/ws/keepalive.js';
import { setPtyManager as setTerminalHandlerPtyManager } from './src/lib/modules/server/ws/terminal-handler.js';
import {
	setPtyManager as setSessionHandlerPtyManager,
	setSessionWatcher,
} from './src/lib/modules/server/ws/session-handler.js';
import { ptyManager } from './src/lib/modules/server/terminal/pty-manager.js';
import { sessionWatcher } from './src/lib/modules/server/terminal/session-watcher.js';
import { openCodeWatcher } from './src/lib/modules/server/terminal/opencode-watcher.js';
import type { ConversationMessage } from './src/lib/modules/server/sessions/types.js';

// ── Adapters ─────────────────────────────────────────────────────────
// The WS handlers define their own duck-typed interfaces (PtyManagerLike,
// SessionWatcherLike) that differ slightly from the real singletons'
// public APIs. Thin adapters bridge the gap without modifying either side.

/** Adapt PtyManager (`.get()`) to the handlers' expected `.getTerminal()`. */
const ptyManagerAdapter = {
	getTerminal(id: string) {
		return ptyManager.get(id) ?? undefined;
	},
	attach(id: string, ws: WebSocket) {
		return ptyManager.attach(id, ws);
	},
	detach(id: string, ws: WebSocket) {
		return ptyManager.detach(id, ws);
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
			return () => openCodeWatcher.stop(sessionFile, callback as (messages: ConversationMessage[]) => void);
		}
		sessionWatcher.watch(sessionFile, callback);
		return () => sessionWatcher.stop(sessionFile);
	},
};

// ── Wire singletons into WebSocket handlers ──────────────────────────

// The adapters bridge the gap between the real singletons' public APIs and
// the duck-typed interfaces expected by each WS handler.
setTerminalHandlerPtyManager(ptyManagerAdapter);
setSessionHandlerPtyManager(ptyManagerAdapter);
setSessionWatcher(sessionWatcherAdapter);

// Recover persisted terminals before accepting connections
await ptyManager.reconnectAll();

// ── HTTP server wrapping SvelteKit ───────────────────────────────────

const server: Server = createServer(handler);

// ── WebSocket server (noServer mode — we handle upgrades manually) ───

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
	const url = new URL(request.url || '', `http://${request.headers.host}`);
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

const port = parseInt(process.env.PORT || '3000', 10);

server.listen(port, () => {
	console.log(`Shooter server running on http://localhost:${port}`);
});

// ── Graceful shutdown ────────────────────────────────────────────────

function shutdown(signal: string): void {
	console.log(`\n${signal} received — shutting down…`);

	stopKeepalive();
	ptyManager.disconnectAll();
	sessionWatcher.stopAll();
	openCodeWatcher.stopAll();

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
