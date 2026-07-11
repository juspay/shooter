<script lang="ts">
  import type { Snippet } from 'svelte';

  import { goto } from '$app/navigation';
  import {
    haptic,
    prefersReducedMotion,
    resolveMotionDuration,
    resolveSwipeAxis,
    shouldCommitBack,
    shouldEngageEdge,
  } from '$lib/modules/client/common';

  const {
    backHref,
    children,
    edge = 28,
    threshold = 0.32,
  }: { backHref?: string; children: Snippet; edge?: number; threshold?: number } = $props();

  let wrapEl: HTMLDivElement | undefined;
  let dx = $state(0); // live rightward drag distance
  let animating = $state(false); // transition enabled (snap-back or leave)
  let leaving = $state(false); // sliding fully off before navigating back

  // Non-reactive touch bookkeeping
  let startX = 0;
  let startY = 0;
  let axis: '' | 'x' | 'y' = '';
  let engaged = false; // the gesture began at the left edge

  const width = $derived(wrapEl?.offsetWidth ?? 390);
  const tx = $derived(leaving ? width : Math.max(0, dx));
  // At rest, emit `none` (not translateX(0px)) — a zero transform still forms a
  // containing block that would break a sticky NavBar inside. Only transform
  // while actually swiping or animating.
  const active = $derived(tx !== 0 || animating || leaving);
  const transformCss = $derived(active ? `translateX(${tx}px)` : 'none');

  function onStart(e: TouchEvent): void {
    if (leaving || e.touches.length === 0) {
      return;
    }
    const t = e.touches[0];
    engaged = shouldEngageEdge(t.clientX, edge); // only catch swipes from the left edge
    if (!engaged) {
      return;
    }
    startX = t.clientX;
    startY = t.clientY;
    axis = '';
    animating = false;
  }

  function onMove(e: TouchEvent): void {
    if (!engaged || leaving || e.touches.length === 0) {
      return;
    }
    const t = e.touches[0];
    const ddx = t.clientX - startX;
    const ddy = t.clientY - startY;

    if (axis === '') {
      axis = resolveSwipeAxis(ddx, ddy);
      if (axis === '') {
        return; // still inside the dead-zone
      }
    }
    if (axis === 'y' || ddx < 0) {
      engaged = false; // vertical scroll, or leftward — not our gesture
      return;
    }

    e.preventDefault();
    dx = ddx;
  }

  function goBack(): void {
    haptic('light');
    if (backHref) {
      void goto(backHref);
    } else if (typeof history !== 'undefined') {
      history.back();
    }
  }

  function onEnd(): void {
    if (!engaged || axis !== 'x') {
      engaged = false;
      return;
    }
    engaged = false;
    animating = true;
    if (shouldCommitBack(dx, width, threshold)) {
      leaving = true;
      window.setTimeout(goBack, resolveMotionDuration(200, prefersReducedMotion()));
    } else {
      dx = 0; // snap back
    }
  }

  const transitionMs = $derived(resolveMotionDuration(240, prefersReducedMotion()));
</script>

<!-- Edge-swipe surface: only engages when a touch begins within `edge`px of the
     left screen edge, so it never interferes with content scrolling or taps. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="edge-swipe"
  bind:this={wrapEl}
  ontouchstart={onStart}
  ontouchmove={onMove}
  ontouchend={onEnd}
  ontouchcancel={onEnd}
>
  <div
    class="edge-swipe-dim"
    style="opacity: {Math.min(0.45, tx / width)}"
    aria-hidden="true"
  ></div>
  <div
    class="edge-swipe-content"
    class:active
    style="transform: {transformCss}; transition-duration: {animating || leaving
      ? transitionMs
      : 0}ms"
    ontransitionend={(): void => {
      animating = false;
    }}
  >
    {@render children()}
  </div>
</div>

<style>
  .edge-swipe {
    position: relative;
    min-height: 100%;
  }
  /* A dark scrim under the sliding page, revealed as it moves right. */
  .edge-swipe-dim {
    position: absolute;
    inset: 0;
    background: #000;
    pointer-events: none;
    z-index: 0;
  }
  .edge-swipe-content {
    position: relative;
    z-index: 1;
    transition-property: transform;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  .edge-swipe-content.active {
    will-change: transform;
  }
</style>
