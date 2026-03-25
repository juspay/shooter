<script lang="ts">
  import { KeyboardInput, Modal } from '@juspay/svelte-ui-components';

  import { getShortcutList } from './keyboard-shortcuts';

  interface Props {
    onClose: () => void;
    open: boolean;
  }

  const { onClose, open }: Props = $props();
  const shortcuts = getShortcutList();
</script>

{#if open}
  <Modal
    header={{ text: 'Keyboard Shortcuts' }}
    onoverlayClick={onClose}
    classes="shortcuts-modal"
  >
    {#snippet content()}
      <div class="shortcuts-list">
        {#each shortcuts as shortcut (shortcut.keys)}
          <div class="shortcut-row">
            <span class="shortcut-desc">{shortcut.description}</span>
            <KeyboardInput keys={shortcut.keys} classes="shortcut-kbd" />
          </div>
        {/each}
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  :global(.shortcuts-modal) {
    --modal-content-background-color: var(--component-bg);
    --modal-border-radius: var(--radius-lg);
    --modal-header-background-color: var(--component-bg);
    --modal-header-padding: var(--space-4) var(--space-5);
    --modal-header-border-bottom: 1px solid var(--border);
    --header-text-size: var(--text-lg);
    --modal-header-text-weight: 600;
    --background-color: rgba(0, 0, 0, 0.5);
    --modal-z-index: 1000;
  }

  :global(.shortcuts-modal .modal-content) {
    max-width: 420px;
    width: 90vw;
    min-width: 320px;
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
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

  :global(.shortcut-kbd) {
    --keyboard-input-key-color: var(--text-primary);
    --keyboard-input-key-background: var(--ds-gray-200);
    --keyboard-input-key-border: 1px solid var(--ds-gray-400);
    --keyboard-input-key-box-shadow: 0 1px 0 var(--ds-gray-400);
    --keyboard-input-font-family: var(--font-mono);
    --keyboard-input-font-size: var(--text-xs);
  }
</style>
