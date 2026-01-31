<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  interface SystemAlert {
    id: string;
    type: string;
    message: string;
    timestamp: string;
    resolved: boolean;
  }

  interface SystemLog {
    timestamp: string;
    level: string;
    message: string;
    component: string;
  }

  let metrics = {
    memory: {
      used: 0,
      total: 0,
      percentage: 0
    },
    cpu: {
      usage: 0,
      loadAverage: [0, 0, 0]
    },
    disk: {
      used: 0,
      total: 0,
      percentage: 0
    },
    network: {
      requests: 0,
      responseTime: 0
    }
  };

  let healthChecks = {
    database: 'unknown',
    apns: 'unknown',
    notifications: 'unknown',
    webhooks: 'unknown'
  };

  let recentAlerts: SystemAlert[] = [];
  let systemLogs: SystemLog[] = [];
  let metricsInterval: ReturnType<typeof setInterval> | undefined;

  async function loadMetrics() {
    try {
      const response = await fetch('/system-monitoring/metrics');
      if (response.ok) {
        const data = await response.json();
        metrics = { ...metrics, ...data };
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  }

  async function loadHealthChecks() {
    try {
      const response = await fetch('/system-monitoring/health');
      if (response.ok) {
        const health = await response.json();
        healthChecks = {
          database: health.database || 'unknown',
          apns: health.apns || 'unknown',
          notifications: health.notifications || 'unknown',
          webhooks: health.webhooks || 'unknown'
        };
      }
    } catch (error) {
      console.error('Failed to load health checks:', error);
    }
  }

  async function loadRecentAlerts() {
    // Mock alerts data
    recentAlerts = [
      {
        id: '1',
        type: 'warning',
        message: 'High memory usage detected',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        resolved: false
      },
      {
        id: '2',
        type: 'info',
        message: 'System health check completed',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        resolved: true
      }
    ];
  }

  async function loadSystemLogs() {
    // Mock system logs
    systemLogs = [
      {
        timestamp: new Date(Date.now() - 300000).toISOString(),
        level: 'info',
        message: 'Notification sent successfully',
        component: 'notifications'
      },
      {
        timestamp: new Date(Date.now() - 600000).toISOString(),
        level: 'error',
        message: 'APNs connection timeout',
        component: 'apns'
      },
      {
        timestamp: new Date(Date.now() - 900000).toISOString(),
        level: 'info',
        message: 'Health check passed',
        component: 'system'
      }
    ];
  }

  function getHealthIcon(status: string): string {
    switch (status) {
      case 'healthy': case 'ok': return '🟢';
      case 'warning': return '🟡';
      case 'error': case 'failed': return '🔴';
      default: return '⚪';
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) {
return '0 B';
}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  const healthItems: Array<{ key: keyof typeof healthChecks; label: string }> = [
    { key: 'database', label: 'Database' },
    { key: 'apns', label: 'APNs' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'webhooks', label: 'Webhooks' }
  ];

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'healthy':
      case 'ok':
        return 'global-badge-base global-badge-success';
      case 'warning':
        return 'global-badge-base global-badge-warning';
      case 'error':
      case 'failed':
        return 'global-badge-base global-badge-error';
      case 'info':
        return 'global-badge-base global-badge-info';
      default:
        return 'global-badge-base';
    }
  }

  function getAlertBadgeClass(type: string): string {
    switch (type) {
      case 'warning':
        return 'global-badge-base global-badge-warning';
      case 'error':
        return 'global-badge-base global-badge-error';
      case 'info':
        return 'global-badge-base global-badge-info';
      case 'success':
        return 'global-badge-base global-badge-success';
      default:
        return 'global-badge-base';
    }
  }

  function getAlertStateBadgeClass(resolved: boolean): string {
    return resolved ? 'global-badge-base global-badge-success' : 'global-badge-base global-badge-warning';
  }

  function getLogBadgeClass(level: string): string {
    switch (level) {
      case 'error':
        return 'global-badge-base global-badge-error';
      case 'warning':
        return 'global-badge-base global-badge-warning';
      case 'info':
      case 'debug':
        return 'global-badge-base global-badge-info';
      default:
        return 'global-badge-base';
    }
  }

  function formatStatusLabel(status: string): string {
    if (!status) {
return 'Unknown';
}
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function calculatePercentage(value: number, total: number): number {
    if (!total) {
return 0;
}
    return Math.min(100, Math.round((value / total) * 100));
  }

  function formatLoadAverage(values: number[]): string {
    return values.map(value => value.toFixed(2)).join(', ');
  }

  $: memoryUsagePercent = calculatePercentage(
    data.systemStatus.memoryUsage.heapUsed,
    data.systemStatus.memoryUsage.rss
  );

  $: cpuUsagePercent = Math.min(100, Math.round(metrics.cpu.usage ?? 0));

  $: loadAverageText = Array.isArray(metrics.cpu.loadAverage)
    ? formatLoadAverage(metrics.cpu.loadAverage as number[])
    : '';

  onMount(() => {
    loadMetrics();
    loadHealthChecks();
    loadRecentAlerts();
    loadSystemLogs();
    
    metricsInterval = setInterval(() => {
      loadMetrics();
      loadHealthChecks();
    }, 30000); // Update every 30 seconds
  });

  onDestroy(() => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
  });
</script>

<svelte:head>
  <title>System Monitoring - SHOOTER</title>
</svelte:head>

<div class="u-flex u-flex-col u-gap-xl">
  <section class="u-flex u-flex-col u-gap-md">
    <h2>System Metrics</h2>
    <div class="global-grid-status">
      <article class="global-card-base u-mb-0">
        <div class="global-card-content u-flex u-flex-col u-gap-sm">
          <div class="u-flex u-gap-sm u-items-center">
            <span>🧠</span>
            <h3 class="u-m-0">Memory Usage</h3>
          </div>
          <strong>{formatBytes(data.systemStatus.memoryUsage.heapUsed)}</strong>
          <meter max="100" value={memoryUsagePercent} class="u-w-full">{memoryUsagePercent}</meter>
          <small>{memoryUsagePercent}% of {formatBytes(data.systemStatus.memoryUsage.rss)}</small>
        </div>
      </article>

      <article class="global-card-base u-mb-0">
        <div class="global-card-content u-flex u-flex-col u-gap-sm">
          <div class="u-flex u-gap-sm u-items-center">
            <span>⚡</span>
            <h3 class="u-m-0">CPU Usage</h3>
          </div>
          <strong>{cpuUsagePercent}%</strong>
          <meter max="100" value={cpuUsagePercent} class="u-w-full">{cpuUsagePercent}</meter>
          <small>Load average: {loadAverageText}</small>
        </div>
      </article>

      <article class="global-card-base u-mb-0">
        <div class="global-card-content u-flex u-flex-col u-gap-sm">
          <div class="u-flex u-gap-sm u-items-center">
            <span>🌐</span>
            <h3 class="u-m-0">Network</h3>
          </div>
          <strong>{metrics.network.requests}</strong>
          <small>Average response: {metrics.network.responseTime}ms</small>
        </div>
      </article>

      <article class="global-card-base u-mb-0">
        <div class="global-card-content u-flex u-flex-col u-gap-sm">
          <div class="u-flex u-gap-sm u-items-center">
            <span>⏱️</span>
            <h3 class="u-m-0">Uptime</h3>
          </div>
          <strong>{Math.floor(data.systemStatus.uptime / 3600)}h</strong>
          <small>{Math.floor((data.systemStatus.uptime % 3600) / 60)} minutes running</small>
        </div>
      </article>
    </div>
  </section>

  <section class="global-card-base u-mb-0">
    <div class="global-card-header">
      <h2 class="u-m-0">🏥 Health Checks</h2>
    </div>
    <div class="global-card-content u-flex u-flex-col u-gap-sm">
      {#each healthItems as item (item.key)}
        <div class="u-flex u-justify-between u-items-center u-border u-rounded-md u-p-sm u-gap-sm">
          <span>{getHealthIcon(healthChecks[item.key])} {item.label}</span>
          <span class={getStatusBadgeClass(healthChecks[item.key])}>
            {formatStatusLabel(healthChecks[item.key])}
          </span>
        </div>
      {/each}
    </div>
  </section>

  <section class="global-card-base u-mb-0">
    <div class="global-card-header">
      <h2 class="u-m-0">🚨 Recent Alerts</h2>
    </div>
    <div class="global-card-content">
      {#if recentAlerts.length}
        <div class="u-flex u-flex-col u-gap-sm">
          {#each recentAlerts as alert (alert.id)}
            <div class="u-border u-rounded-md u-p-sm u-flex u-justify-between u-gap-sm u-items-start">
              <div class="u-flex u-flex-col u-gap-xxs">
                <span>{alert.message}</span>
                <small>{new Date(alert.timestamp).toLocaleTimeString()}</small>
              </div>
              <div class="u-flex u-gap-xs u-items-center">
                <span class={getAlertBadgeClass(alert.type)}>{formatStatusLabel(alert.type)}</span>
                <span class={getAlertStateBadgeClass(alert.resolved)}>
                  {alert.resolved ? 'Resolved' : 'Active'}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="u-text-center u-py-lg">
          <p>No recent alerts</p>
          <p>System is running smoothly! 🎉</p>
        </div>
      {/if}
    </div>
  </section>

  <section class="global-card-base u-mb-0">
    <div class="global-card-header">
      <h2 class="u-m-0">📋 Recent Logs</h2>
    </div>
    <div class="global-card-content">
      {#if systemLogs.length}
        <div class="u-flex u-flex-col u-gap-sm">
          {#each systemLogs as log, index (log.timestamp + String(index))}
            <div class="u-border u-rounded-md u-p-sm u-flex u-gap-md u-items-start">
              <span class={getLogBadgeClass(log.level)}>
                {formatStatusLabel(log.level)}
              </span>
              <div class="u-flex u-flex-col u-gap-xxs">
                <small>{new Date(log.timestamp).toLocaleTimeString()}</small>
                <span>[{log.component}] {log.message}</span>
              </div>
            </div>
          {/each}
        </div>
        <div class="u-mt-md">
          <a href="/system-monitoring/admin">View All Logs →</a>
        </div>
      {:else}
        <div class="u-text-center u-py-lg">
          <p>No recent logs</p>
        </div>
      {/if}
    </div>
  </section>

  <section class="global-card-base u-mb-0">
    <div class="global-card-header">
      <h2 class="u-m-0">⚡ Quick Actions</h2>
    </div>
    <div class="global-card-content">
      <div class="u-flex u-flex-wrap u-gap-sm">
        <a href="/system-monitoring/debug" class="global-button-base global-button-primary" role="button" data-sveltekit-preload-data>
          🐛 Debug Tools
        </a>
        <a href="/notifications/send" class="global-button-base global-button-secondary" role="button" data-sveltekit-preload-data>
          📱 Test Notification
        </a>
        <a href="/system-monitoring/health" class="global-button-base global-button-tertiary" role="button" data-sveltekit-preload-data>
          🔍 Full Health Check
        </a>
        <a href="/system-monitoring/admin" class="global-button-base global-button-tertiary" role="button" data-sveltekit-preload-data>
          ⚙️ Admin Panel
        </a>
      </div>
    </div>
  </section>
</div>
