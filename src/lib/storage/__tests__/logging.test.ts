// Logging System Tests
// Comprehensive testing for error handling and structured logging

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  logDebug,
  logInfo,
  logWarn,
  logError,
  logPerformance,
  logConnection,
  logCache,
  logScheduler,
  logHealth,
  logSecurity,
  getStorageLogs,
  getErrorStats,
  getPerformanceStats,
  configureLogging,
  clearLogs,
  exportLogs,
  createCategorizedError,
  isRetriableError,
  type GeneralContext
} from '../logging.js';

// Mock console to avoid noise in tests
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearLogs();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearLogs();
  // Reset configuration to defaults for next test
  configureLogging({
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
  });
});

describe('Logging System', () => {
  describe('Basic Logging Functions', () => {
    it('should log debug messages', () => {
      logDebug('storage', 'Debug message', { key: 'test' });

      const logs = getStorageLogs({ level: 'debug', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.level).toBe('debug');
      expect(logs[0]!.category).toBe('storage');
      expect(logs[0]!.message).toBe('Debug message');
      expect(logs[0]!.context).toEqual({ key: 'test' });
    });

    it('should log info messages', () => {
      logInfo('system', 'Info message', { status: 'ok' });

      const logs = getStorageLogs({ level: 'info', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.level).toBe('info');
      expect(logs[0]!.category).toBe('system');
      expect(logs[0]!.message).toBe('Info message');
      expect(logs[0]!.context).toEqual({ status: 'ok' });
    });

    it('should log warning messages', () => {
      logWarn('connection', 'Warning message', { retry: true });

      const logs = getStorageLogs({ level: 'warn', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.level).toBe('warn');
      expect(logs[0]!.category).toBe('connection');
      expect(logs[0]!.message).toBe('Warning message');
      expect(logs[0]!.context).toEqual({ retry: true });
    });

    it('should log error messages with categorization', () => {
      const error = new Error('Test error');
      logError(error, 'storage', 'get', 'redis', { key: 'test' });

      const logs = getStorageLogs({ level: 'error', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.level).toBe('error');
      expect(logs[0]!.category).toBe('storage');
      expect(logs[0]!.message).toBe('Test error');
      expect(logs[0]!.storageName).toBe('redis');
      expect(logs[0]!.operation).toBe('get');
      expect(logs[0]!.context).toEqual({ key: 'test' });
      expect(logs[0]!.error).toBeDefined();
    });
  });

  describe('Specialized Logging Functions', () => {
    it('should log performance metrics', () => {
      logPerformance('get', 'redis', 150, true, { key: 'test' });

      const logs = getStorageLogs({ category: 'performance', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('performance');
      expect(logs[0]!.storageName).toBe('redis');
      expect(logs[0]!.operation).toBe('get');
      expect(logs[0]!.duration).toBe(150);
      expect(logs[0]!.message).toContain('completed');
      expect(logs[0]!.message).toContain('150ms');
    });

    it('should log connection events', () => {
      logConnection('redis', 'connected', { host: 'localhost' });

      const logs = getStorageLogs({ category: 'connection', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('connection');
      expect(logs[0]!.level).toBe('info');
      expect(logs[0]!.message).toContain('redis connected');
    });

    it('should log cache operations', () => {
      logCache('hit', 'test-key', 'redis', { latency: 5 });

      const logs = getStorageLogs({ category: 'cache', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('cache');
      expect(logs[0]!.message).toContain('Cache hit for key test-key');
    });

    it('should log scheduler events', () => {
      logScheduler('push', 'test-key', 'redis', { duration: 100 });

      const logs = getStorageLogs({ category: 'scheduler', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('scheduler');
      expect(logs[0]!.message).toContain('Scheduler push for test-key → redis');
    });

    it('should log health check results', () => {
      logHealth('redis', 'healthy', 50, { connections: 10 });

      const logs = getStorageLogs({ category: 'health', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('health');
      expect(logs[0]!.level).toBe('info');
      expect(logs[0]!.message).toContain('redis health: healthy (50ms)');
    });

    it('should log security events', () => {
      logSecurity('auth_failure', { ip: '192.168.1.1' });

      const logs = getStorageLogs({ category: 'security', limit: 1 });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('security');
      expect(logs[0]!.level).toBe('warn');
      expect(logs[0]!.message).toContain('Security event: auth_failure');
    });
  });

  describe('Error Categorization', () => {
    it('should categorize connection errors', () => {
      const error = createCategorizedError('Connection refused', 'connection', true);
      expect(error.category).toBe('connection');
      expect(error.isRetriable).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('should categorize timeout errors', () => {
      const error = new Error('Operation timed out');
      expect(isRetriableError(error)).toBe(true);
    });

    it('should categorize validation errors as non-retriable', () => {
      const error = createCategorizedError('Invalid input', 'validation', false);
      expect(error.category).toBe('validation');
      expect(error.isRetriable).toBe(false);
    });

    it('should detect retriable errors from message content', () => {
      const connectionError = new Error('ECONNREFUSED');
      const timeoutError = new Error('Request timeout');
      const validationError = new Error('Invalid JSON format');

      expect(isRetriableError(connectionError)).toBe(true);
      expect(isRetriableError(timeoutError)).toBe(true);
      expect(isRetriableError(validationError)).toBe(false);
    });
  });

  describe('Log Filtering and Retrieval', () => {
    beforeEach(() => {
      // Add various log entries
      logDebug('storage', 'Debug message');
      logInfo('system', 'Info message');
      logWarn('connection', 'Warning message');
      logError(new Error('Test error'), 'storage', 'get', 'redis');
      logPerformance('set', 'memory', 10, true);
    });

    it('should filter logs by level', () => {
      const warnLogs = getStorageLogs({ level: 'warn' });
      expect(warnLogs).toHaveLength(2); // warn and error logs
      expect(warnLogs.every(log => ['warn', 'error'].includes(log.level))).toBe(true);
    });

    it('should filter logs by category', () => {
      const storageLogs = getStorageLogs({ category: 'storage' });
      expect(storageLogs).toHaveLength(2); // debug and error logs
      expect(storageLogs.every(log => log.category === 'storage')).toBe(true);
    });

    it('should filter logs by storage name', () => {
      const redisLogs = getStorageLogs({ storageName: 'redis' });
      expect(redisLogs).toHaveLength(1); // error log
      expect(redisLogs[0]!.storageName).toBe('redis');
    });

    it('should filter logs by operation', () => {
      const getLogs = getStorageLogs({ operation: 'get' });
      expect(getLogs).toHaveLength(1); // error log
      expect(getLogs[0]!.operation).toBe('get');
    });

    it('should limit log results', () => {
      const limitedLogs = getStorageLogs({ limit: 2 });
      expect(limitedLogs).toHaveLength(2);
    });

    it('should filter logs by timestamp', () => {
      const since = Date.now() - 1000; // Last second
      const recentLogs = getStorageLogs({ since });
      expect(recentLogs.length).toBeGreaterThan(0);
      expect(recentLogs.every(log => log.timestamp >= since)).toBe(true);
    });
  });

  describe('Error Statistics', () => {
    beforeEach(() => {
      // Add various errors
      logError(createCategorizedError('Connection failed', 'connection', true), 'storage');
      logError(createCategorizedError('Timeout occurred', 'timeout', true), 'storage');
      logError(createCategorizedError('Invalid data', 'validation', false), 'storage');
      logError(new Error('Unknown error'), 'storage'); // Will be categorized as 'unknown'
    });

    it('should provide error statistics', () => {
      const stats = getErrorStats();

      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByCategory.connection).toBe(1);
      expect(stats.errorsByCategory.timeout).toBe(1);
      expect(stats.errorsByCategory.validation).toBe(1);
      expect(stats.errorsByCategory.unknown).toBe(1);
      expect(stats.recentErrors).toHaveLength(4);
      expect(stats.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Performance Statistics', () => {
    beforeEach(() => {
      // Add various performance metrics
      logPerformance('get', 'redis', 50, true);
      logPerformance('get', 'redis', 75, true);
      logPerformance('get', 'redis', 100, false); // Error
      logPerformance('set', 'memory', 5, true);
      logPerformance('set', 'memory', 3, true);
    });

    it('should provide performance statistics', () => {
      const stats = getPerformanceStats();

      expect(stats.get).toBeDefined();
      expect(stats.get!.count).toBe(3);
      expect(stats.get!.averageDuration).toBe(75); // (50 + 75 + 100) / 3
      expect(stats.get!.errorRate).toBeCloseTo(0.33); // 1 error out of 3
      expect(stats.get!.totalDuration).toBe(225);

      expect(stats.set).toBeDefined();
      expect(stats.set!.count).toBe(2);
      expect(stats.set!.averageDuration).toBe(4); // (5 + 3) / 2
      expect(stats.set!.errorRate).toBe(0); // No errors
    });
  });

  describe('Configuration Management', () => {
    it('should configure logging settings', () => {
      configureLogging({
        level: 'warn',
        categories: ['storage', 'connection'],
        enablePerformanceLogging: false
      });

      // Debug log should be filtered out
      logDebug('storage', 'Debug message');
      let logs = getStorageLogs();
      expect(logs).toHaveLength(0);

      // Warning log should be included
      logWarn('storage', 'Warning message');
      logs = getStorageLogs();
      expect(logs).toHaveLength(1);

      // Performance logging should be disabled
      logPerformance('get', 'redis', 50, true);
      const perfLogs = getStorageLogs({ category: 'performance' });
      expect(perfLogs).toHaveLength(0);
    });

    it('should filter categories based on configuration', () => {
      clearLogs(); // Clear before this test
      configureLogging({
        categories: ['storage']
      });

      logInfo('storage', 'Storage message');
      logInfo('system', 'System message'); // This should be filtered out

      const logs = getStorageLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.category).toBe('storage');

      // Reset config for other tests
      configureLogging({
        categories: [
          'storage',
          'connection',
          'performance',
          'cache',
          'scheduler',
          'health',
          'security',
          'system'
        ]
      });
    });
  });

  describe('Data Export', () => {
    beforeEach(() => {
      clearLogs(); // Clear before each test
      logInfo('storage', 'Test message', { key: 'test' });
      logError(new Error('Test error'), 'storage', 'get', 'redis');
    });

    it('should export logs as JSON', () => {
      const logs = getStorageLogs(); // Check we have the logs first
      expect(logs).toHaveLength(2);

      const exported = exportLogs('json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('timestamp');
      expect(parsed[0]).toHaveProperty('level');
      expect(parsed[0]).toHaveProperty('category');
      expect(parsed[0]).toHaveProperty('message');
    });

    it('should export logs as CSV', () => {
      const logs = getStorageLogs(); // Check we have the logs first
      expect(logs).toHaveLength(2);

      const exported = exportLogs('csv');
      const lines = exported.split('\n');

      expect(lines[0]).toContain('timestamp,level,category,message');
      expect(lines).toHaveLength(3); // Header + 2 data rows
      expect(lines[1]).toContain('info');
      expect(lines[2]).toContain('error');
    });
  });

  describe('Context Sanitization', () => {
    it('should redact sensitive information', () => {
      clearLogs(); // Clear before this test
      logInfo('storage', 'Test message', {
        password: 'secret123',
        token: 'abc123',
        apiKey: 'xyz789',
        normalData: 'visible'
      } as GeneralContext);

      const logs = getStorageLogs({ limit: 1 });
      expect(logs).toHaveLength(1);
      const context = logs[0]!.context! as Record<string, unknown>;

      expect(context.password).toBe('[REDACTED]');
      expect(context.token).toBe('[REDACTED]');
      expect(context.apiKey).toBe('[REDACTED]');
      expect(context.normalData).toBe('visible');
    });

    it('should handle nested objects in context', () => {
      clearLogs(); // Clear before this test
      logInfo('storage', 'Test message', {
        config: { host: 'localhost', port: 6379 },
        array: [1, 2, 3]
      } as unknown as GeneralContext);

      const logs = getStorageLogs({ limit: 1 });
      expect(logs).toHaveLength(1);
      const context = logs[0]!.context! as Record<string, unknown>;

      expect(typeof context.config).toBe('string');
      expect(typeof context.array).toBe('string');
      expect(context.config).toContain('localhost');
    });
  });

  describe('Log Size Management', () => {
    it('should limit log history size', () => {
      clearLogs(); // Clear before this test
      configureLogging({ maxLogSize: 5 });

      // Add more logs than the limit
      for (let i = 0; i < 10; i++) {
        logInfo('storage', `Message ${i}`);
      }

      const logs = getStorageLogs();
      expect(logs).toHaveLength(5);

      // Should keep the most recent logs
      expect(logs[logs.length - 1]!.message).toBe('Message 9');
      expect(logs[0]!.message).toBe('Message 5');

      // Reset config for other tests
      configureLogging({ maxLogSize: 1000 });
    });
  });

  describe('Error Handling in Logging', () => {
    it('should handle circular references in context', () => {
      clearLogs(); // Clear before this test
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw error
      expect(() => {
        logInfo('storage', 'Test message', { circular });
      }).not.toThrow();

      const logs = getStorageLogs({ limit: 1 });
      expect(logs).toHaveLength(1);
    });

    it('should handle undefined and null context values', () => {
      clearLogs(); // Clear before this test
      logInfo('storage', 'Test message', {
        undefined: undefined,
        null: null,
        empty: '',
        zero: 0
      } as unknown as GeneralContext);

      const logs = getStorageLogs({ limit: 1 });
      expect(logs).toHaveLength(1);
      const context = logs[0]!.context! as Record<string, unknown>;

      expect(context.undefined).toBeUndefined();
      expect(context.null).toBeNull();
      expect(context.empty).toBe('');
      expect(context.zero).toBe(0);
    });
  });
});

describe('Integration with Storage Operations', () => {
  it('should maintain consistent log format across operations', () => {
    // Simulate various storage operations
    logPerformance('get', 'redis', 50, true, { key: 'test' });
    logCache('hit', 'test', 'redis');
    logScheduler('push', 'test', 'redis');
    logConnection('redis', 'connected');

    const logs = getStorageLogs();

    // All logs should have consistent structure
    logs.forEach(log => {
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('level');
      expect(log).toHaveProperty('category');
      expect(log).toHaveProperty('message');
      expect(typeof log.timestamp).toBe('number');
      expect(['debug', 'info', 'warn', 'error']).toContain(log.level);
    });
  });

  it('should track operation lifecycle through logs', () => {
    const key = 'lifecycle-test';

    // Simulate a complete operation lifecycle
    logPerformance('get', 'redis', 10, false, { key, error: 'timeout' });
    logCache('miss', key, 'redis');
    logPerformance('get', 'database', 50, true, { key });
    logCache('hit', key, 'database');
    logCache('populate', key, 'redis');

    const logs = getStorageLogs();
    const keyLogs = logs.filter(log => (log.context as Record<string, unknown>)?.key === key || log.message.includes(key));

    expect(keyLogs.length).toBeGreaterThan(0);

    // Should show the progression of the operation
    const operations = keyLogs.map(log => log.operation || (log.context as Record<string, unknown>)?.operation || 'cache');
    expect(operations).toContain('get');
  });
});
