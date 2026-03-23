// WebSocket keepalive module.
// Sends protocol-level ping frames every 30 seconds to all tracked connections.
// If a client does not respond with a pong within 10 seconds, the connection is
// terminated and cleaned up.
//
// Cloudflare Tunnel closes idle WebSocket connections after ~100 seconds,
// so 30-second pings keep connections alive through the tunnel.

import type { WebSocket } from 'ws';

import { getAllConnections } from './server.js';

// ── Configuration ────────────────────────────────────────────────────

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

// ── Internal state ───────────────────────────────────────────────────

let pingInterval: null | ReturnType<typeof setInterval> = null;

/**
 * Track which connections have an outstanding pong we are waiting for.
 * Maps a WebSocket to its pong-timeout timer.
 */
const pendingPongs = new Map<WebSocket, ReturnType<typeof setTimeout>>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start the keepalive ping loop.
 * Safe to call multiple times — subsequent calls are no-ops until `stopKeepalive()`.
 */
export function startKeepalive(): void {
	if (pingInterval) {
		return;
	}

	pingInterval = setInterval(() => {
		const connections = getAllConnections();

		for (const ws of connections) {
			if (ws.readyState !== 1) {
				// Not OPEN — skip (will be cleaned up by close handler)
				continue;
			}

			// If there is already a pending pong timer for this connection,
			// the previous ping was never answered. This should not happen
			// under normal operation because the timeout fires in 10s and
			// the interval is 30s, but guard against it anyway.
			if (pendingPongs.has(ws)) {
				continue;
			}

			// Set up a timer that fires if no pong arrives within the timeout.
			const timeout = setTimeout(() => {
				cleanup();
				// No pong received — consider the connection dead.
				ws.terminate();
			}, PONG_TIMEOUT_MS);

			pendingPongs.set(ws, timeout);

			// Shared cleanup: clear the timer and remove both listeners
			// so that close listeners do not accumulate across ping cycles.
			function cleanup() {
				ws.removeListener('pong', onPong);
				ws.removeListener('close', onClose);
				const timer = pendingPongs.get(ws);
				if (timer) {
					clearTimeout(timer);
				}
				pendingPongs.delete(ws);
			}

			const onPong = () => {
				cleanup();
			};

			const onClose = () => {
				cleanup();
			};

			ws.once('pong', onPong);
			ws.once('close', onClose);

			// Send the protocol-level ping frame.
			ws.ping();
		}
	}, PING_INTERVAL_MS);
}

/**
 * Stop the keepalive ping loop and clear all pending pong timers.
 */
export function stopKeepalive(): void {
	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}

	// Clear any outstanding pong timers.
	for (const [, timer] of pendingPongs) {
		clearTimeout(timer);
	}
	pendingPongs.clear();
}
