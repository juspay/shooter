// Set/read the per-terminal autopilot GOAL that anchors the engine's context every cycle.
//
// POST { terminalId, goal } pins the goal; GET ?terminalId=… reads it back. Like
// /api/autopilot, this reaches the engine via globalThis.__shooter_autopilot rather than
// importing it (importing would start a second event subscriber). Goals live in-memory in the
// engine (no file fallback): if the engine is not running there is nothing to set, so we 503.

import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

function control():
  | undefined
  | {
      getGoal?: (terminalId: string) => string | undefined;
      setGoal?: (terminalId: string, goal: string) => void;
    } {
  return (globalThis as Record<string, unknown>).__shooter_autopilot as
    | undefined
    | {
        getGoal?: (terminalId: string) => string | undefined;
        setGoal?: (terminalId: string, goal: string) => void;
      };
}

export const GET: RequestHandler = ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  const terminalId = url.searchParams.get('terminalId') ?? '';
  if (!terminalId) {
    return json({ error: 'terminalId query param is required' }, { status: 400 });
  }
  const ctrl = control();
  if (!ctrl?.getGoal) {
    return json({ error: 'autopilot engine not running', running: false }, { status: 503 });
  }
  return json({ goal: ctrl.getGoal(terminalId) ?? null, running: true });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  let body: { goal?: unknown; terminalId?: unknown };
  try {
    body = (await request.json()) as { goal?: unknown; terminalId?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.terminalId !== 'string' || body.terminalId.length === 0) {
    return json({ error: 'terminalId must be a non-empty string' }, { status: 400 });
  }
  if (typeof body.goal !== 'string') {
    return json({ error: 'goal must be a string' }, { status: 400 });
  }
  if (body.goal.length > 500) {
    // The goal is prepended to EVERY engine LLM context, so an unbounded string would permanently
    // bloat (and could dominate) the prompt. Cap it like the summaries route caps its fields.
    return json({ error: 'goal must be 500 characters or fewer' }, { status: 400 });
  }

  const ctrl = control();
  if (!ctrl?.setGoal) {
    return json({ error: 'autopilot engine not running', running: false }, { status: 503 });
  }
  ctrl.setGoal(body.terminalId, body.goal);
  return json({ goal: body.goal.trim() || null, running: true, terminalId: body.terminalId });
};
