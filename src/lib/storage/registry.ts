// Storage Registry System
// Manages all storage backends with auto-detection

import type { Storage } from './types.js';

// Global storage registry
const storages = new Map<string, Storage>();
let memoryStorage: Storage | null = null;

/**
 * Register a storage backend
 */
export function registerStorage(name: string, storage: Storage): void {
  storages.set(name, storage);

  // Keep reference to memory storage for immediate writes
  if (name === 'memory') {
    memoryStorage = storage;
  }
}

/**
 * Get a storage backend by name
 * Returns null if not found
 */
export function getStorage(name: string): Storage | null {
  return storages.get(name) || null;
}

/**
 * Get all connected storages
 */
export function getConnectedStorages(): Storage[] {
  return Array.from(storages.values()).filter(storage => storage.connected);
}

/**
 * Get memory storage (always available)
 */
export function getMemoryStorage(): Storage | null {
  return memoryStorage;
}

/**
 * Check if a storage backend is available and connected
 */
export function isStorageConnected(name: string): boolean {
  const storage = getStorage(name);
  return storage?.connected || false;
}

/**
 * Get list of available storage names
 */
export function getAvailableStorages(): string[] {
  return Array.from(storages.keys());
}

/**
 * Get storage health status
 */
export function getStorageHealth(): Record<string, boolean> {
  const health: Record<string, boolean> = {};

  for (const [name, storage] of storages) {
    health[name] = storage.connected;
  }

  return health;
}
