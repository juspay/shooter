// Tracks WebSocket connections opened with a guest (scoped) ticket, per terminal,
// so revoke / mode-change / password-change can force-close them immediately.
// globalThis bridges the tsx server.ts and SvelteKit handler module scopes.

import type { WebSocket } from 'ws';

const GUESTS_KEY = '__shooter_ws_guest_conns';
const guests: Map<string, Set<WebSocket>> = ((globalThis as Record<string, unknown>)[
  GUESTS_KEY
] as Map<string, Set<WebSocket>>) || new Map<string, Set<WebSocket>>();
(globalThis as Record<string, unknown>)[GUESTS_KEY] = guests;

/** Force-close every guest connection for a terminal. Returns the number closed. */
export function closeGuests(terminalId: string): number {
  const set = guests.get(terminalId);
  if (!set) {
    return 0;
  }
  let closed = 0;
  for (const ws of set) {
    try {
      ws.close(4001, 'Share revoked');
      closed++;
    } catch {
      // Already closing/closed.
    }
  }
  guests.delete(terminalId);
  return closed;
}

/** Register a guest connection; auto-removes itself on close. */
export function registerGuest(terminalId: string, ws: WebSocket): void {
  let set = guests.get(terminalId);
  if (!set) {
    set = new Set<WebSocket>();
    guests.set(terminalId, set);
  }
  set.add(ws);
  ws.on('close', () => {
    const current = guests.get(terminalId);
    if (current) {
      current.delete(ws);
      if (current.size === 0) {
        guests.delete(terminalId);
      }
    }
  });
}
