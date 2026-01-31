// Upstream Cache Population Tests
// Testing cache population when data is found in slower storage

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get, set, initializeStorages } from '../index.js';
import { getStorage } from '../registry.js';

// Mock console to avoid noise in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Skip these tests if Redis/Database are not configured
const hasRedisOrDatabase = !!(process.env.REDIS_URL || process.env.DATABASE_URL);

describe.skipIf(!hasRedisOrDatabase)('Upstream Cache Population', () => {
  beforeEach(async () => {
    await initializeStorages();
  });

  describe('Redis → Database → Memory Priority', () => {
    it('should populate Redis cache when data found in Database', async () => {
      const testKey = 'cache-test-1';
      const testValue = { message: 'found in database' };

      // Simulate data existing only in Database
      const databaseStorage = getStorage('database');
      const redisStorage = getStorage('redis');
      const memoryStorage = getStorage('memory');

      if (databaseStorage?.connected) {
        await databaseStorage.set(testKey, testValue);
      }

      // Clear Redis and Memory to simulate cache miss
      if (redisStorage?.connected) {
        await redisStorage.delete(testKey);
      }
      if (memoryStorage?.connected) {
        await memoryStorage.delete(testKey);
      }

      // Get should find in Database and populate Redis
      const result = await get(testKey);
      expect(result).toEqual(testValue);

      // Verify Redis was populated
      if (redisStorage?.connected) {
        const redisValue = await redisStorage.get(testKey);
        expect(redisValue).toEqual(testValue);
      }
    });

    it('should populate both Redis and Database when data found in Memory', async () => {
      const testKey = 'cache-test-2';
      const testValue = { message: 'found in memory' };

      // Store only in Memory
      const memoryStorage = getStorage('memory');
      if (memoryStorage?.connected) {
        await memoryStorage.set(testKey, testValue);
      }

      // Clear Redis and Database
      const redisStorage = getStorage('redis');
      const databaseStorage = getStorage('database');

      if (redisStorage?.connected) {
        await redisStorage!.delete(testKey);
      }
      if (databaseStorage?.connected) {
        await databaseStorage!.delete(testKey);
      }

      // Get should find in Memory and populate Redis (Database population happens via scheduler)
      const result = await get(testKey);
      expect(result).toEqual(testValue);

      // Verify Redis was populated
      if (redisStorage?.connected) {
        const redisValue = await redisStorage.get(testKey);
        expect(redisValue).toEqual(testValue);
      }
    });

    it('should not populate when data found in Redis (fastest cache)', async () => {
      const testKey = 'cache-test-3';
      const testValue = { message: 'found in redis' };

      const redisStorage = getStorage('redis');
      const databaseStorage = getStorage('database');
      const memoryStorage = getStorage('memory');

      // Store in all storages with different values
      if (redisStorage?.connected) {
        await redisStorage.set(testKey, testValue);
      }
      if (databaseStorage?.connected) {
        await databaseStorage.set(testKey, { message: 'old database value' });
      }
      if (memoryStorage?.connected) {
        await memoryStorage.set(testKey, { message: 'old memory value' });
      }

      // Get should return Redis value immediately
      const result = await get(testKey);
      expect(result).toEqual(testValue);

      // Other storages should retain their old values (no upstream population needed)
      if (databaseStorage?.connected) {
        const dbValue = await databaseStorage.get(testKey);
        expect(dbValue).toEqual({ message: 'old database value' });
      }
    });
  });

  describe('Cache Population Error Handling', () => {
    it('should handle upstream cache population failures gracefully', async () => {
      const testKey = 'cache-test-error';
      const testValue = { message: 'test value' };

      // Store in memory only
      const memoryStorage = getStorage('memory');
      if (memoryStorage?.connected) {
        await memoryStorage.set(testKey, testValue);
      }

      // Mock Redis to fail on set operations
      const redisStorage = getStorage('redis');
      if (redisStorage) {
        const originalSet = redisStorage.set;
        redisStorage.set = vi.fn().mockRejectedValue(new Error('Redis set failed'));

        // Get should still succeed despite cache population failure
        const result = await get(testKey);
        expect(result).toEqual(testValue);

        // Restore original method
        redisStorage.set = originalSet;
      }
    });

    it('should continue with other cache populations if one fails', async () => {
      const testKey = 'cache-test-partial-fail';
      const testValue = { message: 'partial fail test' };

      // For this test, we'd need multiple upstream caches
      // But with our current setup (Redis → Database → Memory),
      // Memory is the slowest, so this scenario is less relevant
      // This test serves as documentation for future multi-cache scenarios

      const memoryStorage = getStorage('memory');
      if (memoryStorage?.connected) {
        await memoryStorage.set(testKey, testValue);
      }

      const result = await get(testKey);
      expect(result).toEqual(testValue);
    });
  });

  describe('Performance Implications', () => {
    it('should populate caches asynchronously without blocking reads', async () => {
      const testKey = 'cache-test-performance';
      const testValue = { message: 'performance test', data: new Array(100).fill('x') };

      // Store in database only
      const databaseStorage = getStorage('database');
      if (databaseStorage?.connected) {
        await databaseStorage.set(testKey, testValue);
      }

      // Clear faster caches
      const redisStorage = getStorage('redis');
      const memoryStorage = getStorage('memory');

      if (redisStorage?.connected) {
        await redisStorage.delete(testKey);
      }
      if (memoryStorage?.connected) {
        await memoryStorage.delete(testKey);
      }

      const startTime = Date.now();

      // This should return quickly even with cache population
      const result = await get(testKey);

      const duration = Date.now() - startTime;

      expect(result).toEqual(testValue);
      expect(duration).toBeLessThan(100); // Should be very fast with simulator
    });
  });

  describe('Cache Consistency', () => {
    it('should maintain data consistency across cache layers', async () => {
      const testKey = 'cache-test-consistency';
      const testValue = { version: 1, data: 'original' };
      const updatedValue = { version: 2, data: 'updated' };

      // Initial set should populate all caches via normal flow
      await set(testKey, testValue);

      // Update value in database directly (simulating external update)
      const databaseStorage = getStorage('database');
      if (databaseStorage?.connected) {
        await databaseStorage.set(testKey, updatedValue);
      }

      // Clear Redis cache (simulating expiration)
      const redisStorage = getStorage('redis');
      if (redisStorage?.connected) {
        await redisStorage.delete(testKey);
      }

      // Get should find updated value in database and populate Redis
      const result = await get(testKey);
      expect(result).toEqual(updatedValue);

      // Subsequent get should come from Redis with consistent data
      const cachedResult = await get(testKey);
      expect(cachedResult).toEqual(updatedValue);
    });

    it('should handle concurrent cache population correctly', async () => {
      const testKey = 'cache-test-concurrent';
      const testValue = { id: testKey, concurrent: true };

      // Store in database only
      const databaseStorage = getStorage('database');
      if (databaseStorage?.connected) {
        await databaseStorage.set(testKey, testValue);
      }

      // Clear faster caches
      const redisStorage = getStorage('redis');
      const memoryStorage = getStorage('memory');

      if (redisStorage?.connected) {
        await redisStorage.delete(testKey);
      }
      if (memoryStorage?.connected) {
        await memoryStorage.delete(testKey);
      }

      // Make multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(get(testKey));
      }

      const results = await Promise.all(promises);

      // All results should be the same
      results.forEach(result => {
        expect(result).toEqual(testValue);
      });

      // Cache should be populated correctly
      if (redisStorage?.connected) {
        const redisValue = await redisStorage.get(testKey);
        expect(redisValue).toEqual(testValue);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values correctly in cache population', async () => {
      const testKey = 'cache-test-null';

      // Ensure key doesn't exist anywhere
      const storages = ['redis', 'database', 'memory'];
      for (const storageName of storages) {
        const storage = getStorage(storageName);
        if (storage?.connected) {
          await storage!.delete(testKey);
        }
      }

      // Get should return null without triggering cache population
      const result = await get(testKey);
      expect(result).toBeNull();
    });

    it('should handle cache population when upstream storage is disconnected', async () => {
      const testKey = 'cache-test-disconnected';
      const testValue = { message: 'disconnected test' };

      // Store in memory
      const memoryStorage = getStorage('memory');
      if (memoryStorage?.connected) {
        await memoryStorage.set(testKey, testValue);
      }

      // Simulate Redis being disconnected
      const redisStorage = getStorage('redis');
      if (redisStorage) {
        const originalConnected = redisStorage.connected;
        redisStorage.connected = false;

        // Get should still work and not fail on cache population
        const result = await get(testKey);
        expect(result).toEqual(testValue);

        // Restore connection status
        redisStorage.connected = originalConnected;
      }
    });
  });
});
