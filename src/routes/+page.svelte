<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import InteractiveNotificationSender from '$lib/components/InteractiveNotificationSender.svelte';
  import InteractiveNotificationCard from '$lib/components/InteractiveNotificationCard.svelte';
  import { config as configStore } from '$lib/stores/config';

  export let data: PageData;

  interface NotificationItem {
    id: number | string;
    title: string;
    message: string;
    timestamp: number;
    type?: string;
    status?: string;
    data?: Record<string, unknown>;
    success?: boolean;
    sent?: number;
    failed?: number;
  }

  interface ConfigData {
    hasApiKey?: boolean;
    hasApnsKeyId?: boolean;
    hasApnsTeamId?: boolean;
    hasApnsKey?: boolean;
    hasDeviceToken?: boolean;
    apiKey: string;
    deviceToken?: string;
    [key: string]: unknown;
  }

  let notifications: NotificationItem[] = [];
  let loading = false;
  let config: ConfigData | null = null;
  let systemStatus: string = 'unknown';
  let lastUpdate: number | null = null;

  // Initialize notifications from server data
  $: if (data?.notifications) {
    notifications = data.notifications.sort((a: NotificationItem, b: NotificationItem) => b.timestamp - a.timestamp);
  }

  onMount(() => {
    loadConfiguration();
    loadNotifications();
    checkSystemStatus();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      loadNotifications();
      checkSystemStatus();
    }, 10000);

    return () => clearInterval(interval);
  });

  function loadConfiguration() {
    if (!browser) {
return;
}
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        config = JSON.parse(saved);
        // Update the config store as well
        if (config) {
          configStore.set(config);
        }
      }
    } catch (_e) {
      console.log('No configuration found');
    }
  }

  async function loadNotifications() {
    // Load from server-side rendered data first
    if (data?.notifications) {
      notifications = data.notifications.sort((a: NotificationItem, b: NotificationItem) => b.timestamp - a.timestamp);
      lastUpdate = Date.now();
    }

    // Refresh from server if in browser
    if (browser) {
      await invalidateAll();
    }
  }

  async function checkSystemStatus() {
    if (!browser) {
return;
}
    try {
      const response = await fetch('/health');
      const data = await response.json();

      if (response.ok && data.status === 'healthy') {
        systemStatus = 'healthy';
      } else {
        systemStatus = 'degraded';
      }
    } catch (_error) {
      systemStatus = 'error';
    }
  }

  async function sendTestNotification() {
    if (!browser) {
return;
}
    if (!config?.apiKey) {
      goto('/config');
      return;
    }

    loading = true;

    try {
      const testPayload: {
        title: string;
        message: string;
        data: { source: string; timestamp: number };
        deviceToken?: string;
      } = {
        title: '🧪 SHOOTER: Manual Test',
        message: `Test notification sent at ${new Date().toLocaleTimeString()}`,
        data: { source: 'manual-test', timestamp: Date.now() }
      };

      if (config.deviceToken) {
        testPayload.deviceToken = config.deviceToken;
      }

      const response = await fetch('/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        // Add the test notification to the list
        const newNotification = {
          id: Date.now(),
          title: testPayload.title,
          message: testPayload.message,
          timestamp: Date.now(),
          type: 'manual_test',
          status: 'sent',
          data: testPayload.data
        };

        notifications = [newNotification, ...notifications];
      }
    } catch (error) {
      console.error('Test notification failed:', error);
    }

    loading = false;
  }

  function _formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function _formatRelativeTime(timestamp: number): string {
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

  function _getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      tool_start: '🛠️',
      tool_complete: '✅',
      user_prompt: '💭',
      session_start: '🎯',
      session_end: '👋',
      manual_test: '🧪',
      error: '❌'
    };
    return icons[type] || '📱';
  }

  function _getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      delivered: 'var(--accent-green)',
      sent: 'var(--accent-blue)',
      pending: 'var(--accent-orange)',
      failed: 'var(--accent-red)'
    };
    return colors[status] || 'var(--text-tertiary)';
  }
</script>

<svelte:head>
  <title>SHOOTER Notifications</title>
  <meta name="description" content="Live notifications from your SHOOTER development system" />
</svelte:head>

<div class="app">
  <header class="global-header">
    <div class="global-header-content">
      <div class="logo">
        <img src="/favicon-32x32.png" alt="SHOOTER" class="logo-icon" />
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

        <button class="config-btn" on:click={() => goto('/config')}>
          <span>⚙️</span>
          <span>Config</span>
        </button>
      </div>
    </div>
  </header>

  <main class="main">
    {#if config?.apiKey}
      <div class="notifications-header">
        <div class="notifications-title">
          <h2>📱 Live Notifications</h2>
          <p>Real-time updates from your SHOOTER development sessions</p>
        </div>

        <div class="notifications-actions">
          <button
            class="btn btn-primary"
            on:click={sendTestNotification}
            disabled={loading}
          >
            {#if loading}
              <div class="btn-spinner"></div>
              Sending...
            {:else}
              🧪 Send Test
            {/if}
          </button>

          <button
            class="btn btn-secondary"
            on:click={loadNotifications}
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    {/if}

    <!-- Interactive Notification Sender -->
    {#if config?.apiKey}
      <InteractiveNotificationSender />
    {/if}

    {#if !config?.apiKey}
      <div class="empty-state">
        <div class="empty-icon">⚙️</div>
        <h3>Configuration Required</h3>
        <p>Set up your API credentials to start receiving notifications</p>
        <button class="btn btn-primary" on:click={() => goto('/config')}>
          Configure Now
        </button>
      </div>
    {:else if notifications.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📱</div>
        <h3>No Notifications Yet</h3>
        <p>Notifications from SHOOTER will appear here when development events occur</p>
        <button class="btn btn-secondary" on:click={sendTestNotification} disabled={loading}>
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
          <InteractiveNotificationCard {notification} />
        {/each}
      </div>
    {/if}

    {#if lastUpdate}
      <div class="last-update">
        <span>Last updated: {new Date(lastUpdate).toLocaleTimeString()}</span>
      </div>
    {/if}
  </main>
</div>

<style>
  .logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .logo-icon {
    width: 32px;
    height: 32px;
  }

  .logo-text h1 {
    margin: 0;
  }

  .logo-text p {
    margin: 0;
  }

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

  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-quaternary);
  }

  .status-dot.success { background: var(--accent-green); }
  .status-dot.warning { background: var(--accent-orange); }
  .status-dot.error { background: var(--accent-red); }

  .config-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);

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
    margin-bottom: var(--spacing-lg);
    gap: var(--spacing-md);
  }

  .notifications-title h2 {
    margin: 0;
  }

  .notifications-title p {
    margin: var(--spacing-xs) 0 0 0;
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
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-blue-hover);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
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
    padding: var(--spacing-xxl) var(--spacing-md);
    margin: 0;
  }

  .empty-icon {
    margin-bottom: var(--spacing-md);
    opacity: 0.6;
  }

  .empty-state h3 {
    margin: 0 0 var(--spacing-xs) 0;
  }

  .empty-state p {
    margin: 0 0 var(--spacing-md) 0;
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

    flex-shrink: 0;
  }

  .notification-title {
    flex: 1;
    min-width: 0;
  }

  .notification-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);

  }

  .notification-data {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .data-tag {
    display: inline-flex;
    align-items: center;
    padding: var(--spacing-xxxs) var(--spacing-xs);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  .data-tag.category-debug { 
    background: var(--status-color-error-subtle);
    border-color: var(--accent-red);
  }

  .data-tag.category-feature { 
    background: var(--status-color-success-subtle);
    border-color: var(--accent-green);
  }

  .data-tag.category-testing { 
    background: var(--status-color-warning-subtle);
    border-color: var(--accent-orange);
  }

  .last-update {
    text-align: center;
    margin-top: var(--spacing-lg);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .logo {
      gap: var(--spacing-sm);
    }

    .notifications-header {
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .notifications-actions {
      align-self: stretch;
    }

    .btn {
      flex: 1;
    }

    .empty-state {
      padding: var(--spacing-md) var(--spacing-sm);
    }

    .empty-icon {
      margin-bottom: var(--spacing-sm);
    }

    .last-update {
      margin-top: var(--spacing-md);
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .notification-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xs);
    }
  }
</style>