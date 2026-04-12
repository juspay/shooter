<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { ActivityFeed } from '$lib/modules/client/activity';
  import { isShooterConfig } from '$lib/modules/client/common';
  import { onMount } from 'svelte';

  let configured = $state(false);

  onMount(() => {
    if (!browser) {
      return;
    }

    // Check config exists
    try {
      const saved = localStorage.getItem('shooter_config');
      if (!saved) {
        void goto('/config');
        return;
      }
      const parsed: unknown = JSON.parse(saved);
      if (!isShooterConfig(parsed)) {
        localStorage.removeItem('shooter_config');
        void goto('/config');
        return;
      }
      configured = true;
    } catch {
      // Malformed config in storage — clear it before redirecting so
      // revisits don't keep bouncing back to /config with stale state.
      localStorage.removeItem('shooter_config');
      void goto('/config');
    }
  });
</script>

<svelte:head>
  <title>Activity Feed - Shooter</title>
  <meta name="description" content="Real-time activity feed" />
</svelte:head>

<main class="main">
  <h1 class="page-title">Activity Feed</h1>
  {#if configured}
    <ActivityFeed />
  {/if}
</main>

<style>
  .page-title {
    font-size: var(--text-2xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: var(--space-4);
  }
</style>
