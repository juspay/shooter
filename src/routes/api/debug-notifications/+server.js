import { json } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns.js';
import { env } from '$env/dynamic/private';

export async function GET() {
  try {
    console.log('=== COMPREHENSIVE NOTIFICATION DEBUG ===');
    
    const apnsService = new APNsService();
    const deviceToken = env.DEVICE_TOKEN?.trim();
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      
      // Environment Check
      environment: {
        nodeEnv: env.NODE_ENV,
        isProduction: env.NODE_ENV === 'production',
        bundleId: env.APNS_BUNDLE_ID,
        keyId: env.APNS_KEY_ID,
        teamId: env.APNS_TEAM_ID
      },
      
      // Device Token Validation
      deviceToken: {
        exists: !!deviceToken,
        length: deviceToken ? deviceToken.length : 0,
        isValidLength: deviceToken ? deviceToken.length === 64 : false,
        isValidFormat: deviceToken ? /^[a-f0-9]{64}$/i.test(deviceToken) : false,
        preview: deviceToken ? `${deviceToken.substring(0, 8)}...${deviceToken.substring(56)}` : null
      },
      
      // APNs Service Status
      apnsService: {
        isConfigured: apnsService.isConfigured(),
        hasProvider: !!apnsService.provider,
        configError: apnsService.configError
      },
      
      // APNs Key Validation
      apnsKey: {
        exists: !!(env.APNS_KEY || env.APNS_KEY_BASE64),
        hasBeginMarker: env.APNS_KEY ? env.APNS_KEY.includes('BEGIN PRIVATE KEY') : false,
        hasEndMarker: env.APNS_KEY ? env.APNS_KEY.includes('END PRIVATE KEY') : false,
        keyLength: env.APNS_KEY ? env.APNS_KEY.length : 0
      },
      
      // Potential Issues
      potentialIssues: []
    };
    
    // Identify potential issues
    if (!diagnostics.deviceToken.isValidLength) {
      diagnostics.potentialIssues.push(`Device token length is ${diagnostics.deviceToken.length}, should be 64`);
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
      recommendation: diagnostics.potentialIssues.length === 0 
        ? 'Configuration looks correct. Issue might be with iOS app or Apple Developer settings.'
        : 'Fix the identified issues first.'
    };
    
    return json(diagnostics);
    
  } catch (error) {
    console.error('Notification diagnostics error:', error);
    return json({
      error: true,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}