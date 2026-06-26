/**
 * Pure orchestration helpers for the /api/notify multi-device fan-out (PR 5).
 *
 * Separated from the route so the platform-selection and result-combination
 * logic is unit-testable; the route wires these to the registry, the APNs/FCM
 * services, and pruning.
 */

import type { APNsFanOutResult, FCMFanOutResult, NotifyDeliverySummary } from '$lib/types';

/**
 * DEVICE_PLATFORM is a delivery FILTER, not a binary switch. Unset (or an
 * unrecognized value) fans out to BOTH platforms — the new multi-device default.
 */
export function selectPlatforms(platformFilter: string | undefined): {
  doAndroid: boolean;
  doIos: boolean;
} {
  if (platformFilter === 'ios') {
    return { doAndroid: false, doIos: true };
  }
  if (platformFilter === 'android') {
    return { doAndroid: true, doIos: false };
  }
  return { doAndroid: true, doIos: true };
}

export function summarizeNotifyDelivery(
  apns: APNsFanOutResult,
  fcm: FCMFanOutResult
): NotifyDeliverySummary {
  const sent = apns.totalSent + fcm.successCount;
  const failed = apns.totalFailed + fcm.failureCount;
  const staleTokens = [...apns.staleTokens, ...fcm.staleTokens];
  const succeededTokens = [
    ...apns.results.filter((r) => r.success).map((r) => r.token),
    ...fcm.results.filter((r) => r.success).map((r) => r.token),
  ];
  return { delivered: sent > 0, failed, sent, staleTokens, succeededTokens };
}
