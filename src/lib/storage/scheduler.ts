// Background Push Scheduler
// Handles pushing data from memory to Redis and Database

import { getStorage, getMemoryStorage } from './registry.js';
import { logScheduler, logError, logPerformance, isRetriableError } from './logging.js';

/**
 * Schedule background pushes to Redis and Database
 * Memory -> Redis (5s) -> Database (10s) -> Flush from memory
 */
export function schedulePushes<T>(key: string, value: T): void {
  // Schedule Redis push after 5 seconds
  const redisStorage = getStorage('redis');
  if (redisStorage?.connected) {
    setTimeout(async () => {
      const startTime = Date.now();
      try {
        await redisStorage.set(key, value);
        const duration = Date.now() - startTime;

        logScheduler('push', key, 'redis', { duration });
        logPerformance('scheduled_push', 'redis', duration, true, { key });

        // Flush from memory after successful Redis push
        const memoryStorage = getMemoryStorage();
        if (memoryStorage) {
          const flushStartTime = Date.now();
          const flushed = await memoryStorage.delete(key);
          const flushDuration = Date.now() - flushStartTime;

          if (flushed) {
            logScheduler('flush', key, 'memory', { duration: flushDuration });
            logPerformance('scheduled_flush', 'memory', flushDuration, true, { key });
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logScheduler('failed', key, 'redis', { duration, error: (error as Error).message });
        logError(error as Error, 'scheduler', 'scheduled_push', 'redis', { key, duration });
        logPerformance('scheduled_push', 'redis', duration, false, { key, error: (error as Error).message });

        // Retry if error is retriable
        if (isRetriableError(error as Error)) {
          logScheduler('retry', key, 'redis', { retryDelay: 10000 });
          setTimeout(() => schedulePushes(key, value), 10000); // Retry after 10s
        }
      }
    }, 5000);
  } else {
    console.log(`ℹ️ Redis not available for ${key}, skipping Redis push`);
  }

  // Schedule Database push after 10 seconds
  const databaseStorage = getStorage('database');
  if (databaseStorage?.connected) {
    setTimeout(async () => {
      const startTime = Date.now();
      try {
        await databaseStorage.set(key, value);
        const duration = Date.now() - startTime;

        logScheduler('push', key, 'database', { duration });
        logPerformance('scheduled_push', 'database', duration, true, { key });
      } catch (error) {
        const duration = Date.now() - startTime;
        logScheduler('failed', key, 'database', { duration, error: (error as Error).message });
        logError(error as Error, 'scheduler', 'scheduled_push', 'database', { key, duration });
        logPerformance('scheduled_push', 'database', duration, false, {
          key,
          error: (error as Error).message
        });

        // Retry if error is retriable
        if (isRetriableError(error as Error)) {
          logScheduler('retry', key, 'database', { retryDelay: 15000 });
          setTimeout(async () => {
            try {
              await databaseStorage.set(key, value);
              logScheduler('push', key, 'database', { retry: true });
            } catch (retryError) {
              logScheduler('failed', key, 'database', { retry: true, error: retryError instanceof Error ? retryError.message : String(retryError) });
            }
          }, 15000); // Retry after 15s
        }
      }
    }, 10000);
  }
}

/**
 * Get active storage backends for monitoring
 */
export function getActiveStorages(): string[] {
  const active: string[] = [];

  if (getStorage('memory')?.connected) {
active.push('memory');
}
  if (getStorage('redis')?.connected) {
active.push('redis');
}
  if (getStorage('database')?.connected) {
active.push('database');
}

  return active;
}

/**
 * Get push status for a given configuration
 */
export function getPushStatus(): {
  redis: boolean;
  database: boolean;
  memoryFlush: boolean;
} {
  return {
    redis: getStorage('redis')?.connected || false,
    database: getStorage('database')?.connected || false,
    memoryFlush: getStorage('redis')?.connected || false // Memory flush depends on Redis
  };
}
