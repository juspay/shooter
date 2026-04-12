/**
 * Keyboard shortcuts for terminal pages.
 *
 * Platform detection: ⌘ on Mac/iPhone/iPad, Ctrl on others.
 * Uses capture-phase window keydown to intercept before xterm.
 */

import type { ShortcutManagerOptions } from '$lib/types';

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export const modLabel = isMac ? '⌘' : 'Ctrl';

export function createShortcutManager(options: ShortcutManagerOptions): { destroy: () => void } {
  function handler(e: KeyboardEvent): void {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) {
      return;
    }

    // Don't intercept when a text input or the terminal is focused
    if (isTextInputFocused()) {
      return;
    }

    // Cmd+/ — show help overlay
    if (e.key === '/') {
      e.preventDefault();
      e.stopPropagation();
      options.onHelp();
      return;
    }
  }

  window.addEventListener('keydown', handler, true); // capture phase

  return {
    destroy(): void {
      window.removeEventListener('keydown', handler, true);
    },
  };
}

/** List of all shortcuts for the help overlay. */
export function getShortcutList(): { description: string; keys: string }[] {
  return [
    { description: 'Command palette', keys: `${modLabel}+K` },
    { description: 'Keyboard shortcuts', keys: `${modLabel}+/` },
  ];
}

/** Returns true when focus is inside a text input, textarea, or contenteditable. */
function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  // xterm's terminal container
  if (el.closest('.xterm')) {
    return true;
  }
  return false;
}
