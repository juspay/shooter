import { env } from '$env/dynamic/private';
import { APNsService } from '$lib/modules/server/apn/apns';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface DebugResponse {
  configError: null | string;
  isConfigured: boolean;
  provider: boolean;
  timestamp: string;
}

interface ErrorResponse {
  error: boolean;
  message: string;
  stack?: string;
  timestamp: string;
}

export const GET: RequestHandler = ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = authHeader.substring(7);
  const expectedKey = (env.API_KEY || '').trim();
  if (!expectedKey || apiKey !== expectedKey) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('=== DEBUG APNS ENDPOINT ===');

    // Initialize APNs service
    const apnsService = new APNsService();

    const debug: DebugResponse = {
      configError: apnsService.configError || null,
      isConfigured: apnsService.isConfigured(),
      provider: !!apnsService.provider,
      timestamp: new Date().toISOString(),
    };

    console.log('APNs Debug Results:', debug);

    return json(debug);
  } catch (error) {
    const err = error as Error;
    console.error('APNs debug error:', err);
    const errorResponse: ErrorResponse = {
      error: true,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    };
    return json(errorResponse, { status: 500 });
  }
};
