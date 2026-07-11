<script lang="ts">
  import type { Snippet } from 'svelte';

  import { haptic } from '$lib/modules/client/common';

  const {
    ariaLabel = 'Add',
    children,
    onclick,
  }: {
    ariaLabel?: string;
    children?: Snippet;
    onclick: () => void;
  } = $props();

  function handle(): void {
    haptic('medium');
    onclick();
  }
</script>

<button class="fab" onclick={handle} aria-label={ariaLabel}>
  {#if children}{@render children()}{:else}<span class="fab-plus">+</span>{/if}
</button>

<style>
  .fab {
    position: fixed;
    right: var(--space-4);
    bottom: calc(64px + var(--space-4) + env(safe-area-inset-bottom, 0px));
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-fg);
    cursor: pointer;
    box-shadow:
      0 6px 20px -4px color-mix(in srgb, var(--accent) 55%, transparent),
      0 2px 6px rgba(0, 0, 0, 0.35);
    -webkit-tap-highlight-color: transparent;
    transition: transform 80ms ease;
  }
  .fab:active {
    transform: scale(0.92);
  }
  .fab-plus {
    font-size: 30px;
    font-weight: 300;
    line-height: 1;
    margin-top: -2px;
  }
</style>
