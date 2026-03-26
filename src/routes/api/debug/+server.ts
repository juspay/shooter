import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const apnsClient = new LibraryAPNsService();
  const deviceToken = env.DEVICE_TOKEN?.trim();

  return json({
    apns: {
      configured: apnsClient.isConfigured(),
      environment: env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox',
      hasBundleId: !!env.APNS_BUNDLE_ID,
      hasKey: !!env.APNS_KEY,
      hasKeyId: !!env.APNS_KEY_ID,
      hasTeamId: !!env.APNS_TEAM_ID,
    },
    deviceToken: {
      exists: !!deviceToken,
      length: deviceToken ? deviceToken.length : 0,
      valid: deviceToken ? /^[a-f0-9]{64}$/i.test(deviceToken) : false,
    },
    environment: env.NODE_ENV || 'development',
    hasApiKey: !!env.API_KEY,
    timestamp: new Date().toISOString(),
  });
};
