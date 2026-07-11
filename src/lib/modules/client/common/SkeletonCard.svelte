<script lang="ts">
  // Content-shaped loading placeholder that mirrors a real session/terminal card
  // (title line, subtitle, a meta chip) instead of a featureless grey block, so
  // the loading state reads as "content is arriving here" rather than "blank".
  const { lines = 1 }: { lines?: number } = $props();
</script>

<div class="skeleton-card" aria-hidden="true">
  <div class="skeleton-row">
    <div class="skeleton-bar sk-line skeleton-title"></div>
    <div class="skeleton-bar sk-line skeleton-chip"></div>
  </div>
  <div class="skeleton-bar sk-line skeleton-subtitle"></div>
  {#each Array(lines) as _, i (i)}
    <div class="skeleton-bar sk-line skeleton-meta"></div>
  {/each}
</div>

<style>
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--component-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .skeleton-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .skeleton-bar {
    position: relative;
    overflow: hidden;
    height: 12px;
    border-radius: 6px;
    background: var(--ds-gray-alpha-200, rgba(255, 255, 255, 0.06));
  }
  .skeleton-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      var(--shimmer-highlight, rgba(255, 255, 255, 0.08)),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }
  .skeleton-title {
    width: 44%;
    height: 16px;
  }
  .skeleton-chip {
    width: 72px;
    height: 20px;
    border-radius: 10px;
  }
  .skeleton-subtitle {
    width: 68%;
  }
  .skeleton-meta {
    width: 30%;
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-bar::after {
      animation: none;
    }
  }
</style>
