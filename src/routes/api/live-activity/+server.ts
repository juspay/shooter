import type {
  LiveActivityContentState,
  LiveActivityEvent,
  LiveActivityPushInput,
} from '$lib/types';

import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { liveActivityStore } from '$lib/modules/server/apn/live-activity-store';
import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// Reuse a singleton APNs client (shared HTTP/2 connection), same as /api/notify.
let apnsSingleton: LibraryAPNsService | null = null;
function getAPNsClient(): LibraryAPNsService {
  if (!apnsSingleton) {
    apnsSingleton = new LibraryAPNsService();
  }
  return apnsSingleton;
}

const EVENTS: readonly LiveActivityEvent[] = ['end', 'start', 'update'];

function isContentState(v: unknown): v is LiveActivityContentState {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.status === 'string' && typeof o.title === 'string' && typeof o.updatedAt === 'string'
  );
}

/**
 * Push one Live Activity (ActivityKit) update to a specific activity push token.
 * The iOS app obtains the token from `Activity.pushToken` and registers it; the
 * server (or autopilot engine) drives updates through here.
 */
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== 'object') {
      return json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }
    const body = raw as Record<string, unknown>;

    // Target either an explicit push token or a registered session (token looked
    // up from the store — the common path once the app has registered).
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const activityPushToken =
      typeof body.activityPushToken === 'string' && body.activityPushToken.trim()
        ? body.activityPushToken.trim()
        : sessionId
          ? (liveActivityStore.getBySession(sessionId)?.activityPushToken ?? '')
          : '';
    if (!activityPushToken) {
      return json(
        { error: 'activityPushToken or a registered sessionId is required' },
        { status: 400 }
      );
    }

    const event = body.event as LiveActivityEvent;
    if (!EVENTS.includes(event)) {
      return json({ error: `event must be one of ${EVENTS.join(', ')}` }, { status: 400 });
    }
    if (!isContentState(body.contentState)) {
      return json(
        { error: 'contentState requires string title, status, and updatedAt' },
        { status: 400 }
      );
    }

    const apns = getAPNsClient();
    if (!apns.isConfigured()) {
      return json({ error: 'APNs is not configured on this server' }, { status: 503 });
    }

    const input: LiveActivityPushInput = {
      contentState: body.contentState,
      event,
      ...(typeof body.staleDate === 'number' ? { staleDate: body.staleDate } : {}),
      ...(typeof body.dismissalDate === 'number' ? { dismissalDate: body.dismissalDate } : {}),
      ...(typeof body.relevanceScore === 'number' ? { relevanceScore: body.relevanceScore } : {}),
      ...(body.alert &&
      typeof body.alert === 'object' &&
      typeof (body.alert as Record<string, unknown>).title === 'string' &&
      typeof (body.alert as Record<string, unknown>).body === 'string'
        ? { alert: body.alert as { body: string; title: string } }
        : {}),
    };

    const result = await apns.sendLiveActivity(activityPushToken, input);

    // Housekeeping: forget the token when the activity ends or APNs reports it
    // gone (410), so we don't keep pushing to a dead activity.
    if (event === 'end' || result.httpStatus === 410) {
      liveActivityStore.removeByToken(activityPushToken);
    }

    return json({ httpStatus: result.httpStatus, success: result.success });
  } catch (error) {
    return json({ error: toErrorMessage(error) }, { status: 500 });
  }
};
