// Advanced Logging and Error Handling for Storage System
// Structured logging with error categorization and debugging support

import type {  } from './types.js';

/**
 * Log levels for structured logging
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log categories for better organization
 */
export type LogCategory =
  | 'storage'
  | 'connection'
  | 'performance'
  | 'cache'
  | 'scheduler'
  | 'health'
  | 'security'
  | 'system'
  | 'monitoring'
  | 'shutdown';

/**
 * Context types for different logging operations
 */
export interface SchedulerContext {
  duration?: number;
  error?: string;
  retryDelay?: number;
  key?: string;
  retry?: boolean;
}

export interface PerformanceContext {
  key?: string;
  error?: string;
  cacheHit?: boolean;
  retryCount?: number;
  found?: boolean;
  removed?: boolean;
  successCount?: number;
  failureCount?: number;
  totalStorages?: number;
  storageCount?: number;
  duration?: number;
  sourceIndex?: number;
}

export interface CacheContext {
  latency?: number;
  size?: number;
  evicted?: boolean;
  duration?: number;
  sourceIndex?: number;
}

export interface HealthContext {
  connections?: number;
  uptime?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface ConnectionContext {
  storageName?: string;
  event?: string;
  attempt?: number;
  lastError?: string;
  error?: string;
  host?: string;
}

export interface SecurityContext {
  event?: string;
  userId?: string;
  ipAddress?: string;
  ip?: string;
  endpoint?: string;
}

export interface ErrorContext {
  key?: string;
  duration?: number;
  stackTrace?: string;
  requestId?: string;
  retryable?: boolean;
  alertId?: string;
  sourceIndex?: number;
  error?: string;
  metadata?: string;
}

export interface GeneralContext {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: SchedulerContext | PerformanceContext | CacheContext | HealthContext | ConnectionContext | SecurityContext | ErrorContext | GeneralContext;
  error?: Error;
  storageName?: string;
  operation?: string;
  duration?: number;
  stackTrace?: string;
}

/**
 * Error categories for better handling
 */
export type ErrorCategory =
  | 'connection'
  | 'timeout'
  | 'serialization'
  | 'authentication'
  | 'permission'
  | 'validation'
  | 'resource'
  | 'network'
  | 'unknown';

/**
 * Categorized error with additional context
 */
export interface CategorizedError extends Error {
  category: ErrorCategory;
  isRetriable: boolean;
  context?: ErrorContext;
  storageName?: string;
  operation?: string;
  timestamp: number;
}

/**
 * Logging configuration
 */
interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxLogSize: number;
  categories: LogCategory[];
  enableStackTrace: boolean;
  enablePerformanceLogging: boolean;
}

const DEFAULT_LOG_CONFIG: LogConfig = {
  level: 'debug',
  enableConsole: true,
  enableFile: false,
  maxLogSize: 1000,
  categories: [
    'storage',
    'connection',
    'performance',
    'cache',
    'scheduler',
    'health',
    'security',
    'system'
  ],
  enableStackTrace: true,
  enablePerformanceLogging: true
};

class StorageLogger {
  private config: LogConfig;
  private logs: LogEntry[] = [];
  private errorCounts = new Map<ErrorCategory, number>();
  private operationMetrics = new Map<
    string,
    { count: number; totalDuration: number; errors: number }
  >();

  constructor(config: Partial<LogConfig> = {}) {
    this.config = { ...DEFAULT_LOG_CONFIG, ...config };
  }

  /**
   * Log a message with specified level and category
   */
  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: GeneralContext
  ): void {
    if (!this.shouldLog(level, category)) {
      return;
    }

    const sanitizedContext = this.sanitizeContext(context);
    const stackTrace = this.config.enableStackTrace && level === 'error' ? new Error().stack : undefined;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      ...(sanitizedContext && { context: sanitizedContext }),
      ...(stackTrace && { stackTrace })
    };

    this.addLogEntry(entry);
  }

  /**
   * Log an error with categorization
   */
  logError(
    error: Error | CategorizedError,
    category: LogCategory,
    operation?: string,
    storageName?: string,
    context?: ErrorContext
  ): void {
    if (!this.shouldLog('error', category)) {
      return;
    }

    const categorizedError = this.categorizeError(error);
    this.incrementErrorCount(categorizedError.category);

    const sanitizedContext = this.sanitizeContext(context);
    const stackTrace = this.config.enableStackTrace ? error.stack : undefined;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'error',
      category,
      message: (error as Error).message,
      error: categorizedError,
      ...(sanitizedContext && { context: sanitizedContext }),
      ...(storageName && { storageName }),
      ...(operation && { operation }),
      ...(stackTrace && { stackTrace })
    };

    this.addLogEntry(entry);

    // Update operation metrics
    if (operation) {
      this.updateOperationMetrics(operation, 0, true);
    }
  }

  /**
   * Log performance metrics for operations
   */
  logPerformance(
    operation: string,
    storageName: string,
    duration: number,
    success: boolean,
    context?: PerformanceContext
  ): void {
    if (!this.config.enablePerformanceLogging || !this.shouldLog('debug', 'performance')) {
      return;
    }

    const sanitizedContext = this.sanitizeContext(context);

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'debug',
      category: 'performance',
      message: `${operation} ${success ? 'completed' : 'failed'} in ${duration}ms`,
      ...(sanitizedContext && { context: sanitizedContext }),
      storageName,
      operation,
      duration
    };

    this.addLogEntry(entry);
    this.updateOperationMetrics(operation, duration, !success);
  }

  /**
   * Log storage connection events
   */
  logConnection(
    storageName: string,
    event: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'retry',
    context?: ConnectionContext
  ): void {
    const level: LogLevel = event === 'failed' ? 'error' : event === 'retry' ? 'warn' : 'info';

    this.log(level, 'connection', `Storage ${storageName} ${event}`, {
      storageName,
      event,
      ...context
    });
  }

  /**
   * Log cache operations and hits/misses
   */
  logCache(
    operation: 'hit' | 'miss' | 'populate' | 'evict',
    key: string,
    storageName?: string,
    context?: CacheContext
  ): void {
    this.log('debug', 'cache', `Cache ${operation} for key ${key}`, {
      operation,
      key,
      storageName,
      ...context
    });
  }

  /**
   * Log scheduler events
   */
  logScheduler(
    event: 'push' | 'flush' | 'retry' | 'failed',
    key: string,
    storageName: string,
    context?: SchedulerContext
  ): void {
    const level: LogLevel = event === 'failed' ? 'error' : 'debug';

    this.log(level, 'scheduler', `Scheduler ${event} for ${key} → ${storageName}`, {
      event,
      key,
      storageName,
      ...context
    });
  }

  /**
   * Log health check results
   */
  logHealth(
    storageName: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    latency?: number,
    context?: HealthContext
  ): void {
    const level: LogLevel =
      status === 'unhealthy' ? 'error' : status === 'degraded' ? 'warn' : 'info';

    this.log(
      level,
      'health',
      `Storage ${storageName} health: ${status}${latency ? ` (${latency}ms)` : ''}`,
      {
        storageName,
        status,
        latency,
        ...context
      }
    );
  }

  /**
   * Log security events
   */
  logSecurity(
    event: 'auth_failure' | 'permission_denied' | 'invalid_token' | 'rate_limit',
    context?: SecurityContext
  ): void {
    this.log('warn', 'security', `Security event: ${event}`, {
      event,
      ...context
    });
  }

  /**
   * Get recent logs with optional filtering
   */
  getLogs(filters?: {
    level?: LogLevel;
    category?: LogCategory;
    storageName?: string;
    operation?: string;
    since?: number;
    limit?: number;
  }): LogEntry[] {
    let filtered = [...this.logs];

    if (filters) {
      if (filters.level) {
        const levelOrder = ['debug', 'info', 'warn', 'error'];
        const minIndex = levelOrder.indexOf(filters.level);
        filtered = filtered.filter(log => levelOrder.indexOf(log.level) >= minIndex);
      }

      if (filters.category) {
        filtered = filtered.filter(log => log.category === filters.category);
      }

      if (filters.storageName) {
        filtered = filtered.filter(log => log.storageName === filters.storageName);
      }

      if (filters.operation) {
        filtered = filtered.filter(log => log.operation === filters.operation);
      }

      if (filters.since) {
        const since = filters.since;
        filtered = filtered.filter(log => log.timestamp >= since);
      }

      if (filters.limit) {
        filtered = filtered.slice(-filters.limit);
      }
    }

    return filtered;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorRate: number;
    recentErrors: LogEntry[];
  } {
    const totalErrors = Array.from(this.errorCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalOperations = this.logs.length;
    const errorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;

    const errorsByCategory: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
    for (const [category, count] of this.errorCounts.entries()) {
      errorsByCategory[category] = count;
    }

    const recentErrors = this.getLogs({ level: 'error', limit: 10 });

    return {
      totalErrors,
      errorsByCategory,
      errorRate,
      recentErrors
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Record<
    string,
    {
      count: number;
      averageDuration: number;
      errorRate: number;
      totalDuration: number;
    }
  > {
    const stats: Record<string, {
      count: number;
      averageDuration: number;
      errorRate: number;
      totalDuration: number;
    }> = {};

    for (const [operation, metrics] of this.operationMetrics.entries()) {
      stats[operation] = {
        count: metrics.count,
        averageDuration: metrics.count > 0 ? metrics.totalDuration / metrics.count : 0,
        errorRate: metrics.count > 0 ? metrics.errors / metrics.count : 0,
        totalDuration: metrics.totalDuration
      };
    }

    return stats;
  }

  /**
   * Configure logging settings
   */
  configure(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LogConfig {
    return { ...this.config };
  }

  /**
   * Clear logs and reset metrics
   */
  clear(): void {
    this.logs = [];
    this.errorCounts.clear();
    this.operationMetrics.clear();
  }

  /**
   * Export logs for external analysis
   */
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'timestamp',
        'level',
        'category',
        'message',
        'storageName',
        'operation',
        'duration'
      ];
      const csvRows = this.logs.map(log =>
        [
          new Date(log.timestamp).toISOString(),
          log.level,
          log.category,
          `"${log.message.replace(/"/g, '""')}"`,
          log.storageName || '',
          log.operation || '',
          log.duration || ''
        ].join(',')
      );

      return [headers.join(','), ...csvRows].join('\n');
    }

    return JSON.stringify(this.logs, null, 2);
  }

  // Private methods

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    const levelOrder = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = levelOrder.indexOf(this.config.level);
    const logLevelIndex = levelOrder.indexOf(level);

    return logLevelIndex >= configLevelIndex && this.config.categories.includes(category);
  }

  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);

    // Trim logs if they exceed max size
    if (this.logs.length > this.config.maxLogSize) {
      this.logs = this.logs.slice(-this.config.maxLogSize);
    }

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.context || '');
        break;
      case 'info':
        console.info(message, entry.context || '');
        break;
      case 'warn':
        console.warn(message, entry.context || '');
        break;
      case 'error':
        console.error(message, entry.error || '', entry.context || '');
        if (entry.stackTrace && entry.error) {
          console.error(entry.stackTrace);
        }
        break;
    }
  }

  private sanitizeContext(context?: GeneralContext | SchedulerContext | PerformanceContext | CacheContext | HealthContext | ConnectionContext | SecurityContext | ErrorContext): GeneralContext | undefined {
    if (!context) {
return undefined;
}

    const sanitized: GeneralContext = {};
    for (const [key, value] of Object.entries(context)) {
      // Only redact actual sensitive field names, not all keys containing 'key'
      if (
        key.toLowerCase() === 'password' ||
        key.toLowerCase() === 'token' ||
        key.toLowerCase() === 'secret' ||
        key.toLowerCase() === 'apikey' ||
        key.toLowerCase() === 'authkey'
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        try {
          sanitized[key] = JSON.stringify(value);
        } catch {
          sanitized[key] = '[CIRCULAR]';
        }
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private categorizeError(error: Error): CategorizedError {
    if ('category' in error) {
      return error as CategorizedError;
    }

    const message = (error as Error).message.toLowerCase();
    let category: ErrorCategory = 'unknown';
    let isRetriable = false;

    // Connection errors
    if (
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('network')
    ) {
      category = 'connection';
      isRetriable = true;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      // Timeout errors
      category = 'timeout';
      isRetriable = true;
    } else if (
      // Serialization errors
      message.includes('json') ||
      message.includes('parse') ||
      message.includes('stringify')
    ) {
      category = 'serialization';
      isRetriable = false;
    } else if (
      // Authentication errors
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      category = 'authentication';
      isRetriable = false;
    } else if (message.includes('permission') || message.includes('access denied')) {
      // Permission errors
      category = 'permission';
      isRetriable = false;
    } else if (
      // Validation errors
      message.includes('invalid') ||
      message.includes('validation') ||
      message.includes('required')
    ) {
      category = 'validation';
      isRetriable = false;
    } else if (
      // Resource errors
      message.includes('resource') ||
      message.includes('memory') ||
      message.includes('disk')
    ) {
      category = 'resource';
      isRetriable = true;
    }

    const categorizedError = error as CategorizedError;
    categorizedError.category = category;
    categorizedError.isRetriable = isRetriable;
    categorizedError.timestamp = Date.now();

    return categorizedError;
  }

  private incrementErrorCount(category: ErrorCategory): void {
    const current = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, current + 1);
  }

  private updateOperationMetrics(operation: string, duration: number, isError: boolean): void {
    const current = this.operationMetrics.get(operation) || {
      count: 0,
      totalDuration: 0,
      errors: 0
    };
    current.count++;
    current.totalDuration += duration;
    if (isError) {
      current.errors++;
    }
    this.operationMetrics.set(operation, current);
  }
}

// Global logger instance
const logger = new StorageLogger();

// Convenience functions for different log levels
export function logDebug(
  category: LogCategory,
  message: string,
  context?: GeneralContext
): void {
  logger.log('debug', category, message, context);
}

export function logInfo(
  category: LogCategory,
  message: string,
  context?: GeneralContext
): void {
  logger.log('info', category, message, context);
}

export function logWarn(
  category: LogCategory,
  message: string,
  context?: GeneralContext
): void {
  logger.log('warn', category, message, context);
}

export function logError(
  error: Error,
  category: LogCategory,
  operation?: string,
  storageName?: string,
  context?: ErrorContext
): void {
  logger.logError(error, category, operation, storageName, context);
}

export function logPerformance(
  operation: string,
  storageName: string,
  duration: number,
  success: boolean,
  context?: PerformanceContext
): void {
  logger.logPerformance(operation, storageName, duration, success, context);
}

export function logConnection(
  storageName: string,
  event: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'retry',
  context?: ConnectionContext
): void {
  logger.logConnection(storageName, event, context);
}

export function logCache(
  operation: 'hit' | 'miss' | 'populate' | 'evict',
  key: string,
  storageName?: string,
  context?: CacheContext
): void {
  logger.logCache(operation, key, storageName, context);
}

export function logScheduler(
  event: 'push' | 'flush' | 'retry' | 'failed',
  key: string,
  storageName: string,
  context?: SchedulerContext
): void {
  logger.logScheduler(event, key, storageName, context);
}

export function logHealth(
  storageName: string,
  status: 'healthy' | 'degraded' | 'unhealthy',
  latency?: number,
  context?: HealthContext
): void {
  logger.logHealth(storageName, status, latency, context);
}

export function logSecurity(
  event: 'auth_failure' | 'permission_denied' | 'invalid_token' | 'rate_limit',
  context?: SecurityContext
): void {
  logger.logSecurity(event, context);
}

// Statistics and configuration functions
export function getStorageLogs(filters?: Parameters<StorageLogger['getLogs']>[0]): LogEntry[] {
  return logger.getLogs(filters);
}

export function getErrorStats(): ReturnType<StorageLogger['getErrorStats']> {
  return logger.getErrorStats();
}

export function getPerformanceStats(): ReturnType<StorageLogger['getPerformanceStats']> {
  return logger.getPerformanceStats();
}

export function configureLogging(config: Parameters<StorageLogger['configure']>[0]): void {
  logger.configure(config);
}

export function clearLogs(): void {
  logger.clear();
}

export function exportLogs(format: 'json' | 'csv' = 'json'): string {
  return logger.exportLogs(format);
}

// Error creation utilities
export function createCategorizedError(
  message: string,
  category: ErrorCategory,
  isRetriable: boolean = false,
  context?: ErrorContext
): CategorizedError {
  const error = new Error(message) as CategorizedError;
  error.category = category;
  error.isRetriable = isRetriable;
  if (context) {
    error.context = context;
  }
  error.timestamp = Date.now();
  return error;
}

export function isRetriableError(error: Error): boolean {
  if ('isRetriable' in error) {
    return (error as CategorizedError).isRetriable;
  }

  // Default heuristics for common retriable errors
  const message = (error as Error).message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('resource')
  );
}

// Export the logger instance for advanced usage
export { logger as StorageLogger };
