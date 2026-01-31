<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LayoutData } from './$types';
  
  export let data: LayoutData;

  let connectionStatuses = data.integrations;
  let statusUpdateInterval: ReturnType<typeof setInterval> | undefined;

  async function updateConnectionStatuses() {
    try {
      const response = await fetch('/integrations/status');
      if (response.ok) {
        const statuses = await response.json();
        connectionStatuses = { ...connectionStatuses, ...statuses };
      }
    } catch (error) {
      console.error('Failed to update connection statuses:', error);
    }
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'disconnected': case 'error': return 'status-error';
      default: return 'status-default';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'disconnected': return '🔴';
      case 'error': return '❌';
      default: return '⚪';
    }
  }

  function formatLastActivity(timestamp: string | null): string {
    if (!timestamp) {
return 'Never';
}
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
return `${hours}h ago`;
}
    if (minutes > 0) {
return `${minutes}m ago`;
}
    return 'Just now';
  }

  onMount(() => {
    updateConnectionStatuses();
    statusUpdateInterval = setInterval(updateConnectionStatuses, 60000); // Update every minute
  });

  onDestroy(() => {
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
    }
  });
</script>

<div class="integrations-layout">
  <header class="integrations-header">
    <div class="header-content">
      <div class="header-left">
        <h1>🔗 Integrations</h1>
        <p>External system connections and webhooks</p>
      </div>
      
      <div class="integration-status">
        <div class="status-grid">
          <div class="status-item">
            <span class="status-icon">{getStatusIcon(connectionStatuses.claude.status)}</span>
            <div class="status-info">
              <span class="status-name">Claude Code</span>
              <span class="status-detail">{formatLastActivity(connectionStatuses.claude.lastActivity)}</span>
            </div>
          </div>
          
          <div class="status-item">
            <span class="status-icon">{getStatusIcon(connectionStatuses.github.status)}</span>
            <div class="status-info">
              <span class="status-name">GitHub</span>
              <span class="status-detail">{connectionStatuses.github.enabled ? 'Ready' : 'Disabled'}</span>
            </div>
          </div>
          
          <div class="status-item">
            <span class="status-icon">{getStatusIcon(connectionStatuses.vercel.status)}</span>
            <div class="status-info">
              <span class="status-name">Vercel</span>
              <span class="status-detail">{formatLastActivity(connectionStatuses.vercel.lastActivity)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <nav class="integrations-nav">
    <a href="/integrations" class="nav-link" data-sveltekit-preload-data>
      📊 Overview
    </a>
    <a href="/integrations/claude" class="nav-link" data-sveltekit-preload-data>
      🤖 Claude Code
    </a>
    <a href="/integrations/webhook" class="nav-link" data-sveltekit-preload-data>
      🔗 Webhooks
    </a>
    <a href="/notifications" class="nav-link" data-sveltekit-preload-data>
      📱 Notifications
    </a>
  </nav>

  <!-- Integration Stats Bar -->
  <div class="stats-bar">
    <div class="stats-content">
      <div class="stat-item">
        <span class="stat-value">{connectionStatuses.webhooks.activeEndpoints}</span>
        <span class="stat-label">Active Webhooks</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{connectionStatuses.webhooks.requestsToday}</span>
        <span class="stat-label">Requests Today</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{connectionStatuses.webhooks.averageResponseTime}ms</span>
        <span class="stat-label">Avg Response</span>
      </div>
      <div class="stat-item">
        <span class="stat-value {getStatusClass('connected')}">
          {Math.round(((connectionStatuses.claude.successRate + connectionStatuses.vercel.successRate) / 2))}%
        </span>
        <span class="stat-label">Success Rate</span>
      </div>
    </div>
  </div>

  <main class="integrations-content">
    <slot />
  </main>
</div>

<style>
  .integrations-layout {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-color-light), var(--bg-color-secondary));
  }

  .integrations-header {
    background: var(--accent-color-secondary-subtle);
    border-bottom: 1px solid var(--accent-color-secondary);
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
    margin: 0 0 0.25rem 0;

  }

  .header-left p {
    margin: 0;

  }

  .integration-status {
    min-width: 300px;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-sm);
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs);
    background: var(--bg-color-subtle);
    border: 1px solid var(--accent-color-secondary-bg);
    border-radius: var(--radius-sm);
  }

  .status-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .status-name {

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-detail {

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .integrations-nav {
    background: var(--bg-color-subtle);
    padding: 0 2rem;
    border-bottom: 1px solid var(--overlay-light-subtle);
  }

  .integrations-nav {
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

  .stats-bar {
    background: var(--overlay-dark-subtle);
    border-bottom: 1px solid var(--overlay-light-subtle);
    padding: var(--spacing-sm) var(--spacing-xl);
  }

  .stats-content {
    display: flex;
    justify-content: center;
    gap: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
    flex-wrap: wrap;
  }

  .stat-item {
    text-align: center;
  }

  .stat-value {
    display: block;

  }

  .stat-value.status-connected {
    color: var(--status-color-success);
  }

  .stat-value.status-connecting {
    color: var(--status-color-warning);
  }

  .stat-value.status-error {
    color: var(--status-color-error);
  }

  .stat-value.status-default {
    color: var(--text-color-tertiary);
  }

  .stat-label {
    display: block;

    margin-top: var(--spacing-xxs);
  }

  .integrations-content {
    padding: var(--spacing-xl);
    max-width: 1200px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      align-items: stretch;
    }
    
    .integration-status {
      min-width: auto;
    }
    
    .status-grid {
      grid-template-columns: 1fr;
    }
    
    .stats-content {
      gap: var(--spacing-md);
    }
    
    .stat-item {
      flex: 1;
      min-width: 80px;
    }
    
    .integrations-nav {
      padding: 0 1rem;
    }
    
    .integrations-content {
      padding: var(--spacing-md);
    }
  }
</style>
