<script lang="ts">
  import type { DashboardCard } from '$lib/types';

  import { Pill } from '@juspay/svelte-ui-components';

  const { card, onclick }: { card: DashboardCard; onclick?: () => void } = $props();

  function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) {
      return `${s}s`;
    }
    const m = Math.floor(s / 60);
    if (m < 60) {
      return `${m}m ${s % 60}s`;
    }
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  function shortPath(fullPath: string): string {
    const parts = fullPath.replace(/\/$/, '').split('/');
    if (parts.length <= 2) {
      return fullPath;
    }
    return parts.slice(-2).join('/');
  }

  const borderColor = $derived(
    card.status === 'running' && card.isActive
      ? 'var(--ds-green-700)'
      : card.status === 'running'
        ? 'var(--ds-blue-700)'
        : card.status === 'idle'
          ? 'var(--ds-amber-700)'
          : card.status === 'error'
            ? 'var(--ds-red-700)'
            : 'var(--ds-gray-600)'
  );

  const statusLabel = $derived(
    card.status === 'running' && card.isActive
      ? '● Running'
      : card.status === 'running'
        ? '● Running'
        : card.status === 'idle'
          ? '◎ Idle'
          : card.status === 'exited'
            ? '○ Done'
            : card.status === 'error'
              ? '✕ Error'
              : card.status
  );

  const statusPillClass = $derived(
    card.status === 'running' && card.isActive
      ? 'status-pill status-pill--running-active'
      : card.status === 'running'
        ? 'status-pill status-pill--running'
        : card.status === 'idle'
          ? 'status-pill status-pill--idle'
          : card.status === 'exited'
            ? 'status-pill status-pill--exited'
            : card.status === 'error'
              ? 'status-pill status-pill--error'
              : 'status-pill'
  );

  const fallbackSummary = $derived(
    card.toolCallCount === 0
      ? 'Waiting for activity…'
      : card.toolCallCount === 1
        ? '1 tool call so far'
        : `${card.toolCallCount} tool calls so far`
  );

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') {
        e.preventDefault();
      }
      onclick?.();
    }
  }
</script>

<div
  class="card"
  style="--status-color: {borderColor}"
  role="button"
  tabindex="0"
  aria-label="Open {card.projectName} session"
  {onclick}
  onkeydown={handleKeydown}
>
  <!-- Header row: project name + status badge -->
  <div class="card-header">
    <span class="project-name">{card.projectName}</span>
    <Pill text={statusLabel} classes={statusPillClass} />
  </div>

  <!-- Goal row -->
  {#if card.goal}
    <p class="goal-text">{card.goal}</p>
  {/if}

  <!-- Summary row -->
  <div class="summary-row">
    {#if card.isSummarizing}
      <span class="summarizing">Analyzing…</span>
    {:else if card.summary}
      <span class="summary-text">{card.summary}</span>
    {:else if card.status === 'running'}
      <span class="summary-fallback">{fallbackSummary}</span>
    {/if}
  </div>

  <!-- Stats row -->
  <div class="stats-row">
    <span class="stat">
      <span
        class={card.status === 'running' && card.isActive
          ? 'status-dot-active'
          : 'status-dot-static'}
      ></span>
      {formatDuration(card.duration)}
    </span>
    <span class="stat">{card.toolCallCount} tools</span>
    {#if card.errorCount > 0}
      <span class="stat stat-error">{card.errorCount} errors</span>
    {/if}
    <span class="stat stat-path" title={card.cwd}>{shortPath(card.cwd)}</span>
  </div>
</div>

<style>
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
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

  .card {
    background: var(--component-bg, #1a1a1a);
    border: 1px solid var(--border, #2e2e2e);
    border-left: 4px solid var(--status-color, #6b7280);
    border-radius: var(--radius-lg, 8px);
    padding: var(--space-4, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    cursor: pointer;
    transition:
      border-color var(--transition-fast, 150ms ease),
      background var(--transition-fast, 150ms ease);
    color: inherit;
    text-align: left;
    width: 100%;
  }

  .card:hover {
    background: var(--component-bg-hover, #1f1f1f);
    border-color: var(--border-hover, #454545);
    border-left-color: var(--status-color, #6b7280);
  }

  .card:focus-visible {
    outline: 2px solid var(--ds-blue-700, #0070f3);
    outline-offset: 2px;
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2, 8px);
    min-width: 0;
  }

  .project-name {
    font-size: var(--text-base, 14px);
    font-weight: 600;
    color: var(--text-primary, #ededed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  /*
   * Status pill variants — applied via the `classes` prop on @juspay/svelte-ui-components <Pill>.
   * The Pill component uses CSS custom properties for theming, so we override them per variant.
   * Custom pill CSS is kept here rather than using Pill's built-in variants because the library
   * Pill does not provide status-semantic colour variants out of the box.
   */
  :global(.status-pill) {
    --pill-font-size: var(--text-xs, 12px);
    --pill-font-weight: 500;
    --pill-padding: 3px 10px;
    --pill-border-radius: var(--radius-full, 9999px);
    --pill-cursor: default;
    flex-shrink: 0;
  }

  :global(.status-pill--running-active) {
    --pill-background: var(--ds-green-100);
    --pill-color: var(--ds-green-700);
    --pill-hover-background: var(--ds-green-100);
    --pill-hover-color: var(--ds-green-700);
    animation: pulse 2s ease-in-out infinite;
  }

  :global(.status-pill--running) {
    --pill-background: var(--ds-blue-100);
    --pill-color: var(--ds-blue-700);
    --pill-hover-background: var(--ds-blue-100);
    --pill-hover-color: var(--ds-blue-700);
  }

  :global(.status-pill--idle) {
    --pill-background: var(--ds-amber-100);
    --pill-color: var(--ds-amber-700);
    --pill-hover-background: var(--ds-amber-100);
    --pill-hover-color: var(--ds-amber-700);
  }

  :global(.status-pill--exited) {
    --pill-background: var(--ds-gray-alpha-200);
    --pill-color: var(--ds-gray-600);
    --pill-hover-background: var(--ds-gray-alpha-200);
    --pill-hover-color: var(--ds-gray-600);
  }

  :global(.status-pill--error) {
    --pill-background: var(--ds-red-100);
    --pill-color: var(--ds-red-700);
    --pill-hover-background: var(--ds-red-100);
    --pill-hover-color: var(--ds-red-700);
  }

  /* Goal */
  .goal-text {
    font-size: var(--text-sm, 13px);
    color: var(--text-secondary, #a1a1a1);
    font-style: italic;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: var(--leading-normal, 1.5);
  }

  /* Summary */
  .summary-row {
    min-height: 18px;
  }

  .summary-text {
    font-size: var(--text-sm, 13px);
    color: var(--text-primary, #ededed);
    line-height: var(--leading-normal, 1.5);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .summarizing {
    font-size: var(--text-xs, 12px);
    color: var(--ds-amber-700);
    font-style: italic;
  }

  .summary-fallback {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #7d7d7d);
    font-style: italic;
  }

  /* Stats */
  .stats-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    flex-wrap: wrap;
    min-width: 0;
  }

  .stat {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #7d7d7d);
    white-space: nowrap;
  }

  .stat-error {
    color: var(--ds-red-700);
  }

  .stat-path {
    font-family: var(--font-mono, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
    text-align: right;
  }

  /* Status dots */
  .status-dot-active {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ds-green-700);
    animation: activity-pulse 600ms ease-in-out infinite;
    flex-shrink: 0;
  }

  .status-dot-static {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ds-gray-600, #878787);
    flex-shrink: 0;
  }

  /* Mobile breakpoints */
  @media (max-width: 768px) {
    .card {
      padding: 10px 12px;
    }

    .stats-row {
      flex-wrap: wrap;
      gap: 4px;
    }
  }

  @media (max-width: 480px) {
    .card {
      padding: 8px 10px;
    }

    .goal-text {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }
</style>
