import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';
import { realpathSync, statSync } from 'fs';
import { basename, isAbsolute, relative } from 'path';

import type { RequestHandler } from './$types';

const ALLOWED_COMMANDS = ['zsh', 'bash', 'sh', 'fish', 'claude', 'opencode'];

// GET /api/terminals — List all terminals (active + recently exited)
export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const terminals = ptyManager.list().map((t) => ({
      args: t.args,
      clientCount: t.clients.size,
      command: t.command,
      createdAt: t.createdAt.toISOString(),
      currentCwd: t.currentCwd,
      cwd: t.cwd,
      exitCode: t.exitCode,
      exitedAt: t.exitedAt?.toISOString() ?? null,
      id: t.id,
      isActive: t.isActive,
      pid: t.pid,
      status: t.status,
    }));

    return json({
      count: terminals.length,
      terminals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[terminals] Failed to list terminals:', toErrorMessage(error));
    return json({ error: 'Failed to list terminals' }, { status: 500 });
  }
};

// POST /api/terminals — Create a new terminal session
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: { args?: string[]; cols?: number; command?: string; cwd?: string; rows?: number };
  try {
    body = (await request.json()) as {
      args?: string[];
      cols?: number;
      command?: string;
      cwd?: string;
      rows?: number;
    };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    const { args, cols, command, cwd, rows } = body;

    if (!command) {
      return json({ error: 'command is required' }, { status: 400 });
    }

    // Issue 4: Command allowlist — only allow known safe commands
    const commandBasename = basename(command);
    if (!ALLOWED_COMMANDS.includes(commandBasename)) {
      return json(
        { error: `Command not allowed. Allowed: ${ALLOWED_COMMANDS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!cwd) {
      return json({ error: 'cwd is required' }, { status: 400 });
    }

    // Issue 3: Validate cwd — resolve symlinks and restrict to home directory
    let realCwd: string;
    try {
      realCwd = realpathSync(cwd);
      if (!statSync(realCwd).isDirectory()) {
        return json({ error: 'cwd must be a directory' }, { status: 400 });
      }
    } catch {
      return json({ error: 'cwd must be a directory' }, { status: 400 });
    }
    const home = process.env.HOME || '';
    if (home) {
      const rel = relative(home, realCwd);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return json({ error: 'Working directory must be under home directory' }, { status: 400 });
      }
    }

    if (args !== undefined && !Array.isArray(args)) {
      return json({ error: 'args must be an array of strings' }, { status: 400 });
    }

    // Issue 1: Validate every element in args is a string
    if (args && !args.every((a: unknown) => typeof a === 'string')) {
      return json({ error: 'All args must be strings' }, { status: 400 });
    }

    if (cols !== undefined && (typeof cols !== 'number' || cols < 1)) {
      return json({ error: 'cols must be a positive number' }, { status: 400 });
    }

    if (rows !== undefined && (typeof rows !== 'number' || rows < 1)) {
      return json({ error: 'rows must be a positive number' }, { status: 400 });
    }

    const terminal = await ptyManager.create(command, args ?? [], realCwd, cols ?? 80, rows ?? 24);

    console.log(
      `[terminals] Created terminal ${terminal.id} (pid=${terminal.pid}, command=${command})`
    );

    return json(
      {
        command: terminal.command,
        createdAt: terminal.createdAt instanceof Date ? terminal.createdAt.toISOString() : terminal.createdAt,
        cwd: terminal.cwd,
        id: terminal.id,
        pid: terminal.pid,
        sessionWs: `/ws/session/${terminal.id}`,
        ws: `/ws/terminal/${terminal.id}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[terminals] Failed to create terminal:', toErrorMessage(error));
    return json({ error: 'Failed to create terminal' }, { status: 500 });
  }
};
