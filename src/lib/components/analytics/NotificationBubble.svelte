<!--
  NotificationBubble - Visual notification indicator with animation
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { NotificationSession } from '$lib/data/data-service';
  
  export let notification: NotificationSession;
  export let autoHide = true;
  export let duration = 5000;
  export let position: 'top' | 'bottom' = 'top';
  export let variant: 'default' | 'compact' | 'expanded' = 'default';
  export let showActions = true;
  
  const dispatch = createEventDispatcher<{
    click: { notification: NotificationSession };
    dismiss: { notification: NotificationSession };
    action: { action: string; notification: NotificationSession };
    expired: { notification: NotificationSession };
  }>();
  
  let visible = false;
  let timeoutId: ReturnType<typeof setTimeout>;
  let progressWidth = 100;
  let progressInterval: ReturnType<typeof setInterval>;
  
  onMount(() => {
    // Trigger entrance animation
    setTimeout(() => {
      visible = true;
    }, 100);
    
    // Auto-hide timer
    if (autoHide && duration > 0) {
      startAutoHide();
    }
    
    return () => {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
    };
  });
  
  function startAutoHide() {
    const startTime = Date.now();
    const updateInterval = 50; // Update every 50ms for smooth progress
    
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      progressWidth = (remaining / duration) * 100;
      
      if (remaining === 0) {
        clearInterval(progressInterval);
      }
    }, updateInterval);
    
    timeoutId = setTimeout(() => {
      handleExpired();
    }, duration);
  }
  
  function handleClick() {
    dispatch('click', { notification });
  }
  
  function handleDismiss() {
    visible = false;
    clearTimeout(timeoutId);
    clearInterval(progressInterval);
    setTimeout(() => {
      dispatch('dismiss', { notification });
    }, 300);
  }
  
  function handleExpired() {
    visible = false;
    setTimeout(() => {
      dispatch('expired', { notification });
    }, 300);
  }
  
  function handleAction(action: string) {
    dispatch('action', { action, notification });
  }
  
  $: statusClass = getStatusClass(notification.status);
  $: typeIcon = getTypeIcon(notification.type);
  $: priorityClass = getPriorityClass(notification.metadata?.priority);
  $: isUrgent = notification.metadata?.isUrgent || false;
  $: hasCode = notification.metadata?.hasCodeBlocks || false;
  $: hasErrors = notification.metadata?.hasErrors || false;

  function getStatusClass(status: string): string {
    switch (status) {
      case 'sent': return 'status-sent';
      case 'failed': return 'status-failed';
      case 'filtered': return 'status-filtered';
      case 'pending': return 'status-pending';
      default: return 'status-default';
    }
  }
  
  function getTypeIcon(type: string): string {
    switch (type) {
      case 'debug': return '🐛';
      case 'feature': return '⭐';
      case 'testing': return '🧪';
      case 'learning': return '📚';
      case 'error': return '❌';
      default: return '💬';
    }
  }
  
  function getPriorityClass(priority: string | undefined): string {
    switch (priority) {
      case 'urgent': return 'priority-urgent';
      case 'high': return 'priority-high';
      case 'normal': return 'priority-normal';
      case 'low': return 'priority-low';
      default: return '';
    }
  }
  
  $: formattedTime = new Date(notification.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
</script>

<div
  class="notification-bubble"
  class:visible
  class:compact={variant === 'compact'}
  class:expanded={variant === 'expanded'}
  class:urgent={isUrgent}
  class:has-code={hasCode}
  class:has-errors={hasErrors}
  class:position-top={position === 'top'}
  class:position-bottom={position === 'bottom'}
  class:priority-urgent={priorityClass === 'priority-urgent'}
  class:priority-high={priorityClass === 'priority-high'}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
  aria-live="polite"
>
  {#if autoHide && duration > 0}
    <div class="progress-bar" style="width: {progressWidth}%"></div>
  {/if}
  
  <div class="notification-content">
    <div class="notification-header">
      <div class="notification-meta">
        <span class="type-icon">{typeIcon}</span>
        <span class="notification-type">{notification.type}</span>
        <span class="status-indicator {statusClass}"></span>
        <span class="notification-time">{formattedTime}</span>
      </div>
      
      {#if showActions}
        <button 
          class="dismiss-btn" 
          on:click|stopPropagation={handleDismiss}
          title="Dismiss notification"
        >
          ✕
        </button>
      {/if}
    </div>
    
    <div class="notification-body">
      <h3 class="notification-title">{notification.title}</h3>
      
      {#if variant !== 'compact'}
        <p class="notification-description">{notification.description}</p>
      {/if}
      
      {#if variant === 'expanded' && notification.metadata}
        <div class="notification-details">
          {#if notification.metadata.messageCount}
            <div class="detail-item">
              <span class="detail-icon">💬</span>
              <span class="detail-text">{notification.metadata.messageCount} messages</span>
            </div>
          {/if}
          
          {#if notification.metadata.conversationDuration}
            <div class="detail-item">
              <span class="detail-icon">⏱️</span>
              <span class="detail-text">{notification.metadata.conversationDuration} min</span>
            </div>
          {/if}
          
          {#if hasCode}
            <div class="detail-item">
              <span class="detail-icon">💻</span>
              <span class="detail-text">Contains code</span>
            </div>
          {/if}
          
          {#if hasErrors}
            <div class="detail-item">
              <span class="detail-icon">⚠️</span>
              <span class="detail-text">Has errors</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    
    {#if showActions && variant === 'expanded'}
      <div class="notification-actions">
        <button 
          class="action-btn secondary" 
          on:click|stopPropagation={() => handleAction('view')}
        >
          View
        </button>
        
        <button 
          class="action-btn primary" 
          on:click|stopPropagation={() => handleAction('open')}
        >
          Open
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .notification-bubble {
    background: var(--bg-color-secondary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateY(20px);
    opacity: 0;
    position: relative;
    overflow: hidden;
    max-width: 400px;
    margin-bottom: var(--spacing-sm);
  }

  .notification-bubble.visible {
    transform: translateY(0);
    opacity: 1;
  }

  .notification-bubble:hover {
    border-color: var(--status-color-warning);
    transform: translateY(-2px);
    box-shadow: var(--shadow-xl);
  }

  .notification-bubble.urgent {
    border-color: var(--status-color-error-hover);
    background: var(--bg-color-error-subtle);
    animation: urgentPulse 2s ease-in-out infinite;
  }

  @keyframes urgentPulse {
    0%, 100% {
      box-shadow: var(--shadow-lg);
    }
    50% {
      box-shadow: var(--shadow-error);
    }
  }

  .notification-bubble.has-code {
    border-left: 4px solid var(--status-color-warning);
  }

  .notification-bubble.has-errors {
    border-left: 4px solid var(--status-color-error-hover);
  }

  .notification-bubble.priority-urgent {
    border-color: var(--status-color-error-hover);
  }

  .notification-bubble.priority-high {
    border-color: var(--status-color-warning-alt);
  }
  
  .notification-bubble.compact {
    max-width: 300px;
  }
  
  .notification-bubble.expanded {
    max-width: 500px;
  }
  
  .progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--status-color-warning);
    transition: width 0.05s linear;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  
  .notification-content {
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .notification-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xs);
  }
  
  .notification-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);

  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-indicator.status-sent {
    background: var(--status-color-success);
  }

  .status-indicator.status-failed {
    background: var(--status-color-error);
  }

  .status-indicator.status-filtered {
    background: var(--status-color-warning-alt);
  }

  .status-indicator.status-pending {
    background: var(--text-color-muted);
  }

  .status-indicator.status-default {
    background: var(--text-color-muted);
  }

  .dismiss-btn {
    background: none;
    border: none;
    cursor: pointer;

    padding: var(--spacing-xxs);
    border-radius: var(--radius-xs);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }
  
  .dismiss-btn:hover {
    background: var(--bg-color-tertiary);
  }
  
  .notification-body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .notification-title {
    margin: 0;


  }
  
  .notification-description {
    margin: 0;


    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .notification-details {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xxs);
  }
  
  .detail-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);

    background: var(--bg-color-tertiary);
    padding: var(--spacing-xxxs) var(--spacing-xxs);
    border-radius: var(--radius-md);
  }

  .detail-text {
    white-space: nowrap;
  }
  
  .notification-actions {
    display: flex;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xxs);
  }
  
  .action-btn {
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    cursor: pointer;

    padding: var(--spacing-xxs) var(--spacing-sm);
    transition: all 0.2s ease;
    flex: 1;
  }

  .action-btn.primary {
    background: var(--status-color-warning);
    border-color: var(--status-color-warning);
  }

  .action-btn.primary:hover {
    background: var(--status-color-warning-hover);
    border-color: var(--status-color-warning-hover);
  }

  .action-btn.secondary {
    background: var(--bg-color-tertiary);
  }

  .action-btn.secondary:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }
  
  /* Position variants */
  .notification-bubble.position-top {
    transform: translateY(-20px);
  }
  
  .notification-bubble.position-top.visible {
    transform: translateY(0);
  }
  
  .notification-bubble.position-bottom {
    transform: translateY(20px);
  }
  
  .notification-bubble.position-bottom.visible {
    transform: translateY(0);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .notification-bubble {
      max-width: calc(100vw - 32px);
      margin: 0 var(--spacing-md) var(--spacing-sm);
    }
    
    .notification-content {
      padding: var(--spacing-sm);
    }

    .notification-description {

      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .action-btn {
      padding: var(--spacing-xxs) var(--spacing-sm);

    }
  }
  
  @media (max-width: 480px) {
    .notification-bubble.compact,
    .notification-bubble.expanded {
      max-width: calc(100vw - 24px);
      margin: 0 var(--spacing-sm) var(--spacing-xs);
    }

    .notification-content {
      padding: var(--spacing-sm);
      gap: var(--spacing-xs);
    }
    
    .notification-details {
      gap: var(--spacing-xs);
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .notification-bubble {
      border-width: 2px;
    }

    .notification-bubble.urgent {
      border-color: var(--status-color-error-active);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .notification-bubble {
      transition: opacity 0.2s ease;
    }
    
    .notification-bubble.urgent {
      animation: none;
    }
    
    .notification-bubble:hover {
      transform: none;
    }
  }
</style>