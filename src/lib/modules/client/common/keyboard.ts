/**
 * On-screen-keyboard geometry. Pure function so the visualViewport tracking in
 * keyboard-inset.svelte.ts stays thin and this is unit-testable in Node.
 */

/**
 * How many pixels the software keyboard overlaps the layout viewport from the
 * bottom. `layoutHeight` is the layout viewport (window.innerHeight),
 * `viewportHeight`/`offsetTop` come from `window.visualViewport`. Clamped at 0
 * (no negative inset when the keyboard is closed or the viewport is taller).
 */
export function computeKeyboardInset(
  layoutHeight: number,
  viewportHeight: number,
  offsetTop: number
): number {
  return Math.max(0, layoutHeight - viewportHeight - offsetTop);
}
