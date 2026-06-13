// Control endpoint for the always-on server-side autopilot engine.
// GET returns the enabled flag; POST { enabled } toggles it.
//
// The engine runs in the server.ts module graph and exposes its control on
// globalThis.__shooter_autopilot. This route (bundled handler graph) reaches it
// there rather than importing the engine — importing it would start a second
// event subscriber. Falls back to the on-disk state file if the engine has not
// started yet.

import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RequestHandler } from './$types';

const STATE_FILE = join(homedir(), '.shooter', 'autopilot.json');

function control(): undefined | { isEnabled: () => boolean; setEnabled: (v: boolean) => void } {
  return (globalThis as Record<string, unknown>).__shooter_autopilot as
    | undefined
    | { isEnabled: () => boolean; setEnabled: (v: boolean) => void };
}

function readFileEnabled(): boolean {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed: unknown = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      return Boolean((parsed as { enabled?: unknown })?.enabled);
    }
  } catch {
    // corrupt / unreadable
  }
  return false;
}

export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  const ctrl = control();
  return json({ enabled: ctrl ? ctrl.isEnabled() : readFileEnabled(), running: Boolean(ctrl) });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as { enabled?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const ctrl = control();
  if (ctrl) {
    ctrl.setEnabled(body.enabled);
  } else {
    try {
      mkdirSync(join(homedir(), '.shooter'), { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify({ enabled: body.enabled }), 'utf-8');
    } catch {
      // best-effort
    }
  }
  return json({ enabled: body.enabled, running: Boolean(ctrl) });
};
