<script lang="ts">
  import type { Snippet } from 'svelte';

  import Icon from './Icon.svelte';

  interface Props {
    children?: Snippet;
    description: string;
    icon: 'bell' | 'settings';
    title: string;
  }

  const { children, description, icon, title }: Props = $props();
</script>

<div class="empty-state">
  <div class="empty-state-icon">
    <Icon name={icon} size={24} />
  </div>
  <h3 class="empty-state-title">{title}</h3>
  <p class="empty-state-description">{description}</p>
  {#if children}
    {@render children()}
  {/if}
</div>
