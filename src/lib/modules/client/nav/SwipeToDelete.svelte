<script lang="ts">
  import type { Snippet } from 'svelte';

  import TrashSvg from '$lib/assets/icons/trash.svg?raw';
  import { haptic, prefersReducedMotion, resolveMotionDuration } from '$lib/modules/client/common';
  import Glyph from '$lib/modules/client/common/Glyph.svelte';

  const {
    actionLabel = 'Delete',
    children,
    onDelete,
  }: { actionLabel?: string; children: Snippet; onDelete: () => void } = $props();

  const ACTION_WIDTH = 92; // px revealed when the row snaps open
  const OPEN_THRESHOLD = ACTION_WIDTH / 2;
  const RIGHT_RUBBER = 8; // px of give when swiping right past closed

  let rowEl: HTMLDivElement | undefined;
  let restBase = $state(0); // committed rest offset: 0 (closed) or -ACTION_WIDTH (open)
  let drag = $state(0); // live delta while a finger is down
  let animating = $state(false); // enables the transform transition on release
  let removing = $state(false); // sliding fully out before onDelete fires

  // Touch bookkeeping (non-reactive — never needs to re-render)
  let startX = 0;
  let startY = 0;
  let axis: '' | 'x' | 'y' = '';
  let swiped = false; // a horizontal swipe happened → suppress the row's click

  const rowWidth = $derived(rowEl?.offsetWidth ?? 320);
  const commitThreshold = $derived(rowWidth * 0.45); // full-swipe delete distance

  const translateX = $derived(
    removing ? -rowWidth : Math.max(-rowWidth, Math.min(RIGHT_RUBBER, restBase + drag))
  );
  const revealed = $derived(Math.max(0, -translateX)); // how much backdrop shows

  function onStart(e: TouchEvent): void {
    if (removing || e.touches.length === 0) {
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    axis = '';
    swiped = false;
    animating = false;
  }

  function onMove(e: TouchEvent): void {
    if (removing || e.touches.length === 0) {
      return;
    }
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (axis === '') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        return;
      }
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis === 'y') {
      return; // vertical → let the list scroll
    }

    e.preventDefault(); // own the horizontal gesture
    swiped = true;
    drag = dx;
  }

  function settle(next: number): void {
    animating = true;
    restBase = next;
    drag = 0;
  }

  function commitDelete(): void {
    haptic('warning');
    animating = true;
    removing = true;
    const ms = resolveMotionDuration(200, prefersReducedMotion());
    window.setTimeout(onDelete, ms);
  }

  function onEnd(): void {
    if (removing || axis !== 'x') {
      axis = '';
      return;
    }
    const total = restBase + drag;
    if (total <= -commitThreshold) {
      drag = 0;
      commitDelete();
    } else if (total <= -OPEN_THRESHOLD) {
      settle(-ACTION_WIDTH);
    } else {
      settle(0);
    }
    axis = '';
  }

  // Swallow the row's navigation when the gesture was a swipe or the row is open.
  function onClickCapture(e: MouseEvent): void {
    if (swiped || restBase !== 0) {
      e.preventDefault();
      e.stopPropagation();
      if (restBase !== 0) {
        settle(0); // a tap while open just closes it
      }
      swiped = false;
    }
  }

  function onDeleteTap(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    commitDelete();
  }

  const transitionMs = $derived(resolveMotionDuration(220, prefersReducedMotion()));
</script>

<div class="swipe" bind:this={rowEl}>
  <button
    class="swipe-action"
    style="width: {ACTION_WIDTH}px; opacity: {Math.min(1, revealed / OPEN_THRESHOLD)}"
    aria-label={actionLabel}
    tabindex={restBase !== 0 ? 0 : -1}
    onclick={onDeleteTap}
  >
    <Glyph svg={TrashSvg} size={18} />
    <span class="swipe-action-label">{actionLabel}</span>
  </button>

  <!-- Gesture surface; delete is also reachable via the revealed Delete button and the
       desktop × button, so the touch handlers here are a progressive enhancement. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="swipe-row"
    class:animating={animating || removing}
    style="transform: translateX({translateX}px); transition-duration: {animating || removing
      ? transitionMs
      : 0}ms"
    ontouchstart={onStart}
    ontouchmove={onMove}
    ontouchend={onEnd}
    ontouchcancel={onEnd}
    onclickcapture={onClickCapture}
    ontransitionend={(): void => {
      animating = false;
    }}
  >
    {@render children()}
  </div>
</div>

<style>
  .swipe {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-lg);
  }

  .swipe-action {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: none;
    background: var(--status-danger, var(--ds-red-700));
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .swipe-action-label {
    line-height: 1;
  }

  .swipe-row {
    position: relative;
    touch-action: pan-y;
    will-change: transform;
    transition-property: transform;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  .swipe-row.animating {
    transition-property: transform;
  }
</style>
