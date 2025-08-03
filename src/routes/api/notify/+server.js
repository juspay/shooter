import { json } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns.js';

const apnsService = new APNsService();

export async function POST({ request }) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    const expectedKey = process.env.API_KEY || 'test-key';
    if (apiKey !== expectedKey) {
      return json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { title, message, data } = body;

    if (!title || !message) {
      return json({ error: 'Title and message are required' }, { status: 400 });
    }

    // Check APNs configuration
    if (!apnsService.isConfigured()) {
      return json({ 
        error: 'APNs service not configured',
        details: 'Missing APNS_KEY, APNS_KEY_ID, or APNS_TEAM_ID environment variables'
      }, { status: 500 });
    }

    // Get device token
    const deviceToken = process.env.DEVICE_TOKEN;
    if (!deviceToken) {
      return json({ 
        error: 'No device token configured',
        details: 'DEVICE_TOKEN environment variable is missing'
      }, { status: 500 });
    }

    // Send notification
    const result = await apnsService.sendNotification(deviceToken, {
      title,
      body: message,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        source: 'sveltekit-api'
      }
    });

    return json({
      success: true,
      message: 'Notification sent successfully',
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Notification error:', error);
    return json({ 
      error: 'Failed to send notification',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}