<script lang="ts">
  interface Props {
    onKey: (key: string) => void;
  }

  interface QuickKey {
    escape: string;
    label: string;
  }

  const { onKey }: Props = $props();

  const keys: QuickKey[] = [
    { label: 'Ctrl+C', escape: '\x03' },
    { label: 'Tab', escape: '\t' },
    { label: '\u2191', escape: '\x1b[A' },
    { label: '\u2193', escape: '\x1b[B' },
    { label: 'Esc', escape: '\x1b' },
    { label: 'Ctrl+D', escape: '\x04' },
    { label: 'Ctrl+Z', escape: '\x1a' },
  ];
</script>

<div class="quick-keys" role="toolbar" aria-label="Quick terminal keys">
  {#each keys as k (k.label)}
    <button
      class="quick-key"
      onclick={() => onKey(k.escape)}
      type="button"
      aria-label={k.label}
    >
      {k.label}
    </button>
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

  .quick-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 52px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    background: #1e293b;
    border: 1px solid var(--ds-gray-400);
    color: #94a3b8;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .quick-key:hover {
    background: #334155;
    color: #e2e8f0;
  }

  .quick-key:active {
    background: #475569;
    color: #f1f5f9;
    transform: scale(0.96);
  }
</style>
