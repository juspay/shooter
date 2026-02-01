import { APNsService } from '$lib/server/apns.js';
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

export const GET: RequestHandler = () => {
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
