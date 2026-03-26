import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// TODO: Add HMAC signature validation for webhook payloads.
// This is currently a stub endpoint — no signature verification is performed.
export const POST: RequestHandler = async ({ request }) => {
  try {
    const authError = validateAuth(request);
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as Record<string, unknown>;

    console.log('Webhook received:', {
      body,
      timestamp: new Date().toISOString(),
    });

    // In a full implementation, this would forward to Claude Code
    // For now, just log and acknowledge

    return json({
      message: 'Webhook received successfully',
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[webhook] Failed to process webhook:', toErrorMessage(error));
    return json(
      {
        error: 'Failed to process webhook',
      },
      { status: 500 }
    );
  }
};
