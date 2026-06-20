/**
 * Pure FCM stale-token classification, multicast chunking, and fan-out
 * aggregation. Kept separate from fcm-service.ts (which pulls in firebase-admin
 * and needs credentials) so the prune decision is unit-testable in isolation.
 *
 * Rule (plan §8): ONLY `messaging/registration-token-not-registered` is a dead
 * token. `messaging/invalid-argument` is explicitly NOT prunable — it usually
 * signals a payload format bug affecting the whole batch, and pruning on it
 * would silently wipe out every Android device.
 */

import type { FcmDeliveryOutcome, FCMFanOutResult } from '$lib/types';

const PRUNABLE_FCM_CODES: ReadonlySet<string> = new Set([
  'messaging/registration-token-not-registered',
]);

/** Split into groups of at most `size`, preserving order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    // `i += size` would never advance — guard the public API against a hang.
    throw new RangeError('chunk size must be >= 1');
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function classifyFcmError(code: null | string): 'keep' | 'prune' {
  return code && PRUNABLE_FCM_CODES.has(code) ? 'prune' : 'keep';
}

export function summarizeFcmFanOut(outcomes: readonly FcmDeliveryOutcome[]): FCMFanOutResult {
  const results: FCMFanOutResult['results'] = [];
  const staleTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const o of outcomes) {
    if (o.success) {
      successCount += 1;
    } else {
      failureCount += 1;
      if (classifyFcmError(o.errorCode) === 'prune') {
        staleTokens.push(o.token);
      }
    }
    results.push({
      error: o.errorCode,
      messageId: o.messageId,
      success: o.success,
      token: o.token,
    });
  }

  return { failureCount, results, staleTokens, successCount };
}
