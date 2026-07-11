/**
 * Reduced-motion-aware duration primitive shared by every animation entry
 * point (list FLIP, view-transition route hook, future motion work). Centralizing
 * the `prefers-reduced-motion` read here means every consumer honors the OS
 * accessibility setting identically instead of re-implementing the check.
 */

/** True when the OS/browser requests reduced motion. Always false during SSR (no `window`). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resolves an animation duration to 0 when reduced motion is requested, else the base duration. */
export function resolveMotionDuration(baseMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : baseMs;
}
