<script lang="ts">
  import type { Snippet } from 'svelte';

  import Icon from './Icon.svelte';

  interface Props {
    children: Snippet;
    icon?: 'file' | 'folder' | 'tool';
    variant?: '' | 'error' | 'info' | 'success' | 'warning';
  }

  const { children, icon, variant = '' }: Props = $props();
</script>

<span class="tag {variant}">
  {#if icon}
    <Icon name={icon} size={10} />
  {/if}
  {@render children()}
</span>
