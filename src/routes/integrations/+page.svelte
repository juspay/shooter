<script lang="ts">

  
  let integrationStats = {
    claude: {
      status: 'connected',
      hooksConfigured: 5,
      totalCalls: 1247,
      successRate: 98.6,
      lastActivity: new Date(Date.now() - 300000).toISOString()
    },
    webhooks: {
      status: 'active',
      activeEndpoints: 3,
      received: 247,
      averageResponseTime: 85
    },
    github: {
      status: 'ready',
      enabled: false,
      repositories: 0
    },
    vercel: {
      status: 'connected',
      deploymentsTracked: 23,
      successRate: 100,
      lastActivity: new Date(Date.now() - 600000).toISOString()
    }
  };

  let recentActivity = [
    {
      id: '1',
      type: 'claude_hook',
      title: 'File edit notification sent',
      description: 'PostToolUse hook triggered for Edit operation',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      status: 'success'
    },
    {
      id: '2',
      type: 'webhook',
      title: 'Webhook received',
      description: 'Generic webhook processed successfully',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      status: 'success'
    },
    {
      id: '3',
      type: 'system',
      title: 'Integration health check',
      description: 'All integrations responding normally',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      status: 'info'
    }
  ];

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) {
return 'Just now';
}
    if (diff < 3600000) {
return `${Math.floor(diff / 60000)}m ago`;
}
    if (diff < 86400000) {
return `${Math.floor(diff / 3600000)}h ago`;
}
    return date.toLocaleDateString();
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'connected': return '🟢';
      case 'active': return '🟢';
      case 'ready': return '🟡';
      case 'disconnected': return '🔴';
      default: return '⚪';
    }
  }

  function getActivityIcon(type: string): string {
    switch (type) {
      case 'claude_hook': return '🤖';
      case 'webhook': return '🔗';
      case 'system': return '🔧';
      case 'github': return '🐙';
      case 'vercel': return '▲';
      default: return '📡';
    }
  }
</script>

<svelte:head>
  <title>Integrations - SHOOTER</title>
</svelte:head>

<div class="integrations-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>📡 Integrations</h1>
      <p class="header-subtitle">Manage your external service connections and webhooks</p>
    </div>
    <div class="header-actions">
      <button class="refresh-btn" on:click={() => window.location.reload()}>
        🔄 Refresh
      </button>
    </div>
  </header>

  <!-- Integration Status Cards -->
  <section class="status-grid">
    <!-- Claude Code Integration -->
    <div class="integration-card claude">
      <div class="card-header">
        <div class="card-title">
          <span class="service-icon">🤖</span>
          <div>
            <h3>Claude Code</h3>
            <p class="service-desc">AI-powered development hooks</p>
          </div>
        </div>
        <div class="status-indicator">
          <span class="status-dot">{getStatusIcon(integrationStats.claude.status)}</span>
          <span class="status-text">{integrationStats.claude.status.toUpperCase()}</span>
        </div>
      </div>
      
      <div class="card-metrics">
        <div class="metric">
          <span class="metric-value">{integrationStats.claude.hooksConfigured}</span>
          <span class="metric-label">Active Hooks</span>
        </div>
        <div class="metric">
          <span class="metric-value">{integrationStats.claude.totalCalls}</span>
          <span class="metric-label">Total Calls</span>
        </div>
        <div class="metric">
          <span class="metric-value">{integrationStats.claude.successRate}%</span>
          <span class="metric-label">Success Rate</span>
        </div>
      </div>
      
      <div class="card-footer">
        <span class="last-activity">Last: {formatTimestamp(integrationStats.claude.lastActivity)}</span>
        <a href="/integrations/claude" class="manage-link">Manage →</a>
      </div>
    </div>

    <!-- Webhook System -->
    <div class="integration-card webhooks">
      <div class="card-header">
        <div class="card-title">
          <span class="service-icon">🔗</span>
          <div>
            <h3>Webhooks</h3>
            <p class="service-desc">HTTP endpoint management</p>
          </div>
        </div>
        <div class="status-indicator">
          <span class="status-dot">{getStatusIcon(integrationStats.webhooks.status)}</span>
          <span class="status-text">{integrationStats.webhooks.status.toUpperCase()}</span>
        </div>
      </div>
      
      <div class="card-metrics">
        <div class="metric">
          <span class="metric-value">{integrationStats.webhooks.activeEndpoints}</span>
          <span class="metric-label">Endpoints</span>
        </div>
        <div class="metric">
          <span class="metric-value">{integrationStats.webhooks.received}</span>
          <span class="metric-label">Today</span>
        </div>
        <div class="metric">
          <span class="metric-value">{integrationStats.webhooks.averageResponseTime}ms</span>
          <span class="metric-label">Avg Response</span>
        </div>
      </div>
      
      <div class="card-footer">
        <span class="last-activity">Processing webhooks</span>
        <a href="/integrations/webhook" class="manage-link">Configure →</a>
      </div>
    </div>

    <!-- GitHub Integration -->
    <div class="integration-card github">
      <div class="card-header">
        <div class="card-title">
          <span class="service-icon">🐙</span>
          <div>
            <h3>GitHub</h3>
            <p class="service-desc">Repository event tracking</p>
          </div>
        </div>
        <div class="status-indicator">
          <span class="status-dot">{getStatusIcon(integrationStats.github.status)}</span>
          <span class="status-text">{integrationStats.github.enabled ? 'READY' : 'SETUP REQUIRED'}</span>
        </div>
      </div>
      
      <div class="card-metrics">
        <div class="metric">
          <span class="metric-value">{integrationStats.github.repositories}</span>
          <span class="metric-label">Repositories</span>
        </div>
        <div class="metric">
          <span class="metric-value">0</span>
          <span class="metric-label">Webhooks</span>
        </div>
        <div class="metric">
          <span class="metric-value">0</span>
          <span class="metric-label">Events</span>
        </div>
      </div>
      
      <div class="card-footer">
        <span class="last-activity">Not configured</span>
        <button class="setup-btn">Setup →</button>
      </div>
    </div>

    <!-- Vercel Integration -->
    <div class="integration-card vercel">
      <div class="card-header">
        <div class="card-title">
          <span class="service-icon">▲</span>
          <div>
            <h3>Vercel</h3>
            <p class="service-desc">Deployment notifications</p>
          </div>
        </div>
        <div class="status-indicator">
          <span class="status-dot">{getStatusIcon(integrationStats.vercel.status)}</span>
          <span class="status-text">{integrationStats.vercel.status.toUpperCase()}</span>
        </div>
      </div>
      
      <div class="card-metrics">
        <div class="metric">
          <span class="metric-value">{integrationStats.vercel.deploymentsTracked}</span>
          <span class="metric-label">Deployments</span>
        </div>
        <div class="metric">
          <span class="metric-value">{integrationStats.vercel.successRate}%</span>
          <span class="metric-label">Success Rate</span>
        </div>
        <div class="metric">
          <span class="metric-value">Live</span>
          <span class="metric-label">Status</span>
        </div>
      </div>
      
      <div class="card-footer">
        <span class="last-activity">Last: {formatTimestamp(integrationStats.vercel.lastActivity)}</span>
        <a href="https://vercel.com/dashboard" target="_blank" class="manage-link">Dashboard ↗</a>
      </div>
    </div>
  </section>

  <!-- Recent Activity -->
  <section class="activity-section">
    <h2>📋 Recent Activity</h2>
    <div class="activity-feed">
      {#each recentActivity as activity}
        <div class="activity-item">
          <span class="activity-icon">{getActivityIcon(activity.type)}</span>
          <div class="activity-content">
            <div class="activity-header">
              <span class="activity-title">{activity.title}</span>
              <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
            </div>
            <p class="activity-description">{activity.description}</p>
            <span class="activity-status {activity.status}">{activity.status.toUpperCase()}</span>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Quick Actions -->
  <section class="actions-section">
    <h2>⚡ Quick Actions</h2>
    <div class="action-grid">
      <a href="/integrations/claude" class="action-card primary">
        <span class="action-icon">🤖</span>
        <div>
          <h3>Claude Setup</h3>
          <p>Configure AI hooks</p>
        </div>
      </a>
      <a href="/notifications" class="action-card">
        <span class="action-icon">📱</span>
        <div>
          <h3>Test Notification</h3>
          <p>Send test message</p>
        </div>
      </a>
      <a href="/system-monitoring/debug" class="action-card">
        <span class="action-icon">🐛</span>
        <div>
          <h3>Debug Tools</h3>
          <p>System diagnostics</p>
        </div>
      </a>
      <a href="/system-monitoring/admin" class="action-card">
        <span class="action-icon">⚙️</span>
        <div>
          <h3>Settings</h3>
          <p>Advanced config</p>
        </div>
      </a>
    </div>
  </section>
</div>

<style>
  .integrations-container {
    min-height: 100vh;
    background: var(--bg-color-light);
    padding: var(--spacing-xl);

  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-xl);
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color-primary);
  }

  .header-content h1 {
    margin: 0 0 0.5rem;

    background: var(--gradient-blue-cyan);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .header-subtitle {
    margin: 0;

  }

  .refresh-btn {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-btn:hover {
    background: var(--bg-color-tertiary);
    border-color: var(--status-color-info);
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xl);
    align-items: start; /* Cards align to grid top */
  }

  .integration-card {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    transition: all 0.2s ease;
  }

  .integration-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--status-color-info);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-lg);
  }

  .card-title {
    display: flex;
    gap: var(--spacing-md);
    align-items: center;
  }

  .card-title h3 {
    margin: 0 0 0.25rem;

  }

  .service-desc {
    margin: 0;

  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .card-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    align-items: baseline; /* Metric values align baseline */
  }

  .metric {
    text-align: center;
  }

  .metric-value {
    display: block;

    margin-bottom: var(--spacing-xxs);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color-primary);
  }

  .manage-link, .setup-btn {
    text-decoration: none;

    background: none;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .manage-link:hover, .setup-btn:hover {
    opacity: 0.8;
  }

  .activity-section, .actions-section {
    margin-bottom: var(--spacing-xl);
  }

  .activity-section h2, .actions-section h2 {
    margin: 0 0 1rem;

  }

  .activity-feed {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
  }

  .activity-item {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-xs);
    transition: background-color 0.2s ease;
  }

  .activity-item:hover {
    background: var(--bg-color-tertiary);
  }

  .activity-item:last-child {
    margin-bottom: 0;
  }

  .activity-icon {

    flex-shrink: 0;
  }

  .activity-content {
    flex: 1;
  }

  .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-xs);
  }

  .activity-description {
    margin: 0 0 0.5rem;

  }

  .activity-status {

    padding: var(--spacing-xxs) 0.5rem;
    border-radius: var(--radius-xs);
  }

  .activity-status.success {
    background: var(--status-color-success-bright-bg);
  }

  .activity-status.info {
    background: var(--status-color-info-bg);
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
    align-items: start; /* Action cards align tops */
  }

  .action-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .action-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: var(--status-color-info);
  }

  .action-card.primary {
    background: linear-gradient(135deg, var(--bg-color-info-subtle), var(--bg-color-info-subtle));
    border-color: var(--status-color-info);
  }

  .action-card h3 {
    margin: 0 0 0.25rem;

  }

  .action-card p {
    margin: 0;

  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .integrations-container {
      padding: var(--spacing-md);
    }

    .page-header {
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .status-grid {
      grid-template-columns: 1fr;
    }

    .card-metrics {
      grid-template-columns: repeat(3, 1fr);
    }

    .activity-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xxs);
    }

    .action-grid {
      grid-template-columns: 1fr;
    }
  }
</style>