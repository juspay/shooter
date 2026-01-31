import { json, type RequestHandler } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns';
import { config } from '$lib/config';

export const GET: RequestHandler = async () => {
  try {
    console.log('=== COMPREHENSIVE NOTIFICATION DEBUG ===');

    const apnsService = new APNsService();
    const { nodeEnv, isProduction, apns, device } = config;
    const deviceToken = device.token?.trim();

    const diagnostics = {
      timestamp: new Date().toISOString(),

      // Environment Check
      environment: {
        nodeEnv: nodeEnv,
        isProduction: isProduction,
        bundleId: apns.bundleId,
        keyId: apns.keyId,
        teamId: apns.teamId
      },

      // Device Token Validation
      deviceToken: {
        exists: !!deviceToken,
        length: deviceToken ? deviceToken.length : 0,
        isValidLength: deviceToken ? deviceToken.length === 64 : false,
        isValidFormat: deviceToken ? /^[a-f0-9]{64}$/i.test(deviceToken) : false,
        preview: deviceToken
          ? `${deviceToken.substring(0, 8)}...${deviceToken.substring(56)}`
          : null
      },

      // APNs Service Status
      apnsService: {
        isConfigured: apnsService.isConfigured(),
        hasProvider: !!apnsService.getProvider(),
        configError: apnsService.getConfigError()
      },

      // APNs Key Validation
      apnsKey: {
        exists: !!apns.keyP8,
        hasBeginMarker: apns.keyP8 ? apns.keyP8.includes('BEGIN PRIVATE KEY') : false,
        hasEndMarker: apns.keyP8 ? apns.keyP8.includes('END PRIVATE KEY') : false,
        keyLength: apns.keyP8 ? apns.keyP8.length : 0
      },

      // Potential Issues
      potentialIssues: [] as string[],

      // Will be set below
      assessment: {
        readyForNotifications: false,
        issueCount: 0,
        recommendation: ''
      }
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
      readyForNotifications: diagnostics.potentialIssues.length === 0,
      issueCount: diagnostics.potentialIssues.length,
      recommendation:
        diagnostics.potentialIssues.length === 0
          ? 'Configuration looks correct. Issue might be with iOS app or Apple Developer settings.'
          : 'Fix the identified issues first.'
    };

    return json(diagnostics);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';

    console.error('Notification diagnostics error:', error);
    return json(
      {
        error: true,
        message: errorMessage,
        stack: errorStack,
        timestamp: new Date().toISOString(),
        environment: {
          isProduction: false
        },
        deviceToken: {
          exists: false,
          length: 0,
          isValidLength: false,
          isValidFormat: false,
          preview: null
        },
        apnsService: {
          isConfigured: false,
          hasProvider: false,
          configError: errorMessage
        },
        apnsKey: {
          exists: false,
          hasBeginMarker: false,
          hasEndMarker: false,
          keyLength: 0
        },
        potentialIssues: [errorMessage],
        assessment: {
          readyForNotifications: false,
          issueCount: 1,
          recommendation: 'Fix the error first.'
        }
      },
      { status: 500 }
    );
  }
};
