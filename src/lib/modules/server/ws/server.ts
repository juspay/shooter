// WebSocket server routing module.
// Called from the custom server entry point (server.ts at project root) on HTTP upgrade events.
// Routes connections to the appropriate handler based on URL path:
//   /ws/terminal/:id  -> Terminal I/O (raw PTY stream)
//   /ws/session/:id   -> Live structured session stream
//   /ws/events         -> Global event bus (broadcasts)

import type { TicketScope } from '$lib/types';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { WebSocket, WebSocketServer } from 'ws';

import {
  broadcastEvent as broadcastEventToClients,
  getEventsClientCount,
  handleEventsConnection,
} from './events-handler.js';
import { registerGuest } from './guest-registry.js';
import { handleSessionConnection } from './session-handler.js';
import { handleSuperSessionConnection } from './super-session-handler.js';
import { handleTerminalConnection } from './terminal-handler.js';
export type { WireShooterEvent as ShooterEvent } from '$lib/types';

// ── Connection tracking ──────────────────────────────────────────────

/** All active WebSocket connections (used by keepalive). */
const allConnections = new Set<WebSocket>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Returns the set of all tracked connections (needed by keepalive module).
 */
export function getAllConnections(): Set<WebSocket> {
  return allConnections;
}

/**
 * Returns the number of clients connected to the events channel.
 * Used by the notifier to decide between WebSocket broadcast vs APNs push.
 */
export function getConnectedClientCount(): number {
  return getEventsClientCount();
}

/**
 * Handle an HTTP upgrade request by routing it to the correct WebSocket handler.
 * Destroys the socket if the URL does not match any known route.
 */
export function setupWebSocketHandlers(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  scope?: TicketScope
): void {
  const host = request.headers.host ?? 'localhost';
  let pathname: string;
  try {
    pathname = new URL(request.url || '/', `http://${host}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  // Route matching
  const terminalMatch = /^\/ws\/terminal\/(.+)$/.exec(pathname);
  const superSessionMatch = /^\/ws\/super-session\/(.+)$/.exec(pathname);
  const sessionMatch = /^\/ws\/session\/(.+)$/.exec(pathname);
  const isEvents = pathname === '/ws/events';

  if (!terminalMatch && !superSessionMatch && !sessionMatch && !isEvents) {
    socket.destroy();
    return;
  }

  // Scoped (guest) tickets may only open the terminal/session channels of
  // their own terminal. Events and super-session channels broadcast global
  // data, so they are denied outright.
  if (scope) {
    const target = terminalMatch?.[1] ?? sessionMatch?.[1];
    if (!target || superSessionMatch || target !== scope.terminalId) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    allConnections.add(ws);

    if (scope) {
      registerGuest(scope.terminalId, ws);
    }

    ws.on('close', () => {
      allConnections.delete(ws);
    });

    ws.on('error', () => {
      // Prevent unhandled error crashes; cleanup happens in 'close'.
    });

    if (terminalMatch) {
      const terminalId = terminalMatch[1];
      handleTerminalConnection(ws, terminalId, scope);
    } else if (superSessionMatch) {
      const superSessionId = superSessionMatch[1];
      handleSuperSessionConnection(ws, superSessionId);
    } else if (sessionMatch) {
      const sessionId = sessionMatch[1];
      handleSessionConnection(ws, sessionId, scope);
    } else if (isEvents) {
      handleEventsConnection(ws);
    }
  });
}

/**
 * Broadcast an event to all clients connected on the /ws/events channel.
 * Delegates to the events handler which owns the client set.
 */
export { broadcastEventToClients as broadcastEvent };
