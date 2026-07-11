// Web Push (browser / PWA) subscription types.
//
// Hand-written (not generated from specs/types) because the subscription shape
// is nested (endpoint + keys) and needs a runtime guard used by the HTTP route
// and the SQLite store — the same rationale as device.ts. Deliberately free of
// Node built-ins so the $lib/types barrel stays client-safe.

/** Resolved VAPID key material for signing web-push messages. */
export interface VapidKeys {
  privateKey: string;
  publicKey: string;
  subject: string;
}

/** Outcome of one web-push delivery, before aggregation. */
export interface WebPushDeliveryResult {
  endpoint: string;
  success: boolean;
}

/** Aggregate web-push fan-out result across all active subscriptions. */
export interface WebPushFanOutResult {
  failureCount: number;
  results: WebPushDeliveryResult[];
  staleEndpoints: string[];
  successCount: number;
}

/** The notification content sent to the service worker's push handler. */
export interface WebPushPayload {
  body: string;
  category?: string;
  data?: Record<string, unknown>;
  tag?: string;
  title: string;
  url?: string;
}

/** Outcome of a client-side enable attempt. */
export type WebPushStatus =
  | 'denied' // the user blocked notifications
  | 'error' // registration / subscribe / network failure
  | 'granted' // subscribed successfully
  | 'unsupported'; // no service worker or push manager in this browser

/** The browser's `PushSubscription.toJSON()` shape, plus optional device metadata. */
export interface WebPushSubscriptionInput {
  deviceId?: null | string;
  endpoint: string;
  friendlyName?: null | string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

/** One stored web-push subscription row. */
export interface WebPushSubscriptionRecord {
  auth: string;
  deviceId: null | string;
  endpoint: string;
  failureCount: number;
  friendlyName: null | string;
  id: string;
  isActive: boolean;
  lastSeenAt: string;
  p256dh: string;
  registeredAt: string;
}

/** Narrow unknown JSON into a WebPushSubscriptionInput (endpoint + keys present). */
export function isWebPushSubscriptionInput(value: unknown): value is WebPushSubscriptionInput {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.endpoint !== 'string' || obj.endpoint.length === 0) {
    return false;
  }
  if (!obj.keys || typeof obj.keys !== 'object') {
    return false;
  }
  const keys = obj.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return false;
  }
  if (keys.p256dh.length === 0 || keys.auth.length === 0) {
    return false;
  }
  if (obj.deviceId !== undefined && obj.deviceId !== null && typeof obj.deviceId !== 'string') {
    return false;
  }
  if (
    obj.friendlyName !== undefined &&
    obj.friendlyName !== null &&
    typeof obj.friendlyName !== 'string'
  ) {
    return false;
  }
  return true;
}
