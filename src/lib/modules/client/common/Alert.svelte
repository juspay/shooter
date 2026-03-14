<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    class?: string;
    message: string;
    type?: 'error' | 'info' | 'success' | 'warning';
  }

  const { class: className = '', message, type = 'info' }: Props = $props();

  const iconName = $derived(
    type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'alert-triangle'
  );
</script>

<div class="alert {type} {className}">
  <Icon name={iconName} size={16} />
  <span>{message}</span>
</div>

<style>
  .alert {
    animation: slideUp 0.2s ease;
  }

  .alert :global(.icon) {
    flex-shrink: 0;
    margin-top: 1px;
  }
</style>
