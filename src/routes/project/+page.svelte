<script lang="ts">
  import type { ShooterConfig } from '$lib/types/config';

  import { page } from '$app/state';
  import { Button, EmptyState, Icon } from '$lib/modules/client/common';
  import { onDestroy, onMount } from 'svelte';

  interface Session {
    created: string;
    gitBranch: string;
    id: string;
    messageCount: number;
    modified: string;
    projectPath: string;
    source: 'claude-code' | 'opencode';
    summary: string;
    title: string;
  }

  interface ProjectGroup {
    fullPath: string;
    id: string;
    lastModified: string;
    name: string;
    sessionCount: number;
    sessions: Session[];
  }

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

  // Cache helpers using sessionStorage
  function getCached(key: string): unknown {
    try {
      const item = sessionStorage.getItem(key);
      if (!item) {
        return null;
      }
      const { data, timestamp } = JSON.parse(item);
      // Cache valid for 30 seconds
      if (Date.now() - timestamp > 30000) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function setCache(key: string, data: unknown): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // sessionStorage full — silently ignore
    }
  }

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

  function isShooterConfig(value: unknown): value is ShooterConfig {
    return (
      typeof value === 'object' && value !== null && 'apiKey' in value && 'deviceToken' in value
    );
  }

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

  function formatRelativeTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {
      return 'just now';
    }
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      return `${hrs}h ago`;
    }
    return `${Math.floor(hrs / 24)}d ago`;
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
      <div class="skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
      {#each Array(4) as _, i (i)}
        <div class="skeleton skeleton-card"></div>
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
        <Button variant="secondary" onclick={forceRefresh} disabled={loading}>
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
              <span class="session-badge session-badge-complete">
                <span class="session-badge-dot"></span>
                {formatRelativeTime(session.modified)}
              </span>
            </div>
            <div class="session-stats">
              <span><strong>{session.messageCount}</strong> messages</span>
              {#if session.source === 'opencode'}
                <span class="source-badge source-badge-opencode">OpenCode</span>
              {:else}
                <span class="source-badge source-badge-claude">Claude Code</span>
              {/if}
            </div>
            <div class="session-duration">Created {formatDate(session.created)}</div>
          </a>
        {/each}
      </div>
      {#if hasMore}
        <div style="text-align: center; padding: 1rem;">
          <Button variant="secondary" onclick={loadMore}>
            Load More ({project.sessions.length - visibleCount} remaining)
          </Button>
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
</style>
