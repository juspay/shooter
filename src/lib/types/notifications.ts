/**
 * Notification and Push System Types
 * Comprehensive type definitions for iOS push notifications and real-time messaging
 */

// Core notification types
export interface Notification {
  id: string;
  title: string;
  body: string;
  category?: NotificationCategory | undefined;
  badge?: number | undefined;
  sound?: string | 'default' | 'critical' | undefined;
  contentAvailable?: boolean | undefined;
  mutableContent?: boolean | undefined;
  threadId?: string | undefined;
  targetContentId?: string | undefined;
  interruptionLevel?: 'passive' | 'active' | 'timeSensitive' | 'critical' | undefined;
  relevanceScore?: number | undefined;

  // Metadata
  userId?: string | undefined;
  deviceToken: string;
  createdAt: Date;
  scheduledFor?: Date | undefined;
  expiresAt?: Date | undefined;

  // Tracking
  status: NotificationStatus;
  deliveryAttempts: number;
  lastAttemptAt?: Date | undefined;
  deliveredAt?: Date | undefined;
  failureReason?: string | undefined;

  // Custom data
  customData?: NotificationCustomData | undefined;
  actionData?: NotificationActionData | undefined;
}

export type NotificationStatus = 
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type NotificationCategory = 
  | 'claude_event'
  | 'system_alert'
  | 'user_action'
  | 'debug_info'
  | 'file_change'
  | 'command_result'
  | 'session_event'
  | 'security_alert'
  | 'maintenance'
  | 'reminder';

export interface NotificationActionData {
  actionId?: string;
  confirmationRequired?: boolean;
  inputRequired?: boolean;
  inputPlaceholder?: string;
  responseUrl?: string;
  timeout?: number; // seconds
  retryable?: boolean;
}

/**
 * Custom notification data with known fields
 */
export interface NotificationCustomData {
  eventId?: string;
  eventType?: string;
  source?: string;
  sessionId?: string;
  userId?: string;
  fileChanges?: string[];
  commandOutput?: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

/**
 * Notification event data
 */
export interface NotificationEventData {
  apnsResponse?: string;
  statusCode?: number;
  retryCount?: number;
  deliveryLatency?: number;
  errorMessage?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Real-time event details
 */
export interface RealTimeEventDetails {
  filePath?: string;
  command?: string;
  duration?: number;
  status?: string;
  result?: string;
  errorMessage?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Webhook payload metadata
 */
export interface WebhookMetadata {
  retryCount?: number;
  originalTimestamp?: string;
  deliveryAttempt?: number;
  signature?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Health check details
 */
export interface HealthCheckDetails {
  database?: string;
  redis?: string;
  apns?: string;
  uptime?: number;
  memoryUsage?: number;
  errorCount?: number;
  [key: string]: string | number | boolean | undefined;
}

// APNs payload structure
export interface APNsPayload {
  aps: {
    alert?: APNsAlert | string;
    badge?: number;
    sound?: string | APNsSound;
    'content-available'?: 1;
    'mutable-content'?: 1;
    category?: string;
    'thread-id'?: string;
    'target-content-id'?: string;
    'interruption-level'?: 'passive' | 'active' | 'time-sensitive' | 'critical';
    'relevance-score'?: number;
  };

  // Custom payload data
  [key: string]: unknown;
}

export interface APNsAlert {
  title?: string;
  subtitle?: string;
  body?: string;
  'launch-image'?: string;
  'title-loc-key'?: string;
  'title-loc-args'?: string[];
  'subtitle-loc-key'?: string;
  'subtitle-loc-args'?: string[];
  'loc-key'?: string;
  'loc-args'?: string[];
  'action-loc-key'?: string;
}

export interface APNsSound {
  critical?: 1;
  name?: string;
  volume?: number;
}

// Device and user management
export interface Device {
  id: string;
  userId: string;
  deviceToken?: string; // Can use token alias instead
  token?: string; // Backward compatibility alias for deviceToken
  platform?: 'ios' | 'android' | 'web'; // Optional for tests

  // Device info
  deviceId?: string; // Hardware identifier
  model?: string;
  osVersion?: string;
  appVersion?: string;

  // Registration info
  registeredAt?: number; // Can use registered alias instead
  registered?: number; // Backward compatibility alias for registeredAt
  lastSeenAt?: number; // Can use lastSeen alias instead
  lastSeen?: number; // Backward compatibility alias for lastSeenAt
  isActive?: boolean; // Can use active alias instead
  active?: boolean; // Backward compatibility alias for isActive

  // Preferences
  notificationSettings?: DeviceNotificationSettings;
  
  // Metadata
  metadata?: {
    timezone?: string;
    locale?: string;
    buildNumber?: string;
    installId?: string;
  };
}

export interface DeviceNotificationSettings {
  enabled: boolean;
  categories: {
    [_K in NotificationCategory]?: boolean;
  };
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:mm format
    endTime: string;
    timezone: string;
  };
  sounds: boolean;
  badges: boolean;
  previews: boolean;
  criticalAlertsEnabled: boolean;
}

// Notification history and tracking
export interface NotificationHistory {
  id: string;
  notificationId: string;
  userId: string;
  deviceToken: string;
  
  // Event tracking
  events: NotificationEvent[];
  
  // Analytics
  deliveryLatency?: number; // milliseconds
  userResponse?: NotificationResponse;
  
  // Status
  finalStatus: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationEvent {
  type: NotificationEventType;
  timestamp: Date;
  data?: NotificationEventData;
  error?: string;
}

export type NotificationEventType = 
  | 'created'
  | 'queued'
  | 'sent_to_apns'
  | 'delivered_to_apns'
  | 'received_by_device'
  | 'displayed'
  | 'dismissed'
  | 'tapped'
  | 'action_performed'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface NotificationResponse {
  responseId: string;
  actionId?: string;
  userInput?: string;
  timestamp: Date;
  processingResult?: {
    success: boolean;
    message?: string;
    error?: string;
  };
}

// Real-time event types
export interface RealTimeEvent {
  id: string;
  type: RealTimeEventType;
  source: EventSource;
  timestamp: Date;
  
  // Event data
  title: string;
  description?: string;
  details?: RealTimeEventDetails;
  
  // Routing
  userId?: string;
  sessionId?: string;
  targetDevices?: string[]; // Device tokens
  
  // Notification mapping
  shouldNotify: boolean;
  notificationCategory?: NotificationCategory;
  priority: EventPriority;
  
  // Context
  claudeContext?: ClaudeEventContext;
  systemContext?: SystemEventContext;
}

export type RealTimeEventType = 
  | 'claude_tool_used'
  | 'claude_session_started'
  | 'claude_session_ended'
  | 'claude_error_occurred'
  | 'file_modified'
  | 'command_executed'
  | 'build_completed'
  | 'test_results'
  | 'deployment_status'
  | 'system_health'
  | 'security_event'
  | 'user_activity';

export type EventSource = 
  | 'claude_code'
  | 'file_watcher'
  | 'build_system'
  | 'deployment'
  | 'monitoring'
  | 'security'
  | 'user_interface';

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

export interface ClaudeEventContext {
  toolName?: string;
  filePath?: string;
  command?: string;
  sessionDuration?: number;
  errorType?: string;
  resultSummary?: string;
}

export interface SystemEventContext {
  component?: string;
  healthScore?: number;
  resourceUsage?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
  alertLevel?: 'info' | 'warning' | 'error' | 'critical';
}

// Notification service configuration
export interface NotificationConfig {
  // APNs settings
  apns: {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKey: string; // Base64 encoded .p8 content
    production: boolean;
    requestTimeout: number; // milliseconds
    maxConnections: number;
  };
  
  // Delivery settings
  delivery: {
    maxRetries: number;
    retryDelayMs: number;
    batchSize: number;
    concurrentRequests: number;
    rateLimitPerSecond: number;
  };
  
  // Storage settings
  storage: {
    retentionDays: number;
    cleanupIntervalHours: number;
    maxHistoryPerDevice: number;
  };
  
  // Real-time settings
  realtime: {
    eventBufferSize: number;
    maxEventAge: number; // seconds
    processingIntervalMs: number;
  };
}

// Webhook integration types
export interface WebhookConfig {
  enabled: boolean;
  endpoints: WebhookEndpoint[];
  security: {
    secretKey: string;
    signatureHeader: string;
    timeoutMs: number;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: NotificationEventType[];
  active: boolean;
  headers?: Record<string, string>;
  transformTemplate?: string; // JSON template for payload transformation
}

export interface WebhookPayload {
  id: string;
  timestamp: Date;
  event: NotificationEventType;
  notification: Notification;
  device?: Partial<Device>;
  response?: NotificationResponse;
  metadata?: WebhookMetadata;
}

// Analytics and reporting types
export interface NotificationAnalytics {
  period: {
    start: Date;
    end: Date;
  };
  
  // Delivery metrics
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number; // percentage
  
  // Performance metrics
  averageLatency: number; // milliseconds
  p95Latency: number;
  p99Latency: number;
  
  // Engagement metrics
  openRate: number; // percentage
  actionRate: number; // percentage
  
  // Category breakdown
  categoryStats: {
    [_K in NotificationCategory]?: {
      sent: number;
      delivered: number;
      opened: number;
      failed: number;
    };
  };
  
  // Device platform stats
  platformStats: {
    ios: { sent: number; delivered: number; failed: number };
    android: { sent: number; delivered: number; failed: number };
    web: { sent: number; delivered: number; failed: number };
  };
}

export interface DeviceAnalytics {
  deviceId: string;
  userId: string;
  
  // Activity metrics
  lastActive: Date;
  totalNotificationsReceived: number;
  totalNotificationsOpened: number;
  averageResponseTime: number; // milliseconds
  
  // Preference insights
  mostEngagedCategories: NotificationCategory[];
  optimalDeliveryTime?: {
    hour: number;
    timezone: string;
  };
  
  // Health metrics
  deliverySuccessRate: number; // percentage
  averageLatency: number; // milliseconds
  errorRate: number; // percentage
}

// Service interface types
export interface NotificationService {
  // Core operations
  send(_notification: Omit<Notification, 'id' | 'createdAt' | 'status' | 'deliveryAttempts'>): Promise<Notification>;
  sendBatch(_notifications: Omit<Notification, 'id' | 'createdAt' | 'status' | 'deliveryAttempts'>[]): Promise<Notification[]>;
  
  // Device management
  registerDevice(_device: Omit<Device, 'id' | 'registeredAt' | 'lastSeenAt'>): Promise<Device>;
  updateDevice(_deviceId: string, _updates: Partial<Device>): Promise<Device>;
  deactivateDevice(_deviceId: string): Promise<void>;
  
  // Tracking and history
  getNotificationHistory(_notificationId: string): Promise<NotificationHistory>;
  getDeviceHistory(_deviceId: string, _limit?: number): Promise<NotificationHistory[]>;
  
  // Analytics
  getAnalytics(_period: { start: Date; end: Date }): Promise<NotificationAnalytics>;
  getDeviceAnalytics(_deviceId: string): Promise<DeviceAnalytics>;
  
  // Health and monitoring
  healthCheck(): Promise<{ healthy: boolean; details?: HealthCheckDetails }>;
  getMetrics(): Promise<Record<string, number>>;
}

// Error types
export interface NotificationError {
  code: NotificationErrorCode;
  message: string;
  details?: string;
  retryable: boolean;
  timestamp: Date;
  context?: {
    notificationId?: string;
    deviceToken?: string;
    apnsResponse?: unknown;
  };
}

export type NotificationErrorCode = 
  | 'INVALID_DEVICE_TOKEN'
  | 'DEVICE_TOKEN_NOT_FOR_TOPIC'
  | 'BAD_CERTIFICATE'
  | 'BAD_CERTIFICATE_ENVIRONMENT'
  | 'FORBIDDEN'
  | 'BAD_MESSAGE_ID'
  | 'BAD_EXPIRATION_DATE'
  | 'BAD_PRIORITY'
  | 'MISSING_DEVICE_TOKEN'
  | 'MISSING_TOPIC'
  | 'TOPIC_DISALLOWED'
  | 'UNREGISTERED'
  | 'DEVICE_NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'SHUTDOWN'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR';

// Legacy types for backward compatibility
export interface NotificationPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string;
  data?: NotificationData;
}

export interface NotificationData {
  source?: string;
  category?: string;
  project?: string;
  tool?: string;
  files?: string;
  timestamp?: string;
  requestId?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface APNsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production?: boolean;
}

export interface NotificationResult {
  success: boolean;
  sent?: number;
  failed?: number;
  filtered?: number;
  details?: APNsResponse[];
  requestId: string;
  timestamp: string;
  totalDevices?: number; // Total number of devices targeted
  successCount?: number; // Number of successfully sent notifications
  failedCount?: number; // Number of failed notifications
  total?: number; // Legacy field for backward compatibility
  error?: string; // Error message if applicable
}

export interface APNsResponse {
  device: string;
  'apns-unique-id': string;
  status: string;
  error?: string;
}

export interface APNsResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{
    device: string;
    status: number | undefined;
    response: unknown;
  }>;
}

export interface NotificationSession {
  id: string;
  project: string;
  notificationCount: number;
  lastNotificationTime: Date;
  state: 'idle' | 'active' | 'working' | 'error' | 'rate_limited';
  filteringStats: {
    sent: number;
    filtered: number;
    failed: number;
  };
}

export interface NotificationFilter {
  id: string;
  name: string;
  rule: FilterRule;
  isActive: boolean;
  matchCount: number;
  createdAt: Date;
}

export interface FilterRule {
  pattern: string;
  type: 'title' | 'message' | 'source' | 'category';
  action: 'allow' | 'block';
  reason: string;
}

// Type guards
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotification(obj: any): obj is Notification {
  return obj && typeof obj.id === 'string' && typeof obj.title === 'string' && typeof obj.body === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDevice(obj: any): obj is Device {
  return obj && typeof obj.id === 'string' && typeof obj.deviceToken === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRealTimeEvent(obj: any): obj is RealTimeEvent {
  return obj && typeof obj.id === 'string' && typeof obj.type === 'string' && typeof obj.source === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotificationError(obj: any): obj is NotificationError {
  return obj && typeof obj.code === 'string' && typeof obj.message === 'string';
}

// Utility functions
export function createNotificationFromEvent(event: RealTimeEvent): Omit<Notification, 'id' | 'createdAt' | 'status' | 'deliveryAttempts'> {
  return {
    title: event.title,
    body: event.description || '',
    category: event.notificationCategory,
    deviceToken: '', // Will be set when sending to specific devices
    customData: {
      eventId: event.id,
      eventType: event.type,
      source: event.source,
      ...event.details
    },
    interruptionLevel: event.priority === 'critical' ? 'critical' : 
                       event.priority === 'high' ? 'timeSensitive' : 'active'
  };
}

export function getNotificationPriority(category: NotificationCategory): EventPriority {
  const priorityMap: Record<NotificationCategory, EventPriority> = {
    security_alert: 'critical',
    system_alert: 'high',
    claude_event: 'normal',
    file_change: 'low',
    command_result: 'normal',
    session_event: 'low',
    user_action: 'normal',
    debug_info: 'low',
    maintenance: 'high',
    reminder: 'normal'
  };
  
  return priorityMap[category] || 'normal';
}