<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    class?: string;
    disabled?: boolean;
    loading?: boolean;
    onclick?: () => void;
    size?: 'lg' | 'md' | 'sm';
    type?: 'button' | 'reset' | 'submit';
    variant?: 'danger' | 'ghost' | 'primary' | 'secondary';
  }

  const {
    children,
    class: className = '',
    disabled = false,
    loading = false,
    onclick,
    size = 'md',
    type = 'button',
    variant = 'primary',
  }: Props = $props();

  const sizeClass = $derived(size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '');
  const variantClass = $derived(`btn-${variant}`);
</script>

<button
  class="btn {variantClass} {sizeClass} {className}"
  {type}
  disabled={disabled || loading}
  {onclick}
>
  {#if loading}
    <span class="btn-spinner"></span>
  {/if}
  {@render children()}
</button>
