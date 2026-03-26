import type {
  FCMConfiguration,
  HealthChecks,
  HealthConfiguration,
  HealthStatus,
} from '$generated/types';

import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, url }) => {
  // Basic status check is public (used by layout status badge).
  // Detailed config requires auth (L12 security fix).
  const wantsDetails = url.searchParams.get('details') === 'true';
  if (wantsDetails) {
    const authError = validateAuth(request);
    if (authError) {
      return authError;
    }
  }

  const hasProjectId = !!env.FCM_PROJECT_ID?.trim();
  const hasClientEmail = !!env.FCM_CLIENT_EMAIL?.trim();
  const hasPrivateKey = !!env.FCM_PRIVATE_KEY?.trim();

  const checks: HealthChecks = {
    hasApiKey: !!env.API_KEY?.trim(),
    hasAPNsConfig: !!(env.APNS_KEY_ID?.trim() && env.APNS_TEAM_ID?.trim() && env.APNS_KEY?.trim()),
    hasBundleId: !!env.APNS_BUNDLE_ID?.trim(),
    hasDeviceToken: !!env.DEVICE_TOKEN?.trim(),
    hasFCMConfig: hasProjectId && hasClientEmail && hasPrivateKey,
  };

  const fcm: FCMConfiguration = {
    configured: hasProjectId && hasClientEmail && hasPrivateKey,
    hasClientEmail,
    hasPrivateKey,
    hasProjectId,
  };

  const configuration: HealthConfiguration = {
    apnsKeyId: env.APNS_KEY_ID ? `${env.APNS_KEY_ID.substring(0, 4)}...` : '',
    bundleId: env.APNS_BUNDLE_ID || '',
    deviceTokenLength: env.DEVICE_TOKEN ? env.DEVICE_TOKEN.length : 0,
    fcm,
    production: env.APNS_PRODUCTION === 'true',
  };

  const health: {
    checks: HealthChecks;
    configuration: HealthConfiguration;
    environment: string;
    status: HealthStatus;
    timestamp: string;
    version: string;
  } = {
    checks,
    configuration,
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
