# Storage System API Reference

This document provides comprehensive API documentation for the SHOOTER notification system's storage layer.

## Table of Contents

- [Overview](#overview)
- [Core Functions](#core-functions)
- [Device Management](#device-management)
- [Notification Functions](#notification-functions)
- [Health Monitoring](#health-monitoring)
- [Performance Metrics](#performance-metrics)
- [Logging and Monitoring](#logging-and-monitoring)
- [Shutdown Management](#shutdown-management)
- [Configuration](#configuration)
- [Error Handling](#error-handling)

## Overview

The storage system provides a unified interface for data persistence across multiple storage backends (Memory, Redis, Database) with automatic failover, performance monitoring, and comprehensive observability.

### Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Memory    │───▶│    Redis    │───▶│  Database   │───▶│    null     │
│  (instant)  │    │   (5 sec)   │    │  (10 sec)   │    │  (failed)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Read Priority**: Redis → Database → Memory → null
**Write Strategy**: Memory (immediate) → Redis (5s) → Database (10s)

## Core Functions

### `get<T>(key: string): Promise<T | null>`

Retrieves data from storage using the read priority chain.

```typescript
const userData = await get<User>('user:123');
if (userData) {
  console.log('User found:', userData.userId);
}
```

**Features:**

- Automatic upstream cache population
- Performance tracking
- Error handling with graceful degradation

### `set<T>(key: string, value: T): Promise<void>`

Stores data immediately in memory and schedules background persistence.

```typescript
await set('user:123', {
  userId: '123',
  devices: [],
  created: Date.now(),
  updated: Date.now()
});
```

**Features:**

- Immediate memory storage
- Background persistence to Redis and Database
- Validation and error handling

### `remove(key: string): Promise<boolean>`

Removes data from all connected storage backends.

```typescript
const removed = await remove('user:123');
console.log('Removal successful:', removed);
```

**Returns:** `true` if removed from at least one storage backend

### `mget<T>(keys: string[]): Promise<(T | null)[]>`

Batch retrieval of multiple keys.

```typescript
const users = await mget<User>(['user:123', 'user:456', 'user:789']);
```

### `mset<T>(pairs: Array<{key: string, value: T}>): Promise<void>`

Batch storage of multiple key-value pairs.

```typescript
await mset([
  { key: 'user:123', value: userData },
  { key: 'user:456', value: otherUserData }
]);
```

## Device Management

### `registerDevice(userId: string, deviceData: Omit<DeviceToken, 'id' | 'userId' | 'registered'>): Promise<DeviceToken>`

Registers a new device for push notifications.

```typescript
const device = await registerDevice('user123', {
  token: 'apns-device-token',
  lastSeen: Date.now(),
  active: true,
  platform: 'ios',
  appVersion: '1.0.0',
  metadata: { model: 'iPhone 14' }
});
```

### `getDevices(userId: string): Promise<DeviceToken[]>`

Retrieves all devices for a user.

```typescript
const devices = await getDevices('user123');
console.log(`User has ${devices.length} devices`);
```

### `getActiveDevices(userId: string): Promise<DeviceToken[]>`

Retrieves only active devices for a user.

```typescript
const activeDevices = await getActiveDevices('user123');
```

### `removeDevice(userId: string, deviceId: string): Promise<boolean>`

Removes a specific device.

```typescript
const removed = await removeDevice('user123', 'device-uuid');
```

### `removeDeviceByToken(token: string): Promise<boolean>`

Removes a device by its token.

```typescript
const removed = await removeDeviceByToken('apns-device-token');
```

### `deactivateDevice(userId: string, deviceId: string): Promise<boolean>`

Deactivates a device without removing it.

```typescript
const deactivated = await deactivateDevice('user123', 'device-uuid');
```

### `updateDeviceLastSeen(userId: string, deviceId: string, lastSeen?: number): Promise<boolean>`

Updates the last seen timestamp for a device.

```typescript
const updated = await updateDeviceLastSeen('user123', 'device-uuid');
```

### `cleanupInactiveDevices(inactiveThreshold: number = 2592000000): Promise<number>`

Removes devices inactive for more than the threshold (default: 30 days).

```typescript
const cleanedCount = await cleanupInactiveDevices(7 * 24 * 60 * 60 * 1000); // 7 days
```

### `getDeviceStats(): Promise<{totalDevices: number, activeDevices: number, devicesByPlatform: Record<string, number>}>`

Gets device statistics.

```typescript
const stats = await getDeviceStats();
console.log('Device statistics:', stats);
```

## Notification Functions

### `sendNotificationToAllDevices(userId: string, notification: NotificationRequest): Promise<NotificationResult>`

Sends a notification to all active devices for a user.

```typescript
const result = await sendNotificationToAllDevices('user123', {
  title: 'Welcome!',
  body: 'Your account has been created.',
  data: { type: 'welcome' }
});

console.log(`Sent to ${result.successCount}/${result.totalDevices} devices`);
```

### `sendNotificationToDeviceById(userId: string, deviceId: string, notification: NotificationRequest): Promise<NotificationResult>`

Sends a notification to a specific device.

```typescript
const result = await sendNotificationToDeviceById('user123', 'device-uuid', {
  title: 'Device-specific notification',
  body: 'This notification is for your iPhone.',
  data: { device: 'specific' }
});
```

### `broadcastNotification(userIds: string[], notification: NotificationRequest): Promise<Record<string, NotificationResult>>`

Broadcasts a notification to multiple users.

```typescript
const results = await broadcastNotification(['user123', 'user456', 'user789'], {
  title: 'System Announcement',
  body: 'Server maintenance scheduled for tonight.',
  data: { type: 'maintenance' }
});

Object.entries(results).forEach(([userId, result]) => {
  console.log(`User ${userId}: ${result.successCount} devices notified`);
});
```

## Health Monitoring

### `checkAllStorages(): Promise<SystemHealthReport>`

Performs comprehensive health check on all storage backends.

```typescript
const healthReport = await checkAllStorages();
console.log('System status:', healthReport.status);
console.log('Recommendations:', healthReport.recommendations);
```

### `checkStorageHealth(storageName: string): Promise<StorageHealthStatus | null>`

Checks health of a specific storage backend.

```typescript
const redisHealth = await checkStorageHealth('redis');
if (redisHealth) {
  console.log(`Redis latency: ${redisHealth.latency}ms`);
}
```

### `getStoragePerformanceTrends(storageName: string, timeframeMs?: number)`

Gets performance trends for a storage backend.

```typescript
const trends = getStoragePerformanceTrends('redis', 300000); // Last 5 minutes
console.log('Redis trends:', trends);
```

### `healthCheckEndpoint(): Promise<{status: number, body: SystemHealthReport}>`

HTTP health check endpoint.

```typescript
const { status, body } = await healthCheckEndpoint();
// Returns 200 for healthy/degraded, 503 for unhealthy
```

### `simpleHealthCheck(): Promise<{status: 'ok' | 'error', timestamp: number}>`

Lightweight health check for load balancers.

```typescript
const simple = await simpleHealthCheck();
console.log('Status:', simple.status);
```

## Performance Metrics

### `generatePerformanceReport(): SystemPerformanceReport`

Generates comprehensive performance report.

```typescript
const report = generatePerformanceReport();
console.log('System performance:', {
  operationsPerSecond: report.operationsPerSecond,
  averageLatency: report.averageLatency,
  errorRate: report.errorRate
});
```

### `benchmarkStorage(storageName: string, operations?: number): Promise<BenchmarkResult>`

Benchmarks a specific storage backend.

```typescript
const benchmark = await benchmarkStorage('redis', 1000);
console.log('Redis performance:', {
  readThroughput: benchmark.readThroughput,
  writeThroughput: benchmark.writeThroughput,
  readLatency: benchmark.readLatency.averageDuration
});
```

### `optimizeStorageSystem(): Promise<string[]>`

Automatically optimizes the storage system.

```typescript
const optimizations = await optimizeStorageSystem();
console.log('Applied optimizations:', optimizations);
```

### `getDetailedPerformanceStats(operation?: string, storageName?: string, timeWindow?: number): PerformanceStats[]`

Gets detailed performance statistics.

```typescript
const stats = getDetailedPerformanceStats('get', 'redis', 300000);
stats.forEach(stat => {
  console.log(`${stat.operation} on ${stat.storageName}: ${stat.averageDuration}ms avg`);
});
```

## Logging and Monitoring

### `getStorageLogs(filters?: LogFilters): LogEntry[]`

Retrieves system logs with optional filtering.

```typescript
const errorLogs = getStorageLogs({
  level: 'error',
  category: 'storage',
  since: Date.now() - 3600000, // Last hour
  limit: 100
});
```

### `getErrorStats(): ErrorStatistics`

Gets error statistics and trends.

```typescript
const errorStats = getErrorStats();
console.log('Error statistics:', {
  totalErrors: errorStats.totalErrors,
  errorRate: errorStats.errorRate,
  errorsByCategory: errorStats.errorsByCategory
});
```

### `configureLogging(config: Partial<LogConfig>): void`

Configures logging behavior.

```typescript
configureLogging({
  level: 'warn',
  categories: ['storage', 'health'],
  enablePerformanceLogging: true
});
```

### `exportLogs(format: 'json' | 'csv'): string`

Exports logs for external analysis.

```typescript
const logsJson = exportLogs('json');
const logsCsv = exportLogs('csv');
```

## Shutdown Management

### `initializeShutdownHandler(config?: Partial<ShutdownConfig>): void`

Initializes graceful shutdown handling.

```typescript
initializeShutdownHandler({
  gracefulTimeout: 30000,
  persistLogs: true,
  persistMetrics: true,
  exportPath: './shutdown-exports'
});
```

### `shutdown(force?: boolean): Promise<void>`

Initiates graceful shutdown.

```typescript
// Graceful shutdown
await shutdown();

// Force shutdown
await shutdown(true);
```

### `getShutdownStatus(): ShutdownStatus`

Gets current shutdown status.

```typescript
const status = getShutdownStatus();
console.log('Shutdown progress:', status.progress + '%');
```

### `wrapOperation<T>(operationId: string, operation: () => Promise<T>): Promise<T>`

Wraps operations for shutdown awareness.

```typescript
const result = await wrapOperation('user-update', async () => {
  return await updateUserData(userId, data);
});
```

## Configuration

### `initializeStorages(): Promise<void>`

Initializes the storage system with auto-detection.

```typescript
await initializeStorages();
```

**Environment Variables:**

- `REDIS_URL`: Redis connection URL
- `DATABASE_URL`: Database connection URL

### `getConnectedStorages(): Storage[]`

Gets list of connected storage backends.

```typescript
const connected = getConnectedStorages();
console.log(
  'Connected storages:',
  connected.map(s => s.name)
);
```

### `getStorageHealth(): Record<string, boolean>`

Gets connection status of all storages.

```typescript
const health = getStorageHealth();
console.log('Storage health:', health);
```

## Error Handling

### Error Categories

The system categorizes errors for better handling:

- **connection**: Network/connection related errors
- **timeout**: Operation timeout errors
- **serialization**: Data serialization/parsing errors
- **authentication**: Authentication failures
- **permission**: Permission denied errors
- **validation**: Data validation errors
- **resource**: Resource exhaustion errors
- **unknown**: Uncategorized errors

### Retriable Errors

Use `isRetriableError(error)` to check if an operation should be retried:

```typescript
try {
  await storageOperation();
} catch (error) {
  if (isRetriableError(error)) {
    // Retry the operation
    console.log('Retrying operation...');
    await retryOperation();
  } else {
    // Don't retry validation or permission errors
    console.log('Non-retriable error:', error.message);
  }
}
```

### Custom Error Types

Create categorized errors:

```typescript
const error = createCategorizedError(
  'Database connection failed',
  'connection',
  true, // isRetriable
  { host: 'localhost', port: 5432 }
);
```

## Data Types

### Core Types

```typescript
// User data structure
interface User {
  userId: string;
  devices: DeviceToken[];
  created: number;
  updated: number;
}

// Device token structure
interface DeviceToken {
  id: string;
  token: string;
  userId: string;
  registered: number;
  lastSeen: number;
  active: boolean;
  platform?: 'ios' | 'android';
  appVersion?: string;
  metadata?: Record<string, any>;
}

// Notification request
interface NotificationRequest {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  category?: string;
}

// Notification result
interface NotificationResult {
  totalDevices: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    deviceId: string;
    success: boolean;
    error?: string;
  }>;
}
```

### Monitoring Types

```typescript
// Performance statistics
interface PerformanceStats {
  operation: string;
  storageName: string;
  count: number;
  averageDuration: number;
  successRate: number;
  throughputPerSecond: number;
  p95Duration: number;
  p99Duration: number;
}

// System health report
interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  storages: StorageHealthStatus[];
  summary: {
    totalStorages: number;
    connectedStorages: number;
    respondingStorages: number;
    averageLatency: number;
  };
  recommendations: string[];
}

// Alert definition
interface Alert {
  id: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  source: string;
  resolved: boolean;
}
```

## Best Practices

### Performance Optimization

1. **Use batch operations** when possible:

   ```typescript
   // Good
   await mset(keyValuePairs);

   // Avoid
   for (const pair of keyValuePairs) {
     await set(pair.key, pair.value);
   }
   ```

2. **Monitor performance metrics**:

   ```typescript
   const report = generatePerformanceReport();
   if (report.averageLatency > 100) {
     console.warn('High latency detected');
   }
   ```

3. **Use appropriate data structures**:
   ```typescript
   // Store related data together
   await set(`user:${userId}`, userData);
   await set(`user:${userId}:devices`, devices);
   ```

### Error Handling

1. **Always handle errors gracefully**:

   ```typescript
   try {
     const data = await get('important-key');
     return data || defaultValue;
   } catch (error) {
     logError(error, 'storage', 'get', 'redis');
     return defaultValue;
   }
   ```

2. **Use shutdown-aware operations**:
   ```typescript
   const result = await wrapOperation('critical-update', async () => {
     return await updateCriticalData(data);
   });
   ```

### Monitoring

1. **Configure appropriate log levels**:

   ```typescript
   configureLogging({
     level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
   });
   ```

2. **Set up health monitoring**:

   ```typescript
   // Monitor system health
   setInterval(async () => {
     const health = await checkAllStorages();
     if (health.status !== 'healthy') {
       console.warn('System health issue:', health.recommendations);
     }
   }, 60000);
   ```

3. **Use performance benchmarks**:
   ```typescript
   // Regular performance checks
   const benchmark = await benchmarkStorage('redis', 100);
   if (benchmark.readLatency.averageDuration > 50) {
     console.warn('Redis performance degradation detected');
   }
   ```

## Examples

### Complete User Management Example

```typescript
import {
  registerDevice,
  sendNotificationToAllDevices,
  getDevices,
  cleanupInactiveDevices
} from './storage';

// Register a new user device
const device = await registerDevice('user123', {
  token: 'apns-device-token-here',
  lastSeen: Date.now(),
  active: true,
  platform: 'ios',
  appVersion: '1.2.0',
  metadata: { model: 'iPhone 14 Pro' }
});

// Send welcome notification
const result = await sendNotificationToAllDevices('user123', {
  title: 'Welcome to SHOOTER!',
  body: 'Your device has been successfully registered.',
  data: { type: 'welcome', deviceId: device.id }
});

console.log(`Notification sent to ${result.successCount} devices`);

// Periodic cleanup of inactive devices
setInterval(
  async () => {
    const cleanedCount = await cleanupInactiveDevices(30 * 24 * 60 * 60 * 1000); // 30 days
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} inactive devices`);
    }
  },
  24 * 60 * 60 * 1000
); // Daily
```

### Monitoring and Alerting Example

```typescript
import {
  startMonitoring,
  getActiveAlerts,
  resolveAlert,
  generatePerformanceReport
} from './storage';

// Start monitoring with custom configuration
startMonitoring({
  enabled: true,
  checkInterval: 30000,
  thresholds: {
    latencyWarning: 100,
    latencyCritical: 500,
    errorRateWarning: 5,
    errorRateCritical: 10
  },
  enableSlackAlerts: true,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL
});

// Check for active alerts
const alerts = getActiveAlerts();
if (alerts.length > 0) {
  console.log(`${alerts.length} active alerts:`, alerts);
}

// Generate performance report
const report = generatePerformanceReport();
console.log('System Performance:', {
  status: report.operationsPerSecond > 10 ? 'good' : 'degraded',
  operationsPerSecond: report.operationsPerSecond,
  averageLatency: report.averageLatency,
  errorRate: report.errorRate
});
```

This API provides comprehensive functionality for building robust, scalable notification systems with excellent observability and production-ready features.
