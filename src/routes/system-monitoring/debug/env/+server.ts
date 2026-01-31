import { json, type RequestHandler } from '@sveltejs/kit';
import type { DebugEnvResponse, DebugEnvVariable } from '$types/api';

function analyzeEnvVar(
  value: string | undefined,
  includeMarkers: boolean = false
): DebugEnvVariable {
  const result: DebugEnvVariable = {
    exists: !!value,
    length: value ? value.length : 0,
    preview: value ? value.substring(0, includeMarkers ? 30 : 8) + '...' : null,
    hasNewlines: value ? value.includes('\n') : false,
    startsWithSpace: value ? value.startsWith(' ') : false,
    endsWithSpace: value ? value.endsWith(' ') : false
  };

  if (includeMarkers && value) {
    result.hasBeginMarker = value.includes('BEGIN PRIVATE KEY');
    result.hasEndMarker = value.includes('END PRIVATE KEY');
  }

  return result;
}

export const GET: RequestHandler = async ({ request }) => {
  // Check for authorization to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = 'Bearer debug-shooter-2024';

  if (authHeader !== expectedAuth) {
    return json({ error: 'Unauthorized debug access' }, { status: 401 });
  }

  // Debug environment variable information
  const envDebug: DebugEnvResponse = {
    success: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'undefined',

    // Check each environment variable exists and basic info
    variables: {
      API_KEY: analyzeEnvVar(process.env.API_KEY),
      APNS_KEY_ID: analyzeEnvVar(process.env.APNS_KEY_ID),
      APNS_TEAM_ID: analyzeEnvVar(process.env.APNS_TEAM_ID),
      APNS_BUNDLE_ID: {
        ...analyzeEnvVar(process.env.APNS_BUNDLE_ID),
        preview: process.env.APNS_BUNDLE_ID || null // Show full bundle ID as it's not sensitive
      },
      APNS_KEY_BASE64: analyzeEnvVar(process.env.APNS_KEY_BASE64, false),
      APNS_KEY: analyzeEnvVar(process.env.APNS_KEY, true),
      DEVICE_TOKEN: analyzeEnvVar(process.env.DEVICE_TOKEN)
    },

    // Overall checks
    summary: {
      totalEnvVarsSet: Object.keys(process.env).length,
      requiredVarsSet: [
        !!process.env.API_KEY,
        !!process.env.APNS_KEY_ID,
        !!process.env.APNS_TEAM_ID,
        !!process.env.APNS_BUNDLE_ID,
        !!(process.env.APNS_KEY_BASE64 || process.env.APNS_KEY)
      ].filter(Boolean).length,
      anyNewlineIssues: [
        process.env.API_KEY,
        process.env.APNS_KEY_ID,
        process.env.APNS_TEAM_ID,
        process.env.APNS_BUNDLE_ID,
        process.env.APNS_KEY_BASE64
      ].some(val => val && (val.includes('\n') || val.endsWith(' ') || val.startsWith(' ')))
    }
  };

  return json(envDebug);
};
