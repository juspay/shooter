import { cleanup, getDecision, setDecision } from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// POST /api/response — iOS app sends the user's decision
export const POST: RequestHandler = async ({ request }) => {
  cleanup();

  const authError = validateAuth(request);
  if (authError) {return authError;}

  let body: { decision?: string; requestId?: string };
  try {
    body = (await request.json()) as { decision?: string; requestId?: string };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    const { decision, requestId } = body;

    if (!requestId || !decision) {
      return json({ error: 'requestId and decision are required' }, { status: 400 });
    }

    if (decision !== 'allow' && decision !== 'deny') {
      return json({ error: 'decision must be "allow" or "deny"' }, { status: 400 });
    }

    const found = setDecision(requestId, decision);
    if (!found) {
      return json({ error: 'Request not found or expired' }, { status: 404 });
    }

    console.log(`[response] Decision received: ${decision} for request ${requestId}`);

    return json({
      message: 'Decision recorded',
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    return json({ details: err.message, error: 'Failed to process response' }, { status: 500 });
  }
};

// GET /api/response?requestId=xxx — notifier.cjs polls for a decision
export const GET: RequestHandler = ({ request, url }) => {
  cleanup();

  const authErr = validateAuth(request);
  if (authErr) {return authErr;}

  const requestId = url.searchParams.get('requestId');
  if (!requestId) {
    return json({ error: 'requestId query parameter is required' }, { status: 400 });
  }

  const result = getDecision(requestId);

  if (result.status === 'not_found') {
    return json({ error: 'Request not found or expired' }, { status: 404 });
  }

  return json({
    decision: result.decision ?? null,
    status: result.status,
    timestamp: new Date().toISOString(),
  });
};
