// Viewer-presence endpoint. The dashboard / phone posts a heartbeat so the autopilot
// engine can push only when the user is AWAY (not foregrounded) — see presence-store.ts.
// Distinct from raw WebSocket connection count, which the autonomous loop keeps open.

import { validateAuth } from '$lib/modules/server/auth';
import {
  hasEverReported,
  isViewerPresent,
  reportPresence,
} from '$lib/modules/server/ws/presence-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  return json({ everReported: hasEverReported(), present: isViewerPresent() });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  let body: { state?: unknown };
  try {
    body = (await request.json()) as { state?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.state !== 'foreground' && body.state !== 'background') {
    return json({ error: "state must be 'foreground' or 'background'" }, { status: 400 });
  }
  reportPresence(body.state);
  return json({ everReported: hasEverReported(), present: isViewerPresent(), state: body.state });
};
