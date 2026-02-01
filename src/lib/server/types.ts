// APNs Type Definitions

export interface APNsError {
  device: string;
  response?: APNsErrorResponse;
  status?: number;
}

export interface APNsErrorData {
  [key: string]: unknown;
  reason?: string;
}

export interface APNsErrorResponse {
  [key: string]: unknown;
  reason?: string;
}

export interface APNsLibraryResult {
  failed?: {
    device: string;
    response?: APNsErrorResponse;
    status?: number;
  }[];
  sent?: { [key: string]: unknown; device: string; }[];
}

export interface APNsNotificationResult {
  apnsId?: string;
  details?: APNsSentDetail[];
  error?: APNsErrorData | string;
  errorData?: APNsErrorData;
  errors?: APNsError[];
  failed: number;
  headers?: Record<string, string>;
  response?: APNsRawResponse;
  responseBody?: string;
  sent: number;
  status?: number;
  statusCode?: number;
  success: boolean;
}

export interface APNsProviderOptions {
  production: boolean;
  token: {
    key: string;
    keyId: string;
    teamId: string;
  };
}

export interface APNsRawResponse {
  apnsId?: string;
  data: APNsErrorData | null;
  headers: Record<string, string>;
  statusCode: number;
  success: boolean;
}

export interface APNsSentDetail {
  [key: string]: unknown;
  'apns-unique-id'?: string;
  device?: string;
  status?: string;
}

export interface JWTHeader {
  alg: string;
  kid: string;
}

export interface JWTPayload {
  exp?: number;
  iat: number;
  iss: string;
}

export interface NotificationPayload {
  badge?: number;
  body?: string;
  data?: Record<string, unknown>;
  message?: string;
  sound?: string;
  title: string;
}
