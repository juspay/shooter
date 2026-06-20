import type { AppEnv } from '$lib/types';

import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { toDeviceListItem } from '$lib/modules/server/push/device-format';
import {
  deviceTokenStore,
  MAX_BUNDLE_ID_LENGTH,
  MAX_DEVICE_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TOKEN_LENGTH,
} from '$lib/modules/server/push/device-token-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

function resolveAppEnv(requested: unknown): AppEnv {
  if (requested === 'production' || requested === 'sandbox') {
    return requested;
  }
  // Old apps omit appEnv → match the server's configured APNs gateway.
  return env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
}

/** List all registered devices (masked tokens) plus per-platform counts. */
export const GET: RequestHandler = ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const ios = deviceTokenStore.listActive('ios');
  const android = deviceTokenStore.listActive('android');
  const devices = [...ios, ...android].map(toDeviceListItem);

  return json({
    counts: { android: android.length, ios: ios.length, total: devices.length },
    devices,
  });
};

/** Remove a registered device by its registry row id. */
export const DELETE: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { id?: unknown }).id
      : undefined;
  if (typeof id !== 'string' || id.trim().length === 0) {
    return json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const removed = deviceTokenStore.deleteById(id.trim());
  if (removed === 0) {
    // Unknown id or already-removed device → 404 so a caller checking only the
    // HTTP status can tell "already gone" apart from a real deletion.
    return json({ error: 'Device not found or already removed', id: id.trim() }, { status: 404 });
  }

  // Registry is the single source of truth post-cutover (/api/notify reads it
  // directly), so removing the row fully stops delivery — no legacy sink to sync.
  return json({ removed, success: true });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: {
    appEnv?: string;
    bundleId?: string;
    deviceId?: string;
    deviceName?: string;
    deviceToken?: string;
    platform: string;
    token?: string;
  };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Invalid JSON body: expected an object' }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const platform = body.platform;
  if (!platform || (platform !== 'ios' && platform !== 'android')) {
    return json(
      { error: 'Missing or invalid platform (must be "ios" or "android")' },
      { status: 400 }
    );
  }

  // iOS sends "deviceToken", Android sends "token"
  const rawToken = body.deviceToken || body.token;
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return json({ error: 'Missing device token (deviceToken or token)' }, { status: 400 });
  }
  const token = rawToken.trim();
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() || null : null;
  const friendlyName = typeof body.deviceName === 'string' ? body.deviceName.trim() || null : null;
  const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || null : null;

  // Reject oversized fields up front with a clean 400 (the store enforces the
  // same caps defensively). Limits are generous vs. real values, so no
  // legitimate client is affected; they bound per-row storage from bad input.
  const tooLong =
    token.length > MAX_TOKEN_LENGTH
      ? 'token'
      : deviceId && deviceId.length > MAX_DEVICE_ID_LENGTH
        ? 'deviceId'
        : friendlyName && friendlyName.length > MAX_NAME_LENGTH
          ? 'deviceName'
          : bundleId && bundleId.length > MAX_BUNDLE_ID_LENGTH
            ? 'bundleId'
            : null;
  if (tooLong) {
    return json({ error: `Field "${tooLong}" exceeds maximum allowed length` }, { status: 400 });
  }

  const appEnv = resolveAppEnv(body.appEnv);

  // Register in the multi-device SQLite registry (one row per device). This is
  // now the single source of truth — /api/notify reads it directly, so there is
  // no longer a legacy JSON dual-write or a process.env.DEVICE_TOKEN mutation.
  const record = deviceTokenStore.upsert({
    appEnv,
    bundleId,
    deviceId,
    friendlyName,
    platform,
    token,
  });

  // The store's anti-theft guard intentionally no-ops when the token is held by
  // a different device, returning that device's row unchanged. If the row we got
  // back isn't this caller's (its deviceId differs from the requested one — incl.
  // a legacy null-deviceId caller hitting a token owned by a deviceId'd device),
  // surface a 409 instead of leaking the other device's metadata as a misleading
  // success.
  if (record.deviceId !== deviceId) {
    return json(
      { error: 'Token is already registered to a different active device' },
      { status: 409 }
    );
  }

  console.log(
    `[device-token] Registered ${platform} device ${record.id} (token len ${token.length})`
  );

  return json({
    deviceId: record.deviceId,
    id: record.id,
    platform,
    success: true,
    timestamp: new Date().toISOString(),
  });
};
