<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Error - Shooter</title>
</svelte:head>

<main class="error-page">
  <div class="error-content">
    <div class="error-code">{$page.status}</div>
    <h1 class="error-title">
      {#if $page.status === 404}
        Page not found
      {:else}
        Something went wrong
      {/if}
    </h1>
    <p class="error-message">
      {#if $page.error?.message}
        {$page.error.message}
      {:else if $page.status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else}
        An unexpected error occurred. Try refreshing or going back.
      {/if}
    </p>
    <div class="error-actions">
      <button class="error-btn" onclick={() => goto('/')}>Go Home</button>
      <button class="error-btn error-btn-secondary" onclick={() => { history.back(); }}>Go Back</button>
    </div>
  </div>
</main>

<style>
  .error-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-6);
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-code {
    font-size: 4rem;
    font-weight: 700;
    color: var(--color-text-tertiary, #555);
    line-height: 1;
    margin-bottom: var(--space-2);
  }

  .error-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: var(--space-3);
  }

  .error-message {
    color: var(--color-text-secondary, #888);
    font-size: 0.875rem;
    line-height: 1.5;
    margin-bottom: var(--space-5);
  }

  .error-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
  }

  .error-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: var(--color-accent, #0d9488);
    color: white;
    min-height: 44px;
  }

  .error-btn-secondary {
    background: transparent;
    border: 1px solid var(--border, #333);
    color: var(--color-text-secondary, #888);
  }
</style>
