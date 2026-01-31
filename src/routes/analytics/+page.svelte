<script lang="ts">
  import { onMount } from 'svelte';

  let _analyticsData: Record<string, unknown> = {};
  let _performanceData: Record<string, unknown> = {};
  let loading = true;

  async function loadAnalyticsData() {
    try {
      const [analyticsResponse, performanceResponse] = await Promise.all([
        fetch('/analytics/data'),
        fetch('/analytics/performance')
      ]);

      if (analyticsResponse.ok) {
        _analyticsData = await analyticsResponse.json();
      }

      if (performanceResponse.ok) {
        _performanceData = await performanceResponse.json();
      }

      loading = false;
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      loading = false;
    }
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  function formatPercentage(num: number): string {
    return `${num.toFixed(1)}%`;
  }

  function _formatDuration(ms: number): string {
    if (ms < 1000) {
return `${ms}ms`;
}
    if (ms < 60000) {
return `${(ms / 1000).toFixed(1)}s`;
}
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function getStatusClass(value: number, thresholds: { good: number; warning: number }): string {
    if (value >= thresholds.good) {
return 'status-good';
}
    if (value >= thresholds.warning) {
return 'status-warning';
}
    return 'status-error';
  }

  onMount(() => {
    loadAnalyticsData();
  });
</script>

<svelte:head>
  <title>Analytics Dashboard - SHOOTER</title>
</svelte:head>

<div class="analytics-dashboard">
  <header class="dashboard-header">
    <h1>📈 Analytics Dashboard</h1>
    <p>Real-time insights and performance metrics</p>
    
    <div class="dashboard-actions">
      <button class="btn-secondary" on:click={loadAnalyticsData} disabled={loading}>
        {loading ? '⏳ Loading...' : '🔄 Refresh Data'}
      </button>
      <button class="btn-primary">
        📤 Export Report
      </button>
    </div>
  </header>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading analytics data...</p>
    </div>
  {:else}
    <!-- Key Metrics Cards -->
    <section class="metrics-section">
      <h2>📊 Key Performance Indicators</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-icon">📱</span>
            <span class="metric-title">Notification Success Rate</span>
          </div>
          <div class="metric-value {getStatusClass(98.5, { good: 95, warning: 85 })}">
            {formatPercentage(98.5)}
          </div>
          <div class="metric-detail">
            {formatNumber(1247)} total notifications sent
          </div>
          <div class="metric-trend positive">+2.1% from last week</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-icon">🔗</span>
            <span class="metric-title">Webhook Response Time</span>
          </div>
          <div class="metric-value {getStatusClass(200 - 145, { good: 50, warning: 25 })}">
            145ms
          </div>
          <div class="metric-detail">
            {formatNumber(892)} webhook requests processed
          </div>
          <div class="metric-trend positive">-15ms from last hour</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-icon">🚀</span>
            <span class="metric-title">System Uptime</span>
          </div>
          <div class="metric-value status-good">
            99.8%
          </div>
          <div class="metric-detail">
            4d 12h 30m continuous operation
          </div>
          <div class="metric-trend neutral">Stable</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-icon">👥</span>
            <span class="metric-title">Active Integrations</span>
          </div>
          <div class="metric-value status-info">
            3/4
          </div>
          <div class="metric-detail">
            Claude, Vercel, GitHub connected
          </div>
          <div class="metric-trend warning">1 disconnected</div>
        </div>
      </div>
    </section>

    <!-- Recent Activity -->
    <section class="activity-section">
      <div class="activity-grid">
        <div class="activity-card">
          <h3>🕐 Recent Activity</h3>
          <div class="activity-list">
            <div class="activity-item">
              <span class="activity-time">2m ago</span>
              <span class="activity-description">📱 Push notification sent to iOS device</span>
              <span class="activity-status success">✅</span>
            </div>
            <div class="activity-item">
              <span class="activity-time">5m ago</span>
              <span class="activity-description">🔗 GitHub webhook received (push)</span>
              <span class="activity-status success">✅</span>
            </div>
            <div class="activity-item">
              <span class="activity-time">8m ago</span>
              <span class="activity-description">🤖 Claude Code hook triggered</span>
              <span class="activity-status success">✅</span>
            </div>
            <div class="activity-item">
              <span class="activity-time">12m ago</span>
              <span class="activity-description">📊 System metrics collected</span>
              <span class="activity-status success">✅</span>
            </div>
            <div class="activity-item">
              <span class="activity-time">15m ago</span>
              <span class="activity-description">🚀 Vercel deployment completed</span>
              <span class="activity-status success">✅</span>
            </div>
          </div>
        </div>

        <div class="activity-card">
          <h3>⚠️ Alert Summary</h3>
          <div class="alert-stats">
            <div class="alert-stat">
              <span class="alert-count status-error">2</span>
              <span class="alert-label">Critical</span>
            </div>
            <div class="alert-stat">
              <span class="alert-count status-warning">5</span>
              <span class="alert-label">Warning</span>
            </div>
            <div class="alert-stat">
              <span class="alert-count status-info">12</span>
              <span class="alert-label">Info</span>
            </div>
          </div>
          
          <div class="recent-alerts">
            <div class="alert-item critical">
              <span class="alert-icon">🚨</span>
              <div class="alert-content">
                <span class="alert-title">API Rate Limit Approaching</span>
                <span class="alert-time">23m ago</span>
              </div>
            </div>
            <div class="alert-item warning">
              <span class="alert-icon">⚠️</span>
              <div class="alert-content">
                <span class="alert-title">High Memory Usage Detected</span>
                <span class="alert-time">1h ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Data Overview -->
    <section class="data-overview">
      <h2>🗄️ Data Overview</h2>
      <div class="data-cards">
        <div class="data-card">
          <div class="data-header">
            <h3>📱 Notification Data</h3>
            <span class="data-badge">Real-time</span>
          </div>
          <div class="data-stats">
            <div class="data-stat">
              <span class="data-label">Total Events</span>
              <span class="data-value">{formatNumber(1247)}</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Success Rate</span>
              <span class="data-value">{formatPercentage(98.5)}</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Today's Events</span>
              <span class="data-value">45</span>
            </div>
          </div>
        </div>

        <div class="data-card">
          <div class="data-header">
            <h3>🔗 Webhook Data</h3>
            <span class="data-badge">Active</span>
          </div>
          <div class="data-stats">
            <div class="data-stat">
              <span class="data-label">Total Requests</span>
              <span class="data-value">{formatNumber(892)}</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Avg Response</span>
              <span class="data-value">145ms</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Today's Requests</span>
              <span class="data-value">23</span>
            </div>
          </div>
        </div>

        <div class="data-card">
          <div class="data-header">
            <h3>💻 System Metrics</h3>
            <span class="data-badge">Monitoring</span>
          </div>
          <div class="data-stats">
            <div class="data-stat">
              <span class="data-label">Sampling Rate</span>
              <span class="data-value">60s</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Data Retained</span>
              <span class="data-value">72h</span>
            </div>
            <div class="data-stat">
              <span class="data-label">Status</span>
              <span class="data-value status-good">Healthy</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="quick-actions">
      <h2>⚡ Quick Actions</h2>
      <div class="actions-grid">
        <a href="/analytics/data" class="action-card">
          <span class="action-icon">🗄️</span>
          <span class="action-title">Explore Data</span>
          <span class="action-description">Deep dive into analytics data</span>
        </a>
        
        <a href="/analytics/performance" class="action-card">
          <span class="action-icon">⚡</span>
          <span class="action-title">Performance</span>
          <span class="action-description">System performance insights</span>
        </a>
        
        <a href="/analytics/usage" class="action-card">
          <span class="action-icon">📊</span>
          <span class="action-title">Usage Statistics</span>
          <span class="action-description">Detailed usage analytics</span>
        </a>
        
        <a href="/analytics/export" class="action-card">
          <span class="action-icon">📤</span>
          <span class="action-title">Export Data</span>
          <span class="action-description">Download analytics reports</span>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .analytics-dashboard {
    max-width: 1200px;
    margin: 0 auto;
  }

  .dashboard-header {
    text-align: center;
    margin-bottom: var(--spacing-xl);
  }

  .dashboard-header h1 {
    margin-bottom: var(--spacing-xs);

  }

  .dashboard-header p {
    margin-bottom: var(--spacing-lg);
  }

  .dashboard-actions {
    display: flex;
    justify-content: center;
    gap: var(--spacing-md);
    flex-wrap: wrap;
  }

  .btn-primary, .btn-secondary {
    padding: var(--spacing-sm) var(--spacing-lg);
    border: none;
    border-radius: var(--radius-sm);

    cursor: pointer;
    transition: all 0.2s ease;

  }

  .btn-primary {
    background: var(--gradient-cyan);
  }

  .btn-secondary {
    background: var(--bg-color-hover);
    border: 1px solid var(--overlay-light-heavy);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--accent-color-strong);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-color-active);
  }

  .loading-state {
    text-align: center;
    padding: var(--spacing-xxl);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--overlay-light-heavy);
    border: 1px solid var(--accent-color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .metrics-section h2 {
    margin-top: var(--spacing-xxl);
    margin-bottom: var(--spacing-md);

  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xxl);
    align-items: start; /* Cards align to top of grid cells */
  }

  .metric-card {
    background: var(--bg-color-muted);
    border: 1px solid var(--accent-color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    transition: transform 0.2s ease;
  }

  .metric-card:hover {
    transform: translateY(-2px);
  }

  .metric-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-md);
  }

  .metric-value {

    margin-bottom: var(--spacing-xs);
  }

  .metric-detail {

    margin-bottom: var(--spacing-xs);
  }

  .metric-trend.positive { color: var(--status-color-success); }
  .metric-trend.neutral { color: var(--status-color-warning); }
  .metric-trend.warning { color: var(--status-color-warning); }

  .status-good { color: var(--status-color-success); }
  .status-warning { color: var(--status-color-warning); }
  .status-error { color: var(--status-color-error); }
  .status-info { color: var(--accent-color-primary); }

  .activity-section {
    margin-bottom: var(--spacing-xxl);
  }

  .activity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: var(--spacing-lg);
    align-items: start; /* Align activity cards to top */
  }

  .activity-card {
    background: var(--bg-color-elevated);
    border: 1px solid var(--accent-color-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
  }

  .activity-card h3 {
    margin: 0 0 1rem 0;

  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .activity-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--spacing-sm);
    align-items: center;
    padding: var(--spacing-xs);
    background: var(--bg-color-subtle);
    border-radius: var(--radius-xs);
  }

  .activity-time {

    min-width: 50px;
  }

  .alert-stats {
    display: flex;
    justify-content: space-around;
    margin-bottom: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--bg-color-subtle);
    border-radius: var(--radius-sm);
  }

  .alert-stat {
    text-align: center;
  }

  .alert-count {
    display: block;

  }

  .alert-label {
    display: block;

  }

  .recent-alerts {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .alert-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs);
    border-radius: var(--radius-xs);
  }

  .alert-item.critical { background: var(--status-color-error-bright-subtle); }
  .alert-item.warning { background: var(--status-color-warning-bright-subtle); }

  .alert-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .data-overview h2 {
    margin-top: var(--spacing-xxl);
    margin-bottom: var(--spacing-md);

  }

  .data-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xxl);
    align-items: start;
  }

  .data-card {
    background: var(--bg-color-muted);
    border: 1px solid var(--accent-color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
  }

  .data-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .data-badge {
    background: var(--accent-color-light);
    padding: var(--spacing-xxs) 0.5rem;
    border-radius: var(--radius-xs);

  }

  .data-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  .data-stat {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xxs);
  }

  .quick-actions h2 {
    margin-top: var(--spacing-xxl);
    margin-bottom: var(--spacing-md);

  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
  }

  .action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--spacing-lg);
    background: var(--accent-color-subtle);
    border: 1px solid var(--accent-color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .action-card:hover {
    background: var(--bg-color-info-subtle);
    border: 1px solid var(--accent-color-primary);
    transform: translateY(-2px);
  }

  .action-icon {

    margin-bottom: var(--spacing-xs);
  }

  .action-title {

    margin-bottom: var(--spacing-xxs);
  }

  @media (max-width: 768px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }
    
    .activity-grid {
      grid-template-columns: 1fr;
    }
    
    .data-cards {
      grid-template-columns: 1fr;
    }
    
    .actions-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .data-stats {
      grid-template-columns: 1fr;
    }
    
    .alert-stats {
      flex-direction: column;
      gap: var(--spacing-xs);
    }
  }
</style>