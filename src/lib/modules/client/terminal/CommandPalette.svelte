<script lang="ts">
  import type { CommandPaletteProps } from '$lib/types';

  import { CommandMenu } from '@juspay/svelte-ui-components';

  // eslint-disable-next-line prefer-const -- open is mutated via bind:open from parent
  let { commands, onClose, open = $bindable(false) }: CommandPaletteProps = $props();

  const items = $derived(
    commands.map((cmd, i) => ({
      label: cmd.label,
      value: String(i),
    }))
  );

  function handleSelect(item: { value: string }): void {
    const index = parseInt(item.value, 10);
    if (commands[index]) {
      commands[index].action();
    }
  }
</script>

<CommandMenu
  {items}
  bind:open
  placeholder="Type a command..."
  emptyText="No matching commands"
  onselect={handleSelect}
  onclose={onClose}
  classes="command-palette"
/>

<style>
  :global(.command-palette) {
    --command-menu-overlay-background: rgba(0, 0, 0, 0.5);
    --command-menu-background: var(--component-bg);
    --command-menu-border: 1px solid var(--border);
    --command-menu-border-radius: var(--radius-lg);
    --command-menu-width: 500px;
    --command-menu-max-width: 90vw;
    --command-menu-input-color: var(--text-primary);
    --command-menu-input-placeholder-color: var(--text-tertiary);
    --command-menu-input-font-family: var(--font-mono);
    --command-menu-separator-color: var(--border);
    --command-menu-item-color: var(--text-secondary);
    --command-menu-item-active-background: var(--component-bg-hover);
    --command-menu-item-active-color: var(--text-primary);
    --command-menu-empty-color: var(--text-tertiary);
    --command-menu-z-index: 1001;
  }
</style>
