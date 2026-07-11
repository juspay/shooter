# Native-Feel Foundation — Design Spec (Slice 1)

**Date:** 2026-07-08
**Status:** Approved (with owner amendments — see Constraints)
**Branch:** `feat/native-feel-foundation`
**Program:** "Make Shooter feel native" — Slice 1 of 6

---

## Why this exists

Shooter is a phone-first companion for Claude Code (buzz → glance → one-tap decide; drive Claude from your thumb), but the UI is **Vercel's Geist desktop-dashboard design system with a mobile breakpoint bolted on** — the stylesheet header at `src/app.css:1` literally reads `/* Geist Design System - Dark Mode */`. An 8-agent audit of the live codebase found the single generative decision ("make the dashboard responsive" instead of "build a phone app") recurs at six layers: visual tokens, navigation chrome, touch feedback, input handling, motion, and notification delivery. The result reads as "a website in a browser," not "an app you want to open."

**Design lineage (visual decisions already made with the owner):**

- Diagnosis + directions brief: `https://claude.ai/code/artifact/180b4b8b-1c80-4a02-9881-43ea08e9906a` — local: `/private/tmp/claude-501/-Users-sachinsharma-Developer-Personal-shooter/6a21287b-35f5-4e73-a397-050fa8d62f26/scratchpad/shooter-native-brief.html`
- Accent picker: `https://claude.ai/code/artifact/bfd73562-9200-4287-a68e-d157722d05a6` — local: `/private/tmp/claude-501/-Users-sachinsharma-Developer-Personal-shooter/6a21287b-35f5-4e73-a397-050fa8d62f26/scratchpad/shooter-accent-picker.html`

**Locked decisions:**

| Decision          | Choice                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall direction | **Native shell + terminal soul** — iOS-native chrome for list/settings/nav screens, full-bleed Terminal-First treatment for session screens |
| Distribution      | **PWA/Safari stays first-class** → real Web Push is in scope (later slice)                                                                  |
| Accent            | **Amber Phosphor `#F5B14C`** — warm retro-terminal identity, distinct from the AI-default palette, separated from the "live" status green   |

## Constraints (owner-mandated for this slice)

1. **Centralize the look.** All visual/identity changes (amber accent, type scale, radius, elevation, press/focus feedback) are delivered through the **central theme layer** — `src/lib/theme.css` (the `@juspay/svelte-ui-components` CSS-variable mappings) plus the `:root` token block and global classes in `src/app.css`. **No per-component `.svelte` style forks for theming** — components only _reference_ central tokens (e.g. `--accent`); they never hardcode a look. (Functional, non-look fixes — `format-detection` meta, safe-area, native haptics — land in their natural homes.)
2. **Upgrade the component library.** `@juspay/svelte-ui-components` `^2.18.0` → **`2.87.0`** (latest). This is a prerequisite: the newer version exposes the central theming hooks we need — `--button-active-transform`, `--button-active-background`, `--button-hover-transform`, `--button-focus-visible-box-shadow` (press/hover/focus effects "without `:global()`") — so press-states and focus rings can be centralized instead of scattered.
3. **Bolder look** (owner chose the bolder option): commit to **16px base text**, the larger radii, and a single committed card treatment — but achieved centrally per constraint 1.
4. **Native haptics in this slice** (not deferred): ship the iOS (`UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator`) and Android (`Vibrator`/`HapticFeedbackConstants`) implementations so taps physically buzz on device now.
5. **Screenshot verification + test every feature.** Verification is not optional: capture before/after screenshots of every screen and exercise all features (especially post-upgrade regression) before the slice is considered done.

## The program (context — not all in this slice)

| #     | Slice                                                                                                            | Effort | Depends on |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| **1** | **Foundation** (this spec)                                                                                       | S–M    | —          |
| 2     | Native nav shell (`Toolbar`-based per-screen nav bar, grouped inset lists, thumb-zone actions, page transitions) | L      | 1          |
| 3     | Terminal core loop (live keystroke streaming, immersive session, accessory key-row + Clips, keyboard-avoidance)  | L      | 1          |
| 4     | Motion & haptics depth (sliding tab indicator, swipe-to-delete, skeletons, connection-state animation)           | M      | 1          |
| 5     | Onboarding + Web Push (service worker + Web Push, QR fix, rehearse-permission, grouped Settings via `Toggle`)    | L      | 1          |
| 6     | Ambient status (Live Activity / Dynamic Island, widget, real lock-screen labels)                                 | L      | 5          |

Each slice is its own spec → plan → PR. This document specs **Slice 1 only** and establishes the token, motion, and haptic primitives every later slice builds on.

---

## Slice 1 — Goal

Ship the cheapest, highest-leverage changes that (a) stop the app looking like a website and (b) lay the amber token, motion, and haptic foundation — all through the central theme layer, on the upgraded library. Cross-app hygiene only: **no navigation-architecture rebuild** (Slice 2) and **no terminal input rework** (Slice 3). After this slice the app should already feel meaningfully "less webby" on a phone.

**In scope:** library upgrade; central token re-base (amber accent + accent/status split); the "website tells" fixes; centralized press/focus feedback; motion primitives (list FLIP + page-transition helper); native + web haptics.

**Explicitly out of scope (deferred):** per-screen nav bars & grouped inset lists (Slice 2); the terminal symbol key-row, live keystroke streaming, immersive full-bleed session (Slice 3); Web Push / service worker (Slice 5); swipe-to-delete, sliding tab indicator, skeleton redesign (Slice 4). Named here so the boundary is unambiguous.

---

## Design

### Unit E — Library upgrade (prerequisite, do first)

**Change.** Bump `@juspay/svelte-ui-components` `^2.18.0` → `2.87.0` in `package.json`; update the lockfile with the repo's package manager (`pnpm`). This unlocks the central press/focus theming hooks (Constraint 2) and newer components used by later slices (`Toolbar`, `Toggle`).

**Risk.** 69 minor versions — same major (2.x), so no intended breaking changes, but prop/DOM/default drift is possible across the ~15 components in use (`Button`, `Pill`, `Input`, `Card`, `ListItem`, `Icon`, `Sheet`, `Modal`, `Toast`, `EmptyState`, `Choicebox`, `Shimmer`, `Tabs`, `Menu`, `Select`).

**Verification (mandatory, per Constraint 5).** After upgrade: `pnpm build` clean; then screenshot + exercise **every** screen that renders a library component — `/` (Dashboard), `/activity`, `/terminals`, `/terminals/[id]` (raw + chat tabs, quick keys, launch sheet, share sheet), `/project`, `/session/[id]`, `/config`, `/sos`, `/neurolink`. Diff against pre-upgrade screenshots; fix any visual/behavioral regressions before proceeding to the theme work.

### Unit A — Token re-base (amber accent, split from status) — central only

**Problem.** One hue does triple duty. `--ds-green-700` is used both as **status** (live/success) and as **accent** (active tab `+layout.svelte:234`, focus ring `+layout.svelte:179`); the de-facto **primary-action** color is Vercel blue `--ds-blue-700 #0070f3` (`theme.css:16` `--button-color`, `:37` `--input-focus-border`, `:110` `--tabs-indicator-color`, `:189–198` choicebox-selected). Nothing reads as _this app's_ color.

**Change — central token layer (`src/app.css` `:root`).** Add the amber accent + explicit status tokens (primitives untouched):

```css
/* Brand accent — Amber Phosphor. The ONLY hue for actions/active/selected/focus. */
--ds-amber-accent: #f5b14c;
--ds-amber-accent-hover: #ffc266;
--ds-amber-accent-fg: #0c0d0b; /* text/icon on an amber fill */
--ds-amber-accent-dim: rgba(245, 177, 76, 0.14);
--ds-amber-accent-line: rgba(245, 177, 76, 0.32);
--accent: var(--ds-amber-accent);
--accent-hover: var(--ds-amber-accent-hover);
--accent-fg: var(--ds-amber-accent-fg);
--accent-dim: var(--ds-amber-accent-dim);
--accent-line: var(--ds-amber-accent-line);
/* Status — semantic and separate. */
--status-live: var(--ds-green-700);
--status-success: var(--ds-green-700);
--status-info: var(--ds-blue-700);
--status-danger: var(--ds-red-700);
```

**Change — central theme mappings (`src/lib/theme.css`).** Point the library's action/active/selected/focus variables at `--accent`:

| Library variable (theme.css)                                                                                   | New value                                |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `--button-color`, `--button-hover-color`, `--button-active-background`                                         | `--accent` / `--accent-hover`            |
| `--button-text-color` (on filled primary)                                                                      | `--accent-fg`                            |
| `--input-focus-border`                                                                                         | `1px solid var(--accent)`                |
| `--tabs-indicator-color`                                                                                       | `--accent`                               |
| `--choicebox-selected-border-color`, `--choicebox-selected-background`, `--choicebox-indicator-selected-color` | `--accent` / `--accent-dim` / `--accent` |

**Change — token references in the two app-shell/CTA spots** (reference the central token, do not hardcode a look): `+layout.svelte` `.tab-item.active` color and focus outline → `var(--accent)`; `LaunchSheet.svelte` launch-button `--button-color`/`--button-hover-color` → `var(--accent)`/`var(--accent-hover)`.

**Leave green/blue as status** (unchanged): `ConnectionStatus.svelte:43,62`, `ActivityFeed.svelte:176,195,266`, `AutopilotPanel.svelte:338,359,360`, live pills/dots (`DashboardCard.svelte:224–227,338`, `session/[id]:675`), success/info toasts & banners.

**Verify.** Every primary button, active tab, focused field, and selected choice renders amber; every live/connected/success signal stays green; blue only means info. Grep guard: no button/tab/input/selection color still resolves to `--ds-blue-700`.

### Unit B — Website tells (hygiene + bolder look)

1. **Fake blue path links.** Add to `src/app.html` `<head>`: `<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />`. If the iOS `WKWebView` is configured in `ios/`, also set `dataDetectorTypes = []`. _Verify:_ paths on `/` and `/project` are plain text.
2. **Header under the notch.** `src/app.css:155` `.header`: add `padding-top: env(safe-area-inset-top, 0px)` and grow height to `calc(var(--header-height) + env(safe-area-inset-top, 0px))`. Mirrors the bottom-inset pattern already at `app.css:1833`, `+layout.svelte:191,200`. _Verify:_ header clears the status bar in the home-screen PWA.
3. **Dead taps → press feedback (central).** For **library** tappables, set the central press/focus vars in `theme.css`: `--button-active-transform: scale(0.97)`, `--button-focus-visible-box-shadow: 0 0 0 2px var(--accent)`, plus the `Card`/`ListItem`/`Pill` equivalents where `onclick` is set. For the two **custom** app-shell surfaces (`.session-card`, `.tab-item`, `.terminal-card`), add a single central rule in `app.css`: `@media (hover: none) { .session-card:active, .terminal-card:active, .tab-item:active { transform: scale(0.978); transition: transform 60ms ease; } }`. Pair the tab-item press with a light haptic (Unit D). _Verify:_ every tappable depresses instantly on touch.
4. **One elevation language.** Collapse the flat `.card`/`.list-item` vs. gradient+shadow `.session-card` split (`app.css:686–703`) into one committed treatment (gradient bg + `box-shadow: 0 1px 3px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.03)`), applied via the shared central card classes + the library `Card` `--card-*` vars. _Verify:_ all card surfaces share one depth.
5. **Desktop scrollbar on touch.** `app.css:663–680` `::-webkit-scrollbar`: `@media (hover: none) { ::-webkit-scrollbar { width: 0; height: 0; } }`. _Verify:_ no persistent track on device.
6. **Glyph chevrons → SVG.** Replace text-arrow `.session-chevron` / `.session-back-btn` with the existing `Icon` component for consistent stroke weight. _Verify:_ chevrons match nav icons.
7. **Bolder shape + type (central tokens).** In `app.css` `:root`: `--radius-lg` 8→**14px**, `--radius-xl` 12→**18px**; `--text-base` 14→**16px**; page-title tracking `--tracking-tighter`→`--tracking-tight`. Because the library reads sizing/radius via its own vars, mirror the radius bump into `theme.css` (`--button-border-radius`, `--card-*-radius`, input/pill radii) so the whole system moves together. _Verify (per Constraint 5):_ screenshot every screen at 16px base — confirm no clipped/overflowing text or broken dense rows (esp. `/config`, terminal topbar, quick keys); tune the specific offending row centrally if any.

### Unit C — Motion primitives

1. **List FLIP.** Add `animate:flip` (`svelte/animate`) to `DashboardView.svelte:25,39` `{#each}` blocks (keyed by `card.terminalId`, already stable). Reduced-motion-guarded.
2. **Page-transition helper.** `onNavigate` hook in `+layout.svelte` wrapping navigation in `document.startViewTransition()` when supported (progressive enhancement); default `::view-transition` slide/cross-fade in `app.css`, gated by `@media (prefers-reduced-motion: no-preference)`.

_Verify:_ dashboard reorders glide; route changes slide/cross-fade where supported; both inert under reduced-motion.

### Unit D — Haptics (web API + native impl, this slice)

**Web (`native-bridge.ts`).**

```ts
export type HapticKind =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';
/** Fire a haptic tick. Native bridge → navigator.vibrate → no-op. Never throws. */
export function haptic(kind: HapticKind = 'light'): void;
```

Resolution order: `window.ShooterBridge.haptic(kind)` → `window.ShooterNativeBridge.haptic(kind)` → `navigator.vibrate(map[kind])` → no-op. SSR/desktop-safe. Called on: bottom-tab switch (`+layout.svelte`), quick-key press (`QuickKeys.svelte`), primary-button press. `HapticKind` added to `src/lib/types` (union → hand-written, re-exported from barrel).

**Native (this slice, per Constraint 4).** iOS: add `haptic(kind)` to the injected `ShooterBridge` and back it with `UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator` in `ios/…/ContentView.swift`'s Coordinator (mapping `light/medium/heavy`→impact styles, `success/warning/error`→notification types, `selection`→`UISelectionFeedbackGenerator`). Android: expose `ShooterNativeBridge.haptic(kind)` (`@JavascriptInterface`) backed by `Vibrator`/`VibrationEffect` (respect `HapticFeedbackConstants`).

_Verify:_ `haptic()` is a silent no-op on desktop (no error); on a native iOS/Android build, a tab switch produces a physical tick.

---

## Testing & verification strategy (mandatory)

Per Constraint 5, this slice is done only when all of the following pass:

- **Screenshot regression (every screen).** Capture before/after for `/`, `/activity`, `/terminals`, `/terminals/[id]` (raw + chat + quick keys + launch/share sheets), `/project`, `/session/[id]`, `/config`, `/sos`, `/neurolink` — first for the library upgrade (Unit E), then again after the theme work. Compare and resolve regressions.
- **Feature exercise.** Manually drive each feature end-to-end: launch/attach/kill a terminal, quick keys, send input, view a session, change + save config, generate QR, dashboard cards, activity feed. Nothing regresses from the upgrade or re-theme.
- **Unit tests.** `haptic()` resolution order + no-op safety (mock `ShooterBridge` / `navigator.vibrate` / neither). Token guard: assert no button/tab/input/selection color resolves to `--ds-blue-700`.
- **Reduced-motion.** With `prefers-reduced-motion: reduce`, FLIP and view-transitions are inert.
- **Build.** `pnpm build` clean.

## Risks & mitigations

- **Library upgrade drift (2.18→2.87).** Mitigate: upgrade first (Unit E), full screenshot + feature pass before any theme change, so regressions are attributable to the upgrade, not the re-theme.
- **16px base overflow in dense desktop rows.** Mitigate: the change is central; verify by screenshot; tune specific rows via central tokens, don't revert globally.
- **Elevation unification regressing a screen.** Mitigate: apply via shared central classes + library `Card` vars; spot-check every list screen.
- **View transitions vary by browser.** Progressive enhancement (feature-detected) — unsupported browsers keep today's instant swap, no regression.

## Non-goals (this slice)

Nav-bar architecture, grouped inset lists, pull-to-refresh, FAB, swipe-to-delete, terminal symbol row, keystroke streaming, immersive session, Web Push, Live Activity. Later slices, own specs.

## Definition of done

- `@juspay/svelte-ui-components` at `2.87.0`; upgrade regression-verified by screenshots + feature pass.
- Amber `--accent` layer added centrally; all action/active/selected/focus consumers rewired via `theme.css` + central tokens; green = status only, blue = info only; **no per-component theming forks**.
- The seven website-tell fixes (incl. 16px base + larger radii, delivered centrally) land and verify on a phone (PWA + Safari).
- `animate:flip` + `startViewTransition` helper in place, reduced-motion-safe.
- `haptic()` web API + `HapticKind` type shipped and called on existing tap points; **native iOS + Android haptics implemented** and verified on device.
- Full screenshot + feature verification complete; `pnpm build` clean; design doc committed on `feat/native-feel-foundation`.
