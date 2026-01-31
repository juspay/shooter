// Storage Health Monitoring and Checks
// Comprehensive health monitoring for all storage backends

import { getStorage, getConnectedStorages, getStorageHealth } from './registry.js';
import type { Storage } from './types.js';

/**
 * Extended storage interface with optional health check methods
 */
interface StorageWithHealthChecks extends Storage {
  ping?(): Promise<boolean>;
  getMetrics?(): StorageMetrics;
  getInfo?(): Promise<StorageInfo>;
  getPoolStatus?(): Promise<PoolStatus>;
}

/**
 * Metrics returned by storage implementations
 */
interface StorageMetrics {
  errorCount?: number;
  errorRate?: number;
  requestCount?: number;
  cacheHitRate?: number;
}

/**
 * Storage-specific information
 */
interface StorageInfo {
  version?: string;
  type?: string;
  capacity?: number;
  used?: number;
  [key: string]: unknown;
}

/**
 * Connection pool status for database backends
 */
interface PoolStatus {
  activeConnections?: number;
  idleConnections?: number;
  waitingClients?: number;
  maxConnections?: number;
  [key: string]: unknown;
}

/**
 * Health check test data structure
 */
interface HealthCheckData {
  healthCheck: boolean;
  timestamp: number;
}

/**
 * Health status for individual storage backend
 */
export interface StorageHealthStatus {
  name: string;
  connected: boolean;
  responding: boolean;
  latency: number | null;
  lastCheck: number;
  errorCount: number;
  errorRate: number;
  details: Record<string, unknown>;
}

/**
 * Overall system health report
 */
export interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  storages: StorageHealthStatus[];
  summary: {
    totalStorages: number;
    connectedStorages: number;
    respondingStorages: number;
    averageLatency: number;
    systemLoad: number;
  };
  recommendations: string[];
}

/**
 * Health check configuration
 */
interface HealthCheckConfig {
  timeout: number;
  retries: number;
  interval: number;
  enablePerformanceMetrics: boolean;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  timeout: 5000,
  retries: 2,
  interval: 30000,
  enablePerformanceMetrics: true
};

class HealthMonitor {
  private config: HealthCheckConfig;
  private startTime: number;
  private lastFullCheck: number = 0;
  private healthHistory: Map<string, StorageHealthStatus[]> = new Map();
  private maxHistoryLength = 100;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Perform health check on individual storage
   */
  async checkStorageHealth(storage: Storage): Promise<StorageHealthStatus> {
    const startTime = Date.now();
    const status: StorageHealthStatus = {
      name: storage.name,
      connected: storage.connected,
      responding: false,
      latency: null,
      lastCheck: startTime,
      errorCount: 0,
      errorRate: 0,
      details: {}
    };

    if (!storage.connected) {
      status.details.reason = 'Not connected';
      return status;
    }

    try {
      const storageWithChecks = storage as StorageWithHealthChecks;

      // Test basic connectivity with ping if available
      if (typeof storageWithChecks.ping === 'function') {
        const pingStart = Date.now();
        const pingResult = await Promise.race([
          storageWithChecks.ping(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Ping timeout')), this.config.timeout)
          )
        ]);

        const pingLatency = Date.now() - pingStart;
        status.responding = pingResult;
        status.latency = pingLatency;
        status.details.pingLatency = pingLatency;
      } else {
        // Fallback: test with a lightweight operation
        const testKey = `__health_check_${Date.now()}`;
        const testStart = Date.now();

        await Promise.race([
          this.performHealthTest(storage, testKey),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Health test timeout')), this.config.timeout)
          )
        ]);

        const testLatency = Date.now() - testStart;
        status.responding = true;
        status.latency = testLatency;
        status.details.testLatency = testLatency;
      }

      // Get additional metrics if available
      if (typeof storageWithChecks.getMetrics === 'function') {
        const metrics = storageWithChecks.getMetrics();
        status.errorCount = metrics.errorCount || 0;
        status.errorRate = metrics.errorRate || 0;
        status.details.metrics = metrics;
      }

      // Get storage-specific info
      if (typeof storageWithChecks.getInfo === 'function') {
        try {
          const info = await storageWithChecks.getInfo();
          if (info) {
            status.details.info = info;
          }
        } catch (error) {
          status.details.infoError = (error as Error).message;
        }
      }

      // Get connection pool status if available
      if (typeof storageWithChecks.getPoolStatus === 'function') {
        try {
          const poolStatus = await storageWithChecks.getPoolStatus();
          if (poolStatus) {
            status.details.poolStatus = poolStatus;
          }
        } catch (error) {
          status.details.poolError = (error as Error).message;
        }
      }
    } catch (error) {
      status.responding = false;
      status.details.error = (error as Error).message;
      status.errorCount++;
    }

    // Store in history
    this.addToHistory(storage.name, status);

    return status;
  }

  /**
   * Perform lightweight health test operation
   */
  private async performHealthTest(storage: Storage, testKey: string): Promise<void> {
    try {
      // Test set operation
      const testData: HealthCheckData = { healthCheck: true, timestamp: Date.now() };
      await storage.set(testKey, testData);

      // Test get operation
      const result = await storage.get<HealthCheckData>(testKey);
      if (!result || !result.healthCheck) {
        throw new Error('Health test data mismatch');
      }

      // Cleanup test data
      await storage.delete(testKey);
    } catch (error) {
      // Cleanup attempt even on failure
      try {
        await storage.delete(testKey);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Add health status to history
   */
  private addToHistory(storageName: string, status: StorageHealthStatus): void {
    if (!this.healthHistory.has(storageName)) {
      this.healthHistory.set(storageName, []);
    }

    const history = this.healthHistory.get(storageName)!;
    history.push(status);

    // Limit history size
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  /**
   * Get health history for a storage
   */
  getHealthHistory(storageName: string): StorageHealthStatus[] {
    return this.healthHistory.get(storageName) || [];
  }

  /**
   * Perform comprehensive system health check
   */
  async checkSystemHealth(): Promise<SystemHealthReport> {
    const timestamp = Date.now();
    this.lastFullCheck = timestamp;

    const connectedStorages = getConnectedStorages();
    const healthChecks = await Promise.allSettled(
      connectedStorages.map(storage => this.checkStorageHealth(storage))
    );

    const storageStatuses = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Create error status for failed health check
        const storage = connectedStorages[index]!;
        return {
          name: storage.name,
          connected: storage.connected,
          responding: false,
          latency: null,
          lastCheck: timestamp,
          errorCount: 1,
          errorRate: 1,
          details: { healthCheckError: result.reason.message }
        } as StorageHealthStatus;
      }
    });

    // Calculate summary statistics
    const respondingStorages = storageStatuses.filter(s => s.responding);
    const totalLatency = respondingStorages
      .filter(s => s.latency !== null)
      .reduce((sum, s) => sum + s.latency!, 0);
    const averageLatency =
      respondingStorages.length > 0 ? totalLatency / respondingStorages.length : 0;

    // Determine overall system status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (respondingStorages.length === storageStatuses.length) {
      status = 'healthy';
    } else if (respondingStorages.length > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(storageStatuses);

    return {
      status,
      timestamp,
      uptime: timestamp - this.startTime,
      storages: storageStatuses,
      summary: {
        totalStorages: storageStatuses.length,
        connectedStorages: storageStatuses.filter(s => s.connected).length,
        respondingStorages: respondingStorages.length,
        averageLatency,
        systemLoad: this.calculateSystemLoad(storageStatuses)
      },
      recommendations
    };
  }

  /**
   * Generate actionable recommendations based on health status
   */
  private generateRecommendations(storages: StorageHealthStatus[]): string[] {
    const recommendations: string[] = [];

    // Check for disconnected storages
    const disconnected = storages.filter(s => !s.connected);
    if (disconnected.length > 0) {
      recommendations.push(
        `${disconnected.length} storage(s) disconnected: ${disconnected.map(s => s.name).join(', ')}`
      );
    }

    // Check for unresponsive storages
    const unresponsive = storages.filter(s => s.connected && !s.responding);
    if (unresponsive.length > 0) {
      recommendations.push(
        `${unresponsive.length} storage(s) unresponsive: ${unresponsive.map(s => s.name).join(', ')}`
      );
    }

    // Check for high latency
    const highLatency = storages.filter(s => s.latency && s.latency > 1000);
    if (highLatency.length > 0) {
      recommendations.push(`High latency detected in: ${highLatency.map(s => s.name).join(', ')}`);
    }

    // Check for high error rates
    const highErrors = storages.filter(s => s.errorRate > 0.1);
    if (highErrors.length > 0) {
      recommendations.push(`High error rates in: ${highErrors.map(s => s.name).join(', ')}`);
    }

    // System-wide recommendations
    if (storages.every(s => !s.responding)) {
      recommendations.push(
        'CRITICAL: All storage backends are unresponsive - check system resources and network connectivity'
      );
    } else if (storages.filter(s => s.responding).length === 1) {
      recommendations.push(
        'WARNING: Only one storage backend is responding - consider investigating backup systems'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operational');
    }

    return recommendations;
  }

  /**
   * Calculate system load based on storage performance
   */
  private calculateSystemLoad(storages: StorageHealthStatus[]): number {
    if (storages.length === 0) {
return 0;
}

    let load = 0;

    // Factor in connectivity (20% weight)
    const connectedRatio = storages.filter(s => s.connected).length / storages.length;
    load += (1 - connectedRatio) * 0.2;

    // Factor in responsiveness (30% weight)
    const respondingRatio = storages.filter(s => s.responding).length / storages.length;
    load += (1 - respondingRatio) * 0.3;

    // Factor in latency (25% weight)
    const respondingWithLatency = storages.filter(s => s.latency !== null);
    if (respondingWithLatency.length > 0) {
      const avgLatency =
        respondingWithLatency.reduce((sum, s) => sum + s.latency!, 0) /
        respondingWithLatency.length;
      const latencyScore = Math.min(avgLatency / 1000, 1); // Normalize to 0-1 (1000ms = max)
      load += latencyScore * 0.25;
    }

    // Factor in error rates (25% weight)
    const avgErrorRate = storages.reduce((sum, s) => sum + s.errorRate, 0) / storages.length;
    load += avgErrorRate * 0.25;

    return Math.min(load, 1); // Cap at 1.0
  }

  /**
   * Get storage performance trends
   */
  getPerformanceTrends(
    storageName: string,
    timeframe: number = 300000
  ): {
    averageLatency: number;
    errorRate: number;
    uptimePercentage: number;
    trend: 'improving' | 'stable' | 'degrading';
  } {
    const history = this.getHealthHistory(storageName);
    const cutoffTime = Date.now() - timeframe;
    const recentHistory = history.filter(h => h.lastCheck > cutoffTime);

    if (recentHistory.length === 0) {
      return {
        averageLatency: 0,
        errorRate: 0,
        uptimePercentage: 0,
        trend: 'stable'
      };
    }

    const responding = recentHistory.filter(h => h.responding);
    const averageLatency =
      responding.length > 0
        ? responding.reduce((sum, h) => sum + (h.latency || 0), 0) / responding.length
        : 0;

    const errorRate = recentHistory.reduce((sum, h) => sum + h.errorRate, 0) / recentHistory.length;
    const uptimePercentage = responding.length / recentHistory.length;

    // Determine trend by comparing first half vs second half
    const midpoint = Math.floor(recentHistory.length / 2);
    const firstHalf = recentHistory.slice(0, midpoint);
    const secondHalf = recentHistory.slice(midpoint);

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstHalfUptime = firstHalf.filter(h => h.responding).length / firstHalf.length;
      const secondHalfUptime = secondHalf.filter(h => h.responding).length / secondHalf.length;

      const uptimeDiff = secondHalfUptime - firstHalfUptime;
      if (uptimeDiff > 0.1) {
        trend = 'improving';
      } else if (uptimeDiff < -0.1) {
        trend = 'degrading';
      }
    }

    return {
      averageLatency,
      errorRate,
      uptimePercentage,
      trend
    };
  }
}

// Global health monitor instance
const healthMonitor = new HealthMonitor();

/**
 * Get current storage health status
 */
export function getStorageHealthStatus(): Record<string, boolean> {
  return getStorageHealth();
}

/**
 * Perform quick health check on all storages
 */
export async function checkAllStorages(): Promise<SystemHealthReport> {
  return healthMonitor.checkSystemHealth();
}

/**
 * Check individual storage health
 */
export async function checkStorageHealth(storageName: string): Promise<StorageHealthStatus | null> {
  const storage = getStorage(storageName);
  if (!storage) {
    return null;
  }

  return healthMonitor.checkStorageHealth(storage);
}

/**
 * Get performance trends for a storage
 */
export function getStoragePerformanceTrends(storageName: string, timeframeMs: number = 300000) {
  return healthMonitor.getPerformanceTrends(storageName, timeframeMs);
}

/**
 * Get health history for monitoring
 */
export function getStorageHealthHistory(storageName: string): StorageHealthStatus[] {
  return healthMonitor.getHealthHistory(storageName);
}

/**
 * Configure health monitoring
 */
export function configureHealthMonitoring(config: Partial<HealthCheckConfig>): void {
  Object.assign(healthMonitor['config'], config);
}

/**
 * Express.js/HTTP health check endpoint
 */
export async function healthCheckEndpoint(): Promise<{
  status: number;
  body: SystemHealthReport;
}> {
  const healthReport = await checkAllStorages();

  let statusCode: number;
  switch (healthReport.status) {
    case 'healthy':
      statusCode = 200;
      break;
    case 'degraded':
      statusCode = 200; // Still operational
      break;
    case 'unhealthy':
      statusCode = 503; // Service unavailable
      break;
    default:
      statusCode = 500;
  }

  return {
    status: statusCode,
    body: healthReport
  };
}

/**
 * Minimal health check for load balancers
 */
export async function simpleHealthCheck(): Promise<{
  status: 'ok' | 'error';
  timestamp: number;
}> {
  try {
    const connectedStorages = getConnectedStorages();
    const hasResponding = connectedStorages.length > 0;

    return {
      status: hasResponding ? 'ok' : 'error',
      timestamp: Date.now()
    };
  } catch (_error) {
    return {
      status: 'error',
      timestamp: Date.now()
    };
  }
}

// Export health monitor for advanced usage
export { healthMonitor as HealthMonitor };
