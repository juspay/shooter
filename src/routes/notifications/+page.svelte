<script lang="ts">
  import type { NotificationStatsResponse, ShooterConfig } from '$lib/types';

  import NavBar from '$lib/modules/client/nav/NavBar.svelte';
  import PullToRefresh from '$lib/modules/client/nav/PullToRefresh.svelte';
  import { Banner } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  const RANGES = [
    { label: '24h', value: '24h' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
  ];

  let stats = $state<NotificationStatsResponse | null>(null);
  let loading = $state(true);
  let loadError = $state('');
  let range = $state('24h');

  function getConfig(): null | ShooterConfig {
    try {
      const saved = localStorage.getItem('shooter_config');
      return saved ? (JSON.parse(saved) as ShooterConfig) : null;
    } catch {
      return null;
    }
  }

  async function loadStats(): Promise<void> {
    const config = getConfig();
    if (!config) {
      loadError = 'No configuration found. Open Settings first.';
      loading = false;
      return;
    }
    try {
      const res = await fetch(`/api/notify/stats?since=${range}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) {
        loadError = `Failed to load (${res.status})`;
        return;
      }
      stats = (await res.json()) as NotificationStatsResponse;
      loadError = '';
    } catch {
      loadError = 'Network error — is the server running?';
    } finally {
      loading = false;
    }
  }

  function entries(map: null | Record<string, number> | undefined): [string, number][] {
    return Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]);
  }

  function setRange(value: string): void {
    range = value;
    loading = true;
    void loadStats();
  }

  onMount(() => {
    void loadStats();
  });
</script>

<svelte:head><title>Notifications - Shooter</title></svelte:head>

<NavBar variant="root" title="Notifications" />

<PullToRefresh onRefresh={loadStats}>
  <main class="main notif">
    <div class="range-row">
      {#each RANGES as r (r.value)}
        <button
          class="range-btn"
          class:active={range === r.value}
          onclick={(): void => {
            setRange(r.value);
          }}
        >
          {r.label}
        </button>
      {/each}
    </div>

    {#if loadError}
      <Banner text={loadError} classes="banner-error" />
    {/if}

    {#if loading && !stats}
      <p class="muted">Loading…</p>
    {:else if stats}
      <p class="subtitle">
        {stats.total} notification{stats.total === 1 ? '' : 's'} in this window.
      </p>

      {#if stats.bursts.length > 0}
        <div class="bursts">
          <div class="bursts-head">⚠ Bursts — many pushes to one project quickly</div>
          {#each stats.bursts as b (b.project)}
            <div class="burst-row">
              <span class="burst-project">{b.project}</span>
              <span class="burst-count">{b.count} in {b.windowSec}s</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="cards">
        <section class="card">
          <h3>By tier</h3>
          {#each entries(stats.byTier) as [k, v] (k)}
            <div class="row"><span>{k}</span><span class="n">{v}</span></div>
          {/each}
        </section>

        <section class="card">
          <h3>By disposition</h3>
          {#each entries(stats.byDisposition) as [k, v] (k)}
            <div class="row"><span>{k}</span><span class="n">{v}</span></div>
          {/each}
        </section>

        <section class="card">
          <h3>By category</h3>
          {#each entries(stats.byCategory) as [k, v] (k)}
            <div class="row"><span>{k}</span><span class="n">{v}</span></div>
          {/each}
        </section>

        <section class="card">
          <h3>Top projects</h3>
          {#each entries(stats.byProject).slice(0, 10) as [k, v] (k)}
            <div class="row"><span class="ellip">{k}</span><span class="n">{v}</span></div>
          {/each}
        </section>

        <section class="card">
          <h3>Delivery</h3>
          <div class="row"><span>delivered</span><span class="n">{stats.delivery.sent}</span></div>
          <div class="row"><span>failed</span><span class="n">{stats.delivery.failed}</span></div>
          {#each entries(stats.delivery.byStatus) as [k, v] (k)}
            <div class="row sub"><span>APNs {k}</span><span class="n">{v}</span></div>
          {/each}
        </section>
      </div>
    {/if}
  </main>
</PullToRefresh>

<style>
  .notif {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  .subtitle {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    margin: var(--space-1) 0 var(--space-4);
  }
  .muted {
    color: var(--text-tertiary);
  }
  .range-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .range-btn {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .range-btn.active {
    border-color: var(--accent, var(--border-hover));
    color: var(--text-primary);
    font-weight: 600;
  }
  .bursts {
    background: var(--component-bg);
    border: 1px solid var(--warning, #b8860b);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .bursts-head {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
  }
  .burst-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
    padding: 2px 0;
  }
  .burst-project {
    color: var(--text-secondary);
  }
  .burst-count {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .cards {
    display: grid;
    gap: var(--space-3);
  }
  .card {
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }
  .card h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: var(--space-1) 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }
  .row.sub {
    color: var(--text-tertiary);
    padding-left: var(--space-2);
  }
  .row .n {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .ellip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%;
  }
</style>
