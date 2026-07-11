# Keyboard-Aware Immersive Terminal — Design (Slice 3 core)

## Context / finding

The terminal subsystem already implements live keystroke streaming (xterm `onData` →
`{type:'input'}` over WS → `pty.write` on the server), a raw/chat toggle, QuickKeys,
CommandPalette, keyboard shortcuts, and terminal sharing. So "build streaming" is a
solved problem. The genuine native-feel gap on a phone is that **the on-screen keyboard
overlays the input and output** — there is no `visualViewport` handling anywhere, and the
viewport meta does not use `interactive-widget`. When you tap the terminal or chat input on
iOS/Android, the software keyboard covers the very field you are typing into.

## Goal

Keep the terminal input bar, the chat composer, and (where useful) the message scroll
position **above** the software keyboard, so typing on a phone feels native.

## Approach

A single source of truth for the keyboard overlap, exposed both reactively and as a CSS
custom property so plain CSS can consume it with zero per-component JS.

### Units

1. **`keyboard.ts` — pure math.**
   `computeKeyboardInset(layoutHeight, viewportHeight, offsetTop): number =
max(0, layoutHeight - viewportHeight - offsetTop)`.
   Closed keyboard → 0; open → keyboard height. Clamped at 0. Unit-tested in Node.

2. **`keyboard-inset.svelte.ts` — tracker store.**
   `startKeyboardInsetTracking(): () => void` attaches `resize`/`scroll` listeners to
   `window.visualViewport`, recomputes the inset, writes it to
   `document.documentElement.style['--keyboard-inset']`, and updates a reactive
   `$state`. `getKeyboardInset()` reads it. SSR-safe / no-op when `visualViewport`
   is unavailable (desktop, older engines). Started once in the root layout `onMount`.

3. **Consumers (CSS var `--keyboard-inset`, default 0px).**
   - Terminal `.term-page` height shrinks by the inset. This is the surface that
     genuinely needs it: `.term-page` is a fixed-height `overflow: hidden` flex column
     with the input pinned at its bottom, so the browser cannot scroll the focused
     input above the keyboard on its own — the explicit shrink does it.
   - The **session viewer is intentionally NOT changed**: it is a normal
     `overflow: auto` scroller, so the browser natively scrolls the focused composer
     into view above the keyboard. Shrinking a shared ancestor there would only _clip_
     the composer (verified), so it is left to native behaviour.

## Non-goals (this slice)

Re-plumbing streaming (already done), restyling the term topbar to the amber NavBar,
gesture navigation. Those are separate follow-ups.

## Verification

- Unit test the pure math (Node, `.cjs`).
- Simulate a `visualViewport` resize in a real browser and assert `--keyboard-inset`
  updates and the composer offsets (screenshot the session/chat input).
- `pnpm check` / `build` / full test suite / lint clean.
- On-device confirmation (real iOS/Android keyboard) is the final acceptance step and
  is called out honestly as not reproducible in desktop Chrome.
