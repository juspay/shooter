<script lang="ts">
  interface Props {
    status: 'degraded' | 'error' | 'healthy' | 'unknown';
  }

  const { status }: Props = $props();

  function getStatusLabel(s: string): string {
    switch (s) {
      case 'degraded':
        return 'Degraded';
      case 'error':
        return 'Offline';
      case 'healthy':
        return 'Online';
      default:
        return 'Checking';
    }
  }

  function getStatusClass(s: string): string {
    switch (s) {
      case 'degraded':
        return 'degraded';
      case 'error':
        return 'offline';
      case 'healthy':
        return 'online';
      default:
        return '';
    }
  }
</script>

<div class="status-badge {getStatusClass(status)}">
  <span class="status-dot"></span>
  <span>{getStatusLabel(status)}</span>
</div>
