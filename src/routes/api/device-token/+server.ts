import type { AppEnv } from '$lib/types';

import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { toDeviceListItem } from '$lib/modules/server/push/device-format';
import { deviceTokenStore } from '$lib/modules/server/push/device-token-store';
import { shooterDataDir } from '$lib/modules/server/utils/shooter-home';
import { json } from '@sveltejs/kit';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { RequestHandler } from './$types';

const TOKENS_DIR = shooterDataDir();
const TOKENS_FILE = join(TOKENS_DIR, 'device-tokens.json');

function readTokens(): { android?: string; ios?: string } {
  try {
    if (existsSync(TOKENS_FILE)) {
      const parsed: unknown = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
      // Guard against valid-but-wrong JSON (null, array, number, string)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed as { android?: string; ios?: string };
    }
  } catch {
    // Corrupt file -- start fresh
  }
  return {};
}

function resolveAppEnv(requested: unknown): AppEnv {
  if (requested === 'production' || requested === 'sandbox') {
    return requested;
  }
  // Old apps omit appEnv → match the server's configured APNs gateway.
  return env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox';
}

function writeTokens(tokens: { android?: string; ios?: string }): void {
  if (!existsSync(TOKENS_DIR)) {
    mkdirSync(TOKENS_DIR, { mode: 0o700, recursive: true });
  }
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });
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
  const deviceId = body.deviceId?.trim() || null;
  const friendlyName = body.deviceName?.trim() || null;
  const bundleId = body.bundleId?.trim() || null;
  const appEnv = resolveAppEnv(body.appEnv);

  // Register in the multi-device SQLite registry (one row per device).
  const record = deviceTokenStore.upsert({
    appEnv,
    bundleId,
    deviceId,
    friendlyName,
    platform,
    token,
  });

  // Dual-write the legacy ~/.shooter/device-tokens.json during the transition.
  // /api/notify still reads it (and env.DEVICE_TOKEN) until the PR-5 fan-out
  // cutover; keeping both in sync means there is no regression window.
  const tokens = readTokens();
  tokens[platform] = token;
  writeTokens(tokens);

  // Update in-memory env so APNs can use it immediately (iOS is the primary APNs target).
  // SvelteKit's $env/dynamic/private exposes a Proxy whose getter reads process.env at
  // access time but whose setter does NOT propagate to process.env. Assigning via the
  // Proxy is a silent no-op, so subsequent /api/notify calls still read the stale value
  // from .env. Write straight to process.env so env.DEVICE_TOKEN picks up the new token
  // on the next read.
  if (platform === 'ios') {
    process.env.DEVICE_TOKEN = token;
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
