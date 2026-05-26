import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RequestHandler } from './$types';

const TOKENS_DIR = join(homedir(), '.shooter');
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

function writeTokens(tokens: { android?: string; ios?: string }): void {
  if (!existsSync(TOKENS_DIR)) {
    mkdirSync(TOKENS_DIR, { mode: 0o700, recursive: true });
  }
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let body: { bundleId?: string; deviceToken?: string; platform: string; token?: string };
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

  // Persist to ~/.shooter/device-tokens.json
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

  console.log(`[device-token] Registered ${platform} token (length: ${token.length})`);

  return json({
    platform,
    success: true,
    timestamp: new Date().toISOString(),
  });
};
