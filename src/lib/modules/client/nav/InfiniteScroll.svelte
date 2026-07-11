<script lang="ts">
  // Scroll-triggered "load more" — replaces tap-to-paginate buttons. Renders a
  // sentinel that, when it scrolls near the viewport, invokes onLoadMore().
  const {
    hasMore,
    onLoadMore,
  }: {
    hasMore: boolean;
    onLoadMore: () => void;
  } = $props();

  let sentinel = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const el = sentinel;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return (): void => {
      io.disconnect();
    };
  });
</script>

{#if hasMore}
  <div bind:this={sentinel} class="infinite-sentinel" aria-hidden="true"></div>
{/if}

<style>
  .infinite-sentinel {
    height: 1px;
    width: 100%;
  }
</style>
