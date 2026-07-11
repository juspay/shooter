<script lang="ts">
  import type { Snippet } from 'svelte';

  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ArrowLeftSvg from '$lib/assets/icons/arrow-left.svg?raw';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import { getHasNewActivity, getSystemStatus, haptic } from '$lib/modules/client/common';
  import Glyph from '$lib/modules/client/common/Glyph.svelte';
  import { Button, Pill } from '@juspay/svelte-ui-components';

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
  const status = $derived(getSystemStatus());

  const {
    backHref,
    showBack,
    title = '',
    trailing,
    variant = 'drilldown',
  }: {
    backHref?: string;
    showBack?: boolean;
    title?: string;
    trailing?: Snippet;
    variant?: 'drilldown' | 'root';
  } = $props();

  const withBack = $derived(showBack ?? variant === 'drilldown');
  const onActivity = $derived(page.url.pathname.startsWith('/activity'));
  const showBell = $derived(variant === 'root' && !onActivity);
  const hasNewActivity = $derived(getHasNewActivity());

  function onBack(): void {
    haptic('light');
    if (backHref) {
      void goto(backHref);
    } else if (typeof history !== 'undefined') {
      history.back();
    }
  }

  function onBell(): void {
    haptic('light');
    void goto('/activity');
  }
</script>

<header class="navbar" class:navbar-root={variant === 'root'}>
  <div class="navbar-inner">
    {#if withBack}
      <button class="navbar-back" onclick={onBack} aria-label="Back">
        <Glyph svg={ArrowLeftSvg} size={24} />
      </button>
    {:else if variant === 'root'}
      <a href="/" class="navbar-brand" aria-label="Home">
        <img src="/app-icon.png" alt="" class="navbar-logo" width="26" height="26" />
      </a>
    {/if}
    <h1 class="navbar-title" class:navbar-title-root={variant === 'root'}>{title}</h1>
    <div class="navbar-trailing">
      {#if trailing}{@render trailing()}{/if}
      {#if showBell}
        <span class="navbar-bell">
          <Button
            classes="btn-gear"
            onclick={onBell}
            ariaLabel={hasNewActivity ? 'Activity — new updates' : 'Activity'}
          >
            {#snippet icon()}<Glyph svg={BellSvg} size={18} />{/snippet}
          </Button>
          {#if hasNewActivity}
            <span class="navbar-bell-dot" aria-hidden="true"></span>
          {/if}
        </span>
      {/if}
      {#if variant === 'root'}
        <Pill
          text={statusLabels[status] || 'Checking'}
          classes={statusClasses[status] || 'pill-status-unknown'}
        />
        <Button
          classes="btn-gear"
          onclick={(): void => {
            haptic('light');
            void goto('/config');
          }}
          ariaLabel="Settings"
        >
          {#snippet icon()}<Glyph svg={SettingsSvg} size={18} />{/snippet}
        </Button>
      {/if}
    </div>
  </div>
</header>

<style>
  .navbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: color-mix(in srgb, var(--background) 82%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding-top: env(safe-area-inset-top, 0px);
  }

  .navbar-inner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--header-height);
    max-width: var(--max-width);
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .navbar-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin-left: -8px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    border-radius: var(--radius-md);
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }
  .navbar-back:active {
    transform: scale(0.9);
    transition: transform 60ms ease;
  }

  .navbar-brand {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    text-decoration: none;
  }
  .navbar-logo {
    display: block;
  }

  .navbar-title {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .navbar-title-root {
    font-size: var(--text-xl);
  }

  .navbar-trailing {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .navbar-bell {
    position: relative;
    display: inline-flex;
  }
  .navbar-bell-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--background);
    pointer-events: none;
  }
</style>
