import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  return json({ error: 'Webhook endpoint not implemented' }, { status: 501 });
};
