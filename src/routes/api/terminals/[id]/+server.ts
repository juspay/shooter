import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// GET /api/terminals/:id — Get terminal details by ID
export const GET: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {return authError;}

  try {
    const terminal = ptyManager.get(params.id);

    if (!terminal) {
      return json({ error: 'Terminal not found' }, { status: 404 });
    }

    return json({
      args: terminal.args,
      clientCount: terminal.clients.size,
      command: terminal.command,
      createdAt: terminal.createdAt.toISOString(),
      cwd: terminal.cwd,
      exitCode: terminal.exitCode,
      exitedAt: terminal.exitedAt?.toISOString() ?? null,
      id: terminal.id,
      lastOutput: terminal.scrollback.length > 0 ? terminal.scrollback[terminal.scrollback.length - 1] : null,
      pid: terminal.pid,
      sessionWs: `/ws/session/${terminal.id}`,
      status: terminal.status,
      timestamp: new Date().toISOString(),
      ws: `/ws/terminal/${terminal.id}`,
    });
  } catch (error) {
    const err = error as Error;
    return json({ details: err.message, error: 'Failed to get terminal' }, { status: 500 });
  }
};

// DELETE /api/terminals/:id — Kill terminal by ID (SIGTERM)
export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {return authError;}

  try {
    const terminal = ptyManager.get(params.id);

    if (!terminal) {
      return json({ error: 'Terminal not found' }, { status: 404 });
    }

    if (terminal.status === 'exited') {
      ptyManager.remove(params.id);
      console.log(`[terminals] Removed exited terminal ${params.id}`);
      return json({
        removed: true,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    ptyManager.kill(params.id);

    console.log(`[terminals] Killed terminal ${params.id} (pid=${terminal.pid})`);

    return json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    return json({ details: err.message, error: 'Failed to kill terminal' }, { status: 500 });
  }
};
