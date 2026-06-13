<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import { Button, Icon, Pill } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';

  const { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Expose AI provider flags for summarizers (they run outside SvelteKit's data flow)
  $effect(() => {
    if (!browser || !data?.aiProviders) {
      return;
    }
    (window as unknown as Record<string, unknown>).__aiProviders = data.aiProviders;

    // Ensure window.process.env exists minimally so env vars can be injected.
    const win = window as unknown as Record<string, unknown>;
    if (!win.process || typeof win.process !== 'object') {
      win.process = { env: {} };
    }
    const proc = win.process as Record<string, unknown>;
    if (!proc.env || typeof proc.env !== 'object') {
      proc.env = {};
    }
    const procEnv = proc.env as Record<string, string>;

    if (data.neurolinkProvider) {
      procEnv.NEUROLINK_PROVIDER = data.neurolinkProvider;
    }
    if (data.litellmBaseUrl) {
      procEnv.LITELLM_BASE_URL = data.litellmBaseUrl;
    }
    if (data.litellmModel) {
      procEnv.LITELLM_MODEL = data.litellmModel;
    }
  });

  let systemStatus = $state<'degraded' | 'error' | 'healthy' | 'unknown'>('unknown');

  const statusLabels: Record<string, string> = {
    degraded: 'Degraded',
    error: 'Offline',
    healthy: 'Online',
    unknown: 'Checking',
  };
  const statusClasses: Record<string, string> = {
    degraded: 'pill-status-degraded',
    error: 'pill-status-offline',
    healthy: 'pill-status-online',
    unknown: 'pill-status-unknown',
  };

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
        <Pill
          text={statusLabels[systemStatus] || 'Checking'}
          classes={statusClasses[systemStatus] || 'pill-status-unknown'}
        />
        <Button
          classes="btn-gear {$page.url.pathname === '/config' ? 'btn-gear-active' : ''}"
          onclick={(): void => {
            void goto('/config');
          }}
          ariaLabel="Settings"
        >
          {#snippet icon()}<Icon svg={SettingsSvg} classes="icon-18" />{/snippet}
        </Button>
      </div>
    </div>
  </header>

  <!-- Scrollable content area -->
  <div class="content-area">
    {@render children()}
  </div>

  <!-- Bottom tab bar: Dashboard + Activity + Terminals -->
  <nav class="bottom-tabs">
    <div class="bottom-tabs-inner">
      <a
        href="/"
        class="tab-item"
        class:active={$page.url.pathname === '/' ||
          $page.url.pathname.startsWith('/project') ||
          $page.url.pathname.startsWith('/session')}
      >
        <Icon svg={DashboardSvg} classes="icon-26" />
        <span>Dashboard</span>
      </a>
      <a
        href="/activity"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/activity')}
      >
        <Icon svg={BellSvg} classes="icon-26" />
        <span>Activity</span>
      </a>
      <a
        href="/terminals"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/terminals')}
      >
        <Icon svg={TerminalSvg} classes="icon-26" />
        <span>Terminals</span>
      </a>
      <a href="/sos" class="tab-item" class:active={$page.url.pathname.startsWith('/sos')}>
        <Icon svg={ToolSvg} classes="icon-26" />
        <span>SoS</span>
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
    --button-border: none;
    --button-padding: 0;
    --button-height: 36px;
    --button-width: 36px;
    --button-border-radius: var(--radius-md);
    --button-hover-color: var(--component-bg);
    --button-hover-text-color: var(--text-primary);
  }
  :global(.btn-gear:focus-visible) {
    outline: 2px solid var(--ds-green-700);
    outline-offset: 2px;
  }
  :global(.btn-gear-active) {
    --button-color: var(--component-bg);
    --button-text-color: var(--text-primary);
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: env(safe-area-inset-bottom, 0px);
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
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    text-decoration: none;
    padding: 6px 8px;
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
  .tab-item :global(.icon) {
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
      padding: 6px 8px;
      min-width: 0;
      font-size: 10px;
      gap: 3px;
      min-height: 44px;
    }

    :global(.pill-status-online),
    :global(.pill-status-offline),
    :global(.pill-status-degraded),
    :global(.pill-status-unknown) {
      font-size: 10px;
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
