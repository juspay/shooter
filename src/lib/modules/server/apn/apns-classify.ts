/**
 * Pure APNs stale-token classification + fan-out aggregation.
 *
 * Kept separate from library-apns.ts (which imports $env/dynamic/private and so
 * can't be loaded in the .cjs/tsx test harness) so this decision logic — the
 * part that decides whether a token is pruned — is unit-testable in isolation.
 *
 * Rules per plan §8. Only definitive dead-token signals prune; anything
 * ambiguous (server config, transient 5xx/429, JWT issues) is kept.
 */

import type {
  ApnsDeliveryOutcome,
  APNsFanOutResult,
  ApnsTokenDisposition,
  AppEnv,
  NotificationTier,
} from '$lib/types';

/** Reasons that mean the token itself is dead, regardless of environment. */
const UNCONDITIONAL_STALE_REASONS: ReadonlySet<string> = new Set([
  'DeviceTokenNotForTopic', // token belongs to a different bundle id
  'Unregistered', // 410 — guarded by the re-registration timestamp check below
]);

/**
 * Classify one APNs delivery response into an INITIAL sent / stale-token /
 * transient-error disposition. NOTE: for 410 `Unregistered` this returns
 * `stale_token` as an intermediate result — callers must still apply the
 * re-registration timestamp guard in `summarizeApnsFanOut` before pruning.
 */
export function classifyApnsReason(
  httpStatus: number,
  reason: null | string,
  storedAppEnv: AppEnv,
  serverAppEnv: AppEnv
): ApnsTokenDisposition {
  if (httpStatus === 200) {
    return 'sent';
  }
  if (reason === 'TopicDisallowed') {
    // Push disabled for the whole bundle at the Apple Developer account level
    // (revoked entitlement, billing lapse) — a server-config error, NOT a dead
    // device. Keep the token so a temporary misconfig doesn't wipe the registry.
    return 'transient_error';
  }
  if (reason === 'BadDeviceToken') {
    // A sandbox token sent to the production gateway (or vice versa) returns
    // BadDeviceToken even though the token is valid on its own gateway. Only
    // prune when the environments agree — otherwise it is our config, not a
    // dead device.
    return storedAppEnv === serverAppEnv ? 'stale_token' : 'transient_error';
  }
  if (reason && UNCONDITIONAL_STALE_REASONS.has(reason)) {
    return 'stale_token';
  }
  return 'transient_error';
}

/** Aggregate fan-out outcomes into totals and the stale-token list, applying the 410 re-registration guard. */
export function summarizeApnsFanOut(
  outcomes: readonly ApnsDeliveryOutcome[],
  serverAppEnv: AppEnv
): APNsFanOutResult {
  const results: APNsFanOutResult['results'] = [];
  const staleTokens: string[] = [];
  let totalSent = 0;
  let totalFailed = 0;

  for (const o of outcomes) {
    let disposition = classifyApnsReason(o.httpStatus, o.reason, o.appEnv, serverAppEnv);

    // 410 timestamp guard: APNs reports the instant it recorded the device as
    // unregistered. If the device re-registered after that instant, the token
    // is live again — keep it.
    if (disposition === 'stale_token' && o.reason === 'Unregistered' && o.timestampMs > 0) {
      const registeredMs = Date.parse(o.registeredAt);
      if (!Number.isNaN(registeredMs) && registeredMs > o.timestampMs) {
        disposition = 'transient_error';
      }
    }

    const success = o.httpStatus === 200;
    if (success) {
      totalSent += 1;
    } else {
      totalFailed += 1;
    }
    if (disposition === 'stale_token') {
      staleTokens.push(o.token);
    }

    results.push({
      disposition,
      httpStatus: o.httpStatus,
      reason: o.reason,
      success,
      timestampMs: o.timestampMs,
      token: o.token,
    });
  }

  return { results, staleTokens, totalFailed, totalSent };
}

const DECISION_CATEGORIES: ReadonlySet<string> = new Set(['permission', 'question']);
const STATUS_CATEGORIES: ReadonlySet<string> = new Set(['idle_input', 'intervention']);

/**
 * Single source of truth for how a notification category is delivered:
 *  - decision → push immediately (permission / question — the user must act)
 *  - status   → coalesce per-project (idle_input / intervention)
 *  - drop     → never push (redundant or informational; in-app feed only)
 *
 * `permission_notification` is intentionally NOT status — it is redundant with
 * the blocking `permission` push, so it drops.
 */
export function classifyNotificationTier(category: string | undefined): NotificationTier {
  if (category && DECISION_CATEGORIES.has(category)) {
    return 'decision';
  }
  if (category && STATUS_CATEGORIES.has(category)) {
    return 'status';
  }
  return 'drop';
}
