// Performance Metrics and Optimization
// Comprehensive performance monitoring and optimization for storage system

import type { Storage } from './types.js';
import { getConnectedStorages, getStorage } from './registry.js';
import { logPerformance, logInfo, logWarn } from './logging.js';
import type { PerformanceContext } from './logging.js';

/**
 * Performance metric entry
 */
export interface PerformanceMetric {
  operation: string;
  storageName: string;
  duration: number;
  timestamp: number;
  success: boolean;
  keySize?: number;
  valueSize?: number;
  metadata?: PerformanceContext;
}

/**
 * Aggregated performance statistics
 */
export interface PerformanceStats {
  operation: string;
  storageName: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  errorsPerMinute: number;
  throughputPerSecond: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

/**
 * System performance summary
 */
export interface SystemPerformanceReport {
  timestamp: number;
  uptime: number;
  totalOperations: number;
  operationsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  storageStats: PerformanceStats[];
  bottlenecks: string[];
  recommendations: string[];
  resourceUsage: {
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    cpu: number;
  };
}

/**
 * Performance monitoring configuration
 */
interface MetricsConfig {
  enabled: boolean;
  maxMetrics: number;
  aggregationWindow: number; // milliseconds
  enableDetailedMetrics: boolean;
  enableResourceMonitoring: boolean;
  enableBottleneckDetection: boolean;
  slowOperationThreshold: number; // milliseconds
}

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  enabled: true,
  maxMetrics: 10000,
  aggregationWindow: 300000, // 5 minutes for better test coverage
  enableDetailedMetrics: true,
  enableResourceMonitoring: true,
  enableBottleneckDetection: true,
  slowOperationThreshold: 100
};

class PerformanceMonitor {
  private config: MetricsConfig;
  private metrics: PerformanceMetric[] = [];
  private startTime: number;
  private lastCleanup: number = 0;
  private cleanupInterval = 300000; // 5 minutes

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    operation: string,
    storageName: string,
    duration: number,
    success: boolean,
    metadata?: PerformanceContext
  ): void {
    if (!this.config.enabled) {
return;
}

    const metric: PerformanceMetric = {
      operation,
      storageName,
      duration,
      timestamp: Date.now(),
      success,
      metadata: metadata || {}
    };

    // Add data size metrics if available
    if (metadata?.key) {
      metric.keySize = new TextEncoder().encode(JSON.stringify(metadata.key)).length;
    }

    this.metrics.push(metric);

    // Log performance for external monitoring
    logPerformance(operation, storageName, duration, success, metadata);

    // Detect slow operations
    if (duration > this.config.slowOperationThreshold) {
      logWarn(
        'performance',
        `Slow operation detected: ${operation} on ${storageName} took ${duration}ms`,
        {
          operation,
          storageName,
          duration,
          threshold: this.config.slowOperationThreshold,
          ...metadata
        }
      );
    }

    // Cleanup old metrics if needed
    this.cleanupMetricsIfNeeded();
  }

  /**
   * Get performance statistics for a specific operation and storage
   */
  getStats(operation?: string, storageName?: string, timeWindow?: number): PerformanceStats[] {
    const now = Date.now();
    const cutoff = timeWindow ? now - timeWindow : now - this.config.aggregationWindow;

    let filteredMetrics = this.metrics.filter(m => m.timestamp >= cutoff);

    if (operation) {
      filteredMetrics = filteredMetrics.filter(m => m.operation === operation);
    }
    if (storageName) {
      filteredMetrics = filteredMetrics.filter(m => m.storageName === storageName);
    }

    // Group by operation and storage
    const groups = new Map<string, PerformanceMetric[]>();
    for (const metric of filteredMetrics) {
      const key = `${metric.operation}:${metric.storageName}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(metric);
    }

    // Calculate statistics for each group
    const stats: PerformanceStats[] = [];
    for (const [key, metrics] of groups.entries()) {
      const [op, storage] = key.split(':');
      if (!op || !storage) {
continue;
} // Skip invalid keys

      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const successCount = metrics.filter(m => m.success).length;
      const errorCount = metrics.length - successCount;
      const timeSpan = timeWindow || this.config.aggregationWindow;

      stats.push({
        operation: op,
        storageName: storage,
        count: metrics.length,
        totalDuration: durations.reduce((sum, d) => sum + d, 0),
        averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minDuration: durations[0] || 0,
        maxDuration: durations[durations.length - 1] || 0,
        successRate: metrics.length > 0 ? successCount / metrics.length : 0,
        errorsPerMinute: (errorCount / timeSpan) * 60000,
        throughputPerSecond: (metrics.length / timeSpan) * 1000,
        p50Duration: this.percentile(durations, 0.5),
        p95Duration: this.percentile(durations, 0.95),
        p99Duration: this.percentile(durations, 0.99)
      });
    }

    return stats.sort((a, b) => b.throughputPerSecond - a.throughputPerSecond);
  }

  /**
   * Generate comprehensive system performance report
   */
  generateSystemReport(): SystemPerformanceReport {
    const now = Date.now();
    const uptime = now - this.startTime;
    const timeWindow = this.config.aggregationWindow;
    const recentMetrics = this.metrics.filter(m => m.timestamp >= now - timeWindow);

    const totalOperations = recentMetrics.length;
    const operationsPerSecond = (totalOperations / timeWindow) * 1000;
    const averageLatency =
      totalOperations > 0
        ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations
        : 0;
    const errorCount = recentMetrics.filter(m => !m.success).length;
    const errorRate = totalOperations > 0 ? errorCount / totalOperations : 0;

    const storageStats = this.getStats();
    const bottlenecks = this.detectBottlenecks(storageStats);
    const recommendations = this.generateRecommendations(storageStats, bottlenecks);
    const resourceUsage = this.getResourceUsage();

    return {
      timestamp: now,
      uptime,
      totalOperations,
      operationsPerSecond,
      averageLatency,
      errorRate,
      storageStats,
      bottlenecks,
      recommendations,
      resourceUsage
    };
  }

  /**
   * Detect performance bottlenecks
   */
  private detectBottlenecks(stats: PerformanceStats[]): string[] {
    const bottlenecks: string[] = [];

    for (const stat of stats) {
      // High latency detection
      if (stat.averageDuration > this.config.slowOperationThreshold) {
        bottlenecks.push(
          `High latency in ${stat.storageName} ${stat.operation}: ${stat.averageDuration.toFixed(1)}ms avg`
        );
      }

      // Low success rate detection
      if (stat.successRate < 0.95 && stat.count > 10) {
        bottlenecks.push(
          `Low success rate in ${stat.storageName} ${stat.operation}: ${(stat.successRate * 100).toFixed(1)}%`
        );
      }

      // High error rate detection
      if (stat.errorsPerMinute > 5) {
        bottlenecks.push(
          `High error rate in ${stat.storageName} ${stat.operation}: ${stat.errorsPerMinute.toFixed(1)} errors/min`
        );
      }

      // P99 latency spikes
      if (stat.p99Duration > stat.averageDuration * 3) {
        bottlenecks.push(
          `Latency spikes in ${stat.storageName} ${stat.operation}: P99 ${stat.p99Duration.toFixed(1)}ms`
        );
      }

      // Low throughput detection
      if (stat.throughputPerSecond < 1 && stat.count > 5) {
        bottlenecks.push(
          `Low throughput in ${stat.storageName} ${stat.operation}: ${stat.throughputPerSecond.toFixed(2)} ops/sec`
        );
      }
    }

    return bottlenecks;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(stats: PerformanceStats[], bottlenecks: string[]): string[] {
    const recommendations: string[] = [];

    // General recommendations
    if (bottlenecks.length === 0) {
      recommendations.push('System performance is optimal');
    } else {
      recommendations.push(`${bottlenecks.length} performance issue(s) detected`);
    }

    // Storage-specific recommendations
    const storageNames = [...new Set(stats.map(s => s.storageName))];
    for (const storageName of storageNames) {
      const storageStats = stats.filter(s => s.storageName === storageName);
      const avgLatency =
        storageStats.reduce((sum, s) => sum + s.averageDuration * s.count, 0) /
        storageStats.reduce((sum, s) => sum + s.count, 0);

      if (storageName === 'memory' && avgLatency > 1) {
        recommendations.push('Memory storage latency is high - check for memory pressure');
      } else if (storageName === 'redis' && avgLatency > 50) {
        recommendations.push(
          'Redis latency is high - check network connectivity and Redis server performance'
        );
      } else if (storageName === 'database' && avgLatency > 200) {
        recommendations.push(
          'Database latency is high - consider connection pooling, indexing, or query optimization'
        );
      }
    }

    // Operation-specific recommendations
    const operationStats = new Map<string, PerformanceStats[]>();
    for (const stat of stats) {
      if (!operationStats.has(stat.operation)) {
        operationStats.set(stat.operation, []);
      }
      operationStats.get(stat.operation)!.push(stat);
    }

    for (const [operation, opStats] of operationStats.entries()) {
      const avgLatency =
        opStats.reduce((sum, s) => sum + s.averageDuration * s.count, 0) /
        opStats.reduce((sum, s) => sum + s.count, 0);

      if (operation === 'get' && avgLatency > 50) {
        recommendations.push(
          'GET operations are slow - consider caching optimization or read replicas'
        );
      } else if (operation === 'set' && avgLatency > 100) {
        recommendations.push(
          'SET operations are slow - consider write batching or async processing'
        );
      }
    }

    // Resource usage recommendations
    const resourceUsage = this.getResourceUsage();
    if (resourceUsage.memoryUsage > 0.8) {
      recommendations.push(
        'High memory usage detected - consider implementing cache eviction policies'
      );
    }
    if (resourceUsage.cpu > 0.7) {
      recommendations.push('High CPU usage detected - consider optimizing algorithms or scaling');
    }

    return recommendations;
  }

  /**
   * Get current resource usage
   */
  private getResourceUsage(): SystemPerformanceReport['resourceUsage'] {
    if (!this.config.enableResourceMonitoring) {
      return {
        memoryUsage: 0,
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        cpu: 0
      };
    }

    const memUsage = process.memoryUsage();

    // Use a reasonable default for total memory calculation
    const totalMem = 8 * 1024 * 1024 * 1024; // 8GB default for resource calculation

    // CPU usage is more complex to calculate accurately, using a simple approximation
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

    return {
      memoryUsage: memUsage.rss / totalMem,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      cpu: cpuPercent
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) {
return 0;
}

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)]!;
  }

  /**
   * Benchmark storage operations
   */
  async benchmarkStorage(
    storageName: string,
    operations: number = 1000
  ): Promise<{
    readLatency: PerformanceStats;
    writeLatency: PerformanceStats;
    readThroughput: number;
    writeThroughput: number;
  }> {
    const storage = getStorage(storageName);
    if (!storage?.connected) {
      throw new Error(`Storage ${storageName} is not connected`);
    }

    logInfo('performance', `Starting benchmark for ${storageName} with ${operations} operations`);

    const testData = { benchmark: true, timestamp: Date.now(), data: 'x'.repeat(100) };
    const readMetrics: number[] = [];
    const writeMetrics: number[] = [];

    // Benchmark writes
    const writeStartTime = Date.now();
    for (let i = 0; i < operations; i++) {
      const key = `benchmark:write:${i}`;
      const start = Date.now();

      try {
        await storage.set(key, { ...testData, index: i });
        const duration = Date.now() - start;
        writeMetrics.push(duration);
        this.recordMetric('benchmark_write', storageName, duration, true, { key });
      } catch (error) {
        const duration = Date.now() - start;
        writeMetrics.push(duration);
        this.recordMetric('benchmark_write', storageName, duration, false, {
          key,
          error: (error as Error).message
        });
      }
    }
    const totalWriteTime = Date.now() - writeStartTime;

    // Benchmark reads
    const readStartTime = Date.now();
    for (let i = 0; i < operations; i++) {
      const key = `benchmark:write:${i}`;
      const start = Date.now();

      try {
        await storage.get(key);
        const duration = Date.now() - start;
        readMetrics.push(duration);
        this.recordMetric('benchmark_read', storageName, duration, true, { key });
      } catch (error) {
        const duration = Date.now() - start;
        readMetrics.push(duration);
        this.recordMetric('benchmark_read', storageName, duration, false, {
          key,
          error: (error as Error).message
        });
      }
    }
    const totalReadTime = Date.now() - readStartTime;

    // Cleanup benchmark data
    for (let i = 0; i < operations; i++) {
      try {
        await storage.delete(`benchmark:write:${i}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    const sortedReads = readMetrics.sort((a, b) => a - b);
    const sortedWrites = writeMetrics.sort((a, b) => a - b);

    const readLatency: PerformanceStats = {
      operation: 'benchmark_read',
      storageName,
      count: readMetrics.length,
      totalDuration: readMetrics.reduce((sum, d) => sum + d, 0),
      averageDuration: readMetrics.reduce((sum, d) => sum + d, 0) / readMetrics.length,
      minDuration: sortedReads[0] || 0,
      maxDuration: sortedReads[sortedReads.length - 1] || 0,
      successRate: 1, // Simplified for benchmark
      errorsPerMinute: 0,
      throughputPerSecond: (operations / totalReadTime) * 1000,
      p50Duration: this.percentile(sortedReads, 0.5),
      p95Duration: this.percentile(sortedReads, 0.95),
      p99Duration: this.percentile(sortedReads, 0.99)
    };

    const writeLatency: PerformanceStats = {
      operation: 'benchmark_write',
      storageName,
      count: writeMetrics.length,
      totalDuration: writeMetrics.reduce((sum, d) => sum + d, 0),
      averageDuration: writeMetrics.reduce((sum, d) => sum + d, 0) / writeMetrics.length,
      minDuration: sortedWrites[0] || 0,
      maxDuration: sortedWrites[sortedWrites.length - 1] || 0,
      successRate: 1, // Simplified for benchmark
      errorsPerMinute: 0,
      throughputPerSecond: (operations / totalWriteTime) * 1000,
      p50Duration: this.percentile(sortedWrites, 0.5),
      p95Duration: this.percentile(sortedWrites, 0.95),
      p99Duration: this.percentile(sortedWrites, 0.99)
    };

    logInfo('performance', `Benchmark completed for ${storageName}`, {
      operations,
      readThroughput: readLatency.throughputPerSecond,
      writeThroughput: writeLatency.throughputPerSecond,
      readAvgLatency: readLatency.averageDuration,
      writeAvgLatency: writeLatency.averageDuration
    });

    return {
      readLatency,
      writeLatency,
      readThroughput: readLatency.throughputPerSecond,
      writeThroughput: writeLatency.throughputPerSecond
    };
  }

  /**
   * Optimize storage system based on current metrics
   */
  async optimizeSystem(): Promise<string[]> {
    const _report = this.generateSystemReport();
    const optimizations: string[] = [];

    logInfo('performance', 'Starting system optimization based on performance metrics');

    // Type guard for storages with optimize capability
    function hasOptimize(storage: Storage): storage is Storage & { optimize: () => Promise<void> } {
      return 'optimize' in storage && typeof (storage as { optimize?: unknown }).optimize === 'function';
    }

    // Trigger storage-specific optimizations
    const connectedStorages = getConnectedStorages();
    for (const storage of connectedStorages) {
      if (hasOptimize(storage)) {
        try {
          await storage.optimize();
          optimizations.push(`Optimized ${storage.name} storage`);
        } catch (error) {
          logWarn('performance', `Failed to optimize ${storage.name}`, { error: (error as Error).message });
        }
      }
    }

    // Clear old metrics to free memory
    const oldMetricsCount = this.metrics.length;
    this.cleanupOldMetrics(this.config.aggregationWindow * 2);
    const newMetricsCount = this.metrics.length;
    if (oldMetricsCount > newMetricsCount) {
      optimizations.push(`Cleaned up ${oldMetricsCount - newMetricsCount} old metrics`);
    }

    logInfo('performance', `System optimization completed`, {
      optimizations: optimizations.length,
      details: optimizations.join(', ')
    });

    return optimizations;
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupMetricsIfNeeded(): void {
    const now = Date.now();

    // Cleanup every 5 minutes
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    const oldCount = this.metrics.length;

    // Remove metrics older than aggregation window * 2
    this.cleanupOldMetrics(this.config.aggregationWindow * 2);

    // Limit total metrics
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics = this.metrics.slice(-this.config.maxMetrics);
    }

    const newCount = this.metrics.length;
    if (oldCount > newCount) {
      logInfo('performance', `Cleaned up ${oldCount - newCount} old metrics`, {
        oldCount,
        newCount,
        retention: this.config.aggregationWindow * 2
      });
    }

    this.lastCleanup = now;
  }

  /**
   * Remove metrics older than specified age
   */
  private cleanupOldMetrics(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Configure metrics collection
   */
  configure(config: Partial<MetricsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MetricsConfig {
    return { ...this.config };
  }

  /**
   * Reset all metrics and statistics
   */
  reset(): void {
    this.metrics = [];
    this.startTime = Date.now();
    this.lastCleanup = 0;
    logInfo('performance', 'Performance metrics reset');
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'timestamp',
        'operation',
        'storageName',
        'duration',
        'success',
        'keySize',
        'valueSize'
      ];
      const csvRows = this.metrics.map(m =>
        [
          new Date(m.timestamp).toISOString(),
          m.operation,
          m.storageName,
          m.duration,
          m.success,
          m.keySize || '',
          m.valueSize || ''
        ].join(',')
      );

      return [headers.join(','), ...csvRows].join('\n');
    }

    return JSON.stringify(this.metrics, null, 2);
  }
}

// Global performance monitor instance
const performanceMonitor = new PerformanceMonitor();

// Export performance monitoring functions
export function recordPerformanceMetric(
  operation: string,
  storageName: string,
  duration: number,
  success: boolean,
  metadata?: PerformanceContext
): void {
  performanceMonitor.recordMetric(operation, storageName, duration, success, metadata);
}

export function getPerformanceStats(
  operation?: string,
  storageName?: string,
  timeWindow?: number
): PerformanceStats[] {
  return performanceMonitor.getStats(operation, storageName, timeWindow);
}

export function generatePerformanceReport(): SystemPerformanceReport {
  return performanceMonitor.generateSystemReport();
}

export async function benchmarkStorage(
  storageName: string,
  operations?: number
): Promise<ReturnType<PerformanceMonitor['benchmarkStorage']>> {
  return performanceMonitor.benchmarkStorage(storageName, operations);
}

export async function optimizeStorageSystem(): Promise<string[]> {
  return performanceMonitor.optimizeSystem();
}

export function configureMetrics(config: Partial<MetricsConfig>): void {
  performanceMonitor.configure(config);
}

export function resetMetrics(): void {
  performanceMonitor.reset();
}

export function exportPerformanceMetrics(format: 'json' | 'csv' = 'json'): string {
  return performanceMonitor.exportMetrics(format);
}

// Export the monitor instance for advanced usage
export { performanceMonitor as PerformanceMonitor };
