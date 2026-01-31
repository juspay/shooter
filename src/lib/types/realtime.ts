/**
 * Realtime System Types
 * Type definitions for WebSocket, APNs integration, and real-time event handling
 */

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessagePayload =
  | NotificationEventPayload
  | StatusUpdatePayload
  | MetricsUpdatePayload
  | GenericPayload;

export type NotificationEventPayload = {
  type: 'notification_sent' | 'notification_failed' | 'notification_delivered';
  messageId: string;
  deviceToken?: string;
  timestamp: number;
  success: boolean;
  error?: string;
};

export type StatusUpdatePayload = {
  type: 'apns_status_change' | 'connection_status_change';
  status: 'connected' | 'disconnected' | 'error' | 'reconnecting';
  metrics?: ApnsMetrics;
  timestamp: number;
};

export type MetricsUpdatePayload = {
  type: 'metrics_update';
  metrics: ApnsMetrics | SystemMetrics;
  timestamp: number;
};

export type GenericPayload = {
  type: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

// ============================================================================
// APNs Integration Types
// ============================================================================

export type ApnsMetrics = {
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
  averageLatency: number;
  lastSent?: number;
  lastFailed?: number;
};

export type SystemMetrics = {
  cpu: {
    usage: number;
    loadAverage?: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    requests: number;
    responseTime: number;
    errors: number;
  };
};

export type ApnsHealthStatus = {
  configured: boolean;
  connected: boolean;
  lastCheck: number;
  metrics: ApnsMetrics;
  errors: ApnsError[];
};

export type ApnsError = {
  timestamp: number;
  message: string;
  code: string;
  recoverable: boolean;
};

// ============================================================================
// Shooter Event Types
// ============================================================================

export type ShooterEventType =
  | 'tool_execution'
  | 'session_start'
  | 'session_end'
  | 'error'
  | 'file_change'
  | 'user_prompt';

export type ShooterEventData = {
  type: ShooterEventType;
  context: EventContext;
  metadata: EventMetadata;
};

export type EventContext = {
  sessionId: string;
  projectPath?: string;
  tool?: ToolExecutionContext;
  file?: FileChangeContext;
  error?: ErrorContext;
};

export type ToolExecutionContext = {
  toolName: string;
  duration: number;
  result?: string;
  success: boolean;
};

export type FileChangeContext = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
};

export type ErrorContext = {
  message: string;
  stack?: string;
  code?: string;
};

export type EventMetadata = {
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  version?: string;
};

// ============================================================================
// Real-time Service Configuration
// ============================================================================

export type RealTimeServiceConfig = {
  websocket: WebSocketConfig;
  notifications: NotificationConfig;
  events: EventConfig;
};

export type WebSocketConfig = {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  timeout?: number;
};

export type NotificationConfig = {
  enableApnsIntegration: boolean;
  retryFailedNotifications: boolean;
  maxRetries?: number;
  retryDelay?: number;
  batchSize?: number;
};

export type EventConfig = {
  enableEventBroadcasting?: boolean;
  eventFilters?: string[];
  maxEventHistory?: number;
  persistEvents?: boolean;
};

// ============================================================================
// Real-time Service State
// ============================================================================

export type ConnectionStatus = {
  connected: boolean;
  state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastConnected?: number;
  lastDisconnected?: number;
  reconnectAttempts?: number;
  error?: string;
};

export type RealTimeServiceState = {
  initialized: boolean;
  connection: ConnectionStatus;
  subscriptions: Map<string, EventSubscription>;
  eventHistory: RealTimeEvent[];
  metrics: ServiceMetrics;
};

export type EventSubscription = {
  id: string;
  eventType: string;
  handler: EventHandler;
  created: number;
  callCount: number;
};

export type RealTimeEvent = {
  id: string;
  type: string;
  payload: WebSocketMessagePayload;
  timestamp: number;
  processed: boolean;
};

export type ServiceMetrics = {
  messagesReceived: number;
  messagesSent: number;
  eventsProcessed: number;
  errors: number;
  averageLatency: number;
  uptime: number;
};

// ============================================================================
// Event Handlers
// ============================================================================

export type EventHandler = (_payload: WebSocketMessagePayload) => void | Promise<void>;

export type ShooterEventHandler = {
  handleToolExecution: (_data: ToolExecutionContext) => Promise<void>;
  handleSessionStart: (_data: EventContext) => Promise<void>;
  handleSessionEnd: (_data: EventContext) => Promise<void>;
  handleError: (_data: ErrorContext) => Promise<void>;
  handleFileChange: (_data: FileChangeContext) => Promise<void>;
};

// ============================================================================
// Real-time Service Interface
// ============================================================================

export type RealTimeService = {
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;

  // WebSocket operations
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (_message: WebSocketMessagePayload) => Promise<void>;

  // Event subscriptions
  subscribeToEvents: (_eventType: string, _handler: EventHandler) => string;
  unsubscribeFromEvents: (_subscriptionId: string) => void;

  // Status
  getConnectionStatus: () => ConnectionStatus;
  getMetrics: () => ServiceMetrics;
  isConnected: () => boolean;

  // Event history
  getEventHistory: (_limit?: number) => RealTimeEvent[];
  clearEventHistory: () => void;
};

// ============================================================================
// APNs Integration Service Interface
// ============================================================================

export type ApnsIntegrationService = {
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;

  // Notification handling
  handleNotificationEvent: (_data: NotificationEventPayload) => Promise<void>;
  handleApnsStatusUpdate: (_data: StatusUpdatePayload) => Promise<void>;
  retryFailedNotification: (_messageId: string) => Promise<void>;

  // Health
  getHealthStatus: () => Promise<ApnsHealthStatus>;
  isHealthy: () => boolean;

  // Metrics
  getMetrics: () => ApnsMetrics;
  resetMetrics: () => void;
};

// ============================================================================
// Type Guards
// ============================================================================

export function isNotificationEventPayload(payload: unknown): payload is NotificationEventPayload {
  const p = payload as NotificationEventPayload;
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.type === 'string' &&
    ['notification_sent', 'notification_failed', 'notification_delivered'].includes(p.type) &&
    typeof p.messageId === 'string' &&
    typeof p.timestamp === 'number' &&
    typeof p.success === 'boolean'
  );
}

export function isStatusUpdatePayload(payload: unknown): payload is StatusUpdatePayload {
  const p = payload as StatusUpdatePayload;
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.type === 'string' &&
    ['apns_status_change', 'connection_status_change'].includes(p.type) &&
    typeof p.status === 'string' &&
    typeof p.timestamp === 'number'
  );
}

export function isMetricsUpdatePayload(payload: unknown): payload is MetricsUpdatePayload {
  const p = payload as MetricsUpdatePayload;
  return (
    typeof p === 'object' &&
    p !== null &&
    p.type === 'metrics_update' &&
    typeof p.metrics === 'object' &&
    typeof p.timestamp === 'number'
  );
}

export function isConnectionStatus(status: unknown): status is ConnectionStatus {
  const s = status as ConnectionStatus;
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof s.connected === 'boolean' &&
    typeof s.state === 'string' &&
    ['connecting', 'connected', 'disconnected', 'reconnecting', 'error'].includes(s.state)
  );
}
