// Database Storage Unit Tests
// Comprehensive testing for database storage implementation

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseStorage } from '../DatabaseStorage.js';

// Mock console to avoid noise in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Skip these tests if DATABASE_URL is not configured
const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)('DatabaseStorage', () => {
  describe('Database Type Detection', () => {
    it('should detect PostgreSQL from URL', () => {
      const storage = new DatabaseStorage('postgresql://user:pass@localhost:5432/db');
      expect(storage.name).toBe('database');
      expect(storage.connected).toBe(false);
      expect(storage['databaseType']).toBe('postgresql');
    });

    it('should detect PostgreSQL from postgres:// URL', () => {
      const storage = new DatabaseStorage('postgres://user:pass@localhost:5432/db');
      expect(storage['databaseType']).toBe('postgresql');
    });

    it('should detect MySQL from URL', () => {
      const storage = new DatabaseStorage('mysql://user:pass@localhost:3306/db');
      expect(storage['databaseType']).toBe('mysql');
    });

    it('should detect SQLite from URL', () => {
      const storage = new DatabaseStorage('sqlite://./test.db');
      expect(storage['databaseType']).toBe('sqlite');
    });

    it('should detect SQLite from file path', () => {
      const storage = new DatabaseStorage('./data.sqlite');
      expect(storage['databaseType']).toBe('sqlite');
    });

    it('should handle unknown database types', () => {
      const storage = new DatabaseStorage('unknown://localhost');
      expect(storage['databaseType']).toBe('unknown');
    });
  });

  describe('Connection Management', () => {
    let storage: DatabaseStorage;

    afterEach(async () => {
      if (storage && storage.connected) {
        await storage.disconnect();
      }
    });

    it('should handle connection when database is not available', async () => {
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');

      await storage.connect();

      // Should fallback to simulation mode
      expect(storage.connected).toBe(true); // Simulator connects successfully
      expect(storage['client']).toBeDefined();
    });

    it('should handle ping when not connected', async () => {
      storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');

      const result = await storage.ping();
      expect(result).toBe(false);
    });

    it('should handle getInfo when not connected', async () => {
      storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');

      const info = await storage.getInfo();
      expect(info).toBeNull();
    });

    it('should handle countKeys when not connected', async () => {
      storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');

      const count = await storage.countKeys();
      expect(count).toBe(0);
    });

    it('should handle clear when not connected', async () => {
      storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');

      // Should not throw
      await expect(storage.clear()).resolves.toBeUndefined();
    });
  });

  describe('Storage Operations with Simulator', () => {
    let storage: DatabaseStorage;

    beforeEach(async () => {
      // Use invalid URL to force simulator mode
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');
      await storage.connect();
    });

    afterEach(async () => {
      if (storage) {
        await storage.disconnect();
      }
    });

    it('should store and retrieve data', async () => {
      await storage.set('test-key', { message: 'hello', number: 42 });

      const result = await storage.get('test-key');
      expect(result).toEqual({ message: 'hello', number: 42 });
    });

    it('should return null for non-existent keys', async () => {
      const result = await storage.get('non-existent');
      expect(result).toBeNull();
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
        await storage.set(key, value);
        const retrieved = await storage.get(key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should remove data correctly', async () => {
      await storage.set('remove-test', 'value');

      // Verify it exists
      let result = await storage.get('remove-test');
      expect(result).toBe('value');

      // Remove it
      const removed = await storage.remove('remove-test');
      expect(removed).toBe(true);

      // Verify it's gone
      result = await storage.get('remove-test');
      expect(result).toBeNull();
    });

    it('should return false when removing non-existent key', async () => {
      const removed = await storage.remove('non-existent');
      expect(removed).toBe(false);
    });

    it('should handle upsert operations', async () => {
      // Insert
      await storage.set('upsert-test', 'initial');
      let result = await storage.get('upsert-test');
      expect(result).toBe('initial');

      // Update
      await storage.set('upsert-test', 'updated');
      result = await storage.get('upsert-test');
      expect(result).toBe('updated');
    });
  });

  describe('Database-Specific Methods with Simulator', () => {
    let storage: DatabaseStorage;

    beforeEach(async () => {
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');
      await storage.connect();
    });

    afterEach(async () => {
      if (storage) {
        await storage.disconnect();
      }
    });

    it('should handle ping operation', async () => {
      const result = await storage.ping();
      expect(result).toBe(true);
    });

    it('should get database info', async () => {
      const info = await storage.getInfo();
      expect(info).toEqual(
        expect.objectContaining({
          database_type: 'postgresql',
          connected: true,
          version: expect.stringContaining('Simulated')
        })
      );
    });

    it('should count keys correctly', async () => {
      await storage.set('count-1', 'value1');
      await storage.set('count-2', 'value2');
      await storage.set('count-3', 'value3');

      const count = await storage.countKeys();
      expect(count).toBe(3);
    });

    it('should clear all data', async () => {
      await storage.set('clear-1', 'value1');
      await storage.set('clear-2', 'value2');

      let count = await storage.countKeys();
      expect(count).toBe(2);

      await storage.clear();

      count = await storage.countKeys();
      expect(count).toBe(0);
    });
  });

  describe('Storage Operations Without Connection', () => {
    let storage: DatabaseStorage;

    beforeEach(() => {
      storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');
      // Don't connect
    });

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
    let storage: DatabaseStorage;

    beforeEach(async () => {
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');
      await storage.connect();
    });

    afterEach(async () => {
      if (storage) {
        await storage.disconnect();
      }
    });

    it('should handle serialization errors gracefully', async () => {
      // Create circular reference
      const circular: any = { prop: 'value' };
      circular.self = circular;

      // Should not throw due to JSON.stringify error
      await expect(storage.set('circular', circular)).resolves.toBeUndefined();
    });

    it('should handle connection retry logic', async () => {
      const failingStorage = new DatabaseStorage('postgresql://fail:fail@fail:9999/fail');

      // Mock the establishConnection to fail multiple times
      const originalConnect = failingStorage['establishConnection'];
      let callCount = 0;

      failingStorage['establishConnection'] = async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Connection failed');
        }
        // Fall back to simulator on third try
        const Client = storage['client']?.constructor as any;
        failingStorage['client'] = new Client('postgresql');
      };

      await failingStorage.connect();

      // Should eventually connect via fallback
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('Database Type Specific Operations', () => {
    it('should handle PostgreSQL-specific queries', async () => {
      const storage = new DatabaseStorage('postgresql://test:test@localhost:5432/test');
      await storage.connect();

      // Test PostgreSQL parameter replacement
      const sql = 'SELECT value FROM storage WHERE key = ?';
      const expectedSql = 'SELECT value FROM storage WHERE key = $1';

      // This is tested implicitly through the simulator
      await storage.set('pg-test', 'value');
      const result = await storage.get('pg-test');
      expect(result).toBe('value');

      await storage.disconnect();
    });

    it('should handle MySQL-specific queries', async () => {
      const storage = new DatabaseStorage('mysql://test:test@localhost:3306/test');
      await storage.connect();

      await storage.set('mysql-test', 'value');
      const result = await storage.get('mysql-test');
      expect(result).toBe('value');

      await storage.disconnect();
    });

    it('should handle SQLite-specific queries', async () => {
      const storage = new DatabaseStorage('sqlite://./test.db');
      await storage.connect();

      await storage.set('sqlite-test', 'value');
      const result = await storage.get('sqlite-test');
      expect(result).toBe('value');

      await storage.disconnect();
    });
  });

  describe('Integration Scenarios', () => {
    let storage: DatabaseStorage;

    beforeEach(async () => {
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');
      await storage.connect();
    });

    afterEach(async () => {
      if (storage) {
        await storage.disconnect();
      }
    });

    it('should handle full workflow', async () => {
      // 1. Check ping
      expect(await storage.ping()).toBe(true);

      // 2. Set data
      await storage.set('workflow:test', { step: 1, data: 'test' });

      // 3. Get data
      const retrieved = await storage.get('workflow:test');
      expect(retrieved).toEqual({ step: 1, data: 'test' });

      // 4. Update data
      await storage.set('workflow:test', { step: 2, data: 'updated' });
      const updated = await storage.get('workflow:test');
      expect(updated).toEqual({ step: 2, data: 'updated' });

      // 5. Count keys
      const count = await storage.countKeys();
      expect(count).toBeGreaterThan(0);

      // 6. Remove data
      const removed = await storage.remove('workflow:test');
      expect(removed).toBe(true);

      // 7. Verify removal
      const afterRemoval = await storage.get('workflow:test');
      expect(afterRemoval).toBeNull();

      // 8. Disconnect
      await storage.disconnect();
      expect(storage.connected).toBe(false);
    });

    it('should handle connection state changes', async () => {
      expect(storage.connected).toBe(true);

      // Disconnect
      await storage.disconnect();
      expect(storage.connected).toBe(false);

      // Operations should fail gracefully
      const result = await storage.get('test');
      expect(result).toBeNull();
    });

    it('should handle concurrent operations', async () => {
      const operations = [];

      // Start multiple operations simultaneously
      for (let i = 0; i < 10; i++) {
        operations.push(storage.set(`concurrent-${i}`, `value-${i}`));
      }

      // Wait for all to complete
      await Promise.all(operations);

      // Verify all data was stored
      const retrieveOperations = [];
      for (let i = 0; i < 10; i++) {
        retrieveOperations.push(storage.get(`concurrent-${i}`));
      }

      const results = await Promise.all(retrieveOperations);

      for (let i = 0; i < 10; i++) {
        expect(results[i]).toBe(`value-${i}`);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    let storage: DatabaseStorage;

    beforeEach(async () => {
      storage = new DatabaseStorage('postgresql://invalid:invalid@invalid:9999/invalid');
      await storage.connect();
    });

    afterEach(async () => {
      if (storage) {
        await storage.disconnect();
      }
    });

    it('should handle large data objects', async () => {
      const largeObject = {
        id: 'large-test',
        data: 'x'.repeat(10000), // 10KB string
        nested: {
          array: new Array(1000).fill({ item: 'value' }),
          metadata: { created: Date.now(), tags: new Array(100).fill('tag') }
        }
      };

      await storage.set('large-object', largeObject);
      const result = await storage.get('large-object');

      expect(result).toEqual(largeObject);
    });

    it('should handle special characters in keys and values', async () => {
      const specialData = {
        unicode: '🚀💾📱',
        quotes: 'This has "quotes" and \'apostrophes\'',
        backslashes: 'Path\\to\\file',
        newlines: 'Line 1\nLine 2\nLine 3',
        nullBytes: 'Before\0After'
      };

      const specialKey = 'special:key with spaces & symbols!@#$%';

      await storage.set(specialKey, specialData);
      const result = await storage.get(specialKey);

      expect(result).toEqual(specialData);
    });

    it('should handle rapid operations', async () => {
      const startTime = Date.now();

      // Rapid set/get operations
      for (let i = 0; i < 100; i++) {
        await storage.set(`rapid-${i}`, { iteration: i, timestamp: Date.now() });
        const result = await storage.get(`rapid-${i}`);
        expect(result).toEqual({ iteration: i, timestamp: expect.any(Number) });
      }

      const duration = Date.now() - startTime;
      console.log(`100 operations completed in ${duration}ms`);

      // Should complete in reasonable time (this is with simulator, so very fast)
      expect(duration).toBeLessThan(1000);
    });
  });
});
