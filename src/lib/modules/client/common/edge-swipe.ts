// Pure decision helpers for the edge-swipe-back gesture, extracted so the logic
// is unit-testable in Node without a DOM (the touch plumbing that calls these
// lives in EdgeSwipeBack.svelte). Mirrors the pull-refresh.ts / keyboard.ts split.

/**
 * Lock the gesture to an axis once movement clears an 8px dead-zone. Returns ''
 * while still inside the dead-zone (undecided), 'x' for a horizontal swipe, 'y'
 * for a vertical scroll. Horizontal wins ties so a mostly-sideways drag from the
 * edge is treated as a back-swipe.
 */
export function resolveSwipeAxis(dx: number, dy: number, deadZone = 8): '' | 'x' | 'y' {
  if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) {
    return '';
  }
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

/** Commit the back-navigation when the rightward drag passes `threshold` of the width. */
export function shouldCommitBack(dx: number, width: number, threshold = 0.32): boolean {
  if (width <= 0) {
    return false;
  }
  return dx > width * threshold;
}

/** The gesture only arms when the touch STARTS within `edge` px of the left screen edge. */
export function shouldEngageEdge(startX: number, edge: number): boolean {
  return startX <= edge;
}
