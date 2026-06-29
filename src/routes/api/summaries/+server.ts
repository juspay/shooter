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
  if (typeof body.completionReason === 'string' && body.completionReason.length > 500) {
    return json({ error: 'completionReason must be 500 characters or fewer' }, { status: 400 });
  }

  const record: SessionSummaryRecord = {
    completionReason: typeof body.completionReason === 'string' ? body.completionReason : null,
    createdAt: body.createdAt,
    id: body.id,
    nextSteps: typeof body.nextSteps === 'string' ? body.nextSteps : '[]',
    projectName: typeof body.projectName === 'string' ? body.projectName : null,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
    status: body.status === 'completed' ? 'completed' : 'active',
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

export const DELETE: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { id?: unknown }).id
      : undefined;
  if (typeof id !== 'string' || id.trim().length === 0) {
    return json({ error: 'id is required and must be a non-empty string' }, { status: 400 });
  }
  if (id.trim().length > 128) {
    // Cap before touching the DB / echoing in the 404 — mirrors the POST id cap.
    return json({ error: 'id must be 128 characters or fewer' }, { status: 400 });
  }

  let removed: number;
  try {
    removed = summaryStore.deleteById(id.trim());
  } catch {
    // A DB throw (busy/locked/corrupt) must surface as a clean JSON 500, mirroring POST's insert.
    return json({ error: 'Failed to delete summary' }, { status: 500 });
  }
  if (removed === 0) {
    // Unknown / already-dismissed id → 404 so the caller can tell "gone" from a real delete.
    return json({ error: 'Summary not found', id: id.trim() }, { status: 404 });
  }
  return json({ removed, success: true });
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
