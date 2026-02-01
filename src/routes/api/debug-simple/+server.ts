import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface DebugResponse {
  apiKeyHasSpaces: boolean;
  apiKeyLength: number;
  apiKeyPreview: null | string;
  apnsKeyBase64HasNewlines: boolean;
  apnsKeyBase64Length: number;
  apnsKeyIdLength: number;
  apnsKeyIdPreview: null | string;
  hasApiKey: boolean;
  hasApnsBundleId: boolean;
  hasApnsKeyBase64: boolean;
  hasApnsKeyId: boolean;
  hasApnsTeamId: boolean;
  hasDeviceToken: boolean;
  nodeEnv: string | undefined;
  timestamp: string;
  totalEnvVars: number;
  vercelEnv: string | undefined;
}

export const GET: RequestHandler = () => {
  const response: DebugResponse = {
    // Check for common formatting issues
    apiKeyHasSpaces: env.API_KEY ? env.API_KEY.startsWith(' ') || env.API_KEY.endsWith(' ') : false,
    // Length checks (without exposing values)
    apiKeyLength: env.API_KEY ? env.API_KEY.length : 0,
    // Preview first few characters (safe)
    apiKeyPreview: env.API_KEY ? `${env.API_KEY.substring(0, 6)  }...` : null,
    apnsKeyBase64HasNewlines: env.APNS_KEY_BASE64 ? env.APNS_KEY_BASE64.includes('\n') : false,
    apnsKeyBase64Length: env.APNS_KEY_BASE64 ? env.APNS_KEY_BASE64.length : 0,
    apnsKeyIdLength: env.APNS_KEY_ID ? env.APNS_KEY_ID.length : 0,
    apnsKeyIdPreview: env.APNS_KEY_ID ? `${env.APNS_KEY_ID.substring(0, 4)  }...` : null,
    hasApiKey: !!env.API_KEY,

    hasApnsBundleId: !!env.APNS_BUNDLE_ID,
    hasApnsKeyBase64: !!env.APNS_KEY_BASE64,
    hasApnsKeyId: !!env.APNS_KEY_ID,

    hasApnsTeamId: !!env.APNS_TEAM_ID,
    hasDeviceToken: !!env.DEVICE_TOKEN,

    nodeEnv: env.NODE_ENV,
    timestamp: new Date().toISOString(),

    totalEnvVars: Object.keys(process.env).length,
    vercelEnv: env.VERCEL_ENV,
  };

  return json(response);
};
