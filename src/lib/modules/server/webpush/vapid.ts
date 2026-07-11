/**
 * VAPID key resolution for Web Push.
 *
 * Keys come from the environment (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT) when set. Otherwise a pair is generated once and persisted to
 * `~/.shooter/vapid.json`, so browser push works out-of-the-box with zero
 * config and the same keys survive restarts (a rotated public key would
 * invalidate every existing subscription).
 */

import type { VapidKeys } from '$lib/types';

import * as fs from 'fs';
import * as path from 'path';
import webpush from 'web-push';

import { shooterDataDir } from '../utils/shooter-home.js';

let cached: null | VapidKeys = null;

/** Resolve VAPID keys: env first, then a persisted pair, generating one if needed. */
export function getVapidKeys(): VapidKeys {
  if (cached) {
    return cached;
  }

  const subject = (process.env.VAPID_SUBJECT || '').trim() || 'mailto:shooter@localhost';
  const envPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (envPublic && envPrivate) {
    cached = { privateKey: envPrivate, publicKey: envPublic, subject };
    return cached;
  }

  const file = path.join(shooterDataDir(), 'vapid.json');
  const persisted = readPersisted(file);
  if (persisted) {
    cached = { ...persisted, subject };
    return cached;
  }

  const generated = webpush.generateVAPIDKeys();
  const keys: VapidKeys = {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    subject,
  };
  writePersisted(file, keys);
  cached = keys;
  return keys;
}

/** Reset the in-process cache (tests only). */
export function resetVapidCache(): void {
  cached = null;
}

function readPersisted(file: string): null | Pick<VapidKeys, 'privateKey' | 'publicKey'> {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.publicKey === 'string' && typeof obj.privateKey === 'string') {
      return { privateKey: obj.privateKey, publicKey: obj.publicKey };
    }
    return null;
  } catch {
    return null;
  }
}

function writePersisted(file: string, keys: VapidKeys): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ privateKey: keys.privateKey, publicKey: keys.publicKey }, null, 2),
      { mode: 0o600 }
    );
  } catch (err) {
    console.warn('[vapid] failed to persist keys:', err);
  }
}
