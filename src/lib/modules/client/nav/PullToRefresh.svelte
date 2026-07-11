<script lang="ts">
  import type { Snippet } from 'svelte';

  import {
    haptic,
    prefersReducedMotion,
    resistPull,
    shouldTriggerRefresh,
  } from '$lib/modules/client/common';

  // Native-style pull-to-refresh. Wraps a page's <main>; when the user drags
  // down while the scroll container is already at the top, an indicator slides
  // out from under the sticky NavBar and onRefresh() fires past the threshold.
  // It only ever preventDefault()s while actively pulling from the top, so
  // normal scrolling is never affected.
  const {
    children,
    onRefresh,
  }: {
    children: Snippet;
    onRefresh: () => Promise<void> | void;
  } = $props();

  const REST = 56; // indicator height / spinner rest position while refreshing

  let wrap = $state<HTMLDivElement | undefined>();
  let pull = $state(0);
  let refreshing = $state(false);
  let animating = $state(false);

  // Non-reactive gesture bookkeeping
  let scroller: HTMLElement | null = null;
  let startY = 0;
  let active = false;
  let firedHaptic = false;

  function findScrollParent(node: HTMLElement): HTMLElement | null {
    // Match the scroll container by its overflow style, NOT by whether it
    // currently overflows — content may still be loading (short) at mount, but
    // the container is the scroller by design and stays that way.
    let el: HTMLElement | null = node.parentElement;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  $effect(() => {
    const el = wrap;
    if (!el) {
      return;
    }
    scroller = findScrollParent(el);
    const listenEl: EventTarget = scroller ?? document;

    function abortPull(): void {
      active = false;
      // A second finger / scroll mid-pull must not leave the content frozen
      // in a translated state — snap it back.
      if (pull !== 0 && !refreshing) {
        animating = true;
        pull = 0;
      }
    }

    function onStart(event: Event): void {
      const e = event as TouchEvent;
      if (refreshing || e.touches.length !== 1 || !scroller || scroller.scrollTop > 0) {
        abortPull();
        return;
      }
      startY = e.touches[0].clientY;
      active = true;
      firedHaptic = false;
    }

    function onMove(event: Event): void {
      const e = event as TouchEvent;
      if (!active || refreshing || e.touches.length === 0) {
        return;
      }
      if (scroller && scroller.scrollTop > 0) {
        active = false;
        pull = 0;
        return;
      }
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        pull = 0;
        return;
      }
      // Taking over a downward pull from the top — suppress native rubber-band.
      e.preventDefault();
      animating = false;
      pull = resistPull(dy);
      if (!firedHaptic && shouldTriggerRefresh(pull)) {
        firedHaptic = true;
        haptic('light');
      } else if (firedHaptic && !shouldTriggerRefresh(pull)) {
        firedHaptic = false;
      }
    }

    function onEnd(): void {
      if (!active || refreshing) {
        abortPull();
        return;
      }
      active = false;
      animating = true;
      if (shouldTriggerRefresh(pull)) {
        refreshing = true;
        pull = REST;
        haptic('medium');
        void runRefresh();
      } else {
        pull = 0;
      }
    }

    listenEl.addEventListener('touchstart', onStart, { passive: true });
    listenEl.addEventListener('touchmove', onMove, { passive: false });
    listenEl.addEventListener('touchend', onEnd, { passive: true });
    listenEl.addEventListener('touchcancel', onEnd, { passive: true });
    return (): void => {
      listenEl.removeEventListener('touchstart', onStart);
      listenEl.removeEventListener('touchmove', onMove);
      listenEl.removeEventListener('touchend', onEnd);
      listenEl.removeEventListener('touchcancel', onEnd);
    };
  });

  async function runRefresh(): Promise<void> {
    try {
      await onRefresh();
    } finally {
      animating = true;
      pull = 0;
      window.setTimeout((): void => {
        refreshing = false;
      }, 280);
    }
  }

  const transition = $derived(
    animating && !prefersReducedMotion() ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
  );
  const indicatorOpacity = $derived(Math.min(pull / REST, 1));
</script>

<div
  class="ptr"
  bind:this={wrap}
  style="transform: translateY({pull}px); transition: {transition}; will-change: {pull !== 0 ||
  refreshing
    ? 'transform'
    : 'auto'};"
>
  <div class="ptr-indicator" style="opacity: {indicatorOpacity};" aria-hidden={pull === 0}>
    <span
      class="ptr-spinner"
      class:spinning={refreshing}
      style="transform: rotate({refreshing ? 0 : pull * 2.4}deg);"
    ></span>
  </div>
  {@render children()}
</div>

<style>
  .ptr {
    position: relative;
  }

  .ptr-indicator {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    transform: translateY(-100%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .ptr-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--accent-line, rgba(245, 177, 76, 0.28));
    border-top-color: var(--accent);
  }
  .ptr-spinner.spinning {
    animation: ptr-spin 0.7s linear infinite;
  }

  @keyframes ptr-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ptr-spinner.spinning {
      animation-duration: 1.4s;
    }
  }
</style>
