// GET /api/ws-status — Returns the number of connected WebSocket clients.
//
// Used by notifier.cjs to decide whether to send an APNs push notification
// or skip it (because a WebSocket client is already listening for events).
// If at least one client is connected to the /ws/events channel, the notifier
// skips the push notification to avoid double-prompting.

import { validateAuth } from '$lib/modules/server/auth';
import { getConnectedClientCount } from '$lib/modules/server/ws/server';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// ── Endpoint ────────────────────────────────────────────────────────

export const GET: RequestHandler = ({ request }) => {
	const authError = validateAuth(request);
	if (authError) {return authError;}

	return json({
		connectedClients: getConnectedClientCount(),
	});
};
