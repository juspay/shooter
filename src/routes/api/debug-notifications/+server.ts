import { env } from '$env/dynamic/private';
import { APNsService } from '$lib/modules/server/apn/apns';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface APNsKeyInfo {
  exists: boolean;
  hasBeginMarker: boolean;
  hasEndMarker: boolean;
  keyLength: number;
}

interface APNsServiceInfo {
  configError: null | string;
  hasProvider: boolean;
  isConfigured: boolean;
}

interface Assessment {
  issueCount: number;
  readyForNotifications: boolean;
  recommendation: string;
}

interface DeviceTokenInfo {
  exists: boolean;
  isValidFormat: boolean;
  isValidLength: boolean;
  length: number;
  preview: null | string;
}

interface Diagnostics {
  apnsKey: APNsKeyInfo;
  apnsService: APNsServiceInfo;
  assessment?: Assessment;
  deviceToken: DeviceTokenInfo;
  environment: EnvironmentInfo;
  potentialIssues: string[];
  timestamp: string;
}

interface EnvironmentInfo {
  bundleId: string | undefined;
  isProduction: boolean;
  keyId: string | undefined;
  nodeEnv: string | undefined;
  teamId: string | undefined;
}

interface ErrorResponse {
  error: boolean;
  message: string;
  stack?: string;
  timestamp: string;
}

export const GET: RequestHandler = ({ request }) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = authHeader.substring(7);
  const expectedKey = (env.API_KEY || '').trim();
  if (!expectedKey || apiKey !== expectedKey) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('=== COMPREHENSIVE NOTIFICATION DEBUG ===');

    const apnsService = new APNsService();
    const deviceToken = env.DEVICE_TOKEN?.trim();

    const diagnostics: Diagnostics = {
      // APNs Key Validation
      apnsKey: {
        exists: !!(env.APNS_KEY || env.APNS_KEY_BASE64),
        hasBeginMarker: env.APNS_KEY ? env.APNS_KEY.includes('BEGIN PRIVATE KEY') : false,
        hasEndMarker: env.APNS_KEY ? env.APNS_KEY.includes('END PRIVATE KEY') : false,
        keyLength: env.APNS_KEY ? env.APNS_KEY.length : 0,
      },

      // APNs Service Status
      apnsService: {
        configError: apnsService.configError,
        hasProvider: !!apnsService.provider,
        isConfigured: apnsService.isConfigured(),
      },

      // Device Token Validation
      deviceToken: {
        exists: !!deviceToken,
        isValidFormat: deviceToken ? /^[a-f0-9]{64}$/i.test(deviceToken) : false,
        isValidLength: deviceToken ? deviceToken.length === 64 : false,
        length: deviceToken ? deviceToken.length : 0,
        preview: deviceToken
          ? `${deviceToken.substring(0, 8)}...${deviceToken.substring(56)}`
          : null,
      },

      // Environment Check
      environment: {
        bundleId: env.APNS_BUNDLE_ID,
        isProduction: env.NODE_ENV === 'production',
        keyId: env.APNS_KEY_ID,
        nodeEnv: env.NODE_ENV,
        teamId: env.APNS_TEAM_ID,
      },

      // Potential Issues
      potentialIssues: [],

      timestamp: new Date().toISOString(),
    };

    // Identify potential issues
    if (!diagnostics.deviceToken.isValidLength) {
      diagnostics.potentialIssues.push(
        `Device token length is ${diagnostics.deviceToken.length}, should be 64`
      );
    }

    if (!diagnostics.deviceToken.isValidFormat) {
      diagnostics.potentialIssues.push('Device token format invalid (should be 64 hex characters)');
    }

    if (!diagnostics.apnsService.isConfigured) {
      diagnostics.potentialIssues.push('APNs service not properly configured');
    }

    if (!diagnostics.apnsKey.hasBeginMarker || !diagnostics.apnsKey.hasEndMarker) {
      diagnostics.potentialIssues.push('APNs key missing PEM markers');
    }

    if (diagnostics.environment.isProduction && !diagnostics.environment.bundleId) {
      diagnostics.potentialIssues.push('Missing bundle ID in production');
    }

    // Overall assessment
    diagnostics.assessment = {
      issueCount: diagnostics.potentialIssues.length,
      readyForNotifications: diagnostics.potentialIssues.length === 0,
      recommendation:
        diagnostics.potentialIssues.length === 0
          ? 'Configuration looks correct. Issue might be with iOS app or Apple Developer settings.'
          : 'Fix the identified issues first.',
    };

    return json(diagnostics);
  } catch (error) {
    const err = error as Error;
    console.error('Notification diagnostics error:', err);
    const errorResponse: ErrorResponse = {
      error: true,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    };
    return json(errorResponse, { status: 500 });
  }
};
