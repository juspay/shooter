// WebSocket events handler — broadcast-only global event bus.
// Manages the /ws/events channel: tracks connected clients and broadcasts
// ShooterEvents to all listeners. No client-to-server messages are expected.

import type { WebSocket } from 'ws';

// ── Event types ─────────────────────────────────────────────────────

export type ShooterEvent =
  | { type: 'session-started'; sessionId: string; project: string; source: 'claude-code' | 'opencode' }
  | { type: 'session-ended'; sessionId: string; summary: string }
  | { type: 'permission-requested'; requestId: string; tool: string; input: Record<string, unknown> }
  | { type: 'permission-resolved'; requestId: string; decision: 'allow' | 'deny' }
  | { type: 'terminal-created'; terminalId: string; command: string }
  | { type: 'terminal-exited'; terminalId: string; code: number | null };

// ── Connection tracking ─────────────────────────────────────────────

/** All clients subscribed to the global events channel. */
const EVENTS_KEY = '__shooter_ws_events_clients';
const eventsClients: Set<WebSocket> =
  ((globalThis as Record<string, unknown>)[EVENTS_KEY] as Set<WebSocket>) || new Set<WebSocket>();
(globalThis as Record<string, unknown>)[EVENTS_KEY] = eventsClients;

// ── Handlers ────────────────────────────────────────────────────────

/**
 * Handle a new WebSocket connection on /ws/events.
 * Adds the client to the events set, sends a welcome message,
 * and registers cleanup on close.
 */
export function handleEventsConnection(ws: WebSocket): void {
  eventsClients.add(ws);

  ws.send(
    JSON.stringify({
      type: 'welcome',
      channel: 'events',
      clients: eventsClients.size,
      timestamp: new Date().toISOString(),
    })
  );

  ws.on('close', () => {
    eventsClients.delete(ws);
  });
}

/**
 * Broadcast a ShooterEvent to every connected events client.
 * Silently skips clients that are not in the OPEN ready state.
 */
export function broadcastEvent(event: ShooterEvent): void {
  const data = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  for (const ws of eventsClients) {
    // WebSocket.OPEN === 1
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

/**
 * Returns the number of clients currently connected to the events channel.
 * Used by the notifier to decide between WebSocket broadcast vs APNs push.
 */
export function getEventsClientCount(): number {
  return eventsClients.size;
}
