import type { NotificationData } from '$lib/types';

import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { addNotification, getNotifications } from '$lib/modules/server/apn/notification-history';
import { createPendingRequest } from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { isFCMConfigured, sendFCMNotification } from '$lib/modules/server/fcm/fcm-service.js';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { broadcastEvent } from '$lib/modules/server/ws/server';
import { json } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RequestHandler } from './$types';

// Reads tokens persisted by /api/device-token — populated automatically when
// the Android or iOS app registers on first launch.
function readPersistedDeviceToken(platform: 'android' | 'ios'): string | undefined {
  const tokensFile = join(homedir(), '.shooter', 'device-tokens.json');
  if (!existsSync(tokensFile)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(tokensFile, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[platform];
      return typeof value === 'string' && value ? value : undefined;
    }
  } catch {
    // corrupt / unreadable — fall through
  }
  return undefined;
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

function broadcastHookEvent(body: Record<string, unknown>): void {
  const data = (body.data ?? {}) as Record<string, unknown>;
  const eventType =
    typeof data.eventType === 'string'
      ? data.eventType
      : typeof body.eventType === 'string'
        ? body.eventType
        : '';
  const tool = typeof data.tool === 'string' ? data.tool : '';
  const terminalId = typeof data.terminalId === 'string' ? data.terminalId : undefined;
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;

  switch (eventType) {
    case 'error':
      broadcastEvent({
        error:
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : 'Unknown error',
        terminalId,
        tool,
        type: 'tool-failed',
      });
      break;
    case 'idle_input':
    case 'session.idle':
      broadcastEvent({
        message: typeof data.message === 'string' ? data.message : '',
        sessionId,
        terminalId,
        type: 'agent-idle',
      });
      break;
    case 'permission':
    case 'permission_notification':
      if (data.requestId && data.toolName) {
        broadcastEvent({
          input:
            typeof data.toolInput === 'object' && data.toolInput !== null
              ? (data.toolInput as Record<string, unknown>)
              : {},
          requestId: data.requestId as string,
          tool: data.toolName as string,
          type: 'permission-requested',
        });
      }
      break;
    case 'question':
      broadcastEvent({
        message: typeof data.message === 'string' ? data.message : '',
        sessionId,
        terminalId,
        type: 'agent-question',
      });
      break;
    case 'tool.after':
      broadcastEvent({ success: true, terminalId, tool, type: 'tool-completed' });
      break;
    case 'tool.before':
      broadcastEvent({
        command: typeof data.command === 'string' ? data.command : '',
        filePath:
          typeof data.filePath === 'string'
            ? data.filePath
            : typeof data.files === 'string'
              ? data.files
              : '',
        terminalId,
        tool,
        type: 'tool-started',
      });
      break;
    // session.status, intervention — skip or use existing types
  }
}

/** Build a notification history record from common fields. */
function buildNotificationRecord(
  id: string,
  title: string,
  message: string,
  status: 'failed' | 'filtered' | 'sent' | 'skipped',
  data?: NotificationData,
  error?: null | string
): Parameters<typeof addNotification>[0] {
  return {
    category: data?.category ?? null,
    data: (data as Record<string, unknown>) ?? null,
    error: error ?? null,
    id,
    message,
    project: data?.project ?? null,
    source: data?.source ?? null,
    status,
    timestamp: new Date().toISOString(),
    title,
    tool: data?.tool ?? null,
  };
}

function intelligentNotificationFilter(
  title: string,
  message: string,
  data?: NotificationData,
  waitForResponse = false
): { reason: string; send: boolean } {
  const source = data?.source || 'unknown';

  // Check for duplicate notifications first
  if (isDuplicateNotification(title, message, data, waitForResponse)) {
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

function isDuplicateNotification(
  title: string,
  message: string,
  data?: NotificationData,
  waitForResponse = false
): boolean {
  // Never deduplicate bidirectional permission requests — each one creates a
  // unique pending request that the hook polls by requestId.
  if (waitForResponse) {
    return false;
  }

  const key = `${title}|${message}|${data?.category || 'unknown'}`;
  const now = Date.now();

  if (notificationCache.has(key)) {
    const lastSent = notificationCache.get(key) ?? 0;
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

  // Do NOT record here -- caller must call recordNotification() after
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
    if (authError) {
      return authError;
    }

    // Parse request body
    const rawBody: unknown = await request.json();

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const body = rawBody as Record<string, unknown>;
    const data = body.data as NotificationData | undefined;
    const requestDeviceToken = body.deviceToken as string | undefined;
    const message = body.message as string;
    const title = body.title as string;

    // Coerce skipPush and waitForResponse to booleans — string "false" would
    // be truthy so we require an actual boolean, defaulting to false otherwise.
    const skipPush = typeof body.skipPush === 'boolean' ? body.skipPush : false;
    const waitForResponse =
      typeof body.waitForResponse === 'boolean' ? body.waitForResponse : false;

    // Broadcast to /ws/events for real-time activity feed
    try {
      broadcastHookEvent(body);
    } catch {
      // Best-effort broadcast — don't fail the notify request
    }

    if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
      return json({ error: 'Title and message are required and must be strings' }, { status: 400 });
    }

    if (requestDeviceToken !== undefined && typeof requestDeviceToken !== 'string') {
      return json({ error: 'deviceToken must be a string' }, { status: 400 });
    }

    // Smart notification filtering
    const requestId = Math.random().toString(36).substring(2, 15);
    const dataRequestId = typeof data?.requestId === 'string' ? data.requestId : undefined;
    const canonicalRequestId = dataRequestId || requestId;
    const shouldSendNotification = intelligentNotificationFilter(
      title,
      message,
      data,
      waitForResponse
    );

    if (!shouldSendNotification.send) {
      addNotification(
        buildNotificationRecord(
          canonicalRequestId,
          title,
          message,
          'filtered',
          data,
          shouldSendNotification.reason
        )
      );

      return json({
        message: 'Notification filtered (not sent)',
        reason: shouldSendNotification.reason,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }

    // When skipPush is true, the caller wants to register a pending request
    // (for bidirectional permission polling) without actually sending a push
    // notification.  This happens when WebSocket clients are connected and the
    // events channel will broadcast the permission-requested event instead.
    if (skipPush) {
      if (waitForResponse) {
        createPendingRequest(canonicalRequestId, {
          sessionId: (data?.sessionId as string) || '',
          toolInput: (data?.toolInput as Record<string, unknown>) || {},
          toolName: (data?.toolName as string) || '',
        });
      }

      addNotification(buildNotificationRecord(canonicalRequestId, title, message, 'skipped', data));

      return json({
        message: 'Push skipped (WebSocket clients connected)',
        requestId: canonicalRequestId,
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
            details:
              'Missing FCM_PROJECT_ID, FCM_CLIENT_EMAIL, or FCM_PRIVATE_KEY environment variables',
            error: 'FCM not configured',
          },
          { status: 500 }
        );
      }

      // Honor request-scoped deviceToken, then the Android-specific env var,
      // then the token auto-registered by the Android app via /api/device-token.
      // env.DEVICE_TOKEN is intentionally NOT in this chain: the iOS branch
      // treats it as an APNs token (see below), and letting it bleed into the
      // FCM path would ship an APNs token to FCM in mixed-platform setups.
      const androidToken =
        requestDeviceToken?.trim() ||
        env.ANDROID_DEVICE_TOKEN?.trim() ||
        readPersistedDeviceToken('android');

      if (!androidToken) {
        return json(
          {
            details:
              'No Android device token available — set ANDROID_DEVICE_TOKEN, pass deviceToken in the request body, or open the Android app so it can auto-register its FCM token.',
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

        addNotification(buildNotificationRecord(canonicalRequestId, title, message, 'sent', data));

        return json({
          message: 'Notification sent successfully',
          requestId: canonicalRequestId,
          result: { messageId: fcmResult.messageId },
          success: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error(`[notify] FCM delivery failed: ${fcmResult.error}`);

        addNotification(
          buildNotificationRecord(
            canonicalRequestId,
            title,
            message,
            'failed',
            data,
            fcmResult.error
          )
        );

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

      // Honor request-scoped deviceToken (e.g., from config page test),
      // falling back to the server-wide environment variable.
      const deviceToken = requestDeviceToken?.trim() || env.DEVICE_TOKEN?.trim();

      if (!deviceToken) {
        return json(
          {
            details:
              'DEVICE_TOKEN environment variable is missing and no deviceToken in request body',
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

        addNotification(buildNotificationRecord(canonicalRequestId, title, message, 'sent', data));

        return json({
          message: 'Notification sent successfully',
          requestId: canonicalRequestId,
          result,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } catch (notificationError) {
        const notifErrMsg = toErrorMessage(notificationError);
        console.error(`[notify] APNs delivery failed: ${notifErrMsg}`);

        addNotification(
          buildNotificationRecord(canonicalRequestId, title, message, 'failed', data, notifErrMsg)
        );

        return json(
          {
            details: notifErrMsg,
            error: 'Failed to send notification',
            requestId: canonicalRequestId,
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Notification error:', error);
    return json(
      {
        details: toErrorMessage(error),
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
  if (authError) {
    return authError;
  }

  const limit = parseInt(url.searchParams.get('limit') || '50');
  const notifications = getNotifications(limit);

  return json({
    count: notifications.length,
    notifications,
    timestamp: new Date().toISOString(),
  });
};
