// Composite APNs types built from generated primitives. These use arrays and
// union constructs that type-crafter does not emit, so they live here rather
// than in the generated barrel.

import type {
  Error as APNsError,
  ErrorData,
  LibraryFailedItem,
  LibrarySentItem,
  RawResponse,
  SentDetail,
} from './generated';

// Result shape returned by LibraryAPNsService.sendNotification — kept narrow
// because callers (notify endpoint) treat it as a small success/error summary.
export interface APNsSendResult {
  details?: unknown[];
  error?: string;
  failed: number;
  /** APNs HTTP status (200, 400, 410, …); 0 on a transport error. */
  httpStatus?: number;
  sent: number;
  success: boolean;
  /** Parsed `timestamp` from a 410 Unregistered body, in ms (for the prune guard). */
  timestampMs?: number;
}

export interface LibraryResult {
  failed: LibraryFailedItem[];
  sent: LibrarySentItem[];
}

/** A detected burst: many notifications to one project in a short window. */
export interface NotificationBurst {
  count: number;
  project: string;
  windowSec: number;
}

/** Delivery health within a stats window. */
export interface NotificationDeliveryStats {
  byStatus: Record<string, number>;
  failed: number;
  sent: number;
}

/** How a notification event was ultimately handled. */
export type NotificationDisposition =
  | 'coalesced'
  | 'dropped'
  | 'failed'
  | 'filtered'
  | 'sent'
  | 'skipped';

/** One notification event to persist for telemetry. */
export interface NotificationEventInput {
  category?: null | string;
  detail?: null | string;
  deviceCount?: number;
  disposition: NotificationDisposition;
  failed?: number;
  id: string;
  project?: null | string;
  reason?: null | string;
  sent?: number;
  sessionId?: null | string;
  tier: NotificationTier;
  title?: null | string;
  ts?: number;
}

/** A persisted notification-event row. */
export interface NotificationEventRow {
  category: null | string;
  detail: null | string;
  deviceCount: number;
  disposition: string;
  failed: number;
  id: string;
  project: null | string;
  reason: null | string;
  sent: number;
  sessionId: null | string;
  tier: string;
  title: null | string;
  ts: number;
}

export interface NotificationPayload {
  badge: null | number;
  body: null | string;
  category?: null | string;
  data: null | Record<string, unknown>;
  message: null | string;
  sound: null | string;
  subtitle?: null | string;
  title: string;
}

export interface NotificationResult {
  apnsId: null | string;
  details: null | SentDetail[];
  error: ErrorData | null | string;
  errorData: ErrorData | null;
  errors: APNsError[] | null;
  failed: number;
  headers: null | Record<string, unknown>;
  response: null | RawResponse;
  responseBody: null | string;
  sent: number;
  status: null | number;
  statusCode: null | number;
  success: boolean;
}

/** Aggregated notification telemetry over a time window. */
export interface NotificationStats {
  bursts: NotificationBurst[];
  byCategory: Record<string, number>;
  byDisposition: Record<string, number>;
  byProject: Record<string, number>;
  byTier: Record<string, number>;
  delivery: NotificationDeliveryStats;
  total: number;
  windowMs: number;
}

/** The GET /api/notify/stats response: aggregated stats + recent rows. */
export interface NotificationStatsResponse extends NotificationStats {
  recent: NotificationEventRow[];
  since: number;
}

/** How a push category should reach the phone (delivery tier). */
export type NotificationTier = 'decision' | 'drop' | 'status';

/** Per-project coalescer handle: buffers status items and flushes one rollup. */
export interface StatusCoalescer {
  enqueue: (project: string, item: StatusItem) => void;
}

/** One buffered status-tier notification awaiting per-project coalescing. */
export interface StatusItem {
  body: string;
  category: string;
  title: string;
}

/** The rolled-up title + body a coalesced status flush delivers. */
export interface StatusSummary {
  body: string;
  title: string;
}
