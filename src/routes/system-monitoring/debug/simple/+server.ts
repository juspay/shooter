import { json, type RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/config';
import type { DebugSimpleResponse } from '$types/api';

export const GET: RequestHandler = async () => {
  const { nodeEnv, apns, device, api } = config;

  const response: DebugSimpleResponse = {
    success: true,
    message: 'Debug information retrieved successfully',
    timestamp: new Date().toISOString(),
    nodeEnv: nodeEnv,
    vercelEnv: process.env.VERCEL_ENV,
    hasApiKey: !!api.key,
    hasApnsKeyId: !!apns.keyId,
    hasApnsTeamId: !!apns.teamId,
    hasApnsKey: !!apns.keyP8,
    hasDeviceToken: !!device.token
  } as DebugSimpleResponse;

  return json(response);
};
