/**
 * Presentation helpers for the device registry HTTP surface.
 *
 * `maskToken` keeps a short prefix + suffix and hides the middle so the
 * registered-devices list (and any log of it) never carries a full APNs/FCM
 * push token. `toDeviceListItem` maps an internal DeviceRecord to the masked
 * API shape returned by GET /api/device-token — deliberately dropping the raw
 * `token` field.
 */

import type { DeviceListItem, DeviceRecord } from '$lib/types';

export function maskToken(token: null | string | undefined): string {
  if (!token) {
    return '';
  }
  if (token.length < 8) {
    // Too short to reveal prefix + suffix without the slices overlapping (a
    // 4-char token would be fully exposed) — mask entirely. Real APNs (64) /
    // FCM (~152) tokens never reach this branch.
    return '••••';
  }
  if (token.length <= 10) {
    return `${token.slice(0, 2)}…${token.slice(-2)}`;
  }
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function toDeviceListItem(record: DeviceRecord): DeviceListItem {
  return {
    appEnv: record.appEnv,
    deviceId: record.deviceId,
    failureCount: record.failureCount,
    friendlyName: record.friendlyName,
    id: record.id,
    isActive: record.isActive,
    lastSeenAt: record.lastSeenAt,
    platform: record.platform,
    registeredAt: record.registeredAt,
    tokenMasked: maskToken(record.token),
  };
}
