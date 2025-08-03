import { json } from '@sveltejs/kit';

export async function POST({ request }) {
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

  } catch (error) {
    console.error('Webhook error:', error);
    return json({ 
      error: 'Failed to process webhook',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}