<script lang="ts">
  import type { DashboardCard, ProjectGroup, ShooterConfig } from '$lib/types';

  import { goto } from '$app/navigation';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import RefreshSvg from '$lib/assets/icons/refresh.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import {
    clearCache,
    formatRelativeTime,
    getCached,
    isShooterConfig,
    setCache,
  } from '$lib/modules/client/common';
  import { connect, DashboardView, disconnect, getCards } from '$lib/modules/client/dashboard';
  import { Banner, Button, EmptyState, Icon, Pill, Shimmer } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  const POLL_INTERVAL_MS = 10_000;
  const PAGE_SIZE = 20;

  let projects = $state<ProjectGroup[]>([]);
  let loading = $state(false);
  let fetching = false; // non-reactive guard to prevent overlapping fetches
  let config = $state<null | ShooterConfig>(null);
  let pollTimer: null | ReturnType<typeof setInterval> = null;
  let fetchError = $state<null | string>(null);
  let hasMore = $state(false);
  let currentOffset = $state(0);

  const cards = $derived(getCards());

  onMount(() => {
    loadConfiguration();

    // Show cached data immediately
    const cached = getCached('shooter_projects') as null | ProjectGroup[];
    if (cached) {
      projects = cached;
      loading = false;
    }

    // Then fetch fresh data in background
    void fetchSessions();

    pollTimer = setInterval(() => {
      if (config?.apiKey && currentOffset <= PAGE_SIZE) {
        void fetchSessions();
      }
    }, POLL_INTERVAL_MS);
  });

  onDestroy(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    disconnect();
  });

  function loadConfiguration(): void {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isShooterConfig(parsed)) {
          config = parsed;
          // Connect dashboard store with API key
          void connect(config.apiKey);
        } else {
          localStorage.removeItem('shooter_config');
          config = null;
        }
      }
    } catch {
      // No configuration found — expected on first visit
    }
  }

  async function fetchSessions(append = false, bustCache = false): Promise<void> {
    if (!config?.apiKey || fetching) {
      return;
    }
    fetching = true;

    // Don't show loading spinner if we already have cached data
    if (projects.length === 0) {
      loading = true;
    }

    const offset = append ? currentOffset : 0;

    try {
      const base = bustCache ? '/api/sessions?refresh=true&' : '/api/sessions?';
      const response = await fetch(`${base}limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        fetchError = `Failed to load projects (HTTP ${response.status})`;
        return;
      }

      fetchError = null;
      const result = (await response.json()) as { projects: ProjectGroup[]; total?: number };
      if (append) {
        projects = [...projects, ...result.projects];
      } else {
        projects = result.projects;
      }
      currentOffset = projects.length;
      hasMore = result.total !== undefined ? projects.length < result.total : false;
      setCache('shooter_projects', projects);
    } catch (error) {
      fetchError = 'Failed to load projects';
      console.error('Failed to fetch sessions:', error);
    } finally {
      loading = false;
      fetching = false;
    }
  }

  async function loadMore(): Promise<void> {
    await fetchSessions(true);
  }

  async function forceRefresh(): Promise<void> {
    loading = true;
    clearCache('shooter_projects');
    await fetchSessions(false, true);
  }

  function navigateToConfig(): void {
    void goto('/config');
  }

  function navigateToTerminal(terminalId: string): void {
    void goto(`/terminals/${terminalId}`);
  }

  function totalSessionCount(): number {
    return projects.reduce((sum, p) => sum + p.sessionCount, 0);
  }
</script>

<svelte:head>
  <title>Dashboard - Shooter</title>
  <meta name="description" content="Active terminals and Claude Code sessions" />
</svelte:head>

<main class="main">
  <div class="page-header">
    <div class="page-header-content">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-description">Active terminals and Claude Code sessions</p>
      </div>
      <div class="page-actions">
        <Button classes="btn-secondary" onclick={forceRefresh} disabled={loading}>
          <Icon svg={RefreshSvg} classes="icon-14" />
          Refresh
        </Button>
      </div>
    </div>
    {#if projects.length > 0}
      <div class="stats-bar">
        <div class="stat-chip">
          <span class="stat-value">{projects.length}</span>
          <span class="stat-label">{projects.length === 1 ? 'project' : 'projects'}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">{totalSessionCount()}</span>
          <span class="stat-label">{totalSessionCount() === 1 ? 'session' : 'sessions'}</span>
        </div>
        {#if cards.length > 0}
          <div class="stat-chip stat-chip-active">
            <span class="stat-value">{cards.length}</span>
            <span class="stat-label">active</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if fetchError}
    <Banner text={fetchError} classes="banner-error" />
  {/if}

  {#if loading && projects.length === 0 && cards.length === 0}
    <div class="loading-container">
      {#each Array(3) as _, i (i)}
        <Shimmer classes="shimmer-card" />
      {/each}
    </div>
  {:else if !config?.apiKey}
    <EmptyState
      title="Configuration Required"
      description="Set up your API credentials to start tracking sessions"
    >
      {#snippet icon()}<Icon svg={SettingsSvg} classes="icon-24" />{/snippet}
      <Button classes="btn-primary" onclick={navigateToConfig} text="Configure Settings" />
    </EmptyState>
  {:else}
    <!-- Dashboard section: active terminal sessions -->
    {#if cards.length > 0}
      <div class="dashboard-section">
        <DashboardView
          {cards}
          onCardClick={(card: DashboardCard): void => {
            navigateToTerminal(card.terminalId);
          }}
        />
      </div>
    {/if}

    <!-- Sessions archive below dashboard -->
    {#if loading && projects.length === 0}
      <div class="loading-container">
        {#each Array(3) as _, i (i)}
          <Shimmer classes="shimmer-card" />
        {/each}
      </div>
    {:else if totalSessionCount() === 0 && cards.length === 0}
      <EmptyState
        title="No sessions yet"
        description="Claude Code sessions will appear here once JSONL files are found"
      >
        {#snippet icon()}<Icon svg={BellSvg} classes="icon-24" />{/snippet}
      </EmptyState>
    {:else if projects.length > 0}
      {#if cards.length > 0}
        <h3 class="section-label">Sessions</h3>
      {/if}
      <div class="projects-container">
        {#each projects as project (project.id)}
          <a href="/project?id={project.id}" class="session-card">
            <div class="session-card-header">
              <div>
                <h3 class="session-card-title">{project.name}</h3>
                <div class="session-card-subtitle">{project.fullPath}</div>
              </div>
              <Pill
                text="Last updated {formatRelativeTime(project.lastModified)}"
                classes="pill-session-time"
              />
            </div>
            <div class="session-stats">
              <span
                ><strong>{project.sessionCount}</strong>
                {project.sessionCount === 1 ? 'session' : 'sessions'}</span
              >
            </div>
          </a>
        {/each}
      </div>
      {#if hasMore}
        <div style="text-align: center; padding: 1rem;">
          <Button classes="btn-secondary" onclick={loadMore} text="Load More" />
        </div>
      {/if}
    {/if}
  {/if}
</main>

<style>
  .stats-bar {
    display: flex;
    gap: 10px;
    margin-top: var(--space-4);
  }

  .stat-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    padding: 6px 14px;
  }

  .stat-chip-active {
    background: var(--ds-green-alpha-200);
    border-color: var(--ds-green-alpha-400);
  }

  .stat-value {
    font-weight: 700;
    font-size: 0.9rem;
    color: #f0f0f0;
  }

  .stat-chip-active .stat-value {
    color: var(--ds-green-500);
  }

  .stat-label {
    font-size: 0.78rem;
    color: rgba(163, 163, 163, 0.8);
  }

  .dashboard-section {
    margin-bottom: var(--space-6);
  }

  .section-label {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: var(--space-3);
  }

  .projects-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    animation: fadeIn 0.2s ease;
  }

  @media (max-width: 768px) {
    .stats-bar {
      flex-wrap: wrap;
    }
  }
</style>
