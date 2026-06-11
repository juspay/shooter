// POST /api/terminals/[id]/share/auth — exchange the share password for a
// guest session token. Public endpoint; brute-force-limited per IP+terminal.

import type { ShareAuthRequest } from '$lib/types';

import { shareStore, verifyPassword } from '$lib/modules/server/terminal/share-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

/** Maps "ip:terminalId" -> attempt timestamps (epoch ms). */
const attempts = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  attempts.set(key, recent);
  if (recent.length >= RATE_LIMIT_MAX) {
    return false;
  }
  recent.push(now);
  return true;
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      attempts.delete(key);
    } else {
      attempts.set(key, recent);
    }
  }
}, 300_000).unref();

export const POST: RequestHandler = async (event) => {
  const { params, request } = event;

  const share = shareStore.getShare(params.id);
  if (!share) {
    return json({ error: 'Not shared' }, { status: 404 });
  }

  // Behind Cloudflare Tunnel the connecting IP arrives in headers.
  let ip = 'unknown';
  const cfIp = request.headers.get('cf-connecting-ip');
  const fwd = request.headers.get('x-forwarded-for');
  if (cfIp) {
    ip = cfIp;
  } else if (fwd) {
    ip = fwd.split(',')[0].trim();
  } else {
    try {
      ip = event.getClientAddress();
    } catch {
      // Keep 'unknown' — the rate limit still applies per terminal.
    }
  }

  if (!checkRateLimit(`${ip}:${params.id}`)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  let body: ShareAuthRequest;
  try {
    body = (await request.json()) as ShareAuthRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || !verifyPassword(body.password, share.passwordHash)) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  const { expiresAt, token } = shareStore.createSession(params.id);
  return json({ expiresAt, mode: share.mode, token });
};
