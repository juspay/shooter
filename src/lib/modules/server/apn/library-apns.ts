import type {
  ApnsDeliveryOutcome,
  APNsFanOutResult,
  APNsSendResult,
  AppEnv,
  DeviceRecord,
  NotificationPayload,
} from '$lib/types';

import { env } from '$env/dynamic/private';
import { execFile, execFileSync } from 'child_process';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';

import { toErrorMessage } from '../utils/error';
import { summarizeApnsFanOut } from './apns-classify.js';
import { fitApnsPayload } from './apns-payload.js';

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
// Cap concurrent curl processes during fan-out so a large device list cannot
// exhaust file descriptors (EMFILE).
const MAX_APNS_CONCURRENCY = 20;

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

    return this.deliver(deviceToken, this.buildAlertBody(payload), 'alert', '10');
  }

  /**
   * Send a SILENT (content-available) background push to wake a backgrounded app without
   * showing an alert — used to wake the phone-resident agent loop so it can run a burst.
   * Uses apns-push-type:background + apns-priority:5 (required by APNs for silent pushes).
   * iOS throttles these (a few per hour); delivery is best-effort.
   */
  async sendSilentNotification(
    deviceToken: string,
    data?: Record<string, unknown>
  ): Promise<APNsSendResult> {
    if (!this.configured) {
      throw new Error('APNs service not configured properly');
    }
    if (!deviceToken) {
      throw new Error('Device token is required');
    }
    const body: Record<string, unknown> = { aps: { 'content-available': 1 } };
    if (data) {
      const { aps: _ignoredAps, ...customData } = data;
      void _ignoredAps;
      Object.assign(body, customData);
    }
    return this.deliver(deviceToken, body, 'background', '5');
  }

  /**
   * Fan out one alert push to many devices concurrently. Fits + serializes the
   * payload once and captures the JWT once (so no call uses a mid-fan-out
   * expired token), then classifies/aggregates results and returns the set of
   * stale tokens for the caller to prune.
   */
  async sendToMany(
    devices: readonly DeviceRecord[],
    payload: NotificationPayload,
    collapseId?: string
  ): Promise<APNsFanOutResult> {
    if (!this.configured) {
      throw new Error('APNs service not configured properly');
    }
    if (devices.length === 0) {
      return { results: [], staleTokens: [], totalFailed: 0, totalSent: 0 };
    }

    const serverAppEnv: AppEnv = this.host === APNS_HOST_PROD ? 'production' : 'sandbox';
    const bodyJson = JSON.stringify(fitApnsPayload(this.buildAlertBody(payload)));
    const jwtToken = this.getJwt();

    const outcomes = await mapLimit(
      devices,
      MAX_APNS_CONCURRENCY,
      async (device): Promise<ApnsDeliveryOutcome> => {
        const res = await this.deliverPreSerialized(
          device.token,
          bodyJson,
          'alert',
          '10',
          jwtToken,
          collapseId
        );
        return {
          appEnv: device.appEnv,
          httpStatus: res.httpStatus ?? 0,
          reason: res.error ?? null,
          registeredAt: device.registeredAt,
          timestampMs: res.timestampMs ?? 0,
          token: device.token,
        };
      }
    );

    return summarizeApnsFanOut(outcomes, serverAppEnv);
  }

  shutdown(): void {
    // No persistent state to release.
  }

  /** Build the APNs `{ aps, ...customData }` body for an alert push. */
  private buildAlertBody(payload: NotificationPayload): Record<string, unknown> {
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
    return body;
  }

  /**
   * Shared curl/HTTP-2 delivery. Fits + serializes the body and signs a JWT,
   * then delegates to deliverPreSerialized. `pushType` is 'alert' | 'background'.
   */
  private async deliver(
    deviceToken: string,
    body: Record<string, unknown>,
    pushType: 'alert' | 'background',
    priority: '5' | '10'
  ): Promise<APNsSendResult> {
    // Cap the payload to APNs' size limit. A long agent message in alert.body otherwise blows
    // past ~4 KB → APNs 413 PayloadTooLarge (or curl E2BIG), so the notification never arrives.
    const bodyJson = JSON.stringify(fitApnsPayload(body));
    return this.deliverPreSerialized(deviceToken, bodyJson, pushType, priority, this.getJwt());
  }

  /**
   * Curl/HTTP-2 delivery from a pre-serialized body + pre-captured JWT — the hot
   * path for sendToMany (no per-token fit or JWT sign). Returns httpStatus and,
   * on a 410, the parsed Unregistered timestamp (ms) for the prune guard.
   */
  private async deliverPreSerialized(
    deviceToken: string,
    bodyJson: string,
    pushType: 'alert' | 'background',
    priority: '5' | '10',
    jwtToken: string,
    collapseId?: string
  ): Promise<APNsSendResult> {
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
      `apns-push-type: ${pushType}`,
      '-H',
      `apns-priority: ${priority}`,
      ...(collapseId ? ['-H', `apns-collapse-id: ${collapseId}`] : []),
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
        return { failed: 0, httpStatus: 200, sent: 1, success: true };
      }

      let reason: string = bodyText;
      let timestampMs: number | undefined;
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as { reason?: unknown; timestamp?: unknown };
          if (typeof obj.reason === 'string') {
            reason = obj.reason;
          }
          if (typeof obj.timestamp === 'number') {
            // APNs returns ms for 410; tolerate seconds defensively.
            timestampMs = obj.timestamp < 1e12 ? obj.timestamp * 1000 : obj.timestamp;
          }
        }
      } catch {
        // raw body
      }
      console.error(`[apns] Delivery failed (status=${status}): ${reason}`);
      return { error: reason, failed: 1, httpStatus: status, sent: 0, success: false, timestampMs };
    } catch (err) {
      // A failed execFile echoes the whole curl command — which carries the APNs JWT and the
      // device token. Redact both before logging or returning so they don't leak into logs/responses.
      const msg = toErrorMessage(err)
        .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer [REDACTED]')
        .replace(/device\/[A-Fa-f0-9]+/g, 'device/[REDACTED]');
      console.error(`[apns] curl transport error: ${msg}`);
      return { error: msg, failed: 1, httpStatus: 0, sent: 0, success: false };
    }
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

/** Inline bounded-concurrency map (no dependency). Preserves input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx]);
    }
  };
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export default LibraryAPNsService;
