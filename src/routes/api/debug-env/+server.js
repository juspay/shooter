import { json } from '@sveltejs/kit';

export async function GET({ request }) {
  // Check for authorization to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = 'Bearer debug-shooter-2024';
  
  if (authHeader !== expectedAuth) {
    return json({ error: 'Unauthorized debug access' }, { status: 401 });
  }

  // Debug environment variable information
  const envDebug = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'undefined',
    
    // Check each environment variable exists and basic info
    variables: {
      API_KEY: {
        exists: !!process.env.API_KEY,
        length: process.env.API_KEY ? process.env.API_KEY.length : 0,
        preview: process.env.API_KEY ? process.env.API_KEY.substring(0, 8) + '...' : null,
        hasNewlines: process.env.API_KEY ? process.env.API_KEY.includes('\n') : false,
        startsWithSpace: process.env.API_KEY ? process.env.API_KEY.startsWith(' ') : false,
        endsWithSpace: process.env.API_KEY ? process.env.API_KEY.endsWith(' ') : false
      },
      
      APNS_KEY_ID: {
        exists: !!process.env.APNS_KEY_ID,
        length: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.length : 0,
        preview: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.substring(0, 4) + '...' : null,
        hasNewlines: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.includes('\n') : false,
        startsWithSpace: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.startsWith(' ') : false,
        endsWithSpace: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.endsWith(' ') : false
      },
      
      APNS_TEAM_ID: {
        exists: !!process.env.APNS_TEAM_ID,
        length: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.length : 0,
        preview: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.substring(0, 4) + '...' : null,
        hasNewlines: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.includes('\n') : false,
        startsWithSpace: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.startsWith(' ') : false,
        endsWithSpace: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.endsWith(' ') : false
      },
      
      APNS_BUNDLE_ID: {
        exists: !!process.env.APNS_BUNDLE_ID,
        length: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.length : 0,
        preview: process.env.APNS_BUNDLE_ID || null,
        hasNewlines: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.includes('\n') : false,
        startsWithSpace: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.startsWith(' ') : false,
        endsWithSpace: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.endsWith(' ') : false
      },
      
      APNS_KEY_BASE64: {
        exists: !!process.env.APNS_KEY_BASE64,
        length: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.length : 0,
        preview: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.substring(0, 20) + '...' : null,
        hasNewlines: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.includes('\n') : false,
        startsWithSpace: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.startsWith(' ') : false,
        endsWithSpace: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.endsWith(' ') : false
      },
      
      APNS_KEY: {
        exists: !!process.env.APNS_KEY,
        length: process.env.APNS_KEY ? process.env.APNS_KEY.length : 0,
        preview: process.env.APNS_KEY ? process.env.APNS_KEY.substring(0, 30) + '...' : null,
        hasNewlines: process.env.APNS_KEY ? process.env.APNS_KEY.includes('\n') : false,
        hasBeginMarker: process.env.APNS_KEY ? process.env.APNS_KEY.includes('BEGIN PRIVATE KEY') : false,
        hasEndMarker: process.env.APNS_KEY ? process.env.APNS_KEY.includes('END PRIVATE KEY') : false
      },
      
      DEVICE_TOKEN: {
        exists: !!process.env.DEVICE_TOKEN,
        length: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.length : 0,
        preview: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.substring(0, 8) + '...' : null,
        hasNewlines: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.includes('\n') : false,
        startsWithSpace: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.startsWith(' ') : false,
        endsWithSpace: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.endsWith(' ') : false
      }
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
}