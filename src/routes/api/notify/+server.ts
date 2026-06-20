import type {
  APNsFanOutResult,
  AppEnv,
  DeviceRecord,
  FCMFanOutResult,
  NotificationData,
  OptionChoice,
  ResponseKind,
} from '$lib/types';

import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { addNotification, getNotifications } from '$lib/modules/server/apn/notification-history';
import { selectPlatforms, summarizeNotifyDelivery } from '$lib/modules/server/apn/notify-fanout';
import { createPendingRequest } from '$lib/modules/server/apn/pending-requests';
import { validateAuth } from '$lib/modules/server/auth';
import { isFCMConfigured, sendFCMNotificationMulti } from '$lib/modules/server/fcm/fcm-service.js';
import { deviceTokenStore } from '$lib/modules/server/push/device-token-store';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { broadcastEvent } from '$lib/modules/server/ws/server';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// Singleton APNs client - reuses HTTP/2 connection across requests
let apnsSingleton: LibraryAPNsService | null = null;
function getAPNsClient(): LibraryAPNsService {
  if (!apnsSingleton) {
    apnsSingleton = new LibraryAPNsService();
  }
  return apnsSingleton;
}

const EMPTY_APNS_RESULT: APNsFanOutResult = {
  results: [],
  staleTokens: [],
  totalFailed: 0,
  totalSent: 0,
};
const EMPTY_FCM_RESULT: FCMFanOutResult = {
  failureCount: 0,
  results: [],
  staleTokens: [],
  successCount: 0,
};

/** Android tokens to deliver to: active registry rows, else the ANDROID_DEVICE_TOKEN seed. */
function resolveAndroidTokens(): string[] {
  const rows = deviceTokenStore.listActive('android');
  if (rows.length > 0) {
    return rows.map((r) => r.token);
  }
  const seed = env.ANDROID_DEVICE_TOKEN?.trim();
  return seed ? [seed] : [];
}

/**
 * iOS devices to deliver to: an explicit request override, else all active
 * registry rows for the server's gateway, else the legacy DEVICE_TOKEN env seed
 * (so .env-only deployments keep working without ever writing to the DB).
 */
function resolveIosDevices(override?: string): DeviceRecord[] {
  const appEnv = serverApnEnv();
  if (override) {
    return [syntheticSeedDevice(override, 'ios', appEnv)];
  }
  const rows = deviceTokenStore.listActiveForEnv('ios', appEnv);
  if (rows.length > 0) {
    return rows;
  }
  const seed = env.DEVICE_TOKEN?.trim();
  return seed ? [syntheticSeedDevice(seed, 'ios', appEnv)] : [];
}

function serverApnEnv(): AppEnv {
  return env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
}

/** A throwaway DeviceRecord wrapping a legacy env-seed or request-override token. */
function syntheticSeedDevice(
  token: string,
  platform: 'android' | 'ios',
  appEnv: AppEnv
): DeviceRecord {
  const nowIso = new Date().toISOString();
  return {
    appEnv,
    bundleId: null,
    deviceId: null,
    failureCount: 0,
    friendlyName: null,
    id: `seed-${platform}`,
    isActive: true,
    lastSeenAt: nowIso,
    platform,
    registeredAt: nowIso,
    token,
  };
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

  // Never filter a bidirectional (waitForResponse) request: the caller blocks
  // on polling, and a filtered 200 would read as success:true and hang it for
  // the full permission timeout. These are also dedup-exempt below.
  if (waitForResponse) {
    return { reason: 'Bidirectional request — never filtered', send: true };
  }

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

  // (Removed a dead `source === 'stop-hook'` branch: the notifier emits
  // 'shooter-completion-detector', never 'stop-hook', and the default below already allows it.)

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

  // Autopilot pushes include a stable dedupKey keyed on sessionId + top-step text
  // (not the variable summary). Prefer it over the title|message|category key so
  // two runs with the same top-step but different summary wording are correctly
  // deduplicated.
  const dataRecord = data as (NotificationData & { dedupKey?: string }) | undefined;
  const key = dataRecord?.dedupKey
    ? dataRecord.dedupKey
    : `${title}|${message}|${data?.category || 'unknown'}`;

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

  // RESERVE the slot atomically (check-and-set): a second concurrent request with the same key now
  // sees it as a duplicate before either has delivered, closing the TOCTOU window that let two
  // identical pushes through. The delivery path RELEASES the slot (releaseNotification) if the send
  // fails, so a legitimate retry is not blocked — this replaces the old record-only-on-success
  // scheme while still avoiding cache poisoning on failure.
  notificationCache.set(key, now);
  return false;
}

function notificationKey(title: string, message: string, data?: NotificationData): string {
  const dataRecord = data as (NotificationData & { dedupKey?: string }) | undefined;
  return dataRecord?.dedupKey ?? `${title}|${message}|${data?.category || 'unknown'}`;
}

/** Refresh a reserved dedup key after successful delivery (keeps the window measured from send). */
function recordNotification(title: string, message: string, data?: NotificationData): void {
  notificationCache.set(notificationKey(title, message, data), Date.now());
}

/** Release a reserved dedup key when delivery failed, so a legitimate retry is not blocked. */
function releaseNotification(title: string, message: string, data?: NotificationData): void {
  notificationCache.delete(notificationKey(title, message, data));
}

// TODO(refactor): extract body parsing, filtering, and platform routing into
// helpers. This handler grew past the 300-line guideline organically; PR-2
// adds 4 lines for dynamic-options fields. A dedicated cleanup PR is the
// right place to split it, not a feature PR.

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
    const subtitle = typeof body.subtitle === 'string' ? body.subtitle : undefined;

    // Coerce skipPush and waitForResponse to booleans — string "false" would
    // be truthy so we require an actual boolean, defaulting to false otherwise.
    const skipPush = typeof body.skipPush === 'boolean' ? body.skipPush : false;
    const waitForResponse =
      typeof body.waitForResponse === 'boolean' ? body.waitForResponse : false;

    // forcePush: when true, send the push even if WS clients are connected.
    // Used by the autopilot engine for high-signal notifications.
    // Deduplication still applies — only the WS-client skip is bypassed.
    const forcePush = typeof body.forcePush === 'boolean' ? body.forcePush : false;

    // Dynamic-options fields (PR-2/PR-3). When the caller wants to drive
    // a richer notification category — plan-mode approval, MCP
    // elicitation, AskUserQuestion choices — these arrive in the top
    // level of the body so they can be persisted in pending_requests
    // and surfaced to the iOS Decide screen via /api/decide/[id].
    //
    // Backward-compat: when these are omitted, the existing CLAUDE_
    // PERMISSION binary flow is unchanged.
    const notificationCategory =
      typeof body.notificationCategory === 'string' && body.notificationCategory.length > 0
        ? body.notificationCategory
        : undefined;
    const question = typeof body.question === 'string' ? body.question : undefined;
    const options =
      Array.isArray(body.options) && body.options.every((o) => o && typeof o === 'object')
        ? (body.options as OptionChoice[])
        : undefined;
    const responseKindRaw = body.responseKind;
    const responseKind: ResponseKind | undefined =
      responseKindRaw === 'hook' || responseKindRaw === 'pty' || responseKindRaw === 'info'
        ? responseKindRaw
        : undefined;

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
    // forcePush overrides this so high-signal autopilot pushes still reach the device.
    if (skipPush && !forcePush) {
      if (waitForResponse) {
        createPendingRequest(canonicalRequestId, {
          options,
          question: question ?? null,
          responseKind: responseKind ?? 'hook',
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
      // notificationCategory wins when explicitly set so plan-mode /
      // elicitation flows can pick CLAUDE_PLAN_APPROVAL / CHOICE_2..4.
      // Falls back to CLAUDE_PERMISSION for the legacy bidirectional
      // permission flow when only waitForResponse is provided.
      category: notificationCategory ?? (waitForResponse ? 'CLAUDE_PERMISSION' : undefined),
      data: {
        ...data,
        requestId: canonicalRequestId,
        source: 'modern-apns-api',
        timestamp: new Date().toISOString(),
        waitForResponse: waitForResponse || false,
      },
      message: null,
      sound: 'default' as const,
      ...(subtitle ? { subtitle } : {}),
      title,
    };

    // Multi-device fan-out. DEVICE_PLATFORM is now a FILTER (unset → both
    // platforms), not a binary switch. A request-scoped deviceToken override
    // (config "send test") bypasses the registry and targets one token.
    const override = requestDeviceToken?.trim() || undefined;
    const { doAndroid, doIos } = selectPlatforms(env.DEVICE_PLATFORM);

    // An override is a single token of unknown platform; honour the platform
    // FILTER (unset → try both) rather than assuming iOS, so an Android override
    // is not silently dropped when DEVICE_PLATFORM is unset. Firing a token at
    // the wrong gateway is harmless here because override sends never prune (see
    // the pruning guard below).
    const iosDevices: DeviceRecord[] = doIos
      ? override
        ? resolveIosDevices(override)
        : resolveIosDevices()
      : [];

    const androidTokens: string[] = doAndroid
      ? override
        ? [override]
        : resolveAndroidTokens()
      : [];

    // Collapse permission pushes by requestId so a re-notify replaces (not
    // stacks) the prompt on every device, and answering on one clears it.
    const collapseId = waitForResponse ? canonicalRequestId : undefined;

    const [apnsResult, fcmResult] = await Promise.all([
      iosDevices.length > 0 && apnsClient.isConfigured()
        ? apnsClient.sendToMany(iosDevices, payload, collapseId)
        : Promise.resolve(EMPTY_APNS_RESULT),
      androidTokens.length > 0 && isFCMConfigured()
        ? sendFCMNotificationMulti(androidTokens, payload)
        : Promise.resolve(EMPTY_FCM_RESULT),
    ]);

    const summary = summarizeNotifyDelivery(apnsResult, fcmResult);

    // Lazy prune dead tokens; bump last-seen for the ones that delivered.
    // Never prune on an override send: the override token is a one-off explicit
    // target (not necessarily a registry row), and firing it at the wrong
    // gateway must not soft-delete a real device that happens to hold it.
    const pruned =
      !override && summary.staleTokens.length
        ? deviceTokenStore.pruneByTokens(summary.staleTokens)
        : 0;
    if (summary.succeededTokens.length > 0) {
      deviceTokenStore.touchLastSeen(summary.succeededTokens);
    }

    // Keep the dedup reservation only on a clean, fully-successful delivery;
    // otherwise release it so a legitimate retry is not blocked (a transient
    // failure for one device must not poison the cache for everyone).
    if (summary.delivered && summary.failed === 0) {
      recordNotification(title, message, data);
    } else {
      releaseNotification(title, message, data);
    }

    // Register the pending request for bidirectional polling only if at least
    // one device received the push — otherwise no one can answer.
    if (waitForResponse && summary.delivered) {
      createPendingRequest(canonicalRequestId, {
        options,
        question: question ?? null,
        responseKind: responseKind ?? 'hook',
        sessionId: (data?.sessionId as string) || '',
        toolInput: (data?.toolInput as Record<string, unknown>) || {},
        toolName: (data?.toolName as string) || '',
      });
    }

    addNotification(
      buildNotificationRecord(
        canonicalRequestId,
        title,
        message,
        summary.delivered ? 'sent' : 'failed',
        data,
        summary.delivered ? null : 'No registered device accepted the notification'
      )
    );

    // 200 even when nothing was delivered (success:false) so the notifier hook
    // fast-fails instead of hanging for the full permission timeout.
    return json({
      failed: summary.failed,
      pruned,
      requestId: canonicalRequestId,
      sent: summary.sent,
      success: summary.delivered,
      timestamp: new Date().toISOString(),
    });
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
