import type { SosRoutingRule } from '$lib/types';

import { validateAuth } from '$lib/modules/server/auth';
import { sosCoordinator } from '$lib/modules/server/sos/coordinator';
import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';

import type { RequestHandler } from './$types';

const ACTIONS = new Set(['block', 'escalate', 'relay']);

/** GET /api/sos/[id]/rules — current routing rules. */
export const GET: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  const rules = sosCoordinator.getRoutingRules(params.id ?? '');
  if (rules === null) {
    return json({ error: 'Super-session not found' }, { status: 404 });
  }
  return json({ routingRules: rules });
};

/** PATCH /api/sos/[id]/rules — replace the routing rules. */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  const payload = body as { routingRules?: unknown };
  if (!Array.isArray(payload.routingRules)) {
    return json({ error: 'routingRules must be an array' }, { status: 400 });
  }

  const rules: SosRoutingRule[] = [];
  for (const raw of payload.routingRules) {
    const rule = normalizeRule(raw);
    if (!rule) {
      return json(
        { error: 'Each rule needs fromMemberId, toMemberId, and action' },
        { status: 400 }
      );
    }
    rules.push(rule);
  }

  const error = sosCoordinator.setRoutingRules(params.id ?? '', rules);
  if (error) {
    return json({ error }, { status: error.includes('not found') ? 404 : 400 });
  }
  return json({ routingRules: rules });
};

function normalizeRule(raw: unknown): null | SosRoutingRule {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    typeof r.fromMemberId !== 'string' ||
    typeof r.toMemberId !== 'string' ||
    typeof r.action !== 'string' ||
    !ACTIONS.has(r.action)
  ) {
    return null;
  }
  return {
    action: r.action as SosRoutingRule['action'],
    fromMemberId: r.fromMemberId,
    id: typeof r.id === 'string' && r.id ? r.id : randomBytes(6).toString('hex'),
    matchPattern: typeof r.matchPattern === 'string' ? r.matchPattern : '',
    priority: typeof r.priority === 'number' ? r.priority : 100,
    toMemberId: r.toMemberId,
  };
}
