<script lang="ts">
  import type { CardProps } from '$lib/types';

  const { children, class: className = '', description, title }: CardProps = $props();
</script>

<div class="card {className}">
  {#if title}
    <div class="card-header">
      <h2 class="card-title">{title}</h2>
      {#if description}
        <p class="card-description">{description}</p>
      {/if}
    </div>
  {/if}
  <div class="card-content">
    {@render children()}
  </div>
</div>
