<script lang="ts">
  import type { Snippet } from 'svelte';

  import Icon from './Icon.svelte';

  interface Props {
    children: Snippet;
    icon?: 'file' | 'folder' | 'tool';
    variant?: string;
  }

  const { children, icon, variant = '' }: Props = $props();

  const validVariants = ['', 'error', 'info', 'success', 'warning'];
  const variantClass = $derived(validVariants.includes(variant) ? variant : '');
</script>

<span class="tag {variantClass}">
  {#if icon}
    <Icon name={icon} size={10} />
  {/if}
  {@render children()}
</span>
