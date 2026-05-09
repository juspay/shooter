import type { APNsSendResult, NotificationPayload } from '$lib/types';

import { env } from '$env/dynamic/private';
import { execFile, execFileSync } from 'child_process';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';

import { toErrorMessage } from '../utils/error';

// APNs delivery via curl. Replaces @parse/node-apn (which times out on Node 24
// regardless of version: 7.1.0, 8.1.0, both reproduce). Node's native http2 +
// TLS clients also fail to connect to api.push.apple.com / api.sandbox.push.apple.com
// while curl, openssl s_client, and nc all succeed — strongly Apple-specific TLS
// quirk in Node. curl uses libnghttp2 + system TLS and connects in ~1s.

const execFileAsync = promisify(execFile);

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';
const JWT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_SECONDS = 15;

export class LibraryAPNsService {
  private bundleId: string | undefined;
  private cachedJwt: null | string = null;
  private cachedJwtAt = 0;
  private configured = false;
  private host = '';
  private keyId: string | undefined;
  private privateKey: string | undefined;
  private teamId: string | undefined;

  constructor() {
    this.keyId = env.APNS_KEY_ID;
    this.teamId = env.APNS_TEAM_ID;
    this.bundleId = env.APNS_BUNDLE_ID;
    this.privateKey = env.APNS_KEY;

    if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
      console.error(
        '[apns] Missing required configuration (APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, or APNS_KEY)'
      );
      this.configured = false;
      return;
    }

    const production = env.APNS_PRODUCTION === 'true';
    this.host = production ? APNS_HOST_PROD : APNS_HOST_SANDBOX;

    // Verify curl is available before declaring the service ready. Without this
    // probe, isConfigured() flips true on a host missing curl and every send
    // fails with ENOENT at runtime instead of at startup.
    try {
      execFileSync('curl', ['--version'], { stdio: 'ignore' });
    } catch (error) {
      console.error(
        '[apns] curl binary not found — install curl to enable APNs delivery:',
        toErrorMessage(error)
      );
      this.configured = false;
      return;
    }

    try {
      this.getJwt();
      this.configured = true;
      console.log(
        `[apns] Provider initialized (${production ? 'production' : 'sandbox'} mode, curl transport)`
      );
    } catch (error) {
      console.error('[apns] Failed to initialize:', toErrorMessage(error));
      this.configured = false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsSendResult> {
    if (!this.configured) {
      throw new Error('APNs service not configured properly');
    }
    if (!deviceToken || !payload) {
      throw new Error('Device token and payload are required');
    }

    const aps: Record<string, unknown> = {
      alert: {
        body: payload.body ?? payload.message ?? '',
        title: payload.title,
        ...(payload.subtitle ? { subtitle: payload.subtitle } : {}),
      },
      badge: payload.badge ?? 1,
      sound: payload.sound ?? 'default',
    };
    if (payload.category) {
      aps.category = payload.category;
    }

    const body: Record<string, unknown> = { aps };
    if (payload.data) {
      // Drop any caller-supplied `aps` so it can't replace the alert envelope
      // we just built (would otherwise produce silent or malformed pushes).
      const { aps: _ignoredAps, ...customData } = payload.data;
      void _ignoredAps;
      Object.assign(body, customData);
    }
    const bodyJson = JSON.stringify(body);
    const jwtToken = this.getJwt();
    const url = `https://${this.host}/3/device/${deviceToken}`;

    const args = [
      '-sS',
      '--http2',
      '--max-time',
      String(REQUEST_TIMEOUT_SECONDS),
      '-X',
      'POST',
      '-H',
      'content-type: application/json',
      '-H',
      `apns-topic: ${this.bundleId}`,
      '-H',
      `authorization: bearer ${jwtToken}`,
      '-H',
      'apns-push-type: alert',
      '-H',
      'apns-priority: 10',
      '-d',
      bodyJson,
      '-w',
      '\n__SHOOTER_HTTP_STATUS__:%{http_code}\n',
      url,
    ];

    try {
      const { stdout } = await execFileAsync('curl', args, {
        maxBuffer: 1024 * 1024,
        timeout: (REQUEST_TIMEOUT_SECONDS + 5) * 1000,
      });

      const statusMatch = /__SHOOTER_HTTP_STATUS__:(\d+)/.exec(stdout);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      const bodyText = stdout.replace(/\n?__SHOOTER_HTTP_STATUS__:\d+\n?$/, '').trim();

      if (status === 200) {
        // Intentionally omit `details` here — including the raw 64-char
        // device token would leak it through API responses and downstream
        // logs, undercutting the redaction we do in the notifier.
        return { failed: 0, sent: 1, success: true };
      }

      let reason: string = bodyText;
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (
          parsed &&
          typeof parsed === 'object' &&
          'reason' in parsed &&
          typeof (parsed as { reason: unknown }).reason === 'string'
        ) {
          reason = (parsed as { reason: string }).reason;
        }
      } catch {
        // raw body
      }
      console.error(`[apns] Delivery failed (status=${status}): ${reason}`);
      return { error: reason, failed: 1, sent: 0, success: false };
    } catch (err) {
      const msg = toErrorMessage(err);
      console.error(`[apns] curl transport error: ${msg}`);
      return { error: msg, failed: 1, sent: 0, success: false };
    }
  }

  shutdown(): void {
    // No persistent state to release.
  }

  private getJwt(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedJwtAt < JWT_REFRESH_INTERVAL_MS) {
      return this.cachedJwt;
    }
    if (!this.privateKey || !this.keyId || !this.teamId) {
      throw new Error('APNs credentials missing');
    }
    const token = jwt.sign({ iat: Math.floor(now / 1000), iss: this.teamId }, this.privateKey, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: this.keyId },
    });
    this.cachedJwt = token;
    this.cachedJwtAt = now;
    return token;
  }
}

export default LibraryAPNsService;
