<!--
  ChatHeader - Analytics dashboard header with stats and title
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let title = 'Shooter Analytics';
  export let conversationCount = 0;
  export let isConnected = false;
  export let lastUpdate: Date | null = null;
  
  const dispatch = createEventDispatcher<{
    refresh: void;
    settings: void;
  }>();
  
  function handleRefresh() {
    dispatch('refresh');
  }
  
  function handleSettings() {
    dispatch('settings');
  }
  
  $: statusText = isConnected ? '🔥 Connected' : '⚠️ Disconnected';
  $: formattedTime = lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--';
</script>

<header class="chat-header">
  <div class="chat-title">
    <span class="title-icon">🔥</span>
    <span class="title-text">{title}</span>
  </div>
  
  <div class="header-stats">
    <div class="stat-item">
      <span class="stat-label">📊</span>
      <span class="stat-value">{conversationCount}</span>
      <span class="stat-text">conversations</span>
    </div>
    
    <div class="stat-item">
      <span class="stat-label">🕒</span>
      <span class="stat-value">{formattedTime}</span>
    </div>
    
    <div class="stat-item status" class:connected={isConnected} class:disconnected={!isConnected}>
      <span class="status-text">{statusText}</span>
    </div>
  </div>
  
  <div class="header-actions">
    <button class="action-btn" on:click={handleRefresh} title="Refresh">
      <span>🔄</span>
    </button>
    
    <button class="action-btn" on:click={handleSettings} title="Settings">
      <span>⚙️</span>
    </button>
  </div>
</header>

<style>
  .chat-header {
    background: var(--bg-color-secondary);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--bg-color-elevated);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    min-height: 64px;
  }
  
  .chat-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  
  .title-icon {
    font-size: var(--font-size-lg);
  }

  .title-text {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    white-space: nowrap;
  }
  
  .header-stats {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    justify-content: center;
    min-width: 0;
  }
  
  .stat-item {
    display: flex;
    align-items: center;
    gap: 4px;

    white-space: nowrap;
  }
  
  .stat-label {
    font-size: var(--font-size-md);
  }

  .stat-value {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
  }

  .stat-text {
    font-size: var(--font-size-xs);
    color: var(--text-color-secondary);
  }
  
  .status {
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: var(--radius-lg);

    border: 1px solid;
  }

  .status.connected {
    background: var(--status-color-success-light);
    border-color: var(--status-color-success);
  }

  .status.disconnected {
    background: var(--status-color-error-light);
    border-color: var(--status-color-error);
  }

  .status-text {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--text-color-primary);
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  
  .action-btn {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }
  
  .action-btn:active {
    transform: scale(0.95);
  }
  
  .action-btn span {
    font-size: var(--font-size-md);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .chat-header {
      padding: var(--spacing-sm) var(--spacing-md);
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
    
    .chat-title {
      justify-content: center;
    }
    
    .header-stats {
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .stat-item {
      flex: 1;
      justify-content: center;
      min-width: 80px;
    }
    
    .header-actions {
      justify-content: center;
    }
  }
  
  @media (max-width: 480px) {
    .title-text {
      font-size: var(--font-size-sm);
    }

    .stat-item {
      font-size: var(--font-size-xs);
      min-width: 60px;
    }

    .stat-value {
      font-size: var(--font-size-xs);
    }
  }
</style>