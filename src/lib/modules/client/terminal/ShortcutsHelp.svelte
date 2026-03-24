<script lang="ts">
  import { getShortcutList } from './keyboard-shortcuts';
  import { onMount } from 'svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();
  const shortcuts = getShortcutList();

  function handleKeydown(e: KeyboardEvent) {
    if (!open) { return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
    };
  });
</script>

{#if open}
  <div class="overlay">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={onClose}></div>
    <div class="panel" role="dialog" aria-label="Keyboard shortcuts">
      <div class="panel-header">
        <h2 class="panel-title">Keyboard Shortcuts</h2>
        <button class="close-btn" onclick={onClose} type="button" aria-label="Close">&times;</button>
      </div>
      <div class="shortcuts-list">
        {#each shortcuts as shortcut (shortcut.keys)}
          <div class="shortcut-row">
            <span class="shortcut-desc">{shortcut.description}</span>
            <kbd class="shortcut-key">{shortcut.keys}</kbd>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .panel {
    position: relative;
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    min-width: 320px;
    max-width: 420px;
    width: 90vw;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .panel-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background: var(--component-bg-hover);
    color: var(--text-primary);
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
  }

  .shortcut-desc {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .shortcut-key {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--ds-gray-200);
    border: 1px solid var(--ds-gray-400);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    color: var(--text-primary);
    white-space: nowrap;
  }
</style>
