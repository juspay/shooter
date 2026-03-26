<script lang="ts">
  import { Button } from '@juspay/svelte-ui-components';

  interface Props {
    onKey: (key: string) => void;
  }

  interface QuickKey {
    escape: string;
    label: string;
  }

  const { onKey }: Props = $props();

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
      onclick={() => {
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
    --button-color: #1e293b;
    --button-text-color: #94a3b8;
    --button-border: 1px solid var(--ds-gray-400);
    --button-hover-color: #334155;
    --button-hover-text-color: #e2e8f0;
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
