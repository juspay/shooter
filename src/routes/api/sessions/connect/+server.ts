import { validateAuth } from '$lib/modules/server/auth';
import { decideResumeStrategy, PROVIDER_COMMANDS } from '$lib/modules/server/sessions/registry';
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

  let body: {
    allowFresh?: boolean;
    command?: string;
    cwd?: string;
    noCreate?: boolean;
    sessionId?: string;
  };
  try {
    body = (await request.json()) as {
      allowFresh?: boolean;
      command?: string;
      cwd?: string;
      noCreate?: boolean;
      sessionId?: string;
    };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { allowFresh, command, cwd, noCreate, sessionId } = body;

  // --- Validate required fields ---

  if (!sessionId || typeof sessionId !== 'string') {
    return json({ error: 'sessionId is required (string)' }, { status: 400 });
  }

  // sessionId becomes a process argument (e.g. `codex resume <id>`); restrict it
  // to safe identifier chars — dots included, since cursor/copilot/amp IDs use
  // them — but no path separators, which prevents argument/path injection.
  if (!/^[A-Za-z0-9_.-]+$/.test(sessionId)) {
    return json({ error: 'Invalid sessionId format' }, { status: 400 });
  }

  if (!cwd || typeof cwd !== 'string') {
    return json({ error: 'cwd is required (string)' }, { status: 400 });
  }

  if (!command || !PROVIDER_COMMANDS.includes(command)) {
    return json(
      { error: `command must be one of: ${PROVIDER_COMMANDS.join(', ')}` },
      { status: 400 }
    );
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

  const existing = ptyManager.list().find(
    (t) =>
      t.status === 'running' &&
      // Claude / Cursor / Qwen: <id>.jsonl ; Codex rollout: rollout-<ts>-<id>.jsonl ;
      // Copilot: <id>.jsonl OR <id>/events.jsonl ; Amp: T-<id>.json ; OpenCode: session id
      (t.sessionFile?.endsWith(`/${sessionId}.jsonl`) ||
        t.sessionFile?.endsWith(`-${sessionId}.jsonl`) ||
        t.sessionFile?.endsWith(`/${sessionId}/events.jsonl`) ||
        t.sessionFile?.endsWith(`/T-${sessionId}.json`) ||
        t.openCodeSessionId === sessionId)
  );

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

  // --- Decide whether connecting can actually return to this conversation ---
  //
  // Providers without a resume flag (gemini, qwen, cursor-agent, copilot, amp)
  // would otherwise launch with no args, silently starting a NEW session and
  // orphaning the transcript the caller asked to reconnect to. Refuse unless the
  // caller explicitly accepts a fresh session.

  const strategy = decideResumeStrategy(command, sessionId, allowFresh === true);

  if (strategy.kind === 'refuse') {
    return json({ canResume: false, command, error: strategy.reason, sessionId }, { status: 409 });
  }

  const args: string[] = strategy.kind === 'resume' ? strategy.args : [];

  try {
    const terminal = await ptyManager.create(command, args, realCwd, 120, 40);

    console.log(
      `[sessions/connect] Created terminal ${terminal.id} for ${command} session ${sessionId} ` +
        `(pid=${terminal.pid}, ${strategy.kind === 'resume' ? 'resumed' : 'fresh session'})`
    );

    return json(
      {
        command: terminal.command,
        createdAt:
          terminal.createdAt instanceof Date
            ? terminal.createdAt.toISOString()
            : terminal.createdAt,
        cwd: terminal.cwd,
        id: terminal.id,
        pid: terminal.pid,
        resumed: strategy.kind === 'resume',
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
