import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface HealthChecks {
  hasApiKey: boolean;
  hasAPNsConfig: boolean;
  hasBundleId: boolean;
  hasDeviceToken: boolean;
}

interface HealthConfiguration {
  apnsKeyId: null | string;
  bundleId: null | string;
  deviceTokenLength: number;
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

export const GET: RequestHandler = () => {
  const health: HealthResponse = {
    checks: {
      hasApiKey: !!env.API_KEY,
      hasAPNsConfig: !!(
        env.APNS_KEY_ID &&
        env.APNS_TEAM_ID &&
        (env.APNS_KEY || env.APNS_KEY_BASE64)
      ),
      hasBundleId: !!env.APNS_BUNDLE_ID,
      hasDeviceToken: !!env.DEVICE_TOKEN,
    },
    configuration: {
      apnsKeyId: env.APNS_KEY_ID ? `${env.APNS_KEY_ID.substring(0, 4)  }...` : null,
      bundleId: env.APNS_BUNDLE_ID || null,
      deviceTokenLength: env.DEVICE_TOKEN ? env.DEVICE_TOKEN.length : 0,
      production: env.NODE_ENV === 'production',
    },
    environment: env.NODE_ENV || 'development',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.7-dedup',
  };

  // Determine overall health status
  const criticalChecks = [
    health.checks.hasDeviceToken,
    health.checks.hasAPNsConfig,
    health.checks.hasBundleId,
  ];

  if (criticalChecks.some((check) => !check)) {
    health.status = 'degraded';
  }

  return json(health);
};
