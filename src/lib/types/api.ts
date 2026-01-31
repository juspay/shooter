/**
 * API and Service Types
 * Comprehensive type definitions for API endpoints, services, and data contracts
 */

// Core API response structure
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T | undefined;
  error?: APIError | undefined;
  message?: string | undefined;
  timestamp: string;
  requestId: string;
  version: string;
}

export interface APIError {
  code: string;
  message: string;
  details?: string | undefined;
  field?: string | undefined;
  timestamp: string;
  requestId: string;
  stack?: string | undefined; // Only in development
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// HTTP method types
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

// API endpoint configuration
export interface APIEndpoint {
  path: string;
  method: HTTPMethod;
  auth: boolean;
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  validation?: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
  };
  cache?: {
    ttl: number;
    key?: string;
  };
}

// Request/Response types for specific endpoints
export interface NotificationAPIRequest {
  title: string;
  body?: string; // Notification body/content
  message?: string; // Alias for body
  messageId?: string; // APNs internal message ID
  category?: string;
  priority?: 'low' | 'normal' | 'medium' | 'high' | 'urgent';
  data?: Record<string, unknown>;
  deviceTokens?: string[];
  userId?: string | undefined; // Target user ID for device lookup
  scheduled?: string; // ISO date string
}

export interface NotificationPayloadData {
  deviceToken?: string;
  priority?: string | number;
  category?: string;
  badge?: number;
  sound?: string;
  [key: string]: unknown;
}

export interface NotificationAPIResponse {
  notificationId: string;
  messageId?: string; // APNs message ID
  success?: boolean; // Overall success status
  sent: number;
  failed: number;
  filtered: number;
  total?: number; // Total devices targeted (legacy)
  totalDevices?: number; // Total devices targeted
  successCount?: number; // Successful sends (alias for sent)
  failedCount?: number; // Failed sends (alias for failed)
  error?: string; // Error message if any
  timestamp?: string | undefined; // ISO timestamp of the response
  data?: NotificationPayloadData; // Notification payload data
  details: {
    deviceToken: string;
    status: 'sent' | 'failed' | 'filtered';
    error?: string;
  }[];
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    apns: ServiceHealth;
    websocket: ServiceHealth;
  };
  metrics: {
    requestsPerSecond: number;
    errorRate: number;
    averageResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  error?: string;
}

// WebSocket API types
export interface WebSocketAPIMessage {
  type: WebSocketAPIMessageType;
  id: string;
  timestamp: string;
  data: unknown;
  metadata?: {
    userId?: string;
    sessionId?: string;
    deviceId?: string;
  };
}

export type WebSocketAPIMessageType = 
  | 'auth'
  | 'subscribe'
  | 'unsubscribe'
  | 'message'
  | 'notification'
  | 'status_update'
  | 'ping'
  | 'pong'
  | 'error'
  | 'disconnect';

export interface WebSocketSubscription {
  channel: string;
  filters?: Record<string, string | number | boolean>;
  authenticated: boolean;
}

// Service configuration types
export interface APIServiceConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  maxRetryDelay: number;
  headers: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
  };
  interceptors?: {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export type RequestInterceptor = (_config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor = (_response: APIResponse) => APIResponse | Promise<APIResponse>;

export interface RequestConfig {
  url: string;
  method: HTTPMethod;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
  timeout?: number | undefined;
  retries?: number | undefined;
  retryDelay?: number | undefined;
  cache?: boolean | undefined;
  cacheTtl?: number | undefined;
  metadata?: Record<string, unknown>;
}

// Request options for method-specific calls (url and method are provided by the method)
export type RequestOptions = Omit<Partial<RequestConfig>, 'url' | 'method'>;

// APNs service types
export interface APNsServiceConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production: boolean;
  concurrency: number;
  maxConnections: number;
  requestTimeout: number;
}

export interface APNsNotificationPayload {
  aps: {
    alert?: string | {
      title?: string;
      subtitle?: string;
      body?: string;
    };
    badge?: number;
    sound?: string;
    'content-available'?: 1;
    'mutable-content'?: 1;
    category?: string;
    'thread-id'?: string;
    'target-content-id'?: string;
    'interruption-level'?: 'passive' | 'active' | 'time-sensitive' | 'critical';
    'relevance-score'?: number;
  };
  [key: string]: unknown;
}

export interface APNsNotificationOptions {
  topic?: string;
  id?: string;
  expiration?: number;
  priority?: 1 | 5 | 10;
  collapseId?: string;
  pushType?: 'alert' | 'background' | 'location' | 'voip' | 'complication' | 'fileprovider' | 'mdm';
}

export interface APNsDeliveryResult {
  deviceToken: string;
  success: boolean;
  status?: number;
  error?: string;
  timestamp: string;
  retryable: boolean;
}

// Database service types
export interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize: number;
  connectionTimeout: number;
  queryTimeout: number;
  retries: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  fields: QueryField[];
  command: string;
  duration: number;
}

export interface QueryField {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
  readOnly?: boolean;
}

// Cache service types
export interface CacheConfig {
  type: 'redis' | 'memory' | 'file';
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  ttl: number;
  maxSize: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'ttl';
  compression: boolean;
  serialization: 'json' | 'msgpack' | 'none';
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  accessedAt: number;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  evictions: number;
  averageAccessTime: number;
}

// Monitoring and metrics types
export interface MetricsConfig {
  enabled: boolean;
  interval: number;
  retention: number;
  aggregation: {
    enabled: boolean;
    windowSize: number;
    functions: ('avg' | 'sum' | 'min' | 'max' | 'count')[];
  };
  exporters: MetricsExporter[];
}

export interface MetricsExporter {
  type: 'prometheus' | 'statsd' | 'datadog' | 'cloudwatch';
  endpoint?: string;
  apiKey?: string;
  tags?: Record<string, string>;
  interval?: number;
}

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  labels: Record<string, string>;
  timestamp: number;
  unit?: string;
}

export interface MetricsSnapshot {
  timestamp: number;
  metrics: Metric[];
  aggregated: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

// Authentication service types for APIs
export interface APIAuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  bcryptRounds: number;
  sessionTimeout: number;
  maxConcurrentSessions: number;
  rateLimiting: {
    loginAttempts: number;
    lockoutDuration: number;
    resetAttempts: number;
  };
}

export interface JWTClaims {
  sub: string; // user id
  iat: number; // issued at
  exp: number; // expires at
  aud: string; // audience
  iss: string; // issuer
  jti: string; // JWT id
  scope: string[];
  permissions: string[];
  sessionId: string;
}

export interface APIKeyConfig {
  length: number;
  prefix: string;
  algorithm: 'sha256' | 'sha512';
  encoding: 'hex' | 'base64';
  expiration: number; // days
  permissions: string[];
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipFailedRequests: boolean;
  skipSuccessfulRequests: boolean;
  keyGenerator?: (_request: unknown) => string;
  handler?: (_request: unknown, _response: unknown) => void;
  store?: 'memory' | 'redis';
}

// File upload and storage types
export interface FileUploadConfig {
  maxFileSize: number; // bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  uploadPath: string;
  storageType: 'local' | 's3' | 'gcs' | 'azure';
  cloudConfig?: {
    bucket?: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
  };
  imageProcessing?: {
    enabled: boolean;
    formats: string[];
    sizes: { width: number; height: number; name: string }[];
    quality: number;
  };
}

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    checksum: string;
    uploadedBy: string;
    uploadedAt: string;
  };
}

// Email service types
export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'ses' | 'mailgun';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  apiKey?: string;
  region?: string;
  fromEmail: string;
  fromName: string;
  templates: {
    path: string;
    engine: 'handlebars' | 'mustache' | 'ejs';
  };
  rateLimiting: {
    maxPerHour: number;
    maxPerDay: number;
  };
}

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  templateData?: Record<string, string | number | boolean>;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  contentDisposition?: 'attachment' | 'inline';
  cid?: string;
}

export interface EmailDeliveryResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response: string;
  timestamp: string;
}

// Analytics and tracking types
export interface AnalyticsConfig {
  enabled: boolean;
  providers: AnalyticsProvider[];
  sampling: {
    rate: number;
    rules: SamplingRule[];
  };
  privacy: {
    anonymizeIPs: boolean;
    respectDoNotTrack: boolean;
    cookieConsent: boolean;
  };
}

export interface AnalyticsProvider {
  type: 'google-analytics' | 'mixpanel' | 'amplitude' | 'segment';
  apiKey: string;
  config?: Record<string, string | number | boolean>;
}

export interface SamplingRule {
  condition: string;
  rate: number;
}

export interface AnalyticsEvent {
  name: string;
  properties: Record<string, string | number | boolean>;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  context: {
    ip?: string;
    userAgent?: string;
    referrer?: string;
    page?: string;
  };
}

// Service interfaces
export interface APIService {
  // HTTP methods
  get<T>(_url: string, _config?: Partial<RequestConfig>): Promise<APIResponse<T>>;
  post<T>(_url: string, _data?: unknown, _config?: Partial<RequestConfig>): Promise<APIResponse<T>>;
  put<T>(_url: string, _data?: unknown, _config?: Partial<RequestConfig>): Promise<APIResponse<T>>;
  delete<T>(_url: string, _config?: Partial<RequestConfig>): Promise<APIResponse<T>>;
  patch<T>(_url: string, _data?: unknown, _config?: Partial<RequestConfig>): Promise<APIResponse<T>>;

  // Configuration
  setConfig(_config: Partial<APIServiceConfig>): void;
  getConfig(): APIServiceConfig;
  
  // Interceptors
  addRequestInterceptor(_interceptor: RequestInterceptor): void;
  addResponseInterceptor(_interceptor: ResponseInterceptor): void;
  
  // Health and monitoring
  healthCheck(): Promise<HealthCheckResponse>;
  getMetrics(): Promise<MetricsSnapshot>;
}

export interface CacheService {
  get<T>(_key: string): Promise<T | null>;
  set<T>(_key: string, _value: T, _ttl?: number): Promise<void>;
  delete(_key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(_key: string): Promise<boolean>;
  ttl(_key: string): Promise<number>;
  keys(_pattern?: string): Promise<string[]>;
  stats(): Promise<CacheStats>;
}

// Type guards and utilities
export function isAPIResponse<T>(obj: unknown): obj is APIResponse<T> {
  return typeof obj === 'object' && obj !== null && 'success' in obj && typeof (obj as Record<string, unknown>).success === 'boolean' && 'timestamp' in obj && typeof (obj as Record<string, unknown>).timestamp === 'string';
}

export function isAPIError(obj: unknown): obj is APIError {
  return typeof obj === 'object' && obj !== null && 'code' in obj && typeof (obj as Record<string, unknown>).code === 'string' && 'message' in obj && typeof (obj as Record<string, unknown>).message === 'string';
}

export function isPaginatedResponse<T>(obj: unknown): obj is PaginatedResponse<T> {
  if (!isAPIResponse<T[]>(obj)) {
    return false;
  }
  const record = obj as unknown as Record<string, unknown>;
  return 'pagination' in record &&
         typeof record.pagination === 'object' &&
         record.pagination !== null &&
         'page' in record.pagination &&
         typeof (record.pagination as Record<string, unknown>).page === 'number';
}

// Utility functions
export function createAPIResponse<T>(
  data?: T, 
  success: boolean = true, 
  error?: APIError,
  message?: string
): APIResponse<T> {
  return {
    success,
    data,
    error,
    message,
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
    version: '1.0.0'
  };
}

export function createAPIError(
  code: string, 
  message: string, 
  details?: string, 
  field?: string
): APIError {
  return {
    code,
    message,
    details,
    field,
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID()
  };
}

export function formatEndpoint(endpoint: string, params: Record<string, string>): string {
  let formatted = endpoint;
  for (const [key, value] of Object.entries(params)) {
    formatted = formatted.replace(`:${key}`, encodeURIComponent(value));
  }
  return formatted;
}

export function buildQueryString(params: Record<string, string | number | boolean | (string | number | boolean)[] | null | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, String(item)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  }

  return searchParams.toString();
}

export function getHTTPStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return statusTexts[status] || 'Unknown Status';
}

export function isRetryableError(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

export function calculateRetryDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5);
  return Math.min(jitteredDelay, maxDelay);
}

// Webhook and Debug response types
export interface WebhookResponse {
  success: boolean;
  message?: string;
  timestamp: string;
  data?: unknown;
}

export interface DebugSimpleResponse {
  success: boolean;
  message: string;
  timestamp: string;
  nodeEnv?: string;
  vercelEnv?: string;
  hasApiKey?: boolean;
  hasApnsKeyId?: boolean;
  hasApnsTeamId?: boolean;
  hasApnsKey?: boolean;
  hasDeviceToken?: boolean;
}

export interface DebugEnvVariable {
  key?: string;
  value?: string | undefined;
  isSet?: boolean;
  isSensitive?: boolean;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  exists?: boolean;
  length?: number;
  preview?: string | null;
  hasNewlines?: boolean;
  startsWithSpace?: boolean;
  endsWithSpace?: boolean;
}

export interface DebugEnvResponse {
  success: boolean;
  environment: string;
  variables: Record<string, DebugEnvVariable> | DebugEnvVariable[];
  timestamp: string;
  summary?: {
    totalEnvVarsSet: number;
    requiredVarsSet: number;
    anyNewlineIssues: boolean;
  };
}

export interface DebugAPNsResponse {
  success: boolean;
  apnsConfig: {
    hasKeyId: boolean;
    hasTeamId: boolean;
    hasPrivateKey: boolean;
    hasBundleId: boolean;
    keyIdLength?: number;
    teamIdLength?: number;
    bundleId?: string;
  };
  isConfigured?: boolean;
  configError?: string;
  timestamp: string;
}

// Storage and service types
export interface StorageEngine {
  get<T>(_key: string): Promise<T | null>;
  set<T>(_key: string, _value: T, _ttl?: number): Promise<void>;
  delete(_key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(_key: string): Promise<boolean>;
  keys(_pattern?: string): Promise<string[]>;
}

export interface WebSocketService {
  connect(_url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(_message: WebSocketAPIMessage): Promise<void>;
  subscribe(_channel: string): Promise<void>;
  unsubscribe(_channel: string): Promise<void>;
  on(_event: string, _handler: (_data: unknown) => void): void;
  off(_event: string, _handler: (_data: unknown) => void): void;
}

export interface ConnectionStatus {
  connected: boolean;
  lastConnected?: string;
  lastDisconnected?: string;
  reconnectAttempts: number;
  latency?: number;
}