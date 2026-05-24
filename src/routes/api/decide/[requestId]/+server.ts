import type { DecidePayload } from '$lib/types';

import { getRichRequest } from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// GET /api/decide/[requestId]
//
// Returns the full Decide payload (question + options + responseKind +
// tool context) for the iOS Decide screen to render. Called when the
// user taps the notification body (or the "Open in Shooter" action)
// instead of one of the lock-screen quick-tap buttons.
//
// Separated from `/api/response` GET (which is the lightweight polling
// endpoint that returns only the decision) so the rich payload can
// evolve independently and only fires when the iOS screen actually
// needs the full context.
export const GET: RequestHandler = ({ params, request }) => {
  const authErr = validateAuth(request);
  if (authErr) {
    return authErr;
  }

  const requestId = params.requestId;
  if (!requestId) {
    return json({ error: 'requestId path parameter is required' }, { status: 400 });
  }

  const entry = getRichRequest(requestId);
  if (!entry) {
    return json({ error: 'Request not found or expired' }, { status: 404 });
  }

  const payload: DecidePayload = {
    options: entry.options,
    question: entry.question ?? '',
    requestId: entry.requestId,
    responseKind: entry.responseKind,
    toolInput: entry.toolInput,
    toolName: entry.toolName,
  };

  return json(payload);
};
