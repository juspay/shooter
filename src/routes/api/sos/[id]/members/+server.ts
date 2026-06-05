import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { isValidProvider, isValidSessionKey } from '$lib/modules/server/ws/super-session-handler';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** POST /api/sos/[id]/members — add a member session to a super-session. */
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
  const payload = body as {
    capability?: unknown;
    provider?: unknown;
    sessionKey?: unknown;
    terminalId?: unknown;
  };

  if (typeof payload.sessionKey !== 'string' || !isValidSessionKey(payload.sessionKey)) {
    return json({ error: 'sessionKey must be a session id or a path under home' }, { status: 400 });
  }
  if (typeof payload.provider !== 'string' || !isValidProvider(payload.provider)) {
    return json({ error: 'provider must be a known session source' }, { status: 400 });
  }

  const member = sosCoordinator.addMember(params.id ?? '', {
    capability: typeof payload.capability === 'string' ? payload.capability : undefined,
    provider: payload.provider,
    sessionKey: payload.sessionKey,
    terminalId: typeof payload.terminalId === 'string' ? payload.terminalId : null,
  });
  if (!member) {
    return json({ error: 'Super-session not found' }, { status: 404 });
  }
  return json(member, { status: 201 });
};
