import type { SessionSummaryRecord } from '$lib/types';

import { validateAuth } from '$lib/modules/server/auth';
import { summaryStore } from '$lib/modules/server/sessions/summary-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const rawBody: unknown = await request.json();

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;

  // Validate required fields with length caps to prevent unbounded storage growth.
  if (typeof body.id !== 'string' || !body.id) {
    return json({ error: 'id is required and must be a non-empty string' }, { status: 400 });
  }
  if (body.id.length > 128) {
    return json({ error: 'id must be 128 characters or fewer' }, { status: 400 });
  }
  if (typeof body.summary !== 'string' || !body.summary) {
    return json({ error: 'summary is required and must be a non-empty string' }, { status: 400 });
  }
  if (body.summary.length > 1000) {
    return json({ error: 'summary must be 1000 characters or fewer' }, { status: 400 });
  }
  if (typeof body.trigger !== 'string' || !body.trigger) {
    return json({ error: 'trigger is required and must be a non-empty string' }, { status: 400 });
  }
  if (body.trigger.length > 64) {
    return json({ error: 'trigger must be 64 characters or fewer' }, { status: 400 });
  }
  if (typeof body.createdAt !== 'string' || !body.createdAt) {
    return json({ error: 'createdAt is required and must be a non-empty string' }, { status: 400 });
  }
  if (body.createdAt.length > 64 || isNaN(Date.parse(body.createdAt))) {
    return json({ error: 'createdAt must be a valid ISO 8601 date string' }, { status: 400 });
  }
  if (typeof body.nextSteps === 'string' && body.nextSteps.length > 8192) {
    return json({ error: 'nextSteps must be 8192 characters or fewer' }, { status: 400 });
  }

  const record: SessionSummaryRecord = {
    createdAt: body.createdAt,
    id: body.id,
    nextSteps: typeof body.nextSteps === 'string' ? body.nextSteps : '[]',
    projectName: typeof body.projectName === 'string' ? body.projectName : null,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
    summary: body.summary,
    terminalId: typeof body.terminalId === 'string' ? body.terminalId : null,
    trigger: body.trigger,
  };

  try {
    summaryStore.insert(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Avoid surfacing raw SQLite error messages (may leak schema details).
    const isDuplicate = typeof message === 'string' && message.includes('UNIQUE constraint failed');
    if (isDuplicate) {
      return json({ error: 'Record with this id already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to persist summary' }, { status: 500 });
  }

  return json({ id: record.id, success: true }, { status: 201 });
};

export const GET: RequestHandler = ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const sessionId = url.searchParams.get('sessionId') ?? undefined;
  const rawLimit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT));
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const summaries = summaryStore.listRecent(limit, sessionId);

  return json({
    count: summaries.length,
    summaries,
    timestamp: new Date().toISOString(),
  });
};
