import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface FCMConfiguration {
  configured: boolean;
  hasClientEmail: boolean;
  hasPrivateKey: boolean;
  hasProjectId: boolean;
}

interface HealthChecks {
  hasApiKey: boolean;
  hasAPNsConfig: boolean;
  hasBundleId: boolean;
  hasDeviceToken: boolean;
  hasFCMConfig: boolean;
}

interface HealthConfiguration {
  apnsKeyId: null | string;
  bundleId: null | string;
  deviceTokenLength: number;
  fcm: FCMConfiguration;
  production: boolean;
}

interface HealthResponse {
  checks: HealthChecks;
  configuration: HealthConfiguration;
  environment: string;
  status: 'degraded' | 'healthy';
  timestamp: string;
  version: string;
}

export const GET: RequestHandler = ({ request, url }) => {
  // Basic status check is public (used by layout status badge).
  // Detailed config requires auth (L12 security fix).
  const wantsDetails = url.searchParams.get('details') === 'true';
  if (wantsDetails) {
    const authError = validateAuth(request);
    if (authError) {return authError;}
  }

  const hasProjectId = !!env.FCM_PROJECT_ID;
  const hasClientEmail = !!env.FCM_CLIENT_EMAIL;
  const hasPrivateKey = !!env.FCM_PRIVATE_KEY;

  const health: HealthResponse = {
    checks: {
      hasApiKey: !!env.API_KEY,
      hasAPNsConfig: !!(
        env.APNS_KEY_ID &&
        env.APNS_TEAM_ID &&
        env.APNS_KEY
      ),
      hasBundleId: !!env.APNS_BUNDLE_ID,
      hasDeviceToken: !!env.DEVICE_TOKEN,
      hasFCMConfig: hasProjectId && hasClientEmail && hasPrivateKey,
    },
    configuration: {
      apnsKeyId: env.APNS_KEY_ID ? `${env.APNS_KEY_ID.substring(0, 4)}...` : null,
      bundleId: env.APNS_BUNDLE_ID || null,
      deviceTokenLength: env.DEVICE_TOKEN ? env.DEVICE_TOKEN.length : 0,
      fcm: {
        configured: hasProjectId && hasClientEmail && hasPrivateKey,
        hasClientEmail,
        hasPrivateKey,
        hasProjectId,
      },
      production: env.APNS_PRODUCTION === 'true',
    },
    environment: env.NODE_ENV || 'development',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
  };

  // Determine overall health status
  // FCM is not a critical check - only APNs is required for core functionality
  const criticalChecks = [
    health.checks.hasDeviceToken,
    health.checks.hasAPNsConfig,
    health.checks.hasBundleId,
  ];

  if (criticalChecks.some((check) => !check)) {
    health.status = 'degraded';
  }

  // Public response: status only. Authenticated: full details.
  if (!wantsDetails) {
    return json({ status: health.status, timestamp: health.timestamp });
  }

  return json(health);
};
