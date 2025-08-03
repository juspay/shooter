import { json } from '@sveltejs/kit';

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    checks: {
      hasDeviceToken: !!process.env.DEVICE_TOKEN,
      hasAPNsConfig: !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY),
      hasBundleId: !!process.env.APNS_BUNDLE_ID,
      hasApiKey: !!process.env.API_KEY
    },
    configuration: {
      deviceTokenLength: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.length : 0,
      apnsKeyId: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.substring(0, 4) + '...' : null,
      bundleId: process.env.APNS_BUNDLE_ID || null,
      production: process.env.NODE_ENV === 'production'
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