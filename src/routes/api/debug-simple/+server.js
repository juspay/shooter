import { json } from '@sveltejs/kit';

export async function GET() {
  return json({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV, // Should be 'production'
    hasApiKey: !!process.env.API_KEY,
    hasApnsKeyId: !!process.env.APNS_KEY_ID,
    hasApnsTeamId: !!process.env.APNS_TEAM_ID,
    hasApnsBundleId: !!process.env.APNS_BUNDLE_ID,
    hasApnsKeyBase64: !!process.env.APNS_KEY_BASE64,
    hasDeviceToken: !!process.env.DEVICE_TOKEN,
    
    // Length checks (without exposing values)
    apiKeyLength: process.env.API_KEY ? process.env.API_KEY.length : 0,
    apnsKeyIdLength: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.length : 0,
    apnsKeyBase64Length: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.length : 0,
    
    // Preview first few characters (safe)
    apiKeyPreview: process.env.API_KEY ? process.env.API_KEY.substring(0, 6) + '...' : null,
    apnsKeyIdPreview: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.substring(0, 4) + '...' : null,
    
    // Check for common formatting issues
    apiKeyHasSpaces: process.env.API_KEY ? (process.env.API_KEY.startsWith(' ') || process.env.API_KEY.endsWith(' ')) : false,
    apnsKeyBase64HasNewlines: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.includes('\n') : false,
    
    totalEnvVars: Object.keys(process.env).length,
    timestamp: new Date().toISOString()
  });
}