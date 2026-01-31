// Memory Storage Implementation
// Simple Map-based storage that's always available

import type { Storage } from './types.js';
import type { StorageHealth, StorageStats } from '$types';

/**
 * Memory Storage - always available, no external dependencies
 */
export class MemoryStorage implements Storage {
  name = 'memory';
  connected = true;

  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = this.data.get(key);
      // If key doesn't exist, return null; otherwise return the actual value (including undefined)
      return this.data.has(key) ? (value as T) : null;
    } catch (error) {
      console.warn(`Memory storage get failed for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      this.data.set(key, value);
    } catch (error) {
      console.warn(`Memory storage set failed for key ${key}:`, error);
      // Pure function - no throw, just silent failure
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      return this.data.delete(key);
    } catch (error) {
      console.warn(`Memory storage remove failed for key ${key}:`, error);
      return false;
    }
  }

  async connect(): Promise<void> {
    // Memory storage is always connected
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Clear all data on disconnect
    this.data.clear();
    // But memory storage remains "connected"
    this.connected = true;
  }

  // Memory-specific methods for testing and monitoring

  /**
   * Get the number of items in memory storage
   */
  async size(): Promise<number> {
    return this.data.size;
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this.data.clear();
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Get all keys (for debugging)
   */
  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  /**
   * Delete a key (alias for remove to match StorageEngine interface)
   */
  async delete(key: string): Promise<boolean> {
    return this.remove(key);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  /**
   * Get multiple values at once
   */
  async getMany<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    const results = await Promise.all(keys.map(key => this.get<T>(key)));
    return keys.map((key, index) => ({ key, value: results[index]! }));
  }

  /**
   * Set multiple key-value pairs at once
   */
  async setMany<T>(entries: Array<{ key: string; value: T; options?: Record<string, unknown> }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value)));
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
deleted++;
}
    }
    return deleted;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    return {
      totalKeys: this.data.size,
      totalSize: 0, // Memory storage doesn't track size
      connectionCount: this.connected ? 1 : 0,
      operationsPerSecond: 0, // Memory storage doesn't track operations
      averageResponseTime: 0 // Memory storage is instant
    };
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<StorageHealth> {
    const start = Date.now();
    try {
      // Test read/write to verify functionality
      const testKey = '__health_check__';
      await this.set(testKey, 'test');
      await this.get(testKey);
      await this.delete(testKey);
      const responseTime = Date.now() - start;
      return {
        status: 'healthy',
        checks: {
          connectivity: true,
          responseTime,
          memoryUsage: true,
          errorRate: true
        },
        lastCheck: new Date()
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
