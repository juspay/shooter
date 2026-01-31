<!--
  DeliveryStatus - Notification delivery status indicator with real-time updates
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { NotificationAPIResponse } from '$types';
  
  export let delivery: NotificationAPIResponse;
  export let showDetails = false;
  export let compact = false;
  export let showRetry = true;
  
  const dispatch = createEventDispatcher<{
    retry: { delivery: NotificationAPIResponse };
    details: { delivery: NotificationAPIResponse };
    dismiss: { delivery: NotificationAPIResponse };
  }>();
  
  function handleRetry() {
    dispatch('retry', { delivery });
  }
  
  function handleDetails() {
    dispatch('details', { delivery });
  }
  
  function handleDismiss() {
    dispatch('dismiss', { delivery });
  }
  
  $: status = delivery.success ? 'delivered' : 'failed';
  $: statusIcon = getStatusIcon(status);
  $: statusText = getStatusText(status, delivery);
  $: deliveryTime = new Date(delivery.timestamp || Date.now());
  $: relativeTime = getRelativeTime(deliveryTime);
  $: hasError = !delivery.success && delivery.error;
  
  function getStatusIcon(status: string): string {
    switch (status) {
      case 'delivered': return '✅';
      case 'failed': return '❌';
      case 'pending': return '⏳';
      case 'filtered': return '🔍';
      default: return '❓';
    }
  }
  
  function getStatusText(status: string, delivery: NotificationAPIResponse): string {
    if (status === 'delivered') {
      return delivery.messageId ? `Delivered (${delivery.messageId.slice(-8)})` : 'Delivered';
    }
    
    if (status === 'failed') {
      return delivery.error || 'Delivery failed';
    }
    
    return 'Unknown status';
  }
  
  function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffSecs < 30) {
return 'Just now';
}
    if (diffSecs < 60) {
return `${diffSecs}s ago`;
}
    if (diffMins < 60) {
return `${diffMins}m ago`;
}
    if (diffHours < 24) {
return `${diffHours}h ago`;
}
    
    return date.toLocaleDateString();
  }
  
  $: deliveryInfo = parseDeliveryInfo(delivery);
  
  function parseDeliveryInfo(delivery: NotificationAPIResponse) {
    const info: Record<string, unknown> = {};
    
    if (delivery.messageId) {
      info['Message ID'] = delivery.messageId;
    }
    
    if (delivery.data?.deviceToken) {
      info['Device'] = delivery.data.deviceToken.slice(-8);
    }
    
    if (delivery.data?.priority) {
      info['Priority'] = delivery.data.priority;
    }
    
    if (delivery.data?.category) {
      info['Category'] = delivery.data.category;
    }
    
    return info;
  }
</script>

<div 
  class="delivery-status"
  class:compact
  class:expandable={showDetails}
  class:has-error={hasError}
  class:status-success={status === 'delivered'}
  class:status-error={status === 'failed'}
  class:status-warning={status === 'pending'}
  class:status-info={status === 'filtered'}
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="status-main"
    role={showDetails ? 'button' : 'status'}
    tabindex={showDetails ? 0 : undefined}
    on:click={showDetails ? handleDetails : undefined}
    on:keydown={(e) => showDetails && e.key === 'Enter' && handleDetails()}
  >
    <div class="status-indicator">
      <span class="status-icon">{statusIcon}</span>
      <div class="status-info">
        <div class="status-text">{statusText}</div>
        <div class="status-time">{relativeTime}</div>
      </div>
    </div>
    
    {#if !compact}
      <div class="status-actions">
        {#if showRetry && status === 'failed'}
          <button 
            class="action-btn retry-btn" 
            on:click|stopPropagation={handleRetry}
            title="Retry delivery"
          >
            <span>🔄</span>
          </button>
        {/if}
        
        {#if showDetails}
          <button 
            class="action-btn details-btn" 
            on:click|stopPropagation={handleDetails}
            title="Show details"
          >
            <span>ℹ️</span>
          </button>
        {/if}
        
        <button 
          class="action-btn dismiss-btn" 
          on:click|stopPropagation={handleDismiss}
          title="Dismiss"
        >
          <span>✕</span>
        </button>
      </div>
    {/if}
  </div>
  
  {#if showDetails && Object.keys(deliveryInfo).length > 0}
    <div class="status-details">
      <div class="details-header">
        <h3>Delivery Details</h3>
        <div class="details-timestamp">
          {deliveryTime.toLocaleString()}
        </div>
      </div>
      
      <div class="details-content">
        {#each Object.entries(deliveryInfo) as [key, value]}
          <div class="detail-row">
            <span class="detail-label">{key}:</span>
            <span class="detail-value">{value}</span>
          </div>
        {/each}
        
        {#if hasError}
          <div class="error-section">
            <div class="error-label">Error Details:</div>
            <div class="error-message">{delivery.error}</div>
          </div>
        {/if}
        
        {#if delivery.data}
          <div class="data-section">
            <div class="data-label">Additional Data:</div>
            <pre class="data-content">{JSON.stringify(delivery.data, null, 2)}</pre>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .delivery-status {
    background: var(--bg-color-secondary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    overflow: hidden;
  }

  .delivery-status.expandable {
    cursor: pointer;
  }

  .delivery-status.expandable:hover {
    border-color: var(--text-color-placeholder);
    background: var(--bg-color-tertiary);
  }

  .delivery-status.compact {
    border-radius: var(--radius-sm);
  }

  .delivery-status.has-error {
    border-left: 3px solid var(--status-color-error-hover);
  }
  
  .status-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    gap: var(--spacing-sm);
  }
  
  .delivery-status.compact .status-main {
    padding: var(--spacing-xs) var(--spacing-sm);
  }
  
  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex: 1;
    min-width: 0;
  }
  
  .status-icon {

    flex-shrink: 0;
  }
  
  .status-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  
  .status-text {

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }
  
  .action-btn {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    transition: all 0.2s ease;

  }

  .action-btn:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }

  .retry-btn:hover {
    background: var(--status-color-warning-alt);
    border-color: var(--status-color-warning-alt);
  }

  .details-btn:hover {
    background: var(--status-color-info-hover);
    border-color: var(--status-color-info-hover);
  }

  .dismiss-btn:hover {
    background: var(--status-color-error-hover);
    border-color: var(--status-color-error-hover);
  }
  
  .status-details {
    border-top: 1px solid var(--bg-color-elevated);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-color-primary);
  }
  
  .details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .details-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .detail-row {
    display: flex;
    gap: 8px;

  }
  
  .detail-label {

    min-width: 80px;
    flex-shrink: 0;
  }
  
  .detail-value {
    word-break: break-word;

  }
  
  .error-section,
  .data-section {
    margin-top: 8px;
    padding: var(--spacing-xs);
    background: var(--bg-color-tertiary);
    border-radius: var(--radius-sm);
  }
  
  .error-label,
  .data-label {

    margin-bottom: 4px;
  }
  
  .error-message {


    word-break: break-word;
  }
  
  .data-content {

    background: var(--bg-color-primary);
    padding: var(--spacing-xs);
    border-radius: var(--radius-xs);
    overflow-x: auto;
    margin: 0;
    border: 1px solid var(--bg-color-elevated);
  }
  
  /* Status color variants */
  .status-success .status-icon {
    color: var(--status-color-success);
  }

  .status-error .status-icon {
    color: var(--status-color-error);
  }

  .status-warning .status-icon {
    color: var(--status-color-warning);
  }

  .status-info .status-icon {
    color: var(--accent-color-primary);
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    .status-main {
      padding: var(--spacing-sm) var(--spacing-sm);
    }
    
    .delivery-status.compact .status-main {
      padding: var(--spacing-xxs) var(--spacing-sm);
    }

    .action-btn {
      width: 20px;
      height: 20px;

    }
    
    .status-details {
      padding: var(--spacing-sm) var(--spacing-sm);
    }
    
    .detail-label {
      min-width: 70px;

    }
  }

  @media (max-width: 480px) {
    .details-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
    
    .detail-row {
      flex-direction: column;
      gap: 2px;
    }
    
    .detail-label {
      min-width: auto;
    }
    
    .data-content {

      padding: var(--spacing-xxs);
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .delivery-status {
      border-width: 2px;
    }
    
    .status-success .status-icon {
      color: var(--status-color-success);
    }

    .status-error .status-icon {
      color: var(--status-color-error);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .delivery-status {
      transition: none;
    }
  }
</style>
