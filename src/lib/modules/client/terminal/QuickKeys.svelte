<script lang="ts">
  import type { QuickKey, QuickKeysProps } from '$lib/types';

  import { Button } from '@juspay/svelte-ui-components';

  const { onKey }: QuickKeysProps = $props();

  const keys: QuickKey[] = [
    { escape: '\x03', label: 'Ctrl+C' },
    { escape: '\t', label: 'Tab' },
    { escape: '\x1b[A', label: '\u2191' },
    { escape: '\x1b[B', label: '\u2193' },
    { escape: '\x1b', label: 'Esc' },
    { escape: '\x04', label: 'Ctrl+D' },
    { escape: '\x1a', label: 'Ctrl+Z' },
  ];
</script>

<div class="quick-keys" role="toolbar" aria-label="Quick terminal keys">
  {#each keys as k (k.label)}
    <Button
      classes="btn-quick-key"
      onclick={(): void => {
        onKey(k.escape);
      }}
      text={k.label}
    />
  {/each}
</div>

<style>
  .quick-keys {
    display: flex;
    overflow-x: auto;
    gap: 6px;
    padding: var(--space-2) var(--space-3);
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
  }

  .quick-keys::-webkit-scrollbar {
    display: none;
  }

  :global(.btn-quick-key) {
    --button-color: var(--ds-gray-200);
    --button-text-color: var(--ds-gray-700);
    --button-border: 1px solid var(--ds-gray-400);
    --button-hover-color: var(--ds-gray-300);
    --button-hover-text-color: var(--text-primary);
    --button-hover-border: 1px solid var(--ds-gray-400);
    --button-height: 44px;
    --button-padding: 0 var(--space-3);
    --button-border-radius: var(--radius-md);
    --button-font-family: var(--font-mono);
    --button-font-size: var(--text-xs);
    min-width: 52px;
    flex-shrink: 0;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
</style>
