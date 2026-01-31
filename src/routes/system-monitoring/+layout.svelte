<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LayoutData } from './$types';
  
  export let data: LayoutData;

  let systemHealth = 'healthy';
  let lastHealthCheck = new Date().toISOString();
  let healthCheckInterval: ReturnType<typeof setInterval> | undefined;

  async function checkSystemHealth() {
    try {
      const response = await fetch('/system-monitoring/health');
      if (response.ok) {
        const health = await response.json();
        systemHealth = health.status === 'ok' ? 'healthy' : 'warning';
      } else {
        systemHealth = 'error';
      }
      lastHealthCheck = new Date().toISOString();

      } catch (error) {
      console.error('Health check failed:', error);
      systemHealth = 'error';
    }
  }

  onMount(() => {
    checkSystemHealth();
    healthCheckInterval = setInterval(checkSystemHealth, data.monitoringConfig.healthCheckInterval);
  });

  onDestroy(() => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }
  });

  function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
return `${days}d ${hours}h ${minutes}m`;
}
    if (hours > 0) {
return `${hours}h ${minutes}m`;
}
    return `${minutes}m`;
  }

  function getHealthIcon(health: string): string {
    switch (health) {
      case 'healthy': return '🟢';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  }

  function getHealthBadgeClass(health: string): string {
    switch (health) {
      case 'healthy':
      case 'ok':
        return 'global-badge-base global-badge-success';
      case 'warning':
        return 'global-badge-base global-badge-warning';
      case 'error':
      case 'failed':
        return 'global-badge-base global-badge-error';
      default:
        return 'global-badge-base';
    }
  }
</script>

<div class="u-bg-secondary u-min-h-screen u-flex u-flex-col">
  <header class="global-header">
    <div class="global-header-content u-flex-col u-items-start u-gap-sm">
      <div class="u-flex u-flex-wrap u-gap-md u-items-center">
        <h1>🔧 System Monitoring</h1>
        <div class={getHealthBadgeClass(systemHealth)}>
          {getHealthIcon(systemHealth)} {systemHealth.toUpperCase()}
        </div>
      </div>
      <div class="u-flex u-flex-wrap u-gap-sm u-items-center">
        <span class="global-badge-base global-badge-info">⏱️ Uptime: {formatUptime(data.systemStatus.uptime)}</span>
        <span class="global-badge-base global-badge-info">🖥️ {data.systemStatus.platform}</span>
        <span class="global-badge-base global-badge-info">⚡ {data.systemStatus.nodeVersion}</span>
      </div>
      <small>Last check: {new Date(lastHealthCheck).toLocaleTimeString()}</small>
    </div>
  </header>

  <nav class="u-border-bottom u-bg-tertiary">
    <div class="global-header-content u-flex u-gap-lg u-overflow-x-auto u-py-sm">
      <a href="/system-monitoring" data-sveltekit-preload-data>📊 Overview</a>
      <a href="/system-monitoring/debug" data-sveltekit-preload-data>🐛 Debug Tools</a>
      <a href="/notifications" data-sveltekit-preload-data>📱 Notifications</a>
      <a href="/integrations" data-sveltekit-preload-data>🔗 Integrations</a>
    </div>
  </nav>

  <main class="u-flex-1 u-px-lg u-py-xl">
    <div class="global-header-content u-flex-col u-gap-xl u-items-stretch">
      <slot />
    </div>
  </main>
</div>
