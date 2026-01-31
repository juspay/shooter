<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  interface NotificationItem {
    title: string;
    message: string;
    timestamp: number | string;
    category: string;
    success: boolean;
  }

  let sendingNotification = false;
  let notificationTitle = '';
  let notificationMessage = '';
  let notificationCategory = 'feature';
  let deviceToken = '';
  let lastNotificationResult = '';
  let recentNotifications: NotificationItem[] = [];

  async function sendTestNotification() {
    if (!notificationTitle || !notificationMessage) {
return;
}
    
    sendingNotification = true;
    try {
      const response = await fetch('/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: notificationTitle,
          message: notificationMessage,
          deviceToken: deviceToken || undefined,
          data: {
            category: notificationCategory,
            source: 'dashboard'
          }
        })
      });
      
      const result = await response.json();
      lastNotificationResult = JSON.stringify(result, null, 2);
      
      if (result.success) {
        notificationTitle = '';
        notificationMessage = '';
        await loadRecentNotifications();
      }
    } catch (error) {
      lastNotificationResult = `Error: ${error}`;
    } finally {
      sendingNotification = false;
    }
  }

  async function loadRecentNotifications() {
    try {
      const response = await fetch('/notifications/history');
      if (response.ok) {
        recentNotifications = await response.json();
      }
    } catch (error) {
      console.error('Failed to load recent notifications:', error);
    }
  }

  onMount(() => {
    loadRecentNotifications();
  });
</script>

<svelte:head>
  <title>Notification Dashboard - SHOOTER</title>
</svelte:head>

<div class="dashboard">
  <div class="dashboard-grid">
    <!-- Send Notification Section -->
    <section class="card send-notification">
      <h2>🚀 Send Test Notification</h2>
      <form on:submit|preventDefault={sendTestNotification}>
        <div class="form-group">
          <label for="title">Title</label>
          <input
            id="title"
            bind:value={notificationTitle}
            type="text"
            placeholder="Notification title"
            required
          />
        </div>

        <div class="form-group">
          <label for="message">Message</label>
          <textarea
            id="message"
            bind:value={notificationMessage}
            placeholder="Notification message"
            rows="3"
            required
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="category">Category</label>
            <select id="category" bind:value={notificationCategory}>
              <option value="debug">🐛 Debug</option>
              <option value="feature">✨ Feature</option>
              <option value="testing">🧪 Testing</option>
              <option value="learning">📚 Learning</option>
              <option value="system">⚙️ System</option>
            </select>
          </div>

          <div class="form-group">
            <label for="device-token">Device Token (optional)</label>
            <input
              id="device-token"
              bind:value={deviceToken}
              type="text"
              placeholder="Override default device"
            />
          </div>
        </div>
        
        <button 
          type="submit" 
          class="btn-primary"
          disabled={sendingNotification || !notificationTitle || !notificationMessage}
        >
          {sendingNotification ? 'Sending...' : '📱 Send Notification'}
        </button>
      </form>
      
      {#if lastNotificationResult}
        <div class="result">
          <h3>Last Result:</h3>
          <pre>{lastNotificationResult}</pre>
        </div>
      {/if}
    </section>

    <!-- Notification Stats -->
    <section class="card stats">
      <h2>📊 Notification Stats</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{recentNotifications.length}</span>
          <span class="stat-label">Recent</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{data.notificationSettings.enabled ? 'ON' : 'OFF'}</span>
          <span class="stat-label">Status</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{data.notificationSettings.categories.length}</span>
          <span class="stat-label">Categories</span>
        </div>
      </div>
    </section>

    <!-- Recent Notifications -->
    <section class="card recent-notifications">
      <h2>📋 Recent Notifications</h2>
      {#if recentNotifications.length > 0}
        <div class="notification-list">
          {#each recentNotifications.slice(0, 5) as notification}
            <div class="notification-item">
              <div class="notification-header">
                <span class="notification-title">{notification.title}</span>
                <span class="notification-time">{new Date(notification.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="notification-message">{notification.message}</div>
              <div class="notification-meta">
                <span class="category-badge {notification.category}">{notification.category}</span>
                <span class="status {notification.success ? 'success' : 'error'}">
                  {notification.success ? '✅ Sent' : '❌ Failed'}
                </span>
              </div>
            </div>
          {/each}
        </div>
        <a href="/notifications/history" class="view-all-link">View All Notifications →</a>
      {:else}
        <div class="empty-state">
          <p>No recent notifications</p>
          <p>Send your first test notification above!</p>
        </div>
      {/if}
    </section>

    <!-- Quick Actions -->
    <section class="card quick-actions">
      <h2>⚡ Quick Actions</h2>
      <div class="action-buttons">
        <a href="/notifications/settings" class="action-btn">
          ⚙️ Settings
        </a>
        <a href="/system-monitoring/health" class="action-btn">
          🔍 System Health
        </a>
        <a href="/integrations/claude" class="action-btn">
          🤖 Claude Code
        </a>
      </div>
    </section>
  </div>
</div>

<style>
  .dashboard {
    padding: 0;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    gap: var(--spacing-lg);
  }

  .send-notification {
    grid-column: 1 / -1;
  }

  .stats {
    grid-row: 2;
  }

  .recent-notifications {
    grid-column: 1 / -1;
    grid-row: 3;
  }

  .quick-actions {
    grid-row: 2;
  }

  .card {
    background: var(--bg-color-elevated);
    border: 1px solid var(--accent-color-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
  }

  .card h2 {
    margin: 0 0 var(--spacing-lg) 0;

  }

  .form-group {
    margin-bottom: var(--spacing-lg);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  label {
    display: block;
    margin-bottom: var(--spacing-xs);

  }

  input, textarea, select {
    width: 100%;
    padding: var(--spacing-sm);
    background: var(--bg-color-primary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);

  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border: 1px solid var(--accent-color-primary);
    box-shadow: var(--shadow-focus);
  }

  .btn-primary {
    background: var(--status-color-info));
    border: none;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-sm);

    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;

  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .result {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--bg-color-primary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);
  }

  .result h3 {
    margin: 0 0 var(--spacing-sm) 0;

  }

  .result pre {
    margin: 0;

    white-space: pre-wrap;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-md);
  }

  .stat-item {
    text-align: center;
    padding: var(--spacing-md);
    background: var(--bg-color-info-subtle);
    border-radius: var(--radius-sm);
  }

  .stat-value {
    display: block;

  }

  .stat-label {
    display: block;

    margin-top: var(--spacing-xxs);
  }

  /* .notification-list spacing handled by child margins */

  .notification-item {
    padding: var(--spacing-md);
    background: var(--bg-color-tertiary);
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-md);
  }

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-xs);
  }

  .notification-message {
    margin-bottom: var(--spacing-xs);

  }

  .notification-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .category-badge {
    padding: var(--spacing-xxs) 0.5rem;
    border-radius: var(--radius-lg);

  }

  .category-badge.debug { background: var(--status-color-error); }
  .category-badge.feature { background: var(--accent-color-primary); }
  .category-badge.testing { background: var(--status-color-warning); }
  .category-badge.learning { background: var(--status-color-success); }
  .category-badge.system { background: var(--bg-color-info-subtle); color: var(--highlight-color-primary); }

  .status.success { color: var(--status-color-success); }
  .status.error { color: var(--status-color-error); }

  .view-all-link {
    display: inline-block;
    margin-top: var(--spacing-md);
    text-decoration: none;

  }

  .view-all-link:hover {
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
  }

  .action-buttons {
    display: grid;
    gap: var(--spacing-sm);
  }

  .action-btn {
    display: block;
    padding: var(--spacing-sm);
    background: var(--bg-color-info-subtle);
    border: 1px solid var(--accent-color-primary);
    border-radius: var(--radius-sm);
    text-decoration: none;
    text-align: center;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-color-elevated);
    border: 1px solid var(--accent-color-primary);
  }

  @media (max-width: 768px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
    
    .send-notification,
    .recent-notifications {
      grid-column: 1;
    }
    
    .form-row {
      grid-template-columns: 1fr;
    }
    
    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
