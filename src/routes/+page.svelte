<script lang="ts">
  import { goto } from '$app/navigation';

  interface NotificationData {
    [key: string]: unknown;
    category?: string;
    command?: string;
    cwd?: string;
    file?: string;
    project?: string;
    prompt_preview?: string;
    source?: string;
    success?: boolean;
    timestamp?: number;
    tool?: string;
  }

  interface Notification {
    data: NotificationData;
    id: number;
    message: string;
    status: string;
    timestamp: number;
    title: string;
    type: string;
  }

  interface Config {
    apiKey?: string;
    deviceToken?: string;
    lastUpdated?: number;
  }

  let notifications = $state<Notification[]>([]);
  let loading = $state(false);
  let config = $state<Config | null>(null);
  let systemStatus = $state<'degraded' | 'error' | 'healthy' | 'unknown'>('unknown');
  let lastUpdate = $state<Date | null>(null);

  // Mock notification data - in real app this would come from API
  const mockNotifications: Notification[] = [
    {
      data: { file: 'config.js', project: 'shooter', tool: 'Edit' },
      id: 1,
      message: '09:42:15 • Starting code edit in shooter',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 2, // 2 minutes ago
      title: '🔧 SHOOTER: Editing config.js',
      type: 'tool_start',
    },
    {
      data: { file: 'config.js', success: true, tool: 'Edit' },
      id: 2,
      message: '09:42:18 • config.js updated successfully',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 2 + 3000, // 2 minutes ago + 3 seconds
      title: '✅ SHOOTER: Edit Complete',
      type: 'tool_complete',
    },
    {
      data: { category: 'feature', prompt_preview: 'Create notification system UI' },
      id: 3,
      message: '09:45:33 • Working on: Create notification system UI',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      title: '🚀 SHOOTER: New Feature',
      type: 'user_prompt',
    },
    {
      data: { command: 'npm run build', tool: 'Bash' },
      id: 4,
      message: '09:46:12 • Executing: npm run build',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 30, // 30 seconds ago
      title: '⚡ SHOOTER: Running Command',
      type: 'tool_start',
    },
    {
      data: { cwd: '/Users/user/shooter', project: 'shooter' },
      id: 5,
      message: '09:40:00 • SHOOTER session active in project',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 8, // 8 minutes ago
      title: '🎯 SHOOTER: Session Started',
      type: 'session_start',
    },
  ];

  $effect(() => {
    loadConfiguration();
    loadNotifications();
    void checkSystemStatus();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      loadNotifications();
      void checkSystemStatus();
    }, 10000);

    return () => { clearInterval(interval); };
  });

  function loadConfiguration(): void {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        config = JSON.parse(saved) as Config;
      }
    } catch {
      console.log('No configuration found');
    }
  }

  function loadNotifications(): void {
    // In real app, this would fetch from API
    // For now, use mock data sorted by timestamp (newest first)
    notifications = [...mockNotifications].sort((a, b) => b.timestamp - a.timestamp);
    lastUpdate = new Date();
  }

  async function checkSystemStatus(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();

      if (response.ok && data.status === 'healthy') {
        systemStatus = 'healthy';
      } else {
        systemStatus = 'degraded';
      }
    } catch {
      systemStatus = 'error';
    }
  }

  async function sendTestNotification(): Promise<void> {
    if (!config?.apiKey) {
      void goto('/config');
      return;
    }

    loading = true;

    try {
      const testPayload: {
        data: NotificationData;
        deviceToken?: string;
        message: string;
        title: string;
      } = {
        data: { source: 'manual-test', timestamp: Date.now() },
        message: `Test notification sent at ${new Date().toLocaleTimeString()}`,
        title: '🧪 SHOOTER: Manual Test',
      };

      if (config.deviceToken) {
        testPayload.deviceToken = config.deviceToken;
      }

      const response = await fetch('/api/notify', {
        body: JSON.stringify(testPayload),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (response.ok) {
        // Add the test notification to the list
        const newNotification: Notification = {
          data: testPayload.data,
          id: Date.now(),
          message: testPayload.message,
          status: 'sent',
          timestamp: Date.now(),
          title: testPayload.title,
          type: 'manual_test',
        };

        notifications = [newNotification, ...notifications];
      }
    } catch (error) {
      console.error('Test notification failed:', error);
    }

    loading = false;
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 1000 * 60) {
      return 'Just now';
    } else if (diff < 1000 * 60 * 60) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    } else if (diff < 1000 * 60 * 60 * 24) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      return `${hours}h ago`;
    } else {
      return new Date(timestamp).toLocaleDateString();
    }
  }

  function getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      error: '❌',
      manual_test: '🧪',
      session_end: '👋',
      session_start: '🎯',
      tool_complete: '✅',
      tool_start: '🛠️',
      user_prompt: '💭',
    };
    return icons[type] || '📱';
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      delivered: 'var(--accent-green)',
      failed: 'var(--accent-red)',
      pending: 'var(--accent-orange)',
      sent: 'var(--accent-blue)',
    };
    return colors[status] || 'var(--text-tertiary)';
  }
</script>

<svelte:head>
  <title>SHOOTER Notifications</title>
  <meta name="description" content="Live notifications from your SHOOTER development system" />
</svelte:head>

<div class="app">
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <span class="logo-icon">🎯</span>
        <div class="logo-text">
          <h1>SHOOTER</h1>
          <p>Live Notifications</p>
        </div>
      </div>

      <div class="header-actions">
        <div class="status-indicator {systemStatus}">
          {#if systemStatus === 'healthy'}
            <span class="status-dot success"></span>
            <span>Online</span>
          {:else if systemStatus === 'degraded'}
            <span class="status-dot warning"></span>
            <span>Degraded</span>
          {:else if systemStatus === 'error'}
            <span class="status-dot error"></span>
            <span>Offline</span>
          {:else}
            <span class="status-dot"></span>
            <span>Checking...</span>
          {/if}
        </div>

        <button class="config-btn" onclick={() => void goto('/config')}>
          <span>⚙️</span>
          <span>Config</span>
        </button>
      </div>
    </div>
  </header>

  <main class="main">
    <div class="notifications-header">
      <div class="notifications-title">
        <h2>📱 Live Notifications</h2>
        <p>Real-time updates from your SHOOTER development sessions</p>
      </div>

      <div class="notifications-actions">
        <button
          class="btn btn-primary"
          onclick={sendTestNotification}
          disabled={loading || !config?.apiKey}
        >
          {#if loading}
            <div class="btn-spinner"></div>
            Sending...
          {:else}
            🧪 Send Test
          {/if}
        </button>

        <button class="btn btn-secondary" onclick={loadNotifications} disabled={loading}>
          🔄 Refresh
        </button>
      </div>
    </div>

    {#if !config?.apiKey}
      <div class="empty-state">
        <div class="empty-icon">⚙️</div>
        <h3>Configuration Required</h3>
        <p>Set up your API credentials to start receiving notifications</p>
        <button class="btn btn-primary" onclick={() => void goto('/config')}> Configure Now </button>
      </div>
    {:else if notifications.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📱</div>
        <h3>No Notifications Yet</h3>
        <p>Notifications from SHOOTER will appear here when development events occur</p>
        <button class="btn btn-secondary" onclick={sendTestNotification} disabled={loading}>
          {#if loading}
            <div class="btn-spinner"></div>
            Sending...
          {:else}
            Send Test Notification
          {/if}
        </button>
      </div>
    {:else}
      <div class="notifications-list">
        {#each notifications as notification (notification.id)}
          <div class="notification-card">
            <div class="notification-header">
              <div class="notification-icon">
                {getNotificationIcon(notification.type)}
              </div>
              <div class="notification-title">
                <h4>{notification.title}</h4>
                <div class="notification-meta">
                  <span class="notification-time">{formatTime(notification.timestamp)}</span>
                  <span class="notification-relative"
                    >{formatRelativeTime(notification.timestamp)}</span
                  >
                  <div
                    class="notification-status"
                    style="color: {getStatusColor(notification.status)}"
                  >
                    {notification.status}
                  </div>
                </div>
              </div>
            </div>

            <div class="notification-body">
              <p>{notification.message}</p>

              {#if notification.data}
                <div class="notification-data">
                  {#if notification.data.file}
                    <span class="data-tag">📄 {notification.data.file}</span>
                  {/if}
                  {#if notification.data.tool}
                    <span class="data-tag">🛠️ {notification.data.tool}</span>
                  {/if}
                  {#if notification.data.project}
                    <span class="data-tag">📁 {notification.data.project}</span>
                  {/if}
                  {#if notification.data.category}
                    <span class="data-tag category-{notification.data.category}">
                      {notification.data.category}
                    </span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if lastUpdate}
      <div class="last-update">
        <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
      </div>
    {/if}
  </main>
</div>

<style>
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-quaternary);
  }

  .status-dot.success {
    background: var(--accent-green);
  }
  .status-dot.warning {
    background: var(--accent-orange);
  }
  .status-dot.error {
    background: var(--accent-red);
  }

  .config-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-btn:hover {
    background: var(--bg-elevated);
    transform: translateY(-1px);
  }

  .notifications-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-xl);
    gap: var(--spacing-lg);
  }

  .notifications-title h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    color: var(--text-primary);
  }

  .notifications-title p {
    margin: var(--spacing-xs) 0 0 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .notifications-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent-blue);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-blue-hover);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-elevated);
    transform: translateY(-1px);
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl) var(--spacing-lg);
    margin: var(--spacing-xl) 0;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--spacing-lg);
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--text-primary);
    font-size: var(--font-size-lg);
  }

  .empty-state p {
    margin: 0 0 var(--spacing-lg) 0;
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }

  .notifications-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .notification-card {
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-sm);
    transition: all 0.2s ease;
  }

  .notification-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .notification-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .notification-icon {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
  }

  .notification-title {
    flex: 1;
    min-width: 0;
  }

  .notification-title h4 {
    margin: 0 0 var(--spacing-xs) 0;
    color: var(--text-primary);
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  .notification-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-xs);
  }

  .notification-time {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .notification-relative {
    color: var(--text-tertiary);
  }

  .notification-status {
    font-weight: 500;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
  }

  .notification-body p {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .notification-data {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .data-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--spacing-xs);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 10px;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  .data-tag.category-debug {
    background: rgba(255, 69, 58, 0.1);
    border-color: var(--accent-red);
    color: var(--accent-red);
  }

  .data-tag.category-feature {
    background: rgba(48, 209, 88, 0.1);
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  .data-tag.category-testing {
    background: rgba(255, 159, 10, 0.1);
    border-color: var(--accent-orange);
    color: var(--accent-orange);
  }

  .last-update {
    text-align: center;
    margin-top: var(--spacing-xl);
    padding: var(--spacing-md);
    color: var(--text-tertiary);
    font-size: var(--font-size-xs);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .notifications-header {
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .notifications-actions {
      align-self: stretch;
    }

    .btn {
      flex: 1;
    }

    .notification-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xs);
    }
  }
</style>
