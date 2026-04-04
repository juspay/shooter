<script lang="ts">
  import type { DetectedProcess, ProjectGroup, ShooterConfig } from '$lib/types';

  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import RefreshSvg from '$lib/assets/icons/refresh.svg?raw';
  import {
    clearCache,
    formatRelativeTime,
    getCached,
    isShooterConfig,
    setCache,
  } from '$lib/modules/client/common';
  import { Banner, Button, EmptyState, Icon, Pill, Shimmer } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  const POLL_INTERVAL_MS = 15_000;
  const PAGE_SIZE = 20;

  let project = $state<null | ProjectGroup>(null);
  let loading = $state(true);
  let config = $state<null | ShooterConfig>(null);
  let fetchError = $state<null | string>(null);
  let pollTimer: null | ReturnType<typeof setInterval> = null;
  let visibleCount = $state(PAGE_SIZE);
  let detectedProcesses = $state<DetectedProcess[]>([]);
  let connectingSessionId = $state<null | string>(null);

  const projectId = $derived(page.url.searchParams.get('id') || '');

  const visibleSessions = $derived(project ? project.sessions.slice(0, visibleCount) : []);
  const hasMore = $derived(project ? visibleCount < project.sessions.length : false);

  // Build a set of session IDs that have running processes
  const runningSessionIds = $derived(
    new Set(
      detectedProcesses.map((p) => p.sessionId).filter((id): id is string => typeof id === 'string')
    )
  );

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
      void detectRunningProcesses();
    }, 50);

    pollTimer = setInterval(() => {
      if (config?.apiKey && projectId) {
        void fetchProject();
        void detectRunningProcesses();
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

  async function fetchProject(bustCache = false): Promise<void> {
    if (!config?.apiKey || !projectId) {
      loading = false;
      return;
    }

    // Don't show loading spinner if we already have cached data
    if (!project) {
      loading = true;
    }

    try {
      const url = bustCache ? '/api/sessions?refresh=true' : '/api/sessions';
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        fetchError = `Failed to load project (HTTP ${response.status})`;
        loading = false;
        return;
      }

      fetchError = null;
      const result = (await response.json()) as { projects: ProjectGroup[] };
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

  async function detectRunningProcesses(): Promise<void> {
    if (!config?.apiKey) {
      return;
    }

    try {
      const response = await fetch('/api/sessions/detect', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { processes: DetectedProcess[] };
        detectedProcesses = data.processes;
      }
    } catch {
      // Best effort — don't break the page
    }
  }

  async function connectToSession(
    event: MouseEvent,
    sessionId: string,
    command: string
  ): Promise<void> {
    // Prevent the click from navigating to the session page
    event.preventDefault();
    event.stopPropagation();

    if (!config?.apiKey || !project || connectingSessionId) {
      return;
    }

    connectingSessionId = sessionId;

    try {
      const response = await fetch('/api/sessions/connect', {
        body: JSON.stringify({
          command,
          cwd: project.fullPath,
          sessionId,
        }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (response.ok) {
        const result = (await response.json()) as { terminalId: string };
        void goto(`/terminals/${result.terminalId}`);
      }
    } catch (error) {
      console.error('Failed to connect to session:', error);
    } finally {
      connectingSessionId = null;
    }
  }

  async function forceRefresh(): Promise<void> {
    loading = true;
    project = null;
    visibleCount = PAGE_SIZE;
    clearCache(`shooter_project_${projectId}`);
    await fetchProject(true);
    await detectRunningProcesses();
  }

  function loadMore(): void {
    visibleCount += PAGE_SIZE;
  }

  function formatDate(ts: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleDateString('en-US', {
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
  {#if fetchError}
    <Banner text={fetchError} classes="banner-error" />
  {/if}

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
      title="Project Not Found"
      description="The requested project could not be found."
    >
      {#snippet icon()}<Icon svg={AlertTriangleSvg} classes="icon-24" />{/snippet}
    </EmptyState>
  {:else}
    <div class="chat-session-header">
      <div class="chat-session-header-top">
        <a href="/" class="back-link">&#8592; Back to Projects</a>
        <Button classes="btn-secondary" onclick={forceRefresh} disabled={loading}>
          <Icon svg={RefreshSvg} classes="icon-14" />
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
        title="No sessions yet"
        description="Sessions for this project will appear here"
      >
        {#snippet icon()}<Icon svg={BellSvg} classes="icon-24" />{/snippet}
      </EmptyState>
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
              <div class="session-card-actions">
                <Pill text={formatRelativeTime(session.modified)} classes="pill-session-time" />
                {#if runningSessionIds.has(session.id)}
                  <Button
                    classes="btn-connect btn-xs"
                    onclick={(e: MouseEvent): void =>
                      void connectToSession(
                        e,
                        session.id,
                        session.source === 'opencode' ? 'opencode' : 'claude'
                      )}
                    disabled={connectingSessionId === session.id}
                    showLoader={connectingSessionId === session.id}
                  >
                    <span class="connect-dot"></span>
                    Connect
                  </Button>
                {:else}
                  <Button
                    classes="btn-resume btn-xs"
                    onclick={(e: MouseEvent): void =>
                      void connectToSession(
                        e,
                        session.id,
                        session.source === 'opencode' ? 'opencode' : 'claude'
                      )}
                    disabled={connectingSessionId === session.id}
                    showLoader={connectingSessionId === session.id}
                    text="Resume"
                  />
                {/if}
              </div>
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
            <div class="session-meta-row">
              <span class="session-modified">Last updated {formatDate(session.modified)}</span>
              <span class="session-duration">Created {formatDate(session.created)}</span>
            </div>
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

  .session-card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .connect-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ds-green-500);
    margin-right: 2px;
    flex-shrink: 0;
  }

  .session-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .session-duration,
  .session-modified {
    font-size: 0.75rem;
    color: var(--color-text-tertiary, #888);
  }

  @media (max-width: 480px) {
    .chat-session-header-top {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .session-card-actions {
      flex-wrap: wrap;
    }
  }
</style>
