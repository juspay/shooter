<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { StatusBadge } from '$lib/components';
  import { onMount, type Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  let systemStatus = $state<'degraded' | 'error' | 'healthy' | 'unknown'>('unknown');

  onMount(() => {
    void checkSystemStatus();
    const interval = setInterval(() => {
      void checkSystemStatus();
    }, 30000);
    return (): void => { clearInterval(interval); };
  });

  async function checkSystemStatus(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      const data = await response.json() as { status?: string };
      systemStatus = response.ok && data.status === 'healthy' ? 'healthy' : 'degraded';
    } catch {
      systemStatus = 'error';
    }
  }
</script>

<div class="app">
  <header class="header">
    <div class="header-content">
      <a href="/" class="logo">
        <div class="logo-mark"></div>
        <span class="logo-text">Shooter</span>
      </a>

      <nav class="nav">
        <a
          href="/"
          class="nav-link"
          class:active={$page.url.pathname === '/'}
        >
          Notifications
        </a>
        <a
          href="/config"
          class="nav-link"
          class:active={$page.url.pathname === '/config'}
        >
          Settings
        </a>
        <div class="nav-divider"></div>
        <StatusBadge status={systemStatus} />
      </nav>
    </div>
  </header>

  {@render children()}
</div>

<style>
  .nav-divider {
    width: 1px;
    height: 20px;
    background: var(--border-default);
    margin: 0 var(--space-2);
  }
</style>
