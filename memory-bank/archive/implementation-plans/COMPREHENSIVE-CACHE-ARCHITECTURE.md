# 🚀 Simplified Storage System for Shooter Notifications

## Memory-First Architecture with Multi-Device Support

---

## 📋 Executive Summary

This document outlines a **simple, scalable storage system** specifically designed for the Shooter notification platform. The system supports **multiple device tokens per user** through a **memory-first approach** that pushes to connected backends and reads from the nearest available source.

**Key Features:**

- ✅ **Multi-device support** - Handle multiple tokens per user
- ✅ **Memory-first storage** - Immediate writes, background pushes
- ✅ **Simple push strategy** - Redis (5s) → Database (10s) → Flush
- ✅ **Nearest-first reads** - Redis → Database → Error fallback
- ✅ **No complexity** - No preferences, no device management

**Storage Flow:**

```
┌─────────────────┐    5s    ┌─────────────────┐    10s   ┌─────────────────┐
│   Memory        │ ────────→│   Redis/KV      │────────→ │   Database      │
│   (Immediate)   │          │   (if connected)│         │   (if connected)│
│   Write & Flush │          │                 │         │                 │
└─────────────────┘          └─────────────────┘         └─────────────────┘
          ↑                           ↑                           ↑
          └─────────── Read Priority: Redis → Database ──────────┘
```

---

## 🎯 Simplified Multi-Device Architecture

### **Simple Data Models**

```typescript
// Clean user structure for multiple devices
interface User {
  userId: string;
  devices: DeviceToken[];
  created: number;
  updated: number;
}

interface DeviceToken {
  id: string; // Required: Unique device identifier
  token: string; // Required: APNs/FCM device token
  userId: string; // Required: Which user owns this
  registered: number; // Required: Registration timestamp
  lastSeen: number; // Required: Last activity timestamp
  active: boolean; // Required: Active status

  // Optional fields - keep it simple
  platform?: 'ios' | 'android'; // Optional: Device platform
  appVersion?: string; // Optional: App version
  metadata?: Record<string, any>; // Optional: Flexible metadata
}
```

### **Unified Storage Keys**

Same key format across Memory, Redis, and Database:

```typescript
// Simple, consistent key structure everywhere
const StorageKeys = {
  user: (userId: string) => `user:${userId}`,
  userDevices: (userId: string) => `user:${userId}:devices`,
  device: (deviceId: string) => `device:${deviceId}`,
  notification: (notifId: string) => `notification:${notifId}`,
  analytics: (type: string) => `analytics:${type}`
};
```

## 🏗️ Simple Storage Strategy

### **Memory-First Approach**

**Storage Flow:**

1. **Write**: Store in memory immediately (0ms)
2. **5 seconds**: Push to Redis/KV (if connected)
3. **10 seconds**: Push to Database (if connected)
4. **After push**: Flush from memory
5. **Read**: Always fetch from nearest available

### **Connection Detection**

```typescript
class Storage {
  private memory = new Map<string, any>();
  private connectedBackends: string[] = [];

  constructor() {
    // Auto-detect what's connected
    if (process.env.REDIS_URL) this.connectedBackends.push('redis');
    if (process.env.DATABASE_URL) this.connectedBackends.push('database');
  }

  async set(key: string, value: any) {
    // 1. Store in memory immediately
    this.memory.set(key, { value, timestamp: Date.now() });

    // 2. Schedule pushes to connected backends
    if (this.connectedBackends.includes('redis')) {
      setTimeout(() => this.pushToRedis(key, value), 5000);
    }

    if (this.connectedBackends.includes('database')) {
      setTimeout(() => this.pushToDatabase(key, value), 10000);
    }
  }

  async get(key: string) {
    // Read priority: Redis → Database → Error
    if (this.connectedBackends.includes('redis')) {
      const value = await this.readFromRedis(key);
      if (value) return value;
    }

    if (this.connectedBackends.includes('database')) {
      const value = await this.readFromDatabase(key);
      if (value) return value;
    }

    throw new Error('No storage backend available');
  }
}
```

### **Simple Backend Strategy**

| Data Type         | Memory       | Redis (5s)      | Database (10s) | Read Priority |
| ----------------- | ------------ | --------------- | -------------- | ------------- |
| **User Data**     | ✅ Immediate | ✅ Push & Flush | ✅ Push        | Redis → DB    |
| **Device Tokens** | ✅ Immediate | ✅ Push & Flush | ✅ Push        | Redis → DB    |
| **Notifications** | ✅ Immediate | ✅ Push & Flush | ✅ Push        | Redis → DB    |
| **Analytics**     | ✅ Immediate | ✅ Push & Flush | ✅ Push        | Redis → DB    |

**Benefits:**

- **Redis**: Fast reads, simple key-value operations
- **Database**: Backup, complex queries, long-term storage
- **Memory**: Zero-latency writes, temporary buffering

---

## 🔧 Pure Function Storage Implementation

### **Pure Storage Functions**

```typescript
// Pure functions for storage operations - return null on failure
async function get<T>(key: string): Promise<T | null> {
  // Try each storage in priority order
  const storages = ['redis', 'database', 'memory'];

  for (const storageName of storages) {
    try {
      const storage = getStorage(storageName);
      if (storage?.connected) {
        const value = await storage.get<T>(key);
        if (value !== null) return value;
      }
    } catch (error) {
      continue; // Try next storage
    }
  }

  return null; // All failed
}

async function set<T>(key: string, value: T): Promise<void> {
  // Store in memory immediately
  await memoryStorage.set(key, value);

  // Schedule pushes to other storages
  schedulePushes(key, value);
}

async function remove(key: string): Promise<boolean> {
  // Remove from all connected storages
  const results = await Promise.allSettled(
    getConnectedStorages().map(storage => storage.remove(key))
  );

  return results.some(r => r.status === 'fulfilled' && r.value === true);
}

// Batch operations
async function mget<T>(keys: string[]): Promise<(T | null)[]> {
  return Promise.all(keys.map(key => get<T>(key)));
}

async function mset<T>(pairs: Array<{ key: string; value: T }>): Promise<void> {
  await Promise.all(pairs.map(({ key, value }) => set(key, value)));
}
```

### **Generic Storage Interface**

```typescript
// Generic interface for all storage implementations
interface Storage {
  name: string;
  connected: boolean;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
```

### **Storage Implementations**

```typescript
// Memory Storage - always available
class MemoryStorage implements Storage {
  name = 'memory';
  connected = true;
  private data = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.get(key) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.data.clear();
  }
}

// Redis Storage - if Redis URL available
class RedisStorage implements Storage {
  name = 'redis';
  connected = false;
  private client: any;

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.set(key, JSON.stringify(value));
    } catch (error) {
      // Silent fail for background pushes
    }
  }

  async connect(): Promise<void> {
    // Redis connection logic
    this.connected = true;
  }
}

// Database Storage - if Database URL available
class DatabaseStorage implements Storage {
  name = 'database';
  connected = false;

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      // Database query logic
      return null; // Placeholder
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected) return;
    try {
      // Database insert/update logic
    } catch (error) {
      // Silent fail for background pushes
    }
  }
}
```

### **Storage Registry & Auto-Detection**

```typescript
// Storage registry
const storages = new Map<string, Storage>();
let memoryStorage: MemoryStorage;

// Auto-detect and register available storages
function initializeStorages() {
  // Always register memory storage
  memoryStorage = new MemoryStorage();
  storages.set('memory', memoryStorage);

  // Register Redis if available
  if (process.env.REDIS_URL) {
    const redisStorage = new RedisStorage();
    storages.set('redis', redisStorage);
    redisStorage.connect(); // Auto-connect
  }

  // Register Database if available
  if (process.env.DATABASE_URL) {
    const dbStorage = new DatabaseStorage();
    storages.set('database', dbStorage);
    dbStorage.connect(); // Auto-connect
  }
}

// Helper functions for pure storage functions
function getStorage(name: string): Storage | null {
  return storages.get(name) || null;
}

function getConnectedStorages(): Storage[] {
  return Array.from(storages.values()).filter(s => s.connected);
}

// Background push scheduler
function schedulePushes<T>(key: string, value: T) {
  // Push to Redis after 5 seconds
  const redisStorage = getStorage('redis');
  if (redisStorage?.connected) {
    setTimeout(async () => {
      await redisStorage.set(key, value);
      memoryStorage.remove(key); // Flush from memory
    }, 5000);
  }

  // Push to Database after 10 seconds
  const dbStorage = getStorage('database');
  if (dbStorage?.connected) {
    setTimeout(() => dbStorage.set(key, value), 10000);
  }
}
```

### **Usage Examples**

```typescript
// Initialize storage system
initializeStorages();

// Simple usage with pure functions
const user = await get<User>('user:123');
if (user === null) {
  console.log('User not found');
} else {
  console.log('User found:', user);
}

// Set data - stores in memory immediately, then pushes to backends
await set('user:123', {
  userId: '123',
  devices: [
    {
      id: 'device1',
      token: 'abc123',
      userId: '123',
      active: true,
      registered: Date.now(),
      lastSeen: Date.now()
    }
  ]
});

// Remove data from all storages
const removed = await remove('user:123');
console.log('Removed:', removed);

// Batch operations
const users = await mget<User>(['user:123', 'user:456']);
await mset([
  { key: 'user:789', value: { userId: '789', devices: [] } },
  { key: 'user:101', value: { userId: '101', devices: [] } }
]);
```

```typescript
// Simple notification service using pure functions
export async function sendNotificationToAllDevices(userId: string, notification: any) {
  const user = await get<User>(`user:${userId}`);
  if (!user || !user.devices.length) {
    return { total: 0, sent: 0, failed: 0, error: 'No devices found for user' };
  }

  // Send to all active devices - simple logic
  const activeDevices = user.devices.filter(d => d.active);
  const results = await Promise.allSettled(
    activeDevices.map(device => sendToDevice(device.token, notification))
  );

  return {
    total: activeDevices.length,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  };
}

// Simple device registration using pure functions
export async function registerDevice(userId: string, device: DeviceToken): Promise<void> {
  const user = (await get<User>(`user:${userId}`)) || {
    userId,
    devices: [],
    created: Date.now(),
    updated: Date.now()
  };

  // Remove existing device with same ID
  user.devices = user.devices.filter(d => d.id !== device.id);

  // Add new device
  user.devices.push(device);
  user.updated = Date.now();

  await set(`user:${userId}`, user);
}
```

### **Simple Backend Implementations**

```typescript
// Memory Storage - always available, no external dependencies
class MemoryStorage implements Storage {
  name = 'memory';
  connected = true;
  private data = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.get(key) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.data.clear();
  }
}

// Redis Storage - if Redis URL available
class RedisStorage implements Storage {
  name = 'redis';
  connected = false;
  private client: any;

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.set(key, JSON.stringify(value));
    } catch (error) {
      // Silent fail for background pushes
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      return false;
    }
  }

  async connect(): Promise<void> {
    try {
      // Redis connection logic
      this.connected = true;
    } catch (error) {
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

// Database Storage - if Database URL available
class DatabaseStorage implements Storage {
  name = 'database';
  connected = false;

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      // Database query logic
      return null; // Placeholder
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected) return;
    try {
      // Database insert/update logic
    } catch (error) {
      // Silent fail for background pushes
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!this.connected) return false;
    try {
      // Database delete logic
      return true; // Placeholder
    } catch (error) {
      return false;
    }
  }

  async connect(): Promise<void> {
    try {
      // Database connection logic
      this.connected = true;
    } catch (error) {
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
```

---

## 📦 Simple Package Requirements

### **Minimal Dependencies**

**Required Packages:**

- No caching framework dependencies
- Simple Redis client (if Redis used)
- Basic database client (if database used)
- No complex abstraction libraries

**Implementation Approach:**

```typescript
// Pure functions - no dependencies needed
export async function get<T>(key: string): Promise<T | null> {
  // Simple implementation
}

export async function set<T>(key: string, value: T): Promise<void> {
  // Simple implementation
}

// Optional: Redis client only if REDIS_URL exists
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

// Optional: Database client only if DATABASE_URL exists
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
```

**Benefits:**

- ✅ **Zero complex dependencies**
- ✅ **Easy to understand and modify**
- ✅ **No framework lock-in**
- ✅ **Simple testing and debugging**
- ✅ **Works with any SvelteKit setup**

**Conclusion:** **Pure function approach** - Simple, maintainable, and scalable without complex dependencies.

---

## 🚀 Simple Implementation Phases

### **Phase 1: Pure Function Storage (Week 1-2)**

**Deliverables:**

- Pure functions for storage operations
- Memory-first approach with immediate writes
- Redis push logic (5-second intervals)
- Basic storage registry and auto-detection

**Tasks:**

1. Create `get()`, `set()`, `remove()` pure functions
2. Implement MemoryStorage class
3. Add Redis connection detection and RedisStorage
4. Add background push scheduler
5. Return null for all failed operations

### **Phase 2: Multi-Device Support (Week 3-4)**

**Deliverables:**

- Simple User and DeviceToken interfaces
- Device registration using pure functions
- Send notifications to all active devices
- No device management complexity

**Tasks:**

1. Define simplified data models
2. Create `registerDevice()` helper function
3. Create `sendNotificationToAllDevices()` function
4. Filter active devices only
5. Return simple success/failure counts

### **Phase 3: Database Integration (Week 5-6)**

**Deliverables:**

- DatabaseStorage class
- Database push with 10-second intervals
- Read priority: Redis → Database → null
- Unified data structure across all storage

**Tasks:**

1. Add database connection detection
2. Implement DatabaseStorage class
3. Update scheduler for 10-second database push
4. Ensure consistent data structure
5. Add null fallback for read operations

### **Phase 4: Production Features (Week 7-8)**

**Deliverables:**

- Connection health monitoring
- Error handling with null returns
- Basic usage metrics
- Simple deployment setup

**Tasks:**

1. Add storage health checks
2. Implement graceful error handling
3. Add basic operation counting
4. Simple logging for debugging
5. Production environment setup

```typescript
// Example: Simple storage usage in API routes
export async function POST({ request }) {
  const { userId, notification } = await request.json();

  // Send notification using pure functions
  const result = await sendNotificationToAllDevices(userId, notification);

  return json(result);
}

// Example: Device registration endpoint
export async function PUT({ request }) {
  const { userId, device } = await request.json();

  // Register device using pure functions
  await registerDevice(userId, device);

  return json({ success: true });
}
```

---

## 📊 Performance Targets & Monitoring

### **Key Performance Indicators**

```typescript
interface PerformanceTargets {
  latency: {
    memoryCache: 1; // < 1ms average
    redisCache: 5; // < 5ms average
    database: 50; // < 50ms average
    endToEnd: 100; // < 100ms total
  };

  throughput: {
    readsPerSecond: 10000; // 10K reads/sec
    writesPerSecond: 1000; // 1K writes/sec
    concurrent: 1000; // 1K concurrent operations
  };

  reliability: {
    uptime: 99.9; // 99.9% uptime
    hitRatio: 90; // 90% cache hit ratio
    errorRate: 0.1; // < 0.1% error rate
  };

  scalability: {
    maxUsers: 100000; // 100K active users
    maxDevices: 500000; // 500K registered devices
    storageGrowth: 'linear'; // Linear growth with user base
  };
}
```

### **Monitoring Dashboard**

```typescript
// Real-time metrics collection
interface MonitoringMetrics {
  performance: {
    responseTime: TimeSeries;
    throughput: TimeSeries;
    errorRate: TimeSeries;
    hitRatio: TimeSeries;
  };

  storage: {
    memoryUsage: Gauge;
    diskUsage: Gauge;
    connectionCount: Gauge;
    operationQueue: Gauge;
  };

  business: {
    activeUsers: Counter;
    notificationsSent: Counter;
    deviceRegistrations: Counter;
    preferencesUpdated: Counter;
  };
}

// Alerting thresholds
const alertThresholds = {
  responseTime: { warning: 50, critical: 100 },
  errorRate: { warning: 1, critical: 5 },
  hitRatio: { warning: 70, critical: 50 },
  memoryUsage: { warning: 80, critical: 95 }
};
```

---

## 🔧 Quick Start Implementation

### **Project Setup**

```bash
# Initialize project
npm create svelte@latest shooter-cache
cd shooter-cache

# Install dependencies
npm install ioredis @types/ioredis
npm install pg @types/pg
npm install node-cache @types/node-cache
npm install zod                    # Runtime validation
npm install pino                   # Structured logging
npm install @prometheus-io/client-nodejs  # Metrics

# Development dependencies
npm install -D vitest @testing-library/svelte
npm install -D @types/node
npm install -D typescript
npm install -D eslint prettier
```

### **Basic Configuration**

```typescript
// /src/lib/config/CacheConfig.ts
export const cacheConfig = {
  storage: {
    strategy: {
      realtime: {
        storage: ['memory', 'redis'],
        syncInterval: 30000,
        writeThrough: true,
        ttl: 300000
      },
      userData: {
        storage: ['redis', 'postgres'],
        syncInterval: 300000,
        writeThrough: false,
        ttl: 3600000
      }
    },

    backends: {
      memory: {
        maxSize: 10000,
        defaultTTL: 300000
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        maxRetries: 3,
        retryDelay: 1000
      },
      postgres: {
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/shooter'
      }
    }
  },

  monitoring: {
    enabled: process.env.NODE_ENV === 'production',
    metricsInterval: 60000,
    healthCheckInterval: 30000
  }
};
```

### **Service Factory**

```typescript
// /src/lib/cache/CacheFactory.ts
export class CacheFactory {
  static async create(): Promise<StorageManager> {
    const manager = new StorageManager(cacheConfig.storage.strategy);

    // Register backends
    const memoryBackend = new MemoryBackend(cacheConfig.storage.backends.memory);
    const redisBackend = new RedisBackend(cacheConfig.storage.backends.redis.url);
    const postgresBackend = new PostgresBackend(cacheConfig.storage.backends.postgres.url);

    manager.registerBackend('memory', memoryBackend);
    manager.registerBackend('redis', redisBackend);
    manager.registerBackend('postgres', postgresBackend);

    // Initialize connections
    await Promise.all([redisBackend.connect(), postgresBackend.connect()]);

    return manager;
  }
}
```

### **Usage Example**

```typescript
// /src/routes/api/notifications/+server.ts
import { CacheFactory } from '$lib/cache/CacheFactory';
import { NotificationService } from '$lib/notifications/NotificationService';

const cache = await CacheFactory.create();
const notificationService = new NotificationService(cache);

export async function POST({ request }) {
  const { userId, notification } = await request.json();

  // This will automatically use the multi-layer cache
  const result = await notificationService.sendNotification(userId, notification);

  return new Response(JSON.stringify(result));
}
```

---

## 🎯 Simple Success Criteria

### **Phase 1 Success**

- ✅ **Memory storage** working with immediate writes
- ✅ **Redis push** working after 5 seconds
- ✅ **Memory flush** working after successful push
- ✅ **Connection detection** working for Redis

### **Phase 2 Success**

- ✅ **Multi-device storage** for users
- ✅ **Device registration** working
- ✅ **Send to all active devices** working
- ✅ **Success/failure counts** returned

### **Phase 3 Success**

- ✅ **Database push** working after 10 seconds
- ✅ **Read priority** Redis → Database → Error
- ✅ **Same data structure** across Redis and Database
- ✅ **Basic error handling** working

### **Overall Success**

- ✅ **Simple notification logic** - send to all active devices
- ✅ **No device management complexity**
- ✅ **No notification preferences complexity**
- ✅ **Scalable and easy to understand** code

---

## 🔮 Future Enhancements

### **Phase 2+ Features**

```typescript
interface FutureEnhancements {
  edgeComputing: {
    cloudflareWorkers: EdgeCacheBackend;
    vercelEdge: EdgeCacheBackend;
    awsLambda: EdgeCacheBackend;
  };

  advancedAnalytics: {
    realTimeInsights: AnalyticsEngine;
    predictivePreloading: MLPredictionService;
    userBehaviorAnalysis: BehaviorAnalyzer;
  };

  crossPlatform: {
    reactNative: MobileCacheAdapter;
    flutter: MobileCacheAdapter;
    desktop: DesktopCacheAdapter;
  };
}
```

This comprehensive architecture provides a **production-ready, scalable foundation** for the Shooter notification system with support for multiple devices, intelligent caching, and pluggable storage backends. The abstraction layer ensures **future-proof flexibility** while delivering **exceptional performance** for real-time notifications.
