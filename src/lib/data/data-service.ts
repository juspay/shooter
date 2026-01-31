/**
 * Data Service for API Communication and Caching
 * Adapted from claude-code-templates with TypeScript and Shooter-specific features
 */

import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth';
import { get } from 'svelte/store';
import type {
  NotificationAPIRequest as NotificationRequest,
  NotificationAPIResponse as NotificationResponse,
  HealthCheckResponse as HealthResponse,
  RequestConfig,
  RequestOptions,
  CacheEntry,
  DebugInfo,
  AnalyticsMetrics,
  ApnsHealthStatus
} from '$types';

// Internal type for message content analysis
type MessageAnalysis = {
  hasCode: boolean;
  hasError: boolean;
  isQuestion: boolean;
  isUrgent: boolean;
  contentType: 'text' | 'code' | 'error' | 'question' | 'command';
  category: 'debug' | 'feature' | 'testing' | 'learning' | 'error';
  wordCount: number;
  isLong: boolean;
  isShort: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
};

export class DataService {
  private baseUrl: string;
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultConfig: Partial<RequestConfig> = {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    cache: true,
    cacheTtl: 300000 // 5 minutes
  };

  constructor(baseUrl?: string) {
    // Default to current origin for Shooter backend endpoints
    this.baseUrl = baseUrl || (browser ? window.location.origin : 'http://localhost:5173');
  }

  /**
   * Send notification request
   */
  async sendNotification(
    request: NotificationRequest,
    config?: RequestOptions
  ): Promise<NotificationResponse> {
    return this.post<NotificationResponse>('/notify', request, config);
  }

  /**
   * Get health status
   */
  async getHealth(config?: RequestOptions): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health', config);
  }

  /**
   * Get debug environment information - Shooter backend endpoint
   */
  async getDebugEnv(config?: RequestOptions): Promise<DebugInfo> {
    const headers = { authorization: 'Bearer debug-shooter-2024' };
    return this.get<DebugInfo>('/debug-env', { ...config, headers });
  }

  /**
   * Get debug notifications information - Shooter backend endpoint
   */
  async getDebugNotifications(config?: RequestOptions): Promise<unknown> {
    return this.get('/debug-notifications', config);
  }

  /**
   * Get dashboard metrics - Shooter backend endpoint
   */
  async getDashboardMetrics(config?: RequestOptions): Promise<AnalyticsMetrics> {
    return this.get<AnalyticsMetrics>('/system-monitoring/metrics', config);
  }

  /**
   * Get notification history - Shooter backend endpoint
   */
  async getNotificationHistory(limit = 50, offset = 0, config?: RequestOptions): Promise<unknown> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });

    return this.get(`/notifications/history?${params}`, config);
  }

  /**
   * Get webhook status - Shooter backend endpoint
   */
  async getWebhookStatus(config?: RequestOptions): Promise<unknown> {
    return this.get('/webhook/status', config);
  }

  /**
   * Test notification delivery - Shooter backend endpoint
   */
  async testNotification(
    request: Partial<NotificationRequest>,
    config?: RequestOptions
  ): Promise<NotificationResponse> {
    return this.post<NotificationResponse>('/notify', request, config);
  }

  /**
   * Get APNs status - Shooter backend endpoint
   */
  async getApnsStatus(config?: RequestOptions): Promise<ApnsHealthStatus> {
    return this.get<ApnsHealthStatus>('/notifications/status', config);
  }

  /**
   * Get session analytics - Shooter backend endpoint
   */
  async getSessionAnalytics(
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day',
    config?: RequestOptions
  ): Promise<unknown> {
    const params = new URLSearchParams({ timeRange });
    return this.get(`/analytics/summary?${params}`, config);
  }

  /**
   * Generic GET request
   */
  async get<T>(
    endpoint: string,
    config?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const cacheKey = `GET:${url}`;
    const mergedConfig = { ...this.defaultConfig, ...config };

    // Check cache first
    if (mergedConfig.cache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const headers = this.buildHeaders(config?.headers);

    const response = await this.requestWithRetry<T>(
      () =>
        fetch(url, {
          method: 'GET',
          headers,
          signal: this.createAbortSignal(mergedConfig.timeout)
        }),
      mergedConfig
    );

    // Cache successful response
    if (mergedConfig.cache && response) {
      this.setCache(cacheKey, response, mergedConfig.cacheTtl ?? 300000); // Default 5 minutes
    }

    return response;
  }

  /**
   * Generic POST request
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    config?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const mergedConfig = { ...this.defaultConfig, ...config };

    const headers = this.buildHeaders({
      'Content-Type': 'application/json',
      ...config?.headers
    });

    return this.requestWithRetry<T>(
      () =>
        fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: this.createAbortSignal(mergedConfig.timeout)
        }),
      mergedConfig
    );
  }

  /**
   * Generic PUT request
   */
  async put<T>(
    endpoint: string,
    data: unknown,
    config?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const mergedConfig = { ...this.defaultConfig, ...config };

    const headers = this.buildHeaders({
      'Content-Type': 'application/json',
      ...config?.headers
    });

    return this.requestWithRetry<T>(
      () =>
        fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data),
          signal: this.createAbortSignal(mergedConfig.timeout)
        }),
      mergedConfig
    );
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(
    endpoint: string,
    config?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const mergedConfig = { ...this.defaultConfig, ...config };

    const headers = this.buildHeaders(config?.headers);

    return this.requestWithRetry<T>(
      () =>
        fetch(url, {
          method: 'DELETE',
          headers,
          signal: this.createAbortSignal(mergedConfig.timeout)
        }),
      mergedConfig
    );
  }

  /**
   * Upload file
   */
  async upload<T>(
    endpoint: string,
    file: File,
    config?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const mergedConfig = { ...this.defaultConfig, ...config };

    const formData = new FormData();
    formData.append('file', file);

    const headers = this.buildHeaders(config?.headers);
    // Don't set Content-Type for FormData, let browser set it with boundary

    return this.requestWithRetry<T>(
      () =>
        fetch(url, {
          method: 'POST',
          headers,
          body: formData,
          signal: this.createAbortSignal(mergedConfig.timeout)
        }),
      mergedConfig
    );
  }

  /**
   * Make request with retry logic
   */
  private async requestWithRetry<T>(
    requestFn: () => Promise<Response>,
    config: Partial<RequestConfig>
  ): Promise<T> {
    let lastError: Error | null = null;
    const retries = config.retries ?? 3;
    const retryDelay = config.retryDelay ?? 1000;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await requestFn();

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json();
        } else {
          return (await response.text()) as unknown as T;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw lastError;
        }

        // Don't wait after the last attempt
        if (attempt < retries) {
          await this.delay(retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Build full URL from endpoint
   */
  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }

    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    return `${base}${path}`;
  }

  /**
   * Build request headers with authentication
   */
  private buildHeaders(customHeaders?: Record<string, string>): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...customHeaders
    };

    // Add authentication if available
    const authState = get(auth);
    if (authState.isAuthenticated && browser) {
      // Authentication is handled by cookies for Shooter backend
      headers['X-Requested-With'] = 'Shooter-Dashboard';

      // Add user context for logging/analytics
      if (authState.user) {
        headers['X-User-ID'] = authState.user.id;
        headers['X-User-Role'] = authState.user.role;
      }
    }

    // For debug endpoints, add specific authorization
    if (customHeaders?.authorization?.includes('debug-shooter')) {
      headers['X-Debug-Session'] = 'true';
    }

    return headers;
  }

  /**
   * Create abort signal for timeout
   */
  private createAbortSignal(timeout: number | undefined): AbortSignal {
    if (typeof AbortController === 'undefined') {
      // Fallback for environments without AbortController
      return {} as AbortSignal;
    }

    const controller = new AbortController();
    if (timeout) {
      setTimeout(() => controller.abort(), timeout);
    }
    return controller.signal;
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Don't retry on authentication errors
      if ((error as Error).message.includes('401') || (error as Error).message.includes('403')) {
        return true;
      }

      // Don't retry on client errors (4xx)
      if ((error as Error).message.includes('400') || (error as Error).message.includes('404')) {
        return true;
      }

      // Don't retry on abort errors
      if (error.name === 'AbortError') {
        return true;
      }
    }

    return false;
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get data from cache
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      key,
      value: data,
      ttl,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      hitCount: 0
    });

    // Simple cache size management
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear specific cache entry
   */
  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Global data service instance
let globalDataService: DataService | null = null;

/**
 * Get global data service instance
 */
export function getDataService(baseUrl?: string): DataService {
  if (!globalDataService) {
    globalDataService = new DataService(baseUrl);
  }

  return globalDataService;
}

/**
 * Initialize data service with Shooter-specific configuration
 */
export function initializeDataService(): DataService {
  // Use current origin for Shooter backend - all endpoints are on same domain
  const baseUrl = browser ? window.location.origin : 'http://localhost:5173';
  return getDataService(baseUrl);
}

// Metadata types for Shooter-specific data
export interface NotificationMetadata {
  conversationDuration?: number;
  hasCodeBlocks?: boolean;
  hasErrors?: boolean;
  sessionCompleted?: boolean;
  source?: string;
  priority?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface MessageMetadata {
  toolsUsed?: string[];
  filesModified?: string[];
  commandsRun?: string[];
  duration?: number;
  errorCount?: number;
  [key: string]: string | number | boolean | string[] | undefined;
}

// Shooter-specific data types and mappings
export interface NotificationSession {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'sent' | 'failed' | 'filtered';
  timestamp: Date;
  type: 'debug' | 'feature' | 'testing' | 'learning' | 'error';
  metadata?: NotificationMetadata;
}

export interface ConversationData {
  id: string;
  title: string;
  messages: MessageData[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageData {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: MessageMetadata;
}

/**
 * Map conversation data to notification session with intelligent type inference
 */
export function mapConversationToNotificationSession(
  conversation: ConversationData
): NotificationSession {
  // Intelligent type inference based on conversation content
  const notificationType = inferNotificationTypeFromConversation(conversation);

  // Generate appropriate title and description
  const { title, description } = generateTitleAndDescription(conversation);

  // Determine status based on conversation state
  const status = inferNotificationStatus(conversation);

  return {
    id: conversation.id,
    title,
    description,
    status,
    timestamp: conversation.updatedAt,
    type: notificationType,
    metadata: {
      messageCount: conversation.messages.length,
      lastMessageRole: conversation.messages[conversation.messages.length - 1]?.role,
      conversationDuration: calculateConversationDuration(conversation),
      hasCodeBlocks: hasCodeContent(conversation),
      hasErrors: hasErrorContent(conversation),
      sessionCompleted: isSessionCompleted(conversation)
    }
  };
}

/**
 * Infer notification type from conversation content
 */
function inferNotificationTypeFromConversation(
  conversation: ConversationData
): NotificationSession['type'] {
  const allContent = conversation.messages.map(m => m.content.toLowerCase()).join(' ');

  // Check for error patterns
  if (
    allContent.includes('error') ||
    allContent.includes('failed') ||
    allContent.includes('exception')
  ) {
    return 'error';
  }

  // Check for debugging patterns
  if (
    allContent.includes('debug') ||
    allContent.includes('console.log') ||
    allContent.includes('print(')
  ) {
    return 'debug';
  }

  // Check for testing patterns
  if (
    allContent.includes('test') ||
    allContent.includes('spec') ||
    allContent.includes('expect(')
  ) {
    return 'testing';
  }

  // Check for learning/question patterns
  if (
    allContent.includes('how to') ||
    allContent.includes('what is') ||
    allContent.includes('explain')
  ) {
    return 'learning';
  }

  // Default to feature development
  return 'feature';
}

/**
 * Generate appropriate title and description for notification
 */
function generateTitleAndDescription(conversation: ConversationData): {
  title: string;
  description: string;
} {
  // Use conversation title if available, otherwise generate from first message
  let title = conversation.title;

  if (!title && conversation.messages.length > 0) {
    const firstMessage = conversation.messages[0]!.content;
    title = firstMessage.substring(0, 50);
    if (firstMessage.length > 50) {
title += '...';
}
  }

  if (!title) {
    title = 'Untitled Session';
  }

  // Generate description from last assistant message or first user message
  let description = '';
  const lastAssistantMessage = [...conversation.messages]
    .reverse()
    .find(m => m.role === 'assistant');

  if (lastAssistantMessage) {
    description = lastAssistantMessage.content.substring(0, 120);
  } else if (conversation.messages.length > 0) {
    description = conversation.messages[0]!.content.substring(0, 120);
  }

  if (description.length >= 120) {
    description += '...';
  }

  if (!description) {
    description = 'No content available';
  }

  return { title, description };
}

/**
 * Infer notification status from conversation state
 */
function inferNotificationStatus(conversation: ConversationData): NotificationSession['status'] {
  // If no messages, mark as pending
  if (conversation.messages.length === 0) {
    return 'pending';
  }

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  if (!lastMessage) {
return 'pending';
}

  // If last message is from assistant, consider it sent
  if (lastMessage.role === 'assistant') {
    return 'sent';
  }

  // If conversation has errors, mark as failed
  if (hasErrorContent(conversation)) {
    return 'failed';
  }

  // Default to pending for user messages waiting for response
  return 'pending';
}

/**
 * Calculate conversation duration in minutes
 */
function calculateConversationDuration(conversation: ConversationData): number {
  if (conversation.messages.length < 2) {
return 0;
}

  const startTime = conversation.createdAt.getTime();
  const endTime = conversation.updatedAt.getTime();

  return Math.round((endTime - startTime) / 60000); // Convert to minutes
}

/**
 * Check if conversation contains code blocks
 */
function hasCodeContent(conversation: ConversationData): boolean {
  return conversation.messages.some(
    message =>
      message.content.includes('```') ||
      message.content.includes('<code>') ||
      message.content.includes('function ') ||
      message.content.includes('const ') ||
      message.content.includes('import ')
  );
}

/**
 * Check if conversation contains error content
 */
function hasErrorContent(conversation: ConversationData): boolean {
  return conversation.messages.some(message => {
    const content = message.content.toLowerCase();
    return (
      content.includes('error') ||
      content.includes('failed') ||
      content.includes('exception') ||
      content.includes('cannot') ||
      content.includes('undefined')
    );
  });
}

/**
 * Check if session appears to be completed
 */
function isSessionCompleted(conversation: ConversationData): boolean {
  if (conversation.messages.length === 0) {
return false;
}

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  if (!lastMessage) {
return false;
}

  // If last message is from assistant and contains completion indicators
  if (lastMessage.role === 'assistant') {
    const content = lastMessage.content.toLowerCase();
    return (
      content.includes('completed') ||
      content.includes('finished') ||
      content.includes('done') ||
      content.includes('success')
    );
  }

  return false;
}

/**
 * Map message data to notification with intelligent categorization
 */
export function mapMessageToNotification(
  message: MessageData,
  sessionId: string,
  conversationContext?: ConversationData
): NotificationRequest {
  // Intelligent message analysis
  const analysis = analyzeMessageContent(message);

  // Generate contextual title
  const title = generateMessageTitle(message, analysis);

  // Create intelligent notification content
  const notificationMessage = createNotificationMessage(message, analysis);

  // Determine priority based on content
  const priority = determineMessagePriority(message, analysis);

  return {
    title,
    message: notificationMessage,
    category: analysis.category,
    data: {
      sessionId,
      messageId: message.id,
      role: message.role,
      timestamp: message.timestamp.toISOString(),
      priority,
      contentType: analysis.contentType,
      hasCode: analysis.hasCode,
      hasError: analysis.hasError,
      isQuestion: analysis.isQuestion,
      isUrgent: analysis.isUrgent,
      wordCount: analysis.wordCount,
      context: conversationContext
        ? {
            conversationTitle: conversationContext.title,
            messageCount: conversationContext.messages.length,
            conversationDuration: calculateConversationDuration(conversationContext)
          }
        : undefined
    }
  };
}

/**
 * Analyze message content for intelligent categorization
 */
function analyzeMessageContent(message: MessageData) {
  const content = message.content.toLowerCase();
  const originalContent = message.content;

  // Basic content analysis
  const hasCode = /```|`[^`]+`|function |const |import |export |class /.test(originalContent);
  const hasError = /error|failed|exception|cannot|undefined|null|crash|bug/.test(content);
  const isQuestion = /\?|how to|what is|why|when|where|which|can you|could you|please/.test(
    content
  );
  const isUrgent = /urgent|asap|immediately|critical|emergency|help|stuck/.test(content);

  // Content type detection
  let contentType: 'text' | 'code' | 'error' | 'question' | 'command' = 'text';
  if (hasCode) {
contentType = 'code';
} else if (hasError) {
contentType = 'error';
} else if (isQuestion) {
contentType = 'question';
} else if (/^\/|npm |yarn |bun |git |docker /.test(content)) {
contentType = 'command';
}

  // Category determination
  let category: 'debug' | 'feature' | 'testing' | 'learning' | 'error' = 'feature';
  if (hasError) {
category = 'error';
} else if (/debug|console|log|trace|inspect/.test(content)) {
category = 'debug';
} else if (/test|spec|expect|assert|jest|vitest/.test(content)) {
category = 'testing';
} else if (isQuestion || /learn|explain|understand|tutorial/.test(content)) {
category = 'learning';
}

  // Word count and length analysis
  const wordCount = originalContent.split(/\s+/).length;
  const isLong = wordCount > 50;
  const isShort = wordCount < 10;

  return {
    hasCode,
    hasError,
    isQuestion,
    isUrgent,
    contentType,
    category,
    wordCount,
    isLong,
    isShort,
    sentiment: analyzeSentiment(content)
  };
}

/**
 * Generate contextual title for message notification
 */
function generateMessageTitle(message: MessageData, analysis: MessageAnalysis): string {
  const role = message.role === 'user' ? 'User' : 'Assistant';

  // Urgent messages get priority in title
  if (analysis.isUrgent) {
    return `🚨 Urgent ${role} Message`;
  }

  // Error messages
  if (analysis.hasError) {
    return `❌ ${role} Error Report`;
  }

  // Code-related messages
  if (analysis.hasCode) {
    return `💻 ${role} Code Update`;
  }

  // Questions
  if (analysis.isQuestion) {
    return `❓ ${role} Question`;
  }

  // Long messages
  if (analysis.isLong) {
    return `📝 Detailed ${role} Message`;
  }

  // Default contextual titles based on category
  switch (analysis.category) {
    case 'debug':
      return `🐛 ${role} Debug Session`;
    case 'testing':
      return `🧪 ${role} Test Update`;
    case 'learning':
      return `📚 ${role} Learning Session`;
    case 'error':
      return `⚠️ ${role} Error`;
    default:
      return `💬 New ${role} Message`;
  }
}

/**
 * Create intelligent notification message content
 */
function createNotificationMessage(message: MessageData, analysis: MessageAnalysis): string {
  let content = message.content;

  // For code messages, extract key information
  if (analysis.hasCode) {
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    if (codeBlocks && codeBlocks.length > 0) {
      content = content.replace(/```[\s\S]*?```/g, '[Code Block]');
    }
    content = content.replace(/`[^`]+`/g, '[Code]');
  }

  // Truncate intelligently
  const maxLength = analysis.isShort ? 150 : 100;
  if (content.length > maxLength) {
    // Try to truncate at sentence boundary
    const sentences = content.split('. ');
    if (sentences.length > 1 && sentences[0]!.length <= maxLength) {
      content = sentences[0]! + '...';
    } else {
      content = content.substring(0, maxLength).trim() + '...';
    }
  }

  // Add context indicators
  const indicators = [];
  if (analysis.hasCode) {
indicators.push('📝 Code');
}
  if (analysis.hasError) {
indicators.push('❌ Error');
}
  if (analysis.isQuestion) {
indicators.push('❓ Question');
}
  if (analysis.isUrgent) {
indicators.push('🚨 Urgent');
}

  if (indicators.length > 0) {
    content = `${indicators.join(' ')} - ${content}`;
  }

  return content;
}

/**
 * Determine message priority for notification routing
 */
function determineMessagePriority(
  message: MessageData,
  analysis: MessageAnalysis
): 'low' | 'normal' | 'high' | 'urgent' {
  // Urgent content gets urgent priority
  if (analysis.isUrgent) {
return 'urgent';
}

  // Error messages get high priority
  if (analysis.hasError) {
return 'high';
}

  // User questions get high priority
  if (message.role === 'user' && analysis.isQuestion) {
return 'high';
}

  // Code messages get normal priority
  if (analysis.hasCode) {
return 'normal';
}

  // Short messages might be quick questions
  if (analysis.isShort && message.role === 'user') {
return 'normal';
}

  // Long detailed messages get normal priority
  if (analysis.isLong) {
return 'normal';
}

  // Default to low priority
  return 'low';
}

/**
 * Basic sentiment analysis for message content
 */
function analyzeSentiment(content: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = [
    'thanks',
    'great',
    'awesome',
    'perfect',
    'excellent',
    'good',
    'love',
    'amazing'
  ];
  const negativeWords = [
    'error',
    'failed',
    'wrong',
    'bad',
    'terrible',
    'awful',
    'hate',
    'problem',
    'issue'
  ];

  const words = content.split(/\s+/);
  let positiveScore = 0;
  let negativeScore = 0;

  words.forEach(word => {
    if (positiveWords.some(pw => word.includes(pw))) {
positiveScore++;
}
    if (negativeWords.some(nw => word.includes(nw))) {
negativeScore++;
}
  });

  if (positiveScore > negativeScore) {
return 'positive';
}
  if (negativeScore > positiveScore) {
return 'negative';
}
  return 'neutral';
}

/**
 * Batch process conversations to notification sessions
 */
export function batchMapConversationsToNotificationSessions(
  conversations: ConversationData[]
): NotificationSession[] {
  return conversations.map(conversation => mapConversationToNotificationSession(conversation));
}

/**
 * Batch process messages to notifications
 */
export function batchMapMessagesToNotifications(
  messages: { message: MessageData; sessionId: string; context?: ConversationData }[]
): NotificationRequest[] {
  return messages.map(({ message, sessionId, context }) =>
    mapMessageToNotification(message, sessionId, context)
  );
}

/**
 * Filter and prioritize notifications based on criteria
 */
export function filterAndPrioritizeNotifications(
  notifications: NotificationRequest[],
  criteria: {
    maxCount?: number;
    minPriority?: 'low' | 'normal' | 'high' | 'urgent';
    categories?: string[];
    excludeTypes?: string[];
  }
): NotificationRequest[] {
  let filtered = [...notifications];

  // Filter by categories if specified
  if (criteria.categories && criteria.categories.length > 0) {
    filtered = filtered.filter(n => n.category && criteria.categories!.includes(n.category));
  }

  // Exclude types if specified
  if (criteria.excludeTypes && criteria.excludeTypes.length > 0) {
    filtered = filtered.filter(n => {
      const contentType = n.data?.contentType;
      return !(typeof contentType === 'string' && criteria.excludeTypes!.includes(contentType));
    });
  }

  // Filter by minimum priority
  if (criteria.minPriority) {
    const priorityOrder = { low: 0, normal: 1, high: 2, urgent: 3 };
    const minLevel = priorityOrder[criteria.minPriority];
    filtered = filtered.filter(n => {
      const notificationPriority = n.data?.priority || 'low';
      return priorityOrder[notificationPriority as keyof typeof priorityOrder] >= minLevel;
    });
  }

  // Sort by priority (urgent first, then high, normal, low)
  filtered.sort((a, b) => {
    const priorityOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
    const aPriority = a.data?.priority || 'low';
    const bPriority = b.data?.priority || 'low';
    return (
      priorityOrder[bPriority as keyof typeof priorityOrder] -
      priorityOrder[aPriority as keyof typeof priorityOrder]
    );
  });

  // Limit count if specified
  if (criteria.maxCount && criteria.maxCount > 0) {
    filtered = filtered.slice(0, criteria.maxCount);
  }

  return filtered;
}

/**
 * Create notification session summary for analytics
 */
export function createNotificationSessionSummary(sessions: NotificationSession[]): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  averageDuration: number;
  codeSessionsCount: number;
  errorSessionsCount: number;
  completedSessionsCount: number;
} {
  const summary = {
    total: sessions.length,
    byType: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    averageDuration: 0,
    codeSessionsCount: 0,
    errorSessionsCount: 0,
    completedSessionsCount: 0
  };

  let totalDuration = 0;

  sessions.forEach(session => {
    // Count by type
    summary.byType[session.type] = (summary.byType[session.type] || 0) + 1;

    // Count by status
    summary.byStatus[session.status] = (summary.byStatus[session.status] || 0) + 1;

    // Duration calculation
    if (session.metadata?.conversationDuration) {
      totalDuration += session.metadata.conversationDuration;
    }

    // Special counts
    if (session.metadata?.hasCodeBlocks) {
      summary.codeSessionsCount++;
    }

    if (session.metadata?.hasErrors) {
      summary.errorSessionsCount++;
    }

    if (session.metadata?.sessionCompleted) {
      summary.completedSessionsCount++;
    }
  });

  summary.averageDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

  return summary;
}
