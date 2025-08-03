import { json } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns.js';

const apnsService = new APNsService();

export async function POST({ request }) {
  try {
    // Debug logging
    console.log('=== NOTIFY API DEBUG ===');
    console.log('API_KEY from env:', process.env.API_KEY ? 'SET' : 'NOT SET');
    console.log('API_KEY length:', process.env.API_KEY ? process.env.API_KEY.length : 0);
    console.log('API_KEY value:', process.env.API_KEY);
    
    // Validate API key
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid auth header');
      return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    const expectedKey = (process.env.API_KEY || 'test-key').trim();
    
    console.log('Received API key:', apiKey);
    console.log('Expected API key:', expectedKey);
    console.log('Keys match:', apiKey === expectedKey);
    
    if (apiKey !== expectedKey) {
      console.log('API key validation failed');
      return json({ 
        error: 'Invalid API key',
        debug: {
          received: apiKey,
          expected: expectedKey,
          match: apiKey === expectedKey
        }
      }, { status: 401 });
    }
    
    console.log('API key validation passed');

    // Parse request body
    console.log('Parsing request body...');
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const { title, message, data } = body;
    console.log('Extracted values:');
    console.log('- title:', title);
    console.log('- message:', message);
    console.log('- data:', data);

    if (!title || !message) {
      console.log('Missing title or message');
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
    const deviceToken = process.env.DEVICE_TOKEN?.trim();
    console.log('Device token from env:', deviceToken ? `${deviceToken.substring(0, 8)}... (${deviceToken.length} chars)` : 'NOT SET');
    
    if (!deviceToken) {
      return json({ 
        error: 'No device token configured',
        details: 'DEVICE_TOKEN environment variable is missing'
      }, { status: 500 });
    }

    // Send notification
    const payload = {
      title,
      body: message,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        source: 'sveltekit-api'
      }
    };
    
    // Debug payload structure
    console.log('=== PAYLOAD DEBUG ===');
    console.log('Raw data from request:', data);
    console.log('Data type:', typeof data);
    console.log('Data is array:', Array.isArray(data));
    console.log('Data keys:', data ? Object.keys(data) : 'none');
    console.log('Final payload:');
    console.log('- title:', typeof title, title);
    console.log('- body:', typeof message, message);
    console.log('- data:', typeof payload.data, payload.data);
    
    // Test JSON serialization of payload
    try {
      const payloadJson = JSON.stringify(payload);
      console.log('✅ Payload JSON serialization test passed');
      console.log('Payload JSON length:', payloadJson.length);
      console.log('Payload JSON preview:', payloadJson.substring(0, 100) + '...');
    } catch (jsonError) {
      console.error('❌ Payload JSON serialization failed:', jsonError);
      console.error('This might be the source of the JSON parsing error');
    }
    
    console.log('About to send notification:');
    console.log('- Device token:', deviceToken ? `${deviceToken.substring(0, 8)}...` : 'undefined');
    console.log('- Payload:', JSON.stringify(payload, null, 2));
    console.log('- APNs service configured:', apnsService.isConfigured());
    
    try {
      const result = await apnsService.sendNotification(deviceToken, payload);
      
      console.log('✅ Notification sent successfully!');
      console.log('Result:', JSON.stringify(result, null, 2));
      
      return json({
        success: true,
        message: 'Notification sent successfully',
        result,
        timestamp: new Date().toISOString()
      });
    } catch (notificationError) {
      console.error('💥 APNs sendNotification error:', notificationError);
      console.error('Error details:', notificationError.message);
      console.error('Error stack:', notificationError.stack);
      
      return json({ 
        error: 'Failed to send notification',
        details: notificationError.message,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Notification error:', error);
    return json({ 
      error: 'Failed to send notification',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}