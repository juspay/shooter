import { liveActivityStore } from '$lib/modules/server/apn/live-activity-store';
import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** Register (or refresh) a session's ActivityKit push token from the iOS app. */
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  try {
    const raw: unknown = await request.json();
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const activityPushToken =
      typeof body.activityPushToken === 'string' ? body.activityPushToken.trim() : '';
    if (!sessionId || !activityPushToken) {
      return json({ error: 'sessionId and activityPushToken are required' }, { status: 400 });
    }
    liveActivityStore.upsert(sessionId, activityPushToken);
    return json({ success: true });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, { status: 500 });
  }
};

/** Unregister a session's Live Activity (e.g. when the app ends it locally). */
export const DELETE: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  try {
    const raw: unknown = await request.json();
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return json({ error: 'sessionId is required' }, { status: 400 });
    }
    const removed = liveActivityStore.remove(sessionId);
    return json({ removed, success: true });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, { status: 500 });
  }
};
