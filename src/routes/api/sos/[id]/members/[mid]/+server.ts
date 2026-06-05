import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** DELETE /api/sos/[id]/members/[mid] — remove a member (unsubscribes its watcher). */
export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  if (!sosCoordinator.removeMember(params.id ?? '', params.mid ?? '')) {
    return json({ error: 'Super-session or member not found' }, { status: 404 });
  }
  return json({ removed: true });
};
