/**
 * Shared sessionStorage cache helpers.
 *
 * Default TTL is 30 seconds. Callers may override per-call.
 */

const DEFAULT_TTL_MS = 30_000;

export function getCached(key: string, ttlMs: number = DEFAULT_TTL_MS): unknown {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) {
      return null;
    }
    const { data, timestamp } = JSON.parse(item) as { data: unknown; timestamp: number };
    if (Date.now() - timestamp > ttlMs) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setCache(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // sessionStorage full — silently ignore
  }
}
