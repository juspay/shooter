import { json } from '@sveltejs/kit';
import { LibraryAPNsService } from '$lib/server/library-apns.js';
import { env } from '$env/dynamic/private';

// 🎯 INTELLIGENT NOTIFICATION FILTERING
function intelligentNotificationFilter(title, message, data) {
  const source = data?.source || 'unknown';
  const category = data?.category || 'unknown';
  const timestamp = Date.now();
  
  // Always allow smart completion detector notifications
  if (source === 'smart-completion-detector') {
    return { 
      send: true, 
      reason: 'Smart completion detector - completion or intervention needed' 
    };
  }
  
  // Filter out known spam patterns from old universal notifier
  const spamPatterns = [
    /Starting.*shooter/i,     // "Write Starting | shooter"
    /Complete.*shooter/i,     // "Edit Complete | shooter" 
    /Tools starting/i,        // "Tools starting in shooter"
    /Tool starting/i,         // "Tool starting in shooter"
    /unknown.*shooter/i,      // "unknown | shooter"
    /PreToolUse/i,           // Any PreToolUse notifications
    /PostToolUse/i,          // Any PostToolUse notifications
  ];
  
  const isSpam = spamPatterns.some(pattern => 
    pattern.test(title) || pattern.test(message)
  );
  
  if (isSpam) {
    return { 
      send: false, 
      reason: 'Filtered spam notification from old hook system' 
    };
  }
  
  // Allow explicit completion/intervention notifications
  const importantPatterns = [
    /session complete/i,
    /intervention needed/i,
    /error/i,
    /failed/i,
    /blocked/i,
    /attention/i
  ];
  
  const isImportant = importantPatterns.some(pattern => 
    pattern.test(title) || pattern.test(message)
  );
  
  if (isImportant) {
    return { 
      send: true, 
      reason: 'Important notification - completion or intervention' 
    };
  }
  
  // Default: allow unknown notifications (to be safe)
  return { 
    send: true, 
    reason: 'Unknown notification type - allowing to be safe' 
  };
}

export async function POST({ request }) {
  try {
    // Use proven library instead of manual implementation
    console.log('=== INITIALIZING LIBRARY APNS SERVICE ===');
    const apnsClient = new LibraryAPNsService();
    console.log('Library APNs service initialized successfully');
    
    // Debug logging
    console.log('=== NOTIFY API DEBUG ===');
    console.log('API_KEY from env:', env.API_KEY ? 'SET' : 'NOT SET');
    console.log('API_KEY length:', env.API_KEY ? env.API_KEY.length : 0);
    console.log('API_KEY value:', env.API_KEY);
    
    // Validate API key
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid auth header');
      return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    const expectedKey = (env.API_KEY || 'test-key').trim();
    
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

    // 🎯 SMART NOTIFICATION FILTERING
    const shouldSendNotification = intelligentNotificationFilter(title, message, data);
    if (!shouldSendNotification.send) {
      console.log(`🚫 Notification filtered: ${shouldSendNotification.reason}`);
      return json({ 
        success: true, 
        message: 'Notification filtered (not sent)',
        reason: shouldSendNotification.reason,
        timestamp: new Date().toISOString()
      });
    }
    console.log(`✅ Notification approved: ${shouldSendNotification.reason}`);

    // Check APNs configuration
    if (!apnsClient.isConfigured()) {
      return json({ 
        error: 'APNs client not configured',
        details: 'Missing APNS_KEY, APNS_KEY_ID, or APNS_TEAM_ID environment variables'
      }, { status: 500 });
    }

    // Get device token
    const deviceToken = env.DEVICE_TOKEN?.trim();
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
      badge: 1,
      sound: 'default',
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        source: 'modern-apns-api'
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
    console.log('- APNs client configured:', apnsClient.isConfigured());
    
    console.log('=== BEFORE CALLING SENDNOTIFICATION ===');
    console.log('- deviceToken value:', deviceToken);
    console.log('- payload value:', payload);
    console.log('- payload type:', typeof payload);
    console.log('- payload stringify:', JSON.stringify(payload));
    
    try {
      console.log('Calling sendNotification with:');
      console.log('  arg1 (deviceToken):', deviceToken);  
      console.log('  arg2 (payload):', payload);
      
      const result = await apnsClient.sendNotification(deviceToken, payload);
      
      console.log('✅ Notification sent successfully!');
      console.log('Result:', JSON.stringify(result, null, 2));
      
      return json({
        success: true,
        message: 'Notification sent successfully',
        result,
        timestamp: new Date().toISOString()
      });
    } catch (notificationError) {
      console.error('💥 Direct APNs HTTP/2 sendNotification error:', notificationError);
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