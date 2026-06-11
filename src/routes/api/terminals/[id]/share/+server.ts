// /api/terminals/[id]/share — owner management of a terminal's share.
// GET: current state. PUT: create/update. DELETE: revoke.
// All methods require the API key (owners only).

import type { ShareConfigRequest, ShareInfoResponse, ShareMode } from '$lib/types';

import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { hashPassword, shareStore } from '$lib/modules/server/terminal/share-store';
import { closeGuests } from '$lib/modules/server/ws/guest-registry';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const MIN_PASSWORD_LENGTH = 6;
const MODES: ShareMode[] = ['view', 'control'];

function toInfo(terminalId: string): ShareInfoResponse {
  const share = shareStore.getShare(terminalId);
  if (!share) {
    return { active: false, createdAt: null, mode: null, updatedAt: null };
  }
  return { active: true, createdAt: share.createdAt, mode: share.mode, updatedAt: share.updatedAt };
}

export const GET: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  return json(toInfo(params.id));
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  if (!ptyManager.get(params.id)) {
    return json({ error: 'Terminal not found' }, { status: 404 });
  }

  let body: ShareConfigRequest;
  try {
    body = (await request.json()) as ShareConfigRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!MODES.includes(body.mode)) {
    return json({ error: "mode must be 'view' or 'control'" }, { status: 400 });
  }

  const existing = shareStore.getShare(params.id);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!existing && password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `password is required (min ${String(MIN_PASSWORD_LENGTH)} chars)` },
      { status: 400 }
    );
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `password must be at least ${String(MIN_PASSWORD_LENGTH)} chars` },
      { status: 400 }
    );
  }

  const now = Date.now();
  shareStore.setShare({
    createdAt: existing?.createdAt ?? now,
    mode: body.mode,
    // `existing` is guaranteed non-null when password is empty (validated above).
    passwordHash: password ? hashPassword(password) : (existing?.passwordHash ?? ''),
    terminalId: params.id,
    updatedAt: now,
  });

  // A new password invalidates existing guest sessions; any change to the
  // share forces connected guests to reconnect under the new scope.
  if (password) {
    shareStore.deleteSessions(params.id);
  }
  if (password || existing?.mode !== body.mode) {
    closeGuests(params.id);
  }

  return json(toInfo(params.id));
};

export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  shareStore.deleteShare(params.id);
  const closed = closeGuests(params.id);
  return json({ closedConnections: closed, success: true });
};
