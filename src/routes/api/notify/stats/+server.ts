import { notificationStore } from '$lib/modules/server/apn/notification-store';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Cap the window: telemetry is retained for 30 days, so a longer window can't
// return more rows — clamping keeps a huge `?since=` from producing a negative
// lower bound (and a pointless full-table scan).
const MAX_WINDOW_MS = 90 * DAY_MS;

/**
 * Parse the `since` query param into an absolute epoch-ms lower bound. Accepts a
 * duration: `24h` / `7d` / a raw millisecond count, clamped to 90 days. Defaults
 * to the last 24h.
 */
function parseSince(raw: null | string, now: number): number {
  if (!raw) {
    return now - DAY_MS;
  }
  let dur = DAY_MS;
  const m = /^(\d+)\s*([dh])$/i.exec(raw.trim());
  if (m) {
    dur = parseInt(m[1], 10) * (m[2].toLowerCase() === 'd' ? DAY_MS : HOUR_MS);
  } else {
    const raw2 = Number(raw);
    if (Number.isFinite(raw2) && raw2 > 0) {
      dur = raw2;
    }
  }
  return now - Math.min(dur, MAX_WINDOW_MS);
}

/** GET /api/notify/stats?since=24h — aggregated notification telemetry. */
export const GET: RequestHandler = ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  const now = Date.now();
  const sinceMs = parseSince(url.searchParams.get('since'), now);
  const stats = notificationStore.stats(sinceMs, now);
  return json({
    ...stats,
    recent: notificationStore.recent(25),
    since: sinceMs,
  });
};
