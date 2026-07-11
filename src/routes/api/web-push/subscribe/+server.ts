import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { webPushStore } from '$lib/modules/server/webpush/web-push-store';
import { isWebPushSubscriptionInput } from '$lib/types';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** Register (or refresh) a browser push subscription. */
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body: unknown = await request.json();
    if (!isWebPushSubscriptionInput(body)) {
      return json({ error: 'Invalid push subscription' }, { status: 400 });
    }
    const rec = webPushStore.upsert(body);
    return json({ id: rec.id, success: true });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, { status: 500 });
  }
};

/** Remove a browser push subscription by endpoint. */
export const DELETE: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body: unknown = await request.json();
    const endpoint =
      body &&
      typeof body === 'object' &&
      typeof (body as Record<string, unknown>).endpoint === 'string'
        ? ((body as Record<string, unknown>).endpoint as string)
        : '';
    if (!endpoint) {
      return json({ error: 'endpoint is required' }, { status: 400 });
    }
    const removed = webPushStore.deleteByEndpoint(endpoint);
    return json({ removed, success: true });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, { status: 500 });
  }
};
