import type { FcmDeliveryOutcome, FCMFanOutResult, NotificationPayload } from '$lib/types';

import admin from 'firebase-admin';

import { chunk, summarizeFcmFanOut } from './fcm-classify.js';

let app: admin.app.App | null = null;

// FCM multicast accepts up to 500 tokens; 100 keeps each HTTP/2 batch small.
const FCM_MULTICAST_CHUNK = 100;

export function isFCMConfigured(): boolean {
  return !!(
    process.env.FCM_PROJECT_ID &&
    process.env.FCM_CLIENT_EMAIL &&
    process.env.FCM_PRIVATE_KEY
  );
}

/**
 * Send one data push to a single device. Thin backward-compat wrapper retained
 * for existing callers; multi-device fan-out goes through sendFCMNotificationMulti.
 */
export async function sendFCMNotification(
  deviceToken: string,
  payload: NotificationPayload
): Promise<{ error?: string; messageId?: string; success: boolean }> {
  try {
    const fcmApp = getApp();
    const message: admin.messaging.Message = { ...buildDataMessage(payload), token: deviceToken };
    const messageId = await admin.messaging(fcmApp).send(message);
    return { messageId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[FCM] Send failed:', errorMessage);
    return { error: errorMessage, success: false };
  }
}

/**
 * Fan out one data push to many devices via sendEachForMulticast (one HTTP call
 * per 100-token chunk). Returns per-token results + the set of stale tokens
 * (only `registration-token-not-registered`) for the caller to prune.
 */
export async function sendFCMNotificationMulti(
  tokens: readonly string[],
  payload: NotificationPayload
): Promise<FCMFanOutResult> {
  if (tokens.length === 0) {
    return { failureCount: 0, results: [], staleTokens: [], successCount: 0 };
  }

  let fcmApp: admin.app.App;
  try {
    fcmApp = getApp();
  } catch (error) {
    // FCM not configured / init failure — return a structured all-failed result
    // rather than throwing, matching sendFCMNotification's contract so callers
    // always get an FCMFanOutResult instead of an unhandled rejection.
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[FCM] multi-send setup failed:', msg);
    return {
      failureCount: tokens.length,
      results: tokens.map((token) => ({ error: msg, messageId: null, success: false, token })),
      staleTokens: [],
      successCount: 0,
    };
  }
  const base = buildDataMessage(payload);
  const outcomes: FcmDeliveryOutcome[] = [];

  for (const group of chunk(tokens, FCM_MULTICAST_CHUNK)) {
    try {
      const batch = await admin
        .messaging(fcmApp)
        .sendEachForMulticast({ ...base, tokens: [...group] });
      batch.responses.forEach((resp, i) => {
        const errorCode = resp.error?.code ?? null;
        if (errorCode === 'messaging/invalid-argument') {
          // Per-token invalid-argument = this specific token string is malformed
          // (wrong length/characters), NOT a batch payload bug (that would throw
          // and be caught below). Surface it, but never prune — the token may be
          // valid once its registration data is corrected.
          console.error(`[FCM] invalid-argument for a token: ${resp.error?.message ?? ''}`);
        }
        outcomes.push({
          errorCode,
          messageId: resp.messageId ?? null,
          success: resp.success,
          token: group[i],
        });
      });
    } catch (error) {
      // Whole-chunk failure (auth, network) — count as failures, never stale.
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[FCM] multicast chunk failed:', msg);
      for (const token of group) {
        outcomes.push({ errorCode: null, messageId: null, success: false, token });
      }
    }
  }

  return summarizeFcmFanOut(outcomes);
}

/**
 * Build the shared DATA-ONLY message (no token). Data messages always reach
 * onMessageReceived() so the Android app keeps full control over rendering and
 * action buttons (notification messages are auto-displayed and can't).
 */
function buildDataMessage(
  payload: NotificationPayload
): Pick<admin.messaging.MulticastMessage, 'android' | 'data'> {
  return {
    android: {
      priority: 'high', // Ensures delivery even in Doze mode
      ttl: 300000, // 5 minutes TTL (matches pending request expiry)
    },
    data: {
      body: payload.body || payload.message || '',
      category:
        payload.category ??
        (typeof payload.data?.category === 'string' ? payload.data.category : ''),
      project: typeof payload.data?.project === 'string' ? payload.data.project : '',
      requestId: typeof payload.data?.requestId === 'string' ? payload.data.requestId : '',
      source: typeof payload.data?.source === 'string' ? payload.data.source : '',
      subtitle: payload.subtitle ?? '',
      timestamp: new Date().toISOString(),
      title: payload.title,
      toolInput: payload.data?.toolInput ? JSON.stringify(payload.data.toolInput) : '',
      toolName: typeof payload.data?.toolName === 'string' ? payload.data.toolName : '',
      type: typeof payload.data?.type === 'string' ? payload.data.type : '',
    },
  };
}

function getApp(): admin.app.App {
  if (!app) {
    const projectId = process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'FCM not configured: missing FCM_PROJECT_ID, FCM_CLIENT_EMAIL, or FCM_PRIVATE_KEY'
      );
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({ clientEmail, privateKey, projectId }),
    });
  }
  return app;
}
