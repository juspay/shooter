# Native-Feel Foundation (Slice 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shooter stop looking like a website and start feeling like a native phone app — via a central amber re-theme on an upgraded component library, the highest-leverage hygiene fixes, motion primitives, and real (web + iOS + Android) haptics.

**Architecture:** Deliver the entire visual identity through the _central theme layer_ only — `src/lib/theme.css` (the `@juspay/svelte-ui-components` CSS-variable mappings) plus the `:root` token block and global classes in `src/app.css`. Components reference central tokens (`var(--accent)`); they never hardcode a look. Upgrade the library first so the central press/focus theming hooks exist, then re-theme, then layer motion + haptics on top.

**Tech Stack:** SvelteKit (adapter-node) · Svelte 5 runes · TypeScript (strict) · `@juspay/svelte-ui-components` 2.87.0 · pnpm · `node:test` test runner · native iOS (Swift/WKWebView) + Android (Kotlin/WebView) wrappers · chrome-devtools MCP for screenshot verification.

## Global Constraints

_Every task implicitly inherits this section. Values are verbatim from the spec (`docs/superpowers/specs/2026-07-08-native-feel-foundation-design.md`)._

- **Centralize the look.** Visual/identity changes go through `src/lib/theme.css` + `src/app.css` `:root`/global classes ONLY. **No per-component `.svelte` style forks for theming** — components only reference central tokens (e.g. `var(--accent)`).
- **Library floor:** `@juspay/svelte-ui-components` at **2.87.0** (up from `^2.18.0`). Upgrade + regression-verify FIRST.
- **Accent = Amber Phosphor** `#f5b14c` (fg on amber `#0c0d0b`, hover `#ffc266`, dim `rgba(245,177,76,.14)`, line `rgba(245,177,76,.32)`). **Green `--ds-green-700` = live/success ONLY. Blue `--ds-blue-700` = info ONLY.**
- **Bolder tokens:** `--text-base` 14→**16px**; `--radius-lg` 8→**14px**; `--radius-xl` 12→**18px**; page-title tracking `--tracking-tighter`→`--tracking-tight`. One committed card elevation.
- **Native haptics this slice:** iOS (`UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator`/`UISelectionFeedbackGenerator`) + Android (`Vibrator`/`VibrationEffect`).
- **Types:** all types live in `src/lib/types/`, imported via the `$lib/types` barrel; unions are hand-written and re-exported from `index.ts`. Named exports only; no `export default`; no `any`.
- **Definition of done requires:** `pnpm build` clean + full screenshot regression + every feature exercised end-to-end.

## Approach note — TDD vs. verification protocol

This is a theming slice, so the test discipline adapts by task type (both are mandatory gates):

- **Logic tasks** (the `haptic()` function, the `HapticKind` type, token grep-guards) use real TDD: failing test first → minimal impl → passing run → commit.
- **Visual/CSS/theme tasks** (which cannot be xUnit-tested) use a concrete **verification protocol** instead of a unit test: a grep-guard command with expected output where applicable, a `pnpm build` check, and a specific **screenshot checklist** (which screen, what to look for) captured via the chrome-devtools MCP against the local dev server.

## Execution ordering

Strictly sequential across units: **Unit E (upgrade + regression) must fully pass before any theming.** Then **A** (tokens) → **B** (hygiene/bolder) → **C** (motion) → **D** (haptics). Within the shared files (`src/app.css` `:root`, `src/lib/theme.css`, `src/routes/+layout.svelte`) later units make additive edits to distinct blocks; keep to this order to avoid churn.

---

## Unit E — Library upgrade (@juspay/svelte-ui-components 2.18.0 → 2.87.0) + screenshot regression protocol

### Task 1: Capture pre-upgrade screenshot baseline for every library-consuming screen

**Files:**

- Test: `test-screenshots/native-feel-unit-e/pre-upgrade/*.png` (new directory)

**Interfaces:**

- Consumes: none (read-only capture against the running dev server)
- Produces: `test-screenshots/native-feel-unit-e/pre-upgrade/*.png` — the baseline the post-upgrade task diffs against

- [ ] **Step 1: Confirm the dev server is up and enumerate every screen that renders a library component**

Grep confirms which routes/components pull from `@juspay/svelte-ui-components` (already run during drafting):

```bash
grep -rl "@juspay/svelte-ui-components" /Users/sachinsharma/Developer/Personal/shooter/src
```

Expected output (19 files — this is the exhaustive set the screenshot pass must cover, directly or via a shared component they render):

```
src/app.css
src/lib/modules/client/activity/ActivityFeed.svelte
src/lib/modules/client/dashboard/DashboardCard.svelte
src/lib/modules/client/terminal/ChatView.svelte
src/lib/modules/client/terminal/CommandPalette.svelte
src/lib/modules/client/terminal/ConnectionStatus.svelte
src/lib/modules/client/terminal/LaunchSheet.svelte
src/lib/modules/client/terminal/QuickKeys.svelte
src/lib/modules/client/terminal/ShareGate.svelte
src/lib/modules/client/terminal/ShareSheet.svelte
src/lib/modules/client/terminal/ShortcutsHelp.svelte
src/lib/theme.css
src/routes/+error.svelte
src/routes/+layout.svelte
src/routes/+page.svelte
src/routes/config/+page.svelte
src/routes/neurolink/+page.svelte
src/routes/project/+page.svelte
src/routes/session/[id]/+page.svelte
src/routes/sos/[id]/+page.svelte
src/routes/sos/+page.svelte
src/routes/terminals/[id]/+page.svelte
src/routes/terminals/+page.svelte
```

Confirm the dev server (already running at task-drafting time) is still reachable before capturing:

```bash
curl -s http://localhost:54006/api/health
```

Expected output: `{"status":"healthy",...}` (HTTP 200). If it is not running, start it in the background:

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm dev
```

Expected: log line `Local: http://localhost:54006` and `Dev tunnel:` (or `--no-tunnel` equivalent) within ~15s, then it idles serving requests.

- [ ] **Step 2: Create the baseline screenshot directory**

```bash
mkdir -p /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/pre-upgrade
```

Expected output: no output, directory exists (`ls` shows it empty).

- [ ] **Step 3: Capture one screenshot per screen using the chrome-devtools MCP tools against the dev server**

This repo has no Playwright/Puppeteer script — screenshots are captured interactively via the `chrome-devtools-mcp` MCP tools (per the global CLAUDE.md "Chrome DevTools MCP" setup), pointed at the local dev server instead of production. For each row below: `navigate_page` to the URL, `take_snapshot` to get element refs if a click/state-change is needed, then `take_screenshot` and save to the given filename under `test-screenshots/native-feel-unit-e/pre-upgrade/`. Emulate an iPhone-sized viewport (390x844) via `resize_page` before capturing so this is a phone-first regression check, not a desktop one.

Checklist (14 screenshots — every screen/sub-state that renders a library component):

```
[ ] 01-dashboard.png          → navigate http://localhost:54006/            (Dashboard: DashboardCard, EmptyState/Card via +page.svelte)
[ ] 02-activity.png           → navigate http://localhost:54006/activity    (ActivityFeed: Pill/Tag/EmptyState)
[ ] 03-terminals-list.png     → navigate http://localhost:54006/terminals   (list: Card/ListItem/Button, or EmptyState if none)
[ ] 04-terminals-launchsheet.png → on /terminals, tap the "+"/launch trigger to open LaunchSheet (Sheet/Choicebox/Button)
[ ] 05-terminal-raw-tab.png   → launch (or open existing) a terminal at /terminals/[id], "Raw" tab active (ChatView/Tabs/Icon)
[ ] 06-terminal-chat-tab.png  → same terminal, switch to "Chat" tab (ChatView message rendering)
[ ] 07-terminal-quickkeys.png → same terminal, quick-keys bar visible at bottom (QuickKeys: Button/Pill row)
[ ] 08-terminal-sharesheet.png → tap the share/export action to open ShareSheet (Sheet/Button)
[ ] 09-terminal-shortcuts.png → open ShortcutsHelp overlay (Modal/Card) if reachable via a visible control
[ ] 10-project.png            → navigate http://localhost:54006/project     (project dashboard: Card/Tabs)
[ ] 11-session-detail.png     → navigate http://localhost:54006/session/[id] for an existing session id (ChatView reused)
[ ] 12-config.png             → navigate http://localhost:54006/config      (Input/Toggle-equivalent/Button/Select)
[ ] 13-sos.png                → navigate http://localhost:54006/sos         (list) and, if any SOS item exists, /sos/[id]
[ ] 14-neurolink.png          → navigate http://localhost:54006/neurolink   (provider config UI: Select/Input/Card)
```

Example tool sequence for row 01 (repeat this pattern, swapping URL/filename, for every row):

```
mcp__plugin_chrome-devtools-mcp_chrome-devtools__resize_page(width=390, height=844)
mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page(url="http://localhost:54006/")
mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot(filePath="/Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/pre-upgrade/01-dashboard.png")
```

Expected: 14 PNG files exist under `test-screenshots/native-feel-unit-e/pre-upgrade/`, each showing the current (2.18.0) rendering — Vercel-blue accents, 14px base text, 8px/12px radii, flat card treatment. Verify with:

```bash
ls /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/pre-upgrade/ | wc -l
```

Expected output: `14` (or fewer only if a screen genuinely has no reachable state in dev, e.g. no SOS item — note any skipped row explicitly rather than silently omitting it).

- [ ] **Step 4: Commit the baseline**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add test-screenshots/native-feel-unit-e/pre-upgrade/
git commit -m "test(native-feel): capture pre-upgrade screenshot baseline for svelte-ui-components 2.18.0"
```

Expected output: `[feat/native-feel-foundation <sha>] test(native-feel): capture pre-upgrade screenshot baseline for svelte-ui-components 2.18.0` with 14 files changed.

---

### Task 2: Bump @juspay/svelte-ui-components 2.18.0 → 2.87.0 and verify the build

**Files:**

- Modify: `package.json:119`
- Modify: `pnpm-lock.yaml` (regenerated by `pnpm install`)

**Interfaces:**

- Consumes: none
- Produces: `@juspay/svelte-ui-components@2.87.0` installed in `node_modules` — the version every later theming unit (A/B/C/D) builds its `theme.css` changes against, including the new central hooks `--button-active-transform`, `--button-active-background`, `--button-hover-transform`, `--button-focus-visible-box-shadow`

- [ ] **Step 1: Bump the version pin in package.json**

Current code (`package.json:118-119`, read via `Read` tool):

```json
  "dependencies": {
    "@juspay/svelte-ui-components": "^2.18.0",
```

New code:

```json
  "dependencies": {
    "@juspay/svelte-ui-components": "2.87.0",
```

- [ ] **Step 2: Update the lockfile**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm install
```

Expected output: pnpm resolves and installs `@juspay/svelte-ui-components@2.87.0`, ends with something like `Done in Xs` and no `ERR_PNPM_*` lines. Confirm the lockfile actually moved:

```bash
grep -n "'@juspay/svelte-ui-components'" pnpm-lock.yaml | head -5
```

Expected output (version string present, replacing the old `2.18.0` entries):

```
      '@juspay/svelte-ui-components':
  '@juspay/svelte-ui-components@2.87.0':
  '@juspay/svelte-ui-components@2.87.0(svelte@5.55.7(@typescript-eslint/types@8.57.2))(type-decoder@2.3.1)':
```

And confirm no stale `2.18.0` reference remains:

```bash
grep -c "@juspay/svelte-ui-components@2.18.0" /Users/sachinsharma/Developer/Personal/shooter/pnpm-lock.yaml
```

Expected output: `0`

- [ ] **Step 3: Confirm the installed package version on disk**

```bash
node -p "require('/Users/sachinsharma/Developer/Personal/shooter/node_modules/@juspay/svelte-ui-components/package.json').version"
```

Expected output: `2.87.0`

- [ ] **Step 4: Type-check and lint (catches prop/type drift across the ~15 components in use before the build step)**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm check
```

Expected output: ends with `svelte-check found 0 errors and 0 warnings` (or equivalent zero-error summary) and no TypeScript diagnostic output from the trailing `tsc --noEmit --strict`. If prop names/types shifted (e.g. a renamed `Sheet`/`Choicebox` prop), this step surfaces it as a compile error at the exact call site — fix the call site's usage to match the new signature (not a theme change, so it does not violate the central-theming constraint) before continuing.

- [ ] **Step 5: Production build**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
```

Expected output: Vite build completes (`✓ built in Xs`), `postbuild` copies `pty-holder.cjs`, and:

```bash
ls /Users/sachinsharma/Developer/Personal/shooter/build/handler.js /Users/sachinsharma/Developer/Personal/shooter/build/pty-holder.cjs
```

Expected output: both files listed, no "No such file or directory" error.

- [ ] **Step 6: Run the existing test suite as a non-regression smoke check**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm test
```

Expected output: every `tests/*.test.cjs` invocation prints its own pass summary (e.g. `✓ all N tests passed` per file) and the command exits `0`. None of these tests exercise the UI library directly, so this step's purpose is confirming the dependency bump didn't break module resolution or the server-side build graph — it is not a substitute for the screenshot regression in the next task.

- [ ] **Step 7: Restart the dev server on the new build so the screenshot task in the next task hits 2.87.0**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm dev
```

Expected: same startup log as before (`Local: http://localhost:54006`), now serving the rebuilt app against `@juspay/svelte-ui-components@2.87.0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @juspay/svelte-ui-components 2.18.0 -> 2.87.0

Unlocks central press/focus theming hooks (--button-active-transform,
--button-active-background, --button-hover-transform,
--button-focus-visible-box-shadow) needed for the native-feel re-theme.
Same major (2.x) — pnpm check/build/test clean; visual regression
verified separately via before/after screenshots."
```

Expected output: `[feat/native-feel-foundation <sha>] chore(deps): bump @juspay/svelte-ui-components 2.18.0 -> 2.87.0` with 2 files changed.

---

### Task 3: Post-upgrade screenshot regression + feature exercise on 2.87.0

**Files:**

- Test: `test-screenshots/native-feel-unit-e/post-upgrade/*.png` (new directory)

**Interfaces:**

- Consumes: `test-screenshots/native-feel-unit-e/pre-upgrade/*.png` (produced by Task "Capture pre-upgrade screenshot baseline")
- Produces: sign-off that `@juspay/svelte-ui-components@2.87.0` is a safe base — the gate later theming units (Unit A token re-base, Unit B website-tell fixes, Unit C motion, Unit D haptics) depend on before touching `theme.css`/`app.css`

- [ ] **Step 1: Re-capture the identical 14-screen checklist against the upgraded build**

```bash
mkdir -p /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/post-upgrade
```

Repeat exactly the same 14 rows and tool-call pattern as the pre-upgrade task (same URLs, same viewport `390x844`, same interactions to reach each state), saving into `post-upgrade/` with matching filenames:

```
01-dashboard.png
02-activity.png
03-terminals-list.png
04-terminals-launchsheet.png
05-terminal-raw-tab.png
06-terminal-chat-tab.png
07-terminal-quickkeys.png
08-terminal-sharesheet.png
09-terminal-shortcuts.png
10-project.png
11-session-detail.png
12-config.png
13-sos.png
14-neurolink.png
```

Expected:

```bash
diff <(ls /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/pre-upgrade/) <(ls /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/post-upgrade/)
```

Expected output: empty (identical filename sets — same screens covered both passes).

- [ ] **Step 2: Visually diff each pair and log any regression**

For each of the 14 filenames, open the pre/post pair side by side (read both PNGs with the `Read` tool, which renders images) and confirm: no layout shift, no missing/broken icons, no changed button/pill/card shapes, no console errors introduced. This slice makes **no theme changes yet** (that's Units A–D), so pre/post should be visually near-identical except for incidental upstream fixes in 2.19–2.87 (e.g. a padding or focus-ring tweak inside the library's own default CSS). Record any such diff:

```bash
touch /Users/sachinsharma/Developer/Personal/shooter/test-screenshots/native-feel-unit-e/REGRESSIONS.md
```

If a regression is found, write one bullet per issue into that file (screen name, what changed, whether it's cosmetic-acceptable-upstream-drift or a real break) — do not silently proceed past a real break; fix the call site (prop/slot usage) before continuing to Unit A.

- [ ] **Step 3: Manually exercise every feature end-to-end on the upgraded library (per Constraint 5 / spec's "Feature exercise" checklist)**

Drive each of these via the chrome-devtools MCP tools (`click`, `fill`, `press_key`) against `http://localhost:54006`, confirming no functional regression from the bump:

```
[ ] Launch a terminal from /terminals (LaunchSheet: pick a project/command, submit) — new terminal appears in the list
[ ] Attach to the launched terminal at /terminals/[id] — PTY output streams live in the Raw tab
[ ] Switch Raw <-> Chat tabs — content renders in both without error
[ ] Tap 2-3 QuickKeys buttons (e.g. Ctrl-C, Tab, arrow) — keystroke reaches the PTY (visible effect in Raw tab)
[ ] Type a line of input and press Enter — command executes, output appears
[ ] Kill the terminal — status flips to killed/removed, list updates
[ ] Open /session/[id] for an existing session — messages render via ChatView
[ ] Open /config, change one field (e.g. a toggle/select), Save — success toast/state, value persists on reload
[ ] Generate the QR code on /config (or wherever qr-config renders) — QR image renders
[ ] Load / (Dashboard) with at least one terminal card present — DashboardCard renders correct status
[ ] Load /activity — ActivityFeed renders entries (or EmptyState if none) without console errors
```

Expected: every row completes with the described visible effect and zero uncaught console errors (check via `mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_console_messages` after the pass — expect no new `error`-level entries attributable to the app's own code, i.e. ignore unrelated network noise from e.g. missing FCM config).

- [ ] **Step 4: Final build + lint gate**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter && pnpm quality:all
```

Expected output: `pnpm run lint`, `pnpm run format:check`, and `pnpm run check` each report zero errors/warnings, command exits `0`.

- [ ] **Step 5: Commit the post-upgrade regression evidence**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add test-screenshots/native-feel-unit-e/post-upgrade/
git status --short test-screenshots/native-feel-unit-e/REGRESSIONS.md
```

If `REGRESSIONS.md` was created in Step 2 (non-empty), add it too; otherwise it stays untracked/empty and is skipped:

```bash
git add test-screenshots/native-feel-unit-e/REGRESSIONS.md 2>/dev/null || true
git commit -m "test(native-feel): post-upgrade screenshot regression + feature exercise for svelte-ui-components 2.87.0

Verified all 14 library-consuming screens against the pre-upgrade
baseline and manually exercised terminal launch/attach/kill, quick
keys, session view, config save, and QR generation. No functional
regressions from 2.18.0 -> 2.87.0; safe base for the Unit A/B/C/D
central re-theme."
```

Expected output: `[feat/native-feel-foundation <sha>] test(native-feel): post-upgrade screenshot regression + feature exercise for svelte-ui-components 2.87.0` with the post-upgrade PNGs (and `REGRESSIONS.md` if non-empty) listed as new files.

## Unit A — Central token re-base (amber accent split from status)

### Task 4: Add central accent + status token layer to app.css :root

**Files:**

- Modify: `src/app.css:117-120`

**Interfaces:**

- Consumes: none
- Produces: `--accent`, `--accent-hover`, `--accent-fg`, `--accent-dim`, `--accent-line`, `--status-live`, `--status-success`, `--status-info`, `--status-danger` — new CSS custom properties on `:root`, consumed by every later step in this unit and by Units B/C/D.

- [ ] **Step 1: Insert the accent + status token block at the end of the `:root` block**

Current (`src/app.css:106-120`):

```css
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;

  /* Layout */
  --max-width: 1100px;
  --header-height: 64px;
}
```

New:

```css
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;

  /* Layout */
  --max-width: 1100px;
  --header-height: 64px;

  /* Brand accent — Amber Phosphor. The ONLY hue for actions/active/selected/focus. */
  --ds-amber-accent: #f5b14c;
  --ds-amber-accent-hover: #ffc266;
  --ds-amber-accent-fg: #0c0d0b;
  --ds-amber-accent-dim: rgba(245, 177, 76, 0.14);
  --ds-amber-accent-line: rgba(245, 177, 76, 0.32);
  --accent: var(--ds-amber-accent);
  --accent-hover: var(--ds-amber-accent-hover);
  --accent-fg: var(--ds-amber-accent-fg);
  --accent-dim: var(--ds-amber-accent-dim);
  --accent-line: var(--ds-amber-accent-line);

  /* Status — semantic and separate from accent. Never repurpose these for actions. */
  --status-live: var(--ds-green-700);
  --status-success: var(--ds-green-700);
  --status-info: var(--ds-blue-700);
  --status-danger: var(--ds-red-700);
}
```

- [ ] **Step 2: Verify the tokens exist**

```bash
grep -n -- "--accent:\|--accent-hover:\|--accent-fg:\|--accent-dim:\|--accent-line:\|--status-live:\|--status-success:\|--status-info:\|--status-danger:" src/app.css
```

Expected output (9 lines, inside `:root`):

```
83:  --accent: var(--ds-amber-accent);
84:  --accent-hover: var(--ds-amber-accent-hover);
85:  --accent-fg: var(--ds-amber-accent-fg);
86:  --accent-dim: var(--ds-amber-accent-dim);
87:  --accent-line: var(--ds-amber-accent-line);
90:  --status-live: var(--ds-green-700);
91:  --status-success: var(--ds-green-700);
92:  --status-info: var(--ds-blue-700);
93:  --status-danger: var(--ds-red-700);
```

(exact line numbers will shift by a few lines depending on final placement — what matters is all 9 declarations exist once, inside the same `:root` block as `--ds-green-700`/`--ds-blue-700`/`--ds-red-700`).

- [ ] **Step 3: Build check**

```bash
pnpm build
```

Expected: exits 0, no CSS/Vite errors (a new custom-property block cannot break the build, but this confirms no stray syntax error like a missing `;` or brace).

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "feat(theme): add central amber accent and status token layer"
```

---

### Task 5: Rewire theme.css library variable mappings to central accent tokens

**Files:**

- Modify: `src/lib/theme.css:12-23` (Button block)
- Modify: `src/lib/theme.css:37` (Input block)
- Modify: `src/lib/theme.css:110` (Tabs block)
- Modify: `src/lib/theme.css:189,190,198,199` (Choicebox block)

**Interfaces:**

- Consumes: `--accent`, `--accent-hover`, `--accent-fg`, `--accent-dim`, `--accent-line` (produced by "Add central accent + status token layer" task, `src/app.css`)
- Produces: none (rewires existing library-consumed CSS variable names — `--button-color`, `--button-text-color`, `--button-hover-color`, `--button-hover-text-color`, `--button-active-background`, `--input-focus-border`, `--tabs-indicator-color`, `--choicebox-selected-border-color`, `--choicebox-selected-background`, `--choicebox-indicator-selected-color`, `--choicebox-focus-ring` — read by `@juspay/svelte-ui-components` `Button`/`Input`/`Tabs`/`Choicebox`)

- [ ] **Step 1: Rewire the Button block**

Current (`src/lib/theme.css:12-23`):

```css
/* ===== Button ===== */
--button-font-family: var(--font-sans);
--button-font-size: var(--text-sm);
--button-font-weight: 500;
--button-color: var(--ds-blue-700);
--button-text-color: #fff;
--button-padding: 8px 16px;
--button-border-radius: var(--radius-md);
--button-border: 1px solid transparent;
--button-hover-color: var(--ds-blue-900);
--button-hover-text-color: #fff;
--button-content-gap: 8px;
```

New:

```css
/* ===== Button ===== */
--button-font-family: var(--font-sans);
--button-font-size: var(--text-sm);
--button-font-weight: 500;
--button-color: var(--accent);
--button-text-color: var(--accent-fg);
--button-padding: 8px 16px;
--button-border-radius: var(--radius-md);
--button-border: 1px solid transparent;
--button-hover-color: var(--accent-hover);
--button-hover-text-color: var(--accent-fg);
--button-active-background: var(--accent-hover);
--button-content-gap: 8px;
```

Note: `--button-hover-text-color` is switched from `#fff` to `var(--accent-fg)` (not literally listed in the design table, but required — the fill stays amber-family on hover, and white text on a light amber (`#ffc266`) hover fill fails contrast; `--accent-fg` (`#0c0d0b`) is the color designed for text-on-amber). `--button-active-background` is a new declaration — the hook doesn't exist pre-upgrade (Unit E lands `2.87.0`), but declaring an unused custom property is inert until the upgrade ships, and this way the mapping is already correct the moment Unit E lands.

- [ ] **Step 2: Rewire the Input focus border**

Current (`src/lib/theme.css:37`):

```css
--input-focus-border: 1px solid var(--ds-blue-700);
```

New:

```css
--input-focus-border: 1px solid var(--accent);
```

- [ ] **Step 3: Rewire the Tabs indicator**

Current (`src/lib/theme.css:110`):

```css
--tabs-indicator-color: var(--ds-blue-700);
```

New:

```css
--tabs-indicator-color: var(--accent);
```

- [ ] **Step 4: Rewire the Choicebox selection + focus ring**

Current (`src/lib/theme.css:181-199`):

```css
/* ===== Choicebox ===== */
--choicebox-background: var(--ds-gray-100);
--choicebox-border: 2px solid var(--border);
--choicebox-border-radius: var(--radius-lg);
--choicebox-padding: 16px;
--choicebox-gap: 12px;
--choicebox-hover-border-color: var(--border-hover);
--choicebox-hover-background: var(--ds-gray-200);
--choicebox-selected-border-color: var(--ds-blue-700);
--choicebox-selected-background: var(--ds-blue-100);
--choicebox-title-color: var(--text-primary);
--choicebox-title-font-size: var(--text-base);
--choicebox-title-font-weight: 500;
--choicebox-title-font-family: var(--font-sans);
--choicebox-description-color: var(--text-tertiary);
--choicebox-description-font-size: var(--text-sm);
--choicebox-indicator-border: 2px solid var(--ds-gray-500);
--choicebox-indicator-selected-color: var(--ds-blue-700);
--choicebox-focus-ring: 0 0 0 3px rgba(0, 112, 243, 0.2);
```

New:

```css
/* ===== Choicebox ===== */
--choicebox-background: var(--ds-gray-100);
--choicebox-border: 2px solid var(--border);
--choicebox-border-radius: var(--radius-lg);
--choicebox-padding: 16px;
--choicebox-gap: 12px;
--choicebox-hover-border-color: var(--border-hover);
--choicebox-hover-background: var(--ds-gray-200);
--choicebox-selected-border-color: var(--accent);
--choicebox-selected-background: var(--accent-dim);
--choicebox-title-color: var(--text-primary);
--choicebox-title-font-size: var(--text-base);
--choicebox-title-font-weight: 500;
--choicebox-title-font-family: var(--font-sans);
--choicebox-description-color: var(--text-tertiary);
--choicebox-description-font-size: var(--text-sm);
--choicebox-indicator-border: 2px solid var(--ds-gray-500);
--choicebox-indicator-selected-color: var(--accent);
--choicebox-focus-ring: 0 0 0 3px var(--accent-line);
```

Note: `--choicebox-focus-ring` is not in the design doc's literal 3-variable table, but it sits three lines below `--choicebox-indicator-selected-color` in the same block and was still hardcoded to `rgba(0, 112, 243, 0.2)` (Vercel blue) — leaving it would put a blue keyboard-focus ring on a now-amber-selected choicebox, directly contradicting the "selected choicebox amber" verification checklist item and the unit's own grep-guard ("no ... selection color still resolves to --ds-blue-700" — this is a literal rgba, not a `var(--ds-blue-700)` reference, so the guard's grep for the token name won't catch it, but the intent — no blue left in the choicebox selection path — requires fixing it here too). `--accent-line` (`rgba(245, 177, 76, 0.32)`) is the token purpose-built for this kind of ring.

- [ ] **Step 5: Verify no button/input/tabs/choicebox variable in theme.css still resolves to blue**

```bash
grep -n -- "ds-blue-700\|0, 112, 243" src/lib/theme.css
```

Expected output: empty (no matches).

- [ ] **Step 6: Build check**

```bash
pnpm build
```

Expected: exits 0, no CSS errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/theme.css
git commit -m "feat(theme): rewire button, input, tabs and choicebox to the accent token"
```

---

### Task 6: Rewire central app.css focus/selection state and remove the neurolink per-component fork

**Files:**

- Modify: `src/app.css:638-644` (`.btn:focus-visible, .input:focus-visible, .nav-link:focus-visible`)
- Modify: `src/app.css:657-661` (`::selection`)
- Modify: `src/routes/neurolink/+page.svelte:321-328` (`.input-bar :global(.input-prompt)`)

**Interfaces:**

- Consumes: `--accent`, `--accent-fg` (produced by "Add central accent + status token layer" task)
- Produces: none

- [ ] **Step 1: Rewire the generic focus-visible outline**

Current (`src/app.css:638-644`):

```css
/* Focus States */
.btn:focus-visible,
.input:focus-visible,
.nav-link:focus-visible {
  outline: 2px solid var(--ds-blue-700);
  outline-offset: 2px;
}
```

New:

```css
/* Focus States */
.btn:focus-visible,
.input:focus-visible,
.nav-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Rewire the text-selection highlight**

Current (`src/app.css:657-661`):

```css
/* Selection */
::selection {
  background: var(--ds-blue-700);
  color: #fff;
}
```

New:

```css
/* Selection */
::selection {
  background: var(--accent);
  color: var(--accent-fg);
}
```

- [ ] **Step 3: Remove the neurolink page's per-component `--input-focus-border` fork**

This is a direct violation of Constraint 1 ("no per-component `.svelte` style forks for theming") on the exact variable centralized in the previous task — left in place, it silently overrides the new central amber focus border back to hardcoded blue on `/neurolink`, and would make the unit's own grep-guard fail.

Current (`src/routes/neurolink/+page.svelte:321-328`):

```css
.input-bar :global(.input-prompt) {
  flex: 1;
  --input-font-family: var(--font-mono);
  --input-background: var(--component-bg);
  --input-border: 1px solid var(--border-hover);
  --input-focus-border: 1px solid var(--ds-blue-700);
  --input-container-margin: 0;
}
```

New (delete the fork — the component now inherits the centrally-rewired `--input-focus-border: 1px solid var(--accent)` from `theme.css`):

```css
.input-bar :global(.input-prompt) {
  flex: 1;
  --input-font-family: var(--font-mono);
  --input-background: var(--component-bg);
  --input-border: 1px solid var(--border-hover);
  --input-container-margin: 0;
}
```

- [ ] **Step 4: Verify no button/tab/input/selection color resolves to blue anywhere touched by this unit**

```bash
grep -rn -- "ds-blue-700" src/app.css src/lib/theme.css src/routes/+layout.svelte src/lib/modules/client/terminal/LaunchSheet.svelte src/routes/neurolink/+page.svelte
```

Expected output (only the primitive definition and unrelated informational-text/status usages remain — none in a button/tab/input/selection/focus context):

```
src/app.css:27:  --ds-blue-700: #0070f3;
src/routes/neurolink/+page.svelte:228:    color: var(--ds-blue-700);
src/routes/neurolink/+page.svelte:301:    color: var(--ds-blue-700);
```

(Those two neurolink hits are the page `<h1>` title color and `.log-entry.user` chat-role text color — decorative/informational text, not a button/tab/input/selection/focus surface, and out of this unit's scope.)

- [ ] **Step 5: Build check**

```bash
pnpm build
```

Expected: exits 0, no CSS/Svelte errors.

- [ ] **Step 6: Commit**

```bash
git add src/app.css src/routes/neurolink/+page.svelte
git commit -m "fix(theme): rewire global focus/selection to accent and drop neurolink input-focus fork"
```

---

### Task 7: Point layout active-tab and gear focus outline at the accent token

**Files:**

- Modify: `src/routes/+layout.svelte:178-181`
- Modify: `src/routes/+layout.svelte:233-235`

**Interfaces:**

- Consumes: `--accent` (produced by "Add central accent + status token layer" task)
- Produces: none

- [ ] **Step 1: Rewire the gear-button focus outline**

Current (`src/routes/+layout.svelte:178-181`):

```svelte
  :global(.btn-gear:focus-visible) {
    outline: 2px solid var(--ds-green-700);
    outline-offset: 2px;
  }
```

New:

```svelte
  :global(.btn-gear:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
```

- [ ] **Step 2: Rewire the active bottom-tab color**

Current (`src/routes/+layout.svelte:233-235`):

```svelte
  .tab-item.active {
    color: var(--ds-green-700);
  }
```

New:

```svelte
  .tab-item.active {
    color: var(--accent);
  }
```

- [ ] **Step 3: Verify no green/blue action color remains in +layout.svelte**

```bash
grep -n -- "ds-green-700\|ds-blue-700" src/routes/+layout.svelte
```

Expected output: empty (no matches) — green is no longer used for the active tab or focus ring, only `var(--accent)` remains for those two spots.

- [ ] **Step 4: Build check**

```bash
pnpm build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "fix(nav): rewire active tab and gear focus ring to the accent token"
```

---

### Task 8: Point LaunchSheet's launch button at the accent token

**Files:**

- Modify: `src/lib/modules/client/terminal/LaunchSheet.svelte:261-270`

**Interfaces:**

- Consumes: `--accent`, `--accent-hover` (produced by "Add central accent + status token layer" task)
- Produces: none

- [ ] **Step 1: Rewire the launch button**

Current (`src/lib/modules/client/terminal/LaunchSheet.svelte:261-270`):

```svelte
  :global(.btn-launch) {
    --button-color: var(--ds-green-700);
    --button-text-color: #fff;
    --button-hover-color: var(--ds-green-900);
    --button-hover-text-color: #fff;
    --button-border-radius: var(--radius-lg);
    --button-height: 48px;
    --button-width: 100%;
    margin-top: var(--space-2);
  }
```

New:

```svelte
  :global(.btn-launch) {
    --button-color: var(--accent);
    --button-text-color: var(--accent-fg);
    --button-hover-color: var(--accent-hover);
    --button-hover-text-color: var(--accent-fg);
    --button-border-radius: var(--radius-lg);
    --button-height: 48px;
    --button-width: 100%;
    margin-top: var(--space-2);
  }
```

- [ ] **Step 2: Unit-level grep-guard sign-off — no button/tab/input/selection color resolves to `--ds-blue-700` anywhere in the app**

```bash
grep -rn -- "ds-blue-700" src --include="*.css" --include="*.svelte" \
  | grep -viE "app.css:27|dashboardcard.svelte:(29|33|184|232|233|234|235)|autopilotpanel.svelte:(380|533)|activityfeed.svelte:252|neurolink/\+page.svelte:(228|271|301)"
```

Expected output: empty (no matches). The allowlisted survivors are all status/info semantics or focus rings on components explicitly deferred to Unit B's press/focus centralization (`DashboardCard.svelte`'s `.card:focus-visible` at line 184 and status-pill/border colors, `AutopilotPanel.svelte`'s status text/outline, `ActivityFeed.svelte`'s `.type` label, and neurolink's page-title/chat-role text) — none of them are a button, tab, input, or selection surface, and all remain intentionally blue = info per the design doc.

- [ ] **Step 3: Screenshot verification checklist (Constraint 5 — capture and inspect each)**

1. `/` (Dashboard) — no primary/CTA button visible here by default; confirm connection-status dot is still **green** (unchanged) and no blue accents appear.
2. `/terminals` → tap "New Terminal" (opens `LaunchSheet`) — the **"Launch Terminal"** button fill is **amber** (`#F5B14C`), button text is dark (`--accent-fg`), no blue or green.
3. `/terminals` — bottom tab bar: navigate between Projects/Terminals/SOS — the **active tab label is amber**, inactive tabs stay muted gray; tapping the gear icon and tabbing to it with a keyboard shows an **amber focus ring**, not green.
4. `/config` (or any screen with a text `Input`) — click into a text field — the focus border ring is **amber**, not blue.
5. `/config` or any screen rendering a `Choicebox` (e.g. provider/preset selection) — select an option — the selected choicebox border/background tint is **amber**, and tabbing to it shows an amber focus ring (not blue).
6. `/neurolink` — click into the chat input — focus border is **amber** (confirms the removed per-component fork now inherits the central token); the page `<h1>` title and `.log-entry.user` text remain their existing blue (unaffected, out of scope).
7. Select some body text anywhere in the app (e.g. a chat message) — the text-selection highlight is **amber** with dark text, not blue-with-white.
8. `/terminals/[id]` — confirm the "live"/connected status pill/dot is still **green**, unaffected by the re-theme.

- [ ] **Step 4: Final build check**

```bash
pnpm build
```

Expected: exits 0, clean build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/client/terminal/LaunchSheet.svelte
git commit -m "fix(terminal): rewire launch button to the accent token"
```

## UNIT B — Website tells + bolder look (central)

### Task 9: Format-detection — stop paths/dates rendering as fake blue links

**Files:**

- Modify: `src/app.html:7-9`
- Modify: `ios/Shooter/Shooter/ContentView.swift:448-451`

**Interfaces:**

- Consumes: none
- Produces: none (pure hygiene fix; no other unit depends on this)

- [ ] **Step 1: Add the format-detection meta tag**

Current (`src/app.html:7-9`):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="apple-touch-icon" href="%sveltekit.assets%/apple-touch-icon.png" />
```

New:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
<link rel="apple-touch-icon" href="%sveltekit.assets%/apple-touch-icon.png" />
```

- [ ] **Step 2: Disable WKWebView's native data detectors (iOS)**

Current (`ios/Shooter/Shooter/ContentView.swift:448-451`):

```swift
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let prefs = WKWebpagePreferences()
```

New:

```swift
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // Match the web meta[name=format-detection] behavior natively: plain text
        // (session paths, timestamps, IDs) should never auto-link as tel/date/address/email.
        if #available(iOS 14.5, *) {
            config.dataDetectorTypes = []
        }

        let prefs = WKWebpagePreferences()
```

- [ ] **Step 3: Verify**

```bash
grep -n "format-detection" /Users/sachinsharma/Developer/Personal/shooter/src/app.html
# Expected: one match — the new <meta name="format-detection" .../> line

grep -n "dataDetectorTypes" /Users/sachinsharma/Developer/Personal/shooter/ios/Shooter/Shooter/ContentView.swift
# Expected: one match — config.dataDetectorTypes = []

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build, no errors
```

Screenshot checklist (iOS Safari or the PWA, not desktop Chrome — format-detection is a WebKit behavior): open `/` and `/project`, look at the project `fullPath` subtitle text (e.g. a path containing digits that could read as a phone number) — confirm it renders as plain grey monospace text, not an underlined blue tappable link. If an iOS device/simulator isn't available in this environment, note it as unverified in the PR description and re-check on first TestFlight/simulator build.

- [ ] **Step 4: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/app.html ios/Shooter/Shooter/ContentView.swift
git commit -m "fix(webview): disable phone/date/address auto-linking on web and iOS"
```

---

### Task 10: Header clears the notch (safe-area-inset-top)

**Files:**

- Modify: `src/app.css:154-162`

**Interfaces:**

- Consumes: none
- Produces: none

- [ ] **Step 1: Grow the header by the top safe-area inset**

Current (`src/app.css:154-162`):

```css
/* Header */
.header {
  height: var(--header-height);
  background: var(--background);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}
```

New:

```css
/* Header */
.header {
  height: calc(var(--header-height) + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--background);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}
```

This mirrors the existing bottom-inset pattern already used at `src/app.css:1833` (`.chat-input-bar`) and `src/routes/+layout.svelte:191,200` (`.main`/`.bottom-tabs`). `.header-content` (`src/app.css:164-172`) already has `height: 100%` and doesn't need editing — with the global `box-sizing: border-box` reset (`src/app.css:128`), `.header`'s content-box height stays `var(--header-height)` after the inset padding is applied, so `.header-content` continues to fill exactly one `--header-height` worth of space, positioned below the notch.

- [ ] **Step 2: Verify**

```bash
grep -n "safe-area-inset-top" /Users/sachinsharma/Developer/Personal/shooter/src/app.css
# Expected: two matches on the same .header rule (height calc + padding-top)

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build
```

Screenshot checklist: add the site to the iOS home screen (or use Safari's device-frame simulator / Chrome DevTools device toolbar with a notched device like iPhone 14 Pro) and open `/`. Confirm the logo + status badge + gear icon sit fully below the status bar/notch, not overlapped by it. Also check a non-notched viewport (desktop Chrome, no safe-area) — header height must be visually unchanged there (`env()` resolves to `0px`).

- [ ] **Step 3: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/app.css
git commit -m "fix(header): respect safe-area-inset-top under the iPhone notch"
```

---

### Task 11: Central press + focus-visible feedback for tappables

**Files:**

- Modify: `src/lib/theme.css:11-23` (Button section)
- Modify: `src/app.css:663-680` (insert new central rule after the scrollbar block)

**Interfaces:**

- Consumes: `--accent` (optional — falls back to the committed amber literal `#f5b14c` if Unit A hasn't landed `--accent` yet, so this task doesn't hard-depend on Unit A's execution order)
- Produces: `--button-active-transform`, `--button-focus-visible-box-shadow` (theme.css custom properties). **Dependency note:** at the currently-installed library version (`2.18.0`), `Button.svelte`'s `<style>` already reads `--button-active-transform` in a `button:active { transform: var(--button-active-transform); }` rule (verified in `node_modules/@juspay/svelte-ui-components/dist/Button/Button.svelte:131-133`), so the press-scale ships immediately. It has **no** `:focus-visible` rule at all yet — `--button-focus-visible-box-shadow` is inert until Unit E lands the `2.87.0` upgrade that adds that hook. This task only sets the central variable; Unit E's upgrade is what makes the focus ring render.

- [ ] **Step 1: Add press/focus vars to the Button section of theme.css**

Current (`src/lib/theme.css:11-24`):

```css
:root {
  /* ===== Button ===== */
  --button-font-family: var(--font-sans);
  --button-font-size: var(--text-sm);
  --button-font-weight: 500;
  --button-color: var(--ds-blue-700);
  --button-text-color: #fff;
  --button-padding: 8px 16px;
  --button-border-radius: var(--radius-md);
  --button-border: 1px solid transparent;
  --button-hover-color: var(--ds-blue-900);
  --button-hover-text-color: #fff;
  --button-content-gap: 8px;

  /* ===== Input ===== */
```

New:

```css
:root {
  /* ===== Button ===== */
  --button-font-family: var(--font-sans);
  --button-font-size: var(--text-sm);
  --button-font-weight: 500;
  --button-color: var(--ds-blue-700);
  --button-text-color: #fff;
  --button-padding: 8px 16px;
  --button-border-radius: var(--radius-md);
  --button-border: 1px solid transparent;
  --button-hover-color: var(--ds-blue-900);
  --button-hover-text-color: #fff;
  --button-content-gap: 8px;
  /* Press/focus feedback — central hooks read by Button.svelte (:active today;
     :focus-visible ships once @juspay/svelte-ui-components is upgraded to 2.87.0). */
  --button-active-transform: scale(0.97);
  --button-focus-visible-box-shadow: 0 0 0 2px var(--accent, #f5b14c);

  /* ===== Input ===== */
```

- [ ] **Step 2: Add the one central `:active` rule for the three custom app-shell tappables**

Current (`src/app.css:673-681`):

```css
::-webkit-scrollbar-thumb {
  background: var(--ds-gray-400);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ds-gray-500);
}

/* ============================================
   Session Cards
   ============================================ */
```

New:

```css
::-webkit-scrollbar-thumb {
  background: var(--ds-gray-400);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ds-gray-500);
}

/* Touch press feedback — central rule for the custom (non-library) app-shell
   tappables. Library tappables (Button) get press feedback via the theme.css
   vars above; .session-card/.terminal-card/.tab-item are plain elements. */
@media (hover: none) {
  .session-card:active,
  .terminal-card:active,
  .tab-item:active {
    transform: scale(0.978);
    transition: transform 60ms ease;
  }
}

/* ============================================
   Session Cards
   ============================================ */
```

`.session-card` is defined at `src/app.css:686`; `.terminal-card` is scoped inside `src/routes/terminals/+page.svelte:401` and `.tab-item` inside `src/routes/+layout.svelte:212` — both are plain (unscoped-conflicting) class names with no existing `:active` rule, so this global, unscoped `app.css` rule reaches them without needing any per-component edit.

- [ ] **Step 3: Verify**

```bash
grep -n "button-active-transform\|button-focus-visible-box-shadow" /Users/sachinsharma/Developer/Personal/shooter/src/lib/theme.css
# Expected: two matches in the Button section

grep -n "@media (hover: none)" /Users/sachinsharma/Developer/Personal/shooter/src/app.css
# Expected: at least one match — the new press-feedback block (plus any pre-existing ones from later tasks)

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build
```

Screenshot checklist (use Chrome DevTools device-toolbar touch emulation or a real phone — `:active`/`hover:none` won't trigger with a mouse): tap-and-hold on a primary `Button` (e.g. Settings page "Save" or Dashboard launch button) — button should depress via `scale(0.97)`. Tap-and-hold a session card on `/project`, a terminal card on `/terminals`, and a bottom tab on any screen — each should visibly compress (`scale(0.978)`) on press and spring back on release. The focus-visible amber ring will **not** yet be visible (blocked on Unit E) — tab to a button with a keyboard and confirm no visual regression (no broken/invalid outline), just note the ring itself is pending.

- [ ] **Step 4: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/lib/theme.css src/app.css
git commit -m "feat(theme): centralize press and focus-visible feedback for tappables"
```

---

### Task 12: One committed card elevation (central `.card`/`.list`/`.list-item` + library `Card` vars)

**Files:**

- Modify: `src/app.css:355-361` (`.card`)
- Modify: `src/app.css:479-497` (`.list`, `.list-item`)
- Modify: `src/lib/theme.css:49-51` (insert new `Card` var section)

**Interfaces:**

- Consumes: `--radius-lg` (central token, currently `8px`, bumped to `14px` by the "bolder tokens" task later in this unit — either ordering is safe since this task only ever references the token, never a literal)
- Produces: `--card-background`, `--card-border`, `--card-border-radius`, `--card-overflow`, `--card-header-padding`, `--card-header-border-bottom`, `--card-title-font-size`, `--card-title-font-weight`, `--card-title-color`, `--card-description-font-size`, `--card-description-color`, `--card-description-opacity`, `--card-description-margin-top`, `--card-content-padding` (theme.css custom properties, consumed by the library `Card` component's own scoped styles, e.g. `Card.svelte`'s `background: var(--card-background, inherit)`)

The library `Card` component (`@juspay/svelte-ui-components`, used on `/config` for "Setup Guide", "Registered Devices", "AI Providers", "Danger Zone", etc. — `src/routes/config/+page.svelte:16,430,457,529,545,596,625`) currently has **zero** `--card-*` vars set anywhere in `theme.css`, so it falls back to its own hardcoded defaults — including `border: var(--card-border, 1px solid currentColor)`, which resolves `currentColor` to `--text-primary` (near-white) and renders a stark, out-of-system light border. This is the single biggest contributor to the "flat card vs. gradient-card split" the spec calls out.

- [ ] **Step 1: Give `.card` and `.list`/`.list-item` the same elevation as `.session-card`**

Current (`src/app.css:355-361`):

```css
/* Cards */
.card {
  background: var(--component-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
```

New:

```css
/* Cards */
.card {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.9) 0%, rgba(28, 28, 32, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
}
```

Current (`src/app.css:479-493`):

```css
/* List */
.list {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--component-bg);
  border-bottom: 1px solid var(--ds-gray-alpha-200);
  transition: background var(--transition-fast);
}
```

New:

```css
/* List */
.list {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
}

.list-item {
  display: flex;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.9) 0%, rgba(28, 28, 32, 0.9) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: background var(--transition-fast);
}
```

- [ ] **Step 2: Theme the library `Card` component to match**

Current (`src/lib/theme.css:49-51`):

```css
--input-container-margin: 0 0 var(--space-5) 0;

/* ===== Banner (replaces Alert) ===== */
```

New:

```css
--input-container-margin: 0 0 var(--space-5) 0;

/* ===== Card ===== */
--card-background: linear-gradient(135deg, rgba(20, 20, 20, 0.9) 0%, rgba(28, 28, 32, 0.9) 100%);
--card-border: 1px solid rgba(255, 255, 255, 0.06);
--card-border-radius: var(--radius-lg);
--card-overflow: hidden;
--card-header-padding: var(--space-4) var(--space-5) 0;
--card-header-border-bottom: none;
--card-title-font-size: var(--text-sm);
--card-title-font-weight: 500;
--card-title-color: var(--text-primary);
--card-description-font-size: var(--text-sm);
--card-description-color: var(--text-tertiary);
--card-description-opacity: 1;
--card-description-margin-top: var(--space-1);
--card-content-padding: var(--space-5);

/* ===== Banner (replaces Alert) ===== */
```

- [ ] **Step 3: Verify**

```bash
grep -n "linear-gradient(135deg, rgba(20, 20, 20" /Users/sachinsharma/Developer/Personal/shooter/src/app.css /Users/sachinsharma/Developer/Personal/shooter/src/lib/theme.css
# Expected: 3 matches — app.css .card, app.css .list-item, theme.css --card-background

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build
```

Screenshot checklist: `/config` — every `Card` ("Setup Guide", "Registered Devices", "AI Providers", "Danger Zone") should now render the same dark gradient + subtle 1px hairline + soft drop shadow as a session card on `/project`, with **no** stray bright/white border. `/` (Dashboard) — `DashboardCard` (`class="card"`, `src/lib/modules/client/dashboard/DashboardCard.svelte:88`) should pick up the new box-shadow (its own scoped `<style>` block sets `background`/`border`/`border-left` but never sets `box-shadow`, so the central shadow shows through even though the scoped rule wins on background/border — see Open Issues). `/project` and `/` session cards should look visually identical in depth to the newly-updated `.card`/`Card` surfaces.

- [ ] **Step 4: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/app.css src/lib/theme.css
git commit -m "feat(theme): unify card elevation across app.css and the library Card"
```

---

### Task 13: Hide the desktop scrollbar chrome on touch devices

**Files:**

- Modify: `src/app.css:663-680`

**Interfaces:**

- Consumes: none
- Produces: none

- [ ] **Step 1: Zero out the WebKit scrollbar under touch**

Current (`src/app.css:663-680`):

```css
/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--ds-gray-400);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ds-gray-500);
}
```

New:

```css
/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--ds-gray-400);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ds-gray-500);
}

/* Touch devices: no persistent desktop-style scrollbar track/thumb */
@media (hover: none) {
  ::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "hover: none" /Users/sachinsharma/Developer/Personal/shooter/src/app.css
# Expected: this rule plus the .session-card/.terminal-card/.tab-item press-feedback rule from the earlier task — 2 matches total once both tasks have landed

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build
```

Screenshot checklist: with Chrome DevTools' device toolbar (touch emulation on) or a real phone, scroll a long list — `/terminals` (many cards) and `/session/[id]` chat view — confirm no visible scrollbar track/thumb. Then check a normal desktop Chrome window (mouse, `hover: hover`) on the same screens — the 8px gray scrollbar must still render exactly as before (no regression for desktop users).

- [ ] **Step 3: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/app.css
git commit -m "fix(scroll): hide desktop scrollbar chrome on touch devices"
```

---

### Task 14: Replace glyph back-arrows with the Icon component

**Files:**

- Create: `src/lib/assets/icons/arrow-left.svg`
- Modify: `src/app.css:848-858` (remove dead `.session-chevron`)
- Modify: `src/app.css:868-891` (remove dead `.session-back-btn`)
- Modify: `src/routes/session/[id]/+page.svelte:11-16,573-575,580-581`
- Modify: `src/routes/project/+page.svelte:6-8,245-249,257`
- Modify: `src/routes/config/+page.svelte:9-12,421`
- Modify: `src/routes/terminals/[id]/+page.svelte:16-17,791-794`

**Interfaces:**

- Consumes: `Icon` from `@juspay/svelte-ui-components` (already imported in `project/+page.svelte`, `config/+page.svelte`, `terminals/[id]/+page.svelte`; newly imported in `session/[id]/+page.svelte`), `.icon-14` class (`src/lib/theme.css:569-574`)
- Produces: none

`grep -rn "session-chevron\|session-back-btn"` across `src/routes` and `src/lib` returns **zero** matches — these two CSS classes are dead leftovers from a pre-library-migration UI (confirmed via `git log -p --follow -- src/app.css`, introduced in commit `dc719e7 feat: migrate UI to @juspay/svelte-ui-components` and never referenced by any template since). The live glyph tells today are the six `← Back` / `&#8592;` / `&larr;` literal-arrow instances inside `.back-link` across 4 route files — those are what this task actually swaps for the `Icon` component; the dead CSS is removed as part of the same "no stray glyph-arrow CSS" cleanup.

- [ ] **Step 1: Add the shared arrow-left icon asset**

Create `src/lib/assets/icons/arrow-left.svg` (matches the existing Feather-style stroke icons, e.g. `src/lib/assets/icons/refresh.svg`):

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="19" y1="12" x2="5" y2="12"/>
  <polyline points="12 19 5 12 12 5"/>
</svg>
```

- [ ] **Step 2: Remove the dead `.session-chevron` and `.session-back-btn` CSS**

Current (`src/app.css:848-858`):

```css
.session-duration {
  font-size: 0.75rem;
  color: var(--text-tertiary, #737373);
}

.session-chevron {
  color: var(--text-tertiary, #737373);
  font-size: 1.2rem;
  align-self: center;
}

/* ============================================
   Session Detail Page
   ============================================ */
```

New:

```css
.session-duration {
  font-size: 0.75rem;
  color: var(--text-tertiary, #737373);
}

/* ============================================
   Session Detail Page
   ============================================ */
```

Current (`src/app.css:869-892`):

```css

.session-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  background: var(--bg-secondary, #141414);
  border: 1px solid var(--border, #2a2a2a);
  color: var(--text-secondary, #a3a3a3);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
  text-decoration: none;
  font-size: 1.1rem;
}

.session-back-btn:hover {
  background: var(--bg-tertiary, #1a1a1a);
  color: var(--text-primary, #fafafa);
  border-color: var(--gray-600, #525252);
}

.session-info-bar {
```

New:

```css

.session-info-bar {
```

- [ ] **Step 3: `src/routes/session/[id]/+page.svelte` — add imports, swap both back-links**

Current (lines 11-16):

```svelte
import {browser} from '$app/environment'; import {page} from '$app/state'; import {(getCached,
setCache,
sourceToCommand)} from '$lib/modules/client/common'; import ChatView from '$lib/modules/client/terminal/ChatView.svelte';
import {Button} from '@juspay/svelte-ui-components'; import {onMount} from 'svelte';
```

New:

```svelte
import {browser} from '$app/environment'; import {page} from '$app/state'; import ArrowLeftSvg from '$lib/assets/icons/arrow-left.svg?raw';
import {(getCached, setCache, sourceToCommand)} from '$lib/modules/client/common'; import ChatView from
'$lib/modules/client/terminal/ChatView.svelte'; import {(Button, Icon)} from '@juspay/svelte-ui-components';
import {onMount} from 'svelte';
```

Current (lines 573-575):

```svelte
<div class="session-back-row">
  <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">← Back</a>
</div>
```

New:

```svelte
<div class="session-back-row">
  <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">
    <Icon svg={ArrowLeftSvg} classes="icon-14" />
    Back
  </a>
</div>
```

Current (lines 580-581):

```svelte
      <div class="session-header-row">
        <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">← Back</a>
```

New:

```svelte
      <div class="session-header-row">
        <a href={projectId ? `/project?id=${projectId}` : '/'} class="back-link">
          <Icon svg={ArrowLeftSvg} classes="icon-14" />
          Back
        </a>
```

- [ ] **Step 4: `src/routes/project/+page.svelte` — add import, swap both back-links**

Current (lines 6-8):

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import BellSvg from
'$lib/assets/icons/bell.svg?raw'; import RefreshSvg from '$lib/assets/icons/refresh.svg?raw';
```

New:

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import ArrowLeftSvg from
'$lib/assets/icons/arrow-left.svg?raw'; import BellSvg from '$lib/assets/icons/bell.svg?raw'; import
RefreshSvg from '$lib/assets/icons/refresh.svg?raw';
```

(`Icon` is already imported at `src/routes/project/+page.svelte:18` — `import { Banner, Button, EmptyState, Icon, Pill, Shimmer } from '@juspay/svelte-ui-components';`.)

Current (lines 245-249):

```svelte
<div class="project-back-row">
  <a href="/" class="back-link">
    <span class="back-arrow">&larr;</span>
    Back to Projects
  </a>
</div>
```

New:

```svelte
<div class="project-back-row">
  <a href="/" class="back-link">
    <Icon svg={ArrowLeftSvg} classes="icon-14" />
    Back to Projects
  </a>
</div>
```

Current (line 257):

```svelte
<a href="/" class="back-link">&#8592; Back to Projects</a>
```

New:

```svelte
<a href="/" class="back-link">
  <Icon svg={ArrowLeftSvg} classes="icon-14" />
  Back to Projects
</a>
```

- [ ] **Step 5: `src/routes/config/+page.svelte` — add import, swap the back-link**

Current (lines 9-12):

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import CheckCircleSvg from
'$lib/assets/icons/check-circle.svg?raw'; import PlaySvg from '$lib/assets/icons/play.svg?raw';
import XCircleSvg from '$lib/assets/icons/x-circle.svg?raw';
```

New:

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import ArrowLeftSvg from
'$lib/assets/icons/arrow-left.svg?raw'; import CheckCircleSvg from
'$lib/assets/icons/check-circle.svg?raw'; import PlaySvg from '$lib/assets/icons/play.svg?raw';
import XCircleSvg from '$lib/assets/icons/x-circle.svg?raw';
```

(`Icon` is already imported at `src/routes/config/+page.svelte:16` — `import { Banner, Button, Card, Icon, Input, Stepper } from '@juspay/svelte-ui-components';`.)

Current (line 421):

```svelte
<a href="/" class="back-link">← Back to Projects</a>
```

New:

```svelte
<a href="/" class="back-link">
  <Icon svg={ArrowLeftSvg} classes="icon-14" />
  Back to Projects
</a>
```

- [ ] **Step 6: `src/routes/terminals/[id]/+page.svelte` — add import, swap the back-link**

Current (lines 16-17):

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import {AI_COMMANDS} from '$lib/modules/client/common';
```

New:

```svelte
import AlertTriangleSvg from '$lib/assets/icons/alert-triangle.svg?raw'; import ArrowLeftSvg from
'$lib/assets/icons/arrow-left.svg?raw'; import {AI_COMMANDS} from '$lib/modules/client/common';
```

(`Icon` is already imported at `src/routes/terminals/[id]/+page.svelte:29` inside the multi-line `@juspay/svelte-ui-components` import.)

Current (lines 791-794):

```svelte
<a href="/terminals" class="back-link">
  <span class="back-arrow">&larr;</span>
  Terminals
</a>
```

New:

```svelte
<a href="/terminals" class="back-link">
  <Icon svg={ArrowLeftSvg} classes="icon-14" />
  Terminals
</a>
```

- [ ] **Step 7: Verify**

```bash
grep -rn "session-chevron\|session-back-btn" /Users/sachinsharma/Developer/Personal/shooter/src
# Expected: no matches

grep -rln "back-arrow\|&larr;\|&#8592;\|← Back" /Users/sachinsharma/Developer/Personal/shooter/src/routes
# Expected: no matches — every glyph arrow has been swapped for <Icon>

cd /Users/sachinsharma/Developer/Personal/shooter
pnpm lint:fix
# Expected: exits 0; perfectionist auto-fixes any residual import-order nits from the manual edits above

pnpm build
# Expected: clean build
```

Screenshot checklist: `/session/[id]` (error state and normal header), `/project` (not-found state and normal header), `/config` (top-of-page back link), `/terminals/[id]` (error state) — every back-link now shows a stroke-based left-arrow icon at the same visual weight/size as the nav-bar icons (`icon-26` on the bottom tabs vs. `icon-14` inline here — both are the same Feather-style stroke, just scaled), not a serif/default-font `←` glyph.

- [ ] **Step 8: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/lib/assets/icons/arrow-left.svg src/app.css src/routes/session/\[id\]/+page.svelte src/routes/project/+page.svelte src/routes/config/+page.svelte src/routes/terminals/\[id\]/+page.svelte
git commit -m "refactor(nav): replace glyph back-arrows with the Icon component"
```

---

### Task 15: Bolder base type scale and radii (central tokens, mirrored into theme.css)

**Files:**

- Modify: `src/app.css:73,109-110,247` (`:root` tokens + `.page-title`)
- Modify: `src/lib/theme.css:19,30,139` (button/input/select radius mirror)

**Interfaces:**

- Consumes: none
- Produces: `--text-base` (16px), `--radius-lg` (14px), `--radius-xl` (18px) — consumed transitively by every existing `var(--text-base)`/`var(--radius-lg)`/`var(--radius-xl)` reference across `app.css` and `theme.css` (e.g. `--choicebox-border-radius`, `--toast-border-radius`, `--modal-border-radius`, `--card-border-radius` all already reference `var(--radius-lg)`/`var(--radius-xl)` and pick up the bump with no further edits)

- [ ] **Step 1: Bump the base type size and large radii in `:root`**

Current (`src/app.css:70-78`):

```css
/* Font Sizes - Geist Typography Scale */
--text-xs: 12px;
--text-sm: 13px;
--text-base: 14px;
--text-md: 15px;
--text-lg: 16px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 32px;
```

New:

```css
/* Font Sizes - Geist Typography Scale */
--text-xs: 12px;
--text-sm: 13px;
--text-base: 16px;
--text-md: 15px;
--text-lg: 16px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 32px;
```

Current (`src/app.css:106-111`):

```css
/* Border Radius */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-full: 9999px;
```

New:

```css
/* Border Radius */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-full: 9999px;
```

- [ ] **Step 2: Soften the page-title tracking to match the bolder scale**

Current (`src/app.css:244-251`):

```css
.page-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tighter);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-2);
}
```

New:

```css
.page-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-2);
}
```

- [ ] **Step 3: Mirror the radius bump into the library's button/input/select vars**

These three currently pin to `--radius-md` (6px, unchanged by this bump) instead of `--radius-lg`, so they'd otherwise be left behind by the "bolder" system:

Current (`src/lib/theme.css:19`):

```css
--button-border-radius: var(--radius-md);
```

New:

```css
--button-border-radius: var(--radius-lg);
```

Current (`src/lib/theme.css:30`):

```css
--input-radius: var(--radius-md);
```

New:

```css
--input-radius: var(--radius-lg);
```

Current (`src/lib/theme.css:139`):

```css
--select-radius: var(--radius-md);
```

New:

```css
--select-radius: var(--radius-lg);
```

No change needed for `--choicebox-border-radius` (`theme.css:184`, already `var(--radius-lg)`), `--toast-border-radius` (`theme.css:204`, already `var(--radius-lg)`), `--modal-border-radius` (`theme.css:220`, already `var(--radius-xl)`), `--card-border-radius` (added by the elevation task, already `var(--radius-lg)`), or `--pill-border-radius`/`--badge-border-radius` (already `var(--radius-full)`, maximally rounded) — they all cascade automatically from the `:root` bump.

- [ ] **Step 4: Verify**

```bash
grep -n "text-base: 14px\|radius-lg: 8px\|radius-xl: 12px" /Users/sachinsharma/Developer/Personal/shooter/src/app.css
# Expected: no matches (old values gone)

grep -n "text-base: 16px\|radius-lg: 14px\|radius-xl: 18px" /Users/sachinsharma/Developer/Personal/shooter/src/app.css
# Expected: 3 matches — the new values

grep -n "button-border-radius: var(--radius-lg)\|input-radius: var(--radius-lg)\|select-radius: var(--radius-lg)" /Users/sachinsharma/Developer/Personal/shooter/src/lib/theme.css
# Expected: 3 matches

cd /Users/sachinsharma/Developer/Personal/shooter && pnpm build
# Expected: clean build
```

Screenshot checklist (16px-base overflow check — per Constraint 3/5, screenshot **every** screen, but pay closest attention to the three places that read `var(--text-base)` directly): `/config` (the `session-info`-style dense rows, all `Input` fields, and the "Registered Devices" list — confirm no wrapped/clipped labels), `/terminals/[id]` topbar (`font-size: var(--text-base)` at `src/routes/terminals/[id]/+page.svelte:1035`) and `/session/[id]` header (`src/routes/session/[id]/+page.svelte:651`) — confirm the title/subtitle row doesn't overflow or force a second line unexpectedly, `/terminals` list (`src/routes/terminals/+page.svelte:459`). `QuickKeys` (`src/lib/modules/client/terminal/QuickKeys.svelte:57`) explicitly overrides `--button-font-size: var(--text-xs)` so it is **not** expected to change size — confirm it indeed looks untouched. Also confirm every button/input/select corner now reads visibly rounder (14px) across `/`, `/project`, `/config`, and that `Choicebox` options on `/config`'s AI-provider picker don't clip their selected-state ring at the new radius. If any specific row clips, tune that row's own CSS centrally (do not revert the global token).

- [ ] **Step 5: Commit**

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
git add src/app.css src/lib/theme.css
git commit -m "feat(theme): bolder 16px base type and larger radii, mirrored into the library"
```

## Unit C — Motion primitives (list FLIP + view-transition route hook)

### Task 16: Shared reduced-motion primitive (`prefersReducedMotion` / `resolveMotionDuration`)

**Files:**

- Create: `src/lib/modules/client/common/motion.ts`
- Test: `tests/motion.test.cjs`
- Modify: `src/lib/modules/client/common/index.ts:1-10`
- Modify: `package.json:79`

**Interfaces:**

- Consumes: none
- Produces: `prefersReducedMotion(): boolean` and `resolveMotionDuration(baseMs: number, reducedMotion: boolean): number`, both exported from `$lib/modules/client/common` — consumed by the "DashboardView FLIP" and "onNavigate view-transition hook" tasks below.

- [ ] **Step 1: Write the failing test first**

Create `tests/motion.test.cjs` (mirrors the existing `tests/decide-injection.test.cjs` pattern: `tsx/cjs` register + a hand-rolled `runTest`/`assertEqual` runner, no framework):

```js
'use strict';

require('tsx/cjs');

const path = require('path');
const mod = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'common', 'motion.ts')
);
const { prefersReducedMotion, resolveMotionDuration } = mod;

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

runTest('resolveMotionDuration returns 0 when reduced motion is requested', () => {
  assertEqual(resolveMotionDuration(220, true), 0, 'reduced');
});

runTest('resolveMotionDuration returns the base duration when motion is allowed', () => {
  assertEqual(resolveMotionDuration(220, false), 220, 'allowed');
});

runTest('resolveMotionDuration passes through a zero base unchanged', () => {
  assertEqual(resolveMotionDuration(0, false), 0, 'zero base');
});

runTest('prefersReducedMotion returns false when window is unavailable (SSR/Node)', () => {
  assertEqual(typeof window, 'undefined', 'no window in this test process');
  assertEqual(prefersReducedMotion(), false, 'ssr fallback');
});

runTest('prefersReducedMotion reflects matchMedia(prefers-reduced-motion: reduce).matches', () => {
  global.window = {
    matchMedia: (query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }),
  };
  try {
    assertEqual(prefersReducedMotion(), true, 'matches true');
  } finally {
    delete global.window;
  }
});

runTest('prefersReducedMotion returns false when the media query does not match', () => {
  global.window = {
    matchMedia: () => ({ matches: false }),
  };
  try {
    assertEqual(prefersReducedMotion(), false, 'matches false');
  } finally {
    delete global.window;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

Run it against the not-yet-created module:

```bash
node tests/motion.test.cjs
```

Expected output (FAIL — module doesn't exist yet):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sachinsharma/Developer/Personal/shooter/src/lib/modules/client/common/motion.ts'
```

(process exits non-zero before any `PASS`/`FAIL` lines print, since the `require()` at the top of the file throws.)

- [ ] **Step 2: Implement the minimal primitive**

Create `src/lib/modules/client/common/motion.ts`:

```ts
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
```

- [ ] **Step 3: Re-run the test — expect PASS**

```bash
node tests/motion.test.cjs
```

Expected output:

```
  PASS  resolveMotionDuration returns 0 when reduced motion is requested
  PASS  resolveMotionDuration returns the base duration when motion is allowed
  PASS  resolveMotionDuration passes through a zero base unchanged
  PASS  prefersReducedMotion returns false when window is unavailable (SSR/Node)
  PASS  prefersReducedMotion reflects matchMedia(prefers-reduced-motion: reduce).matches
  PASS  prefersReducedMotion returns false when the media query does not match

6 passed, 0 failed
```

Exit code `0`.

- [ ] **Step 4: Export from the client/common barrel**

Current `src/lib/modules/client/common/index.ts`:

```ts
// Shared client utilities
export { clearCache, getCached, setCache } from './cache';
export { getApiKey, isShooterConfig } from './config-guard';
export { toErrorMessage } from './error';
export { renderMarkdown } from './markdown';
export { hasScanner, isNativeBridge, scanQR } from './native-bridge';
export { startPresenceReporting } from './presence';
export { AI_COMMANDS, sourceLabel, sourceToCommand } from './provider';
export { formatRelativeTime } from './time';
export { getToolDescription } from './tool-title';
```

Replace with:

```ts
// Shared client utilities
export { clearCache, getCached, setCache } from './cache';
export { getApiKey, isShooterConfig } from './config-guard';
export { toErrorMessage } from './error';
export { renderMarkdown } from './markdown';
export { prefersReducedMotion, resolveMotionDuration } from './motion';
export { hasScanner, isNativeBridge, scanQR } from './native-bridge';
export { startPresenceReporting } from './presence';
export { AI_COMMANDS, sourceLabel, sourceToCommand } from './provider';
export { formatRelativeTime } from './time';
export { getToolDescription } from './tool-title';
```

- [ ] **Step 5: Wire the new test into the `pnpm test` chain**

Current `package.json:79` (single line, truncated here — full line ends `... && node tests/summary-store.test.cjs"`):

```json
    "test": "node tests/terminal-store.test.cjs && node tests/pending-requests.test.cjs && node tests/tunnel-discovery.test.cjs && node tests/service-manager.test.cjs && node tests/plan-mode-routing.test.cjs && node tests/dynamic-options-extraction.test.cjs && node tests/next-step-consensus.test.cjs && node tests/summaries-route.test.cjs && node tests/litellm-client.test.cjs && node tests/decide-injection.test.cjs && node tests/presence-store.test.cjs && node tests/autopilot-context.test.cjs && node tests/apns-payload.test.cjs && node tests/agent-launch.test.cjs && node tests/codex-parser.test.cjs && node tests/provider-readers.test.cjs && node tests/generic-watcher.test.cjs && node tests/sos-coordinator.test.cjs && node tests/sos-policy.test.cjs && node tests/pty-input.test.cjs && node tests/share-store.test.cjs && node tests/seq-ring.test.cjs && node tests/terminal-emulator.test.cjs && node tests/resize-authority.test.cjs && node tests/device-token-resolution.test.cjs && node tests/pty-holder-integration.cjs && node tests/device-token-store.test.cjs && node tests/device-format.test.cjs && node tests/classify-apns-reason.test.cjs && node tests/fcm-classify.test.cjs && node tests/notify-fanout.test.cjs && node tests/device-registry-prune.test.cjs && node tests/summary-store.test.cjs",
```

Replace the trailing segment `&& node tests/summary-store.test.cjs"` with `&& node tests/summary-store.test.cjs && node tests/motion.test.cjs"` (append the new test at the end of the chain, everything else unchanged):

```json
    "test": "node tests/terminal-store.test.cjs && node tests/pending-requests.test.cjs && node tests/tunnel-discovery.test.cjs && node tests/service-manager.test.cjs && node tests/plan-mode-routing.test.cjs && node tests/dynamic-options-extraction.test.cjs && node tests/next-step-consensus.test.cjs && node tests/summaries-route.test.cjs && node tests/litellm-client.test.cjs && node tests/decide-injection.test.cjs && node tests/presence-store.test.cjs && node tests/autopilot-context.test.cjs && node tests/apns-payload.test.cjs && node tests/agent-launch.test.cjs && node tests/codex-parser.test.cjs && node tests/provider-readers.test.cjs && node tests/generic-watcher.test.cjs && node tests/sos-coordinator.test.cjs && node tests/sos-policy.test.cjs && node tests/pty-input.test.cjs && node tests/share-store.test.cjs && node tests/seq-ring.test.cjs && node tests/terminal-emulator.test.cjs && node tests/resize-authority.test.cjs && node tests/device-token-resolution.test.cjs && node tests/pty-holder-integration.cjs && node tests/device-token-store.test.cjs && node tests/device-format.test.cjs && node tests/classify-apns-reason.test.cjs && node tests/fcm-classify.test.cjs && node tests/notify-fanout.test.cjs && node tests/device-registry-prune.test.cjs && node tests/summary-store.test.cjs && node tests/motion.test.cjs",
```

- [ ] **Step 6: Type-check**

```bash
pnpm check
```

Expected: exits 0, no errors referencing `motion.ts` or `common/index.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/client/common/motion.ts src/lib/modules/client/common/index.ts tests/motion.test.cjs package.json
git commit -m "feat(motion): add reduced-motion-aware duration primitive"
```

---

### Task 17: FLIP-animate DashboardView's keyed card lists

**Files:**

- Modify: `src/lib/modules/client/dashboard/DashboardView.svelte:1-48`

**Interfaces:**

- Consumes: `prefersReducedMotion(): boolean`, `resolveMotionDuration(baseMs: number, reducedMotion: boolean): number` from `$lib/modules/client/common` (previous task)
- Produces: none (leaf visual behavior)

- [ ] **Step 1: Add the flip import + reduced-motion-guarded duration**

Current `src/lib/modules/client/dashboard/DashboardView.svelte:1-20`:

```svelte
<script lang="ts">
  import type { DashboardCard } from '$lib/types';

  import DashboardCardComponent from './DashboardCard.svelte';

  const {
    cards,
    onCardClick,
  }: {
    cards: DashboardCard[];
    onCardClick?: (card: DashboardCard) => void;
  } = $props();

  const runningCards = $derived(cards.filter((c) => c.status === 'running'));
  const otherCards = $derived(cards.filter((c) => c.status !== 'running'));

  function handleClick(card: DashboardCard): void {
    onCardClick?.(card);
  }
</script>
```

Replace with:

```svelte
<script lang="ts">
  import type { DashboardCard } from '$lib/types';

  import { prefersReducedMotion, resolveMotionDuration } from '$lib/modules/client/common';
  import { flip } from 'svelte/animate';

  import DashboardCardComponent from './DashboardCard.svelte';

  const {
    cards,
    onCardClick,
  }: {
    cards: DashboardCard[];
    onCardClick?: (card: DashboardCard) => void;
  } = $props();

  const runningCards = $derived(cards.filter((c) => c.status === 'running'));
  const otherCards = $derived(cards.filter((c) => c.status !== 'running'));

  // Computed once — a fixed FLIP duration, not a live media-query subscription.
  // Keeps card-reorder animation and the OS reduced-motion setting in lockstep.
  const flipDuration = resolveMotionDuration(220, prefersReducedMotion());

  function handleClick(card: DashboardCard): void {
    onCardClick?.(card);
  }
</script>
```

- [ ] **Step 2: Wrap each keyed card in a real element carrying `animate:flip`**

`animate:` can only target a regular DOM element that is the direct child of a keyed `{#each}` block — not a component tag — so each `<DashboardCardComponent>` needs a thin wrapper `<div>`.

Current `src/lib/modules/client/dashboard/DashboardView.svelte:22-34` (the "Active" section):

```svelte
{#if runningCards.length > 0}
  <div class="section">
    <h3 class="section-label">Active</h3>
    {#each runningCards as card (card.terminalId)}
      <DashboardCardComponent
        {card}
        onclick={(): void => {
          handleClick(card);
        }}
      />
    {/each}
  </div>
{/if}
```

Replace with:

```svelte
{#if runningCards.length > 0}
  <div class="section">
    <h3 class="section-label">Active</h3>
    {#each runningCards as card (card.terminalId)}
      <div class="card-flip" animate:flip={{ duration: flipDuration }}>
        <DashboardCardComponent
          {card}
          onclick={(): void => {
            handleClick(card);
          }}
        />
      </div>
    {/each}
  </div>
{/if}
```

Current `src/lib/modules/client/dashboard/DashboardView.svelte:36-48` (the "Recent" section):

```svelte
{#if otherCards.length > 0}
  <div class="section">
    <h3 class="section-label">Recent</h3>
    {#each otherCards as card (card.terminalId)}
      <DashboardCardComponent
        {card}
        onclick={(): void => {
          handleClick(card);
        }}
      />
    {/each}
  </div>
{/if}
```

Replace with:

```svelte
{#if otherCards.length > 0}
  <div class="section">
    <h3 class="section-label">Recent</h3>
    {#each otherCards as card (card.terminalId)}
      <div class="card-flip" animate:flip={{ duration: flipDuration }}>
        <DashboardCardComponent
          {card}
          onclick={(): void => {
            handleClick(card);
          }}
        />
      </div>
    {/each}
  </div>
{/if}
```

No new CSS is needed for `.card-flip` — a bare `<div>` is `display: block` by default, which is layout-identical to the `<DashboardCardComponent>` it replaces as the direct flex child of `.section`, so the FLIP wrapper introduces no visual shift.

- [ ] **Step 3: Verify — grep guard**

```bash
grep -c "animate:flip" src/lib/modules/client/dashboard/DashboardView.svelte
```

Expected output: `2` (one per `{#each}` block).

```bash
grep -c "svelte/animate" src/lib/modules/client/dashboard/DashboardView.svelte
```

Expected output: `1`.

- [ ] **Step 4: Verify — build + type-check**

```bash
pnpm build
```

Expected: build succeeds, no Svelte compiler errors (in particular no "AnimateDirective can only be used on elements" error, since `animate:flip` sits on the wrapper `<div>`, not on `<DashboardCardComponent>`).

```bash
pnpm check
```

Expected: exits 0.

- [ ] **Step 5: Screenshot/video verification checklist**

Run the app (`pnpm dev` or via the `run` skill) and open `/` (Dashboard):

1. With ≥2 terminals running: trigger a reorder that changes `cards` order (e.g. a card transitions `running` → `other`, or a new active session bumps another card down). Confirm the remaining cards **glide/slide** into their new position over ~220ms rather than snapping instantly.
2. Take a screenshot mid-transition (or a short screen recording) showing a card visibly mid-translate, not just before/after stills.
3. Enable OS-level "Reduce Motion" (macOS: System Settings → Accessibility → Display → Reduce Motion; or emulate via `mcp__plugin_chrome-devtools-mcp_chrome-devtools__emulate` with `reducedMotion: 'reduce'` if testing in Chrome DevTools), repeat the same reorder trigger, and confirm cards **snap instantly** with no glide (duration resolves to `0`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/client/dashboard/DashboardView.svelte
git commit -m "feat(dashboard): FLIP-animate card reordering, reduced-motion-guarded"
```

---

### Task 18: `onNavigate` view-transition hook for route changes

**Files:**

- Modify: `src/routes/+layout.svelte:1-15,63-89`
- Modify: `src/app.css:647-662`

**Interfaces:**

- Consumes: `prefersReducedMotion(): boolean` from `$lib/modules/client/common` (first task); `onNavigate` from `$app/navigation` (SvelteKit, confirmed present at `node_modules/@sveltejs/kit/types/index.d.ts:3159`); `document.startViewTransition` (typed in this repo's TS DOM lib at `node_modules/typescript/lib/lib.dom.d.ts:10378`, unconditional — feature-detected at runtime via `typeof`, not via a TS optional-chain).
- Produces: none (leaf navigation behavior)

- [ ] **Step 1: Import `onNavigate` and the reduced-motion primitive**

Current `src/routes/+layout.svelte:1-15`:

```svelte
<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import { Button, Icon, Pill } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';
```

Replace with:

```svelte
<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import { prefersReducedMotion } from '$lib/modules/client/common';
  import { Button, Icon, Pill } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';
```

- [ ] **Step 2: Add the `onNavigate` hook, guarded by reduced-motion + feature detection**

Current `src/routes/+layout.svelte:63-89`:

```svelte
  onMount(() => {
    void checkSystemStatus();
    const interval = setInterval(() => {
      void checkSystemStatus();
    }, 30000);
    return (): void => {
      clearInterval(interval);
    };
  });

  async function checkSystemStatus(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        systemStatus = 'error';
        return;
      }
      const data = (await response.json()) as { status?: string };
      systemStatus =
        data.status === 'healthy' || data.status === 'degraded' || data.status === 'error'
          ? data.status
          : 'unknown';
    } catch {
      systemStatus = 'error';
    }
  }
</script>
```

Replace with:

```svelte
  onMount(() => {
    void checkSystemStatus();
    const interval = setInterval(() => {
      void checkSystemStatus();
    }, 30000);
    return (): void => {
      clearInterval(interval);
    };
  });

  // Progressive enhancement: cross-fade/slide between routes via the View
  // Transitions API when the browser supports it and the user has not asked
  // for reduced motion. Falls through to SvelteKit's normal instant swap
  // everywhere else (Safari < 18, Firefox, reduced-motion).
  onNavigate((navigation) => {
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      return;
    }

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  async function checkSystemStatus(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        systemStatus = 'error';
        return;
      }
      const data = (await response.json()) as { status?: string };
      systemStatus =
        data.status === 'healthy' || data.status === 'degraded' || data.status === 'error'
          ? data.status
          : 'unknown';
    } catch {
      systemStatus = 'error';
    }
  }
</script>
```

- [ ] **Step 3: Add the central `::view-transition` slide/cross-fade, gated by `prefers-reduced-motion: no-preference`**

Current `src/app.css:647-662`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Selection */
::selection {
  background: var(--ds-blue-700);
  color: #fff;
}
```

Replace with:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Page transitions (View Transitions API) — see +layout.svelte's onNavigate
   hook. Browsers without support (or with reduced motion requested) fall
   through to SvelteKit's normal instant route swap. */
@keyframes shooter-view-fade-out {
  to {
    opacity: 0;
  }
}

@keyframes shooter-view-slide-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root) {
    animation: shooter-view-fade-out 150ms ease both;
  }

  ::view-transition-new(root) {
    animation: shooter-view-slide-in 220ms ease both;
  }
}

/* Selection */
::selection {
  background: var(--ds-blue-700);
  color: #fff;
}
```

- [ ] **Step 4: Verify — grep guard**

```bash
grep -c "startViewTransition" src/routes/+layout.svelte
```

Expected output: `2` (the `typeof` feature-detect check + the `document.startViewTransition(` call).

```bash
grep -c "::view-transition-" src/app.css
```

Expected output: `2` (`::view-transition-old(root)` + `::view-transition-new(root)`).

```bash
grep -n "prefers-reduced-motion: no-preference" src/app.css
```

Expected output: one match, the `@media` line wrapping the two `::view-transition-*` rules.

- [ ] **Step 5: Verify — build + type-check**

```bash
pnpm build
```

Expected: build succeeds (Vite/esbuild accept `::view-transition-old`/`::view-transition-new` as plain unrecognized-but-valid CSS pseudo-elements; no PostCSS/lint failure).

```bash
pnpm check
```

Expected: exits 0 — `document.startViewTransition` type-checks against `lib.dom.d.ts`, `navigation.complete` is `Promise<void>` per `@sveltejs/kit`'s `Navigation` type, and the callback's return type (`Promise<void> | undefined`) satisfies `onNavigate`'s `MaybePromise<(() => void) | void>` signature.

- [ ] **Step 6: Screenshot/video verification checklist**

Run the app in a browser that supports the View Transitions API (Chrome/Edge; use `mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page` + `take_screenshot`, or a manual screen recording):

1. From `/` (Dashboard), tap the Terminals tab. Confirm the outgoing view cross-fades out (~150ms) while the incoming view slides up + fades in (~220ms) — record a short clip since a still screenshot can't show the transition itself.
2. Repeat between `/terminals` → `/activity` → `/config` to confirm the transition fires on every bottom-tab navigation, not just one route pair.
3. In DevTools, confirm no console errors during navigation (a rejected `navigation.complete` on a cancelled nav should not throw unhandled — check the console tab is clean after a few rapid taps).
4. Emulate `prefers-reduced-motion: reduce` (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__emulate` with `reducedMotion: 'reduce'`, or macOS Reduce Motion), repeat the same navigations, and confirm routes swap **instantly** with no slide/cross-fade (the `onNavigate` hook returns early via `prefersReducedMotion()`, and even if it didn't, the `::view-transition-*` rules are inert outside `no-preference`).
5. In a browser without View Transitions support (Firefox, or Safari < 18), confirm navigation still works normally (instant swap, no error) — the `typeof document.startViewTransition !== 'function'` guard falls through cleanly.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+layout.svelte src/app.css
git commit -m "feat(nav): cross-fade/slide route transitions via View Transitions API"
```

## Unit D — Haptics full vertical (web + iOS + Android)

### Task 19: HapticKind type — central types module + barrel

**Files:**

- Create: `src/lib/types/haptics.ts`
- Modify: `src/lib/types/index.ts:13-14`

**Interfaces:**

- Consumes: none
- Produces: `HapticKind` union type, imported everywhere via `import type { HapticKind } from '$lib/types'`

- [ ] **Step 1: Create the hand-written union type**

`src/lib/types/haptics.ts` does not exist yet. Create it:

```ts
// Haptic feedback kinds for the web haptic() bridge. A string-literal union —
// not expressible in the type-crafter YAML schema — mirrored by iOS
// (UIImpactFeedbackGenerator/UINotificationFeedbackGenerator/UISelectionFeedbackGenerator)
// and Android (VibrationEffect) native implementations.
export type HapticKind =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';
```

- [ ] **Step 2: Re-export from the barrel**

Current `src/lib/types/index.ts:13-15`:

```ts
export type * from './gemini';
export * from './generated';
export type * from './neurolink';
```

Replace with:

```ts
export type * from './gemini';
export * from './generated';
export type * from './haptics';
export type * from './neurolink';
```

- [ ] **Step 3: Verify — grep guard + typecheck the new module in isolation**

```bash
grep -n "haptics" src/lib/types/index.ts
```

Expected output:

```
15:export type * from './haptics';
```

```bash
node -e "require('tsx/cjs'); const m = require('./src/lib/types/haptics.ts'); console.log('module loads, no runtime export (type-only):', Object.keys(m));"
```

Expected output (type-only module, erased at runtime — this just proves the file parses/loads cleanly through the project's TS toolchain):

```
module loads, no runtime export (type-only): []
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/haptics.ts src/lib/types/index.ts
git commit -m "feat(types): add HapticKind union for native/web haptic bridge"
```

---

### Task 20: haptic() web API — TDD (native-bridge.ts)

**Files:**

- Modify: `src/app.d.ts:1-29`
- Modify: `src/lib/modules/client/common/native-bridge.ts:1-59`
- Create: `tests/native-bridge.test.cjs`
- Modify: `package.json:79`

**Interfaces:**

- Consumes: `HapticKind` from `$lib/types` (Task 19); `window.ShooterBridge`/`window.ShooterNativeBridge` ambient globals from `src/app.d.ts`
- Produces: `export function haptic(kind: HapticKind = 'light'): void` from `native-bridge.ts`, consumed by Task 21 (`+layout.svelte`, `QuickKeys.svelte`)

- [ ] **Step 1: Extend the ambient bridge type to declare `haptic`**

Current `src/app.d.ts` (full file, 29 lines):

```ts
// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  interface ShooterBridge {
    getApnsToken?: () => string;
    getConfig?: () => string;
    getDeviceId?: () => string;
    getDeviceName?: () => string;
    getEnvironment?: () => string;
    getFcmToken?: () => string;
    getPlatform?: () => string;
    saveConfig?: (config: string) => void;
    scanner?: ShooterBridgeScanner;
  }

  interface ShooterBridgeScanner {
    scan: () => Promise<string>;
  }

  // Window must use interface — TypeScript requires it for declaration merging
  interface Window {
    handleNativeResponse?: (callbackId: string, response: string) => void;
    ShooterBridge?: ShooterBridge;
    ShooterNativeBridge?: ShooterBridge;
  }
}

export {};
```

Edit: add `haptic?: (kind: string) => void;` to the `ShooterBridge` interface (both `window.ShooterBridge` (iOS) and `window.ShooterNativeBridge` (Android) type-alias to this same interface, so one field covers both platforms). `string` (not `HapticKind`) matches this file's existing convention — every other bridge field is a bare primitive; `app.d.ts` is exempt from the project's "types live in `src/lib/types/`" ESLint rule (`eslint.config.js` `ignores: ['src/lib/types/**', 'src/app.d.ts']`) precisely so it can stay a self-contained ambient declaration, and `HapticKind` values are assignable into a `string`-typed parameter regardless:

```ts
// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  interface ShooterBridge {
    getApnsToken?: () => string;
    getConfig?: () => string;
    getDeviceId?: () => string;
    getDeviceName?: () => string;
    getEnvironment?: () => string;
    getFcmToken?: () => string;
    getPlatform?: () => string;
    haptic?: (kind: string) => void;
    saveConfig?: (config: string) => void;
    scanner?: ShooterBridgeScanner;
  }

  interface ShooterBridgeScanner {
    scan: () => Promise<string>;
  }

  // Window must use interface — TypeScript requires it for declaration merging
  interface Window {
    handleNativeResponse?: (callbackId: string, response: string) => void;
    ShooterBridge?: ShooterBridge;
    ShooterNativeBridge?: ShooterBridge;
  }
}

export {};
```

- [ ] **Step 2: Write the failing test first**

Create `tests/native-bridge.test.cjs` (same hand-rolled node-test style as `tests/device-format.test.cjs` — this repo has no vitest; `pnpm test` chains `node tests/*.test.cjs` files, confirmed by reading `package.json:79`). Node 24 ships a built-in `navigator` global getter, so the test must override it with `Object.defineProperty` (a plain `global.navigator = {}` throws `TypeError: Cannot set property navigator of #<Object> which has only a getter` — verified):

```js
/**
 * Unit tests for src/lib/modules/client/common/native-bridge.ts — haptic()
 *
 * haptic() resolution order: window.ShooterBridge.haptic (iOS) →
 * window.ShooterNativeBridge.haptic (Android) → navigator.vibrate (web) →
 * no-op. Must be SSR/desktop-safe and never throw.
 *
 * Loads the real TS module via tsx/cjs. window/navigator are faked as
 * globals before the require (the module reads them at call time, not at
 * import time, so each test can reassign them freely).
 */

'use strict';

const path = require('path');

require('tsx/cjs');

function setWindow(value) {
  global.window = value;
}

// Node 24 defines a built-in `navigator` global getter (configurable, but
// not a plain writable property) — must use defineProperty, not assignment.
function setNavigator(value) {
  Object.defineProperty(global, 'navigator', { configurable: true, value, writable: true });
}

setWindow({});
setNavigator({});

const { haptic } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'common', 'native-bridge.ts')
);

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

console.log('\nnative-bridge haptic() unit tests\n');

runTest('Test 1: prefers window.ShooterBridge.haptic (iOS) when present', () => {
  const calls = [];
  setWindow({ ShooterBridge: { haptic: (kind) => calls.push(kind) } });
  setNavigator({
    vibrate: () => {
      throw new Error('navigator.vibrate should not be called when ShooterBridge.haptic exists');
    },
  });
  haptic('selection');
  assertEqual(calls, ['selection'], 'ShooterBridge.haptic called with kind');
});

runTest(
  'Test 2: falls back to window.ShooterNativeBridge.haptic (Android) when ShooterBridge lacks it',
  () => {
    const calls = [];
    setWindow({ ShooterNativeBridge: { haptic: (kind) => calls.push(kind) } });
    setNavigator({
      vibrate: () => {
        throw new Error(
          'navigator.vibrate should not be called when ShooterNativeBridge.haptic exists'
        );
      },
    });
    haptic('heavy');
    assertEqual(calls, ['heavy'], 'ShooterNativeBridge.haptic called with kind');
  }
);

runTest('Test 3: falls back to navigator.vibrate when neither native bridge is present', () => {
  const calls = [];
  setWindow({});
  setNavigator({ vibrate: (ms) => calls.push(ms) });
  haptic('light');
  assertEqual(calls, [10], 'navigator.vibrate called with mapped ms for "light"');
});

runTest('Test 4: default kind is "light" when called with no argument', () => {
  const calls = [];
  setWindow({});
  setNavigator({ vibrate: (ms) => calls.push(ms) });
  haptic();
  assertEqual(calls, [10], 'navigator.vibrate called with the light duration by default');
});

runTest('Test 5: silent no-op when window is undefined (SSR)', () => {
  const original = global.window;
  setWindow(undefined);
  try {
    haptic('error'); // must not throw
  } finally {
    setWindow(original);
  }
});

runTest(
  'Test 6: silent no-op when neither bridge nor navigator.vibrate exist (desktop browser)',
  () => {
    setWindow({});
    setNavigator({});
    haptic('medium'); // must not throw
  }
);

runTest('Test 7: never throws even if the native bridge itself throws', () => {
  setWindow({
    ShooterBridge: {
      haptic: () => {
        throw new Error('native crash');
      },
    },
  });
  setNavigator({ vibrate: () => {} });
  haptic('warning'); // must not throw
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

process.exit(failed > 0 ? 1 : 0);
```

Run it now, before `haptic` exists — expect a real failure:

```bash
node tests/native-bridge.test.cjs
```

Expected output (RED — verified by running this exact require against the current file, which has no `haptic` export):

```
native-bridge haptic() unit tests

  FAIL  Test 1: prefers window.ShooterBridge.haptic (iOS) when present
        haptic is not a function
  FAIL  Test 2: falls back to window.ShooterNativeBridge.haptic (Android) when ShooterBridge lacks it
        haptic is not a function
  FAIL  Test 3: falls back to navigator.vibrate when neither native bridge is present
        haptic is not a function
  FAIL  Test 4: default kind is "light" when called with no argument
        haptic is not a function
  FAIL  Test 5: silent no-op when window is undefined (SSR)
        haptic is not a function
  FAIL  Test 6: silent no-op when neither bridge nor navigator.vibrate exist (desktop browser)
        haptic is not a function
  FAIL  Test 7: never throws even if the native bridge itself throws
        haptic is not a function

Results: 0 passed, 7 failed, 7 total
```

- [ ] **Step 3: Implement `haptic()` — minimal code to pass**

Current `src/lib/modules/client/common/native-bridge.ts` (full file, 59 lines) — quoting the two edit points:

Top of file (lines 1-11):

```ts
/**
 * Native bridge utilities for detecting and communicating with
 * the ShooterBridge injected by native WebView wrappers (iOS/Android).
 *
 * The native side injects window.ShooterBridge at documentStart with its own
 * callback-ID system (window.ShooterBridge._callbacks + window.handleNativeResponse).
 * This module MUST NOT override handleNativeResponse — the native version handles
 * resolving scanner/picker promises using its own callback registry.
 */

/** True when the native bridge exposes a QR scanner */
export function hasScanner(): boolean {
```

Replace with (adds the type import):

```ts
/**
 * Native bridge utilities for detecting and communicating with
 * the ShooterBridge injected by native WebView wrappers (iOS/Android).
 *
 * The native side injects window.ShooterBridge at documentStart with its own
 * callback-ID system (window.ShooterBridge._callbacks + window.handleNativeResponse).
 * This module MUST NOT override handleNativeResponse — the native version handles
 * resolving scanner/picker promises using its own callback registry.
 */

import type { HapticKind } from '$lib/types';

/** True when the native bridge exposes a QR scanner */
export function hasScanner(): boolean {
```

End of file (lines 41-59, unchanged content) — append the haptic implementation after it:

```ts
/** Get the scanner.scan function from whichever bridge exists */
function getScanFn(): (() => Promise<string>) | null {
  if (typeof window === 'undefined') {
    return null;
  }
  // Check iOS bridge first, then Android.
  // Capture the scanner object (not the bare function) to preserve `this` binding
  // when the native side implements scan() as a method on the scanner object.
  const iosScanner = window.ShooterBridge?.scanner;
  if (iosScanner && typeof iosScanner.scan === 'function') {
    return () => iosScanner.scan();
  }
  const androidScanner = window.ShooterNativeBridge?.scanner;
  if (androidScanner && typeof androidScanner.scan === 'function') {
    return () => androidScanner.scan();
  }
  return null;
}

/** navigator.vibrate() fallback durations (ms) per haptic kind, for browsers/PWA with no native bridge. */
const VIBRATION_MS: Record<HapticKind, number> = {
  error: 40,
  heavy: 30,
  light: 10,
  medium: 20,
  selection: 5,
  success: 15,
  warning: 25,
};

/**
 * Fire a haptic tick.
 * Resolution order: window.ShooterBridge.haptic (iOS) → window.ShooterNativeBridge.haptic
 * (Android) → navigator.vibrate (web/PWA) → no-op. SSR/desktop-safe — never throws.
 */
export function haptic(kind: HapticKind = 'light'): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (typeof window.ShooterBridge?.haptic === 'function') {
      window.ShooterBridge.haptic(kind);
      return;
    }
    if (typeof window.ShooterNativeBridge?.haptic === 'function') {
      window.ShooterNativeBridge.haptic(kind);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATION_MS[kind]);
    }
  } catch {
    // Haptics are best-effort — never let a native-bridge exception surface to callers.
  }
}
```

- [ ] **Step 4: Run the test again — expect GREEN**

```bash
node tests/native-bridge.test.cjs
```

Expected output (verified against an equivalent implementation in a scratch harness using the identical resolution logic and the same `Object.defineProperty` navigator trick):

```
native-bridge haptic() unit tests

  PASS  Test 1: prefers window.ShooterBridge.haptic (iOS) when present
  PASS  Test 2: falls back to window.ShooterNativeBridge.haptic (Android) when ShooterBridge lacks it
  PASS  Test 3: falls back to navigator.vibrate when neither native bridge is present
  PASS  Test 4: default kind is "light" when called with no argument
  PASS  Test 5: silent no-op when window is undefined (SSR)
  PASS  Test 6: silent no-op when neither bridge nor navigator.vibrate exist (desktop browser)
  PASS  Test 7: never throws even if the native bridge itself throws

Results: 7 passed, 0 failed, 7 total
```

- [ ] **Step 5: Wire into the `pnpm test` chain and the common barrel**

Current `package.json:79` (excerpt, end of the chain):

```
... && node tests/notify-fanout.test.cjs && node tests/device-registry-prune.test.cjs && node tests/summary-store.test.cjs",
```

Replace with:

```
... && node tests/notify-fanout.test.cjs && node tests/device-registry-prune.test.cjs && node tests/summary-store.test.cjs && node tests/native-bridge.test.cjs",
```

Current `src/lib/modules/client/common/index.ts` (full file):

```ts
// Shared client utilities
export { clearCache, getCached, setCache } from './cache';
export { getApiKey, isShooterConfig } from './config-guard';
export { toErrorMessage } from './error';
export { renderMarkdown } from './markdown';
export { hasScanner, isNativeBridge, scanQR } from './native-bridge';
export { startPresenceReporting } from './presence';
export { AI_COMMANDS, sourceLabel, sourceToCommand } from './provider';
export { formatRelativeTime } from './time';
export { getToolDescription } from './tool-title';
```

Replace the native-bridge export line (natural-alphabetical order, `perfectionist` sorts `haptic` before `hasScanner`):

```ts
export { haptic, hasScanner, isNativeBridge, scanQR } from './native-bridge';
```

- [ ] **Step 6: Full regression run + build**

```bash
pnpm test
```

Expected: all suites pass, ending with the new one (verified baseline `pnpm test` — 30+ suites — passes clean before this change; the new suite adds 7 more passing tests with no other suite touched).

```bash
pnpm build
```

Expected: `vite build` completes with no TypeScript errors (confirms `$lib/types` import resolves inside `native-bridge.ts` and `app.d.ts`'s `haptic` field type-checks).

- [ ] **Step 7: Commit**

```bash
git add src/app.d.ts src/lib/modules/client/common/native-bridge.ts src/lib/modules/client/common/index.ts tests/native-bridge.test.cjs package.json
git commit -m "feat(haptics): add haptic() web API with native-bridge → vibrate → no-op resolution"
```

---

### Task 21: Wire haptic() into tab switch and quick-key press

**Files:**

- Modify: `src/routes/+layout.svelte:1-17,126-155`
- Modify: `src/lib/modules/client/terminal/QuickKeys.svelte:1-29`

**Interfaces:**

- Consumes: `haptic` from `$lib/modules/client/common` (Task 20)
- Produces: none (leaf call sites)

- [ ] **Step 1: `+layout.svelte` — import haptic and fire it on every bottom-tab tap**

Current `src/routes/+layout.svelte:1-17`:

```svelte
<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import { Button, Icon, Pill } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';

  const { children, data }: { children: Snippet; data: LayoutData } = $props();
```

Replace with (adds the `haptic` import from the common module barrel):

```svelte
<script lang="ts">
  import type { LayoutData } from '$lib/types';

  import '../app.css';
  import '$lib/theme.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import BellSvg from '$lib/assets/icons/bell.svg?raw';
  import DashboardSvg from '$lib/assets/icons/dashboard.svg?raw';
  import SettingsSvg from '$lib/assets/icons/settings.svg?raw';
  import TerminalSvg from '$lib/assets/icons/terminal.svg?raw';
  import ToolSvg from '$lib/assets/icons/tool.svg?raw';
  import { haptic } from '$lib/modules/client/common';
  import { Button, Icon, Pill } from '@juspay/svelte-ui-components';
  import { onMount, type Snippet } from 'svelte';

  const { children, data }: { children: Snippet; data: LayoutData } = $props();
```

Current `src/routes/+layout.svelte:123-157` (the bottom tab bar):

```svelte
  <!-- Bottom tab bar: Dashboard + Activity + Terminals -->
  <nav class="bottom-tabs">
    <div class="bottom-tabs-inner">
      <a
        href="/"
        class="tab-item"
        class:active={$page.url.pathname === '/' ||
          $page.url.pathname.startsWith('/project') ||
          $page.url.pathname.startsWith('/session')}
      >
        <Icon svg={DashboardSvg} classes="icon-26" />
        <span>Dashboard</span>
      </a>
      <a
        href="/activity"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/activity')}
      >
        <Icon svg={BellSvg} classes="icon-26" />
        <span>Activity</span>
      </a>
      <a
        href="/terminals"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/terminals')}
      >
        <Icon svg={TerminalSvg} classes="icon-26" />
        <span>Terminals</span>
      </a>
      <a href="/sos" class="tab-item" class:active={$page.url.pathname.startsWith('/sos')}>
        <Icon svg={ToolSvg} classes="icon-26" />
        <span>SoS</span>
      </a>
    </div>
  </nav>
</div>
```

Replace with (each tab anchor gets `onclick={(): void => haptic('light')}` — fires on the tap that starts the navigation, does not prevent the `href` navigation since it's a plain `<a>`):

```svelte
  <!-- Bottom tab bar: Dashboard + Activity + Terminals -->
  <nav class="bottom-tabs">
    <div class="bottom-tabs-inner">
      <a
        href="/"
        class="tab-item"
        class:active={$page.url.pathname === '/' ||
          $page.url.pathname.startsWith('/project') ||
          $page.url.pathname.startsWith('/session')}
        onclick={(): void => haptic('light')}
      >
        <Icon svg={DashboardSvg} classes="icon-26" />
        <span>Dashboard</span>
      </a>
      <a
        href="/activity"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/activity')}
        onclick={(): void => haptic('light')}
      >
        <Icon svg={BellSvg} classes="icon-26" />
        <span>Activity</span>
      </a>
      <a
        href="/terminals"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/terminals')}
        onclick={(): void => haptic('light')}
      >
        <Icon svg={TerminalSvg} classes="icon-26" />
        <span>Terminals</span>
      </a>
      <a
        href="/sos"
        class="tab-item"
        class:active={$page.url.pathname.startsWith('/sos')}
        onclick={(): void => haptic('light')}
      >
        <Icon svg={ToolSvg} classes="icon-26" />
        <span>SoS</span>
      </a>
    </div>
  </nav>
</div>
```

- [ ] **Step 2: `QuickKeys.svelte` — fire haptic on every quick-key press**

Current `src/lib/modules/client/terminal/QuickKeys.svelte:1-29`:

```svelte
<script lang="ts">
  import type { QuickKey, QuickKeysProps } from '$lib/types';

  import { Button } from '@juspay/svelte-ui-components';

  const { onKey }: QuickKeysProps = $props();

  const keys: QuickKey[] = [
    { escape: '\x03', label: 'Ctrl+C' },
    { escape: '\t', label: 'Tab' },
    { escape: '\x1b[A', label: '↑' },
    { escape: '\x1b[B', label: '↓' },
    { escape: '\x1b', label: 'Esc' },
    { escape: '\x04', label: 'Ctrl+D' },
    { escape: '\x1a', label: 'Ctrl+Z' },
  ];
</script>

<div class="quick-keys" role="toolbar" aria-label="Quick terminal keys">
  {#each keys as k (k.label)}
    <Button
      classes="btn-quick-key"
      onclick={(): void => {
        onKey(k.escape);
      }}
      text={k.label}
    />
  {/each}
</div>
```

Replace with:

```svelte
<script lang="ts">
  import type { QuickKey, QuickKeysProps } from '$lib/types';

  import { haptic } from '$lib/modules/client/common';
  import { Button } from '@juspay/svelte-ui-components';

  const { onKey }: QuickKeysProps = $props();

  const keys: QuickKey[] = [
    { escape: '\x03', label: 'Ctrl+C' },
    { escape: '\t', label: 'Tab' },
    { escape: '\x1b[A', label: '↑' },
    { escape: '\x1b[B', label: '↓' },
    { escape: '\x1b', label: 'Esc' },
    { escape: '\x04', label: 'Ctrl+D' },
    { escape: '\x1a', label: 'Ctrl+Z' },
  ];
</script>

<div class="quick-keys" role="toolbar" aria-label="Quick terminal keys">
  {#each keys as k (k.label)}
    <Button
      classes="btn-quick-key"
      onclick={(): void => {
        haptic('light');
        onKey(k.escape);
      }}
      text={k.label}
    />
  {/each}
</div>
```

- [ ] **Step 3: Verify — grep guard, build, screenshot/feature checklist**

```bash
grep -n "haptic(" src/routes/+layout.svelte src/lib/modules/client/terminal/QuickKeys.svelte
```

Expected output: 5 matches total — 4 in `+layout.svelte` (one per tab anchor) + 1 in `QuickKeys.svelte`.

```bash
pnpm build
```

Expected: clean build (no unresolved import / type errors from the new `haptic` usages).

Manual checklist (desktop browser, since native haptics need a device — see Tasks 4/5 for on-device verification):

1. Open `/` in a desktop browser with devtools console open — click each of the 4 bottom tabs (Dashboard, Activity, Terminals, SoS). Confirm no console errors and navigation still works normally (haptic() is a silent no-op on desktop, per Task 20 Test 6).
2. Open a terminal at `/terminals/[id]`, tap several quick keys (Ctrl+C, Tab, arrows, Esc). Confirm keys are still sent to the PTY (no regression) and no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte src/lib/modules/client/terminal/QuickKeys.svelte
git commit -m "feat(haptics): fire haptic() on bottom-tab switch and quick-key press"
```

---

### Task 22: iOS native haptics — UIImpactFeedbackGenerator / UINotificationFeedbackGenerator / UISelectionFeedbackGenerator

**Files:**

- Modify: `ios/Shooter/Shooter/ContentView.swift:368-471,533-567`

**Interfaces:**

- Consumes: none (native-side implementation of the `window.ShooterBridge.haptic(kind)` contract established in Task 20's `app.d.ts`)
- Produces: `window.ShooterBridge.haptic(kind: string): void` — resolved first by `haptic()` in `native-bridge.ts` on-device

- [ ] **Step 1: Add `haptic` to the injected JS bridge**

Current `ios/Shooter/Shooter/ContentView.swift:385-395` (inside `bridgeScript()`):

```swift
        window.ShooterBridge.getConfig = function() { return JSON.stringify(this._config); };
        window.ShooterBridge.getFcmToken = function() { return this._config.fcmToken || ''; };
        window.ShooterBridge.getApnsToken = function() { return this._config.apnsToken || ''; };
        window.ShooterBridge.getDeviceId = function() { return this._config.deviceId || ''; };
        window.ShooterBridge.getDeviceName = function() { return this._config.deviceName || ''; };
        window.ShooterBridge.getEnvironment = function() { return this._config.appEnv || ''; };
        window.ShooterBridge.getPlatform = function() { return 'ios'; };
        window.ShooterBridge.saveConfig = function(json) {
            window.webkit.messageHandlers.shooterBridge.postMessage(json);
        };

        // Generic native callback infrastructure — reusable for scanner, image picker, etc.
```

Replace with (adds `haptic` as a fire-and-forget synchronous call — no Promise/callback needed):

```swift
        window.ShooterBridge.getConfig = function() { return JSON.stringify(this._config); };
        window.ShooterBridge.getFcmToken = function() { return this._config.fcmToken || ''; };
        window.ShooterBridge.getApnsToken = function() { return this._config.apnsToken || ''; };
        window.ShooterBridge.getDeviceId = function() { return this._config.deviceId || ''; };
        window.ShooterBridge.getDeviceName = function() { return this._config.deviceName || ''; };
        window.ShooterBridge.getEnvironment = function() { return this._config.appEnv || ''; };
        window.ShooterBridge.getPlatform = function() { return 'ios'; };
        window.ShooterBridge.saveConfig = function(json) {
            window.webkit.messageHandlers.shooterBridge.postMessage(json);
        };
        window.ShooterBridge.haptic = function(kind) {
            window.webkit.messageHandlers.shooterHaptic.postMessage(kind || 'light');
        };

        // Generic native callback infrastructure — reusable for scanner, image picker, etc.
```

- [ ] **Step 2: Register the new message handler**

Current `ios/Shooter/Shooter/ContentView.swift:465-471`:

```swift
        // Handle saveConfig calls from JavaScript
        config.userContentController.add(context.coordinator, name: "shooterBridge")
        // Handle native feature requests (scanner, future: image picker, etc.)
        config.userContentController.add(context.coordinator, name: "requestScanner")
        // Phone-resident agent: durable file persistence + on-device decide step
        config.userContentController.add(context.coordinator, name: "shooterFiles")
        config.userContentController.add(context.coordinator, name: "shooterAgentDecide")
```

Replace with:

```swift
        // Handle saveConfig calls from JavaScript
        config.userContentController.add(context.coordinator, name: "shooterBridge")
        // Handle native feature requests (scanner, future: image picker, etc.)
        config.userContentController.add(context.coordinator, name: "requestScanner")
        // Phone-resident agent: durable file persistence + on-device decide step
        config.userContentController.add(context.coordinator, name: "shooterFiles")
        config.userContentController.add(context.coordinator, name: "shooterAgentDecide")
        // Native haptic feedback ticks
        config.userContentController.add(context.coordinator, name: "shooterHaptic")
```

- [ ] **Step 3: Dispatch the new message name + implement the handler**

Current `ios/Shooter/Shooter/ContentView.swift:533-567`:

```swift
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            switch message.name {
            case "shooterBridge":
                handleSaveConfig(message)
            case "requestScanner":
                handleRequestScanner(message)
            case "shooterFiles":
                handleFiles(message)
            case "shooterAgentDecide":
                handleAgentDecide(message)
            default:
                break
            }
        }

        // MARK: - saveConfig handler

        private func handleSaveConfig(_ message: WKScriptMessage) {
            guard let jsonString = message.body as? String,
                  let data = jsonString.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }

            if let serverUrl = obj["serverUrl"] as? String {
                UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
            }
            if let apiKey = obj["apiKey"] as? String {
                KeychainHelper.save(key: "apiKey", value: apiKey)
            }
            print("[ShooterBridge] saveConfig: serverUrl=\(obj["serverUrl"] ?? "nil"), apiKey=\((obj["apiKey"] as? String)?.isEmpty == false ? "(set)" : "(empty)")")
        }

        // MARK: - QR Scanner handler
```

Replace with (adds the `shooterHaptic` case to the dispatch switch, plus the handler mapping `kind` string → the three feedback-generator types, dispatched on the main thread since `UIFeedbackGenerator` subclasses must be triggered on the main thread):

```swift
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            switch message.name {
            case "shooterBridge":
                handleSaveConfig(message)
            case "requestScanner":
                handleRequestScanner(message)
            case "shooterFiles":
                handleFiles(message)
            case "shooterAgentDecide":
                handleAgentDecide(message)
            case "shooterHaptic":
                handleHaptic(message)
            default:
                break
            }
        }

        // MARK: - saveConfig handler

        private func handleSaveConfig(_ message: WKScriptMessage) {
            guard let jsonString = message.body as? String,
                  let data = jsonString.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }

            if let serverUrl = obj["serverUrl"] as? String {
                UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
            }
            if let apiKey = obj["apiKey"] as? String {
                KeychainHelper.save(key: "apiKey", value: apiKey)
            }
            print("[ShooterBridge] saveConfig: serverUrl=\(obj["serverUrl"] ?? "nil"), apiKey=\((obj["apiKey"] as? String)?.isEmpty == false ? "(set)" : "(empty)")")
        }

        // MARK: - Haptic feedback handler

        /// Maps a web-side HapticKind string to the matching UIKit feedback generator.
        /// Impact generators for light/medium/heavy taps, notification generator for
        /// success/warning/error outcomes, selection generator for picker-style changes.
        private func handleHaptic(_ message: WKScriptMessage) {
            guard let kind = message.body as? String else { return }
            DispatchQueue.main.async {
                switch kind {
                case "light":
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                case "medium":
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                case "heavy":
                    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                case "success":
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                case "warning":
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                case "error":
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                case "selection":
                    UISelectionFeedbackGenerator().selectionChanged()
                default:
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
        }

        // MARK: - QR Scanner handler
```

- [ ] **Step 4: Verify — build + device checklist**

```bash
cd ios/Shooter && xcodebuild -project Shooter.xcodeproj -scheme Shooter -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
```

Expected: `** BUILD SUCCEEDED **` (this exact command was run against the pre-change tree and succeeded — confirms the project/scheme names and build invocation are correct; re-run after the edit to confirm no compile regressions from the new `handleHaptic` code).

```bash
grep -n "shooterHaptic\|handleHaptic\|window.ShooterBridge.haptic" ios/Shooter/Shooter/ContentView.swift
```

Expected: 4 matches — the JS assignment, the `userContentController.add(...)` registration, the switch `case`, and the `private func handleHaptic` declaration.

Device/simulator checklist (per Constraint 5 — physical haptics require a real iPhone; the simulator will not buzz but exercises the message-passing path without crashing):

1. Run the app on a physical iPhone (Xcode → Run, device selected). Load the dashboard.
2. Tap each bottom tab (Dashboard/Activity/Terminals/SoS) — confirm a light physical tick on every tap (fired from Task 21's `haptic('light')` call, resolved here via `window.ShooterBridge.haptic`).
3. Open a terminal, tap a quick key — confirm the same light tick.
4. Confirm no crash/console error in Xcode's device console when tapping rapidly (generator objects are allocated per-call, which is the Apple-recommended pattern for infrequent, ad-hoc feedback).

- [ ] **Step 5: Commit**

```bash
git add ios/Shooter/Shooter/ContentView.swift
git commit -m "feat(ios): implement native haptic feedback for window.ShooterBridge.haptic"
```

---

### Task 23: Android native haptics — Vibrator / VibrationEffect

**Files:**

- Modify: `android/app/src/main/kotlin/com/shooter/android/MainActivity.kt:1-25,327-339`
- Modify: `android/app/src/main/AndroidManifest.xml:1-6`

**Interfaces:**

- Consumes: none (native-side implementation of the `window.ShooterBridge.haptic(kind)` contract — on Android, `window.ShooterBridge` is the raw `@JavascriptInterface`-annotated Kotlin object added via `webView.addJavascriptInterface(ShooterBridge(), "ShooterBridge")` at `MainActivity.kt:125`, so `haptic` is added directly to it, no JS shim needed)
- Produces: `window.ShooterBridge.haptic(kind: string): void` — resolved first by `haptic()` in `native-bridge.ts` on-device

- [ ] **Step 1: Declare the VIBRATE permission**

Current `android/app/src/main/AndroidManifest.xml:1-6` (confirmed by reading the file — `VIBRATE` is currently absent):

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.CAMERA" />
```

Replace with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.VIBRATE" />
```

- [ ] **Step 2: Import Vibrator/VibrationEffect**

Current `android/app/src/main/kotlin/com/shooter/android/MainActivity.kt:1-24`:

```kotlin
package com.shooter.android

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.firebase.messaging.FirebaseMessaging
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject
```

Replace with (adds `Vibrator`/`VibrationEffect`, natural-sorted into the existing `android.os.*` group):

```kotlin
package com.shooter.android

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.firebase.messaging.FirebaseMessaging
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject
```

- [ ] **Step 3: Add `haptic()` to the `ShooterBridge` inner class**

Current `android/app/src/main/kotlin/com/shooter/android/MainActivity.kt:327-339` (end of the `ShooterBridge` inner class):

```kotlin
        @JavascriptInterface
        fun getFcmToken(): String {
            val token = AppPreferences(this@MainActivity).fcmToken ?: ""
            android.util.Log.d(TAG, "ShooterBridge.getFcmToken() → ${token.take(10)}...")
            return token
        }

        @JavascriptInterface
        fun getPlatform(): String {
            android.util.Log.d(TAG, "ShooterBridge.getPlatform() → android")
            return "android"
        }
    }
```

Replace with (mirrors the web `VIBRATION_MS` durations from Task 20; runs on the UI thread via `runOnUiThread` — matching the existing `openSettings` bridge method's pattern at `MainActivity.kt:117-122` — since `@JavascriptInterface` methods are invoked on a WebView worker thread, not the UI thread):

```kotlin
        @JavascriptInterface
        fun getFcmToken(): String {
            val token = AppPreferences(this@MainActivity).fcmToken ?: ""
            android.util.Log.d(TAG, "ShooterBridge.getFcmToken() → ${token.take(10)}...")
            return token
        }

        @JavascriptInterface
        fun getPlatform(): String {
            android.util.Log.d(TAG, "ShooterBridge.getPlatform() → android")
            return "android"
        }

        @JavascriptInterface
        fun haptic(kind: String) {
            this@MainActivity.runOnUiThread {
                val vibrator = this@MainActivity.getSystemService(Vibrator::class.java) ?: return@runOnUiThread
                if (!vibrator.hasVibrator()) return@runOnUiThread
                val durationMs = when (kind) {
                    "light" -> 10L
                    "medium" -> 20L
                    "heavy" -> 30L
                    "success" -> 15L
                    "warning" -> 25L
                    "error" -> 40L
                    "selection" -> 5L
                    else -> 10L
                }
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
    }
```

- [ ] **Step 4: Verify — compile + device checklist**

```bash
cd android && ./gradlew :app:compileDebugKotlin --console=plain
```

Expected: `BUILD SUCCESSFUL` (this exact command was run against the pre-change tree and succeeded in ~23s — confirms the module/task name; re-run after the edit to confirm the new `Vibrator`/`VibrationEffect` code compiles).

```bash
grep -n "VIBRATE\|fun haptic" android/app/src/main/AndroidManifest.xml android/app/src/main/kotlin/com/shooter/android/MainActivity.kt
```

Expected: 2 matches — the manifest permission line and the `fun haptic(kind: String)` declaration.

Device checklist (per Constraint 5 — the emulator can simulate vibration in logs but won't physically buzz; use a real device):

1. Run the app on a physical Android device (`./gradlew installDebug` or Android Studio Run). Load the dashboard.
2. Tap each bottom tab (Dashboard/Activity/Terminals/SoS) — confirm a light physical buzz on every tap (fired from Task 21's `haptic('light')`, resolved here via `window.ShooterBridge.haptic`, since Android's `window.ShooterBridge` is this same `@JavascriptInterface` object per `MainActivity.kt:125`).
3. Open a terminal, tap a quick key — confirm the same light buzz.
4. Toggle system-wide "Vibration & haptics" off in Android Settings and confirm the app respects it (device-level `Vibrator` calls are automatically suppressed by the OS when the user has disabled haptics — no app-side check needed).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/kotlin/com/shooter/android/MainActivity.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): implement native haptic feedback via Vibrator/VibrationEffect"
```

---

## Assumptions & open issues (reconcile during execution)

**Unit E — Library upgrade:**

- package.json currently pins @juspay/svelte-ui-components with a caret range ("^2.18.0"). The spec's Constraint 2 states the target as a bare version string ("2.87.0", not "^2.87.0"), so I pinned it exact (no caret) to lock the base for the rest of the program and make regressions attributable to a deliberate, reproducible bump. If the team prefers to keep caret-range style consistent with the rest of dependencies, change `"2.87.0"` to `"^2.87.0"` in Task 1 Step 1 and rerun `pnpm install`.
- Verified `pnpm dev` is ALREADY RUNNING on http://localhost:54006 (confirmed via `curl http://localhost:54006/api/health` -> 200/healthy) at task-drafting time, using ~/.shooter-dev as SHOOTER_HOME. The executing agent should confirm it's still up (or start it with `pnpm dev` in a background shell) before the screenshot steps; the tasks assume port 54006 is reachable and do not include falling back to killing/restarting it since it's a shared dev instance.
- No project-specific `verify` skill or Playwright/Puppeteer script exists in this repo — screenshot capture must go through the `chrome-devtools-mcp` MCP tools (per the global CLAUDE.md's 'Chrome DevTools MCP — debug-Chrome setup' section), pointed at http://localhost:54006 rather than a real device/site. I did not have permission/need to actually drive the MCP browser myself while drafting this unit (read-only exploration only), so the exact DOM selectors for the LaunchSheet/QuickKeys/ShareSheet trigger elements referenced in Task 3's checklist are described by visible text/aria-role, not verified live in a screenshot — the executing agent should adjust selectors via `take_snapshot` if they've drifted.
- For screens requiring state that may not exist in the dev environment (a running terminal, an existing session, SOS/neurolink data), Task 3's checklist instructs launching one via the LaunchSheet flow (mirroring the existing `test-screenshots/02-launchsheet-open.png` .. `09-claude-terminal.png` naming convention already in the repo) rather than assuming fixture data is present.
- The repo's `pnpm test` command runs the Node.js `node:test`-based suite (tests/\*.test.cjs) — there is no vitest in this repo despite the general instructions mentioning it; none of these existing tests touch the UI library or theme layer, so Task 2's test run is a non-regression smoke check, not a targeted test for this change.

**Unit A — Central token re-base:**

- DashboardCard.svelte:184 and AutopilotPanel.svelte:380 have per-component `.card:focus-visible { outline: 2px solid var(--ds-blue-700, #0070f3); }` style forks — left untouched in this unit because Unit B (design doc) explicitly owns centralizing press/focus feedback via `--button-focus-visible-box-shadow` and the Card/ListItem/Pill equivalents; flagging so Unit B's grep-guard doesn't miss these two.
- DashboardCard.svelte:33 (borderColor for 'running' non-active cards) and AutopilotPanel.svelte:533 use --ds-blue-700 as an intentional 'info' status color per the design doc's green=live/blue=info split — confirmed correct, left unchanged, not a bug.
- ActivityFeed.svelte:252 (.type label color) and neurolink/+page.svelte:228,271,301 (page title, pill, chat-role text) use --ds-blue-700 as decorative/informational text color, not an action/selection surface — left unchanged as out of this unit's literal scope (button/tab/input/selection only); flagging in case product wants these swept into the accent system in a later pass.
- --button-active-background is a newly-declared CSS variable that only takes effect once Unit E (library upgrade to @juspay/svelte-ui-components 2.87.0) lands and the Button component actually reads that hook — until then it's an inert unused custom property, confirmed harmless but worth the assembler knowing the dependency direction (Unit A can land before or after Unit E without breaking, but the visual effect of --button-active-background is dormant until Unit E ships).
- The exact line numbers cited for the new app.css :root token block (Step 2 grep expectations in the first task) assume no other unit lands conflicting edits to the same :root block first; if Unit B's radius/text-base bump (also in app.css :root) lands before this unit, line numbers will shift but the property names and values are unaffected.

**UNIT B — Website tells + bolder look:**

- Unit E dependency: `--button-focus-visible-box-shadow` (press/focus task) and any Unit A color mapping onto `--button-active-background` will not visibly render until @juspay/svelte-ui-components is bumped to 2.87.0 — confirmed by reading the installed 2.18.0 Button.svelte, which has `:active { transform: var(--button-active-transform) }` already but no `:focus-visible` rule at all. This unit ships the central var regardless (forward-compatible); the assembler should sequence Unit E before/alongside this unit's press/focus and Unit A's amber-mapping tasks so the screenshot verification of the focus ring isn't a false negative.
- Unit A dependency (soft): the focus-visible box-shadow references `var(--accent, #f5b14c)` with an inline fallback matching the spec's committed amber value, so this unit's press/focus task is independently mergeable regardless of whether Unit A has landed `--accent` in app.css yet. Once Unit A lands, the fallback becomes redundant but harmless.
- DashboardCard.svelte (`src/lib/modules/client/dashboard/DashboardCard.svelte:146-172`) has its own scoped `.card` style block (background/border/border-left/border-radius) that wins over the central `app.css` `.card` rule for those specific properties (Svelte scoping raises selector specificity). The new central box-shadow still shows through (DashboardCard's scoped block never sets box-shadow), so the elevation task's shadow lands everywhere, but the background gradient specifically will only visually apply to plain (non-DashboardCard) `.card` usages and the library `Card` component (which reads `--card-background` via `var()`, not hardcoded). A true single-source elevation for DashboardCard would require editing that component's scoped `<style>` block, which is out of this CENTRAL-ONLY unit's mandate (owner constraint 1) — flagging for a follow-up slice or an explicit owner call to relax the constraint for this one dead-code-adjacent spot.
- `.list`/`.list-item` (elevation task) and the library `ListItem` component (press/focus task's 'Card/ListItem/Pill equivalents') are confirmed dead/unused in the current codebase — verified via repo-wide grep, zero `<ListItem>` or `class="list-item"` usages in any .svelte template (only the unrelated TS type names `DeviceListItem`/`TerminalListItem` share the substring). Their CSS/theme vars were still updated for consistency/future-readiness per the spec's explicit instruction, but there is nothing to screenshot-verify for them today.
- Task ordering within this unit: the 'bolder tokens' task and the 'card elevation' task both touch theme.css but in disjoint line ranges (Button/Input/Select radius mirror vs. new Card section) — safe to land in either order. The 'press/focus' task's theme.css insertion (end of Button section) and the 'bolder tokens' task's edit to `--button-border-radius` (start of Button section) are also disjoint lines in the same block — verified no textual overlap.
- iOS Swift change (`config.dataDetectorTypes = []`) could not be compiled/verified in this sandboxed environment (no Xcode toolchain invoked) — verification is code-review-level only; recommend an actual `xcodebuild` or Xcode-preview pass before merging if a maintainer has the toolchain available.
- The `Icon`-swap task removes six literal glyph-arrow occurrences across 4 route files (not just the 2 dead classes named in the original spec bullet) — flagging the scope expansion explicitly since `.session-chevron`/`.session-back-btn` turned out to be 100% dead CSS with no template usage (confirmed via `git log -p --follow -- src/app.css`), while the actual live 'glyph chevron' tells were the `.back-link` `← Back` / `&larr;` / `&#8592;` instances the spec didn't name by class.

**Unit C — Motion primitives:**

- Did not execute any of the edits myself (Write/Edit/Bash) — this is a planning/drafting handoff; the assembler or a follow-up agent must actually apply the diffs and run the verification commands.
- The View-Transitions ::view-transition-old(root)/::view-transition-new(root) rule targets the default unnamed root transition group (no per-element view-transition-name assignment) — this is the simplest central rule per the spec's 'default ::view-transition slide/cross-fade' wording; if a later slice wants per-route or per-element named transitions, that CSS will need view-transition-name assignments on specific elements, which is out of scope here.
- package.json's pnpm test script runs the FULL existing chain (30+ node test files, including ones that spin up better-sqlite3/node-pty); running it after appending motion.test.cjs will take noticeably longer than the isolated node tests/motion.test.cjs check — flagged as optional/final in Task A rather than mandatory per-step.
- Did not verify in a live browser that Svelte 5's animate: directive compiles cleanly on a <div> wrapping a component (only confirmed via reading the Svelte compiler source that AnimateDirective is only wired for RegularElement, not Component) — Task B's Step 4 pnpm build check is the first real compiler verification of this.
- Assumed DashboardCardComponent's rendered root element has no CSS that depends on being a direct flex child with specific margin auto-collapsing behavior; the wrapper <div> should be layout-transparent but this is asserted from reading DashboardView.svelte's <style> block only, not from rendering DashboardCard.svelte's own <style> block (not fully read).

**Unit D — Haptics full vertical:**

- Native (iOS/Android) haptic verification steps require a physical device — I could not execute those device checklists in this environment; I did verify both native projects build cleanly at baseline (xcodebuild BUILD SUCCEEDED, ./gradlew :app:compileDebugKotlin BUILD SUCCESSFUL) and validated the exact haptic() resolution logic + the Object.defineProperty(navigator) test trick against a scratch harness using tsx/cjs (matches the actual native-bridge.ts implementation), but did not apply any of these edits to the actual repo files — this is a task draft only, per the assignment ('Draft tasks... Read the real files first, then draft the task section(s)'), so all repo files are unmodified and the task list is ready for an executor agent.
- Chose kind='light' for both tab-switch and quick-key taps; the design spec explicitly says 'light' for tab-item (line 115 of the design doc) but doesn't specify a kind for quick-key press beyond 'called on quick-key press' — light was chosen for consistency with frequent, low-weight taps; flag if the assembler wants a different kind (e.g. 'selection') for quick keys.
- app.d.ts's ShooterBridge.haptic field is typed as plain `string` rather than the new `HapticKind` (to match every other field in that ambient/ignored-from-type-governance file and avoid coupling the global ambient declaration to the app's central type barrel) — HapticKind values are assignable into it at every call site, so this is purely a style choice or the assembler may prefer to import HapticKind there instead for tighter typing.
- Did not touch primary-button haptic (mentioned in the full design spec's Unit D but not in this UNIT D assignment's explicit call-site list, which only names bottom-tab switch and quick-key press) — left out of scope per the assignment text; flag if primary-button press should also be wired in this slice.
- The pnpm test chain edit (package.json:79) inserts the new test file at the very end of the existing chain; did not reorder alphabetically since the existing chain is not alphabetically sorted (it appears roughly chronological by feature), matching existing convention.
