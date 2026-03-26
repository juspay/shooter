/**
 * Type guard for ShooterConfig objects stored in localStorage.
 *
 * Validates that the required apiKey field is a non-empty string.
 * All other fields (deviceToken, serverUrl, lastUpdated) are nullable
 * in the generated ShooterConfig type, so any parsed object with a
 * valid apiKey is treated as a full ShooterConfig (missing nullable
 * fields default to null at runtime).
 */

import type { ShooterConfig } from '$lib/types/config';

export function isShooterConfig(value: unknown): value is ShooterConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.apiKey !== 'string' || obj.apiKey.length === 0) {
    return false;
  }
  // Validate nullable fields are string | null | undefined (reject numbers, booleans, etc.)
  if (
    obj.deviceToken !== undefined &&
    obj.deviceToken !== null &&
    typeof obj.deviceToken !== 'string'
  ) {
    return false;
  }
  if (obj.serverUrl !== undefined && obj.serverUrl !== null && typeof obj.serverUrl !== 'string') {
    return false;
  }
  if (
    obj.lastUpdated !== undefined &&
    obj.lastUpdated !== null &&
    typeof obj.lastUpdated !== 'string'
  ) {
    return false;
  }
  // Normalize nullable fields so the value satisfies ShooterConfig at runtime
  if (obj.deviceToken === undefined) {
    obj.deviceToken = null;
  }
  if (obj.serverUrl === undefined) {
    obj.serverUrl = null;
  }
  if (obj.lastUpdated === undefined) {
    obj.lastUpdated = null;
  }
  return true;
}
