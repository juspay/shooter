import { json, type RequestHandler } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns';
import type { DebugAPNsResponse } from '$types/api';

export const GET: RequestHandler = async () => {
  try {
    console.log('=== DEBUG APNS ENDPOINT ===');

    // Initialize APNs service
    const apnsService = new APNsService();
    const configError = apnsService.getConfigError();

    const debug: DebugAPNsResponse = {
      success: true,
      apnsConfig: {
        hasKeyId: !!process.env.APNS_KEY_ID,
        hasTeamId: !!process.env.APNS_TEAM_ID,
        hasPrivateKey: !!(process.env.APNS_KEY_BASE64 || process.env.APNS_KEY),
        hasBundleId: !!process.env.APNS_BUNDLE_ID
      },
      isConfigured: apnsService.isConfigured(),
      ...(configError && { configError }),
      timestamp: new Date().toISOString()
    };

    console.log('APNs Debug Results:', debug);

    return json(debug);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
    const _errorStack = error instanceof Error ? error.stack : '';

    console.error('APNs debug error:', error);
    return json(
      {
        success: false,
        apnsConfig: {
          hasKeyId: false,
          hasTeamId: false,
          hasPrivateKey: false,
          hasBundleId: false
        },
        isConfigured: false,
        configError: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};
