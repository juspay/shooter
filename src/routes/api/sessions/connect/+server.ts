import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';
import { realpathSync, statSync } from 'fs';
import { isAbsolute, relative } from 'path';

import type { RequestHandler } from './$types';

// POST /api/sessions/connect — Resume a Claude Code / OpenCode session in a new terminal
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: { command?: string; cwd?: string; noCreate?: boolean; sessionId?: string };
  try {
    body = (await request.json()) as {
      command?: string;
      cwd?: string;
      noCreate?: boolean;
      sessionId?: string;
    };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { command, cwd, noCreate, sessionId } = body;

  // --- Validate required fields ---

  if (!sessionId || typeof sessionId !== 'string') {
    return json({ error: 'sessionId is required (string)' }, { status: 400 });
  }

  if (!cwd || typeof cwd !== 'string') {
    return json({ error: 'cwd is required (string)' }, { status: 400 });
  }

  if (!command || (command !== 'claude' && command !== 'opencode')) {
    return json({ error: 'command must be "claude" or "opencode"' }, { status: 400 });
  }

  // --- Validate cwd (same checks as POST /api/terminals) ---

  let realCwd: string;
  try {
    realCwd = realpathSync(cwd);
    if (!statSync(realCwd).isDirectory()) {
      return json({ error: 'Invalid working directory' }, { status: 400 });
    }
  } catch {
    return json({ error: 'Invalid working directory' }, { status: 400 });
  }
  const home = process.env.HOME || '';
  if (home) {
    const rel = relative(home, realCwd);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return json({ error: 'Working directory must be under home directory' }, { status: 400 });
    }
  }

  // --- Reuse existing terminal if one is already running for this session ---

  const existing = ptyManager
    .list()
    .find((t) => t.status === 'running' && (
      t.sessionFile?.endsWith(`/${sessionId}.jsonl`) || t.openCodeSessionId === sessionId
    ));

  if (existing) {
    console.log(
      `[sessions/connect] Reusing terminal ${existing.id} for ${command} session ${sessionId}`
    );
    return json({
      command: existing.command,
      createdAt: existing.createdAt.toISOString(),
      cwd: existing.cwd,
      id: existing.id,
      pid: existing.pid,
      reused: true,
      sessionId,
      sessionWs: `/ws/session/${existing.id}`,
      terminalId: existing.id,
      ws: `/ws/terminal/${existing.id}`,
    });
  }

  // No existing terminal — return 404 if caller requested no-create
  if (noCreate) {
    return json({ error: 'No existing terminal for this session' }, { status: 404 });
  }

  // --- Build args based on command ---

  const args: string[] =
    command === 'claude' ? ['--resume', sessionId] : ['--session', sessionId];

  try {
    const terminal = await ptyManager.create(command, args, realCwd, 120, 40);

    console.log(
      `[sessions/connect] Created terminal ${terminal.id} for ${command} session ${sessionId} (pid=${terminal.pid})`
    );

    return json(
      {
        command: terminal.command,
        createdAt: terminal.createdAt instanceof Date ? terminal.createdAt.toISOString() : terminal.createdAt,
        cwd: terminal.cwd,
        id: terminal.id,
        pid: terminal.pid,
        sessionId,
        sessionWs: `/ws/session/${terminal.id}`,
        terminalId: terminal.id,
        ws: `/ws/terminal/${terminal.id}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[sessions/connect] Failed to create terminal:', toErrorMessage(error));
    return json({ error: 'Failed to create terminal for session' }, { status: 500 });
  }
};
