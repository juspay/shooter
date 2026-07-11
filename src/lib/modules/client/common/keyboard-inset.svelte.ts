import { browser } from '$app/environment';

import { computeKeyboardInset } from './keyboard';

/**
 * Tracks how much the on-screen keyboard overlaps the viewport and publishes it
 * both reactively (`getKeyboardInset()`) and as the CSS custom property
 * `--keyboard-inset` on the document root, so plain CSS can lift inputs above
 * the keyboard with zero per-component JS. SSR-safe and a no-op where
 * `visualViewport` is unavailable (desktop, older engines).
 */

let inset = $state(0);
let viewport: null | VisualViewport = null;

const noop = (): void => undefined;

/** Reactive: current keyboard overlap in px (0 when closed). */
export function getKeyboardInset(): number {
  return inset;
}

/** Begin tracking the keyboard inset. Returns a stop function. No-op during SSR / no visualViewport. */
export function startKeyboardInsetTracking(): () => void {
  if (!browser || !window.visualViewport) {
    return noop;
  }
  viewport = window.visualViewport;
  document.documentElement.style.setProperty('--keyboard-inset', '0px');
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return (): void => {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    viewport = null;
  };
}

function update(): void {
  if (!viewport) {
    return;
  }
  const next = computeKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
  if (next !== inset) {
    inset = next;
    document.documentElement.style.setProperty('--keyboard-inset', `${next}px`);
  }
}
