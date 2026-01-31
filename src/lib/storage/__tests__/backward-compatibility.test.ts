// Backward Compatibility Tests
// Ensures existing API functionality continues to work

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initializeStorages, get, set, remove } from '../index.js';
import { registerDevice, sendNotificationToAllDevices } from '../notifications.js';
import type { DeviceToken, NotificationRequest } from '../types.js';

// Mock console to avoid noise
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Backward Compatibility', () => {
  beforeEach(async () => {
    await initializeStorages();
  });

  describe('Storage API Compatibility', () => {
    it('should provide basic storage operations', async () => {
      // Test that the core storage API works as expected

      // Set some data
      await set('test:key', 'test-value');

      // Get the data
      const value = await get<string>('test:key');
      expect(value).toBe('test-value');

      // Remove the data
      const removed = await remove('test:key');
      expect(removed).toBe(true);

      // Verify it's gone
      const removedValue = await get<string>('test:key');
      expect(removedValue).toBeNull();
    });

    it('should handle complex data structures', async () => {
      const complexData = {
        user: {
          id: 'user123',
          settings: {
            notifications: true,
            theme: 'dark'
          },
          devices: ['device1', 'device2']
        },
        metadata: {
          created: new Date(),
          version: '1.0.0'
        }
      };

      await set('complex:data', complexData);
      const retrieved = await get('complex:data');

      expect(retrieved).toEqual(complexData);
    });

    it('should maintain null return behavior for missing keys', async () => {
      const value = await get('definitely:does:not:exist');
      expect(value).toBeNull();
    });
  });

  describe('Notification API Compatibility', () => {
    it('should support device registration workflow', async () => {
      const device: DeviceToken = {
        id: 'compatibility-device',
        token: 'apns-compatibility-token',
        userId: 'compatibility-user',
        registered: Date.now(),
        lastSeen: Date.now(),
        active: true,
        platform: 'ios',
        appVersion: '1.0.0'
      };

      // Register device
      await registerDevice('compatibility-user', device);

      // Verify device was registered by checking storage
      const userData = await get(`user:compatibility-user`);
      expect(userData).toBeTruthy();
      expect((userData as any).devices).toHaveLength(1);
      expect((userData as any).devices[0]!.id).toBe('compatibility-device');
    });

    it('should support notification sending workflow', async () => {
      // Set up a user with an active device
      const device: DeviceToken = {
        id: 'notification-device',
        token: 'notification-token',
        userId: 'notification-user',
        registered: Date.now(),
        lastSeen: Date.now(),
        active: true,
        platform: 'ios'
      };

      await registerDevice('notification-user', device);

      // Send notification
      const notification: NotificationRequest = {
        userId: 'notification-user',
        title: 'Compatibility Test',
        message: 'Testing backward compatibility',
        category: 'test',
        priority: 'normal'
      };

      const result = await sendNotificationToAllDevices('notification-user', notification);

      // Verify notification was processed
      expect(result.total).toBe(1);
      expect(result.sent + result.failed).toBe(1);
    });

    it('should handle multi-device scenarios', async () => {
      const userId = 'multi-device-user';

      // Register multiple devices
      const devices: DeviceToken[] = [
        {
          id: 'device1',
          token: 'token1',
          userId,
          registered: Date.now(),
          lastSeen: Date.now(),
          active: true,
          platform: 'ios'
        },
        {
          id: 'device2',
          token: 'token2',
          userId,
          registered: Date.now(),
          lastSeen: Date.now(),
          active: true,
          platform: 'android'
        },
        {
          id: 'device3',
          token: 'token3',
          userId,
          registered: Date.now(),
          lastSeen: Date.now(),
          active: false, // Inactive device
          platform: 'ios'
        }
      ];

      for (const device of devices) {
        await registerDevice(userId, device);
      }

      // Send notification
      const notification: NotificationRequest = {
        userId,
        title: 'Multi-device Test',
        message: 'Testing multi-device support',
        category: 'test'
      };

      const result = await sendNotificationToAllDevices(userId, notification);

      // Should send to all devices (registerDevice always marks as active)
      expect(result.total).toBe(3);
      expect(result.sent + result.failed).toBe(3);
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should handle non-existent users gracefully', async () => {
      const notification: NotificationRequest = {
        userId: 'non-existent-user',
        title: 'Test',
        message: 'Test message',
        category: 'test'
      };

      const result = await sendNotificationToAllDevices('non-existent-user', notification);

      expect(result.total).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.error).toBe('No active devices found for user');
    });

    it('should handle empty device scenarios', async () => {
      // Create user with no devices
      await set('user:empty-user', {
        userId: 'empty-user',
        devices: [],
        created: new Date(),
        updated: new Date()
      });

      const notification: NotificationRequest = {
        userId: 'empty-user',
        title: 'Test',
        message: 'Test message'
      };

      const result = await sendNotificationToAllDevices('empty-user', notification);

      expect(result.total).toBe(0);
      expect(result.error).toBe('No active devices found for user');
    });
  });

  describe('System Integration', () => {
    it('should initialize storage system without errors', async () => {
      // This should not throw
      await expect(initializeStorages()).resolves.toBeUndefined();
    });

    it('should handle concurrent operations', async () => {
      // Test that multiple operations can run concurrently
      const operations = [];

      for (let i = 0; i < 10; i++) {
        operations.push(set(`concurrent:${i}`, `value-${i}`));
      }

      await Promise.all(operations);

      // Verify all values were set
      for (let i = 0; i < 10; i++) {
        const value = await get(`concurrent:${i}`);
        expect(value).toBe(`value-${i}`);
      }
    });

    it('should maintain performance characteristics', async () => {
      // Test that operations complete in reasonable time
      const start = new Date();

      await set('performance:test', 'test-value');
      const value = await get('performance:test');
      await remove('performance:test');

      const elapsed = new Date().getTime() - start.getTime();

      expect(value).toBe('test-value');
      expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});
