import { json, type RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/config';

export const GET: RequestHandler = async () => {
  const { nodeEnv, isProduction, apns, device, api } = config;

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: nodeEnv || 'development',
    version: '1.0.8-typescript',
    checks: {
      hasDeviceToken: !!device.token,
      hasAPNsConfig: !!(apns.keyId && apns.teamId && apns.keyP8),
      hasBundleId: !!apns.bundleId,
      hasApiKey: !!api.key
    },
    configuration: {
      deviceTokenLength: device.token ? device.token.length : 0,
      apnsKeyId: apns.keyId ? apns.keyId.substring(0, 4) + '...' : null,
      bundleId: apns.bundleId || null,
      production: isProduction
    }
  };

  // Determine overall health status
  const criticalChecks = [
    health.checks.hasDeviceToken,
    health.checks.hasAPNsConfig,
    health.checks.hasBundleId
  ];

  if (criticalChecks.some(check => !check)) {
    health.status = 'degraded';
  }

  return json(health);
};
