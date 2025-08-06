import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET() {
  return json({
    nodeEnv: env.NODE_ENV,
    vercelEnv: env.VERCEL_ENV, // Should be 'production'
    hasApiKey: !!env.API_KEY,
    hasApnsKeyId: !!env.APNS_KEY_ID,
    hasApnsTeamId: !!env.APNS_TEAM_ID,
    hasApnsBundleId: !!env.APNS_BUNDLE_ID,
    hasApnsKeyBase64: !!env.APNS_KEY_BASE64,
    hasDeviceToken: !!env.DEVICE_TOKEN,
    
    // Length checks (without exposing values)
    apiKeyLength: env.API_KEY ? env.API_KEY.length : 0,
    apnsKeyIdLength: env.APNS_KEY_ID ? env.APNS_KEY_ID.length : 0,
    apnsKeyBase64Length: env.APNS_KEY_BASE64 ? env.APNS_KEY_BASE64.length : 0,
    
    // Preview first few characters (safe)
    apiKeyPreview: env.API_KEY ? env.API_KEY.substring(0, 6) + '...' : null,
    apnsKeyIdPreview: env.APNS_KEY_ID ? env.APNS_KEY_ID.substring(0, 4) + '...' : null,
    
    // Check for common formatting issues
    apiKeyHasSpaces: env.API_KEY ? (env.API_KEY.startsWith(' ') || env.API_KEY.endsWith(' ')) : false,
    apnsKeyBase64HasNewlines: env.APNS_KEY_BASE64 ? env.APNS_KEY_BASE64.includes('\n') : false,
    
    totalEnvVars: Object.keys(process.env).length, // This one can stay as process.env for debugging
    timestamp: new Date().toISOString()
  });
}