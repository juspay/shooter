<script lang="ts">
   
  // alert and window are browser globals
  import { onMount } from 'svelte';

  interface ServiceInfo {
    status: string;
    pid?: number | string;
    memory?: number;
    cpu?: number;
  }

  interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
  }

  interface SystemInfo {
    uptime?: number;
    memoryUsage?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    cpuUsage?: number;
    loadAverage?: number;
    networkRequests?: number;
  }

  interface SystemStats {
    system?: SystemInfo;
    services?: Record<string, ServiceInfo>;
    recentLogs?: LogEntry[];
  }

  interface NotificationConfig {
    enabled?: boolean;
    rateLimit?: number;
  }

  interface WebhookConfig {
    enabled?: boolean;
    timeout?: number;
  }

  interface AnalyticsConfig {
    enabled?: boolean;
    retentionDays?: number;
  }

  interface SecurityConfig {
    rateLimiting?: boolean;
    authRequired?: boolean;
  }

  interface SystemConfig {
    notifications?: NotificationConfig;
    webhooks?: WebhookConfig;
    analytics?: AnalyticsConfig;
    security?: SecurityConfig;
  }

  let systemStats: SystemStats = {};
  let systemConfig: SystemConfig = {};
  let loading = true;
  let configEditing = false;
  let configChanges: SystemConfig = {};
  let result: string = '';
  let statusType: 'success' | 'error' | 'warning' | null = null;

  async function loadAdminData() {
    try {
      const [statsResponse, configResponse] = await Promise.all([
        fetch('/system-monitoring/stats'),
        fetch('/system-monitoring/config')
      ]);

      if (statsResponse.ok) {
        const statsResult = await statsResponse.json();
        systemStats = statsResult.data || statsResult;
      }

      if (configResponse.ok) {
        const configResult = await configResponse.json();
        systemConfig = configResult.data || configResult;
      }

      loading = false;
    } catch (error) {
      console.error('Failed to load admin data:', error);
      loading = false;
    }
  }

  async function saveConfiguration() {
    try {
      const response = await fetch('/system-monitoring/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configChanges)
      });

      if (response.ok) {
        systemConfig = { ...systemConfig, ...configChanges };
        configChanges = {};
        configEditing = false;
        alert('Configuration saved successfully');
      } else {
        alert('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration');
    }
  }

  async function restartService(serviceName: string) {
    try {
      const response = await fetch('/system-monitoring/services/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ service: serviceName })
      });

      if (response.ok) {
        alert(`${serviceName} service restarted successfully`);
        loadAdminData(); // Refresh stats
      } else {
        alert(`Failed to restart ${serviceName} service`);
      }
    } catch (error) {
      console.error(`Failed to restart ${serviceName}:`, error);
      alert(`Failed to restart ${serviceName} service`);
    }
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  function formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) {
return '0 Bytes';
}
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  function formatUptime(uptime: number): string {
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }

  function getUsageCardClass(value?: number): string {
    if (!Number.isFinite(value)) {
      return '';
    }
    if ((value as number) >= 90) {
      return 'global-card-error';
    }
    if ((value as number) >= 75) {
      return 'global-card-warning';
    }
    return '';
  }

  function getUsageBadgeClass(value?: number): string {
    if (!Number.isFinite(value)) {
      return 'global-badge-info';
    }
    if ((value as number) >= 90) {
      return 'global-badge-error';
    }
    if ((value as number) >= 75) {
      return 'global-badge-warning';
    }
    return 'global-badge-success';
  }

  function getServiceBadgeClass(status: string | undefined): string {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'running') {
      return 'global-badge-success';
    }
    if (normalized === 'stopped') {
      return 'global-badge-error';
    }
    return 'global-badge-warning';
  }

  function getLogRowClass(level: string | undefined): string {
    const normalized = (level || '').toLowerCase();
    if (normalized === 'error') {
      return 'log-entry--error';
    }
    if (normalized === 'warning') {
      return 'log-entry--warning';
    }
    if (normalized === 'info') {
      return 'log-entry--info';
    }
    return '';
  }

  function getLogBadgeClass(level: string | undefined): string {
    const normalized = (level || '').toLowerCase();
    if (normalized === 'error') {
      return 'global-badge-error';
    }
    if (normalized === 'warning') {
      return 'global-badge-warning';
    }
    return 'global-badge-info';
  }

  onMount(() => {
    loadAdminData();
  });
</script>

<svelte:head>
  <title>System Administration - SHOOTER</title>
</svelte:head>

<div class="admin-dashboard u-flex u-flex-col u-gap-xl">
  <header class="u-flex u-flex-col u-gap-sm u-items-center u-text-center">
    <h1>⚙️ System Administration</h1>
    <p>Comprehensive system management and configuration</p>

    <div class="u-flex u-flex-wrap u-justify-center u-gap-sm">
      <button class="global-button-base global-button-tertiary" on:click={loadAdminData} disabled={loading}>
        {loading ? '⏳ Loading...' : '🔄 Refresh Data'}
      </button>
      <button class="global-button-base global-button-secondary" on:click={() => restartService('notifications')}>
        🔄 Restart Notifications
      </button>
      <button class="global-button-base global-button-primary" on:click={() => restartService('system')}>
        🚨 Emergency Restart
      </button>
    </div>
  </header>

  {#if loading}
    <div class="u-flex u-flex-col u-items-center u-gap-sm u-text-center u-pt-xl u-pb-xl">
      <span class="global-spinner global-spinner-lg" aria-hidden="true"></span>
      <p>Loading system administration data...</p>
    </div>
  {:else}
    <section class="u-flex u-flex-col u-gap-md">
      <h2>🖥️ System Status</h2>
      <div class="global-grid-status">
        <article class="global-card-base global-card-success u-mb-0">
          <div class="global-card-content u-flex u-flex-col u-gap-sm">
            <div class="u-flex u-items-center u-gap-xs">
              <span>💚</span>
              <h3>System Health</h3>
            </div>
            <span class="global-badge-base global-badge-success">Online</span>
            <p>Uptime: {systemStats.system ? formatUptime(systemStats.system.uptime || 0) : 'N/A'}</p>
          </div>
        </article>

        <article class={`global-card-base u-mb-0 ${getUsageCardClass(systemStats.system?.memoryUsage)}`}>
          <div class="global-card-content u-flex u-flex-col u-gap-sm">
            <div class="u-flex u-items-center u-gap-xs">
              <span>💾</span>
              <h3>Memory Usage</h3>
            </div>
            <span class={`global-badge-base ${getUsageBadgeClass(systemStats.system?.memoryUsage)}`}>
              {systemStats.system?.memoryUsage?.toFixed(1) || 0}%
            </span>
            <p>{formatBytes(systemStats.system?.memoryUsed || 0)} / {formatBytes(systemStats.system?.memoryTotal || 0)}</p>
          </div>
        </article>

        <article class={`global-card-base u-mb-0 ${getUsageCardClass(systemStats.system?.cpuUsage)}`}>
          <div class="global-card-content u-flex u-flex-col u-gap-sm">
            <div class="u-flex u-items-center u-gap-xs">
              <span>⚡</span>
              <h3>CPU Usage</h3>
            </div>
            <span class={`global-badge-base ${getUsageBadgeClass(systemStats.system?.cpuUsage)}`}>
              {systemStats.system?.cpuUsage?.toFixed(1) || 0}%
            </span>
            <p>Load average: {systemStats.system?.loadAverage?.toFixed(2) || 0}</p>
          </div>
        </article>

        <article class="global-card-base u-mb-0">
          <div class="global-card-content u-flex u-flex-col u-gap-sm">
            <div class="u-flex u-items-center u-gap-xs">
              <span>🌐</span>
              <h3>Network Status</h3>
            </div>
            <span class="global-badge-base global-badge-success">Connected</span>
            <p>{formatNumber(systemStats.system?.networkRequests || 0)} requests processed</p>
          </div>
        </article>
      </div>
    </section>

    <section class="u-flex u-flex-col u-gap-md">
      <h2>🔧 Service Status</h2>
      <div class="global-grid-auto">
        {#each Object.entries(systemStats.services || {}) as [serviceName, service]}
          {@const svc = service as ServiceInfo}
          <article class="global-card-base u-mb-0">
            <div class="global-card-header u-flex u-flex-wrap u-justify-between u-items-center u-gap-sm">
              <h3>{serviceName}</h3>
              <span class={`global-badge-base ${getServiceBadgeClass(svc.status)}`}>
                {svc.status}
              </span>
            </div>
            <div class="global-card-content u-flex u-flex-col u-gap-sm">
              <div class="u-flex u-justify-between u-gap-sm">
                <span>PID</span>
                <span>{svc.pid || 'N/A'}</span>
              </div>
              <div class="u-flex u-justify-between u-gap-sm">
                <span>Memory</span>
                <span>{formatBytes(svc.memory || 0)}</span>
              </div>
              <div class="u-flex u-justify-between u-gap-sm">
                <span>CPU</span>
                <span>{svc.cpu?.toFixed(1) || 0}%</span>
              </div>
              <div class="u-flex u-flex-wrap u-gap-sm">
                <button class="global-button-base global-button-tertiary global-button-sm" on:click={() => restartService(serviceName)}>
                  🔄 Restart
                </button>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="u-flex u-flex-col u-gap-md">
      <div class="u-flex u-flex-wrap u-justify-between u-items-center u-gap-sm">
        <h2>⚙️ System Configuration</h2>
        {#if !configEditing}
          <button
            class="global-button-base global-button-primary"
            on:click={() => {
              configEditing = true;
              configChanges = { ...systemConfig };
            }}
          >
            ✏️ Edit Configuration
          </button>
        {:else}
          <div class="u-flex u-flex-wrap u-gap-sm">
            <button class="global-button-base global-button-primary" on:click={saveConfiguration}>
              💾 Save Changes
            </button>
            <button
              class="global-button-base global-button-tertiary"
              on:click={() => {
                configEditing = false;
                configChanges = {};
              }}
            >
              ❌ Cancel
            </button>
          </div>
        {/if}
      </div>

      <div class="global-grid-auto">
        <article class="global-card-base u-mb-0">
          <div class="global-card-header">
            <h3>📱 Notification Settings</h3>
          </div>
          <div class="global-card-content u-flex u-flex-col u-gap-md">
            <div class="global-form-group">
              <label for="notifications-enabled" class="u-flex u-justify-between u-items-center u-gap-sm">
                <span>Enable Notifications</span>
                <input
                  type="checkbox"
                  id="notifications-enabled"
                  checked={configEditing ? configChanges.notifications?.enabled : systemConfig.notifications?.enabled}
                  on:change={(e) => {
                    if (configEditing) {
                      if (!configChanges.notifications) {
                        configChanges.notifications = {};
                      }
                      configChanges.notifications.enabled = (e.target as HTMLInputElement).checked;
                    }
                  }}
                  disabled={!configEditing}
                />
              </label>
            </div>
            <div class="global-form-group">
              <label for="notification-rate-limit">Rate Limit (per minute)</label>
              <input
                class="global-input-base"
                type="number"
                id="notification-rate-limit"
                value={configEditing ? configChanges.notifications?.rateLimit : systemConfig.notifications?.rateLimit}
                on:input={(e) => {
                  if (configEditing) {
                    if (!configChanges.notifications) {
                      configChanges.notifications = {};
                    }
                    configChanges.notifications.rateLimit = parseInt((e.target as HTMLInputElement).value, 10);
                  }
                }}
                disabled={!configEditing}
                min="1"
                max="100"
              />
            </div>
          </div>
        </article>

        <article class="global-card-base u-mb-0">
          <div class="global-card-header">
            <h3>🔗 Webhook Settings</h3>
          </div>
          <div class="global-card-content u-flex u-flex-col u-gap-md">
            <div class="global-form-group">
              <label for="webhooks-enabled" class="u-flex u-justify-between u-items-center u-gap-sm">
                <span>Enable Webhooks</span>
                <input
                  type="checkbox"
                  id="webhooks-enabled"
                  checked={configEditing ? configChanges.webhooks?.enabled : systemConfig.webhooks?.enabled}
                  on:change={(e) => {
                    if (configEditing) {
                      if (!configChanges.webhooks) {
                        configChanges.webhooks = {};
                      }
                      configChanges.webhooks.enabled = (e.target as HTMLInputElement).checked;
                    }
                  }}
                  disabled={!configEditing}
                />
              </label>
            </div>
            <div class="global-form-group">
              <label for="webhook-timeout">Timeout (seconds)</label>
              <input
                class="global-input-base"
                type="number"
                id="webhook-timeout"
                value={configEditing ? configChanges.webhooks?.timeout : systemConfig.webhooks?.timeout}
                on:input={(e) => {
                  if (configEditing) {
                    if (!configChanges.webhooks) {
                      configChanges.webhooks = {};
                    }
                    configChanges.webhooks.timeout = parseInt((e.target as HTMLInputElement).value, 10);
                  }
                }}
                disabled={!configEditing}
                min="5"
                max="60"
              />
            </div>
          </div>
        </article>

        <article class="global-card-base u-mb-0">
          <div class="global-card-header">
            <h3>📊 Analytics Settings</h3>
          </div>
          <div class="global-card-content u-flex u-flex-col u-gap-md">
            <div class="global-form-group">
              <label for="analytics-enabled" class="u-flex u-justify-between u-items-center u-gap-sm">
                <span>Enable Analytics</span>
                <input
                  type="checkbox"
                  id="analytics-enabled"
                  checked={configEditing ? configChanges.analytics?.enabled : systemConfig.analytics?.enabled}
                  on:change={(e) => {
                    if (configEditing) {
                      if (!configChanges.analytics) {
                        configChanges.analytics = {};
                      }
                      configChanges.analytics.enabled = (e.target as HTMLInputElement).checked;
                    }
                  }}
                  disabled={!configEditing}
                />
              </label>
            </div>
            <div class="global-form-group">
              <label for="analytics-retention">Data Retention (days)</label>
              <input
                class="global-input-base"
                type="number"
                id="analytics-retention"
                value={configEditing ? configChanges.analytics?.retentionDays : systemConfig.analytics?.retentionDays}
                on:input={(e) => {
                  if (configEditing) {
                    if (!configChanges.analytics) {
                      configChanges.analytics = {};
                    }
                    configChanges.analytics.retentionDays = parseInt((e.target as HTMLInputElement).value, 10);
                  }
                }}
                disabled={!configEditing}
                min="1"
                max="365"
              />
            </div>
          </div>
        </article>

        <article class="global-card-base u-mb-0">
          <div class="global-card-header">
            <h3>🔐 Security Settings</h3>
          </div>
          <div class="global-card-content u-flex u-flex-col u-gap-md">
            <div class="global-form-group">
              <label for="rate-limiting" class="u-flex u-justify-between u-items-center u-gap-sm">
                <span>Enable Rate Limiting</span>
                <input
                  type="checkbox"
                  id="rate-limiting"
                  checked={configEditing ? configChanges.security?.rateLimiting : systemConfig.security?.rateLimiting}
                  on:change={(e) => {
                    if (configEditing) {
                      if (!configChanges.security) {
                        configChanges.security = {};
                      }
                      configChanges.security.rateLimiting = (e.target as HTMLInputElement).checked;
                    }
                  }}
                  disabled={!configEditing}
                />
              </label>
            </div>
            <div class="global-form-group">
              <label for="auth-required" class="u-flex u-justify-between u-items-center u-gap-sm">
                <span>Require Authentication</span>
                <input
                  type="checkbox"
                  id="auth-required"
                  checked={configEditing ? configChanges.security?.authRequired : systemConfig.security?.authRequired}
                  on:change={(e) => {
                    if (configEditing) {
                      if (!configChanges.security) {
                        configChanges.security = {};
                      }
                      configChanges.security.authRequired = (e.target as HTMLInputElement).checked;
                    }
                  }}
                  disabled={!configEditing}
                />
              </label>
            </div>
          </div>
        </article>
      </div>
    </section>

    {#if result}
      <section class="u-flex u-flex-col u-gap-md">
        <div
          class={`global-card-base u-mb-0 ${
            statusType === 'success'
              ? 'global-card-success'
              : statusType === 'error'
              ? 'global-card-error'
              : statusType === 'warning'
              ? 'global-card-warning'
              : ''
          }`}
        >
          <div class="global-card-content">
            <p>{result}</p>
          </div>
        </div>
      </section>
    {/if}

    <section class="u-flex u-flex-col u-gap-md">
      <h2>ℹ️ Setup Guide</h2>
      <article class="global-card-base u-mb-0">
        <div class="global-card-content">
          <ol class="setup-list">
            <li>
              <h3>Get Your API Key</h3>
              <p>Use the API key from your SHOOTER system environment variables.</p>
            </li>
            <li>
              <h3>Find Device Token</h3>
              <p>Retrieve the 64-character device token from the iOS app registration logs.</p>
            </li>
            <li>
              <h3>Test & Save</h3>
              <p>Send a test notification to verify everything works, then save your settings.</p>
            </li>
          </ol>
        </div>
      </article>
    </section>

    <section class="u-flex u-flex-col u-gap-md">
      <h2>📄 Recent System Logs</h2>
      <div class="global-card-base u-mb-0">
        <div class="global-card-header u-flex u-flex-wrap u-justify-between u-items-center u-gap-sm">
          <h3>Latest Events</h3>
          <div class="u-flex u-flex-wrap u-gap-sm">
            <button class="global-button-base global-button-tertiary global-button-sm" on:click={() => loadAdminData()}>
              🔄 Refresh Logs
            </button>
            <button class="global-button-base global-button-tertiary global-button-sm">
              📤 Export Logs
            </button>
          </div>
        </div>
        <div class="global-card-content">
          <div class="logs-scroll">
            {#each (systemStats.recentLogs as LogEntry[] | undefined) || [] as log}
              <div class={`log-entry ${getLogRowClass(log.level)}`}>
                <span class="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                <span class={`global-badge-base ${getLogBadgeClass(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
                <p class="log-message">{log.message}</p>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .admin-dashboard {
    max-width: 1200px;
    margin: 0 auto;
  }

  .setup-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin: 0;
    padding-left: var(--spacing-lg);
  }

  .logs-scroll {
    max-height: 400px;
    overflow-y: auto;
  }

  .log-entry {
    display: grid;
    grid-template-columns: minmax(0, 160px) minmax(0, 120px) 1fr;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
  }

  .log-entry:last-child {
    border-bottom: none;
  }

  .log-entry--error {
    background: var(--status-color-error-light);
  }

  .log-entry--warning {
    background: var(--status-color-warning-light);
  }

  .log-entry--info {
    background: var(--status-color-info-light);
  }

  .log-timestamp {
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .log-entry {
      grid-template-columns: 1fr;
      gap: var(--spacing-xs);
    }
  }
</style>
