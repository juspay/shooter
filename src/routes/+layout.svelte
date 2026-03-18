<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { StatusBadge } from '$lib/modules/client/common';
  import { onMount, type Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  let systemStatus = $state<'degraded' | 'error' | 'healthy' | 'unknown'>('unknown');

  onMount(() => {
    void checkSystemStatus();
    const interval = setInterval(() => {
      void checkSystemStatus();
    }, 30000);
    return (): void => {
      clearInterval(interval);
    };
  });

  async function checkSystemStatus(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        systemStatus = 'error';
        return;
      }
      const data = (await response.json()) as { status?: string };
      systemStatus =
        data.status === 'healthy' || data.status === 'degraded' || data.status === 'error'
          ? data.status
          : 'unknown';
    } catch {
      systemStatus = 'error';
    }
  }
</script>

<div class="app">
  <header class="header">
    <div class="header-content">
      <a href="/" class="logo">
        <svg
          class="logo-icon"
          width="24"
          height="24"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="16" cy="16" r="10" stroke="#22c55e" stroke-width="2" />
          <circle cx="16" cy="16" r="5" stroke="#22c55e" stroke-width="1.5" />
          <circle cx="16" cy="16" r="1.5" fill="#22c55e" />
          <line x1="16" y1="2" x2="16" y2="8" stroke="#22c55e" stroke-width="1.5" />
          <line x1="16" y1="24" x2="16" y2="30" stroke="#22c55e" stroke-width="1.5" />
          <line x1="2" y1="16" x2="8" y2="16" stroke="#22c55e" stroke-width="1.5" />
          <line x1="24" y1="16" x2="30" y2="16" stroke="#22c55e" stroke-width="1.5" />
        </svg>
        <span class="logo-text">Shooter</span>
      </a>

      <nav class="nav">
        <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}> Projects </a>
        <a
          href="/terminals"
          class="nav-link"
          class:active={$page.url.pathname.startsWith('/terminals')}
        >
          Terminals
        </a>
        <a href="/config" class="nav-link" class:active={$page.url.pathname === '/config'}>
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

  @media (max-width: 480px) {
    .nav-divider {
      margin: 0 var(--space-1);
    }
  }
</style>
