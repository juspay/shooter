import type {
  FCMConfiguration,
  HealthChecks,
  HealthConfiguration,
  HealthStatus,
} from '$generated/types';

import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { RequestHandler } from './$types';

const PKG_VERSION: string = (() => {
  const root = process.env.SHOOTER_PKG_ROOT || process.cwd();
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

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

  // Collect warnings for optional features that are not configured.
  // These are informational — the server is still fully functional for
  // terminals and sessions without push notification support.
  const warnings: string[] = [];

  if (!checks.hasAPNsConfig || !checks.hasBundleId) {
    warnings.push('APNs not configured — iOS push notifications disabled');
  }
  if (!checks.hasDeviceToken) {
    warnings.push('No device token set — push notifications have no target');
  }
  if (!checks.hasFCMConfig) {
    warnings.push('FCM not configured — Android push notifications disabled');
  }

  const health: {
    checks: HealthChecks;
    configuration: HealthConfiguration;
    environment: string;
    status: HealthStatus;
    timestamp: string;
    version: string;
    warnings: string[];
  } = {
    checks,
    configuration,
    environment: env.NODE_ENV || 'development',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: PKG_VERSION,
    warnings,
  };

  // Only mark as degraded for actual system-level problems
  // (e.g., DB unreachable, critical services down).
  // Missing push-notification config is NOT a degraded state — it just
  // means notifications are disabled, which is fine for terminal/session use.

  // Public response: status + warnings. Authenticated: full details.
  if (!wantsDetails) {
    return json({ status: health.status, timestamp: health.timestamp, version: health.version, warnings: health.warnings });
  }

  return json(health);
};
