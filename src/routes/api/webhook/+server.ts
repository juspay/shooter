import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

type WebhookBody = Record<string, unknown>;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as WebhookBody;

    console.log('Webhook received:', {
      body,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    });

    // In a full implementation, this would forward to Claude Code
    // For now, just log and acknowledge

    return json({
      data: body,
      message: 'Webhook received successfully',
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    console.error('Webhook error:', err);
    return json(
      {
        details: err.message,
        error: 'Failed to process webhook',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
