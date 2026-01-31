/**
 * Centralized Type System - Master Index
 * Re-exports all type definitions for easy importing throughout the application
 * 
 * Usage:
 * import { User, Notification, ClaudeWebSocketMessage } from '$types';
 * import type { APIResponse, StorageEngine } from '$types';
 */

// Authentication and User Management Types
export * from './auth';
export type {
  User,
  UserRole,
  UserPermissions,
  Session,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  AuthValidationResult,
  AuthError,
  AuthErrorCode,
  AuthConfig,
  AuthStore,
  AuthActions,
  JWTPayload,
  TokenValidation,
  AuthEvent,
  AuthEventType,
  AuthMiddlewareOptions
} from './auth';

// Notification and Push System Types
export * from './notifications';
export type {
  Notification,
  NotificationStatus,
  NotificationCategory,
  APNsPayload,
  APNsAlert,
  APNsSound,
  Device,
  DeviceNotificationSettings,
  NotificationHistory,
  NotificationEvent,
  NotificationEventType,
  NotificationResponse,
  RealTimeEventType,
  EventSource,
  EventPriority,
  ClaudeEventContext,
  SystemEventContext,
  NotificationConfig,
  WebhookConfig,
  WebhookEndpoint,
  WebhookPayload,
  NotificationAnalytics,
  DeviceAnalytics,
  NotificationService,
  NotificationError,
  NotificationErrorCode,
  // Legacy types for backward compatibility
  NotificationPayload,
  NotificationData,
  APNsConfig,
  NotificationResult,
  APNsResponse,
  APNsResult,
  NotificationSession,
  NotificationFilter,
  FilterRule
} from './notifications';

// Claude Code Integration Types
export * from './claude';
export type {
  WebSocketService,
  ClaudeWebSocketMessage,
  WebSocketMessageType,
  WebSocketConnectionState,
  WebSocketError,
  WebSocketEventHandler,
  DataService,
  DataFetchOptions,
  DataStreamOptions,
  DataResponse,
  DataSubscription,
  DataEventHandler,
  DataEventMetadata,
  DataCache,
  DataServiceMetrics,
  DataServiceHealth,
  ClaudeConversation,
  ClaudeMessage,
  MessageType,
  MessageDeliveryStatus,
  ClaudeToolCall,
  ToolCallStatus,
  MessageAttachment,
  ConversationSidebarProps,
  ConversationFilters,
  ChatViewProps,
  StatusFooterProps,
  StatusNotification,
  NotificationBubbleProps,
  DeliveryStatusProps,
  ClaudeIntegrationConfig,
  TemplateExtractionResult,
  ExtractedComponent,
  ComponentProp,
  ComponentEvent,
  ComponentSlot,
  ExtractedStyles,
  ExtractedScripts,
  ExtractedAsset,
  TemplateError,
  TemplateMetadata,
  CompatibilityReport
} from './claude';

// API and Service Types
export * from './api';
export type {
  APIResponse,
  APIError,
  PaginatedResponse,
  HTTPMethod,
  APIEndpoint,
  NotificationAPIRequest,
  NotificationAPIResponse,
  HealthCheckResponse,
  ServiceHealth,
  WebSocketAPIMessage,
  WebSocketAPIMessageType,
  WebSocketSubscription,
  APIServiceConfig,
  RequestInterceptor,
  ResponseInterceptor,
  RequestConfig,
  APNsServiceConfig,
  APNsNotificationPayload,
  APNsNotificationOptions,
  APNsDeliveryResult,
  DatabaseConfig,
  QueryResult,
  QueryField,
  TransactionOptions,
  CacheConfig,
  CacheEntry,
  CacheStats,
  MetricsConfig,
  MetricsExporter,
  Metric,
  MetricsSnapshot,
  APIAuthConfig,
  JWTClaims,
  APIKeyConfig,
  RateLimitConfig,
  FileUploadConfig,
  UploadedFile,
  EmailConfig,
  EmailMessage,
  EmailAttachment,
  EmailDeliveryResult,
  AnalyticsConfig,
  AnalyticsProvider,
  SamplingRule,
  AnalyticsEvent,
  APIService,
  CacheService
} from './api';

// UI Component and Theme Types
export * from './ui';
export type {
  BaseComponentProps,
  ThemeConfig,
  ColorPalette,
  ColorScale,
  Typography,
  Spacing,
  Breakpoints,
  Shadows,
  Borders,
  Transitions,
  ZIndexScale,
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  ButtonColor,
  InputProps,
  InputType,
  InputSize,
  InputVariant,
  InputState,
  CardProps,
  CardVariant,
  CardPadding,
  CardShadow,
  ModalProps,
  ModalSize,
  ModalPlacement,
  ModalBackdrop,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
  ToastProps,
  ToastType,
  ToastPosition,
  ToastAction,
  LoadingSpinnerProps,
  LoadingSize,
  SkeletonProps,
  SkeletonVariant,
  SkeletonAnimation,
  FormFieldProps,
  FormValidation,
  FormFieldState,
  FormState,
  ContainerProps,
  ContainerMaxWidth,
  ContainerPadding,
  FlexProps,
  FlexDirection,
  FlexWrap,
  FlexJustify,
  FlexAlign,
  FlexGap,
  GridProps,
  GridColumns,
  GridRows,
  GridGap,
  NavbarProps,
  NavbarVariant,
  NavbarPosition,
  SidebarProps,
  SidebarVariant,
  SidebarSize,
  SidebarPosition,
  TableProps,
  TableVariant,
  TableSize,
  TableColumn,
  TableData,
  TablePagination,
  TableSorting,
  TableFiltering,
  ResponsiveValue,
  ViewportSize,
  AnimationConfig,
  TransitionConfig,
  IconProps,
  IconSize,
  IconVariant,
  IconFlip,
  IconRotate,
  ImageProps,
  AccessibilityProps,
  ComponentState,
  InteractionState
} from './ui';

// Storage and Data Management Types
export * from './storage';
export type {
  StorageEngine,
  StorageSetOptions,
  StorageStats,
  StorageHealth,
  StorageConfig,
  StorageEngineType,
  StorageConnectionConfig,
  StorageOptions,
  StorageSerializer,
  CompressionConfig,
  EvictionPolicy,
  ConsistencyLevel,
  ReplicationConfig,
  LayeredStorage,
  StorageLayer,
  StorageCapabilities,
  FallbackStrategy,
  DocumentStorage,
  Query,
  QueryWhere,
  QueryCondition,
  QuerySort,
  Pagination,
  PageResult,
  IndexOptions,
  IndexInfo,
  BlobStorage,
  BlobPutOptions,
  BlobData,
  BlobInfo,
  BlobListOptions,
  BlobEncryption,
  BlobACL,
  BlobPermission,
  BlobStorageUsage,
  Transaction,
  TransactionStatus,
  TransactionOperation,
  TransactionInfo,
  IsolationLevel,
  StorageObserver,
  StorageEvent,
  StorageEventData,
  StorageEventHandler,
  StorageWatchHandler,
  StorageWatcher,
  StorageMigration,
  MigrationRunner,
  MigrationResult,
  MigrationRecord,
  MigrationError,
  ValidationResult,
  MigrationPlan,
  StorageBackup,
  BackupOptions,
  BackupInfo,
  RestoreOptions,
  BackupEncryption,
  BackupFilters,
  ExportResult,
  ImportResult,
  ImportError,
  ExportData,
  ImportData,
  ImportOptions
} from './storage';

// Re-export utility functions and type guards
export {
  // Auth utilities
  isUser,
  isSession,
  isAuthError,
  hasPermission,
  hasRole,
  hasAnyRole
} from './auth';

export {
  // Notification utilities
  isNotification,
  isDevice,
  isRealTimeEvent,
  isNotificationError,
  createNotificationFromEvent,
  getNotificationPriority
} from './notifications';

export {
  // Claude integration utilities
  isClaudeConversation,
  isClaudeMessage,
  isClaudeWebSocketMessage,
  isDataResponse,
  createClaudeWebSocketMessage,
  formatConversationTitle,
  getMessagePreview,
  calculateMessageTokens,
  getConnectionStatusColor,
  isMessageDelivered,
  isMessageRead,
  getToolCallDuration
} from './claude';

export {
  // API utilities
  isAPIResponse,
  isAPIError,
  isPaginatedResponse,
  createAPIResponse,
  createAPIError,
  formatEndpoint,
  buildQueryString,
  getHTTPStatusText,
  isRetryableError,
  calculateRetryDelay
} from './api';

export {
  // UI utilities
  isResponsiveValue,
  isValidColorScale,
  getResponsiveValue,
  combineClassNames,
  createThemeVariables,
  generateComponentClasses,
  getContrastColor,
  parseSize
} from './ui';

export {
  // Storage utilities
  isStorageEngine,
  isDocumentStorage,
  isBlobStorage,
  isTransaction,
  createStorageKey,
  parseStorageKey,
  calculateStorageSize,
  createExpirationDate,
  isExpired,
  sanitizeKey,
  generateStorageId,
  compressValue,
  decompressValue,
  createChecksum
} from './storage';

export {
  // Realtime utilities
  isNotificationEventPayload,
  isStatusUpdatePayload,
  isMetricsUpdatePayload,
  isConnectionStatus
} from './realtime';

export {
  // Data services utilities
  isConversationData,
  isMessageData,
  isDataServiceResponse
} from './data-services';

// Realtime System Types
export * from './realtime';
export type {
  WebSocketMessagePayload,
  NotificationEventPayload,
  StatusUpdatePayload,
  MetricsUpdatePayload,
  GenericPayload,
  ApnsMetrics,
  SystemMetrics,
  ApnsHealthStatus,
  ApnsError,
  ShooterEventType,
  ShooterEventData,
  EventContext,
  ToolExecutionContext,
  FileChangeContext,
  ErrorContext,
  EventMetadata,
  RealTimeServiceConfig,
  WebSocketConfig,
  NotificationConfig as RealtimeNotificationConfig,
  EventConfig,
  ConnectionStatus,
  RealTimeServiceState,
  EventSubscription,
  RealTimeEvent,
  ServiceMetrics,
  EventHandler,
  ShooterEventHandler,
  RealTimeService,
  ApnsIntegrationService
} from './realtime';

// Data Services Types
export * from './data-services';
export type {
  ConversationData,
  ConversationStatus,
  ConversationMetadata,
  MessageData,
  MessageRole,
  MessageStatus,
  MessageMetadata,
  NotificationSessionData,
  SessionStatus,
  SessionMetadata,
  DeviceInfo,
  LocationInfo,
  RequestOptions,
  DataServiceResponse,
  DataServiceError,
  ResponseMetadata,
  AnalyticsMetrics,
  ConversationMetrics,
  NotificationMetrics,
  SystemHealthMetrics,
  MemoryUsage,
  ExportFormat,
  ExportOptions,
  DateRange,
  ExportFilters,
  ExportedData,
  ExportMetadata,
  DebugInfo,
  EnvironmentInfo,
  ConfigurationInfo,
  ConnectionInfo,
  LogEntry,
  LogLevel,
  ErrorInfo,
  AppState,
  ThemeMode,
  UserPreferences,
  LoadingState,
  AppErrorState,
  StateUpdater,
  StateSubscriber,
  StateUnsubscriber
} from './data-services';

// Generic utility types
export type ID = string;
export type Timestamp = Date | string | number;
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

// Generic response wrapper
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Generic event handler types
export type GenericEventHandler<T = unknown> = (_data: T) => void;
export type GenericAsyncEventHandler<T = unknown> = (_data: T) => Promise<void>;

// Generic configuration types
export type Config<T = Record<string, unknown>> = T & {
  version?: string;
  environment?: 'development' | 'staging' | 'production';
  debug?: boolean;
};

// Generic service interface
export type Service = {
  name: string;
  version: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  healthCheck: () => Promise<{ healthy: boolean; details?: unknown }>;
};

// Generic repository pattern
export type Repository<T, K = string> = {
  findById: (_id: K) => Promise<T | null>;
  findAll: () => Promise<T[]>;
  create: (_entity: Omit<T, 'id'>) => Promise<T>;
  update: (_id: K, _updates: Partial<T>) => Promise<T>;
  delete: (_id: K) => Promise<boolean>;
};

// Common error types
export class AppError extends Error {
  constructor(
    message: string,
    public _code: string,
    public _statusCode: number = 500,
    public _details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public _field?: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

// Global type augmentation for better DX
declare global {
  namespace _Shooter {
    // Extend this interface in other files to add app-specific types
    interface _CustomTypes {}
  }
}

// Version information
export const TYPES_VERSION = '1.0.0';
export const TYPES_BUILD_DATE = new Date().toISOString();