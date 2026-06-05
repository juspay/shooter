import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** GET /api/sos/[id] — fetch one super-session (incl. members + transcript). */
export const GET: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  const session = sosCoordinator.getSuperSession(params.id ?? '');
  if (!session) {
    return json({ error: 'Super-session not found' }, { status: 404 });
  }
  return json(session);
};

/** PATCH /api/sos/[id] — update lifecycle status (active | paused | archived). */
export const PATCH: RequestHandler = async ({ params, request }) => {
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
  const payload = body as { status?: unknown };
  if (payload.status !== 'active' && payload.status !== 'paused' && payload.status !== 'archived') {
    return json({ error: 'status must be active | paused | archived' }, { status: 400 });
  }
  if (!sosCoordinator.setStatus(params.id ?? '', payload.status)) {
    return json({ error: 'Super-session not found' }, { status: 404 });
  }
  return json({ id: params.id, status: payload.status });
};

/** DELETE /api/sos/[id] — tear down a super-session (unsubscribes all members). */
export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  if (!sosCoordinator.deleteSuperSession(params.id ?? '')) {
    return json({ error: 'Super-session not found' }, { status: 404 });
  }
  return json({ deleted: true });
};
