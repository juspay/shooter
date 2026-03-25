<script lang="ts">
  import '../app.css';
  import '$lib/theme.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { StatusBadge } from '$lib/modules/client/common';
  import { Button } from '@juspay/svelte-ui-components';
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
  <!-- Top bar: Logo + Status + Gear -->
  <header class="header">
    <div class="header-content">
      <a href="/" class="logo">
        <img src="/app-icon.png" alt="Shooter" class="logo-icon" width="24" height="24" />
        <span class="logo-text">Shooter</span>
      </a>

      <div class="nav-right">
        <StatusBadge status={systemStatus} />
        <Button
          classes="btn-gear {$page.url.pathname === '/config' ? 'btn-gear-active' : ''}"
          onclick={() => goto('/config')}
          aria-label="Settings"
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        </Button>
      </div>
    </div>
  </header>

  <!-- Scrollable content area -->
  <div class="content-area">
    {@render children()}
  </div>

  <!-- Bottom tab bar: Projects + Terminals -->
  <nav class="bottom-tabs">
    <div class="bottom-tabs-inner">
      <a
        href="/"
        class="tab-item"
        class:active={$page.url.pathname === '/' || $page.url.pathname.startsWith('/project') || $page.url.pathname.startsWith('/session')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Projects</span>
      </a>
      <a
        href="/terminals"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/terminals')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>Terminals</span>
      </a>
    </div>
  </nav>
</div>

<style>
  .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.btn-gear) {
    --button-color: transparent;
    --button-text-color: var(--text-muted);
    --button-hover-color: var(--component-bg);
    --button-hover-text-color: var(--text-primary);
    --button-border: none;
    --button-hover-border: none;
    --button-padding: 0;
    --button-height: 36px;
    --button-width: 36px;
    --button-border-radius: var(--radius-md);
  }
  :global(.btn-gear-active) {
    --button-color: var(--component-bg);
    --button-text-color: var(--text-primary);
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .bottom-tabs {
    height: 64px;
    background: var(--background);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 100;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .bottom-tabs-inner {
    max-width: 600px;
    margin: 0 auto;
    padding: 6px var(--space-4) 4px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 100%;
    box-sizing: border-box;
  }
  .tab-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    text-decoration: none;
    padding: 6px 36px;
    border-radius: var(--radius-md);
    transition: color var(--transition-fast);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    min-height: 48px;
  }
  .tab-item:hover {
    color: var(--text-secondary);
  }
  .tab-item.active {
    color: var(--ds-green-700);
  }
  .tab-item :global(svg) {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
  }

  /* Mobile: page headers stack vertically, buttons wrap */
  @media (max-width: 480px) {
    :global(.btn-gear) {
      --button-height: 44px;
      --button-width: 44px;
    }
    .bottom-tabs {
      height: 60px;
    }
    .tab-item {
      padding: 6px 28px;
      font-size: 10px;
      gap: 3px;
      min-height: 44px;
    }
    .tab-item :global(svg) {
      width: 24px;
      height: 24px;
    }

    :global(.status-badge) {
      font-size: 10px;
      padding: 0 8px;
      height: 22px;
    }

    /* Fix squashed buttons on mobile */
    :global(.page-header) {
      flex-direction: column !important;
      gap: var(--space-3) !important;
    }
    :global(.page-header .btn-group) {
      width: 100%;
    }
    :global(.page-header .btn-group .btn) {
      flex: 1;
      justify-content: center;
    }
  }
</style>
