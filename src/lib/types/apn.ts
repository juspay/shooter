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
