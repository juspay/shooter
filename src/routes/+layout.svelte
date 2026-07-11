<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import {
    haptic,
    prefersReducedMotion,
    startActivityBadgePolling,
    startKeyboardInsetTracking,
    startSystemStatusPolling,
  } from '$lib/modules/client/common';
  import { Icon } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';

  const { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Sliding tab indicator: 0 = Dashboard (+ its drill-ins), 1 = Terminals, 2 = SoS.
  const activeTabIndex = $derived(
    $page.url.pathname.startsWith('/terminals') ? 1 : $page.url.pathname.startsWith('/sos') ? 2 : 0
  );

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

  onMount(() => {
    const stopStatus = startSystemStatusPolling();
    const stopBadge = startActivityBadgePolling();
    const stopKeyboard = startKeyboardInsetTracking();
    return (): void => {
      stopStatus();
      stopBadge();
      stopKeyboard();
    };
  });

  // Progressive enhancement: cross-fade/slide between routes via the View
  // Transitions API when supported and the user has not asked for reduced
  // motion. Falls through to SvelteKit's normal instant swap everywhere else.
  onNavigate((navigation) => {
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      return;
    }

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<div class="app">
  <!-- Scrollable content area -->
  <div class="content-area">
    {@render children()}
  </div>

  <!-- Bottom tab bar: Dashboard + Terminals + SoS (Activity lives in the NavBar bell) -->
  <nav class="bottom-tabs">
    <div class="bottom-tabs-inner">
      <span class="tab-indicator" style="--active-index: {activeTabIndex}" aria-hidden="true"
      ></span>
      <a
        href="/"
        class="tab-item"
        class:active={$page.url.pathname === '/' ||
          $page.url.pathname.startsWith('/project') ||
          $page.url.pathname.startsWith('/session')}
        onclick={(): void => {
          haptic('light');
        }}
      >
        <Icon svg={DashboardSvg} classes="icon-26" />
        <span>Dashboard</span>
      </a>
      <a
        href="/terminals"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/terminals')}
        onclick={(): void => {
          haptic('light');
        }}
      >
        <Icon svg={TerminalSvg} classes="icon-26" />
        <span>Terminals</span>
      </a>
      <a
        href="/sos"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/sos')}
        onclick={(): void => {
          haptic('light');
        }}
      >
        <Icon svg={ToolSvg} classes="icon-26" />
        <span>SoS</span>
      </a>
    </div>
  </nav>
</div>

<style>
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
    outline: 2px solid var(--accent);
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
    position: relative;
    max-width: 600px;
    margin: 0 auto;
    padding: 6px var(--space-4) 4px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 100%;
    box-sizing: border-box;
  }

  /* Sliding amber indicator that glides between the three equal-width tabs.
     Width = one content-box third; translate steps by exactly one tab-width. */
  .tab-indicator {
    position: absolute;
    top: 0;
    left: var(--space-4);
    width: calc((100% - 2 * var(--space-4)) / 3);
    height: 2px;
    pointer-events: none;
    transform: translateX(calc(var(--active-index) * 100%));
    transition: transform var(--transition-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
  }
  .tab-indicator::after {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 28px;
    height: 100%;
    transform: translateX(-50%);
    border-radius: 0 0 3px 3px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-line, rgba(245, 177, 76, 0.32));
  }
  @media (prefers-reduced-motion: reduce) {
    .tab-indicator {
      transition: none;
    }
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
    color: var(--accent);
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
