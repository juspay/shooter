/**
 * Pull-to-refresh gesture math. Kept as pure functions so the touch handling in
 * PullToRefresh.svelte stays thin and this behaviour is unit-testable in Node.
 */

/**
 * Rubber-band resistance for a downward drag. Maps a raw drag distance (px,
 * clamped at 0) onto an eased pull distance that asymptotes toward `max`: the
 * indicator moves nearly 1:1 at first and stiffens as it nears the cap, so an
 * over-pull can never run away.
 */
export function resistPull(dragY: number, max = 120): number {
  if (dragY <= 0 || max <= 0) {
    return 0;
  }
  return max * (1 - Math.exp(-dragY / max));
}

/** True once the eased pull distance reaches the release threshold. */
export function shouldTriggerRefresh(pull: number, threshold = 64): boolean {
  return pull >= threshold;
}
