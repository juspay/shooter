import { json, type RequestHandler } from '@sveltejs/kit';
import type {  } from '$types/api';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    console.log('Webhook received:', {
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(request.headers.entries()),
      body
    });

    // In a full implementation, this would forward to Claude Code
    // For now, just log and acknowledge

    return json({
      success: true,
      message: 'Webhook received successfully',
      timestamp: new Date().toISOString(),
      data: body
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
    console.error('Webhook error:', error);
    return json(
      {
        success: false,
        error: 'Failed to process webhook',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};
