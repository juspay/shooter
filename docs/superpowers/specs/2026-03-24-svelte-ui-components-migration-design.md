# Svelte UI Components Migration Design

**Date**: 2026-03-24
**Status**: Approved
**Scope**: Replace all in-house UI components with `@juspay/svelte-ui-components`, preserve current visual appearance

## Goal

Migrate the entire Shooter web UI from hand-rolled Svelte components and raw HTML/CSS to `@juspay/svelte-ui-components` (60+ Svelte 5 components themed via CSS custom properties). The visual outcome must match the current Geist dark theme appearance. Theming changes are deferred to a later phase.

## Approach

**Page-by-page migration (Approach A)** with granular user stories, driven by Ralph (external bash loop via `snarktank/ralph`).

### Key Decisions

1. **Preserve current look** — Map existing Geist design tokens to library CSS variables. Screenshots before and after must match.
2. **Domain components stay as project components** — ChatView, xterm-wrapper, QuickKeys, ConnectionStatus, LaunchSheet retain their business logic but use library primitives internally (Button, Input, Accordion, Sheet, etc.).
3. **Common components get fully replaced** — The 8 in-house primitives (Button, Card, Alert, Input, Icon, Tag, StatusBadge, EmptyState) are replaced with library equivalents and then deleted.
4. **MCP server for AI-assisted development** — `@juspay/svelte-ui-components-mcp` configured locally so Claude has full component documentation during Ralph iterations.

## Current State

### Technology Stack
- **Svelte 5.49.1** (runes syntax) — compatible with library requirement of ^5.41.2
- **SvelteKit** with adapter-node
- **No Tailwind** — pure CSS custom properties (Geist Design System)
- **No existing UI library** — all components hand-built

### Routes (6 pages + 1 layout)
| Route | File | Purpose |
|-------|------|---------|
| `/` | `+page.svelte` | Projects list |
| `/project` | `project/+page.svelte` | Project detail with sessions |
| `/terminals` | `terminals/+page.svelte` | Terminal list + LaunchSheet modal |
| `/terminals/[id]` | `terminals/[id]/+page.svelte` | Live terminal (raw + chat modes) |
| `/session/[id]` | `session/[id]/+page.svelte` | Session viewer |
| `/config` | `config/+page.svelte` | Settings, QR code, forms |
| Layout | `+layout.svelte` | Header, bottom tabs |

### In-House Components to Replace
| Component | Location |
|-----------|----------|
| Button | `client/common/Button.svelte` |
| Card | `client/common/Card.svelte` |
| Alert | `client/common/Alert.svelte` |
| Input | `client/common/Input.svelte` |
| Icon | `client/common/Icon.svelte` |
| EmptyState | `client/common/EmptyState.svelte` |
| StatusBadge | `client/common/StatusBadge.svelte` |
| Tag | `client/common/Tag.svelte` |

### Domain Components to Update (Keep, Use Library Primitives Inside)
| Component | Location |
|-----------|----------|
| ChatView | `client/terminal/ChatView.svelte` |
| LaunchSheet | `client/terminal/LaunchSheet.svelte` |
| ConnectionStatus | `client/terminal/ConnectionStatus.svelte` |
| QuickKeys | `client/terminal/QuickKeys.svelte` |
| xterm-wrapper | `client/terminal/xterm-wrapper.ts` (no UI change needed) |

### Component Mapping (In-House to Library)

**IMPORTANT: API compatibility notes** — The library components have different APIs than the in-house components. Key differences are documented below and must be accounted for in each story.

| In-House | Library Equivalent | API Notes |
|----------|-------------------|-----------|
| Button | `Button` | Library Button has NO `variant` or `size` props. Use `classes` prop to apply variant CSS classes (e.g., `classes="btn-primary btn-sm"`), style via CSS custom properties (`--button-color`, `--button-text-color`, etc.). Loader via `showLoader` prop. |
| Input | `Input` | Library Input uses `value: string` prop with `onInput` callback, NOT Svelte `bind:value`. All forms must be refactored from two-way binding to callback pattern. Wrap if needed for ergonomics. |
| Alert | `Banner` (inline) or `Toast` (transient) | Banner for persistent inline messages (config page alerts). Toast for dismissible notifications. |
| Card | Keep as thin project wrapper | Library has NO Card component. Simplify existing Card using CSS container pattern. |
| Tag | `Pill` | Pill has `text`, `dismissible`, `onclick`. No variant/color prop — colors via CSS vars only. |
| StatusBadge | `Badge` | **NOT `Status`** — library `Status` is a full-page display component. `Badge` is the correct mapping for small inline dot+label indicators. |
| EmptyState | Composed from library primitives | Keep as project component, use library `Button` inside. |
| Icon | **Keep project Icon** | Library `Icon` takes image URLs + click handlers. Project Icon uses raw SVG via Vite `?raw` imports. These are incompatible — keep project Icon component. |
| LaunchSheet overlay | `Sheet` or `Modal` | Sheet slides from edges with header/content/footer. Good fit. |
| Skeleton loading | `Shimmer` | Minimal props (`classes` only). Sizing controlled via CSS. |
| Expandable tool cards | `Accordion` | Has `expand`, `children`, `classes` only. No built-in header/trigger — project must build the clickable header (tool name + chevron) separately. |
| Select dropdowns | `Select` | `items: SelectItem[]`, `searchable`, `multiple`. Good fit. |
| Raw/Chat mode toggle | `Tabs` with 2 items | **NOT `Toggle`** — library Toggle is a labeled on/off switch. `Tabs` with 2 items is the correct fit for segmented view switching. |
| Connection status dots | `Badge` or custom CSS | **NOT `Status`** — Status is full-page. Use `Badge` for small inline dots, or keep custom CSS for the 8px connection indicator dots. |
| Preset selection | `Choicebox` | `mode: 'radio'`, `selected`. Good fit for LaunchSheet preset cards. |
| Chat avatars | `Avatar` | `alt` (required), `name`, `src`, `size`. Supports initials fallback via `name`. Good fit. |
| Tool name pills | `Pill` | `text` prop. Good fit. |
| Success/error results | `Banner` | **NOT `Status`** — Banner is correct for inline result messages. |

### CSS Architecture
- **Current**: ~2167 lines in `src/app.css` with Geist design tokens
- **Library approach**: CSS custom properties per component (`--button-color`, `--input-background`, etc.)
- **Migration**: Create an initial theme skeleton mapping Geist tokens to known library CSS vars, then refine per-component as each replacement story is implemented
- **Cleanup**: After migration, remove replaced component styles from `app.css`

## Visual States to Capture (Baseline Screenshots)

Each state at 3 viewports (desktop 1440px, tablet 768px, mobile 390px):

| Route | States |
|-------|--------|
| `/` | Loading (skeletons), Empty (no config), Empty (no sessions), Populated |
| `/project` | Loading, Not Found, Empty (no sessions), Populated |
| `/terminals` | Loading, Empty (no config), Empty (no terminals), Populated, LaunchSheet modal open |
| `/terminals/[id]` | Loading, Raw terminal mode, Chat mode, Exited state, Disconnected state |
| `/session/[id]` | Loading (skeleton bubbles), Populated, Live (LIVE badge + connection dot), Ended |
| `/config` | Default form, QR code generated, QR scanner active, Success alert, Error alert |
| Layout | Header + bottom tabs (active states for each tab) |

**Total: ~25-30 states x 3 viewports = 75-90 screenshots**

## User Stories (PRD)

**Quality gate for ALL stories**: `pnpm build` passes AND `pnpm check` passes (svelte-check, TypeScript). No exceptions.

### Phase 1: Foundation (US-001 to US-004)

**US-001: Install library and peer dependencies**
- Install `@juspay/svelte-ui-components` and `type-decoder`
- Acceptance: packages install, `pnpm build` passes, `pnpm check` passes

**US-002: Configure MCP server**
- Create `.mcp.json` with `@juspay/svelte-ui-components-mcp` for project-scoped AI assistance
- Acceptance: MCP config file created, valid JSON

**US-003: Create initial theme skeleton CSS**
- Create `src/lib/theme.css` with initial mapping of Geist tokens to known library CSS vars for the most common properties (colors, borders, backgrounds, text, spacing, radius)
- Import in `+layout.svelte`
- This is an initial skeleton — each Phase 2 story will refine the theme vars for its specific component
- Acceptance: theme file created, imported in layout, no build errors, no visual regressions on existing pages, `pnpm build` passes, `pnpm check` passes

**US-004: Capture baseline screenshots** *(MANUAL — requires human to set up app states)*
- Start the app and manually navigate to each route in each visual state
- Screenshot at 3 viewports (desktop 1440px, tablet 768px, mobile 390px)
- Save to `docs/screenshots/baseline/` with naming: `{route}-{state}-{viewport}.png`
- This story is completed by a human before Ralph begins, not by Ralph itself
- Acceptance: all visual states captured across all viewports, organized and named consistently

### Phase 2: Common Component Replacement (US-005 to US-012)

Prerequisite: US-003 (theme skeleton). Each story refines the theme CSS vars for its component.

**US-005: Replace Button component**
- Replace `client/common/Button.svelte` with library `Button`
- Library Button has no variant/size props — implement variants via `classes` prop and CSS custom properties (e.g., `.btn-primary { --button-color: var(--ds-blue-700); }`)
- Map loading state to `showLoader` prop
- Update all imports across all pages
- Add component-specific theme vars to `src/lib/theme.css`
- Acceptance: all pages using Button render correctly, variants visually match baseline, `pnpm build` passes, `pnpm check` passes

**US-006: Replace Input component**
- Replace `client/common/Input.svelte` with library `Input`
- Library Input uses `onInput` callback, NOT `bind:value` — refactor all form bindings to callback pattern (or create a thin wrapper that provides `bind:value` ergonomics)
- Map label, hint, types (text/password/email), mono font option
- Update all imports
- Add component-specific theme vars to `src/lib/theme.css`
- Acceptance: config page forms render correctly, values update properly, `pnpm build` passes, `pnpm check` passes

**US-007: Replace Alert component**
- Replace `client/common/Alert.svelte` with library `Banner`
- Map success/error/warning/info types via CSS custom properties
- Acceptance: config page alerts render correctly with icons and colors, `pnpm build` passes, `pnpm check` passes

**US-008: Replace Card component**
- Simplify `client/common/Card.svelte` to a thin CSS container wrapper (library has no Card)
- Preserve header (title + description) and content slot interface
- Acceptance: config page cards render correctly, `pnpm build` passes, `pnpm check` passes

**US-009: Replace Tag component**
- Replace `client/common/Tag.svelte` with library `Pill`
- Map variant colors via CSS custom properties (Pill has no variant prop — colors via CSS vars only)
- Acceptance: tags on terminal cards and session cards render correctly, `pnpm build` passes, `pnpm check` passes

**US-010: Replace StatusBadge component**
- Replace `client/common/StatusBadge.svelte` with library `Badge`
- **NOT `Status`** — Status is a full-page component. Badge is the correct inline indicator.
- Map healthy/degraded/error/unknown states with dot indicator
- Acceptance: header status indicator renders correctly, `pnpm build` passes, `pnpm check` passes

**US-011: Replace EmptyState component** *(depends on US-005)*
- Keep as project component, rebuild internals with library `Button` (from US-005)
- Keep project `Icon` component for SVG icons (library Icon is incompatible)
- Acceptance: all empty states across pages render correctly, `pnpm build` passes, `pnpm check` passes

**US-012: Update Icon component**
- **Keep project Icon component** — library Icon uses image URLs, project Icon uses raw SVG via Vite `?raw`. These are incompatible.
- Clean up and verify Icon works alongside library components
- Acceptance: icons render correctly everywhere, no conflicts with library, `pnpm build` passes, `pnpm check` passes

### Phase 3: Page Migrations (US-013 to US-025)

**US-013 and US-014 (layout) MUST run before other page migrations** — the layout shell (header + tabs) is visible on every page.

**US-013: Migrate layout header bar**
- Replace raw `<header>` with library components — logo area, settings gear button
- Acceptance: header looks identical to baseline screenshots, `pnpm build` passes, `pnpm check` passes

**US-014: Migrate layout bottom tab bar**
- Replace raw `<nav class="bottom-tabs">` with library `Tabs` component
- Map active state styling via CSS custom properties
- Acceptance: tab navigation works, active indicator matches baseline, `pnpm build` passes, `pnpm check` passes

**US-015: Migrate home page skeleton loading**
- Replace `.skeleton`, `.skeleton-card` divs with library `Shimmer` components
- Size Shimmer via CSS to match current skeleton dimensions
- Acceptance: loading state matches baseline, `pnpm build` passes, `pnpm check` passes

**US-016: Migrate home page session cards**
- Replace `.session-card` raw HTML (badges, stats, timestamps) with library components
- Use `Pill` for badges, library layout primitives
- Acceptance: populated state matches baseline, cards clickable, `pnpm build` passes, `pnpm check` passes

**US-017: Migrate project page**
- Replace back link, project header, session cards, source badges (`.source-badge-claude`, `.source-badge-opencode`), skeleton loading
- Acceptance: all states (loading, not found, empty, populated) match baseline, `pnpm build` passes, `pnpm check` passes

**US-018: Migrate config page form fields**
- Replace raw `<select>`, `.text-field`, `.form-group` patterns with library `Select`, `Input`
- Note: library Input uses callback pattern — apply same approach as US-006
- Acceptance: form inputs render correctly, values bind properly, `pnpm build` passes, `pnpm check` passes

**US-019: Migrate config page layout and QR section**
- Replace `.settings-grid`, `.settings-section` containers, QR container, setup steps list, button groups
- Acceptance: settings layout matches baseline including QR section, `pnpm build` passes, `pnpm check` passes

**US-020: Migrate terminal list cards**
- Replace `.terminal-card` raw HTML (status dots, badges, preview text, remove buttons) with library components
- Use `Badge` for status dots (not `Status`), `Pill` for type badges
- Acceptance: terminal cards match baseline in running and exited states, `pnpm build` passes, `pnpm check` passes

**US-021: Migrate terminal list skeleton and empty states**
- Replace skeleton loading and empty states with library `Shimmer` and updated `EmptyState`
- Acceptance: loading and empty states match baseline, `pnpm build` passes, `pnpm check` passes

**US-022: Migrate session page chrome**
- Replace back link, session header, LIVE badge, connection status dots (use `Badge`, not `Status`), meta items, paused banner with library `Banner`
- Acceptance: header and status indicators match baseline in all states (live, ended, disconnected), `pnpm build` passes, `pnpm check` passes

**US-023: Migrate session page skeleton loading**
- Replace `.skeleton-bubble` chat loading states with library `Shimmer`
- Acceptance: loading state matches baseline, `pnpm build` passes, `pnpm check` passes

**US-024: Migrate terminal detail top bar**
- Replace `.term-topbar` (back button, command name, type badge, kill/remove buttons) with library components
- Replace raw/chat mode toggle (`.term-toggle-btn`) with library `Tabs` (2 items), NOT `Toggle`
- Acceptance: top bar matches baseline, toggle between raw/chat works, `pnpm build` passes, `pnpm check` passes

**US-025: Migrate terminal detail raw-mode input bar and exit bar**
- This covers the input bar in the **page-level** raw terminal mode (`.term-input-bar` in `+page.svelte`), NOT the ChatView internal input bar (that is US-031)
- Replace with library `Input` + `Button`
- Replace `.term-exited-bar` with library components
- Acceptance: raw-mode input area matches baseline, send works, exit bar renders correctly, `pnpm build` passes, `pnpm check` passes

### Phase 4: Domain Component Updates (US-026 to US-031)

Acceptance criteria for domain components: **functionally equivalent** to baseline (not pixel-identical, since library primitives may render slightly differently).

**US-026a: Update LaunchSheet — sheet wrapper and presets**
- Replace raw `.overlay`/`.sheet` with library `Sheet` or `Modal`
- Replace preset cards with library `Choicebox` (radio mode)
- Acceptance: sheet opens/closes correctly, presets selectable, functionally equivalent to baseline, `pnpm build` passes, `pnpm check` passes

**US-026b: Update LaunchSheet — form fields and launch button**
- Replace `.select-field` with library `Select`
- Replace `.text-field` with library `Input`
- Replace launch button with library `Button`
- Acceptance: form fields work, terminal launches successfully, `pnpm build` passes, `pnpm check` passes

**US-027: Update ConnectionStatus internals**
- Replace raw `.status-dot` + `.status-label` + `.retry-btn` with library `Badge` + `Button`
- **NOT `Status`** — use Badge for the small inline dot indicator
- Acceptance: all 3 states (connected/reconnecting/disconnected) render correctly, retry button works, `pnpm build` passes, `pnpm check` passes

**US-028: Update QuickKeys internals**
- Replace raw `.quick-key` buttons with library `Button`
- Acceptance: all 7 quick keys render correctly, send correct key sequences to terminal, `pnpm build` passes, `pnpm check` passes

**US-029: Update ChatView — message bubbles and avatars**
- Replace `.chat-avatar` with library `Avatar` (initials fallback via `name` prop)
- Replace `.chat-bubble` and `.chat-message` with library layout primitives
- Acceptance: user and assistant messages render correctly with markdown, timestamps intact, `pnpm build` passes, `pnpm check` passes

**US-030: Update ChatView — tool cards and thinking blocks**
- Replace `.chat-tool-card` expandable sections with library `Accordion` + custom header (tool name `Pill` + chevron — Accordion has no built-in trigger)
- Replace success/error result indicators with library `Banner`
- Acceptance: tool cards expand/collapse, error/success styling functionally equivalent to baseline, `pnpm build` passes, `pnpm check` passes

**US-031: Update ChatView — internal input bar and status header**
- This covers the **ChatView-internal** chat input bar (`.chat-input-bar` inside ChatView.svelte), NOT the page-level raw terminal input bar (that was US-025)
- Replace with library `Input` + `Button`
- Replace LIVE/ended badges with library `Pill`
- Replace connection dots with library `Badge`
- Acceptance: chat input works, send/cancel buttons work, status indicators correct, `pnpm build` passes, `pnpm check` passes

### Phase 5: Cleanup and Verification (US-032 to US-035)

**US-032: Delete old in-house common components**
- Remove `Button.svelte`, `Card.svelte`, `Alert.svelte`, `Input.svelte`, `Tag.svelte`, `StatusBadge.svelte` from `client/common/`
- **Keep** `Icon.svelte` and `EmptyState.svelte` (project components using library primitives)
- Update `index.ts` exports — **preserve utility re-exports** (cache, config-guard, markdown, native-bridge, time, tool-title)
- Verification: `grep -r 'common/Button\|common/Card\|common/Alert\|common/Input\|common/Tag\|common/StatusBadge' src/routes` returns zero results
- Acceptance: no imports reference deleted components, utility exports preserved, `pnpm build` passes, `pnpm check` passes

**US-033: Clean up app.css — remove replaced styles**
- Remove CSS rules for components now handled by library CSS vars: `.btn-*`, `.card`, `.alert`, `.tag`, `.status-badge`, `.skeleton`
- Keep: page-specific layout styles, animation keyframes, chat styles, terminal styles, responsive breakpoints, Geist design tokens
- Acceptance: no visual regressions, app.css is leaner, `pnpm build` passes, `pnpm check` passes

**US-034: Final visual verification — all states, all viewports** *(MANUAL — human comparison)*
- Re-screenshot every route in every state at all 3 viewports
- Save to `docs/screenshots/after/`
- Compare against baseline screenshots from US-004
- Document any remaining differences in `docs/screenshots/COMPARISON.md`
- Acceptance: all pages functionally equivalent to baseline, zero regressions

**US-035: Fix visual regressions from verification**
- Address any differences documented in US-034
- This story may require multiple Ralph iterations
- Acceptance: all documented regressions resolved, `pnpm build` passes, `pnpm check` passes

## Execution Strategy

This migration will be executed using **snarktank/ralph** — an external bash loop that spawns fresh Claude Code instances per iteration. Each iteration picks the highest-priority incomplete user story from `prd.json`, implements it, runs quality gates, commits, and updates status.

### Quality Gates (Every Iteration)
1. `pnpm build` passes (no build errors)
2. `pnpm check` passes (svelte-check, TypeScript)
3. No new lint errors

### Ralph Configuration
- **Tool**: Claude Code (`--tool claude`)
- **Max iterations**: 50 (safety net)
- **Branch**: `feat/svelte-ui-migration`
- **Completion signal**: All stories have `passes: true`

### Story Dependencies
```
US-001 → US-002 → US-003 (theme skeleton)
                     ↓
US-004 (MANUAL — human captures baseline screenshots)
                     ↓
US-005 (Button) ─────────────────────────────────┐
US-006 (Input)                                    │
US-007 (Alert/Banner)                             │ Can run in any order
US-008 (Card)                                     │ Each refines theme.css
US-009 (Tag/Pill)                                 │
US-010 (StatusBadge/Badge)                        │
US-012 (Icon — keep project Icon)                 │
US-011 (EmptyState — depends on US-005 done) ─────┘
                     ↓
US-013 (layout header) ──┐ Layout FIRST
US-014 (layout tabs) ────┘
                     ↓
US-015 through US-025 (pages, any order)
                     ↓
US-026a, US-026b through US-031 (domain components, any order)
                     ↓
US-032 (delete old components) → US-033 (clean CSS) → US-034 (MANUAL verify) → US-035 (fix regressions)
```

### Rollback Strategy
The migration runs on a dedicated branch (`feat/svelte-ui-migration`). Each story commits independently. If the migration goes wrong:
- Abandon the branch entirely and start fresh
- Or revert specific story commits via `git revert`
- The `release` branch is never touched until the migration is complete and verified

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Library `Button` has no variant/size props | Use `classes` prop + CSS custom properties for variant styling (`.btn-primary`, `.btn-sm`, etc.) |
| Library `Input` uses callback pattern, not `bind:value` | Create thin wrapper or refactor forms to callback pattern. Document approach in US-006 for reuse. |
| Library `Icon` is incompatible (image URLs vs raw SVG) | Keep project Icon component. Explicitly decided — not a gap. |
| Library `Status` is full-page, not inline indicator | Use `Badge` for all inline dot+label indicators. Documented in mapping table. |
| Library `Toggle` is on/off switch, not segmented control | Use `Tabs` with 2 items for raw/chat mode. Documented in US-024. |
| Library `Accordion` has no built-in header/trigger | Build clickable header (Pill + chevron) as wrapper around Accordion. |
| Library has no `Card` component | Keep as thin project wrapper with CSS container pattern. |
| Theme mapping misses edge cases | Initial skeleton in US-003, refined per-component in Phase 2. Baseline screenshots catch regressions. |
| `Shimmer` doesn't match current skeleton shapes | Size via CSS custom properties to match current dimensions. |
| `Sheet` animation differs from current LaunchSheet | CSS vars to customize animation direction and timing. |
| Library version incompatibility | Pin version in package.json. |
| Migration breaks app partway through | Dedicated branch with per-story commits. Can abandon or revert. Release branch untouched. |

## Files Changed (Summary)

### New Files
- `.mcp.json` — MCP server configuration
- `src/lib/theme.css` — Geist-to-library CSS variable mapping
- `docs/screenshots/baseline/*.png` — baseline screenshots (manual)
- `docs/screenshots/after/*.png` — post-migration screenshots (manual)
- `docs/screenshots/COMPARISON.md` — regression documentation

### Modified Files
- `package.json` — new dependencies
- `src/app.css` — removed replaced component styles
- `src/routes/+layout.svelte` — library components + theme import
- `src/routes/+page.svelte` — library components
- `src/routes/project/+page.svelte` — library components
- `src/routes/terminals/+page.svelte` — library components
- `src/routes/terminals/[id]/+page.svelte` — library components
- `src/routes/session/[id]/+page.svelte` — library components
- `src/routes/config/+page.svelte` — library components
- `src/lib/modules/client/terminal/ChatView.svelte` — library primitives
- `src/lib/modules/client/terminal/LaunchSheet.svelte` — library primitives
- `src/lib/modules/client/terminal/ConnectionStatus.svelte` — library primitives
- `src/lib/modules/client/terminal/QuickKeys.svelte` — library primitives
- `src/lib/modules/client/common/EmptyState.svelte` — uses library Button
- `src/lib/modules/client/common/index.ts` — updated exports (utility re-exports preserved)

### Deleted Files
- `src/lib/modules/client/common/Button.svelte`
- `src/lib/modules/client/common/Card.svelte`
- `src/lib/modules/client/common/Alert.svelte`
- `src/lib/modules/client/common/Input.svelte`
- `src/lib/modules/client/common/Tag.svelte`
- `src/lib/modules/client/common/StatusBadge.svelte`

### Kept Files (NOT deleted)
- `src/lib/modules/client/common/Icon.svelte` — library Icon incompatible with raw SVG approach
- `src/lib/modules/client/common/EmptyState.svelte` — project component using library primitives
