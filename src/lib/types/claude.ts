/**
 * Claude Code Integration Types
 * Type definitions for Claude Code template integration and real-time services
 */

// Claude Code template service types
export interface WebSocketService {
  connect(_url: string): Promise<WebSocket>;
  disconnect(): Promise<void>;
  send(_message: ClaudeWebSocketMessage): Promise<void>;
  subscribe(_eventType: string, _handler: WebSocketEventHandler): void;
  unsubscribe(_eventType: string, _handler: WebSocketEventHandler): void;
  
  // Connection management
  isConnected(): boolean;
  getConnectionState(): WebSocketConnectionState;
  reconnect(): Promise<void>;
  
  // Event handling
  onConnect: (_callback: () => void) => void;
  onDisconnect: (_callback: (_reason: string) => void) => void;
  onError: (_callback: (_error: WebSocketError) => void) => void;
  onMessage: (_callback: (_message: ClaudeWebSocketMessage) => void) => void;
}

export interface ClaudeWebSocketMessage {
  id: string;
  type: WebSocketMessageType;
  timestamp: number;
  data: unknown;
  metadata?: {
    source: string;
    version: string;
    sessionId?: string;
    userId?: string;
  };
}

export type WebSocketMessageType =
  | 'notification_event'
  | 'notification_sent'
  | 'notification_failed'
  | 'notification_filtered'
  | 'notification_interaction'
  | 'notification_interaction_broadcast'
  | 'session_state_change'
  | 'apns_status_change'
  | 'system_health_update'
  | 'claude_tool_usage'
  | 'session_update'
  | 'system_status'
  | 'user_interaction'
  | 'real_time_update'
  | 'analytics_request'
  | 'analytics_response'
  | 'subscribe'
  | 'unsubscribe'
  | 'subscription_confirmed'
  | 'unsubscription_confirmed'
  | 'connection_established'
  | 'connection_stats_update'
  | 'ping'
  | 'pong'
  | 'error'
  | 'reconnect';

export type WebSocketConnectionState = 
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface WebSocketError {
  code: number;
  message: string;
  timestamp: Date;
  retryable: boolean;
  context?: Record<string, unknown>;
}

export type WebSocketEventHandler = (_message: ClaudeWebSocketMessage) => void;

// Data service types for real-time data management
export interface DataService {
  // Data fetching
  fetch<T>(_endpoint: string, _options?: DataFetchOptions): Promise<DataResponse<T>>;
  fetchStream<T>(_endpoint: string, _options?: DataStreamOptions): AsyncIterable<T>;
  
  // Real-time subscriptions
  subscribe<T>(_channel: string, _handler: DataEventHandler<T>): DataSubscription;
  unsubscribe(_subscription: DataSubscription): void;
  
  // Caching
  cache: DataCache;
  
  // Health and monitoring
  getMetrics(): DataServiceMetrics;
  healthCheck(): Promise<DataServiceHealth>;
}

export interface DataFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  cache?: boolean;
  transform?: (_data: unknown) => unknown;
}

export interface DataStreamOptions extends DataFetchOptions {
  batchSize?: number;
  intervalMs?: number;
  bufferSize?: number;
}

export interface DataResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached: boolean;
  timestamp: Date;
  requestId: string;
}

export interface DataSubscription {
  id: string;
  channel: string;
  active: boolean;
  createdAt: Date;
  lastMessage?: Date;
  messageCount: number;
  
  unsubscribe(): void;
  pause(): void;
  resume(): void;
}

export type DataEventHandler<T> = (_data: T, _metadata: DataEventMetadata) => void;

export interface DataEventMetadata {
  channel: string;
  timestamp: Date;
  messageId: string;
  source: string;
  type: string;
}

export interface DataCache {
  get<T>(_key: string): T | undefined;
  set<T>(_key: string, _value: T, _ttl?: number): void;
  delete(_key: string): boolean;
  clear(): void;
  has(_key: string): boolean;
  size(): number;
  keys(): string[];
}

export interface DataServiceMetrics {
  requestCount: number;
  errorCount: number;
  cacheHitRate: number;
  averageResponseTime: number;
  activeSubscriptions: number;
  bytesSent: number;
  bytesReceived: number;
  uptime: number;
}

export interface DataServiceHealth {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    webSocket: boolean;
    cache: boolean;
    endpoints: boolean;
    memory: boolean;
  };
  details?: Record<string, unknown>;
  timestamp: Date;
}

// Claude Code conversation and session types
export interface ClaudeConversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  status: ConversationStatus;
  
  // Metadata
  projectPath?: string;
  branch?: string;
  tags: string[];
  
  // Messages
  messages: ClaudeMessage[];
  
  // Real-time status
  isActive: boolean;
  participantCount: number;
}

export type ConversationStatus = 
  | 'active'
  | 'idle'
  | 'archived'
  | 'deleted'
  | 'error';

export interface ClaudeMessage {
  id: string;
  conversationId: string;
  type: MessageType;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  
  // Tool usage tracking
  toolCalls?: ClaudeToolCall[];
  attachments?: MessageAttachment[];
  
  // Status and delivery
  status: MessageStatus;
  deliveryStatus?: MessageDeliveryStatus;
  
  // Metadata
  metadata?: {
    tokenCount?: number;
    processingTime?: number;
    model?: string;
    temperature?: number;
  };
}

export type MessageType = 
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'system'
  | 'error';

export type MessageStatus = 
  | 'draft'
  | 'sending'
  | 'sent'
  | 'processing'
  | 'completed'
  | 'failed';

export interface MessageDeliveryStatus {
  sent: boolean;
  delivered: boolean;
  read: boolean;
  timestamps: {
    sent?: Date;
    delivered?: Date;
    read?: Date;
  };
}

export interface ClaudeToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: ToolCallStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
}

export type ToolCallStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'code' | 'link';
  name: string;
  url?: string;
  content?: string;
  mimeType?: string;
  size?: number;
}

// Mobile UI component types from Claude templates
export interface ConversationSidebarProps {
  conversations: ClaudeConversation[];
  activeConversationId?: string;
  onConversationSelect: (_conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (_conversationId: string) => void;
  
  // Mobile responsive
  isMobile: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  
  // Search and filtering
  searchQuery: string;
  onSearchChange: (_query: string) => void;
  filters: ConversationFilters;
  onFiltersChange: (_filters: ConversationFilters) => void;
}

export interface ConversationFilters {
  status: ConversationStatus[];
  tags: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  hasAttachments?: boolean;
  hasToolCalls?: boolean;
}

export interface ChatViewProps {
  conversation: ClaudeConversation;
  messages: ClaudeMessage[];
  isLoading: boolean;
  
  // Input handling
  inputValue: string;
  onInputChange: (_value: string) => void;
  onSendMessage: (_message: string) => void;
  
  // File handling
  onFileUpload: (_files: File[]) => void;
  supportedFileTypes: string[];
  maxFileSize: number;
  
  // Real-time status
  isTyping: boolean;
  connectionStatus: WebSocketConnectionState;
  
  // Mobile optimization
  isMobile: boolean;
  virtualScrolling: boolean;
}

export interface StatusFooterProps {
  connectionStatus: WebSocketConnectionState;
  lastSync: Date;
  pendingActions: number;
  
  // System status
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  notifications: StatusNotification[];
  
  // User actions
  onRetryConnection: () => void;
  onClearNotifications: () => void;
  onViewDetails: () => void;
  
  // Mobile responsive
  isMobile: boolean;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export interface StatusNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: Date;
  dismissible: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface NotificationBubbleProps {
  notification: StatusNotification;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  duration?: number; // Auto-dismiss after ms
  onDismiss: (_id: string) => void;
  onAction?: (_id: string) => void;
  
  // Animation settings
  animation: 'slide' | 'fade' | 'bounce';
  stacked: boolean;
}

export interface DeliveryStatusProps {
  message: ClaudeMessage;
  showTimestamps: boolean;
  compact: boolean;
  
  // Status indicators
  showDelivered: boolean;
  showRead: boolean;
  showProcessing: boolean;
  
  // Styling
  theme: 'light' | 'dark' | 'auto';
  size: 'small' | 'medium' | 'large';
}

// Claude Code integration configuration
export interface ClaudeIntegrationConfig {
  // API settings
  api: {
    baseUrl: string;
    apiKey?: string;
    timeout: number;
    retries: number;
    rateLimit: {
      requestsPerMinute: number;
      burstLimit: number;
    };
  };
  
  // WebSocket settings
  websocket: {
    url: string;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
  };
  
  // Real-time features
  realtime: {
    enableTypingIndicators: boolean;
    enablePresence: boolean;
    enableNotifications: boolean;
    messageBuffer: number;
    syncInterval: number;
  };
  
  // UI settings
  ui: {
    theme: 'light' | 'dark' | 'auto';
    mobileBreakpoint: number;
    virtualScrollThreshold: number;
    messagePageSize: number;
    fileUploadLimit: number;
  };
  
  // Caching
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    persistToDisk: boolean;
  };
}

// Template extraction types
export interface TemplateExtractionResult {
  success: boolean;
  components: ExtractedComponent[];
  styles: ExtractedStyles;
  scripts: ExtractedScripts;
  assets: ExtractedAsset[];
  errors: TemplateError[];
  metadata: TemplateMetadata;
}

export interface ExtractedComponent {
  name: string;
  type: 'component' | 'layout' | 'page';
  filePath: string;
  content: string;
  dependencies: string[];
  props?: ComponentProp[];
  events?: ComponentEvent[];
  slots?: ComponentSlot[];
}

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface ComponentEvent {
  name: string;
  payload?: string;
  description?: string;
}

export interface ComponentSlot {
  name: string;
  required: boolean;
  fallback?: string;
  description?: string;
}

export interface ExtractedStyles {
  global: string[];
  scoped: Record<string, string>;
  variables: Record<string, string>;
  breakpoints: Record<string, string>;
  animations: Record<string, string>;
}

export interface ExtractedScripts {
  utilities: string[];
  services: string[];
  stores: string[];
  actions: string[];
  modules: string[];
}

export interface ExtractedAsset {
  type: 'image' | 'font' | 'icon' | 'video' | 'audio';
  name: string;
  path: string;
  size: number;
  format: string;
  optimized: boolean;
}

export interface TemplateError {
  type: 'parsing' | 'conversion' | 'dependency' | 'validation';
  message: string;
  location?: {
    file: string;
    line: number;
    column: number;
  };
  severity: 'error' | 'warning' | 'info';
}

export interface TemplateMetadata {
  sourceFormat: string;
  targetFormat: string;
  extractedAt: Date;
  version: string;
  totalComponents: number;
  totalLines: number;
  compatibility: CompatibilityReport;
}

export interface CompatibilityReport {
  svelteKit: boolean;
  typescript: boolean;
  responsive: boolean;
  accessibility: boolean;
  performance: number; // score out of 100
  issues: string[];
  recommendations: string[];
}

// Type guards for Claude types
export function isClaudeConversation(obj: unknown): obj is ClaudeConversation {
  return obj !== null && typeof obj === 'object' && 'id' in obj && typeof obj.id === 'string' && 'title' in obj && typeof obj.title === 'string' && 'messages' in obj && Array.isArray(obj.messages);
}

export function isClaudeMessage(obj: unknown): obj is ClaudeMessage {
  return obj !== null && typeof obj === 'object' && 'id' in obj && typeof obj.id === 'string' && 'content' in obj && typeof obj.content === 'string' && 'role' in obj && typeof obj.role === 'string';
}

export function isClaudeWebSocketMessage(obj: unknown): obj is ClaudeWebSocketMessage {
  return obj !== null && typeof obj === 'object' && 'id' in obj && typeof obj.id === 'string' && 'type' in obj && typeof obj.type === 'string' && 'timestamp' in obj && typeof obj.timestamp === 'number';
}

export function isDataResponse<T>(obj: unknown): obj is DataResponse<T> {
  return obj !== null && typeof obj === 'object' && 'data' in obj && obj.data !== undefined && 'status' in obj && typeof obj.status === 'number' && 'timestamp' in obj && obj.timestamp instanceof Date;
}

// Utility functions for Claude integration
export function createClaudeWebSocketMessage(
  type: WebSocketMessageType,
  data: unknown,
  metadata?: Partial<ClaudeWebSocketMessage['metadata']>
): ClaudeWebSocketMessage {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    data,
    metadata: {
      source: 'shooter-dashboard',
      version: '1.0.0',
      ...metadata
    }
  };
}

export function formatConversationTitle(conversation: ClaudeConversation): string {
  if (conversation.title.length > 50) {
    return conversation.title.substring(0, 47) + '...';
  }
  return conversation.title;
}

export function getMessagePreview(message: ClaudeMessage): string {
  const maxLength = 100;
  if (message.content.length <= maxLength) {
    return message.content;
  }
  return message.content.substring(0, maxLength - 3) + '...';
}

export function calculateMessageTokens(content: string): number {
  // Rough approximation: ~4 characters per token
  return Math.ceil(content.length / 4);
}

export function getConnectionStatusColor(status: WebSocketConnectionState): string {
  const colorMap: Record<WebSocketConnectionState, string> = {
    connected: '#10B981',      // green
    connecting: '#F59E0B',     // yellow
    disconnected: '#EF4444',   // red
    disconnecting: '#F59E0B',  // yellow
    reconnecting: '#F59E0B',   // yellow
    error: '#EF4444'           // red
  };
  
  return colorMap[status] || '#6B7280'; // gray default
}

export function isMessageDelivered(message: ClaudeMessage): boolean {
  return message.deliveryStatus?.delivered === true;
}

export function isMessageRead(message: ClaudeMessage): boolean {
  return message.deliveryStatus?.read === true;
}

export function getToolCallDuration(toolCall: ClaudeToolCall): number {
  if (toolCall.endTime && toolCall.startTime) {
    return toolCall.endTime.getTime() - toolCall.startTime.getTime();
  }
  return 0;
}