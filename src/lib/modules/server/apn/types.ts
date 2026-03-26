import type {
  Error as APNsError,
  ErrorData,
  LibraryFailedItem,
  LibrarySentItem,
  RawResponse,
  SentDetail,
} from '$generated/types';

// Composite types built from generated primitives. These use arrays and
// union constructs that type-crafter does not emit, so they stay as local
// definitions.

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

export type {
  APNsError as Error,
  ErrorData,
  LibraryFailedItem,
  LibrarySentItem,
  RawResponse,
  SentDetail,
};
