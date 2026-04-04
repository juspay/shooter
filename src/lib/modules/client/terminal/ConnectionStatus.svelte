<script lang="ts">
  import type { ConnectionStatusProps } from '$lib/types';

  import { Button } from '@juspay/svelte-ui-components';

  const { onretry, status }: ConnectionStatusProps = $props();

  const label = $derived(
    status === 'connected'
      ? 'Connected'
      : status === 'reconnecting'
        ? 'Reconnecting...'
        : 'Disconnected'
  );
</script>

<div
  class="connection-status"
  class:reconnecting={status === 'reconnecting'}
  class:disconnected={status === 'disconnected'}
  class:connected={status === 'connected'}
  aria-label="Connection: {status}"
>
  <span class="conn-dot {status}"></span>
  <span class="status-label">{label}</span>
  {#if status === 'disconnected' && onretry}
    <Button classes="btn-ghost btn-sm btn-retry" onclick={onretry} text="Retry" />
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
    color: var(--ds-green-700);
  }

  .connection-status.reconnecting {
    color: var(--ds-amber-900);
  }

  .connection-status.disconnected {
    color: var(--ds-red-900);
  }

  .conn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .conn-dot.connected {
    background: var(--ds-green-700);
  }

  .conn-dot.reconnecting {
    background: var(--ds-amber-700);
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  .conn-dot.disconnected {
    background: var(--ds-red-700);
  }

  .status-label {
    white-space: nowrap;
  }

  :global(.btn-retry) {
    --button-height: auto;
    --button-padding: 2px 8px;
    --button-font-size: 12px;
    --button-border: 1px solid currentColor;
    --button-text-color: inherit;
    margin-left: 2px;
  }

  @media (max-width: 480px) {
    .status-label {
      display: none;
    }
  }
</style>
