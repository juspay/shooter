<script lang="ts">
  import type { ProjectGroup, ShooterConfig } from '$generated/types';

  import { page } from '$app/state';
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

  const POLL_INTERVAL_MS = 15_000;
  const PAGE_SIZE = 20;

  let project = $state<null | ProjectGroup>(null);
  let loading = $state(true);
  let config = $state<null | ShooterConfig>(null);
  let pollTimer: null | ReturnType<typeof setInterval> = null;
  let visibleCount = $state(PAGE_SIZE);

  const projectId = $derived(page.url.searchParams.get('id') || '');

  const visibleSessions = $derived(project ? project.sessions.slice(0, visibleCount) : []);
  const hasMore = $derived(project ? visibleCount < project.sessions.length : false);

  onMount(() => {
    loadConfiguration();

    // Show cached data immediately
    const cached = getCached(`shooter_project_${projectId}`) as null | ProjectGroup;
    if (cached) {
      project = cached;
      loading = false;
    }

    // Delay initial fetch to ensure config and projectId are resolved
    setTimeout(() => {
      void fetchProject();
    }, 50);

    pollTimer = setInterval(() => {
      if (config?.apiKey && projectId) {
        void fetchProject();
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
      // No configuration — expected on first visit
    }
  }

  async function fetchProject(): Promise<void> {
    if (!config?.apiKey || !projectId) {
      loading = false;
      return;
    }

    // Don't show loading spinner if we already have cached data
    if (!project) {
      loading = true;
    }

    try {
      const response = await fetch('/api/sessions', {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        loading = false;
        return;
      }

      const result: { projects: ProjectGroup[] } = await response.json();
      const foundProject = result.projects.find((p) => p.id === projectId) || null;
      project = foundProject;
      if (foundProject) {
        setCache(`shooter_project_${projectId}`, foundProject);
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      loading = false;
    }
  }

  async function forceRefresh(): Promise<void> {
    loading = true;
    sessionStorage.removeItem(`shooter_project_${projectId}`);
    visibleCount = PAGE_SIZE;
    await fetchProject();
  }

  function loadMore(): void {
    visibleCount += PAGE_SIZE;
  }

  function formatDate(ts: string): string {
    return new Date(ts).toLocaleDateString('en-US', {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
    });
  }

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength).trimEnd()}...`;
  }
</script>

<svelte:head>
  <title>{project?.name || 'Project'} - Shooter</title>
  <meta name="description" content="Project sessions sorted by latest update" />
</svelte:head>

<main class="main">
  {#if loading && !project}
    <div class="loading-container">
      <Shimmer classes="shimmer-header" />
      {#each Array(4) as _, i (i)}
        <Shimmer classes="shimmer-card" />
      {/each}
    </div>
  {:else if !project}
    <div class="project-back-row">
      <a href="/" class="back-link">
        <span class="back-arrow">&larr;</span>
        Back to Projects
      </a>
    </div>
    <EmptyState
      icon="alert-triangle"
      title="Project Not Found"
      description="The requested project could not be found."
    />
  {:else}
    <div class="chat-session-header">
      <div class="chat-session-header-top">
        <a href="/" class="back-link">&#8592; Back to Projects</a>
        <Button classes="btn-secondary" onclick={forceRefresh} disabled={loading}>
          <Icon name="refresh" size={14} />
          Refresh
        </Button>
      </div>
      <h1 class="chat-session-title">{project.name}</h1>
      <div class="chat-session-meta">
        <span class="session-card-subtitle">{project.fullPath}</span>
        <span>{project.sessionCount} sessions</span>
      </div>
    </div>

    {#if project.sessions.length === 0}
      <EmptyState
        icon="bell"
        title="No sessions yet"
        description="Sessions for this project will appear here"
      />
    {:else}
      <div class="sessions-container">
        {#each visibleSessions as session (session.id)}
          <a href="/session/{session.id}?project={projectId}" class="session-card">
            <div class="session-card-header">
              <div>
                <h3 class="session-card-title">{session.title}</h3>
                {#if session.summary}
                  <div class="session-card-subtitle">{truncate(session.summary, 80)}</div>
                {/if}
              </div>
              <Pill text={formatRelativeTime(session.modified)} classes="pill-session-time" />
            </div>
            <div class="session-stats">
              <span><strong>{session.messageCount}</strong> messages</span>
              {#if session.gitBranch}
                <Pill text="🌿 {session.gitBranch}" classes="pill-git-branch" />
              {/if}
              {#if session.source === 'opencode'}
                <Pill text="OpenCode" classes="pill-source-opencode" />
              {:else}
                <Pill text="Claude Code" classes="pill-source-claude" />
              {/if}
            </div>
            <div class="session-duration">Created {formatDate(session.created)}</div>
          </a>
        {/each}
      </div>
      {#if hasMore}
        <div style="text-align: center; padding: 1rem;">
          <Button
            classes="btn-secondary"
            onclick={loadMore}
            text={`Load More (${project.sessions.length - visibleCount} remaining)`}
          />
        </div>
      {/if}
    {/if}
  {/if}
</main>

<style>
  .project-back-row {
    margin-bottom: var(--space-5);
  }

  .chat-session-header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .sessions-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  @media (max-width: 480px) {
    .chat-session-header-top {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
  }
</style>
