// Redis Storage Unit Tests
// Comprehensive testing for Redis storage implementation

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisStorage } from '../RedisStorage.js';

// Mock console to avoid noise in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RedisStorage', () => {
  let storage: RedisStorage;
  const mockRedisUrl = 'redis://localhost:6379';

  beforeEach(() => {
    storage = new RedisStorage(mockRedisUrl);
  });

  afterEach(async () => {
    if (storage.connected) {
      await storage.disconnect();
    }
  });

  describe('Basic Properties', () => {
    it('should have correct name and initial state', () => {
      expect(storage.name).toBe('redis');
      expect(storage.connected).toBe(false);
    });

    it('should store connection URL', () => {
      expect(storage['connectionUrl']).toBe(mockRedisUrl);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection when Redis is not available', async () => {
      // Test with invalid URL to simulate Redis not being available
      const invalidStorage = new RedisStorage('redis://invalid:9999');

      await invalidStorage.connect();
      expect(invalidStorage.connected).toBe(false);

      await invalidStorage.disconnect();
    });

    it('should handle ping when not connected', async () => {
      const result = await storage.ping();
      expect(result).toBe(false);
    });

    it('should handle getInfo when not connected', async () => {
      const info = await storage.getInfo();
      expect(info).toBeNull();
    });

    it('should handle countKeys when not connected', async () => {
      const count = await storage.countKeys();
      expect(count).toBe(0);
    });

    it('should handle clear when not connected', async () => {
      // Should not throw
      await expect(storage.clear()).resolves.toBeUndefined();
    });
  });

  describe('Storage Operations Without Connection', () => {
    it('should return null for get operations when not connected', async () => {
      const value = await storage.get('test-key');
      expect(value).toBeNull();
    });

    it('should handle set operations gracefully when not connected', async () => {
      // Should not throw
      await expect(storage.set('test-key', 'test-value')).resolves.toBeUndefined();
    });

    it('should return false for remove operations when not connected', async () => {
      const result = await storage.remove('test-key');
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors in get operations', async () => {
      // Create a mock client that returns invalid JSON
      const mockClient = {
        get: vi.fn().mockResolvedValue('invalid-json{'),
        set: vi.fn(),
        del: vi.fn(),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const value = await storage.get('test-key');
      expect(value).toBeNull();
    });

    it('should handle Redis errors in set operations', async () => {
      // Create a mock client that throws errors
      const mockClient = {
        get: vi.fn(),
        set: vi.fn().mockRejectedValue(new Error('Redis error')),
        del: vi.fn(),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      // Should not throw
      await expect(storage.set('test-key', 'test-value')).resolves.toBeUndefined();
    });

    it('should handle Redis errors in remove operations', async () => {
      // Create a mock client that throws errors
      const mockClient = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn().mockRejectedValue(new Error('Redis error')),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const result = await storage.remove('test-key');
      expect(result).toBe(false);
    });
  });

  describe('Data Serialization', () => {
    it('should handle different data types with mock client', async () => {
      const testData = {
        string: 'hello',
        number: 42,
        boolean: true,
        object: { nested: 'value' },
        array: [1, 2, 3],
        null: null
      };

      // Create a mock client for testing serialization
      const mockData = new Map<string, string>();
      const mockClient = {
        get: vi.fn().mockImplementation((key: string) => {
          return Promise.resolve(mockData.get(key) || null);
        }),
        set: vi.fn().mockImplementation((key: string, value: string) => {
          mockData.set(key, value);
          return Promise.resolve();
        }),
        del: vi.fn().mockImplementation((key: string) => {
          const existed = mockData.has(key);
          mockData.delete(key);
          return Promise.resolve(existed ? 1 : 0);
        }),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      // Test serialization for each data type
      for (const [key, value] of Object.entries(testData)) {
        await storage.set(key, value);
        const retrieved = await storage.get(key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should handle circular references gracefully', async () => {
      const mockClient = {
        get: vi.fn(),
        set: vi.fn().mockImplementation(() => {
          throw new Error('Converting circular structure to JSON');
        }),
        del: vi.fn(),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const circular: any = { prop: 'value' };
      circular.self = circular;

      // Should handle gracefully without throwing
      await expect(storage.set('circular', circular)).resolves.toBeUndefined();
    });
  });

  describe('Redis-Specific Methods', () => {
    it('should handle ping with mock client', async () => {
      const mockClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const result = await storage.ping();
      expect(result).toBe(true);
    });

    it('should handle ping errors', async () => {
      const mockClient = {
        ping: vi.fn().mockRejectedValue(new Error('Ping failed')),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const result = await storage.ping();
      expect(result).toBe(false);
    });

    it('should parse Redis info correctly', async () => {
      const mockInfo =
        'redis_version:6.2.6\r\nused_memory:1024\r\n# Clients\r\nconnected_clients:1\r\n';

      const mockClient = {
        info: vi.fn().mockResolvedValue(mockInfo),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const info = await storage.getInfo();
      expect(info).toEqual({
        redis_version: '6.2.6',
        used_memory: 1024,
        connected_clients: 1
      });
    });

    it('should handle info errors', async () => {
      const mockClient = {
        info: vi.fn().mockRejectedValue(new Error('Info failed')),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const info = await storage.getInfo();
      expect(info).toBeNull();
    });

    it('should count keys correctly', async () => {
      const mockClient = {
        keys: vi.fn().mockResolvedValue(['key1', 'key2', 'key3']),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const count = await storage.countKeys('test:*');
      expect(count).toBe(3);
      expect(mockClient.keys).toHaveBeenCalledWith('test:*');
    });

    it('should handle countKeys errors', async () => {
      const mockClient = {
        keys: vi.fn().mockRejectedValue(new Error('Keys failed')),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      const count = await storage.countKeys();
      expect(count).toBe(0);
    });

    it('should handle clear operation', async () => {
      const mockClient = {
        flushdb: vi.fn().mockResolvedValue('OK'),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      await storage.clear();
      expect(mockClient.flushdb).toHaveBeenCalled();
    });

    it('should handle clear errors', async () => {
      const mockClient = {
        flushdb: vi.fn().mockRejectedValue(new Error('Flush failed')),
        quit: vi.fn(),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      // Should not throw
      await expect(storage.clear()).resolves.toBeUndefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full workflow with mock client', async () => {
      const mockData = new Map<string, string>();
      const mockClient = {
        get: vi.fn().mockImplementation((key: string) => {
          return Promise.resolve(mockData.get(key) || null);
        }),
        set: vi.fn().mockImplementation((key: string, value: string) => {
          mockData.set(key, value);
          return Promise.resolve();
        }),
        del: vi.fn().mockImplementation((key: string) => {
          const existed = mockData.has(key);
          mockData.delete(key);
          return Promise.resolve(existed ? 1 : 0);
        }),
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn().mockResolvedValue('OK'),
        on: vi.fn(),
        connect: vi.fn()
      };

      storage['client'] = mockClient as any;
      storage.connected = true;

      // Full workflow test

      // 1. Check ping
      expect(await storage.ping()).toBe(true);

      // 2. Set data
      await storage.set('workflow:test', { step: 1, data: 'test' });

      // 3. Get data
      const retrieved = await storage.get('workflow:test');
      expect(retrieved).toEqual({ step: 1, data: 'test' });

      // 4. Remove data
      const removed = await storage.remove('workflow:test');
      expect(removed).toBe(true);

      // 5. Verify removal
      const afterRemoval = await storage.get('workflow:test');
      expect(afterRemoval).toBeNull();

      // 6. Disconnect
      await storage.disconnect();
      expect(mockClient.quit).toHaveBeenCalled();
    });

    it('should handle connection state changes', async () => {
      expect(storage.connected).toBe(false);

      // Mock successful connection
      storage.connected = true;
      expect(storage.connected).toBe(true);

      // Mock disconnection
      storage.connected = false;
      expect(storage.connected).toBe(false);
    });
  });
});
