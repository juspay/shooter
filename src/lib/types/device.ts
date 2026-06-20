// Device registry types for multi-device push notification fan-out.
//
// Hand-written (not generated from specs/types/api.yaml) because the
// type-crafter generator currently truncates generated/API.ts before these
// types, and because the fan-out result shapes are richer than the flat
// interfaces YAML can express. Mirrors the pattern in decision.ts.
//
// NOTE: deliberately free of Node built-in imports (e.g. `crypto`) so the
// $lib/types barrel stays safe to import from client bundles. Row-id
// generation lives in the server-only DeviceTokenStore via crypto.randomUUID().

/** One device's raw APNs delivery outcome, before aggregation (PR 3 fan-out). */
export interface ApnsDeliveryOutcome {
  appEnv: AppEnv;
  httpStatus: number;
  reason: null | string;
  registeredAt: string;
  timestampMs: number;
  token: string;
}
/** Aggregate APNs fan-out result across all iOS tokens (PR 3). */
export interface APNsFanOutResult {
  results: APNsTokenResult[];
  staleTokens: string[];
  totalFailed: number;
  totalSent: number;
}

/** Outcome of classifying a single APNs delivery result for pruning. */
export type ApnsTokenDisposition = 'sent' | 'stale_token' | 'transient_error';

/** Per-token APNs delivery result (PR 3 fan-out). */
export interface APNsTokenResult {
  disposition: ApnsTokenDisposition;
  httpStatus: number;
  reason: null | string;
  success: boolean;
  timestampMs: number;
  token: string;
}

export type AppEnv = 'production' | 'sandbox';

/**
 * A registered device as exposed by GET /api/device-token. The raw push token
 * is replaced by a masked form so the registered-devices UI/logs never carry a
 * full token.
 */
export interface DeviceListItem {
  appEnv: AppEnv;
  deviceId: null | string;
  failureCount: number;
  friendlyName: null | string;
  id: string;
  isActive: boolean;
  lastSeenAt: string;
  platform: DevicePlatform;
  registeredAt: string;
  tokenMasked: string;
}

export type DevicePlatform = 'android' | 'ios';

/** One registered push device. Mirrors a `device_tokens` row (camelCased). */
export interface DeviceRecord {
  appEnv: AppEnv;
  bundleId: null | string;
  deviceId: null | string;
  failureCount: number;
  friendlyName: null | string;
  id: string;
  isActive: boolean;
  lastSeenAt: string;
  platform: DevicePlatform;
  registeredAt: string;
  token: string;
}

/** Fields accepted by DeviceTokenStore.upsert(); server fills the rest. */
export interface DeviceUpsertInput {
  appEnv?: AppEnv;
  bundleId?: null | string;
  deviceId?: null | string;
  friendlyName?: null | string;
  platform: DevicePlatform;
  token: string;
}

/** One device's raw FCM delivery outcome, before aggregation (PR 4 fan-out). */
export interface FcmDeliveryOutcome {
  errorCode: null | string;
  messageId: null | string;
  success: boolean;
  token: string;
}

/** Aggregate FCM fan-out result across all Android tokens (PR 4). */
export interface FCMFanOutResult {
  failureCount: number;
  results: FCMTokenResult[];
  staleTokens: string[];
  successCount: number;
}

/** Per-token FCM delivery result (PR 4 fan-out). */
export interface FCMTokenResult {
  error: null | string;
  messageId: null | string;
  success: boolean;
  token: string;
}

/** Shape returned by POST /api/notify after multi-device fan-out (PR 5). */
export interface MultiDeviceNotifyResult {
  failed: number;
  pruned: number;
  requestId: string;
  sent: number;
  success: boolean;
  timestamp: string;
}

/** Consecutive delivery failures before a token is considered dead. */
export const MAX_FAILURE_COUNT = 3;

/** Runtime guard for a DeviceRecord coming from an untrusted boundary. */
export function isDeviceRecord(v: unknown): v is DeviceRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.token === 'string' &&
    (r.platform === 'ios' || r.platform === 'android') &&
    (r.appEnv === 'sandbox' || r.appEnv === 'production') &&
    typeof r.registeredAt === 'string' &&
    typeof r.lastSeenAt === 'string' &&
    typeof r.isActive === 'boolean' &&
    typeof r.failureCount === 'number'
  );
}
