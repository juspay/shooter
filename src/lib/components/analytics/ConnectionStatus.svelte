<!--
  ConnectionStatus - Real-time connection status indicator
  Extracted from Claude Code mobile template for Shooter
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ConnectionStatus as ConnectionStatusType } from '$lib/realtime/websocket-service';
  
  export let status: ConnectionStatusType;
  export let showDetails = false;
  export let position: 'fixed' | 'relative' = 'fixed';
  export let compact = false;
  
  const dispatch = createEventDispatcher<{
    reconnect: void;
    details: void;
  }>();
  
  function handleReconnect() {
    dispatch('reconnect');
  }
  
  function handleDetails() {
    dispatch('details');
  }
  
  $: isConnected = status.connected;
  $: isConnecting = status.connecting;
  $: isReconnecting = status.reconnecting;
  $: hasError = !!status.error;
  
  $: statusText = getStatusText();
  $: statusIcon = getStatusIcon();
  
  function getStatusText(): string {
    if (isConnected) {
return 'Connected';
}
    if (isReconnecting) {
return `Reconnecting... (${status.reconnectAttempts})`;
}
    if (isConnecting) {
return 'Connecting...';
}
    if (hasError) {
return 'Connection Error';
}
    return 'Disconnected';
  }
  
  function getStatusIcon(): string {
    if (isConnected) {
return '🔥';
}
    if (isReconnecting) {
return '🔄';
}
    if (isConnecting) {
return '⏳';
}
    if (hasError) {
return '❌';
}
    return '⚠️';
  }
  
  $: lastConnectedText = status.lastConnected 
    ? `Last: ${status.lastConnected.toLocaleTimeString()}`
    : 'Never connected';
</script>

<div 
  class="connection-status"
  class:fixed={position === 'fixed'}
  class:relative={position === 'relative'}
  class:compact
  class:with-details={showDetails}
  class:status-connected={isConnected}
  class:status-connecting={isConnecting || isReconnecting}
  class:status-error={hasError}
  class:status-disconnected={!isConnected && !isConnecting && !isReconnecting}
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="status-main"
    role={showDetails ? 'button' : 'status'}
    tabindex={showDetails ? 0 : undefined}
    on:click={showDetails ? handleDetails : undefined}
    on:keydown={(e) => showDetails && e.key === 'Enter' && handleDetails && handleDetails()}
  >
    <span class="status-icon" class:pulse={isConnecting || isReconnecting}>
      {statusIcon}
    </span>
    
    {#if !compact}
      <span class="status-text">{statusText}</span>
    {/if}
  </div>
  
  {#if showDetails}
    <div class="status-details">
      {#if hasError}
        <div class="error-message">
          {status.error}
        </div>
      {/if}
      
      <div class="status-info">
        <div class="info-item">
          <span class="info-label">Status:</span>
          <span class="info-value">{statusText}</span>
        </div>
        
        {#if status.reconnectAttempts > 0}
          <div class="info-item">
            <span class="info-label">Attempts:</span>
            <span class="info-value">{status.reconnectAttempts}</span>
          </div>
        {/if}
        
        <div class="info-item">
          <span class="info-label">{lastConnectedText}</span>
        </div>
      </div>
      
      {#if !isConnected}
        <button class="reconnect-btn" on:click={handleReconnect}>
          <span>🔄</span>
          <span>Reconnect</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .connection-status {
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-2xl);

    border: 1px solid;
    transition: all 0.3s ease;
    user-select: none;
    min-width: 0;
  }
  
  .connection-status.fixed {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
  }
  
  .connection-status.relative {
    position: relative;
  }
  
  .connection-status.compact {
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .connection-status.with-details {
    cursor: pointer;
    flex-direction: column;
    gap: 8px;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-lg);
    min-width: 200px;
  }
  
  .status-main {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    white-space: nowrap;
  }
  
  .status-icon {
    display: inline-block;

    transition: transform 0.2s ease;
  }
  
  .status-icon.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.7;
    }
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 8px;

    opacity: 0.9;
  }
  
  .error-message {
    background: var(--status-color-error-alt-subtle);
    border: 1px solid var(--status-color-error-alt-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xxs) var(--spacing-xs);

    word-break: break-word;
  }
  
  .status-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .info-item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  
  .info-label {
    opacity: 0.7;
  }

  .reconnect-btn {
    background: var(--bg-color-tertiary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xxs) var(--spacing-sm);
    transition: all 0.2s ease;
  }

  .reconnect-btn:hover {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
  }
  
  .reconnect-btn:active {
    transform: scale(0.95);
  }
  
  /* Status color variants */
  .status-connected {
    background: var(--bg-color-success-subtle);
    border-color: var(--status-color-success);
  }

  .status-connecting {
    background: var(--bg-color-warning-subtle);
    border-color: var(--status-color-warning-alt);
  }

  .status-error {
    background: var(--bg-color-error-subtle);
    border-color: var(--status-color-error);
  }

  .status-disconnected {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-elevated);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .connection-status.fixed {
      bottom: 16px;
      right: 16px;

      padding: var(--spacing-xxs) var(--spacing-sm);
    }

    .connection-status.with-details {
      min-width: 180px;
      padding: var(--spacing-sm) var(--spacing-sm);
    }

    .reconnect-btn {
      padding: var(--spacing-xxs) var(--spacing-sm);

    }
  }
  
  @media (max-width: 480px) {
    .connection-status.fixed {
      bottom: var(--spacing-sm);
      right: var(--spacing-sm);
    }
    
    .connection-status.with-details {
      min-width: 160px;
    }
    
    .info-item {
      flex-direction: column;
      gap: 2px;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .connection-status {
      border-width: 2px;
    }

    .status-connected {
      background: var(--bg-color-success-subtle);
      border-color: var(--status-color-success-hover);
    }

    .status-error {
      background: var(--bg-color-error-subtle);
      border-color: var(--status-color-error-hover);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .status-icon.pulse {
      animation: none;
    }
    
    .connection-status {
      transition: none;
    }
  }
</style>
