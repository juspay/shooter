import type { UsageSnapshot } from '$lib/types';

import { validateAuth } from '$lib/modules/server/auth';
import { usageSnapshot } from '$lib/modules/server/sessions/usage-reader';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// Scanning every transcript costs real I/O, and the panel polls. A short TTL
// keeps a phone refreshing on a slow link from re-reading the whole corpus,
// while staying well under the cadence at which usage visibly changes.
const CACHE_TTL_MS = 5_000;

let cached: null | UsageSnapshot = null;
let cachedKey = '';
let cachedAt = 0;

/** Clamp a query-string integer into range, falling back when absent or junk. */
function intParam(raw: null | string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  // 1440 minutes is the retention the reader keeps per-record history for;
  // a wider window would silently report a rate over missing data.
  const windowMinutes = intParam(url.searchParams.get('window'), 60, 1, 1440);
  const sessionLimit = intParam(url.searchParams.get('limit'), 20, 1, 200);
  const key = `${windowMinutes}:${sessionLimit}`;

  const now = Date.now();
  if (url.searchParams.get('refresh') === 'true' || key !== cachedKey) {
    cached = null;
  }
  if (!cached || now - cachedAt >= CACHE_TTL_MS) {
    // usageSnapshot single-flights internally, so overlapping requests that
    // miss this cache still share one scan rather than each starting their own.
    cached = await usageSnapshot({ sessionLimit, windowMinutes });
    cachedKey = key;
    cachedAt = Date.now();
  }

  return json(cached);
};
