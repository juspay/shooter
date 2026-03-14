<script lang="ts">
  import type { ShooterConfig } from '$lib/types/config';

  import { goto } from '$app/navigation';
  import { Button, EmptyState, Icon, Tag } from '$lib/modules/client/common';
  import { onMount } from 'svelte';

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

  let notifications = $state<Notification[]>([]);
  let loading = $state(false);
  let config = $state<null | ShooterConfig>(null);
  let lastUpdate = $state<Date | null>(null);

  const mockNotifications: Notification[] = [
    {
      data: { file: 'config.js', project: 'shooter', tool: 'Edit' },
      id: 1,
      message: 'Starting code edit in shooter',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 2,
      title: 'Editing config.js',
      type: 'tool_start',
    },
    {
      data: { file: 'config.js', success: true, tool: 'Edit' },
      id: 2,
      message: 'config.js updated successfully',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 2 + 3000,
      title: 'Edit Complete',
      type: 'tool_complete',
    },
    {
      data: { category: 'feature', prompt_preview: 'Create notification system UI' },
      id: 3,
      message: 'Working on: Create notification system UI',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 5,
      title: 'New Feature Request',
      type: 'user_prompt',
    },
    {
      data: { command: 'npm run build', tool: 'Bash' },
      id: 4,
      message: 'Executing: npm run build',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 30,
      title: 'Running Command',
      type: 'tool_start',
    },
    {
      data: { cwd: '/Users/user/shooter', project: 'shooter' },
      id: 5,
      message: 'Session active in project',
      status: 'delivered',
      timestamp: Date.now() - 1000 * 60 * 8,
      title: 'Session Started',
      type: 'session_start',
    },
  ];

  onMount(() => {
    loadConfiguration();
    loadNotifications();
  });

  function isShooterConfig(value: unknown): value is ShooterConfig {
    return (
      typeof value === 'object' && value !== null && 'apiKey' in value && 'deviceToken' in value
    );
  }

  function loadConfiguration(): void {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isShooterConfig(parsed)) {
          config = parsed;
        } else {
          localStorage.removeItem('shooter_config');
          config = null;
        }
      }
    } catch {
      console.log('No configuration found');
    }
  }

  function loadNotifications(): void {
    notifications = [...mockNotifications].sort((a, b) => b.timestamp - a.timestamp);
    lastUpdate = new Date();
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
        title: 'Manual Test',
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      error: 'Error',
      manual_test: 'Test',
      session_end: 'Session',
      session_start: 'Session',
      tool_complete: 'Complete',
      tool_start: 'Tool',
      user_prompt: 'Prompt',
    };
    return labels[type] || 'Event';
  }

  type TagVariant = '' | 'error' | 'info' | 'success' | 'warning';

  function getStatusClass(status: string): TagVariant {
    const classes: Record<string, TagVariant> = {
      delivered: 'success',
      failed: 'error',
      pending: 'warning',
      sent: 'info',
    };
    return classes[status] || '';
  }

  function getCategoryClass(category: string): TagVariant {
    const classes: Record<string, TagVariant> = {
      debug: 'error',
      feature: 'success',
      testing: 'warning',
    };
    return classes[category] || '';
  }

  function navigateToConfig(): void {
    void goto('/config');
  }
</script>

<svelte:head>
  <title>Notifications - Shooter</title>
  <meta name="description" content="Live notifications from your development system" />
</svelte:head>

<main class="main">
  <div class="page-header">
    <div class="page-header-content">
      <div>
        <h1 class="page-title">Notifications</h1>
        <p class="page-description">Real-time updates from your development sessions</p>
      </div>
      <div class="page-actions">
        <Button variant="secondary" onclick={loadNotifications} disabled={loading}>
          <Icon name="refresh" size={14} />
          Refresh
        </Button>
        <Button
          variant="primary"
          onclick={sendTestNotification}
          disabled={loading || !config?.apiKey}
        >
          {#if loading}
            Sending...
          {:else}
            Send Test
          {/if}
        </Button>
      </div>
    </div>
  </div>

  {#if !config?.apiKey}
    <EmptyState
      icon="settings"
      title="Configuration Required"
      description="Set up your API credentials to start receiving notifications"
    >
      <Button variant="primary" onclick={navigateToConfig}>Configure Settings</Button>
    </EmptyState>
  {:else if notifications.length === 0}
    <EmptyState
      icon="bell"
      title="No Notifications"
      description="Notifications from your development sessions will appear here"
    >
      <Button variant="secondary" onclick={sendTestNotification} disabled={loading}>
        {#if loading}
          Sending...
        {:else}
          Send Test Notification
        {/if}
      </Button>
    </EmptyState>
  {:else}
    <div class="notifications-container">
      <div class="list">
        {#each notifications as notification (notification.id)}
          <div class="list-item notification-row">
            <div class="notification-main">
              <div class="notification-header">
                <span class="notification-title">{notification.title}</span>
                <Tag>{getTypeLabel(notification.type)}</Tag>
              </div>
              <p class="notification-message">{notification.message}</p>
              {#if notification.data}
                <div class="notification-tags">
                  {#if notification.data.file}
                    <Tag icon="file">{notification.data.file}</Tag>
                  {/if}
                  {#if notification.data.tool}
                    <Tag icon="tool">{notification.data.tool}</Tag>
                  {/if}
                  {#if notification.data.project}
                    <Tag icon="folder">{notification.data.project}</Tag>
                  {/if}
                  {#if notification.data.category}
                    <Tag variant={getCategoryClass(notification.data.category)}
                      >{notification.data.category}</Tag
                    >
                  {/if}
                </div>
              {/if}
            </div>
            <div class="notification-meta">
              <span class="notification-time">{formatTime(notification.timestamp)}</span>
              <span class="notification-relative">{formatRelativeTime(notification.timestamp)}</span
              >
              <Tag variant={getStatusClass(notification.status)}>{notification.status}</Tag>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if lastUpdate && notifications.length > 0}
    <div class="last-update">
      Last updated: {lastUpdate.toLocaleTimeString()}
    </div>
  {/if}
</main>

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .page-title {
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: var(--space-1);
  }

  .page-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .page-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .notifications-container {
    animation: fadeIn 0.2s ease;
  }

  .notification-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
  }

  .notification-main {
    flex: 1;
    min-width: 0;
  }

  .notification-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .notification-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .notification-message {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: var(--space-2);
    line-height: var(--leading-relaxed);
  }

  .notification-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .notification-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .notification-time {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .notification-relative {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .last-update {
    text-align: center;
    margin-top: var(--space-6);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  @media (max-width: 768px) {
    .page-header-content {
      flex-direction: column;
      gap: var(--space-4);
    }

    .page-actions {
      width: 100%;
    }

    .page-actions :global(.btn) {
      flex: 1;
    }

    .notification-row {
      flex-direction: column;
      gap: var(--space-3);
    }

    .notification-meta {
      flex-direction: row;
      align-items: center;
      width: 100%;
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .notification-relative {
      margin-left: var(--space-2);
    }

    .notification-meta :global(.tag) {
      margin-left: auto;
    }
  }
</style>
