import { realpathSync, statSync } from 'fs';
import { basename } from 'path';

import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const ALLOWED_COMMANDS = ['zsh', 'bash', 'sh', 'fish', 'claude', 'opencode'];

// GET /api/terminals — List all terminals (active + recently exited)
export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) return authError;

  try {
    const terminals = ptyManager.list().map(t => ({
      id: t.id,
      command: t.command,
      args: t.args,
      cwd: t.cwd,
      pid: t.pid,
      status: t.status,
      exitCode: t.exitCode,
      createdAt: t.createdAt.toISOString(),
      exitedAt: t.exitedAt?.toISOString() ?? null,
      clientCount: t.clients.size,
      lastOutput: t.scrollback.length > 0 ? t.scrollback[t.scrollback.length - 1] : null,
    }));

    return json({
      count: terminals.length,
      terminals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    return json({ details: err.message, error: 'Failed to list terminals' }, { status: 500 });
  }
};

// POST /api/terminals — Create a new terminal session
export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) return authError;

  let body: { command?: string; args?: string[]; cwd?: string; cols?: number; rows?: number };
  try {
    body = (await request.json()) as {
      command?: string;
      args?: string[];
      cwd?: string;
      cols?: number;
      rows?: number;
    };
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
    const { command, args, cwd, cols, rows } = body;

    if (!command) {
      return json({ error: 'command is required' }, { status: 400 });
    }

    // Issue 4: Command allowlist — only allow known safe commands
    const commandBasename = basename(command);
    if (!ALLOWED_COMMANDS.includes(commandBasename)) {
      return json(
        { error: `Command not allowed. Allowed: ${ALLOWED_COMMANDS.join(', ')}` },
        { status: 400 },
      );
    }

    if (!cwd) {
      return json({ error: 'cwd is required' }, { status: 400 });
    }

    // Issue 3: Validate cwd — resolve symlinks and restrict to home directory
    let realCwd: string;
    try {
      realCwd = realpathSync(cwd);
    } catch {
      return json({ error: 'Invalid working directory' }, { status: 400 });
    }
    if (!statSync(realCwd).isDirectory()) {
      return json({ error: 'Invalid working directory' }, { status: 400 });
    }
    const home = process.env.HOME || '';
    if (home && !realCwd.startsWith(home)) {
      return json({ error: 'Working directory must be under home directory' }, { status: 400 });
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

    const terminal = ptyManager.create(
      command,
      args ?? [],
      realCwd,
      cols ?? 80,
      rows ?? 24,
    );

    console.log(
      `[terminals] Created terminal ${terminal.id} (pid=${terminal.pid}, command=${command})`
    );

    return json(
      {
        command: terminal.command,
        createdAt: terminal.createdAt,
        cwd: terminal.cwd,
        id: terminal.id,
        pid: terminal.pid,
        sessionWs: `/ws/session/${terminal.id}`,
        ws: `/ws/terminal/${terminal.id}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const err = error as Error;
    return json({ details: err.message, error: 'Failed to create terminal' }, { status: 500 });
  }
};
