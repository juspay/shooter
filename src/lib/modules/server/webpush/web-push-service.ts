/**
 * Web Push transport — signs and delivers browser/PWA notifications.
 *
 * Mirrors the shape of fcm-service.ts (isConfigured + sendMulti) so the notify
 * fan-out can treat it as a third delivery channel alongside APNs and FCM.
 * Uses the `web-push` library for VAPID signing + aes128gcm payload encryption.
 */

import type { WebPushFanOutResult, WebPushPayload, WebPushSubscriptionRecord } from '$lib/types';

import webpush from 'web-push';

import { getVapidKeys } from './vapid.js';

let vapidApplied = false;

/** The VAPID public key clients need to subscribe. */
export function getWebPushPublicKey(): string {
  return getVapidKeys().publicKey;
}

/** Web Push is always available (keys auto-generate) — a defensive guard for callers. */
export function isWebPushConfigured(): boolean {
  try {
    const keys = getVapidKeys();
    return Boolean(keys.publicKey && keys.privateKey);
  } catch {
    return false;
  }
}

/**
 * Fan a notification out to every active browser subscription. HTTP 404/410
 * from the push service means the subscription is dead → returned in
 * `staleEndpoints` for the caller to prune.
 */
export async function sendWebPushMulti(
  subscriptions: readonly WebPushSubscriptionRecord[],
  payload: WebPushPayload
): Promise<WebPushFanOutResult> {
  const result: WebPushFanOutResult = {
    failureCount: 0,
    results: [],
    staleEndpoints: [],
    successCount: 0,
  };
  if (subscriptions.length === 0) {
    return result;
  }

  ensureVapid();

  const body = JSON.stringify({
    body: payload.body,
    category: payload.category,
    data: { url: payload.url ?? '/', ...payload.data },
    tag: payload.tag,
    title: payload.title,
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          body,
          { TTL: 60 }
        );
        result.successCount += 1;
        result.results.push({ endpoint: sub.endpoint, success: true });
      } catch (err) {
        result.failureCount += 1;
        result.results.push({ endpoint: sub.endpoint, success: false });
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  return result;
}

function ensureVapid(): void {
  if (vapidApplied) {
    return;
  }
  const keys = getVapidKeys();
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  vapidApplied = true;
}
