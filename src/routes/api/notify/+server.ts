import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/server/library-apns.js';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

interface FilterResult {
  reason: string;
  send: boolean;
}

interface NotificationData {
  [key: string]: unknown;
  category?: string;
  files?: string;
  project?: string;
  source?: string;
  tool?: string;
}

interface NotificationRequest {
  data?: NotificationData;
  message: string;
  title: string;
}

// 🎯 NOTIFICATION DEDUPLICATION CACHE
const notificationCache = new Map<string, number>();
const DEDUP_WINDOW = 10000; // 10 seconds deduplication window

// 🎯 INTELLIGENT NOTIFICATION FILTERING
function intelligentNotificationFilter(
  title: string,
  message: string,
  data?: NotificationData
): FilterResult {
  const source = data?.source || 'unknown';

  // Check for duplicate notifications first
  if (isDuplicateNotification(title, message, data)) {
    return {
      reason: 'Duplicate notification within 10-second window',
      send: false,
    };
  }

  // Always allow smart completion detector notifications (both old and new naming)
  if (source === 'smart-completion-detector' || source === 'shooter-completion-detector') {
    return {
      reason: 'Smart completion detector - completion or intervention needed',
      send: true,
    };
  }

  // Always allow Stop hook completion notifications
  if (source === 'stop-hook') {
    return {
      reason: 'Stop hook completion notification - session finished',
      send: true,
    };
  }

  // Filter out only very specific spam patterns to be less restrictive
  const spamPatterns = [
    /PreToolUse/i, // Any PreToolUse notifications
    /PostToolUse/i, // Any PostToolUse notifications
    /^(Read|Write|Edit|Bash)\s+Starting\s*\|\s*\w+$/i, // Only basic tool starting patterns
    /^unknown\s*\|\s*\w+$/i, // Only "unknown | projectname" exactly
  ];

  const isSpam = spamPatterns.some((pattern) => pattern.test(title) || pattern.test(message));

  if (isSpam) {
    return {
      reason: 'Filtered spam notification from old hook system',
      send: false,
    };
  }

  // Allow explicit completion/intervention notifications
  const importantPatterns = [
    /session complete/i,
    /intervention needed/i,
    /error/i,
    /failed/i,
    /blocked/i,
    /attention/i,
  ];

  const isImportant = importantPatterns.some(
    (pattern) => pattern.test(title) || pattern.test(message)
  );

  if (isImportant) {
    return {
      reason: 'Important notification - completion or intervention',
      send: true,
    };
  }

  // Default: allow all notifications unless explicitly filtered
  return {
    reason: 'General notification - allowing by default',
    send: true,
  };
}

function isDuplicateNotification(title: string, message: string, data?: NotificationData): boolean {
  const key = `${title}|${message}|${data?.category || 'unknown'}`;
  const now = Date.now();

  if (notificationCache.has(key)) {
    const lastSent = notificationCache.get(key)!;
    if (now - lastSent < DEDUP_WINDOW) {
      return true; // Duplicate within time window
    }
  }

  // Record this notification
  notificationCache.set(key, now);

  // Clean up old entries
  for (const [k, v] of notificationCache.entries()) {
    if (now - v > DEDUP_WINDOW) {
      notificationCache.delete(k);
    }
  }

  return false;
}

export const POST: RequestHandler = async ({ request }) => {
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
    console.log('Device token updated:', new Date().toISOString());

    // Validate API key
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader);

    if (!authHeader?.startsWith('Bearer ')) {
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
      return json(
        {
          debug: {
            expected: expectedKey,
            match: apiKey === expectedKey,
            received: apiKey,
          },
          error: 'Invalid API key',
        },
        { status: 401 }
      );
    }

    console.log('API key validation passed');

    // Parse request body
    console.log('Parsing request body...');
    const body = (await request.json()) as NotificationRequest;
    console.log('Request body:', JSON.stringify(body, null, 2));

    const { data, message, title } = body;
    console.log('Extracted values:');
    console.log('- title:', title);
    console.log('- message:', message);
    console.log('- data:', data);

    if (!title || !message) {
      console.log('Missing title or message');
      return json({ error: 'Title and message are required' }, { status: 400 });
    }

    // 🎯 SMART NOTIFICATION FILTERING
    const requestId = Math.random().toString(36).substring(2, 15);
    const timestamp = new Date().toISOString();

    console.log(`\n=== 📱 NOTIFICATION REQUEST [${requestId}] @ ${timestamp} ===`);
    console.log(`📍 Project: ${data?.project || 'unknown'}`);
    console.log(`🔧 Tool: ${data?.tool || 'unknown'}`);
    console.log(`📂 Files: ${data?.files || 'none'}`);
    console.log(`💬 Title: ${JSON.stringify(title)}`);
    console.log(`📝 Message: ${JSON.stringify(message)}`);
    console.log(`🏷️ Source: ${data?.source || 'unknown'}`);
    console.log(`📊 Category: ${data?.category || 'unknown'}`);
    console.log(`🌐 User-Agent: ${request.headers.get('user-agent') || 'unknown'}`);
    console.log(`🔑 Auth: ${request.headers.get('authorization') ? 'Bearer ***' : 'none'}`);

    const shouldSendNotification = intelligentNotificationFilter(title, message, data);

    if (!shouldSendNotification.send) {
      console.log(`\n🚫 DECISION: FILTERED OUT`);
      console.log(`📋 Reason: ${shouldSendNotification.reason}`);
      console.log(
        `🔍 Filter Analysis: ${JSON.stringify({ message, source: data?.source, title }, null, 2)}`
      );
      console.log(`=== END REQUEST [${requestId}] - BLOCKED ===\n`);

      return json({
        filteringAnalysis: { message, requestId, source: data?.source, title },
        message: 'Notification filtered (not sent)',
        reason: shouldSendNotification.reason,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`\n✅ DECISION: APPROVED FOR SENDING`);
    console.log(`📋 Reason: ${shouldSendNotification.reason}`);

    // Check APNs configuration
    if (!apnsClient.isConfigured()) {
      return json(
        {
          details: 'Missing APNS_KEY, APNS_KEY_ID, or APNS_TEAM_ID environment variables',
          error: 'APNs client not configured',
        },
        { status: 500 }
      );
    }

    // Get device token
    const deviceToken = env.DEVICE_TOKEN?.trim();
    console.log(
      'Device token from env:',
      deviceToken ? `${deviceToken.substring(0, 8)}... (${deviceToken.length} chars)` : 'NOT SET'
    );

    if (!deviceToken) {
      return json(
        {
          details: 'DEVICE_TOKEN environment variable is missing',
          error: 'No device token configured',
        },
        { status: 500 }
      );
    }

    // Send notification
    const payload = {
      badge: 1,
      body: message,
      data: {
        ...data,
        source: 'modern-apns-api',
        timestamp: new Date().toISOString(),
      },
      sound: 'default' as const,
      title,
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
      console.log('Payload JSON preview:', `${payloadJson.substring(0, 100)  }...`);
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
      console.log(`\n🚀 SENDING TO APNs...`);
      console.log(`📱 Device Token: ${deviceToken.substring(0, 8)}...`);
      console.log(`📦 Payload Size: ${JSON.stringify(payload).length} bytes`);

      const result = await apnsClient.sendNotification(deviceToken, payload);

      console.log(`\n✅ APNs DELIVERY SUCCESS!`);
      console.log(`📊 Result: ${JSON.stringify(result, null, 2)}`);
      console.log(`📱 Devices Sent: ${result.sent || 0}`);
      console.log(`❌ Devices Failed: ${result.failed || 0}`);
      if (result.details && result.details.length > 0) {
        console.log(`🔍 APNs Details:`);
        result.details.forEach((detail, index) => {
          console.log(`  ${index + 1}. Device: ${detail.device?.substring(0, 8)}...`);
          console.log(`     APNs ID: ${detail['apns-unique-id']}`);
          console.log(`     Status: ${detail.status || 'success'}`);
        });
      }
      console.log(`=== END REQUEST [${requestId}] - DELIVERED ===\n`);

      return json({
        message: 'Notification sent successfully',
        requestId,
        result,
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (notificationError) {
      const err = notificationError as Error;
      console.error(`\n💥 APNs DELIVERY FAILED!`);
      console.error(`📋 Error: ${err.message}`);
      console.error(`🔍 Details: ${err.stack}`);
      console.error(`=== END REQUEST [${requestId}] - FAILED ===\n`);

      return json(
        {
          details: err.message,
          error: 'Failed to send notification',
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    const err = error as Error;
    console.error('Notification error:', err);
    return json(
      {
        details: err.message,
        error: 'Failed to send notification',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
