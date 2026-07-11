// Client-side Web Push: register the service worker, request permission,
// subscribe with the server's VAPID public key, and hand the subscription to
// the server. Browser-only — every entry point guards on feature support and
// returns a typed status so the UI can explain what happened.

import type { WebPushStatus } from '$lib/types';

/** Unsubscribe locally and remove the subscription from the server. */
export async function disableWebPush(apiKey: string): Promise<boolean> {
  if (!isWebPushSupported()) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) {
      return true;
    }
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch('/api/web-push/subscribe', {
      body: JSON.stringify({ endpoint }),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the SW, ask permission, subscribe, and POST the subscription.
 * Idempotent: an existing subscription is re-sent (keeps the server in sync).
 */
export async function enableWebPush(apiKey: string): Promise<WebPushStatus> {
  if (!isWebPushSupported()) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return permission === 'denied' ? 'denied' : 'error';
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const keyRes = await fetch('/api/web-push/vapid-public-key');
    if (!keyRes.ok) {
      return 'error';
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    if (!publicKey) {
      return 'error';
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToUint8Array(publicKey),
        userVisibleOnly: true,
      }));

    const res = await fetch('/api/web-push/subscribe', {
      body: JSON.stringify({
        ...subscription.toJSON(),
        friendlyName: navigatorLabel(),
      }),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return res.ok ? 'granted' : 'error';
  } catch {
    return 'error';
  }
}

/** Current notification permission, or 'unsupported' when the API is absent. */
export function getWebPushPermission(): 'default' | 'denied' | 'granted' | 'unsupported' {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

/** True when an active push subscription already exists for this browser. */
export async function isWebPushSubscribed(): Promise<boolean> {
  if (!isWebPushSupported()) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return false;
    }
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

/** True when this browser can do service-worker push at all. */
export function isWebPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** A short human label for the subscription row (best-effort). */
function navigatorLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Browser';
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'iOS Safari';
  }
  if (ua.includes('Android')) {
    return 'Android Chrome';
  }
  if (ua.includes('Chrome')) {
    return 'Chrome';
  }
  if (ua.includes('Safari')) {
    return 'Safari';
  }
  if (ua.includes('Firefox')) {
    return 'Firefox';
  }
  return 'Browser';
}

/** Decode a base64url VAPID public key into the Uint8Array the Push API wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Back the view with an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>
  // (assignable to BufferSource), not Uint8Array<ArrayBufferLike>.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
