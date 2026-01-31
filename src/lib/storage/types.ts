// Storage Types and Interfaces
// Pure function storage system for Shooter notifications

// Re-export centralized types for backward compatibility
export type {
  StorageEngine as Storage,
  Device as DeviceToken,
  NotificationAPIRequest as NotificationRequest,
  NotificationAPIResponse as NotificationResult
} from '$types';

// Import types for extension
import type {
  StorageEngine,
  User as CentralUser,
  Device,
  NotificationAPIRequest as _NotificationAPIRequest,
  NotificationAPIResponse as _NotificationAPIResponse
} from '$types';

// Storage-specific User type with device objects (not IDs)
export interface User {
  userId: string;
  devices: Device[]; // Array of device objects for storage layer
  created: number;
  updated: number;
}

/**
 * @deprecated Use StorageEngine from $types instead
 */
export type LegacyStorage = StorageEngine;

/**
 * @deprecated Use User from $types instead
 */
export type LegacyUser = CentralUser;

/**
 * @deprecated Use Device from $types instead
 */
export type LegacyDeviceToken = Device;
