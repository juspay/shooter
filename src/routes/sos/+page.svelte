<script lang="ts">
  import type { ShooterConfig, SuperSession } from '$lib/types';

  import { goto } from '$app/navigation';
  import NavBar from '$lib/modules/client/nav/NavBar.svelte';
  import PullToRefresh from '$lib/modules/client/nav/PullToRefresh.svelte';
  import { Banner, Button, EmptyState, Input, Pill } from '@juspay/svelte-ui-components';
  import { onMount } from 'svelte';

  let sessions = $state<SuperSession[]>([]);
  let loading = $state(true);
  let loadError = $state(''); // list-load failures (owned by loadSessions)
  let error = $state(''); // create failures (owned by create) — kept separate so a
  // successful pull-to-refresh never wipes a still-relevant create error
  let newLabel = $state('');
  let creating = $state(false);

  function getConfig(): null | ShooterConfig {
    try {
      const saved = localStorage.getItem('shooter_config');
      return saved ? (JSON.parse(saved) as ShooterConfig) : null;
    } catch {
      return null;
    }
  }

  async function loadSessions(): Promise<void> {
    const config = getConfig();
    if (!config) {
      loadError = 'No configuration found. Open Settings first.';
      loading = false;
      return;
    }
    try {
      const res = await fetch('/api/sos', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) {
        loadError = `Failed to load (${res.status})`;
        return;
      }
      const data = (await res.json()) as { superSessions: SuperSession[] };
      sessions = data.superSessions ?? [];
      loadError = ''; // clear only the load error once a refresh succeeds
    } catch {
      loadError = 'Network error — is the server running?';
    } finally {
      loading = false;
    }
  }

  async function create(): Promise<void> {
    const config = getConfig();
    if (!config || !newLabel.trim()) {
      return;
    }
    creating = true;
    try {
      const res = await fetch('/api/sos', {
        body: JSON.stringify({ label: newLabel.trim() }),
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (res.ok) {
        const created = (await res.json()) as SuperSession;
        void goto(`/sos/${created.id}`);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? `Failed to create (${res.status})`;
      }
    } catch {
      error = 'Network error — could not create super-session';
    } finally {
      creating = false;
    }
  }

  onMount(() => {
    void loadSessions();
  });
</script>

<svelte:head><title>Session Over Sessions - Shooter</title></svelte:head>

<NavBar variant="root" title="SoS" />

<PullToRefresh onRefresh={loadSessions}>
  <main class="main sos-list">
    <p class="subtitle">Coordinate multiple running agents as one super-session.</p>

    <div class="create-row">
      <Input
        bind:value={newLabel}
        dataType="text"
        placeholder="New super-session label…"
        classes="sos-create-input"
      />
      <Button
        text={creating ? 'Creating…' : 'Create'}
        disabled={creating || !newLabel.trim()}
        onclick={create}
        classes="btn-create"
      />
    </div>

    {#if error || loadError}
      <div class="sos-banners">
        {#if error}
          <Banner text={error} classes="banner-error" />
        {/if}
        {#if loadError}
          <Banner text={loadError} classes="banner-error" />
        {/if}
      </div>
    {/if}

    {#if loading}
      <p class="muted">Loading…</p>
    {:else if sessions.length === 0}
      <EmptyState
        title="No super-sessions yet"
        description="Create one above, then add running agent sessions as members."
      />
    {:else}
      <div class="ss-grid">
        {#each sessions as ss (ss.id)}
          <a class="ss-card" href={`/sos/${ss.id}`}>
            <div class="ss-card-head">
              <span class="ss-label">{ss.label}</span>
              <Pill text={ss.status} classes="pill-status-unknown" />
            </div>
            <div class="ss-meta">
              <span>{ss.members.length} member{ss.members.length === 1 ? '' : 's'}</span>
              <span>{ss.routingRules.length} rule{ss.routingRules.length === 1 ? '' : 's'}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </main>
</PullToRefresh>

<style>
  .sos-list {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4);
  }
  /* Stack of error banners (create vs load) — keep them visually separated. */
  .sos-banners {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .subtitle {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    margin: var(--space-1) 0 var(--space-4);
  }
  .create-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-4);
  }
  :global(.sos-create-input) {
    flex: 1;
    --input-container-margin: 0;
  }
  .muted {
    color: var(--text-tertiary);
  }
  .ss-grid {
    display: grid;
    gap: var(--space-3);
  }
  .ss-card {
    display: block;
    padding: var(--space-4);
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    text-decoration: none;
    transition: border-color var(--transition-fast);
  }
  .ss-card:hover {
    border-color: var(--border-hover);
  }
  .ss-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .ss-label {
    font-weight: 600;
    color: var(--text-primary);
  }
  .ss-meta {
    display: flex;
    gap: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    margin-top: var(--space-2);
  }
</style>
