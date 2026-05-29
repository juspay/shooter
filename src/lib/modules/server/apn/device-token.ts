import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Read the device token persisted by `/api/device-token` (written automatically
 * when the Android or iOS app registers on first launch) from
 * `~/.shooter/device-tokens.json`.
 *
 * @param platform - Which platform's token to read (`'android'` | `'ios'`).
 * @returns The persisted token, or `undefined` if the file is missing, corrupt,
 *   or has no token for that platform.
 */
export function readPersistedDeviceToken(platform: 'android' | 'ios'): string | undefined {
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

/**
 * Resolve which device token to use, in precedence order: explicit request
 * token, then the token the app persisted on launch (`device-tokens.json`),
 * then the env fallback.
 *
 * Persisted beats env on purpose: `env.DEVICE_TOKEN` reverts to the (often
 * stale) `.env` value on every server restart, whereas the persisted token is
 * the freshest value the device actually registered. Env-first let a stale
 * `.env` shadow the live token → `BadDeviceToken` until a manual re-register.
 *
 * @param requestToken - Token from the request body (highest precedence).
 * @param persistedToken - Token read from `device-tokens.json` (see {@link readPersistedDeviceToken}).
 * @param envToken - Token from the environment (lowest precedence).
 * @returns The first non-empty token after trimming, or `undefined` if none.
 */
export function resolveDeviceToken(
  requestToken: string | undefined,
  persistedToken: string | undefined,
  envToken: string | undefined
): string | undefined {
  return normalize(requestToken) ?? normalize(persistedToken) ?? normalize(envToken);
}
