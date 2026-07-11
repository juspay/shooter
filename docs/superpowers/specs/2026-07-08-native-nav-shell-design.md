# Native Nav Shell — Design Spec (Slice 2)

**Date:** 2026-07-08
**Status:** Proposed (for review)
**Branch:** `feat/native-nav-shell` (stacked on `feat/native-feel-foundation`)
**Program:** "Make Shooter feel native" — Slice 2 of 6

---

## Why this exists

Slice 1 (Foundation) gave the app its amber identity, safe-area/press/motion hygiene, and haptics — all delivered centrally. But the **navigation is still a desktop admin-dashboard IA wearing a bottom tab bar as a costume** (audit, `navigation-ia`, severity: critical):

- **Two stacked headers.** Every screen shows the global brand header (`+layout.svelte` — logo + ONLINE pill + gear), and drill-in screens add a _second_ full-width header (`.page-header` on `/`, `/terminals`, `/config`; `.term-topbar` on the terminal page). ~100–128px of fixed chrome, on a phone, with no navigational payoff.
- **Actions live in the thumb-dead zone.** `Refresh` and `New Terminal` are top-right `Button`s (`+page.svelte:167`, `terminals/+page.svelte:256,262`) — the hardest place to reach one-handed.
- **Back is a scrolling link, not a nav affordance.** Slice 1 gave the back-links proper SVG icons, but they still live _inside the scroll container_ and scroll away.
- **No pull-to-refresh; `Load More` buttons for pagination** (`+page.svelte:268`, `project/+page.svelte:332`) — website patterns, not app patterns.
- **Two tabs both claim "now."** Dashboard and Activity both frame themselves as the real-time surface; nothing answers "what should I look at right now?"

This slice replaces that with a **per-screen native nav bar**, thumb-zone actions, and pull-to-refresh — building on Slice 1's tokens and the library's `Toolbar` component.

**Program context:** Slice 1 spec `docs/superpowers/specs/2026-07-08-native-feel-foundation-design.md` · plan `docs/superpowers/plans/2026-07-08-native-feel-foundation.md`.

## Constraints (inherited + slice-specific)

1. **Central theming still applies** to the _look_ (Slice 1 rule): the `Toolbar` and grouped-list styling are themed via the central theme layer (`theme.css` `--toolbar-*` / list vars + `app.css` global classes), not per-component forks. Structural/behavioral code (the nav config, pull-to-refresh handler, FAB) lives where it must.
2. **Reuse the library.** Build the nav bar on `@juspay/svelte-ui-components` `Toolbar` (2.87.0) rather than hand-rolling — it already provides back button + title + right-content + a second `additionalContent` row. Theme its defaults (`position:fixed; width:100vw; background:#fff`) to the dark, in-flow, safe-area-aware shell.
3. **Amber = action, green = status** (Slice 1): nav back-chevron, active states, and the FAB use `--accent`; live/connection stays green.
4. **PWA + native both first-class**; reduced-motion-safe; **screenshot verification + exercise every feature** before done (owner mandate).

## Scope

**In:** the per-screen nav-bar architecture, collapsing the double header (incl. the terminal page), thumb-zone actions (FAB + pull-to-refresh), grouped inset lists for Settings, and resolving the Dashboard/Activity "now" overlap.

**Explicitly out (later slices):** terminal keystroke streaming / immersive session / accessory key-row (Slice 3 — this slice only _reduces_ the terminal page's chrome, it does not touch input); Web Push / onboarding (Slice 5); swipe-to-delete, sliding tab indicator (Slice 4); Live Activity (Slice 6). The terminal page's `.term-back` `&larr;` glyph (left from Slice 1) is folded into this slice's nav-bar rebuild.

---

## Design

### Unit A — Per-screen nav-bar system (the core)

**Problem.** The global `.header` in `+layout.svelte` renders identically on every route; drill-in screens stack a second header on top.

**Change.** Introduce a **navigation config** the layout reads to render exactly one contextual nav bar per screen:

- A tiny `nav-store` (Svelte context or a `$state` store in `$lib/modules/client/common`) exposing `setNav({ title, showBack, backHref, trailing })`. Each `+page.svelte` calls it (in an `$effect`/`onMount`) to declare its bar; the layout renders one `<Toolbar>` from it.
- **Root screens** (Dashboard, Activity, Terminals, SoS): brand/large title on the left, status pill + trailing action(s) on the right — no back button. Keep the amber-tab bottom nav for switching between them.
- **Drill-in screens** (Project, Session, Terminal detail, Config): a persistent, non-scrolling bar with a **leading amber back-chevron + title**, and an optional trailing action (e.g. the Config gear becomes "Done"/save-less; the terminal page's Kill/Share move into a trailing overflow `Menu`).
- The bar is **themed dark + safe-area-aware** centrally: `--toolbar-background: var(--background)`, `--toolbar-box-shadow: none` + a hairline bottom border, `--toolbar-position: sticky`, height + `padding-top: env(safe-area-inset-top)` folded in (reuse Slice 1's header safe-area pattern). Back icon uses the Slice 1 `arrow-left.svg` in `--accent`.

**Outcome.** One bar per screen, back always visible, brand no longer repeated on drill-in screens — reclaims ~50–80px on every drill-in screen and kills the scroll-away back-link.

**Files (primary):** `src/routes/+layout.svelte` (render one nav bar from config), a new `nav-store` in `src/lib/modules/client/common/`, `theme.css` (`--toolbar-*`), and each `+page.svelte` (declare its nav config; remove its local `.page-header`/`.term-topbar`/back-link). Remove the now-dead `.page-header` / `.term-topbar` / `.term-back` CSS.

### Unit B — Thumb-zone actions (FAB + pull-to-refresh)

**Problem.** `Refresh` and `New Terminal` sit top-right (thumb-dead); refresh is a manual tap; pagination is a `Load More` button.

**Change.**

- **Pull-to-refresh primitive** — a small reusable `usePullToRefresh` action (or a `PullToRefresh.svelte` wrapper) with a `touchstart/touchmove/touchend` rubber-band + threshold spinner, wired to the existing `forceRefresh()` on `/`, `/terminals`, `/project`. Fires a `haptic('light')` (Slice 1) on trigger; reduced-motion-aware via `resolveMotionDuration` (Slice 1). Replaces the top-right `Refresh` buttons.
- **FAB for "New Terminal"** — a floating amber circular button pinned bottom-right, just above the tab bar + safe-area, on `/terminals` (replaces the top-right `New Terminal` button; opens the existing `LaunchSheet`).
- **Infinite scroll** — replace the `Load More` buttons (`+page.svelte:268`, `project/+page.svelte:332`) with an `IntersectionObserver` sentinel that grows `visibleCount` on scroll.

**Files:** a `pull-to-refresh` module in `src/lib/modules/client/common/`, a `Fab.svelte` (central-themed), edits to `/`, `/terminals`, `/project`.

### Unit C — Grouped inset lists (Settings + list surfaces)

**Problem.** Settings is a two-column web form (Slice 1 softened the cards but the structure is still form-like); lists render as separate bordered cards.

**Change.** Introduce a central **grouped-inset-list** treatment (single rounded block per section, hairline row dividers, section header above — the iOS Settings idiom) applied to `/config`'s sections and the registered-devices list. Single-column on phone. Delivered via central classes in `app.css` + the library `ListItem`/`Card` vars. (Native toggles / commit-on-change are Slice 5's Settings work — this slice only restructures layout, not the save model.)

**Files:** `app.css` (grouped-list classes), `config/+page.svelte` (apply structure), `theme.css` (`--list-*` if needed).

### Unit D — Resolve the Dashboard / Activity "now" overlap (IA)

**Problem.** Two tabs both claim the live/now surface.

**Change.** Make **Dashboard the single canonical "now"** (live/running work, strong visual weight) and **demote Activity to a badged bell** in the nav bar (notification-style history) rather than a full tab slot — freeing the 4th tab. Move the historical Projects/Sessions archive under a clear "History" divider beneath the live section on Dashboard, or its own tab. (Final tab lineup to be confirmed in the plan; the principle: each tab has one unambiguous job.)

**Files:** `+layout.svelte` (tab lineup), `+page.svelte` / `activity/+page.svelte` (framing), `DashboardView.svelte`.

---

## Testing & verification (mandatory, per owner mandate)

- **Screenshot regression** across every screen at phone size (390×844) — before/after — confirming: one nav bar per screen (no double header), back-chevron persistent (doesn't scroll away), FAB reachable in the thumb zone, grouped Settings, safe-area respected.
- **Feature exercise:** pull-to-refresh triggers a real reload + haptic; FAB opens LaunchSheet; back navigation works from every drill-in screen; infinite scroll loads more; every existing flow still works.
- **Reduced-motion:** pull-to-refresh + any nav animation inert.
- **Gates:** `pnpm check` 0 errors, `pnpm build` clean, full `pnpm test` green.

## Risks & mitigations

- **`Toolbar` defaults (`fixed`, `100vw`, white)** fight the current flex-column shell. Mitigate: theme to `position: sticky` + `--background` + hairline; integrate as the top row of `.app`, verify no overlap with content or the notch.
- **Nav-config store adds indirection.** Mitigate: keep it a tiny typed store; each page sets it declaratively; SSR-safe default.
- **Removing per-page headers touches many files.** Mitigate: do it screen-by-screen with a screenshot after each; keep the bottom tab bar untouched.
- **Pull-to-refresh vs. native scroll/overscroll.** Mitigate: only engage when the scroll container is at `scrollTop === 0`; `touch-action` guard; test on device + desktop (no-op with a mouse).

## Non-goals (this slice)

Terminal input/keystroke streaming, accessory key-row, immersive full-bleed session (Slice 3); Web Push, QR, native toggles/commit-on-change Settings (Slice 5); swipe-to-delete, sliding tab indicator (Slice 4); Live Activity (Slice 6).

## Definition of done

- One themed, safe-area-aware nav bar per screen (built on `Toolbar`); the double header is gone everywhere including the terminal page; back is persistent, not scroll-away.
- Primary actions in the thumb zone: pull-to-refresh replaces the top `Refresh` buttons (with haptic); a FAB opens the LaunchSheet; `Load More` replaced by infinite scroll.
- Settings + device list render as grouped inset lists.
- Dashboard is the single "now" surface; Activity demoted to a badged affordance.
- All look changes delivered centrally; screenshot + feature verification complete; `check`/`build`/`test` green; committed on `feat/native-nav-shell`.
