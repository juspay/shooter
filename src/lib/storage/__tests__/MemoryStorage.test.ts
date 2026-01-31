// MemoryStorage Unit Tests
// Comprehensive testing for memory storage implementation

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorage } from '../MemoryStorage.js';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      await storage.set('test-key', 'test-value');
      const value = await storage.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should return null for non-existent keys', async () => {
      const value = await storage.get('non-existent');
      expect(value).toBeNull();
    });

    it('should handle different data types', async () => {
      const testData = {
        string: 'hello',
        number: 42,
        boolean: true,
        object: { nested: 'value' },
        array: [1, 2, 3]
      };

      for (const [key, value] of Object.entries(testData)) {
        await storage.set(key, value);
        const retrieved = await storage.get(key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should remove values correctly', async () => {
      await storage.set('test-key', 'test-value');
      expect(await storage.get('test-key')).toBe('test-value');

      const removed = await storage.remove('test-key');
      expect(removed).toBe(true);
      expect(await storage.get('test-key')).toBeNull();
    });

    it('should return false when removing non-existent keys', async () => {
      const removed = await storage.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Connection Management', () => {
    it('should always be connected', () => {
      expect(storage.connected).toBe(true);
    });

    it('should remain connected after connect/disconnect', async () => {
      await storage.connect();
      expect(storage.connected).toBe(true);

      await storage.disconnect();
      expect(storage.connected).toBe(true); // Memory storage stays connected
    });

    it('should clear data on disconnect', async () => {
      await storage.set('test', 'value');
      expect(await storage.size()).toBe(1);

      await storage.disconnect();
      expect(await storage.size()).toBe(0);
    });
  });

  describe('Memory-Specific Methods', () => {
    it('should track size correctly', async () => {
      expect(await storage.size()).toBe(0);

      await storage.set('key1', 'value1');
      expect(await storage.size()).toBe(1);

      await storage.set('key2', 'value2');
      expect(await storage.size()).toBe(2);

      await storage.remove('key1');
      expect(await storage.size()).toBe(1);
    });

    it('should check key existence', async () => {
      expect(storage.has('test')).toBe(false);

      await storage.set('test', 'value');
      expect(storage.has('test')).toBe(true);

      await storage.remove('test');
      expect(storage.has('test')).toBe(false);
    });

    it('should return all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');

      const keys = await storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should clear all data', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      expect(await storage.size()).toBe(2);

      storage.clear();
      expect(await storage.size()).toBe(0);
      expect(await storage.get('key1')).toBeNull();
      expect(await storage.get('key2')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in get operation', async () => {
      // Mock a failure scenario
      const originalGet = storage['data'].get;
      storage['data'].get = () => {
        throw new Error('Mock error');
      };

      const value = await storage.get('test');
      expect(value).toBeNull();

      // Restore original method
      storage['data'].get = originalGet;
    });

    it('should handle errors gracefully in set operation', async () => {
      // Mock a failure scenario
      const originalSet = storage['data'].set;
      storage['data'].set = () => {
        throw new Error('Mock error');
      };

      // Should not throw, just fail silently
      await expect(storage.set('test', 'value')).resolves.toBeUndefined();

      // Restore original method
      storage['data'].set = originalSet;
    });

    it('should handle errors gracefully in remove operation', async () => {
      // Mock a failure scenario
      const originalDelete = storage['data'].delete;
      storage['data'].delete = () => {
        throw new Error('Mock error');
      };

      const result = await storage.remove('test');
      expect(result).toBe(false);

      // Restore original method
      storage['data'].delete = originalDelete;
    });
  });

  describe('Data Persistence', () => {
    it('should update existing keys', async () => {
      await storage.set('key', 'value1');
      expect(await storage.get('key')).toBe('value1');

      await storage.set('key', 'value2');
      expect(await storage.get('key')).toBe('value2');
      expect(await storage.size()).toBe(1); // Size should remain 1
    });

    it('should handle undefined and null values', async () => {
      await storage.set('undefined-key', undefined);
      await storage.set('null-key', null);

      expect(await storage.get('undefined-key')).toBeUndefined();
      expect(await storage.get('null-key')).toBeNull();
    });
  });
});
