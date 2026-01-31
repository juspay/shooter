/**
 * Data Services Types
 * Type definitions for data-service.ts and state-service.ts
 */

// ============================================================================
// Conversation and Message Types
// ============================================================================

export type ConversationData = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  status: ConversationStatus;
  metadata?: ConversationMetadata;
  messages: MessageData[];
};

export type ConversationStatus = 'active' | 'archived' | 'deleted';

export type ConversationMetadata = {
  tags?: string[];
  participants?: string[];
  project?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
};

export type MessageData = {
  id: string;
  conversationId: string;
  content: string;
  role: MessageRole;
  timestamp: number;
  status: MessageStatus;
  metadata?: MessageMetadata;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled';

export type MessageMetadata = {
  tokens?: number;
  model?: string;
  tool?: string;
  duration?: number;
  error?: string;
  hasCode?: boolean;
  contentType?: 'text' | 'code' | 'error' | 'question' | 'command';
};

// ============================================================================
// Notification Session Types
// ============================================================================

export type NotificationSessionData = {
  id: string;
  deviceToken: string;
  startTime: number;
  endTime?: number;
  notificationCount: number;
  status: SessionStatus;
  metadata?: SessionMetadata;
};

export type SessionStatus = 'active' | 'expired' | 'terminated';

export type SessionMetadata = {
  device?: DeviceInfo;
  location?: LocationInfo;
  userAgent?: string;
};

export type DeviceInfo = {
  model?: string;
  os?: string;
  osVersion?: string;
  appVersion?: string;
};

export type LocationInfo = {
  country?: string;
  region?: string;
  timezone?: string;
};

// ============================================================================
// Data Service Request/Response Types
// ============================================================================

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  cache?: boolean;
};

export type DataServiceResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: DataServiceError;
  metadata?: ResponseMetadata;
};

export type DataServiceError = {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
};

export type ResponseMetadata = {
  requestId?: string;
  duration?: number;
  cached?: boolean;
  timestamp: number;
};

// ============================================================================
// Analytics and Metrics Types
// ============================================================================

export type AnalyticsMetrics = {
  conversations: ConversationMetrics;
  notifications: NotificationMetrics;
  system: SystemHealthMetrics;
};

export type ConversationMetrics = {
  total: number;
  active: number;
  archived: number;
  averageMessages: number;
  totalMessages: number;
};

export type NotificationMetrics = {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  successRate: number;
};

export type SystemHealthMetrics = {
  uptime: number;
  memoryUsage: MemoryUsage;
  cpuUsage: number;
  requestsPerMinute: number;
  errorRate: number;
  averageResponseTime: number;
};

export type MemoryUsage = {
  used: number;
  total: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  percentage: number;
};

// ============================================================================
// Export/Import Types
// ============================================================================

export type ExportFormat = 'json' | 'csv' | 'xml';

export type ExportOptions = {
  format: ExportFormat;
  includeMetadata?: boolean;
  dateRange?: DateRange;
  filters?: ExportFilters;
};

export type DateRange = {
  start: number;
  end: number;
};

export type ExportFilters = {
  conversationIds?: string[];
  statuses?: ConversationStatus[];
  categories?: string[];
};

export type ExportedData = {
  version: string;
  exportedAt: number;
  format: ExportFormat;
  data: {
    conversations?: ConversationData[];
    notifications?: NotificationSessionData[];
    metrics?: AnalyticsMetrics;
  };
  metadata: ExportMetadata;
};

export type ExportMetadata = {
  totalRecords: number;
  dateRange?: DateRange;
  filters?: ExportFilters;
  compressed?: boolean;
};

// ============================================================================
// Debug Types
// ============================================================================

export type DebugInfo = {
  environment: EnvironmentInfo;
  configuration: ConfigurationInfo;
  connections: ConnectionInfo[];
  logs: LogEntry[];
};

export type EnvironmentInfo = {
  nodeVersion: string;
  platform: string;
  arch: string;
  env: 'development' | 'staging' | 'production';
};

export type ConfigurationInfo = {
  apnsEnabled: boolean;
  websocketEnabled: boolean;
  redisEnabled: boolean;
  databaseEnabled: boolean;
  debugMode: boolean;
};

export type ConnectionInfo = {
  name: string;
  type: 'websocket' | 'database' | 'redis' | 'apns';
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: number;
  metadata?: Record<string, unknown>;
};

export type LogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: ErrorInfo;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ErrorInfo = {
  message: string;
  stack?: string;
  code?: string;
  cause?: string;
};

// ============================================================================
// State Service Types (AppState)
// ============================================================================

export type AppState = {
  // UI State
  theme: ThemeMode;
  sidebarOpen: boolean;
  mobileNavOpen: boolean;

  // Data State
  selectedConversationId: string | null;
  conversations: ConversationData[];
  notifications: NotificationSessionData[];

  // Connection State
  websocketConnected: boolean;
  apiConnected: boolean;

  // User State
  userId: string | null;
  preferences: UserPreferences;

  // Loading State
  loading: LoadingState;

  // Error State
  errors: AppErrorState[];
};

export type ThemeMode = 'light' | 'dark' | 'system';

export type UserPreferences = {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  autoArchive: boolean;
  defaultView: 'conversations' | 'notifications' | 'analytics';
  displayDensity: 'compact' | 'comfortable' | 'spacious';
};

export type LoadingState = {
  conversations: boolean;
  notifications: boolean;
  analytics: boolean;
  global: boolean;
};

export type AppErrorState = {
  id: string;
  message: string;
  code: string;
  timestamp: number;
  dismissed: boolean;
  context?: Record<string, unknown>;
};

// ============================================================================
// State Service Actions
// ============================================================================

export type StateUpdater<T = AppState> = (_current: T) => T;

export type StateSubscriber<T = AppState> = (_state: T) => void;

export type StateUnsubscriber = () => void;

// ============================================================================
// Type Guards
// ============================================================================

export function isConversationData(value: unknown): value is ConversationData {
  const v = value as ConversationData;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.messageCount === 'number' &&
    ['active', 'archived', 'deleted'].includes(v.status)
  );
}

export function isMessageData(value: unknown): value is MessageData {
  const v = value as MessageData;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    typeof v.conversationId === 'string' &&
    typeof v.content === 'string' &&
    ['user', 'assistant', 'system'].includes(v.role) &&
    typeof v.timestamp === 'number'
  );
}

export function isDataServiceResponse<T>(value: unknown): value is DataServiceResponse<T> {
  const v = value as DataServiceResponse<T>;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.success === 'boolean'
  );
}
