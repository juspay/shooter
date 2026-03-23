<script lang="ts">
  interface Props {
    onretry?: () => void;
    status: 'connected' | 'disconnected' | 'reconnecting';
  }

  const { onretry, status }: Props = $props();

  const label = $derived(
    status === 'connected'
      ? 'Connected'
      : status === 'reconnecting'
        ? 'Reconnecting...'
        : 'Disconnected'
  );
</script>

<div class="connection-status" class:reconnecting={status === 'reconnecting'} class:disconnected={status === 'disconnected'} class:connected={status === 'connected'}>
  <span class="status-dot {status}"></span>
  <span class="status-label">{label}</span>
  {#if status === 'disconnected' && onretry}
    <button class="retry-btn" onclick={onretry} type="button">Retry</button>
  {/if}
</div>

<style>
  .connection-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    flex-shrink: 0;
  }

  .connection-status.connected {
    color: #22c55e;
  }

  .connection-status.reconnecting {
    color: var(--ds-amber-900);
  }

  .connection-status.disconnected {
    color: var(--ds-red-900);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.connected {
    background: #22c55e;
  }

  .status-dot.reconnecting {
    background: var(--ds-amber-700);
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  .status-dot.disconnected {
    background: var(--ds-red-700);
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .status-label {
    white-space: nowrap;
  }

  .retry-btn {
    background: transparent;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    color: inherit;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    padding: 2px 8px;
    cursor: pointer;
    transition: opacity var(--transition-fast);
    margin-left: 2px;
  }

  .retry-btn:hover {
    opacity: 0.8;
  }

  @media (max-width: 480px) {
    .status-label {
      display: none;
    }
  }
</style>
