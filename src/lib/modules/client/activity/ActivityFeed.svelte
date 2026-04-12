<script lang="ts">
  import { formatRelativeTime, getApiKey } from '$lib/modules/client/common';
  import { Banner, Button } from '@juspay/svelte-ui-components';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

  import {
    connect,
    disconnect,
    getEvents,
    getSummaries,
    isAiAvailable,
    isConnected,
    isSummarizing,
  } from './store.svelte';

  let showRaw = $state(false);

  async function getTicket(): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured');
    }
    const res = await fetch('/api/ws-ticket', {
      headers: { Authorization: `Bearer ${apiKey}` },
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error('Failed to get WS ticket');
    }
    const data = (await res.json()) as { ticket: string };
    return data.ticket;
  }

  onMount(() => {
    void connect(getTicket);
  });

  onDestroy(() => {
    disconnect();
  });

  const summaries = $derived(getSummaries());
  const events = $derived(getEvents());
  const connected = $derived(isConnected());
  const aiReady = $derived(isAiAvailable());
  const summarizing = $derived(isSummarizing());
  const unsummarizedCount = $derived(events.filter((e) => !e.summarized).length);

  // Get unique session count for status display
  const activeSessionCount = $derived.by(() => {
    const sessionIds = new SvelteSet<string>();
    for (const e of events) {
      if (e.sessionId) {
        sessionIds.add(e.sessionId);
      }
    }
    return sessionIds.size;
  });

  // Group summaries by projectName
  const projectGroups = $derived.by(() => {
    const groups = new SvelteMap<string, { name: string; summaries: typeof summaries }>();
    for (const s of [...summaries].reverse()) {
      const name = s.projectName || 'Unknown';
      if (!groups.has(name)) {
        groups.set(name, { name, summaries: [] });
      }
      const group = groups.get(name);
      if (group) {
        group.summaries.push(s);
      }
    }
    return Array.from(groups.values());
  });
</script>

<div class="feed">
  <header>
    <h2>Activity</h2>
    <span class="status" class:live={connected}>
      {connected ? `● Watching ${activeSessionCount} sessions` : '○ No active sessions'}
    </span>
    {#if summarizing}
      <span class="summarizing">Summarizing...</span>
    {/if}
  </header>

  {#if !aiReady}
    <Banner
      text="AI summaries unavailable — configure a provider to enable"
      classes="banner-warning"
    />
  {/if}

  <div class="entries">
    {#if summaries.length === 0 && events.length === 0}
      <p class="empty">
        No recent activity. Summaries will appear here when Claude Code sessions are active on this
        machine.
      </p>
    {/if}

    {#each projectGroups as group (group.name)}
      <div class="project-group">
        <h3 class="project-name">{group.name}</h3>
        {#each group.summaries as summary (summary.id)}
          <div class="summary-card">
            <time>{formatRelativeTime(summary.timestamp)}</time>
            <p>{summary.text}</p>
            <span class="event-count">{summary.eventIds.length} events</span>
          </div>
        {/each}
      </div>
    {/each}

    {#if unsummarizedCount > 0}
      <div class="pending">
        <span>{unsummarizedCount} events pending summary...</span>
      </div>
    {/if}
  </div>

  <Button
    classes="btn-ghost raw-toggle"
    onclick={(): void => {
      showRaw = !showRaw;
    }}
  >
    {showRaw ? '▾' : '▸'} Raw events ({events.length})
  </Button>

  {#if showRaw}
    <div class="raw-events">
      {#each [...events].reverse().slice(0, 50) as event (event.id)}
        <div class="raw-event" class:summarized={event.summarized}>
          <time>{formatRelativeTime(event.timestamp)}</time>
          <span class="project">{event.projectName || 'Unknown'}</span>
          <span class="type">{event.type}</span>
          {#if event.data.tool}
            <span class="tool">{event.data.tool}</span>
          {/if}
          {#if event.data.filePath}
            <code class="file-path">{(event.data.filePath as string).slice(0, 80)}</code>
          {/if}
          {#if event.data.command}
            <code>{(event.data.command as string).slice(0, 60)}</code>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .feed {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  .status {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .status.live {
    color: var(--ds-green-700);
  }
  .summarizing {
    font-size: var(--text-xs);
    color: var(--ds-amber-700);
  }
  .entries {
    flex: 1;
    overflow-y: auto;
  }
  .empty {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
  }
  .summary-card {
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
    background: var(--component-bg);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--ds-green-700);
  }
  .summary-card time {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .summary-card p {
    margin: var(--space-1) 0 2px;
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
  .event-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
  .pending {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    color: var(--ds-amber-700);
  }
  :global(.raw-toggle) {
    --button-color: transparent;
    --button-text-color: var(--text-tertiary);
    --button-hover-color: transparent;
    --button-hover-text-color: var(--text-secondary);
    --button-font-family: var(--font-mono);
    --button-font-size: var(--text-xs);
    --button-padding: var(--space-2) 0;
    text-align: left;
  }
  .raw-events {
    font-size: var(--text-xs);
    max-height: 200px;
    overflow-y: auto;
  }
  .raw-event {
    display: flex;
    gap: var(--space-2);
    padding: 2px 0;
    opacity: 1;
  }
  .raw-event.summarized {
    opacity: 0.5;
  }
  .raw-event time {
    color: var(--text-tertiary);
    min-width: 60px;
  }
  .raw-event .project {
    color: var(--text-tertiary);
    min-width: 80px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .type {
    color: var(--ds-blue-700);
  }
  .project-group {
    margin-bottom: var(--space-4);
  }
  .project-name {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .tool {
    color: var(--ds-green-700);
  }
  .file-path {
    color: var(--ds-amber-700);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  code {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }
</style>
