// System Monitoring and Alerting
// Comprehensive monitoring, alerting, and observability for storage system

import type {  } from './types.js';
import { getConnectedStorages } from './registry.js';
import { logInfo, logWarn, logError } from './logging.js';
import { generatePerformanceReport, type SystemPerformanceReport } from './metrics.js';
import { checkAllStorages, type SystemHealthReport, type StorageHealthStatus } from './health.js';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert types
 */
export type AlertType =
  | 'high_latency'
  | 'high_error_rate'
  | 'storage_down'
  | 'memory_usage'
  | 'disk_usage'
  | 'connection_failure'
  | 'performance_degradation'
  | 'security_breach'
  | 'system_overload';

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: number;
  source: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

/**
 * Monitoring threshold configuration
 */
export interface MonitoringThresholds {
  // Latency thresholds (ms)
  latencyWarning: number;
  latencyCritical: number;

  // Error rate thresholds (percentage)
  errorRateWarning: number;
  errorRateCritical: number;

  // Memory usage thresholds (percentage)
  memoryWarning: number;
  memoryCritical: number;

  // Storage response time thresholds (ms)
  storageResponseWarning: number;
  storageResponseCritical: number;

  // Throughput thresholds (ops/sec)
  throughputWarning: number;
  throughputCritical: number;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enabled: boolean;
  checkInterval: number; // milliseconds
  alertCooldown: number; // milliseconds
  maxAlerts: number;
  thresholds: MonitoringThresholds;
  enableEmailAlerts: boolean;
  enableSlackAlerts: boolean;
  enablePagerDutyAlerts: boolean;
  emailRecipients: string[];
  slackWebhookUrl?: string;
  pagerDutyKey?: string;
}

const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  enabled: true,
  checkInterval: 30000, // 30 seconds
  alertCooldown: 300000, // 5 minutes
  maxAlerts: 1000,
  thresholds: {
    latencyWarning: 100,
    latencyCritical: 500,
    errorRateWarning: 5,
    errorRateCritical: 10,
    memoryWarning: 70,
    memoryCritical: 90,
    storageResponseWarning: 200,
    storageResponseCritical: 1000,
    throughputWarning: 10,
    throughputCritical: 5
  },
  enableEmailAlerts: false,
  enableSlackAlerts: false,
  enablePagerDutyAlerts: false,
  emailRecipients: []
};

/**
 * Webhook notification payload
 */
export interface WebhookPayload {
  alert: Alert;
  system: {
    name: string;
    environment: string;
    timestamp: number;
  };
  context: Record<string, unknown>;
}

class SystemMonitor {
  private config: MonitoringConfig;
  private alerts: Alert[] = [];
  private alertCooldowns = new Map<string, number>();
  private monitoringTimer?: NodeJS.Timeout;
  private startTime: number;
  private lastAlertId = 0;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_MONITORING_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Start monitoring system
   */
  start(): void {
    if (!this.config.enabled) {
      logInfo('monitoring', 'System monitoring is disabled');
      return;
    }

    logInfo('monitoring', 'Starting system monitoring', {
      checkInterval: this.config.checkInterval,
      thresholds: JSON.stringify(this.config.thresholds)
    });

    this.monitoringTimer = setInterval(() => {
      this.performMonitoringCheck().catch(error => {
        logError(error, 'monitoring', 'monitoring_check');
      });
    }, this.config.checkInterval);

    // Perform initial check
    this.performMonitoringCheck().catch(error => {
      logError(error, 'monitoring', 'initial_monitoring_check');
    });
  }

  /**
   * Stop monitoring system
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      delete this.monitoringTimer;
      logInfo('monitoring', 'System monitoring stopped');
    }
  }

  /**
   * Perform comprehensive monitoring check
   */
  private async performMonitoringCheck(): Promise<void> {
    try {
      // Get system health and performance data
      const [healthReport, performanceReport] = await Promise.all([
        checkAllStorages(),
        generatePerformanceReport()
      ]);

      // Check storage health
      for (const storage of healthReport.storages) {
        await this.checkStorageHealth(storage);
      }

      // Check system performance
      await this.checkSystemPerformance(performanceReport);

      // Check resource usage
      await this.checkResourceUsage(performanceReport.resourceUsage);

      // Check overall system status
      await this.checkSystemStatus(healthReport);

      // Cleanup old alerts
      this.cleanupOldAlerts();
    } catch (error) {
      logError(error as Error, 'monitoring', 'monitoring_check');
    }
  }

  /**
   * Check individual storage health
   */
  private async checkStorageHealth(storage: StorageHealthStatus): Promise<void> {
    const storageName = storage.name;

    // Check if storage is responding
    if (!storage.responding && storage.connected) {
      await this.createAlert('storage_down', 'critical', {
        title: `Storage ${storageName} Not Responding`,
        message: `Storage backend ${storageName} is connected but not responding to health checks`,
        source: storageName,
        metadata: {
          storage: storageName,
          lastCheck: storage.lastCheck,
          details: JSON.stringify(storage.details)
        }
      });
    }

    // Check latency
    if (storage.latency) {
      if (storage.latency > this.config.thresholds.latencyCritical) {
        await this.createAlert('high_latency', 'critical', {
          title: `Critical Latency in ${storageName}`,
          message: `Storage ${storageName} latency is ${storage.latency}ms (critical threshold: ${this.config.thresholds.latencyCritical}ms)`,
          source: storageName,
          metadata: {
            storage: storageName,
            latency: storage.latency,
            threshold: this.config.thresholds.latencyCritical
          }
        });
      } else if (storage.latency > this.config.thresholds.latencyWarning) {
        await this.createAlert('high_latency', 'warning', {
          title: `High Latency in ${storageName}`,
          message: `Storage ${storageName} latency is ${storage.latency}ms (warning threshold: ${this.config.thresholds.latencyWarning}ms)`,
          source: storageName,
          metadata: {
            storage: storageName,
            latency: storage.latency,
            threshold: this.config.thresholds.latencyWarning
          }
        });
      }
    }

    // Check error rate
    if (storage.errorRate > this.config.thresholds.errorRateCritical) {
      await this.createAlert('high_error_rate', 'critical', {
        title: `Critical Error Rate in ${storageName}`,
        message: `Storage ${storageName} error rate is ${(storage.errorRate * 100).toFixed(1)}% (critical threshold: ${this.config.thresholds.errorRateCritical}%)`,
        source: storageName,
        metadata: {
          storage: storageName,
          errorRate: storage.errorRate,
          errorCount: storage.errorCount,
          threshold: this.config.thresholds.errorRateCritical
        }
      });
    } else if (storage.errorRate > this.config.thresholds.errorRateWarning) {
      await this.createAlert('high_error_rate', 'warning', {
        title: `High Error Rate in ${storageName}`,
        message: `Storage ${storageName} error rate is ${(storage.errorRate * 100).toFixed(1)}% (warning threshold: ${this.config.thresholds.errorRateWarning}%)`,
        source: storageName,
        metadata: {
          storage: storageName,
          errorRate: storage.errorRate,
          errorCount: storage.errorCount,
          threshold: this.config.thresholds.errorRateWarning
        }
      });
    }
  }

  /**
   * Check system performance metrics
   */
  private async checkSystemPerformance(report: SystemPerformanceReport): Promise<void> {
    // Check overall error rate
    if (report.errorRate > this.config.thresholds.errorRateCritical / 100) {
      await this.createAlert('high_error_rate', 'critical', {
        title: 'Critical System Error Rate',
        message: `System error rate is ${(report.errorRate * 100).toFixed(1)}%`,
        source: 'system',
        metadata: {
          errorRate: report.errorRate,
          totalOperations: report.totalOperations,
          threshold: this.config.thresholds.errorRateCritical
        }
      });
    }

    // Check average latency
    if (report.averageLatency > this.config.thresholds.latencyCritical) {
      await this.createAlert('performance_degradation', 'critical', {
        title: 'Critical System Latency',
        message: `System average latency is ${report.averageLatency.toFixed(1)}ms`,
        source: 'system',
        metadata: {
          averageLatency: report.averageLatency,
          operationsPerSecond: report.operationsPerSecond,
          threshold: this.config.thresholds.latencyCritical
        }
      });
    }

    // Check throughput
    if (report.operationsPerSecond < this.config.thresholds.throughputCritical) {
      await this.createAlert('performance_degradation', 'critical', {
        title: 'Low System Throughput',
        message: `System throughput is ${report.operationsPerSecond.toFixed(1)} ops/sec`,
        source: 'system',
        metadata: {
          operationsPerSecond: report.operationsPerSecond,
          threshold: this.config.thresholds.throughputCritical
        }
      });
    }
  }

  /**
   * Check resource usage
   */
  private async checkResourceUsage(resourceUsage: SystemPerformanceReport['resourceUsage']): Promise<void> {
    // Check memory usage
    const memoryUsagePercent = resourceUsage.memoryUsage * 100;
    if (memoryUsagePercent > this.config.thresholds.memoryCritical) {
      await this.createAlert('memory_usage', 'critical', {
        title: 'Critical Memory Usage',
        message: `Memory usage is ${memoryUsagePercent.toFixed(1)}%`,
        source: 'system',
        metadata: {
          memoryUsage: memoryUsagePercent,
          heapUsed: resourceUsage.heapUsed,
          heapTotal: resourceUsage.heapTotal,
          threshold: this.config.thresholds.memoryCritical
        }
      });
    } else if (memoryUsagePercent > this.config.thresholds.memoryWarning) {
      await this.createAlert('memory_usage', 'warning', {
        title: 'High Memory Usage',
        message: `Memory usage is ${memoryUsagePercent.toFixed(1)}%`,
        source: 'system',
        metadata: {
          memoryUsage: memoryUsagePercent,
          heapUsed: resourceUsage.heapUsed,
          heapTotal: resourceUsage.heapTotal,
          threshold: this.config.thresholds.memoryWarning
        }
      });
    }
  }

  /**
   * Check overall system status
   */
  private async checkSystemStatus(healthReport: SystemHealthReport): Promise<void> {
    if (healthReport.status === 'unhealthy') {
      await this.createAlert('system_overload', 'critical', {
        title: 'System Unhealthy',
        message: 'System health check indicates unhealthy status',
        source: 'system',
        metadata: {
          status: healthReport.status,
          summary: JSON.stringify(healthReport.summary),
          recommendations: healthReport.recommendations.join(', ')
        }
      });
    } else if (healthReport.status === 'degraded') {
      await this.createAlert('performance_degradation', 'warning', {
        title: 'System Performance Degraded',
        message: 'System health check indicates degraded performance',
        source: 'system',
        metadata: {
          status: healthReport.status,
          summary: JSON.stringify(healthReport.summary),
          recommendations: healthReport.recommendations.join(', ')
        }
      });
    }
  }

  /**
   * Create and dispatch alert
   */
  private async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    alertData: {
      title: string;
      message: string;
      source: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    const alertKey = `${type}:${alertData.source}`;
    const now = Date.now();

    // Check cooldown
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (lastAlert && now - lastAlert < this.config.alertCooldown) {
      return; // Still in cooldown
    }

    // Create alert
    const alert: Alert = {
      id: `alert_${++this.lastAlertId}_${now}`,
      type,
      severity,
      title: alertData.title,
      message: alertData.message,
      timestamp: now,
      source: alertData.source,
      metadata: alertData.metadata,
      resolved: false
    };

    // Add to alerts list
    this.alerts.push(alert);
    this.alertCooldowns.set(alertKey, now);

    // Log alert
    const logLevel = severity === 'critical' ? 'error' : 'warn';
    if (logLevel === 'error') {
      logError(new Error(alert.message), 'monitoring', 'alert', alert.source, {
        metadata: JSON.stringify(alert.metadata)
      });
    } else {
      logWarn('monitoring', alert.message, {
        metadata: JSON.stringify(alert.metadata)
      });
    }

    // Dispatch alert notifications
    await this.dispatchAlert(alert);

    // Cleanup old alerts
    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts = this.alerts.slice(-this.config.maxAlerts);
    }
  }

  /**
   * Dispatch alert to configured notification channels
   */
  private async dispatchAlert(alert: Alert): Promise<void> {
    const payload: WebhookPayload = {
      alert,
      system: {
        name: 'SHOOTER',
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: Date.now()
      },
      context: {
        uptime: Date.now() - this.startTime,
        connectedStorages: getConnectedStorages().map(s => s.name)
      }
    };

    try {
      // Send to Slack
      if (this.config.enableSlackAlerts && this.config.slackWebhookUrl) {
        await this.sendSlackAlert(alert, payload);
      }

      // Send to PagerDuty
      if (
        this.config.enablePagerDutyAlerts &&
        this.config.pagerDutyKey &&
        alert.severity === 'critical'
      ) {
        await this.sendPagerDutyAlert(alert, payload);
      }

      // Send email notifications
      if (this.config.enableEmailAlerts && this.config.emailRecipients.length > 0) {
        await this.sendEmailAlert(alert, payload);
      }
    } catch (error) {
      logError(error as Error, 'monitoring', 'alert_dispatch', undefined, { alertId: alert.id });
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackAlert(alert: Alert, _payload: WebhookPayload): Promise<void> {
    if (!this.config.slackWebhookUrl) {
return;
}

    const color =
      alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good';
    const slackPayload = {
      text: `🚨 ${alert.title}`,
      attachments: [
        {
          color,
          fields: [
            { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
            { title: 'Source', value: alert.source, short: true },
            { title: 'Message', value: alert.message, short: false },
            { title: 'Time', value: new Date(alert.timestamp).toISOString(), short: true }
          ]
        }
      ]
    };

    try {
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }

      logInfo('monitoring', 'Slack alert sent successfully', { alertId: alert.id });
    } catch (error) {
      logError(error as Error, 'monitoring', 'slack_alert', undefined, { alertId: alert.id });
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(alert: Alert, payload: WebhookPayload): Promise<void> {
    if (!this.config.pagerDutyKey) {
return;
}

    const pagerDutyPayload = {
      routing_key: this.config.pagerDutyKey,
      event_action: 'trigger',
      dedup_key: `shooter_${alert.type}_${alert.source}`,
      payload: {
        summary: alert.title,
        source: alert.source,
        severity: alert.severity,
        component: 'SHOOTER',
        custom_details: {
          message: alert.message,
          metadata: alert.metadata,
          system: payload.system
        }
      }
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagerDutyPayload)
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API failed: ${response.status}`);
      }

      logInfo('monitoring', 'PagerDuty alert sent successfully', { alertId: alert.id });
    } catch (error) {
      logError(error as Error, 'monitoring', 'pagerduty_alert', undefined, { alertId: alert.id });
    }
  }

  /**
   * Send email alert (placeholder - would use actual email service)
   */
  private async sendEmailAlert(alert: Alert, _payload: WebhookPayload): Promise<void> {
    // This is a placeholder - in production, integrate with actual email service
    logInfo('monitoring', 'Email alert would be sent', {
      alertId: alert.id,
      recipients: this.config.emailRecipients.join(', '),
      subject: alert.title
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolvedBy?: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();
    if (resolvedBy) {
      alert.acknowledgedBy = resolvedBy;
      alert.acknowledgedAt = Date.now();
    }

    logInfo('monitoring', `Alert resolved: ${alert.title}`, {
      alertId,
      resolvedBy,
      duration: alert.resolvedAt - alert.timestamp
    });

    return true;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    logInfo('monitoring', `Alert acknowledged: ${alert.title}`, {
      alertId,
      acknowledgedBy
    });

    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Get all alerts with optional filtering
   */
  getAllAlerts(filters?: {
    severity?: AlertSeverity;
    type?: AlertType;
    source?: string;
    resolved?: boolean;
    since?: number;
    limit?: number;
  }): Alert[] {
    let filtered = [...this.alerts];

    if (filters) {
      if (filters.severity) {
        filtered = filtered.filter(a => a.severity === filters.severity);
      }
      if (filters.type) {
        filtered = filtered.filter(a => a.type === filters.type);
      }
      if (filters.source) {
        filtered = filtered.filter(a => a.source === filters.source);
      }
      if (filters.resolved !== undefined) {
        filtered = filtered.filter(a => a.resolved === filters.resolved);
      }
      if (filters.since) {
        const since = filters.since;
        filtered = filtered.filter(a => a.timestamp >= since);
      }
      if (filters.limit) {
        filtered = filtered.slice(-filters.limit);
      }
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    totalAlerts: number;
    activeAlerts: number;
    alertsByType: Record<AlertType, number>;
    alertsBySeverity: Record<AlertSeverity, number>;
    alertsBySource: Record<string, number>;
    avgResolutionTime: number;
    uptime: number;
  } {
    const totalAlerts = this.alerts.length;
    const activeAlerts = this.getActiveAlerts().length;

    const alertsByType = {} as Record<AlertType, number>;
    const alertsBySeverity = {} as Record<AlertSeverity, number>;
    const alertsBySource = {} as Record<string, number>;

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const alert of this.alerts) {
      // Count by type
      alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;

      // Count by severity
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;

      // Count by source
      alertsBySource[alert.source] = (alertsBySource[alert.source] || 0) + 1;

      // Calculate resolution time
      if (alert.resolved && alert.resolvedAt) {
        totalResolutionTime += alert.resolvedAt - alert.timestamp;
        resolvedCount++;
      }
    }

    return {
      totalAlerts,
      activeAlerts,
      alertsByType,
      alertsBySeverity,
      alertsBySource,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Configure monitoring settings
   */
  configure(config: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed
    if (config.checkInterval && this.monitoringTimer) {
      this.stop();
      this.start();
    }
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const beforeCount = this.alerts.length;

    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff || !alert.resolved);

    const afterCount = this.alerts.length;
    if (beforeCount > afterCount) {
      logInfo('monitoring', `Cleaned up ${beforeCount - afterCount} old alerts`);
    }
  }

  /**
   * Reset monitoring state
   */
  reset(): void {
    this.alerts = [];
    this.alertCooldowns.clear();
    this.lastAlertId = 0;
    this.startTime = Date.now();
    logInfo('monitoring', 'Monitoring state reset');
  }
}

// Global monitor instance
const systemMonitor = new SystemMonitor();

// Export monitoring functions
export function startMonitoring(config?: Partial<MonitoringConfig>): void {
  if (config) {
    systemMonitor.configure(config);
  }
  systemMonitor.start();
}

export function stopMonitoring(): void {
  systemMonitor.stop();
}

export function getActiveAlerts(): Alert[] {
  return systemMonitor.getActiveAlerts();
}

export function getAllAlerts(filters?: Parameters<SystemMonitor['getAllAlerts']>[0]): Alert[] {
  return systemMonitor.getAllAlerts(filters);
}

export function resolveAlert(alertId: string, resolvedBy?: string): boolean {
  return systemMonitor.resolveAlert(alertId, resolvedBy);
}

export function acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
  return systemMonitor.acknowledgeAlert(alertId, acknowledgedBy);
}

export function getMonitoringStats(): ReturnType<SystemMonitor['getMonitoringStats']> {
  return systemMonitor.getMonitoringStats();
}

export function configureMonitoring(config: Partial<MonitoringConfig>): void {
  systemMonitor.configure(config);
}

export function resetMonitoring(): void {
  systemMonitor.reset();
}

// Export constants
export { DEFAULT_MONITORING_CONFIG };

// Export the monitor instance for advanced usage
export { systemMonitor as SystemMonitor };
