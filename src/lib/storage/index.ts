// Pure Function Storage Interface
// Main entry point for all storage operations

import type {  } from './types.js';
import { MemoryStorage } from './MemoryStorage.js';
import { RedisStorage } from './RedisStorage.js';
import { DatabaseStorage } from './DatabaseStorage.js';
import {
  registerStorage,
  getStorage,
  getConnectedStorages,
  getMemoryStorage,
  getStorageHealth
} from './registry.js';
import { schedulePushes } from './scheduler.js';
import {
  logDebug,
  logInfo,
  logWarn as _logWarn,
  logError,
  logPerformance,
  logCache,
  logConnection,
  isRetriableError,
  createCategorizedError
} from './logging.js';

// Export types
export type {
  Storage,
  User,
  DeviceToken,
  NotificationRequest,
  NotificationResult
} from './types.js';

// Export device and notification functions
export {
  registerDevice,
  getDevices,
  getActiveDevices,
  removeDevice,
  removeDeviceByToken,
  deactivateDevice,
  cleanupInactiveDevices,
  getDeviceStats,
  getGlobalDeviceStats,
  sendNotificationToAllDevices,
  sendNotificationToDeviceById,
  broadcastNotification
} from './notifications.js';

// Export registry functions
export { registerStorage, getStorage, getConnectedStorages, getStorageHealth } from './registry.js';

// Export logging and monitoring functions
export {
  getStorageLogs,
  getErrorStats,
  getPerformanceStats,
  configureLogging,
  clearLogs,
  exportLogs,
  createCategorizedError,
  isRetriableError
} from './logging.js';

// Export performance metrics and optimization functions
export {
  recordPerformanceMetric,
  getPerformanceStats as getDetailedPerformanceStats,
  generatePerformanceReport,
  benchmarkStorage,
  optimizeStorageSystem,
  configureMetrics,
  resetMetrics,
  exportPerformanceMetrics
} from './metrics.js';

// Export health monitoring functions
export {
  checkAllStorages,
  checkStorageHealth,
  getStoragePerformanceTrends,
  getStorageHealthHistory,
  configureHealthMonitoring,
  healthCheckEndpoint,
  simpleHealthCheck
} from './health.js';

// Export monitoring and alerting functions
export {
  startMonitoring,
  stopMonitoring,
  getActiveAlerts,
  getAllAlerts,
  resolveAlert,
  acknowledgeAlert,
  getMonitoringStats,
  configureMonitoring,
  resetMonitoring
} from './monitoring.js';

// Export shutdown management functions
export {
  initializeShutdownHandler,
  shutdown,
  getShutdownStatus,
  isShuttingDown,
  registerOperation,
  unregisterOperation,
  wrapOperation,
  shutdownHealthCheck,
  configureShutdown
} from './shutdown.js';

/**
 * Pure function to get data from storage
 * Tries each storage in priority order: Redis -> Database -> Memory -> null
 * Populates upstream caches when data is found in slower storage
 */
export async function get<T>(key: string): Promise<T | null> {
  const startTime = Date.now();

  // Try each storage in priority order
  const storages = ['redis', 'database', 'memory'];

  for (let i = 0; i < storages.length; i++) {
    const storageName = storages[i]!;
    const storageStartTime = Date.now();

    try {
      const storage = getStorage(storageName);
      if (storage?.connected) {
        const value = await storage.get<T>(key);
        const duration = Date.now() - storageStartTime;

        if (value !== null) {
          logDebug('storage', `Retrieved ${key} from ${storageName}`, {
            key,
            storageName,
            duration
          });
          logCache('hit', key, storageName, { duration });
          logPerformance('get', storageName, duration, true, { key, found: true });

          // Populate upstream caches if data found in slower storage
          if (i > 0) {
            await populateUpstreamCaches(key, value, i);
          }

          return value;
        } else {
          logCache('miss', key, storageName, { duration });
          logPerformance('get', storageName, duration, true, { key, found: false });
        }
      }
    } catch (error) {
      const duration = Date.now() - storageStartTime;
      logError(error as Error, 'storage', 'get', storageName, { key, duration });
      logPerformance('get', storageName, duration, false, { key, error: (error as Error).message });

      // If error is not retriable, fail fast
      if (!isRetriableError(error as Error)) {
        logDebug('storage', `Non-retriable error in ${storageName}, stopping get operation`, {
          key,
          error: (error as Error).message
        });
        break;
      }

      continue; // Try next storage
    }
  }

  const totalDuration = Date.now() - startTime;
  logDebug('storage', `Key ${key} not found in any storage`, { key, totalDuration });
  return null; // All failed
}

/**
 * Populate upstream caches when data is found in slower storage
 */
async function populateUpstreamCaches<T>(
  key: string,
  value: T,
  foundAtIndex: number
): Promise<void> {
  const storages = ['redis', 'database', 'memory'];

  // Populate all storages that are faster than where we found the data
  for (let i = 0; i < foundAtIndex; i++) {
    const storageName = storages[i]!;
    const startTime = Date.now();

    try {
      const storage = getStorage(storageName);
      if (storage?.connected) {
        await storage.set(key, value);
        const duration = Date.now() - startTime;
        logCache('populate', key, storageName, { duration, sourceIndex: foundAtIndex });
        logPerformance('cache_populate', storageName, duration, true, { key });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(error as Error, 'cache', 'cache_populate', storageName, {
        key,
        duration,
        sourceIndex: foundAtIndex
      });
      logPerformance('cache_populate', storageName, duration, false, { key, error: (error as Error).message });
      // Continue with other caches even if one fails
    }
  }
}

/**
 * Pure function to set data in storage
 * Immediately stores in memory, then schedules background pushes
 */
export async function set<T>(key: string, value: T): Promise<void> {
  const startTime = Date.now();

  try {
    // Validate input
    if (typeof key !== 'string' || key.length === 0) {
      throw createCategorizedError('Invalid key: must be non-empty string', 'validation', false, {
        key
      });
    }

    // Store in memory immediately
    const memoryStorage = getMemoryStorage();
    if (memoryStorage) {
      const memoryStartTime = Date.now();
      await memoryStorage.set(key, value);
      const memoryDuration = Date.now() - memoryStartTime;

      logDebug('storage', `Stored ${key} in memory immediately`, { key, duration: memoryDuration });
      logPerformance('set', 'memory', memoryDuration, true, { key });
    } else {
      logError(new Error('Memory storage not available'), 'storage', 'set', 'memory', { key });
    }

    // Schedule pushes to other storages
    schedulePushes(key, value);

    const totalDuration = Date.now() - startTime;
    logPerformance('set_total', 'all', totalDuration, true, { key });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error as Error, 'storage', 'set', undefined, { key, duration });
    logPerformance('set_total', 'all', duration, false, { key, error: (error as Error).message });
    // Pure function - no throw, just silent failure
  }
}

/**
 * Pure function to remove data from storage
 * Removes from all connected storages
 */
export async function remove(key: string): Promise<boolean> {
  const startTime = Date.now();
  const connectedStorages = getConnectedStorages();

  try {
    // Validate input
    if (typeof key !== 'string' || key.length === 0) {
      throw createCategorizedError('Invalid key: must be non-empty string', 'validation', false, {
        key
      });
    }

    const results = await Promise.allSettled(
      connectedStorages.map(async storage => {
        const storageStartTime = Date.now();
        try {
          const result = await storage.delete(key);
          const duration = Date.now() - storageStartTime;
          logPerformance('remove', storage.name, duration, true, { key, removed: result });
          return result;
        } catch (error) {
          const duration = Date.now() - storageStartTime;
          logError(error as Error, 'storage', 'remove', storage.name, { key, duration });
          logPerformance('remove', storage.name, duration, false, { key, error: (error as Error).message });
          throw error;
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    const failureCount = results.filter(r => r.status === 'rejected').length;

    const success = successCount > 0;
    const totalDuration = Date.now() - startTime;

    logDebug(
      'storage',
      `Removed ${key} from ${successCount}/${connectedStorages.length} storages`,
      {
        key,
        successCount,
        failureCount,
        totalDuration
      }
    );

    logPerformance('remove_total', 'all', totalDuration, success, {
      key,
      successCount,
      failureCount,
      totalStorages: connectedStorages.length
    });

    return success;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error as Error, 'storage', 'remove', undefined, { key, duration });
    logPerformance('remove_total', 'all', duration, false, { key, error: (error as Error).message });
    return false;
  }
}

/**
 * Batch get operation
 */
export async function mget<T>(keys: string[]): Promise<(T | null)[]> {
  return Promise.all(keys.map(key => get<T>(key)));
}

/**
 * Batch set operation
 */
export async function mset<T>(pairs: Array<{ key: string; value: T }>): Promise<void> {
  await Promise.all(pairs.map(({ key, value }) => set(key, value)));
}

/**
 * Initialize storage system
 * Auto-detects available storage backends and registers them
 */
export async function initializeStorages(): Promise<void> {
  const startTime = Date.now();
  logInfo('system', 'Initializing storage system');

  try {
    // Always register memory storage first
    const memoryStorage = new MemoryStorage();
    registerStorage('memory', memoryStorage);

    try {
      await memoryStorage.connect();
      logConnection('memory', 'connected');
    } catch (error) {
      logConnection('memory', 'failed', { error: (error as Error).message });
      throw createCategorizedError('Memory storage initialization failed', 'resource', false, {
        error: (error as Error).message
      });
    }

    // Auto-detect and register Redis storage if REDIS_URL available
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      logInfo('system', 'Detected REDIS_URL, initializing Redis storage');
      const redisStorage = new RedisStorage(redisUrl);
      registerStorage('redis', redisStorage);

      try {
        logConnection('redis', 'connecting');
        await redisStorage.connect();
        logConnection('redis', 'connected');
      } catch (error) {
        logConnection('redis', 'failed', { error: (error as Error).message });
        logError(error as Error, 'connection', 'connect', 'redis');
      }
    } else {
      logInfo('system', 'No REDIS_URL found, skipping Redis storage');
    }

    // Auto-detect and register Database storage if DATABASE_URL available
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      logInfo('system', 'Detected DATABASE_URL, initializing Database storage');
      const databaseStorage = new DatabaseStorage(databaseUrl);
      registerStorage('database', databaseStorage);

      try {
        logConnection('database', 'connecting');
        await databaseStorage.connect();
        logConnection('database', 'connected');
      } catch (error) {
        logConnection('database', 'failed', { error: (error as Error).message });
        logError(error as Error, 'connection', 'connect', 'database');
      }
    } else {
      logInfo('system', 'No DATABASE_URL found, skipping Database storage');
    }

    const duration = Date.now() - startTime;
    const connectedStorages = getConnectedStorages();
    const storageNames = connectedStorages.map(s => s.name);

    logInfo('system', `Storage system initialized in ${duration}ms`, {
      duration,
      connectedStorages: storageNames.length,
      storages: storageNames.join(', ')
    });

    logPerformance('initialize_storages', 'system', duration, true, {
      storageCount: storageNames.length
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error as Error, 'system', 'initialize_storages', undefined, { duration });
    logPerformance('initialize_storages', 'system', duration, false, { error: (error as Error).message });
    throw error; // Re-throw since initialization failure is critical
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth(): Promise<{
  storages: Record<string, boolean>;
  memoryKeys: number;
  timestamp: number;
}> {
  const memoryStorage = getMemoryStorage() as MemoryStorage;

  return {
    storages: getStorageHealth(),
    memoryKeys: (await memoryStorage?.size()) || 0,
    timestamp: Date.now()
  };
}
