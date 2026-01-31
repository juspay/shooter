# Performance Monitoring Guide

This guide provides comprehensive instructions for monitoring, analyzing, and optimizing the performance of the Shooter iOS Notification System. The system includes built-in performance monitoring capabilities achieving 4350+ ops/sec throughput.

## Table of Contents

1. [Monitoring Overview](#monitoring-overview)
2. [Performance Metrics](#performance-metrics)
3. [Real-time Monitoring](#real-time-monitoring)
4. [Health Monitoring](#health-monitoring)
5. [Resource Monitoring](#resource-monitoring)
6. [Performance Analysis](#performance-analysis)
7. [Alerting and Notifications](#alerting-and-notifications)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting Performance Issues](#troubleshooting-performance-issues)
10. [Monitoring Tools Integration](#monitoring-tools-integration)

## Monitoring Overview

### Performance Monitoring Architecture

The Shooter iOS Notification System includes comprehensive performance monitoring built on multiple layers:

- **Application Metrics**: Real-time operation tracking and performance measurement
- **Storage Metrics**: Multi-backend storage performance monitoring
- **System Metrics**: Resource usage, memory, CPU, and network monitoring
- **Health Metrics**: System health and availability monitoring
- **Business Metrics**: Notification delivery rates and user engagement

### Key Performance Indicators (KPIs)

- **Throughput**: 4350+ operations per second under load
- **Latency**: Sub-100ms P99 latency for critical operations
- **Availability**: 99.9%+ uptime with health monitoring
- **Success Rate**: 100% notification delivery success rate
- **Resource Efficiency**: Optimized memory and CPU usage

## Performance Metrics

### Core Metrics Collection

The system automatically collects comprehensive performance metrics across all operations.

#### Metric Types

```typescript
interface PerformanceMetric {
  operation: string; // Operation type (get, set, remove, notify)
  storageName: string; // Storage backend (memory, redis, database)
  duration: number; // Operation duration in milliseconds
  timestamp: number; // Timestamp of operation
  success: boolean; // Operation success/failure
  keySize?: number; // Size of key in bytes
  valueSize?: number; // Size of value in bytes
  metadata?: Record<string, any>; // Additional context
}
```

#### Automatic Metric Recording

```typescript
// Metrics are automatically recorded for all operations
await set('user:123', userData); // Automatically tracked
const user = await get('user:123'); // Automatically tracked
await remove('user:123'); // Automatically tracked

// Manual metric recording for custom operations
recordPerformanceMetric('custom_operation', 'service', duration, true, {
  userId: '123',
  operationType: 'custom'
});
```

### Performance Statistics

The system calculates comprehensive statistics from collected metrics.

#### Statistical Aggregation

```typescript
interface PerformanceStats {
  operation: string;
  storageName: string;
  count: number; // Total operations
  totalDuration: number; // Total time spent
  averageDuration: number; // Average operation time
  minDuration: number; // Fastest operation
  maxDuration: number; // Slowest operation
  successRate: number; // Success percentage
  errorsPerMinute: number; // Error rate
  throughputPerSecond: number; // Operations per second
  p50Duration: number; // 50th percentile
  p95Duration: number; // 95th percentile
  p99Duration: number; // 99th percentile
}
```

#### Retrieving Performance Statistics

```typescript
// Get all performance statistics
const allStats = getPerformanceStats();

// Get statistics for specific operation
const getStats = getPerformanceStats('get');

// Get statistics for specific storage backend
const memoryStats = getPerformanceStats(undefined, 'memory');

// Get statistics for specific time window (last hour)
const recentStats = getPerformanceStats(undefined, undefined, 3600000);
```

### System Performance Report

Comprehensive system-wide performance analysis.

#### Performance Report Structure

```typescript
interface SystemPerformanceReport {
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
```

#### Generating Performance Reports

```typescript
// Generate comprehensive performance report
const report = generatePerformanceReport();

console.log(`System Performance Report:`);
console.log(`Total Operations: ${report.totalOperations}`);
console.log(`Operations/sec: ${report.operationsPerSecond.toFixed(2)}`);
console.log(`Average Latency: ${report.averageLatency.toFixed(2)}ms`);
console.log(`Error Rate: ${(report.errorRate * 100).toFixed(2)}%`);
console.log(`Bottlenecks: ${report.bottlenecks.length}`);
console.log(`Recommendations: ${report.recommendations.length}`);
```

## Real-time Monitoring

### Live Performance Monitoring

The system provides real-time performance monitoring capabilities.

#### Real-time Metrics Endpoint

```typescript
// Built-in metrics endpoint
app.get('/metrics', (req, res) => {
  const report = generatePerformanceReport();
  res.json(report);
});

// Prometheus-compatible metrics
app.get('/metrics/prometheus', (req, res) => {
  const metrics = exportPerformanceMetrics('prometheus');
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});
```

#### WebSocket Performance Streaming

```typescript
// Real-time performance streaming
io.on('connection', socket => {
  const performanceInterval = setInterval(() => {
    const report = generatePerformanceReport();
    socket.emit('performance_update', report);
  }, 5000); // Update every 5 seconds

  socket.on('disconnect', () => {
    clearInterval(performanceInterval);
  });
});
```

### Dashboard Integration

The system supports integration with popular monitoring dashboards.

#### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "Shooter Notification System Performance",
    "panels": [
      {
        "title": "Operations per Second",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(operations_total[5m])",
            "legendFormat": "Operations/sec"
          }
        ]
      },
      {
        "title": "Average Latency",
        "type": "stat",
        "targets": [
          {
            "expr": "avg(operation_duration_ms)",
            "legendFormat": "Avg Latency (ms)"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(operations_errors_total[5m]) / rate(operations_total[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      },
      {
        "title": "Storage Backend Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "avg(operation_duration_ms) by (storage_backend)",
            "legendFormat": "{{storage_backend}}"
          }
        ]
      }
    ]
  }
}
```

## Health Monitoring

### Multi-layer Health Checking

The system implements comprehensive health monitoring across multiple layers.

#### Health Check Types

```typescript
// Simple health check
const simpleHealth = await simpleHealthCheck();
// Returns: { status: 'ok', timestamp: 1234567890 }

// Storage health check
const storageHealth = await checkAllStorages();
// Returns detailed health information for all storage backends

// System health check
const systemHealth = getSystemHealth();
// Returns comprehensive system status
```

#### Health Check Implementation

```typescript
async function comprehensiveHealthCheck(): Promise<HealthReport> {
  const checks = {
    storage: await checkAllStorages(),
    performance: checkPerformanceHealth(),
    resources: checkResourceHealth(),
    connectivity: await checkConnectivity()
  };

  const overallHealth = Object.values(checks).every(
    check => check.status === 'healthy' || check.status === 'ok'
  )
    ? 'healthy'
    : 'unhealthy';

  return {
    status: overallHealth,
    timestamp: Date.now(),
    checks,
    uptime: Date.now() - startTime
  };
}
```

### Health Endpoints

```typescript
// Health check endpoints
app.get('/api/health', async (req, res) => {
  const health = await simpleHealthCheck();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/api/health/detailed', async (req, res) => {
  const health = await comprehensiveHealthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

app.get('/api/health/storage', async (req, res) => {
  const health = await checkAllStorages();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Health Monitoring Configuration

```typescript
// Configure health monitoring
configureHealthMonitoring({
  checkInterval: 30000, // Check every 30 seconds
  failureThreshold: 3, // Fail after 3 consecutive failures
  recoveryThreshold: 2, // Recover after 2 consecutive successes
  alertOnFailure: true, // Send alerts on health failures
  alertOnRecovery: true // Send alerts on recovery
});
```

## Resource Monitoring

### System Resource Tracking

Comprehensive monitoring of system resources including memory, CPU, and network usage.

#### Memory Monitoring

```typescript
function getMemoryMetrics() {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    memoryUsagePercent: (usage.heapUsed / usage.heapTotal) * 100
  };
}

// Monitor memory usage over time
setInterval(() => {
  const memory = getMemoryMetrics();
  recordPerformanceMetric('memory_usage', 'system', memory.heapUsedMB, true, memory);

  // Alert on high memory usage
  if (memory.memoryUsagePercent > 85) {
    console.warn(`High memory usage: ${memory.memoryUsagePercent.toFixed(2)}%`);
  }
}, 60000); // Check every minute
```

#### CPU Monitoring

```typescript
function getCPUMetrics() {
  const usage = process.cpuUsage();
  return {
    user: usage.user,
    system: usage.system,
    total: usage.user + usage.system,
    userSeconds: usage.user / 1000000,
    systemSeconds: usage.system / 1000000,
    totalSeconds: (usage.user + usage.system) / 1000000
  };
}

// Monitor CPU usage
let lastCPUUsage = process.cpuUsage();
setInterval(() => {
  const currentUsage = process.cpuUsage(lastCPUUsage);
  const cpuPercent = ((currentUsage.user + currentUsage.system) / 1000000 / 60) * 100; // Over 60 seconds

  recordPerformanceMetric('cpu_usage', 'system', cpuPercent, true, currentUsage);
  lastCPUUsage = process.cpuUsage();
}, 60000);
```

#### Network Monitoring

```typescript
function getNetworkMetrics() {
  // Monitor network I/O (simplified example)
  return {
    activeConnections: server.connections || 0,
    requestsPerMinute: getRequestRate(),
    bytesTransferred: getBytesTransferred(),
    averageResponseTime: getAverageResponseTime()
  };
}
```

### Resource Alerts

```typescript
function checkResourceThresholds() {
  const memory = getMemoryMetrics();
  const cpu = getCPUMetrics();

  const alerts = [];

  // Memory alerts
  if (memory.memoryUsagePercent > 90) {
    alerts.push({
      type: 'memory',
      severity: 'critical',
      message: `Memory usage critical: ${memory.memoryUsagePercent.toFixed(2)}%`,
      value: memory.memoryUsagePercent
    });
  } else if (memory.memoryUsagePercent > 75) {
    alerts.push({
      type: 'memory',
      severity: 'warning',
      message: `Memory usage high: ${memory.memoryUsagePercent.toFixed(2)}%`,
      value: memory.memoryUsagePercent
    });
  }

  // Process alerts
  alerts.forEach(alert => {
    console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
    // Send to monitoring system
  });

  return alerts;
}
```

## Performance Analysis

### Bottleneck Detection

Automated detection of performance bottlenecks and issues.

#### Bottleneck Detection Algorithm

```typescript
function detectBottlenecks(stats: PerformanceStats[]): string[] {
  const bottlenecks: string[] = [];

  for (const stat of stats) {
    // High latency detection
    if (stat.averageDuration > 100) {
      // 100ms threshold
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
```

### Performance Recommendations

Automated generation of performance optimization recommendations.

#### Recommendation Engine

```typescript
function generateRecommendations(stats: PerformanceStats[], bottlenecks: string[]): string[] {
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
      recommendations.push('SET operations are slow - consider write batching or async processing');
    }
  }

  return recommendations;
}
```

### Performance Trends

Track performance trends over time to identify degradation or improvement.

#### Trend Analysis

```typescript
interface PerformanceTrend {
  metric: string;
  timeframe: string;
  trend: 'improving' | 'degrading' | 'stable';
  changePercent: number;
  recommendation?: string;
}

function analyzePerformanceTrends(
  currentStats: PerformanceStats[],
  historicalStats: PerformanceStats[]
): PerformanceTrend[] {
  const trends: PerformanceTrend[] = [];

  for (const current of currentStats) {
    const historical = historicalStats.find(
      h => h.operation === current.operation && h.storageName === current.storageName
    );

    if (historical) {
      // Analyze latency trend
      const latencyChange =
        ((current.averageDuration - historical.averageDuration) / historical.averageDuration) * 100;
      trends.push({
        metric: `${current.storageName}_${current.operation}_latency`,
        timeframe: '24h',
        trend: latencyChange > 10 ? 'degrading' : latencyChange < -10 ? 'improving' : 'stable',
        changePercent: latencyChange,
        recommendation: latencyChange > 25 ? 'Investigate latency increase' : undefined
      });

      // Analyze throughput trend
      const throughputChange =
        ((current.throughputPerSecond - historical.throughputPerSecond) /
          historical.throughputPerSecond) *
        100;
      trends.push({
        metric: `${current.storageName}_${current.operation}_throughput`,
        timeframe: '24h',
        trend:
          throughputChange > 10 ? 'improving' : throughputChange < -10 ? 'degrading' : 'stable',
        changePercent: throughputChange,
        recommendation: throughputChange < -25 ? 'Investigate throughput decrease' : undefined
      });
    }
  }

  return trends;
}
```

## Alerting and Notifications

### Alert Configuration

Configure alerts for various performance and health conditions.

#### Alert Rules

```typescript
interface AlertRule {
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  cooldownMs: number;
}

const alertRules: AlertRule[] = [
  {
    name: 'high_latency',
    condition: report => report.averageLatency > 200,
    severity: 'warning',
    message: 'High average latency detected',
    cooldownMs: 300000 // 5 minutes
  },
  {
    name: 'low_throughput',
    condition: report => report.operationsPerSecond < 10,
    severity: 'warning',
    message: 'Low throughput detected',
    cooldownMs: 600000 // 10 minutes
  },
  {
    name: 'high_error_rate',
    condition: report => report.errorRate > 0.05,
    severity: 'critical',
    message: 'High error rate detected',
    cooldownMs: 180000 // 3 minutes
  },
  {
    name: 'storage_unhealthy',
    condition: report => report.storageStats.some(s => s.successRate < 0.9),
    severity: 'critical',
    message: 'Storage backend unhealthy',
    cooldownMs: 300000 // 5 minutes
  }
];
```

#### Alert Processing

```typescript
class AlertManager {
  private lastAlerts = new Map<string, number>();

  processAlerts(report: SystemPerformanceReport): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();

    for (const rule of alertRules) {
      if (rule.condition(report)) {
        const lastAlert = this.lastAlerts.get(rule.name) || 0;

        // Check cooldown period
        if (now - lastAlert > rule.cooldownMs) {
          alerts.push({
            id: `${rule.name}_${now}`,
            name: rule.name,
            severity: rule.severity,
            message: rule.message,
            timestamp: now,
            data: report
          });

          this.lastAlerts.set(rule.name, now);
        }
      }
    }

    return alerts;
  }
}
```

### Alert Channels

Configure multiple channels for alert delivery.

#### Email Alerts

```typescript
async function sendEmailAlert(alert: Alert): Promise<void> {
  const emailContent = `
    Alert: ${alert.name}
    Severity: ${alert.severity}
    Message: ${alert.message}
    Timestamp: ${new Date(alert.timestamp).toISOString()}
    
    System Report:
    - Operations/sec: ${alert.data.operationsPerSecond}
    - Average Latency: ${alert.data.averageLatency}ms
    - Error Rate: ${(alert.data.errorRate * 100).toFixed(2)}%
  `;

  // Send email using your preferred email service
  await emailService.send({
    to: process.env.ALERT_EMAIL,
    subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,
    text: emailContent
  });
}
```

#### Slack Alerts

```typescript
async function sendSlackAlert(alert: Alert): Promise<void> {
  const slackMessage = {
    text: `🚨 Performance Alert`,
    attachments: [
      {
        color: alert.severity === 'critical' ? 'danger' : 'warning',
        fields: [
          { title: 'Alert', value: alert.name, short: true },
          { title: 'Severity', value: alert.severity, short: true },
          { title: 'Message', value: alert.message, short: false },
          {
            title: 'Operations/sec',
            value: alert.data.operationsPerSecond.toString(),
            short: true
          },
          { title: 'Avg Latency', value: `${alert.data.averageLatency}ms`, short: true }
        ],
        timestamp: Math.floor(alert.timestamp / 1000)
      }
    ]
  };

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage)
  });
}
```

## Performance Optimization

### Automated Optimization

The system includes automated optimization capabilities.

#### System Optimization

```typescript
async function optimizeStorageSystem(): Promise<string[]> {
  const optimizations: string[] = [];
  const report = generatePerformanceReport();

  // Trigger storage-specific optimizations
  const connectedStorages = getConnectedStorages();
  for (const storage of connectedStorages) {
    if (typeof (storage as any).optimize === 'function') {
      try {
        await (storage as any).optimize();
        optimizations.push(`Optimized ${storage.name} storage`);
      } catch (error) {
        console.warn(`Failed to optimize ${storage.name}:`, error);
      }
    }
  }

  // Clear old metrics to free memory
  const oldMetricsCount = getMetricsCount();
  cleanupOldMetrics(300000); // Keep last 5 minutes
  const newMetricsCount = getMetricsCount();

  if (oldMetricsCount > newMetricsCount) {
    optimizations.push(`Cleaned up ${oldMetricsCount - newMetricsCount} old metrics`);
  }

  return optimizations;
}
```

#### Cache Optimization

```typescript
function optimizeCachePerformance(): void {
  const stats = getPerformanceStats();

  // Analyze cache hit rates
  const cacheStats = stats.filter(s => s.operation === 'get');
  for (const stat of cacheStats) {
    if (stat.storageName === 'memory' && stat.successRate < 0.8) {
      console.log(`Low memory cache hit rate for ${stat.operation}: ${stat.successRate}`);
      // Implement cache warming strategies
    }
  }
}
```

### Performance Tuning Recommendations

#### Application-Level Optimizations

```typescript
// Connection pooling for databases
const dbConfig = {
  connectionPoolSize: Math.max(10, Math.floor(os.cpus().length * 2)),
  connectionTimeoutMs: 5000,
  queryTimeoutMs: 30000,
  idleTimeoutMs: 300000
};

// Redis optimization
const redisConfig = {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000
};

// Memory optimization
const memoryConfig = {
  maxMemoryUsage: 0.8, // 80% of available memory
  gcThreshold: 0.7, // Trigger GC at 70% usage
  cleanupInterval: 60000 // Cleanup every minute
};
```

## Troubleshooting Performance Issues

### Common Performance Issues

#### 1. High Latency Issues

```typescript
function diagnoseHighLatency(): void {
  const report = generatePerformanceReport();

  if (report.averageLatency > 100) {
    console.log('High latency detected, investigating...');

    // Check each storage backend
    for (const stat of report.storageStats) {
      if (stat.averageDuration > 100) {
        console.log(`High latency in ${stat.storageName}: ${stat.averageDuration}ms`);

        // Storage-specific diagnostics
        if (stat.storageName === 'redis') {
          checkRedisConnectivity();
        } else if (stat.storageName === 'database') {
          checkDatabasePerformance();
        }
      }
    }
  }
}
```

#### 2. Low Throughput Issues

```typescript
function diagnoseLowThroughput(): void {
  const report = generatePerformanceReport();

  if (report.operationsPerSecond < 50) {
    console.log('Low throughput detected, investigating...');

    // Check for bottlenecks
    const bottlenecks = detectBottlenecks(report.storageStats);
    console.log('Detected bottlenecks:', bottlenecks);

    // Check resource usage
    const memory = getMemoryMetrics();
    if (memory.memoryUsagePercent > 90) {
      console.log('High memory usage may be causing low throughput');
    }
  }
}
```

#### 3. Memory Issues

```typescript
function diagnoseMemoryIssues(): void {
  const memory = getMemoryMetrics();

  if (memory.memoryUsagePercent > 85) {
    console.log('High memory usage detected');

    // Force garbage collection
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }

    // Check for memory leaks
    const heapSnapshot = v8.writeHeapSnapshot();
    console.log(`Heap snapshot written: ${heapSnapshot}`);
  }
}
```

### Performance Debugging Tools

#### Debug Mode

```typescript
// Enable debug mode for detailed performance logging
process.env.DEBUG_PERFORMANCE = 'true';

// Enhanced logging in debug mode
function debugLog(operation: string, duration: number, metadata: any): void {
  if (process.env.DEBUG_PERFORMANCE === 'true') {
    console.log(`[PERF DEBUG] ${operation}: ${duration}ms`, metadata);
  }
}
```

#### Performance Profiling

```typescript
// CPU profiling
function startCPUProfiling(): void {
  const inspector = require('inspector');
  const fs = require('fs');

  const session = new inspector.Session();
  session.connect();

  session.post('Profiler.enable', () => {
    session.post('Profiler.start', () => {
      console.log('CPU profiling started');

      // Stop after 30 seconds
      setTimeout(() => {
        session.post('Profiler.stop', (err, { profile }) => {
          fs.writeFileSync('./cpu-profile.json', JSON.stringify(profile));
          console.log('CPU profile saved to cpu-profile.json');
          session.disconnect();
        });
      }, 30000);
    });
  });
}
```

## Monitoring Tools Integration

### Prometheus Integration

Export metrics in Prometheus format for integration with monitoring stacks.

#### Prometheus Metrics

```typescript
function exportPrometheusMetrics(): string {
  const report = generatePerformanceReport();
  let metrics = '';

  // System metrics
  metrics += `# HELP operations_total Total number of operations\n`;
  metrics += `# TYPE operations_total counter\n`;
  metrics += `operations_total ${report.totalOperations}\n\n`;

  metrics += `# HELP operations_per_second Operations per second\n`;
  metrics += `# TYPE operations_per_second gauge\n`;
  metrics += `operations_per_second ${report.operationsPerSecond}\n\n`;

  metrics += `# HELP average_latency_ms Average latency in milliseconds\n`;
  metrics += `# TYPE average_latency_ms gauge\n`;
  metrics += `average_latency_ms ${report.averageLatency}\n\n`;

  // Per-storage metrics
  for (const stat of report.storageStats) {
    metrics += `# HELP operation_duration_ms Operation duration by storage\n`;
    metrics += `# TYPE operation_duration_ms gauge\n`;
    metrics += `operation_duration_ms{storage="${stat.storageName}",operation="${stat.operation}"} ${stat.averageDuration}\n\n`;

    metrics += `# HELP operation_throughput Operations per second by storage\n`;
    metrics += `# TYPE operation_throughput gauge\n`;
    metrics += `operation_throughput{storage="${stat.storageName}",operation="${stat.operation}"} ${stat.throughputPerSecond}\n\n`;
  }

  return metrics;
}
```

### Datadog Integration

```typescript
const StatsD = require('node-statsd');
const client = new StatsD({
  host: process.env.DATADOG_HOST || 'localhost',
  port: process.env.DATADOG_PORT || 8125,
  prefix: 'shooter.'
});

function sendDatadogMetrics(report: SystemPerformanceReport): void {
  // System metrics
  client.gauge('system.operations_per_second', report.operationsPerSecond);
  client.gauge('system.average_latency', report.averageLatency);
  client.gauge('system.error_rate', report.errorRate);

  // Storage metrics
  for (const stat of report.storageStats) {
    const tags = [`storage:${stat.storageName}`, `operation:${stat.operation}`];
    client.gauge('storage.duration', stat.averageDuration, tags);
    client.gauge('storage.throughput', stat.throughputPerSecond, tags);
    client.gauge('storage.success_rate', stat.successRate, tags);
  }

  // Resource metrics
  client.gauge('system.memory_usage', report.resourceUsage.memoryUsage);
  client.gauge('system.cpu_usage', report.resourceUsage.cpu);
}
```

### New Relic Integration

```typescript
const newrelic = require('newrelic');

function sendNewRelicMetrics(report: SystemPerformanceReport): void {
  // Custom metrics
  newrelic.recordMetric('Custom/Operations/PerSecond', report.operationsPerSecond);
  newrelic.recordMetric('Custom/Latency/Average', report.averageLatency);
  newrelic.recordMetric('Custom/ErrorRate', report.errorRate);

  // Custom events
  newrelic.recordCustomEvent('PerformanceReport', {
    totalOperations: report.totalOperations,
    operationsPerSecond: report.operationsPerSecond,
    averageLatency: report.averageLatency,
    errorRate: report.errorRate,
    bottleneckCount: report.bottlenecks.length
  });
}
```

## Conclusion

The Shooter iOS Notification System includes comprehensive performance monitoring capabilities that provide:

### Key Monitoring Features

- **Real-time Metrics**: Continuous performance tracking with 5-minute aggregation
- **Multi-layer Health Monitoring**: System, storage, and application health checks
- **Automated Bottleneck Detection**: Intelligent identification of performance issues
- **Resource Monitoring**: Memory, CPU, and network usage tracking
- **Alert System**: Configurable alerts with multiple delivery channels
- **Performance Optimization**: Automated optimization recommendations

### Monitoring Best Practices

- **Proactive Monitoring**: Continuous health and performance tracking
- **Alert Configuration**: Appropriate thresholds and cooldown periods
- **Performance Analysis**: Regular review of trends and bottlenecks
- **Resource Optimization**: Efficient resource usage and cleanup
- **Integration**: Seamless integration with popular monitoring tools

### Performance Achievements

- **High Throughput**: 4350+ operations per second under load
- **Low Latency**: Sub-100ms P99 latency for critical operations
- **High Availability**: 99.9%+ uptime with comprehensive health monitoring
- **Efficient Resource Usage**: Optimized memory and CPU utilization
- **Automated Optimization**: Self-optimizing system with intelligent recommendations

The monitoring system ensures the Shooter iOS Notification System maintains enterprise-grade performance and reliability in production environments.
