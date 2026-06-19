import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { resolveAccess } from '$lib/modules/server/terminal/share-auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// POST /api/terminals/:id/resize — Resize terminal
// Accepts the API key (owner) or a control-mode share token for this terminal.
export const POST: RequestHandler = async ({ params, request }) => {
  const access = resolveAccess(request, params.id);
  if (!access) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (access.level === 'guest' && access.mode !== 'control') {
    return json({ error: 'View-only access' }, { status: 403 });
  }

  let body: { cols?: number; rows?: number };
  try {
    body = (await request.json()) as { cols?: number; rows?: number };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    const { cols, rows } = body;

    if (cols === undefined || rows === undefined) {
      return json({ error: 'cols and rows are required' }, { status: 400 });
    }

    if (typeof cols !== 'number' || cols < 1) {
      return json({ error: 'cols must be a positive number' }, { status: 400 });
    }

    if (typeof rows !== 'number' || rows < 1) {
      return json({ error: 'rows must be a positive number' }, { status: 400 });
    }

    if (cols > 500 || rows > 200) {
      return json({ error: 'cols must be <= 500 and rows must be <= 200' }, { status: 400 });
    }

    const terminal = ptyManager.get(params.id);

    if (!terminal) {
      return json({ error: 'Terminal not found' }, { status: 404 });
    }

    if (terminal.status === 'exited') {
      return json({ error: 'Terminal already exited' }, { status: 409 });
    }

    // Phase 3: ptyManager.resize() persists cols/rows to SQLite (G5) and
    // broadcasts the new size to ALL attached clients (including this caller's
    // own clients), intentionally consistent with the WS authority path.
    ptyManager.resize(params.id, cols, rows);

    console.log(`[terminals] Resized terminal ${params.id} to ${cols}x${rows}`);

    return json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[terminals] Failed to resize terminal:', toErrorMessage(error));
    return json({ error: 'Failed to resize terminal' }, { status: 500 });
  }
};
