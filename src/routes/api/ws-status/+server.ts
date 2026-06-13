// GET /api/ws-status — WebSocket presence for the notifier's push decision.
//
// `connectedClients` counts ALL /ws/events clients — but the phone-resident autonomous loop holds
// a PERSISTENT events connection, so that count is ~always > 0 and is NO LONGER a valid "someone is
// watching" signal (using it suppressed every phone push while autopilot ran). `viewerPresent` is
// the correct signal: a viewer reported `foreground` within the heartbeat TTL (POST /api/presence) —
// the same signal the autopilot engine uses to gate its pushes. The notifier prefers viewerPresent.

import { validateAuth } from '$lib/modules/server/auth';
import { isViewerPresent } from '$lib/modules/server/ws/presence-store';
import { getConnectedClientCount } from '$lib/modules/server/ws/server';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// ── Endpoint ────────────────────────────────────────────────────────

export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  return json({
    connectedClients: getConnectedClientCount(),
    viewerPresent: isViewerPresent(),
  });
};
