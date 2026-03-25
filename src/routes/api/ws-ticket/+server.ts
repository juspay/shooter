// POST /api/ws-ticket — Generate a short-lived WebSocket authentication ticket.
//
// The client presents its Bearer API_KEY here, and receives a single-use ticket
// (32-byte hex string, valid for 30 seconds). The ticket is then passed as a
// query parameter on the WebSocket upgrade URL, keeping the long-lived API_KEY
// out of URL strings (which appear in proxy logs and browser history).
//
// Rate limited to 10 requests per minute per API key.

import { validateAuth } from '$lib/modules/server/auth';
import { generateTicket } from '$lib/modules/server/ws/ticket-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// ── Rate limiting ───────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds
const RATE_LIMIT_MAX = 10; // max 10 requests per window

/** Maps API key -> array of request timestamps (epoch ms). */
const rateLimitMap = new Map<string, number[]>();

/**
 * Check and record a request for the given API key.
 * Returns true if the request is within the rate limit, false if exceeded.
 */
function checkRateLimit(apiKey: string): boolean {
	const now = Date.now();
	const cutoff = now - RATE_LIMIT_WINDOW_MS;

	let timestamps = rateLimitMap.get(apiKey);
	if (!timestamps) {
		timestamps = [];
		rateLimitMap.set(apiKey, timestamps);
	}

	// Prune timestamps outside the window
	const recent = timestamps.filter((t) => t > cutoff);
	rateLimitMap.set(apiKey, recent);

	if (recent.length >= RATE_LIMIT_MAX) {
		return false;
	}

	recent.push(now);
	return true;
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
	const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
	for (const [key, timestamps] of rateLimitMap) {
		const recent = timestamps.filter((t) => t > cutoff);
		if (recent.length === 0) {
			rateLimitMap.delete(key);
		} else {
			rateLimitMap.set(key, recent);
		}
	}
}, 300_000).unref();

// ── Endpoint ────────────────────────────────────────────────────────

export const POST: RequestHandler = ({ request }) => {
	const authError = validateAuth(request);
	if (authError) {return authError;}

	// Extract the API key for rate limiting
	const apiKey = request.headers.get('authorization')!.substring(7);

	if (!checkRateLimit(apiKey)) {
		return json(
			{ error: 'Rate limit exceeded. Maximum 10 ticket requests per minute.' },
			{ status: 429 }
		);
	}

	const ticket = generateTicket();

	return json({
		expiresIn: 30,
		ticket,
	});
};
