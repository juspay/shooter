# Terminal Immersion + Edge-Swipe Back — Design (Slice 3 follow-ups)

The keyboard-aware terminal (Slice 3 core) shipped earlier. These are the
immersion follow-ups the keyboard spec deferred: the terminal topbar's amber
cohesion and the iOS edge-swipe-back gesture across drill-in screens.

## Changes

### Terminal topbar — amber back chevron

`.term-back` used a grey `--text-secondary` chevron. Retinted to `var(--accent)`
with a press-scale (`:active { scale(0.9) }`) and `-webkit-tap-highlight-color:
transparent`, matching the native `NavBar` back button (Slice 2 rule: amber = action).

### Edge-swipe-back gesture

`EdgeSwipeBack.svelte` — a wrapper that navigates back when the user drags right
from the left screen edge, the core iOS one-handed back gesture. Applied to the
Session and Project drill-in screens (each keeps its NavBar back button too).

- **Arms only from the edge:** the gesture engages only when a touch _starts_
  within `edge` (28px) of the left screen edge, so it never interferes with
  content scrolling, taps, or the terminal's own touch handling.
- **Axis-locked** with an 8px dead-zone; vertical or leftward motion disengages.
- **Commit threshold:** past 32% of the width (or handled by the caller), it
  slides fully off and calls `goto(backHref)` / `history.back()` with a light
  haptic; below threshold it snaps back.
- **Sticky-safe:** emits `transform: none` at rest (a zero transform would form a
  containing block and break the sticky NavBar inside); only transforms mid-gesture.
- Reduced-motion-aware via `resolveMotionDuration`.

The decision logic (edge engagement, axis lock, commit threshold) is extracted
to a pure `edge-swipe.ts` module — the pull-refresh.ts / keyboard.ts pattern —
so it is deterministically unit-tested.

## Verification

- Unit: `tests/edge-swipe.test.cjs` — 15 tests (edge engagement boundaries,
  axis-lock dead-zone + tie-break, commit threshold incl. strict-`>` and zero-width).
- Gates: `pnpm check` / `build` / full `test` / eslint `--max-warnings 0` green.
- Amber back chevron: CSS mirrors the screenshot-verified `.navbar-back` amber.

## On-device caveat

Live swipe feel (rubber-band, commit animation, back navigation) is the on-device
acceptance step. In automated desktop Chrome the backend-less dev server stalls
page hydration intermittently, so synthetic TouchEvent runs are flaky; the gesture
_decision_ logic is covered deterministically by the unit tests instead, and a
hydrated instance was observed committing the gesture during testing.
