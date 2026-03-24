<script lang="ts">
  import { isMac } from './keyboard-shortcuts';

  interface Command {
    action: () => void;
    label: string;
  }

  interface Props {
    commands: Command[];
    onClose: () => void;
    open: boolean;
  }

  const { commands, onClose, open }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);

  const filtered = $derived(
    query
      ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
      : commands
  );

  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return;
    }

    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      const idx = Math.min(selectedIndex, filtered.length - 1);
      filtered[idx].action();
      onClose();
    }
  }

  // Reset selection when query changes
  $effect(() => {
    void query;
    selectedIndex = 0;
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="palette-overlay" onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="palette-backdrop" onclick={onClose}></div>
    <div class="palette-panel">
      <input
        class="palette-input"
        type="text"
        placeholder="Type a command..."
        bind:value={query}
        autofocus
      />
      {#if filtered.length > 0}
        <div class="palette-list" role="listbox">
          {#each filtered as cmd, i (cmd.label)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="palette-item"
              class:selected={i === selectedIndex}
              role="option"
              aria-selected={i === selectedIndex}
              onclick={() => { cmd.action(); onClose(); }}
            >
              {cmd.label}
            </div>
          {/each}
        </div>
      {:else}
        <div class="palette-empty">No matching commands</div>
      {/if}
      <div class="palette-footer">
        <span class="palette-hint">{isMac ? '⌘' : 'Ctrl'}+K to toggle</span>
        <span class="palette-hint">↑↓ navigate &middot; Enter select &middot; Esc close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
  }

  .palette-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .palette-panel {
    position: relative;
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    min-width: 360px;
    max-width: 500px;
    width: 90vw;
    overflow: hidden;
  }

  .palette-input {
    width: 100%;
    padding: var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    font-size: var(--text-base);
    font-family: var(--font-mono);
    outline: none;
  }

  .palette-input::placeholder {
    color: var(--text-tertiary);
  }

  .palette-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .palette-item {
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    transition: background var(--transition-fast);
  }

  .palette-item.selected,
  .palette-item:hover {
    background: var(--component-bg-hover);
    color: var(--text-primary);
  }

  .palette-empty {
    padding: var(--space-4);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .palette-footer {
    display: flex;
    justify-content: space-between;
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border);
  }

  .palette-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
  }
</style>
