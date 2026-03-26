// WebSocket events handler — broadcast-only global event bus.
// Manages the /ws/events channel: tracks connected clients and broadcasts
// ShooterEvents to all listeners. No client-to-server messages are expected.

import type { PermissionDecision, SessionSource } from '$generated/types';
import type { WebSocket } from 'ws';

// ── Event types ─────────────────────────────────────────────────────

export type ShooterEvent =
  | { code: null | number; terminalId: string; type: 'terminal-exited' }
  | { command: string; terminalId: string; type: 'terminal-created' }
  | { decision: PermissionDecision; requestId: string; type: 'permission-resolved' }
  | {
      input: Record<string, unknown>;
      requestId: string;
      tool: string;
      type: 'permission-requested';
    }
  | { project: string; sessionId: string; source: SessionSource; type: 'session-started' }
  | { sessionId: string; summary: string; type: 'session-ended' };

// ── Connection tracking ─────────────────────────────────────────────

/** All clients subscribed to the global events channel. */
const EVENTS_KEY = '__shooter_ws_events_clients';
const eventsClients: Set<WebSocket> =
  ((globalThis as Record<string, unknown>)[EVENTS_KEY] as Set<WebSocket>) || new Set<WebSocket>();
(globalThis as Record<string, unknown>)[EVENTS_KEY] = eventsClients;

// ── Handlers ────────────────────────────────────────────────────────

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

/**
 * Handle a new WebSocket connection on /ws/events.
 * Adds the client to the events set, sends a welcome message,
 * and registers cleanup on close.
 */
export function handleEventsConnection(ws: WebSocket): void {
  eventsClients.add(ws);

  ws.send(
    JSON.stringify({
      channel: 'events',
      clients: eventsClients.size,
      timestamp: new Date().toISOString(),
      type: 'welcome',
    })
  );

  ws.on('close', () => {
    eventsClients.delete(ws);
  });
}
