// WebSocket ticket store.
// Generates short-lived, single-use tickets for authenticating WebSocket upgrades.
// Tickets expire after 30 seconds and are cleaned up every 30 seconds.
//
// This avoids putting the long-lived API_KEY in WebSocket URL query parameters,
// which would appear in proxy logs, Cloudflare access logs, and browser history.

import type { Ticket } from '$generated/types';

import { randomBytes } from 'crypto';

// Use globalThis to ensure a single shared Map across module instances.
// server.ts (via tsx) and SvelteKit's build handler load this module separately,
// creating two different module scopes. globalThis bridges them.
const GLOBAL_KEY = '__shooter_ws_tickets';
const tickets: Map<string, Ticket> =
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<string, Ticket>) ||
  new Map<string, Ticket>();
(globalThis as Record<string, unknown>)[GLOBAL_KEY] = tickets;

/**
 * Generate a new single-use ticket (32-byte hex string).
 * The ticket is valid for 30 seconds and can only be consumed once.
 */
export function generateTicket(): string {
  const ticket = randomBytes(32).toString('hex');
  tickets.set(ticket, { createdAt: Date.now(), used: false });
  return ticket;
}

/**
 * Validate and consume a ticket.
 * Returns true if the ticket is valid, not yet used, and not expired.
 * A valid ticket is marked as used (single-use) and cannot be reused.
 */
export function validateTicket(ticket: null | string): boolean {
  if (!ticket) {
    return false;
  }
  const entry = tickets.get(ticket);
  if (!entry || entry.used) {
    return false;
  }
  if (Date.now() - entry.createdAt > 30_000) {
    tickets.delete(ticket);
    return false;
  }
  entry.used = true;
  return true;
}

// Cleanup expired tickets every 30 seconds (matches ticket lifetime).
// .unref() ensures this timer does not prevent Node.js from exiting.
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tickets) {
    if (now - val.createdAt > 30_000) {
      tickets.delete(key);
    }
  }
}, 30_000).unref();
