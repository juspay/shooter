<script lang="ts">
  import { onMount } from 'svelte';
  
  let claudeStatus = {
    connected: true,
    hooksActive: 5,
    lastActivity: new Date(Date.now() - 1800000).toISOString(),
    totalCalls: 1247,
    successRate: 98.5,
    avgResponseTime: 145
  };

  let hookConfiguration = [
    {
      id: 'PreToolUse',
      name: 'Pre Tool Use',
      description: 'Triggers before tool execution',
      enabled: true,
      lastTriggered: new Date(Date.now() - 600000).toISOString(),
      count: 342
    },
    {
      id: 'PostToolUse',
      name: 'Post Tool Use',
      description: 'Triggers after tool execution',
      enabled: true,
      lastTriggered: new Date(Date.now() - 300000).toISOString(),
      count: 339
    },
    {
      id: 'UserPromptSubmit',
      name: 'User Prompt Submit',
      description: 'Triggers on new user prompts',
      enabled: true,
      lastTriggered: new Date(Date.now() - 900000).toISOString(),
      count: 156
    },
    {
      id: 'SessionStart',
      name: 'Session Start',
      description: 'Triggers when Claude session starts',
      enabled: true,
      lastTriggered: new Date(Date.now() - 3600000).toISOString(),
      count: 23
    },
    {
      id: 'Stop',
      name: 'Session Stop',
      description: 'Triggers when Claude session ends',
      enabled: false,
      lastTriggered: new Date(Date.now() - 7200000).toISOString(),
      count: 22
    }
  ];

  interface ClaudeEvent {
    id: string;
    hook: string;
    tool: string | null;
    message: string;
    timestamp: string;
    status: string;
    responseTime: number;
  }

  let recentEvents: ClaudeEvent[] = [];
  let testingNotification = false;
  let testResult = '';

  async function loadRecentEvents() {
    // Mock recent Claude Code events
    recentEvents = [
      {
        id: '1',
        hook: 'PostToolUse',
        tool: 'Edit',
        message: 'File updated: src/routes/+page.svelte',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        status: 'success',
        responseTime: 142
      },
      {
        id: '2',
        hook: 'PreToolUse',
        tool: 'Write',
        message: 'Creating new file: components/Header.svelte',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        status: 'success',
        responseTime: 156
      },
      {
        id: '3',
        hook: 'UserPromptSubmit',
        tool: null,
        message: 'User requested to create a new component',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        status: 'success',
        responseTime: 89
      },
      {
        id: '4',
        hook: 'PostToolUse',
        tool: 'Bash',
        message: 'Command executed: npm run dev',
        timestamp: new Date(Date.now() - 1200000).toISOString(),
        status: 'success',
        responseTime: 203
      }
    ];
  }

  async function toggleHook(hookId: string) {
    const hook = hookConfiguration.find(h => h.id === hookId);
    if (hook) {
      hook.enabled = !hook.enabled;
      // In production, this would call an API to update the configuration
      console.log(`Hook ${hookId} ${hook.enabled ? 'enabled' : 'disabled'}`);
    }
  }

  async function testNotification() {
    testingNotification = true;
    testResult = '';
    
    try {
      const response = await fetch('/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Claude Code Test',
          message: 'Test notification from Claude Code integration',
          data: {
            category: 'testing',
            source: 'claude-integration'
          }
        })
      });
      
      const result = await response.json();
      testResult = JSON.stringify(result, null, 2);
    } catch (error) {
      testResult = `Error: ${error}`;
    } finally {
      testingNotification = false;
    }
  }

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

  function getHookIcon(hookId: string): string {
    switch (hookId) {
      case 'PreToolUse': return '⏳';
      case 'PostToolUse': return '✅';
      case 'UserPromptSubmit': return '💬';
      case 'SessionStart': return '🚀';
      case 'Stop': return '🛑';
      default: return '🔧';
    }
  }

  function getStatusColor(status: string): string {
    if (!browser) return '#888888';
    const root = document.documentElement;
    const style = getComputedStyle(root);
    switch (status) {
      case 'success': return style.getPropertyValue('--color-green-500').trim();
      case 'error': return style.getPropertyValue('--color-red-500').trim();
      case 'warning': return style.getPropertyValue('--color-orange-500').trim();
      default: return style.getPropertyValue('--color-gray-550').trim();
    }
  }

  onMount(() => {
    loadRecentEvents();
  });
</script>

<svelte:head>
  <title>Claude Code Integration - SHOOTER</title>
</svelte:head>

<div class="claude-integration">
  <header class="claude-header">
    <div class="header-info">
      <h1>🤖 Claude Code Integration</h1>
      <p>Manage Claude Code lifecycle hooks and notifications</p>
    </div>
    
    <div class="connection-status">
      <div class="status-indicator">
        <span class="status-dot {claudeStatus.connected ? 'connected' : 'disconnected'}"></span>
        <div class="status-details">
          <span class="status-text">
            {claudeStatus.connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          <span class="last-activity">
            Last: {formatTimestamp(claudeStatus.lastActivity)}
          </span>
        </div>
      </div>
    </div>
  </header>

  <div class="claude-grid">
    <!-- Statistics Cards -->
    <section class="stats-cards">
      <div class="stat-card">
        <span class="stat-icon">🎯</span>
        <div class="stat-info">
          <span class="stat-value">{claudeStatus.hooksActive}</span>
          <span class="stat-label">Active Hooks</span>
        </div>
      </div>

      <div class="stat-card">
        <span class="stat-icon">📞</span>
        <div class="stat-info">
          <span class="stat-value">{claudeStatus.totalCalls}</span>
          <span class="stat-label">Total Calls</span>
        </div>
      </div>

      <div class="stat-card">
        <span class="stat-icon">✨</span>
        <div class="stat-info">
          <span class="stat-value">{claudeStatus.successRate}%</span>
          <span class="stat-label">Success Rate</span>
        </div>
      </div>

      <div class="stat-card">
        <span class="stat-icon">⚡</span>
        <div class="stat-info">
          <span class="stat-value">{claudeStatus.avgResponseTime}ms</span>
          <span class="stat-label">Avg Response</span>
        </div>
      </div>
    </section>

    <!-- Hook Configuration -->
    <section class="card hook-config">
      <h2>🔧 Hook Configuration</h2>
      <div class="hooks-list">
        {#each hookConfiguration as hook}
          <div class="hook-item">
            <div class="hook-info">
              <span class="hook-icon">{getHookIcon(hook.id)}</span>
              <div class="hook-details">
                <span class="hook-name">{hook.name}</span>
                <span class="hook-description">{hook.description}</span>
                <div class="hook-stats">
                  <span class="hook-count">{hook.count} calls</span>
                  <span class="hook-last">Last: {formatTimestamp(hook.lastTriggered)}</span>
                </div>
              </div>
            </div>
            
            <div class="hook-controls">
              <span class="hook-toggle">
                <input 
                  type="checkbox" 
                  bind:checked={hook.enabled}
                  on:change={() => toggleHook(hook.id)}
                />
                <span class="toggle-slider"></span>
              </span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Recent Events -->
    <section class="card recent-events">
      <h2>📋 Recent Events</h2>
      {#if recentEvents.length > 0}
        <div class="events-list">
          {#each recentEvents as event}
            <div class="event-item">
              <span class="event-icon">{getHookIcon(event.hook)}</span>
              <div class="event-content">
                <div class="event-header">
                  <span class="event-hook">{event.hook}</span>
                  {#if event.tool}
                    <span class="event-tool">[{event.tool}]</span>
                  {/if}
                  <span class="event-time">{formatTimestamp(event.timestamp)}</span>
                </div>
                <div class="event-message">{event.message}</div>
                <div class="event-footer">
                  <span class="event-status" style="color: {getStatusColor(event.status)}">
                    {event.status.toUpperCase()}
                  </span>
                  <span class="event-response-time">{event.responseTime}ms</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>No recent events</p>
          <p>Events will appear here when Claude Code hooks are triggered</p>
        </div>
      {/if}
    </section>

    <!-- Test & Configuration -->
    <section class="card test-config">
      <h2>🧪 Test & Configuration</h2>
      
      <div class="test-section">
        <h3>Test Notification</h3>
        <p>Send a test notification to verify the integration is working</p>
        <button 
          class="btn-primary" 
          on:click={testNotification}
          disabled={testingNotification}
        >
          {testingNotification ? '⏳ Sending...' : '📱 Send Test Notification'}
        </button>
        
        {#if testResult}
          <div class="test-result">
            <h3>Result:</h3>
            <pre>{testResult}</pre>
          </div>
        {/if}
      </div>

      <div class="config-section">
        <h3>Configuration Files</h3>
        <div class="config-files">
          <div class="config-file">
            <span class="file-icon">📄</span>
            <div class="file-info">
              <span class="file-name">.claude/settings.json</span>
              <span class="file-description">Hook configuration</span>
            </div>
          </div>
          <div class="config-file">
            <span class="file-icon">🐍</span>
            <div class="file-info">
              <span class="file-name">.claude/hooks/*.py</span>
              <span class="file-description">Hook implementation scripts</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="card quick-actions">
      <h2>⚡ Quick Actions</h2>
      <div class="action-buttons">
        <a href="/notifications" class="action-btn">
          📱 Notifications Dashboard
        </a>
        <a href="/system-monitoring/debug" class="action-btn">
          🐛 Debug Tools
        </a>
        <button class="action-btn" on:click={() => window.location.reload()}>
          🔄 Refresh Status
        </button>
        <a href="/integrations" class="action-btn">
          🔗 All Integrations
        </a>
      </div>
    </section>
  </div>
</div>

<style>
  .claude-integration {
    max-width: 1200px;
    margin: 0 auto;
  }

  .claude-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-xl);
    padding: var(--spacing-lg);
    background: var(--status-color-success-bright-subtle);
    border: 1px solid var(--status-color-success-bright);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
    gap: var(--spacing-md);
  }

  .header-info h1 {
    margin: 0 0 0.25rem 0;

  }

  .header-info p {
    margin: 0;
  }

  .connection-status {
    min-width: 200px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--status-color-error);
  }

  .status-dot.connected {
    background: var(--status-color-success);
    box-shadow: var(--shadow-focus);
  }

  .status-details {
    display: flex;
    flex-direction: column;
  }

  .claude-grid {
    display: grid;
    gap: var(--spacing-lg);
  }

  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    background: var(--bg-color-muted);
    border: 1px solid var(--status-color-success-bright);
    border-radius: var(--radius-md);
  }

  .stat-info {
    display: flex;
    flex-direction: column;
  }

  .card {
    background: var(--bg-color-muted);
    border: 1px solid var(--status-color-success-bright);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
  }

  .card h2 {
    margin: 0 0 1rem 0;

  }

  /* .hooks-list spacing handled by child margins */

  .hook-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
    background: var(--bg-color-subtle);
    border: 1px solid var(--overlay-light-medium);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-md);
  }

  .hook-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex: 1;
  }

  .hook-details {
    display: flex;
    flex-direction: column;
  }

  .hook-description {

    margin: var(--spacing-xxs) 0;
  }

  .hook-stats {
    display: flex;
    gap: var(--spacing-md);

  }

  .hook-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .hook-toggle input[type="checkbox"] {
    display: none;
  }

  .toggle-slider {
    width: 48px;
    height: 24px;
    background: var(--overlay-light-heavy);
    border-radius: var(--radius-3xl);
    position: relative;
    transition: background 0.3s ease;
  }

  .toggle-slider:before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--text-color-inverse);
    top: 2px;
    left: 2px;
    transition: transform 0.3s ease;
  }

  .hook-toggle input:checked + .toggle-slider {
    background: var(--status-color-success);
  }

  .hook-toggle input:checked + .toggle-slider:before {
    transform: translateX(24px);
  }

  /* .events-list spacing handled by child margins */

  .event-item {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--bg-color-subtle);
    border: 1px solid var(--overlay-light-medium);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-sm);
  }

  .event-icon {

    flex-shrink: 0;
  }

  .event-content {
    flex: 1;
  }

  .event-header {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    margin-bottom: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .event-time {

    margin-left: auto;
  }

  .event-message {
    margin-bottom: var(--spacing-xs);
  }

  .event-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;

  }

  .test-section, .config-section {
    margin-bottom: var(--spacing-lg);
  }

  .test-section h3, .config-section h3 {
    margin: 0 0 0.5rem 0;
  }

  .test-section p {
    margin: 0 0 1rem 0;

  }

  .btn-primary {
    background: var(--gradient-green);
    border: none;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-sm);

    cursor: pointer;
    transition: all var(--transition-base);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--status-color-success-bright-strong);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .test-result {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--overlay-dark-medium);
    border: 1px solid var(--overlay-light-medium);
    border-radius: var(--radius-sm);
  }

  .test-result pre {
    margin: 0;

    white-space: pre-wrap;
  }

  /* .config-files spacing handled by child margins */

  .config-file {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm);
    background: var(--bg-color-subtle);
    border: 1px solid var(--overlay-light-medium);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-sm);
  }

  .file-info {
    display: flex;
    flex-direction: column;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--spacing-sm);
  }

  .action-btn {
    display: block;
    padding: var(--spacing-sm);
    background: var(--status-color-success-bright-subtle);
    border: 1px solid var(--status-color-success-bright);
    border-radius: var(--radius-sm);
    text-decoration: none;
    text-align: center;
    transition: all 0.2s ease;
    cursor: pointer;

  }

  .action-btn:hover {
    background: var(--bg-color-success-subtle);
    border-color: var(--status-color-success);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
  }

  @media (max-width: 768px) {
    .claude-header {
      flex-direction: column;
      align-items: stretch;
    }
    
    .connection-status {
      min-width: auto;
    }
    
    .status-indicator {
      justify-content: center;
    }
    
    .stats-cards {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    
    .hook-item {
      flex-direction: column;
      gap: var(--spacing-md);
      align-items: stretch;
    }
    
    .event-header {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-xs);
    }
    
    .event-time {
      margin-left: 0;
    }
    
    .action-buttons {
      grid-template-columns: 1fr;
    }
  }
</style>