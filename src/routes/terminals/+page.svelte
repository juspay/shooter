<script lang="ts">
  import type { ShooterConfig, TerminalListItem } from '$lib/types';

  import { goto } from '$app/navigation';
  import {
    clearCache,
    EmptyState,
    formatRelativeTime,
    getCached,
    Icon,
    isShooterConfig,
    setCache,
  } from '$lib/modules/client/common';
  import LaunchSheet from '$lib/modules/client/terminal/LaunchSheet.svelte';
  import { Banner, Button, Pill, Shimmer, Tooltip } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';

  const POLL_INTERVAL_MS = 10_000;
  const CACHE_KEY = 'shooter_terminals';
  const AI_COMMANDS = ['claude', 'opencode'];
  const SHELL_COMMANDS = ['zsh', 'bash', 'sh', 'fish'];

  let terminals = $state<TerminalListItem[]>([]);
  let loading = $state(false);
  let fetching = false;
  let fetchError = $state<null | string>(null);
  let config = $state<null | ShooterConfig>(null);
  let pollTimer: null | ReturnType<typeof setInterval> = null;

  // Derived: split into running and exited for ordering
  const runningTerminals = $derived(terminals.filter((t) => t.status === 'running'));
  const exitedTerminals = $derived(terminals.filter((t) => t.status === 'exited'));

  onMount(() => {
    loadConfiguration();

    // Show cached data immediately (10s TTL matches poll interval)
    const cached = getCached(CACHE_KEY, 10_000) as null | TerminalListItem[];
    if (cached) {
      terminals = cached;
      loading = false;
    }

    // Then fetch fresh data in background
    void fetchTerminals();

    pollTimer = setInterval(() => {
      if (config?.apiKey) {
        void fetchTerminals();
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

  async function fetchTerminals(): Promise<void> {
    if (!config?.apiKey || fetching) {
      return;
    }
    fetching = true;

    // Don't show loading spinner if we already have cached data
    if (terminals.length === 0) {
      loading = true;
    }

    try {
      // Terminals API has no server-side cache; bustCache only clears client sessionStorage
      const url = '/api/terminals';
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        fetchError = `Failed to load terminals (HTTP ${response.status})`;
        return;
      }

      fetchError = null;
      const result = (await response.json()) as { terminals: TerminalListItem[] };
      terminals = result.terminals.map((t) => ({
        ...t,
        lastOutput: t.lastOutput ?? null,
      }));
      setCache(CACHE_KEY, terminals);
    } catch (error) {
      fetchError = 'Failed to load terminals';
      console.error('Failed to fetch terminals:', error);
    } finally {
      loading = false;
      fetching = false;
    }
  }

  async function forceRefresh(): Promise<void> {
    loading = true;
    clearCache(CACHE_KEY);
    await fetchTerminals();
  }

  function navigateToConfig(): void {
    void goto('/config');
  }

  let showLaunchSheet = $state(false);

  function handleNewTerminal(): void {
    showLaunchSheet = true;
  }

  function handleLaunchClose(): void {
    showLaunchSheet = false;
  }

  function handleLaunchComplete(response: { id: string }): void {
    showLaunchSheet = false;
    void goto(`/terminals/${response.id}`);
  }

  function getTerminalType(command: string): 'ai' | 'ended' | 'shell' {
    const base = command.split('/').pop() || command;
    if (AI_COMMANDS.includes(base)) {
      return 'ai';
    }
    if (SHELL_COMMANDS.includes(base)) {
      return 'shell';
    }
    return 'shell';
  }

  function getBadgeInfo(terminal: TerminalListItem): { class: string; label: string } {
    if (terminal.status === 'exited') {
      return { class: 'pill-badge-ended', label: 'ENDED' };
    }
    const type = getTerminalType(terminal.command);
    if (type === 'ai') {
      return { class: 'pill-badge-ai', label: 'AI' };
    }
    return { class: 'pill-badge-shell', label: 'SHELL' };
  }

  function truncatePath(path: string, maxLen = 40): string {
    if (path.length <= maxLen) {
      return path;
    }
    const parts = path.split('/');
    if (parts.length <= 3) {
      return path;
    }
    // Show first part + ... + last 2 segments
    return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
  }

  /* eslint-disable no-control-regex, no-useless-escape */
  function stripAnsi(str: string): string {
    return str
      .replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[[\?]?[0-9;]*[a-zA-Z]|\x1b/g, '')
      .replace(/[\x00-\x1f]/g, '')
      .trim();
  }
  /* eslint-enable no-control-regex, no-useless-escape */

  function truncateOutput(output: null | string, maxLen = 80): string {
    if (!output) {
      return '';
    }
    // Split on newlines BEFORE stripping ANSI so that \n characters survive
    // the control-character removal pass, then strip each line individually.
    const lines = output
      .split('\n')
      .map((l) => stripAnsi(l))
      .filter((l) => l.trim());
    const lastLine = lines[lines.length - 1] || '';
    if (lastLine.length <= maxLen) {
      return lastLine;
    }
    return `${lastLine.slice(0, maxLen)}...`;
  }

  function getCommandName(command: string): string {
    return command.split('/').pop() || command;
  }

  async function removeTerminal(event: MouseEvent, id: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!config?.apiKey) {
      return;
    }

    try {
      const response = await fetch(`/api/terminals/${id}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        method: 'DELETE',
      });

      if (response.ok) {
        terminals = terminals.filter((t) => t.id !== id);
        setCache(CACHE_KEY, terminals);
      }
    } catch (err) {
      console.error('Failed to remove terminal:', err);
    }
  }
</script>

<svelte:head>
  <title>Terminals - Shooter</title>
  <meta name="description" content="Active terminal sessions on this machine" />
</svelte:head>

<main class="main">
  <div class="page-header">
    <div class="page-header-content">
      <div>
        <h1 class="page-title">Terminals</h1>
        <p class="page-description">Active terminal sessions on this machine</p>
      </div>
      <div class="page-actions">
        <Button classes="btn-secondary" onclick={forceRefresh} disabled={loading}>
          <Icon name="refresh" size={14} />
          Refresh
        </Button>
        <Button classes="btn-primary" onclick={handleNewTerminal}>
          <span class="plus-icon">+</span>
          New Terminal
        </Button>
      </div>
    </div>
  </div>

  {#if fetchError}
    <Banner text={fetchError} classes="banner-error" />
  {/if}

  {#if loading && terminals.length === 0}
    <div class="loading-container">
      {#each Array(4) as _, i (i)}
        <Shimmer classes="shimmer-card" />
      {/each}
    </div>
  {:else if !config?.apiKey}
    <EmptyState
      icon="settings"
      title="Configuration Required"
      description="Set up your API credentials to view terminal sessions"
    >
      <Button classes="btn-primary" onclick={navigateToConfig} text="Configure Settings" />
    </EmptyState>
  {:else if terminals.length === 0}
    <EmptyState
      icon="terminal"
      title="No terminals"
      description="Launch a new terminal session to get started. Terminal sessions will appear here once created."
    >
      <Button classes="btn-primary" onclick={handleNewTerminal}>
        <span class="plus-icon">+</span>
        New Terminal
      </Button>
    </EmptyState>
  {:else}
    <div class="terminals-container">
      <!-- Running terminals first -->
      {#each runningTerminals as terminal (terminal.id)}
        {@const badge = getBadgeInfo(terminal)}
        <a href="/terminals/{terminal.id}" class="terminal-card">
          <div class="terminal-card-header">
            <div class="terminal-card-left">
              <span class="status-indicator status-running">
                <span class={terminal.isActive ? 'status-dot-active' : 'status-dot-idle'}></span>
              </span>
              <span class="terminal-command">{getCommandName(terminal.command)}</span>
              <Pill text={badge.label} classes={badge.class} />
            </div>
            <span class="terminal-time">{formatRelativeTime(terminal.createdAt)}</span>
          </div>

          <div class="terminal-card-meta">
            <Tooltip text={terminal.currentCwd || terminal.cwd} position="bottom">
              <span class="terminal-cwd">{truncatePath(terminal.currentCwd || terminal.cwd)}</span>
            </Tooltip>
            <span class="terminal-pid">PID {terminal.pid}</span>
          </div>

          {#if terminal.lastOutput}
            <div class="terminal-preview">
              <span class="terminal-preview-text">{truncateOutput(terminal.lastOutput)}</span>
            </div>
          {/if}
        </a>
      {/each}

      <!-- Exited terminals at lower opacity -->
      {#each exitedTerminals as terminal (terminal.id)}
        {@const badge = getBadgeInfo(terminal)}
        <a href="/terminals/{terminal.id}" class="terminal-card terminal-card-exited">
          <div class="terminal-card-header">
            <div class="terminal-card-left">
              <span class="status-indicator status-exited">
                <span class="status-dot-static"></span>
              </span>
              <span class="terminal-command">{getCommandName(terminal.command)}</span>
              <Pill text={badge.label} classes={badge.class} />
              {#if terminal.exitCode !== null}
                <Pill
                  text="exit {terminal.exitCode}"
                  classes={terminal.exitCode !== 0 ? 'pill-exit-error' : 'pill-exit-ok'}
                />
              {/if}
            </div>
            <div class="terminal-card-right">
              <span class="terminal-time">
                {terminal.exitedAt
                  ? formatRelativeTime(terminal.exitedAt)
                  : formatRelativeTime(terminal.createdAt)}
              </span>
              <Button
                classes="btn-ghost btn-sm btn-remove"
                onclick={(e: MouseEvent): void => void removeTerminal(e, terminal.id)}
                text="&times;"
              />
            </div>
          </div>

          <div class="terminal-card-meta">
            <Tooltip text={terminal.cwd} position="bottom">
              <span class="terminal-cwd">{truncatePath(terminal.cwd)}</span>
            </Tooltip>
          </div>

          {#if terminal.lastOutput}
            <div class="terminal-preview">
              <span class="terminal-preview-text">{truncateOutput(terminal.lastOutput)}</span>
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</main>

{#if config?.apiKey}
  <LaunchSheet
    open={showLaunchSheet}
    apiKey={config.apiKey}
    onClose={handleLaunchClose}
    onLaunch={handleLaunchComplete}
  />
{/if}

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

  .plus-icon {
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
  }

  /* Terminals list */
  .terminals-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    animation: fadeIn 0.2s ease;
  }

  /* Terminal card */
  .terminal-card {
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    text-decoration: none;
    color: inherit;
    overflow: hidden;
    min-width: 0;
  }

  .terminal-card:hover {
    border-color: var(--border-hover);
    background: var(--component-bg-hover);
  }

  .terminal-card-exited {
    opacity: 0.55;
  }

  .terminal-card-exited:hover {
    opacity: 0.75;
  }

  /* Card header row */
  .terminal-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .terminal-card-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex-wrap: wrap;
  }

  /* Status indicators */
  .status-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }

  .status-dot-active {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
    animation: activity-pulse 600ms ease-in-out infinite;
  }

  .status-dot-idle {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ds-gray-600);
  }

  .status-dot-static {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ds-gray-600);
  }

  @keyframes activity-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.7;
    }
  }

  /* Command name */
  .terminal-command {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  /* Time */
  .terminal-time {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Right side of exited card header */
  .terminal-card-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  /* Meta row: cwd + pid */
  .terminal-card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .terminal-cwd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .terminal-pid {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ds-gray-600);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Output preview strip */
  .terminal-preview {
    background: var(--ds-background-200);
    border: 1px solid var(--ds-gray-alpha-200);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    overflow: hidden;
  }

  .terminal-preview-text {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ds-gray-700);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    line-height: var(--leading-normal);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page-header-content {
      flex-direction: column;
      gap: var(--space-4);
    }

    .terminal-card {
      padding: var(--space-3);
    }

    .terminal-card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .terminal-time {
      align-self: flex-start;
    }

    .terminal-command {
      max-width: 160px;
    }
  }

  @media (max-width: 480px) {
    .page-actions {
      flex-direction: column;
      width: 100%;
    }

    .page-actions :global(button) {
      width: 100%;
      flex: 1;
    }

    .terminal-command {
      max-width: 120px;
    }
  }
</style>
