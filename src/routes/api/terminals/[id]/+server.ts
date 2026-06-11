import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { resolveAccess } from '$lib/modules/server/terminal/share-auth';
import { shareStore } from '$lib/modules/server/terminal/share-store';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { closeGuests } from '$lib/modules/server/ws/guest-registry';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/** Extract the last non-empty line from a scrollback string. */
function lastScrollbackLine(scrollback: string): null | string {
  if (!scrollback) {
    return null;
  }
  const lines = scrollback.trimEnd().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line) {
      return line.slice(0, 200);
    }
  }
  return null;
}

// GET /api/terminals/:id — Get terminal details by ID
// Accepts the API key (owner) or a share session token scoped to this terminal.
export const GET: RequestHandler = ({ params, request }) => {
  const access = resolveAccess(request, params.id);
  if (!access) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const terminal = ptyManager.get(params.id);

    if (!terminal) {
      return json({ error: 'Terminal not found' }, { status: 404 });
    }

    return json({
      args: terminal.args,
      clientCount: terminal.clients.size,
      cols: terminal.cols,
      command: terminal.command,
      createdAt: terminal.createdAt.toISOString(),
      cwd: terminal.cwd,
      exitCode: terminal.exitCode,
      exitedAt: terminal.exitedAt?.toISOString() ?? null,
      id: terminal.id,
      lastOutput: lastScrollbackLine(terminal.scrollback),
      pid: terminal.pid,
      rows: terminal.rows,
      sessionWs: `/ws/session/${terminal.id}`,
      status: terminal.status,
      timestamp: new Date().toISOString(),
      ws: `/ws/terminal/${terminal.id}`,
      ...(access.level === 'guest' ? { shareMode: access.mode } : {}),
    });
  } catch (error) {
    console.error('[terminals] Failed to get terminal:', toErrorMessage(error));
    return json({ error: 'Failed to get terminal' }, { status: 500 });
  }
};

// DELETE /api/terminals/:id — Kill terminal by ID (SIGTERM)
export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const terminal = ptyManager.get(params.id);

    if (!terminal) {
      return json({ error: 'Terminal not found' }, { status: 404 });
    }

    if (terminal.status === 'exited') {
      ptyManager.remove(params.id);
      shareStore.deleteShare(params.id);
      closeGuests(params.id);
      console.log(`[terminals] Removed exited terminal ${params.id}`);
      return json({
        removed: true,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    ptyManager.kill(params.id);
    shareStore.deleteShare(params.id);
    closeGuests(params.id);

    console.log(`[terminals] Killed terminal ${params.id} (pid=${terminal.pid})`);

    return json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[terminals] Failed to kill terminal:', toErrorMessage(error));
    return json({ error: 'Failed to kill terminal' }, { status: 500 });
  }
};
