/**
 * Type guard for ShooterConfig objects stored in localStorage.
 *
 * The stricter variant (used on the config page) validates that apiKey
 * and deviceToken are strings. The simpler variant only checks key
 * presence. This implementation uses the stricter check so all
 * consumers benefit from the extra safety.
 */

import type { ShooterConfig } from '$lib/types/config';

export function isShooterConfig(value: unknown): value is ShooterConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.apiKey === 'string' && typeof obj.deviceToken === 'string';
}
