import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { addNotification, getNotifications } from '$lib/modules/server/apn/notification-history';
import { createPendingRequest } from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { isFCMConfigured, sendFCMNotification } from '$lib/modules/server/fcm/fcm-service.js';
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
  waitForResponse?: boolean;
}

// Singleton APNs client - reuses HTTP/2 connection across requests
let apnsSingleton: LibraryAPNsService | null = null;
function getAPNsClient(): LibraryAPNsService {
  if (!apnsSingleton) {
    apnsSingleton = new LibraryAPNsService();
  }
  return apnsSingleton;
}

// NOTIFICATION DEDUPLICATION CACHE
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

  // Clean up old entries
  for (const [k, v] of notificationCache.entries()) {
    if (now - v > DEDUP_WINDOW) {
      notificationCache.delete(k);
    }
  }

  // Do NOT record here — caller must call recordNotification() after
  // successful delivery to avoid cache poisoning on send failure.
  return false;
}

/** Record a notification key in the dedup cache after successful delivery. */
function recordNotification(title: string, message: string, data?: NotificationData): void {
  const key = `${title}|${message}|${data?.category || 'unknown'}`;
  notificationCache.set(key, Date.now());
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Use singleton APNs client to reuse HTTP/2 connection
    const apnsClient = getAPNsClient();

    // Validate API key using timing-safe comparison
    const authError = validateAuth(request);
    if (authError) {return authError;}

    // Parse request body
    const body = (await request.json()) as NotificationRequest;
    const { data, message, title, waitForResponse } = body;

    if (!title || !message) {
      return json({ error: 'Title and message are required' }, { status: 400 });
    }

    // Smart notification filtering
    const requestId = Math.random().toString(36).substring(2, 15);
    const dataRequestId = typeof data?.requestId === 'string' ? data.requestId : undefined;
    const canonicalRequestId = dataRequestId || requestId;
    const shouldSendNotification = intelligentNotificationFilter(title, message, data);

    if (!shouldSendNotification.send) {
      addNotification({
        category: data?.category,
        data: data as Record<string, unknown>,
        error: shouldSendNotification.reason,
        id: canonicalRequestId,
        message,
        project: data?.project,
        source: data?.source,
        status: 'filtered',
        timestamp: new Date().toISOString(),
        title,
        tool: data?.tool,
      });

      return json({
        message: 'Notification filtered (not sent)',
        reason: shouldSendNotification.reason,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    // Build notification payload (shared between APNs and FCM)
    const payload = {
      badge: 1,
      body: message,
      category: waitForResponse ? 'CLAUDE_PERMISSION' : undefined,
      data: {
        ...data,
        requestId: canonicalRequestId,
        source: 'modern-apns-api',
        timestamp: new Date().toISOString(),
        waitForResponse: waitForResponse || false,
      },
      message: null,
      sound: 'default' as const,
      title,
    };

    // Platform-based routing: Android (FCM) or iOS (APNs)
    const platform = env.DEVICE_PLATFORM || 'ios';

    if (platform === 'android') {
      // --- FCM (Android) path ---
      if (!isFCMConfigured()) {
        return json(
          {
            details: 'Missing FCM_PROJECT_ID, FCM_CLIENT_EMAIL, or FCM_PRIVATE_KEY environment variables',
            error: 'FCM not configured',
          },
          { status: 500 }
        );
      }

      const androidToken = (env.ANDROID_DEVICE_TOKEN || env.DEVICE_TOKEN)?.trim();

      if (!androidToken) {
        return json(
          {
            details: 'ANDROID_DEVICE_TOKEN or DEVICE_TOKEN environment variable is missing',
            error: 'No device token configured',
          },
          { status: 500 }
        );
      }

      const fcmResult = await sendFCMNotification(androidToken, payload);

      if (fcmResult.success) {
        // Record in dedup cache only after successful delivery
        recordNotification(title, message, data);

        if (waitForResponse) {
          createPendingRequest(canonicalRequestId, {
            sessionId: (data?.sessionId as string) || '',
            toolInput: (data?.toolInput as Record<string, unknown>) || {},
            toolName: (data?.toolName as string) || '',
          });
        }

        addNotification({
          category: data?.category,
          data: data as Record<string, unknown>,
          id: canonicalRequestId,
          message,
          project: data?.project,
          source: data?.source,
          status: 'sent',
          timestamp: new Date().toISOString(),
          title,
          tool: data?.tool,
        });

        return json({
          message: 'Notification sent successfully',
          requestId: canonicalRequestId,
          result: { messageId: fcmResult.messageId },
          success: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error(`[notify] FCM delivery failed: ${fcmResult.error}`);

        addNotification({
          category: data?.category,
          data: data as Record<string, unknown>,
          error: fcmResult.error,
          id: canonicalRequestId,
          message,
          project: data?.project,
          source: data?.source,
          status: 'failed',
          timestamp: new Date().toISOString(),
          title,
          tool: data?.tool,
        });

        return json(
          {
            details: fcmResult.error,
            error: 'Failed to send notification',
            requestId: canonicalRequestId,
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        );
      }
    } else {
      // --- APNs (iOS) path ---
      if (!apnsClient.isConfigured()) {
        return json(
          {
            details: 'Missing APNS_KEY, APNS_KEY_ID, or APNS_TEAM_ID environment variables',
            error: 'APNs client not configured',
          },
          { status: 500 }
        );
      }

      const deviceToken = env.DEVICE_TOKEN?.trim();

      if (!deviceToken) {
        return json(
          {
            details: 'DEVICE_TOKEN environment variable is missing',
            error: 'No device token configured',
          },
          { status: 500 }
        );
      }

      try {
        const result = await apnsClient.sendNotification(deviceToken, payload);

        // Record in dedup cache only after successful delivery
        recordNotification(title, message, data);

        // If this is a bidirectional permission request, store it for polling
        // only after confirming APNs delivery succeeded
        if (waitForResponse) {
          createPendingRequest(canonicalRequestId, {
            sessionId: (data?.sessionId as string) || '',
            toolInput: (data?.toolInput as Record<string, unknown>) || {},
            toolName: (data?.toolName as string) || '',
          });
        }

        addNotification({
          category: data?.category,
          data: data as Record<string, unknown>,
          id: canonicalRequestId,
          message,
          project: data?.project,
          source: data?.source,
          status: 'sent',
          timestamp: new Date().toISOString(),
          title,
          tool: data?.tool,
        });

        return json({
          message: 'Notification sent successfully',
          requestId: canonicalRequestId,
          result,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } catch (notificationError) {
        const err = notificationError as Error;
        console.error(`[notify] APNs delivery failed: ${err.message}`);

        addNotification({
          category: data?.category,
          data: data as Record<string, unknown>,
          error: err.message,
          id: canonicalRequestId,
          message,
          project: data?.project,
          source: data?.source,
          status: 'failed',
          timestamp: new Date().toISOString(),
          title,
          tool: data?.tool,
        });

        return json(
          {
            details: err.message,
            error: 'Failed to send notification',
            requestId: canonicalRequestId,
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        );
      }
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

export const GET: RequestHandler = ({ request, url }) => {
  // Validate API key using timing-safe comparison
  const authError = validateAuth(request);
  if (authError) {return authError;}

  const limit = parseInt(url.searchParams.get('limit') || '50');
  const notifications = getNotifications(limit);

  return json({
    count: notifications.length,
    notifications,
    timestamp: new Date().toISOString(),
  });
};
