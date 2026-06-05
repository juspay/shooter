import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const MAX_RELAY_TEXT = 10240; // 10 KB, same cap as /ws/session send-input

/**
 * POST /api/sos/[id]/inject — human-initiated relay: inject text into a member's
 * Shooter-owned terminal and record it in the merged transcript.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  const payload = body as { text?: unknown; toMemberId?: unknown };
  if (typeof payload.toMemberId !== 'string' || payload.toMemberId.length === 0) {
    return json({ error: 'toMemberId is required (string)' }, { status: 400 });
  }
  if (typeof payload.text !== 'string' || payload.text.length === 0) {
    return json({ error: 'text is required (string)' }, { status: 400 });
  }
  if (Buffer.byteLength(payload.text, 'utf8') > MAX_RELAY_TEXT) {
    return json({ error: `text exceeds ${MAX_RELAY_TEXT} bytes` }, { status: 413 });
  }

  const error = sosCoordinator.relayForward(params.id ?? '', payload.toMemberId, payload.text);
  if (error) {
    const status = error.includes('not found') ? 404 : 400;
    return json({ error }, { status });
  }
  return json({ ok: true });
};
