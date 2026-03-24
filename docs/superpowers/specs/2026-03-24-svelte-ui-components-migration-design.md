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
| Route | File | Lines | Purpose |
|-------|------|-------|---------|
| `/` | `+page.svelte` | 262 | Projects list |
| `/project` | `project/+page.svelte` | 272 | Project detail with sessions |
| `/terminals` | `terminals/+page.svelte` | 674 | Terminal list + LaunchSheet modal |
| `/terminals/[id]` | `terminals/[id]/+page.svelte` | 1036 | Live terminal (raw + chat modes) |
| `/session/[id]` | `session/[id]/+page.svelte` | 480 | Session viewer |
| `/config` | `config/+page.svelte` | 631 | Settings, QR code, forms |
| Layout | `+layout.svelte` | 218 | Header, bottom tabs |

### In-House Components to Replace
| Component | Lines | Location |
|-----------|-------|----------|
| Button | 40 | `client/common/Button.svelte` |
| Card | 26 | `client/common/Card.svelte` |
| Alert | 31 | `client/common/Alert.svelte` |
| Input | 51 | `client/common/Input.svelte` |
| Icon | 61 | `client/common/Icon.svelte` |
| EmptyState | 35 | `client/common/EmptyState.svelte` |
| StatusBadge | 38 | `client/common/StatusBadge.svelte` |
| Tag | 20 | `client/common/Tag.svelte` |

### Domain Components to Update (Keep, Use Library Primitives Inside)
| Component | Lines | Location |
|-----------|-------|----------|
| ChatView | 410 | `client/terminal/ChatView.svelte` |
| LaunchSheet | 480 | `client/terminal/LaunchSheet.svelte` |
| ConnectionStatus | 107 | `client/terminal/ConnectionStatus.svelte` |
| QuickKeys | 88 | `client/terminal/QuickKeys.svelte` |
| xterm-wrapper | 171 | `client/terminal/xterm-wrapper.ts` (no UI change needed) |

### Component Mapping (In-House to Library)
| In-House | Library Equivalent | Notes |
|----------|-------------------|-------|
| Button | `Button` | Map variants (primary/secondary/ghost/danger) and sizes (sm/md/lg) via CSS vars; loader modes for loading state |
| Input | `Input` | Map label, hint, mono font, password type; validation states available |
| Alert | `Toast` or `Banner` | Map success/error/warning/info types; Banner for inline, Toast for transient |
| Card | Keep as thin wrapper or remove | Library has no Card — use CSS container pattern or keep simplified |
| Tag | `Pill` | Map variant colors, dismissible option, icon support |
| StatusBadge | `Status` + `Badge` | Map healthy/degraded/error/unknown states with dot indicators |
| EmptyState | Composed from library primitives | Keep as project component, use library `Button` and `Icon` inside |
| Icon | `Icon` from library or keep if icons don't overlap | Library Icon is clickable button+image; may keep project Icon for pure SVG display |
| LaunchSheet overlay | `Sheet` or `Modal` | Library Sheet slides from edges with header/content/footer |
| Skeleton loading | `Shimmer` | Library Shimmer for animated loading placeholders |
| Expandable tool cards | `Accordion` | Library Accordion with CSS grid animation |
| Select dropdowns | `Select` | Library Select with search, keyboard nav |
| Toggle buttons | `Toggle` or `Button` variants | Terminal raw/chat mode toggle |
| Status dots | `Status` | Connected/reconnecting/disconnected states |
| Preset selection | `Choicebox` | LaunchSheet preset cards (radio mode) |
| Chat avatars | `Avatar` | User/assistant initials fallback |
| Tool name pills | `Pill` | In ChatView tool cards |
| Success/error results | `Banner` or `Status` | In ChatView tool results |

### CSS Architecture
- **Current**: ~1800 lines in `src/app.css` with Geist design tokens
- **Library approach**: CSS custom properties per component (`--button-color`, `--input-background`, etc.)
- **Migration**: Create a theme file that maps Geist tokens to library CSS vars, applied at root level
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

### Phase 1: Foundation (US-001 to US-004)

**US-001: Install library and peer dependencies**
- Install `@juspay/svelte-ui-components` and `type-decoder`
- Acceptance: packages install, `pnpm build` passes

**US-002: Configure MCP server**
- Create `.mcp.json` with `@juspay/svelte-ui-components-mcp` for project-scoped AI assistance
- Acceptance: MCP tools accessible in Claude Code

**US-003: Create theme mapping CSS**
- Create theme file mapping all Geist tokens (`--ds-gray-*`, `--ds-blue-*`, `--ds-red-*`, `--ds-green-*`, `--ds-amber-*`, semantic aliases) to library CSS variables (`--button-color`, `--button-text-color`, `--input-background`, `--input-border`, etc.)
- Apply at `:root` or `.app` level
- Acceptance: theme file created, components render with current dark appearance

**US-004: Capture baseline screenshots**
- Screenshot every route in every visual state at 3 viewports (desktop 1440px, tablet 768px, mobile 390px)
- Save to `docs/screenshots/baseline/` with naming: `{route}-{state}-{viewport}.png`
- Acceptance: all ~75-90 screenshots saved, organized and named consistently

### Phase 2: Common Component Replacement (US-005 to US-012)

**US-005: Replace Button component**
- Replace `client/common/Button.svelte` with library `Button`
- Map variants (primary, secondary, ghost, danger), sizes (sm, md, lg), loading spinner
- Update all imports across all pages
- Acceptance: all pages using Button render correctly, build passes

**US-006: Replace Input component**
- Replace `client/common/Input.svelte` with library `Input`
- Map label, hint, types (text/password/email), mono font option
- Update all imports
- Acceptance: config page forms render correctly, build passes

**US-007: Replace Alert component**
- Replace `client/common/Alert.svelte` with library `Toast` or `Banner`
- Map success/error/warning/info types with icons
- Acceptance: config page alerts render correctly, build passes

**US-008: Replace Card component**
- Replace `client/common/Card.svelte` with library pattern or thin wrapper
- Map header (title + description) and content slot
- Acceptance: config page cards render correctly, build passes

**US-009: Replace Tag component**
- Replace `client/common/Tag.svelte` with library `Pill`
- Map variant colors (success/error/warning/info), optional icon, mono font
- Acceptance: tags on terminal cards and session cards render correctly, build passes

**US-010: Replace StatusBadge component**
- Replace `client/common/StatusBadge.svelte` with library `Status` or `Badge`
- Map healthy/degraded/error/unknown states with dot indicator
- Acceptance: header status indicator renders correctly, build passes

**US-011: Replace EmptyState component**
- Keep as project component, rebuild internals with library `Button` and `Icon`
- Acceptance: all empty states across pages render correctly, build passes

**US-012: Replace Icon component**
- Replace or update `client/common/Icon.svelte` with library `Icon` where applicable
- Keep project Icon if library doesn't cover all 11 icons (alert-triangle, bell, check-circle, file, folder, play, refresh, settings, terminal, tool, x-circle)
- Acceptance: icons render correctly everywhere, build passes

### Phase 3: Page Migrations (US-013 to US-025)

**US-013: Migrate layout header bar**
- Replace raw `<header>` with library components — logo area, settings gear button
- Acceptance: header matches baseline screenshots, build passes

**US-014: Migrate layout bottom tab bar**
- Replace raw `<nav class="bottom-tabs">` with library `Tabs` component
- Map active state styling
- Acceptance: tab navigation works, active indicator matches baseline, build passes

**US-015: Migrate home page skeleton loading**
- Replace `.skeleton`, `.skeleton-card` divs with library `Shimmer` components
- Acceptance: loading state matches baseline, build passes

**US-016: Migrate home page session cards**
- Replace `.session-card` raw HTML (badges, stats, timestamps) with library components
- Use `Pill` for badges, library layout primitives
- Acceptance: populated state matches baseline, cards clickable, build passes

**US-017: Migrate project page**
- Replace back link, project header, session cards, source badges, skeleton loading
- Acceptance: all states (loading, not found, empty, populated) match baseline, build passes

**US-018: Migrate config page form fields**
- Replace raw `<select>`, `.text-field`, `.form-group` patterns with library `Select`, `Input`
- Acceptance: form inputs render correctly, values bind properly, build passes

**US-019: Migrate config page layout and QR section**
- Replace `.settings-grid`, `.settings-section` cards, QR container, setup steps list, button groups
- Acceptance: settings layout matches baseline including QR section, build passes

**US-020: Migrate terminal list cards**
- Replace `.terminal-card` raw HTML (status dots, badges, preview text, remove buttons) with library components
- Acceptance: terminal cards match baseline in running and exited states, build passes

**US-021: Migrate terminal list skeleton and empty states**
- Replace skeleton loading and empty states with library `Shimmer` and updated `EmptyState`
- Acceptance: loading and empty states match baseline, build passes

**US-022: Migrate session page chrome**
- Replace back link, session header, LIVE badge, connection status dots, meta items, paused banner
- Acceptance: header and status indicators match baseline in all states (live, ended, disconnected), build passes

**US-023: Migrate session page skeleton loading**
- Replace `.skeleton-bubble` chat loading states with library `Shimmer`
- Acceptance: loading state matches baseline, build passes

**US-024: Migrate terminal detail top bar**
- Replace `.term-topbar` (back button, command name, type badge, toggle buttons, kill/remove buttons) with library components
- Acceptance: top bar matches baseline, toggle between raw/chat works, build passes

**US-025: Migrate terminal detail input bar and exit bar**
- Replace `.term-input-bar` (text input + send button) and `.term-exited-bar` with library `Input`, `Button`
- Acceptance: input area matches baseline, send works, exit bar renders correctly, build passes

### Phase 4: Domain Component Updates (US-026 to US-031)

**US-026: Update LaunchSheet internals**
- Replace raw overlay/sheet with library `Sheet` or `Modal`
- Replace `.select-field` with library `Select`
- Replace `.text-field` with library `Input`
- Replace preset cards with library `Choicebox`
- Replace launch button with library `Button`
- Acceptance: modal opens/closes, presets selectable, terminal launches, matches baseline

**US-027: Update ConnectionStatus internals**
- Replace raw `.status-dot` + `.status-label` + `.retry-btn` with library `Status` + `Button`
- Acceptance: all 3 states render correctly, retry button works

**US-028: Update QuickKeys internals**
- Replace raw `.quick-key` buttons with library `Button`
- Acceptance: all 7 quick keys render correctly, send correct key sequences

**US-029: Update ChatView — message bubbles and avatars**
- Replace `.chat-message`, `.chat-bubble`, `.chat-avatar` with library `Avatar` + layout primitives
- Acceptance: user and assistant messages render with markdown, timestamps intact

**US-030: Update ChatView — tool cards and thinking blocks**
- Replace `.chat-tool-card` expandable sections with library `Accordion`
- Replace tool names with `Pill`, success/error results with `Banner` or `Status`
- Acceptance: tool cards expand/collapse, error/success styling matches baseline

**US-031: Update ChatView — input bar and status header**
- Replace `.chat-input-bar` with library `Input` + `Button`
- Replace LIVE/ended badges with library `Badge`/`Pill`
- Replace connection dots with library `Status`
- Acceptance: chat input works, send/cancel buttons work, status indicators correct

### Phase 5: Cleanup and Verification (US-032 to US-034)

**US-032: Delete old in-house common components**
- Remove `Button.svelte`, `Card.svelte`, `Alert.svelte`, `Input.svelte`, `Icon.svelte`, `Tag.svelte`, `StatusBadge.svelte`, `EmptyState.svelte` from `client/common/`
- Update `index.ts` exports
- Acceptance: no imports reference old components, build passes with zero errors

**US-033: Clean up app.css — remove replaced styles**
- Remove CSS rules for components now handled by library CSS vars: `.btn-*`, `.card`, `.alert`, `.tag`, `.status-badge`, `.empty-state`, `.skeleton`, `.form-group .input`
- Keep page-specific layout styles, animation keyframes, chat styles not yet replaced
- Acceptance: no visual regressions, app.css is leaner, build passes

**US-034: Final visual verification — all states, all viewports**
- Re-screenshot every route in every state at all 3 viewports
- Compare against baseline screenshots from US-004
- Document any remaining differences
- Acceptance: all pages match baseline or are intentionally improved, zero visual regressions

## Execution Strategy

This migration will be executed using **snarktank/ralph** — an external bash loop that spawns fresh Claude Code instances per iteration. Each iteration picks the highest-priority incomplete user story from `prd.json`, implements it, runs quality gates (`pnpm build`, `svelte-check`), commits, and updates status.

### Quality Gates (Every Iteration)
1. `pnpm build` passes (no build errors)
2. `pnpm check` passes (svelte-check, TypeScript)
3. No new lint errors
4. Visual spot-check against baseline screenshots

### Ralph Configuration
- **Tool**: Claude Code (`--tool claude`)
- **Max iterations**: 50 (safety net)
- **Branch**: `feat/svelte-ui-migration`
- **Completion signal**: All stories have `passes: true`

### Story Dependencies
```
US-001 → US-002 → US-003 → US-004
                              ↓
              US-005 through US-012 (sequential, each builds on theme)
                              ↓
              US-013 through US-025 (pages, can be any order)
                              ↓
              US-026 through US-031 (domain components, can be any order)
                              ↓
              US-032 → US-033 → US-034
```

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Library `Icon` doesn't cover all 11 project icons | Keep project Icon component or add SVGs alongside library |
| Library `Card` doesn't exist | Keep as thin project wrapper or use plain CSS container |
| Theme mapping misses edge cases | Baseline screenshots catch regressions; fix in subsequent iterations |
| `Shimmer` doesn't match current skeleton shapes | Custom CSS vars on Shimmer to match current dimensions |
| `Sheet` animation differs from current LaunchSheet | CSS vars to customize animation direction and timing |
| Library version incompatibility | Pin version in package.json |

## Files Changed (Summary)

### New Files
- `.mcp.json` — MCP server configuration
- `src/lib/theme.css` (or similar) — Geist-to-library CSS variable mapping
- `docs/screenshots/baseline/*.png` — ~75-90 baseline screenshots
- `docs/screenshots/after/*.png` — post-migration comparison screenshots

### Modified Files
- `package.json` — new dependencies
- `src/app.css` — removed replaced component styles
- `src/routes/+layout.svelte` — library components
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
- `src/lib/modules/client/common/index.ts` — updated exports

### Deleted Files
- `src/lib/modules/client/common/Button.svelte`
- `src/lib/modules/client/common/Card.svelte`
- `src/lib/modules/client/common/Alert.svelte`
- `src/lib/modules/client/common/Input.svelte`
- `src/lib/modules/client/common/Icon.svelte`
- `src/lib/modules/client/common/Tag.svelte`
- `src/lib/modules/client/common/StatusBadge.svelte`
- `src/lib/modules/client/common/EmptyState.svelte`
