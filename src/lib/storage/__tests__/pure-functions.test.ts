// Pure Functions Unit Tests
// Testing the main storage interface functions

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get, set, remove, mget, mset, initializeStorages, getSystemHealth } from '../index.js';
import { registerStorage, getStorage } from '../registry.js';
import { MemoryStorage } from '../MemoryStorage.js';
import type { Storage } from '../types.js';
import type { StorageHealth } from '$lib/types/storage';

// Mock console.log to avoid noise in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock storage for testing
class MockStorage implements Storage {
  name: string;
  connected: boolean;
  private data = new Map<string, any>();

  constructor(name: string, connected: boolean = true) {
    this.name = name;
    this.connected = connected;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) {
return null;
}
    return this.data.get(key) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected) {
return;
}
    this.data.set(key, value);
  }

  async remove(key: string): Promise<boolean> {
    if (!this.connected) {
return false;
}
    return this.data.delete(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.remove(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async getMany<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    const results = await Promise.all(keys.map(key => this.get<T>(key)));
    return keys.map((key, index) => ({ key, value: results[index]! }));
  }

  async setMany<T>(entries: Array<{ key: string; value: T; options?: any }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value)));
  }

  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
deleted++;
}
    }
    return deleted;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.data.clear();
  }

  async getStats(): Promise<any> {
    return {
      size: this.data.size,
      connected: this.connected
    };
  }

  async healthCheck(): Promise<StorageHealth> {
    return {
      status: this.connected ? 'healthy' : 'unhealthy',
      checks: {
        connectivity: this.connected,
        responseTime: 0,
        memoryUsage: true,
        errorRate: true
      },
      lastCheck: new Date()
    };
  }

  // Test helpers
  async size(): Promise<number> {
    return this.data.size;
  }
}

describe('Pure Storage Functions', () => {
  let memoryStorage: MemoryStorage;
  let mockRedisStorage: MockStorage;
  let mockDbStorage: MockStorage;

  beforeEach(async () => {
    // Set up fresh storage instances
    memoryStorage = new MemoryStorage();
    mockRedisStorage = new MockStorage('redis', true);
    mockDbStorage = new MockStorage('database', true);

    // Register storages
    registerStorage('memory', memoryStorage);
    registerStorage('redis', mockRedisStorage);
    registerStorage('database', mockDbStorage);
  });

  afterEach(() => {
    memoryStorage.clear();
    mockRedisStorage.clear();
    mockDbStorage.clear();
  });

  describe('get() function', () => {
    it('should return null for non-existent keys', async () => {
      const value = await get('non-existent');
      expect(value).toBeNull();
    });

    it('should retrieve from memory when available', async () => {
      await memoryStorage.set('test-key', 'memory-value');

      const value = await get('test-key');
      expect(value).toBe('memory-value');
    });

    it('should fallback to redis when not in memory', async () => {
      await mockRedisStorage.set('test-key', 'redis-value');

      const value = await get('test-key');
      expect(value).toBe('redis-value');
    });

    it('should fallback to database when not in memory or redis', async () => {
      await mockDbStorage.set('test-key', 'db-value');

      const value = await get('test-key');
      expect(value).toBe('db-value');
    });

    it('should try storages in priority order', async () => {
      // Set different values in different storages
      await memoryStorage.set('test-key', 'memory-value');
      await mockRedisStorage.set('test-key', 'redis-value');
      await mockDbStorage.set('test-key', 'db-value');

      // Should get redis value (highest priority in read order)
      const value = await get('test-key');
      expect(value).toBe('redis-value');
    });

    it('should handle storage connection failures gracefully', async () => {
      // Disconnect redis
      await mockRedisStorage.disconnect();
      await mockDbStorage.set('test-key', 'db-value');

      const value = await get('test-key');
      expect(value).toBe('db-value'); // Should fallback to database
    });

    it('should return null when all storages fail', async () => {
      // Disconnect all storages except memory
      await mockRedisStorage.disconnect();
      await mockDbStorage.disconnect();

      const value = await get('non-existent');
      expect(value).toBeNull();
    });
  });

  describe('set() function', () => {
    it('should store in memory immediately', async () => {
      await set('test-key', 'test-value');

      // Should be in memory immediately
      const memoryValue = await memoryStorage.get('test-key');
      expect(memoryValue).toBe('test-value');
    });

    it('should handle different data types', async () => {
      const testData = {
        string: 'hello',
        number: 42,
        boolean: true,
        object: { nested: 'value' },
        array: [1, 2, 3],
        null: null
      };

      for (const [key, value] of Object.entries(testData)) {
        await set(key, value);
        const retrieved = await get(key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should not throw on memory storage failure', async () => {
      // Mock memory storage to fail
      const originalSet = memoryStorage.set;
      memoryStorage.set = vi.fn().mockRejectedValue(new Error('Storage failed'));

      // Should not throw
      await expect(set('test-key', 'test-value')).resolves.toBeUndefined();

      // Restore original method
      memoryStorage.set = originalSet;
    });
  });

  describe('remove() function', () => {
    it('should remove from all connected storages', async () => {
      // Set value in all storages
      await memoryStorage.set('test-key', 'value');
      await mockRedisStorage.set('test-key', 'value');
      await mockDbStorage.set('test-key', 'value');

      const result = await remove('test-key');
      expect(result).toBe(true);

      // Should be removed from all storages
      expect(await memoryStorage.get('test-key')).toBeNull();
      expect(await mockRedisStorage.get('test-key')).toBeNull();
      expect(await mockDbStorage.get('test-key')).toBeNull();
    });

    it('should return false when no storages have the key', async () => {
      const result = await remove('non-existent');
      expect(result).toBe(false);
    });

    it('should return true if at least one storage succeeds', async () => {
      await memoryStorage.set('test-key', 'value');
      await mockRedisStorage.disconnect(); // Make redis fail

      const result = await remove('test-key');
      expect(result).toBe(true); // Memory removal should succeed
    });

    it('should handle storage failures gracefully', async () => {
      // Mock all storages to fail
      const originalMemoryRemove = memoryStorage.remove;
      memoryStorage.remove = vi.fn().mockRejectedValue(new Error('Remove failed'));

      await mockRedisStorage.disconnect();
      await mockDbStorage.disconnect();

      const result = await remove('test-key');
      expect(result).toBe(false);

      // Restore original method
      memoryStorage.remove = originalMemoryRemove;
    });
  });

  describe('Batch Operations', () => {
    describe('mget() function', () => {
      it('should retrieve multiple keys', async () => {
        await set('key1', 'value1');
        await set('key2', 'value2');
        await set('key3', 'value3');

        const values = await mget(['key1', 'key2', 'key3', 'non-existent']);
        expect(values).toEqual(['value1', 'value2', 'value3', null]);
      });

      it('should handle empty key array', async () => {
        const values = await mget([]);
        expect(values).toEqual([]);
      });

      it('should handle mix of existing and non-existing keys', async () => {
        await set('exists', 'value');

        const values = await mget(['exists', 'not-exists']);
        expect(values).toEqual(['value', null]);
      });
    });

    describe('mset() function', () => {
      it('should set multiple key-value pairs', async () => {
        const pairs = [
          { key: 'key1', value: 'value1' },
          { key: 'key2', value: 'value2' },
          { key: 'key3', value: 'value3' }
        ];

        await mset(pairs);

        expect(await get('key1')).toBe('value1');
        expect(await get('key2')).toBe('value2');
        expect(await get('key3')).toBe('value3');
      });

      it('should handle empty pairs array', async () => {
        await expect(mset([])).resolves.toBeUndefined();
      });

      it('should handle different data types in batch', async () => {
        const pairs: Array<{ key: string; value: any }> = [
          { key: 'string', value: 'hello' },
          { key: 'number', value: 42 },
          { key: 'object', value: { test: true } }
        ];

        await mset(pairs);

        expect(await get('string')).toBe('hello');
        expect(await get('number')).toBe(42);
        expect(await get('object')).toEqual({ test: true });
      });
    });
  });

  describe('initializeStorages() function', () => {
    it('should initialize memory storage', async () => {
      await initializeStorages();

      const memory = getStorage('memory');
      expect(memory).toBeInstanceOf(MemoryStorage);
      expect(memory?.connected).toBe(true);
    });

    it('should not throw on initialization', async () => {
      await expect(initializeStorages()).resolves.toBeUndefined();
    });
  });

  describe('getSystemHealth() function', () => {
    it('should return system health status', async () => {
      const health = await getSystemHealth();

      expect(health).toHaveProperty('storages');
      expect(health).toHaveProperty('memoryKeys');
      expect(health).toHaveProperty('timestamp');
      expect(typeof health.memoryKeys).toBe('number');
      expect(typeof health.timestamp).toBe('number');
    });

    it('should reflect memory storage size', async () => {
      await set('key1', 'value1');
      await set('key2', 'value2');

      const health = await getSystemHealth();
      expect(health.memoryKeys).toBe(2);
    });

    it('should include storage connection status', async () => {
      const health = await getSystemHealth();

      expect(health.storages).toHaveProperty('memory');
      expect(health.storages).toHaveProperty('redis');
      expect(health.storages).toHaveProperty('database');
    });
  });
});
