import {
  cleanup,
  getDecision,
  getRichRequest,
  setDecision,
} from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { type DecisionKind, isDecisionKind } from '$lib/types';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// POST /api/response — iOS app sends the user's decision.
//
// Accepts the full DecisionKind union (allow/deny/option_1..4/plan_*).
// Routing of the decision back to Claude Code depends on the stored
// `response_kind` on the pending request:
//
//   - 'hook' (default): notifier.cjs is in a GET poll loop on this
//     same endpoint; setDecision() flips the row and the next poll
//     returns 'decided' so the hook can write its stdout response.
//   - 'pty' : the active Claude Code session is in a Shooter-managed
//     PTY; the user's choice will be written to that PTY's stdin so
//     Claude Code sees it as if the user typed at the laptop. Wired up
//     in PR-3; for PR-1 we accept the decision and stub the routing.
//   - 'info': no routing back to Claude Code. Decision is recorded for
//     audit / UI feedback only.
export const POST: RequestHandler = async ({ request }) => {
  cleanup();

  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: { decision?: unknown; requestId?: unknown };
  try {
    body = (await request.json()) as { decision?: unknown; requestId?: unknown };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    const { decision, requestId } = body;

    if (typeof requestId !== 'string' || requestId.length === 0) {
      return json({ error: 'requestId must be a non-empty string' }, { status: 400 });
    }
    if (!isDecisionKind(decision)) {
      return json(
        {
          error:
            'decision must be one of allow, deny, option_1..4, plan_auto, plan_accept, plan_review, plan_keep',
        },
        { status: 400 }
      );
    }

    // Persist first so polling notifier.cjs picks it up regardless of
    // which response_kind we route on. The 'pty' branch is additive —
    // it ALSO writes to the PTY but the row remains the source of truth.
    const decisionTyped: DecisionKind = decision;
    const found = setDecision(requestId, decisionTyped);
    if (!found) {
      return json({ error: 'Request not found or expired' }, { status: 404 });
    }

    // Routing dispatch. For PR-1 only the 'hook' path is functional;
    // 'pty' and 'info' are accepted but don't yet forward anywhere
    // (PR-3 wires PTY; 'info' is intentionally no-op).
    const entry = getRichRequest(requestId);
    const responseKind = entry?.responseKind ?? 'hook';

    console.log(
      `[response] Decision received: ${decisionTyped} for request ${requestId} (responseKind=${responseKind})`
    );

    if (responseKind === 'pty') {
      // PR-3 will write the chosen option to the matching PTY's stdin.
      // For PR-1 we accept and persist so the user gets a "Decision
      // recorded" confirmation — the laptop just won't act on it yet.
      return json({
        message: 'Decision recorded; PTY routing not yet implemented',
        responseKind,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    return json({
      message: 'Decision recorded',
      responseKind,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[response] Failed to process response:', toErrorMessage(error));
    return json({ error: 'Failed to process response' }, { status: 500 });
  }
};

// GET /api/response?requestId=xxx — notifier.cjs polls for a decision
export const GET: RequestHandler = ({ request, url }) => {
  cleanup();

  const authErr = validateAuth(request);
  if (authErr) {
    return authErr;
  }

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
