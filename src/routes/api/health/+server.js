import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV || 'development',
    version: '1.0.7-dedup',
    checks: {
      hasDeviceToken: !!env.DEVICE_TOKEN,
      hasAPNsConfig: !!(env.APNS_KEY_ID && env.APNS_TEAM_ID && (env.APNS_KEY || env.APNS_KEY_BASE64)),
      hasBundleId: !!env.APNS_BUNDLE_ID,
      hasApiKey: !!env.API_KEY
    },
    configuration: {
      deviceTokenLength: env.DEVICE_TOKEN ? env.DEVICE_TOKEN.length : 0,
      apnsKeyId: env.APNS_KEY_ID ? env.APNS_KEY_ID.substring(0, 4) + '...' : null,
      bundleId: env.APNS_BUNDLE_ID || null,
      production: env.NODE_ENV === 'production'
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
}