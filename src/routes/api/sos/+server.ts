import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** GET /api/sos — list all super-sessions. */
export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  return json({ superSessions: sosCoordinator.listSuperSessions() });
};

/** POST /api/sos — create a new super-session. */
export const POST: RequestHandler = async ({ request }) => {
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
  const payload = body as { label?: unknown };
  const label =
    typeof payload.label === 'string' && payload.label.trim() ? payload.label.trim() : 'Untitled';
  const session = sosCoordinator.createSuperSession(label);
  return json(session, { status: 201 });
};
