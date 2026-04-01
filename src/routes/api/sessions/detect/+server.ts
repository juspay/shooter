import { validateAuth } from '$lib/modules/server/auth';
import { detectRunningAISessions } from '$lib/modules/server/sessions/process-detector';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// GET /api/sessions/detect — Detect running Claude Code / OpenCode processes
export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const processes = detectRunningAISessions();

    return json({
      count: processes.length,
      processes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sessions/detect] Failed to detect running sessions:', toErrorMessage(error));
    return json({ error: 'Failed to detect running sessions' }, { status: 500 });
  }
};
