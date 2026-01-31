<script lang="ts">
  import '$lib/styles/index.css';
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';

  onMount(() => {
    // Initialize theme from localStorage or default to dark
    const saved = localStorage.getItem('shooter_theme') as 'dark' | 'light';
    if (saved) {
      theme.setTheme(saved);
    } else {
      theme.setTheme('dark'); // Default to dark mode
    }
  });
</script>

<slot />