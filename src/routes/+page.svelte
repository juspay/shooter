<script lang="ts">
  import type { ProjectGroup, ShooterConfig } from '$generated/types';

  import { goto } from '$app/navigation';
  import {
    EmptyState,
    formatRelativeTime,
    getCached,
    Icon,
    isShooterConfig,
    setCache,
  } from '$lib/modules/client/common';
  import { Button, Pill, Shimmer } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  const POLL_INTERVAL_MS = 30_000; // 30s - avoid heavy reflows
  const PAGE_SIZE = 20;

  let projects = $state<ProjectGroup[]>([]);
  let loading = $state(false);
  let fetching = false; // non-reactive guard to prevent overlapping fetches
  let config = $state<null | ShooterConfig>(null);
  let pollTimer: null | ReturnType<typeof setInterval> = null;
  let hasMore = $state(false);
  let currentOffset = $state(0);

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
      if (config?.apiKey) {
        void fetchSessions();
      }
    }, POLL_INTERVAL_MS);
  });

  onDestroy(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  function loadConfiguration(): void {
    try {
      const saved = localStorage.getItem('shooter_config');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isShooterConfig(parsed)) {
          config = parsed;
        } else {
          localStorage.removeItem('shooter_config');
          config = null;
        }
      }
    } catch {
      // No configuration found — expected on first visit
    }
  }

  async function fetchSessions(append = false): Promise<void> {
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
      const response = await fetch(`/api/sessions?limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const result: { projects: ProjectGroup[]; total?: number } = await response.json();
      if (append) {
        projects = [...projects, ...result.projects];
      } else {
        projects = result.projects;
      }
      currentOffset = projects.length;
      hasMore = result.total !== undefined ? projects.length < result.total : false;
      setCache('shooter_projects', projects);
    } catch (error) {
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
    sessionStorage.removeItem('shooter_projects');
    await fetchSessions();
  }

  function navigateToConfig(): void {
    void goto('/config');
  }

  function totalSessionCount(): number {
    return projects.reduce((sum, p) => sum + p.sessionCount, 0);
  }
</script>

<svelte:head>
  <title>Projects - Shooter</title>
  <meta name="description" content="Claude Code sessions across all projects" />
</svelte:head>

<main class="main">
  <div class="page-header">
    <div class="page-header-content">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-description">Claude Code sessions across all projects</p>
      </div>
      <div class="page-actions">
        <Button classes="btn-secondary" onclick={forceRefresh} disabled={loading}>
          <Icon name="refresh" size={14} />
          Refresh
        </Button>
      </div>
    </div>
  </div>

  {#if loading && projects.length === 0}
    <div class="loading-container">
      {#each Array(5) as _, i (i)}
        <Shimmer classes="shimmer-card" />
      {/each}
    </div>
  {:else if !config?.apiKey}
    <EmptyState
      icon="settings"
      title="Configuration Required"
      description="Set up your API credentials to start tracking sessions"
    >
      <Button classes="btn-primary" onclick={navigateToConfig} text="Configure Settings" />
    </EmptyState>
  {:else if totalSessionCount() === 0}
    <EmptyState
      icon="bell"
      title="No sessions yet"
      description="Claude Code sessions will appear here once JSONL files are found"
    />
  {:else}
    <div class="projects-container">
      {#each projects as project (project.id)}
        <a href="/project?id={project.id}" class="session-card">
          <div class="session-card-header">
            <div>
              <h3 class="session-card-title">{project.name}</h3>
              <div class="session-card-subtitle">{project.fullPath}</div>
            </div>
            <Pill text={formatRelativeTime(project.lastModified)} classes="pill-session-time" />
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
</main>

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .page-title {
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: var(--space-1);
  }

  .page-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .page-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .projects-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    animation: fadeIn 0.2s ease;
  }

  @media (max-width: 768px) {
    .page-header-content {
      flex-direction: column;
      gap: var(--space-4);
    }
  }

  @media (max-width: 480px) {
    .page-actions {
      width: 100%;
    }

    .page-actions :global(button) {
      flex: 1;
    }
  }
</style>
