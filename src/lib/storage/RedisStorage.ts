// Redis Storage Implementation
// Redis backend with connection management and error handling

import Redis from 'ioredis';
import type { Storage } from './types.js';
import type { StorageStats } from '$lib/types/storage';

/**
 * Redis Storage - available when REDIS_URL is set
 */
export class RedisStorage implements Storage {
  name = 'redis';
  connected = false;

  private client: Redis | null = null;
  private connectionUrl: string;

  constructor(connectionUrl: string) {
    this.connectionUrl = connectionUrl;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`Redis storage get failed for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized);
    } catch (error) {
      console.warn(`Redis storage set failed for key ${key}:`, error);
      // Pure function - silent failure
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.warn(`Redis storage remove failed for key ${key}:`, error);
      return false;
    }
  }

  async connect(): Promise<void> {
    try {
      this.client = new Redis(this.connectionUrl, {
        // Retry configuration
        maxRetriesPerRequest: 3,
        lazyConnect: true,

        // Connection options
        connectTimeout: 10000,
        commandTimeout: 5000,

        // Reconnection
        reconnectOnError: error => {
          const targetError = 'READONLY';
          return (error as Error).message.includes(targetError);
        }
      });

      // Set up event handlers
      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.connected = true;
      });

      this.client.on('error', error => {
        console.warn('❌ Redis connection error:', error);
        this.connected = false;
      });

      this.client.on('close', () => {
        console.log('🔌 Redis connection closed');
        this.connected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
        this.connected = false;
      });

      this.client.on('ready', () => {
        console.log('🚀 Redis ready');
        this.connected = true;
      });

      // Attempt connection
      await this.client.connect();
    } catch (error) {
      console.warn('Failed to connect to Redis:', error);
      this.connected = false;
      this.client = null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      this.connected = false;
      console.log('🔌 Redis disconnected');
    } catch (error) {
      console.warn('Error disconnecting from Redis:', error);
      this.connected = false;
      this.client = null;
    }
  }

  // Redis-specific methods for monitoring and debugging

  /**
   * Check if Redis is responsive
   */
  async ping(): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.warn('Redis ping failed:', error);
      return false;
    }
  }

  /**
   * Get Redis info for monitoring
   */
  async getInfo(): Promise<Record<string, unknown> | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const info = await this.client.info();
      const lines = info.split('\r\n');
      const parsed: Record<string, unknown> = {};

      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            parsed[key] = isNaN(Number(value)) ? value : Number(value);
          }
        }
      }

      return parsed;
    } catch (error) {
      console.warn('Failed to get Redis info:', error);
      return null;
    }
  }

  /**
   * Get number of keys matching pattern (for debugging)
   */
  async countKeys(pattern: string = '*'): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      return keys.length;
    } catch (error) {
      console.warn('Failed to count Redis keys:', error);
      return 0;
    }
  }

  /**
   * Clear all keys (for testing)
   */
  async clear(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.flushdb();
    } catch (error) {
      console.warn('Failed to clear Redis:', error);
    }
  }

  // StorageEngine interface requirement - alias to remove
  async delete(key: string): Promise<boolean> {
    return this.remove(key);
  }

  // StorageEngine interface requirement
  async has(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.warn(`Redis has failed for key ${key}:`, error);
      return false;
    }
  }

  // StorageEngine interface requirement
  async keys(pattern?: string): Promise<string[]> {
    if (!this.connected || !this.client) {
      return [];
    }

    try {
      const keys = await this.client.keys(pattern || '*');
      return keys;
    } catch (error) {
      console.warn('Redis keys failed:', error);
      return [];
    }
  }

  // StorageEngine interface requirement - alias to has
  async exists(key: string): Promise<boolean> {
    return this.has(key);
  }

  // StorageEngine interface requirement - alias to countKeys
  async size(): Promise<number> {
    return this.countKeys();
  }

  // StorageEngine interface requirement
  async getMany<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    const results = await Promise.all(keys.map(key => this.get<T>(key)));
    return keys.map((key, index) => ({ key, value: results[index]! }));
  }

  // StorageEngine interface requirement
  async setMany<T>(entries: Array<{ key: string; value: T; options?: Record<string, unknown> }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value)));
  }

  // StorageEngine interface requirement
  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
deleted++;
}
    }
    return deleted;
  }

  // StorageEngine interface requirement
  async getStats(): Promise<StorageStats> {
    return {
      totalKeys: await this.size(),
      totalSize: 0, // Redis doesn't track total size
      connectionCount: this.connected ? 1 : 0,
      operationsPerSecond: 0, // Redis doesn't track operations in this implementation
      averageResponseTime: 0 // Redis doesn't track response time in this implementation
    };
  }

  // StorageEngine interface requirement
  async healthCheck(): Promise<import('$lib/types/storage').StorageHealth> {
    const start = Date.now();
    try {
      const isHealthy = await this.ping();
      const responseTime = Date.now() - start;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        checks: {
          connectivity: isHealthy,
          responseTime,
          memoryUsage: true,
          errorRate: true
        },
        lastCheck: new Date(),
        ...((!isHealthy) && { errors: ['Redis ping failed'] })
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        checks: {
          connectivity: false,
          responseTime: Date.now() - start,
          memoryUsage: true,
          errorRate: false
        },
        lastCheck: new Date(),
        errors: [(error as Error).message]
      };
    }
  }
}
