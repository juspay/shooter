// Viewer-presence store: "is someone actually watching" (foreground) vs "away".
//
// Why this exists: the phone-resident autonomous loop holds a PERSISTENT /ws/events
// connection to run. So raw WebSocket-connection count no longer means "the user is
// watching" — it's always > 0. The autopilot push decision must instead key on whether a
// viewer is FOREGROUNDED (heartbeat within TTL), reported via POST /api/presence.
//
// globalThis singleton so the SvelteKit route (which writes it) and the server.ts engine
// (which reads it) share one instance across the dual module graph — same pattern as the
// ws ticket store and the event-listener registry.

const PRESENCE_TTL_MS = 45_000;
const KEY = '__shooter_presence';

// eslint-disable-next-line no-restricted-syntax -- internal singleton shape, never exported
interface PresenceRecord {
  everReported: boolean;
  lastForegroundAt: number;
}

/** True once any client has ever reported presence (used for backward-compatible fallback). */
export function hasEverReported(): boolean {
  return store().everReported;
}

/** True when a viewer reported `foreground` within the TTL window. */
export function isViewerPresent(
  now: number = Date.now(),
  ttlMs: number = PRESENCE_TTL_MS
): boolean {
  return now - store().lastForegroundAt < ttlMs;
}

/**
 * Record a presence heartbeat. `foreground` marks the viewer as actively watching (now);
 * `background` marks them away immediately (so push resumes without waiting out the TTL).
 */
export function reportPresence(state: 'background' | 'foreground', now: number = Date.now()): void {
  const s = store();
  s.everReported = true;
  s.lastForegroundAt = state === 'foreground' ? now : 0;
}

function store(): PresenceRecord {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) {
    g[KEY] = { everReported: false, lastForegroundAt: 0 };
  }
  return g[KEY] as PresenceRecord;
}
