import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface EnvDebug {
  environment: string;
  summary: {
    anyNewlineIssues: boolean;
    requiredVarsSet: number;
    totalEnvVarsSet: number;
  };
  timestamp: string;
  variables: {
    API_KEY: VariableInfo;
    APNS_BUNDLE_ID: VariableInfo;
    APNS_KEY: VariableInfo & { hasBeginMarker: boolean; hasEndMarker: boolean };
    APNS_KEY_BASE64: VariableInfo;
    APNS_KEY_ID: VariableInfo;
    APNS_TEAM_ID: VariableInfo;
    DEVICE_TOKEN: VariableInfo;
  };
}

interface VariableInfo {
  endsWithSpace: boolean;
  exists: boolean;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  hasNewlines: boolean;
  length: number;
  preview: null | string;
  startsWithSpace: boolean;
}

export const GET: RequestHandler = ({ request }) => {
  // Check for authorization to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = 'Bearer debug-shooter-2024';

  if (authHeader !== expectedAuth) {
    return json({ error: 'Unauthorized debug access' }, { status: 401 });
  }

  // Debug environment variable information
  const envDebug: EnvDebug = {
    environment: process.env.NODE_ENV || 'undefined',
    // Overall checks
    summary: {
      anyNewlineIssues: [
        process.env.API_KEY,
        process.env.APNS_KEY_ID,
        process.env.APNS_TEAM_ID,
        process.env.APNS_BUNDLE_ID,
        process.env.APNS_KEY_BASE64,
      ].some((val) => val && (val.includes('\n') || val.endsWith(' ') || val.startsWith(' '))),
      requiredVarsSet: [
        !!process.env.API_KEY,
        !!process.env.APNS_KEY_ID,
        !!process.env.APNS_TEAM_ID,
        !!process.env.APNS_BUNDLE_ID,
        !!(process.env.APNS_KEY_BASE64 || process.env.APNS_KEY),
      ].filter(Boolean).length,
      totalEnvVarsSet: Object.keys(process.env).length,
    },

    timestamp: new Date().toISOString(),

    // Check each environment variable exists and basic info
    variables: {
      API_KEY: {
        endsWithSpace: process.env.API_KEY ? process.env.API_KEY.endsWith(' ') : false,
        exists: !!process.env.API_KEY,
        hasNewlines: process.env.API_KEY ? process.env.API_KEY.includes('\n') : false,
        length: process.env.API_KEY ? process.env.API_KEY.length : 0,
        preview: process.env.API_KEY ? `${process.env.API_KEY.substring(0, 8)  }...` : null,
        startsWithSpace: process.env.API_KEY ? process.env.API_KEY.startsWith(' ') : false,
      },

      APNS_BUNDLE_ID: {
        endsWithSpace: process.env.APNS_BUNDLE_ID
          ? process.env.APNS_BUNDLE_ID.endsWith(' ')
          : false,
        exists: !!process.env.APNS_BUNDLE_ID,
        hasNewlines: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.includes('\n') : false,
        length: process.env.APNS_BUNDLE_ID ? process.env.APNS_BUNDLE_ID.length : 0,
        preview: process.env.APNS_BUNDLE_ID || null,
        startsWithSpace: process.env.APNS_BUNDLE_ID
          ? process.env.APNS_BUNDLE_ID.startsWith(' ')
          : false,
      },

      APNS_KEY: {
        endsWithSpace: process.env.APNS_KEY ? process.env.APNS_KEY.endsWith(' ') : false,
        exists: !!process.env.APNS_KEY,
        hasBeginMarker: process.env.APNS_KEY
          ? process.env.APNS_KEY.includes('BEGIN PRIVATE KEY')
          : false,
        hasEndMarker: process.env.APNS_KEY
          ? process.env.APNS_KEY.includes('END PRIVATE KEY')
          : false,
        hasNewlines: process.env.APNS_KEY ? process.env.APNS_KEY.includes('\n') : false,
        length: process.env.APNS_KEY ? process.env.APNS_KEY.length : 0,
        preview: process.env.APNS_KEY ? `${process.env.APNS_KEY.substring(0, 30)  }...` : null,
        startsWithSpace: process.env.APNS_KEY ? process.env.APNS_KEY.startsWith(' ') : false,
      },

      APNS_KEY_BASE64: {
        endsWithSpace: process.env.APNS_KEY_BASE64
          ? process.env.APNS_KEY_BASE64.endsWith(' ')
          : false,
        exists: !!process.env.APNS_KEY_BASE64,
        hasNewlines: process.env.APNS_KEY_BASE64
          ? process.env.APNS_KEY_BASE64.includes('\n')
          : false,
        length: process.env.APNS_KEY_BASE64 ? process.env.APNS_KEY_BASE64.length : 0,
        preview: process.env.APNS_KEY_BASE64
          ? `${process.env.APNS_KEY_BASE64.substring(0, 20)  }...`
          : null,
        startsWithSpace: process.env.APNS_KEY_BASE64
          ? process.env.APNS_KEY_BASE64.startsWith(' ')
          : false,
      },

      APNS_KEY_ID: {
        endsWithSpace: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.endsWith(' ') : false,
        exists: !!process.env.APNS_KEY_ID,
        hasNewlines: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.includes('\n') : false,
        length: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.length : 0,
        preview: process.env.APNS_KEY_ID ? `${process.env.APNS_KEY_ID.substring(0, 4)  }...` : null,
        startsWithSpace: process.env.APNS_KEY_ID ? process.env.APNS_KEY_ID.startsWith(' ') : false,
      },

      APNS_TEAM_ID: {
        endsWithSpace: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.endsWith(' ') : false,
        exists: !!process.env.APNS_TEAM_ID,
        hasNewlines: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.includes('\n') : false,
        length: process.env.APNS_TEAM_ID ? process.env.APNS_TEAM_ID.length : 0,
        preview: process.env.APNS_TEAM_ID ? `${process.env.APNS_TEAM_ID.substring(0, 4)  }...` : null,
        startsWithSpace: process.env.APNS_TEAM_ID
          ? process.env.APNS_TEAM_ID.startsWith(' ')
          : false,
      },

      DEVICE_TOKEN: {
        endsWithSpace: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.endsWith(' ') : false,
        exists: !!process.env.DEVICE_TOKEN,
        hasNewlines: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.includes('\n') : false,
        length: process.env.DEVICE_TOKEN ? process.env.DEVICE_TOKEN.length : 0,
        preview: process.env.DEVICE_TOKEN ? `${process.env.DEVICE_TOKEN.substring(0, 8)  }...` : null,
        startsWithSpace: process.env.DEVICE_TOKEN
          ? process.env.DEVICE_TOKEN.startsWith(' ')
          : false,
      },
    },
  };

  return json(envDebug);
};
