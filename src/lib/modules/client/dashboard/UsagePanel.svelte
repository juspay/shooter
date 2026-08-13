<script lang="ts">
  import type { SessionUsage, TokenCounts, UsageSnapshot } from '$lib/types';

  import { formatRelativeTime, getApiKey } from '$lib/modules/client/common';
  import { onDestroy, onMount } from 'svelte';

  // A top-style readout: what the agents are burning RIGHT NOW, per session.
  // Everything shown covers the trailing window only — the transcript corpus
  // runs to gigabytes, so a lifetime ledger is not on offer (see usage-reader).

  const WINDOWS = [
    { label: '15m', minutes: 15 },
    { label: '1h', minutes: 60 },
    { label: '6h', minutes: 360 },
    { label: '24h', minutes: 1440 },
  ];
  const POLL_MS = 15_000;

  let snapshot = $state<null | UsageSnapshot>(null);
  let windowMinutes = $state(60);
  let expanded = $state(false);
  let loading = $state(true);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  // Responses can land out of order — a slow 24h scan started before a fast 15m
  // one would otherwise overwrite it, showing the wrong window's numbers under
  // the newly-selected control. Only the newest request may commit.
  let requestSeq = 0;

  const sessions = $derived(snapshot?.sessions ?? []);
  const shown = $derived(expanded ? sessions : sessions.slice(0, 4));
  const busiest = $derived(sessions[0]?.tokens.totalTokens ?? 0);

  function authHeaders(): Record<string, string> {
    const key = getApiKey();
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  /** Compact token counts — 41.5B is readable, 41,518,761,833 is not. */
  function compact(n: number): string {
    if (n >= 1_000_000_000) {
      return `${(n / 1_000_000_000).toFixed(1)}B`;
    }
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (n >= 1_000) {
      return `${(n / 1_000).toFixed(1)}K`;
    }
    return String(Math.round(n));
  }

  /**
   * Money, or an explicit dash.
   *
   * `priced` false means the rate is UNKNOWN, not zero. Rendering "$0.00" there
   * would under-report spend while looking authoritative, so it renders "—".
   */
  function money(amount: number, priced: boolean): string {
    if (!priced) {
      return '—';
    }
    return amount >= 100 ? `$${Math.round(amount)}` : `$${amount.toFixed(2)}`;
  }

  /** Share of the busiest session, for the inline bar. */
  function share(tokens: TokenCounts): number {
    return busiest > 0 ? Math.round((tokens.totalTokens / busiest) * 100) : 0;
  }

  /** Cache reads are ~10x cheaper than fresh input; a high share is healthy. */
  function cacheShare(tokens: TokenCounts): number {
    const input = tokens.inputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens;
    return input > 0 ? Math.round((tokens.cacheReadTokens / input) * 100) : 0;
  }

  function sessionKey(session: SessionUsage): string {
    return session.sessionId;
  }

  async function refresh(): Promise<void> {
    const seq = ++requestSeq;
    try {
      const res = await fetch(`/api/usage?window=${windowMinutes}&limit=40`, {
        headers: authHeaders(),
      });
      const payload = res.ok ? ((await res.json()) as UsageSnapshot) : null;
      if (seq !== requestSeq) {
        return; // superseded by a newer request
      }
      if (payload) {
        snapshot = payload;
        failed = false;
      } else {
        failed = true;
      }
    } catch {
      if (seq === requestSeq) {
        failed = true;
      }
    } finally {
      if (seq === requestSeq) {
        loading = false;
      }
    }
  }

  function selectWindow(minutes: number): void {
    windowMinutes = minutes;
    loading = true;
    void refresh();
  }

  onMount(() => {
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  });

  onDestroy(() => {
    if (timer) {
      clearInterval(timer);
    }
  });
</script>

<section class="usage" aria-label="Agent token usage">
  <header class="head">
    <h3 class="title">Burn</h3>
    <div class="windows" role="group" aria-label="Time window">
      {#each WINDOWS as w (w.minutes)}
        <button
          type="button"
          class="win"
          class:win--on={windowMinutes === w.minutes}
          aria-pressed={windowMinutes === w.minutes}
          onclick={(): void => {
            selectWindow(w.minutes);
          }}>{w.label}</button
        >
      {/each}
    </div>
  </header>

  {#if loading && !snapshot}
    <p class="muted">Reading transcripts…</p>
  {:else if failed && !snapshot}
    <p class="muted">Usage unavailable.</p>
  {:else if snapshot}
    <div class="totals">
      <div class="metric">
        <span class="metric-value">{compact(snapshot.tokens.totalTokens)}</span>
        <span class="metric-label">tokens</span>
      </div>
      <div class="metric">
        <span class="metric-value">{compact(snapshot.burn.tokensPerMinute)}</span>
        <span class="metric-label">tok/min</span>
      </div>
      <div class="metric">
        <span class="metric-value">{money(snapshot.burn.costPerHour, snapshot.burn.priced)}</span>
        <span class="metric-label">per hour</span>
      </div>
      <div class="metric">
        <span class="metric-value">{snapshot.requests}</span>
        <span class="metric-label">responses</span>
      </div>
    </div>

    {#if snapshot.unpricedModels.length > 0}
      <p class="note">
        No rate configured for {snapshot.unpricedModels.join(', ')} — token counts are exact, cost is
        not shown. Set rates in <code>~/.shooter/pricing.json</code>.
      </p>
    {/if}

    {#if snapshot.truncatedFiles > 0}
      <p class="note">
        {snapshot.truncatedFiles}
        {snapshot.truncatedFiles === 1 ? 'transcript was' : 'transcripts were'} larger than the read budget
        — figures are a lower bound.
      </p>
    {/if}

    {#if sessions.length === 0}
      <p class="muted">Nothing in the last {snapshot.windowMinutes} minutes.</p>
    {:else}
      <ul class="rows">
        {#each shown as session (sessionKey(session))}
          <li class="row">
            <div class="bar" style="width: {share(session.tokens)}%"></div>
            <div class="row-main">
              <span class="row-name">{session.projectName}</span>
              <span class="row-tokens">{compact(session.tokens.totalTokens)}</span>
            </div>
            <div class="row-sub">
              <span>{session.requests} resp</span>
              <span>{cacheShare(session.tokens)}% cached</span>
              <span>{money(session.costUsd, session.priced)}</span>
              {#if session.lastActivityAt}
                <span>{formatRelativeTime(session.lastActivityAt)}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>

      {#if sessions.length > 4}
        <button
          type="button"
          class="more"
          onclick={(): void => {
            expanded = !expanded;
          }}
        >
          {expanded ? 'Show less' : `Show ${sessions.length - 4} more`}
        </button>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .usage {
    background: var(--ds-gray-900, #141414);
    border: 1px solid var(--ds-gray-700, #2a2a2a);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: var(--space-4, 16px);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .title {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary, #a1a1a1);
    margin: 0;
  }

  .windows {
    display: flex;
    gap: 4px;
  }

  .win {
    background: transparent;
    border: 1px solid var(--ds-gray-700, #2a2a2a);
    border-radius: 6px;
    color: var(--text-secondary, #a1a1a1);
    cursor: pointer;
    font-size: 11px;
    padding: 3px 9px;
  }

  .win--on {
    background: var(--ds-gray-800, #1e1e1e);
    border-color: var(--ds-blue-700, #2f6feb);
    color: var(--text-primary, #ededed);
  }

  .totals {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .metric-value {
    font-size: 17px;
    font-weight: 650;
    color: var(--text-primary, #ededed);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-label {
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary, #8a8a8a);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    position: relative;
    border-radius: 8px;
    background: var(--ds-gray-850, #191919);
    padding: 8px 10px;
    overflow: hidden;
  }

  /* Proportional bar sits behind the text as a fill, not beside it — keeps the
     row readable at phone widths where a separate gutter would not fit. */
  .bar {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--ds-blue-900, #12213f);
    z-index: 0;
  }

  .row-main,
  .row-sub {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .row-name {
    font-size: 13px;
    color: var(--text-primary, #ededed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-tokens {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary, #ededed);
    flex: 0 0 auto;
  }

  .row-sub {
    margin-top: 3px;
    font-size: 11px;
    color: var(--text-secondary, #8a8a8a);
    justify-content: flex-start;
    gap: 12px;
    font-variant-numeric: tabular-nums;
  }

  .note {
    font-size: 11px;
    line-height: 1.45;
    color: var(--ds-amber-400, #d9a441);
    margin: 0 0 10px;
  }

  .note code {
    font-size: 10px;
  }

  .muted {
    font-size: 12px;
    color: var(--text-secondary, #8a8a8a);
    margin: 0;
  }

  .more {
    background: transparent;
    border: 0;
    color: var(--ds-blue-500, #5b8cf5);
    cursor: pointer;
    font-size: 12px;
    margin-top: 8px;
    padding: 4px 0;
  }
</style>
