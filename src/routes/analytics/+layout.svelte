<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LayoutData } from './$types';
  
  export let data: LayoutData;

  let analyticsData = data.dataStreams;
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  async function refreshAnalyticsData() {
    try {
      const response = await fetch('/analytics/summary');
      if (response.ok) {
        const summary = await response.json();
        analyticsData = { ...analyticsData, ...summary };
      }
    } catch (error) {
      console.error('Failed to refresh analytics data:', error);
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) {
return (num / 1000000).toFixed(1) + 'M';
}
    if (num >= 1000) {
return (num / 1000).toFixed(1) + 'K';
}
    return num.toString();
  }

  function getHealthClass(rate: number): string {
    if (rate >= 95) {
return 'status-success';
}
    if (rate >= 85) {
return 'status-warning';
}
    return 'status-error';
  }

  onMount(() => {
    refreshAnalyticsData();
    if (data.analytics.dashboardConfig.refreshInterval) {
      refreshInterval = setInterval(refreshAnalyticsData, data.analytics.dashboardConfig.refreshInterval);
    }
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>

<div class="analytics-layout">
  <header class="analytics-header">
    <div class="header-content">
      <div class="header-left">
        <h1>📊 Analytics</h1>
        <p>Performance insights and data analysis</p>
      </div>
      
      <div class="analytics-overview">
        <div class="overview-grid">
          <div class="overview-item">
            <span class="overview-icon">📱</span>
            <div class="overview-info">
              <span class="overview-name">Notifications</span>
              <span class="overview-value">{formatNumber(analyticsData.notifications.totalEvents)}</span>
              <span class="overview-detail">+{analyticsData.notifications.todayEvents} today</span>
            </div>
          </div>
          
          <div class="overview-item">
            <span class="overview-icon">🔗</span>
            <div class="overview-info">
              <span class="overview-name">Webhooks</span>
              <span class="overview-value">{formatNumber(analyticsData.webhooks.totalRequests)}</span>
              <span class="overview-detail">{analyticsData.webhooks.averageResponseTime}ms avg</span>
            </div>
          </div>
          
          <div class="overview-item">
            <span class="overview-icon">💻</span>
            <div class="overview-info">
              <span class="overview-name">System</span>
              <span class="overview-value">{Math.floor(analyticsData.systemMetrics.metricsRetained / 60)}h</span>
              <span class="overview-detail">data retained</span>
            </div>
          </div>
          
          <div class="overview-item">
            <span class="overview-icon">📈</span>
            <div class="overview-info">
              <span class="overview-name">Success Rate</span>
              <span class="overview-value {getHealthClass(analyticsData.notifications.successRate)}">
                {analyticsData.notifications.successRate.toFixed(1)}%
              </span>
              <span class="overview-detail">overall health</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <nav class="analytics-nav">
    <a href="/analytics" class="nav-link" data-sveltekit-preload-data>
      📈 Dashboard
    </a>
    <a href="/analytics/data" class="nav-link" data-sveltekit-preload-data>
      🗄️ Data Explorer
    </a>
    <a href="/analytics/performance" class="nav-link" data-sveltekit-preload-data>
      ⚡ Performance
    </a>
    <a href="/analytics/usage" class="nav-link" data-sveltekit-preload-data>
      📊 Usage Stats
    </a>
    <a href="/analytics/export" class="nav-link" data-sveltekit-preload-data>
      📤 Export
    </a>
  </nav>

  <!-- Real-time Status Bar -->
  <div class="status-bar">
    <div class="status-content">
      <div class="status-item">
        <span class="status-dot {data.analytics.realTimeEnabled ? 'active' : 'inactive'}"></span>
        <span class="status-label">Real-time {data.analytics.realTimeEnabled ? 'Active' : 'Disabled'}</span>
      </div>
      <div class="status-item">
        <span class="status-dot {data.analytics.dashboardConfig.chartsEnabled ? 'active' : 'inactive'}"></span>
        <span class="status-label">Charts {data.analytics.dashboardConfig.chartsEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="status-item">
        <span class="status-dot {data.permissions.exportData ? 'active' : 'warning'}"></span>
        <span class="status-label">Export {data.permissions.exportData ? 'Available' : 'Limited'}</span>
      </div>
      <div class="status-item">
        <span class="status-dot info"></span>
        <span class="status-label">Retention: {data.analytics.retentionDays} days</span>
      </div>
    </div>
  </div>

  <main class="analytics-content">
    <slot />
  </main>
</div>

<style>
  .analytics-layout {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-color-light), var(--bg-color-secondary));
  }

  .analytics-header {
    background: var(--accent-color-subtle);
    border: 1px solid var(--accent-color-border);
    padding: var(--spacing-md) var(--spacing-xl);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    flex-wrap: wrap;
    gap: var(--spacing-lg);
  }

  .header-left h1 {
    margin: 0 0 var(--spacing-xxs) 0;

  }

  .header-left p {
    margin: 0;

  }

  .analytics-overview {
    min-width: 400px;
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .overview-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--bg-color-subtle);
    border: 1px solid var(--accent-color-light);
    border-radius: var(--radius-sm);
  }

  .overview-icon {

    min-width: 1.25rem;
  }

  .overview-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .overview-name {

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .overview-value.status-success {
    color: var(--status-color-success);
  }

  .overview-value.status-warning {
    color: var(--status-color-warning);
  }

  .overview-value.status-error {
    color: var(--status-color-error);
  }

  .overview-detail {

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .analytics-nav {
    background: var(--bg-color-subtle);
    padding: 0 var(--spacing-xl);
    border-bottom: 1px solid var(--overlay-light-subtle);
  }

  .analytics-nav {
    display: flex;
    gap: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
    overflow-x: auto;
  }

  .nav-link {
    padding: var(--spacing-sm) 0;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
    white-space: nowrap;

  }

  .nav-link:hover {
    border: 1px solid var(--accent-color-primary);
  }

  .status-bar {
    background: var(--overlay-dark-subtle);
    border-bottom: 1px solid var(--overlay-light-subtle);
    padding: var(--spacing-xs) var(--spacing-xl);
  }

  .status-content {
    display: flex;
    justify-content: center;
    gap: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
    flex-wrap: wrap;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-dot.active {
    background: var(--status-color-success);
  }

  .status-dot.inactive {
    background: var(--text-color-tertiary);
  }

  .status-dot.warning {
    background: var(--status-color-warning);
  }

  .status-dot.info {
    background: var(--accent-color-primary);
  }

  .analytics-content {
    padding: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      align-items: stretch;
    }
    
    .analytics-overview {
      min-width: auto;
    }
    
    .overview-grid {
      grid-template-columns: 1fr;
    }
    
    .status-content {
      gap: var(--spacing-md);
      justify-content: flex-start;
    }
    
    .analytics-nav {
      padding: 0 var(--spacing-md);
    }
    
    .analytics-content {
      padding: var(--spacing-md);
    }
  }
</style>