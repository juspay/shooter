<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { ActivityFeed } from '$lib/modules/client/activity';
  import { isShooterConfig, markActivitySeen } from '$lib/modules/client/common';
  import NavBar from '$lib/modules/client/nav/NavBar.svelte';
  import { onMount } from 'svelte';

  let configured = $state(false);

  onMount(() => {
    if (!browser) {
      return;
    }

    // Opening the feed acknowledges current activity — clears the NavBar bell dot.
    markActivitySeen();

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

<NavBar variant="root" title="Activity" />

<main class="main">
  {#if configured}
    <ActivityFeed />
  {/if}
</main>
