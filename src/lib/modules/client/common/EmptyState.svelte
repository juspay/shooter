<script lang="ts">
  import type { EmptyStateProps } from '$lib/types';

  import Icon from './Icon.svelte';

  const { children, description, icon, title }: EmptyStateProps = $props();
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
