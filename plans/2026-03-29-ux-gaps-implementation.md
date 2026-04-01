# UX Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 42 remaining product evaluation gaps across data consistency, UX, navigation, mobile, and performance.

**Architecture:** Five independent workstreams (A-E), each buildable and testable in isolation. All changes follow existing Shooter patterns: Svelte 5 runes, `$derived`, `validateAuth`, Bearer token auth, Geist CSS variables, type-crafter types.

**Tech Stack:** SvelteKit, TypeScript, `@juspay/svelte-ui-components`, CSS custom properties, `better-sqlite3`, `fs.promises`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `static/manifest.json` | PWA manifest for home screen install |
| `src/lib/modules/server/sessions/opencode-db-path.ts` | Shared OpenCode DB path resolver |

### Modified Files (by workstream)

**Workstream A (Quick Wins):**
- `src/routes/api/health/+server.ts` — dynamic version
- `src/routes/api/sessions/connect/+server.ts` — createdAt format
- `src/routes/+page.svelte` — error state, poll guard
- `src/routes/project/+page.svelte` — error state
- `src/routes/terminals/+page.svelte` — error state
- `src/routes/session/[id]/+page.svelte` — backoff, polling
- `src/lib/modules/server/sessions/opencode-reader.ts` — shared DB path
- `src/lib/modules/server/terminal/opencode-watcher.ts` — shared DB path
- `src/lib/modules/server/sessions/jsonl-reader.ts` — readCwdFromProjectDir

**Workstream B (UX/Onboarding):**
- `src/routes/config/+page.svelte` — help text, back button, test connection

**Workstream C (Navigation):**
- `src/routes/terminals/[id]/+page.svelte` — session cross-link
- `src/routes/session/[id]/+page.svelte` — resilient deep links
- `src/routes/config/+page.svelte` — back button

**Workstream D (Mobile):**
- `src/app.html` — PWA meta tags
- `src/lib/theme.css` — touch target overrides
- `src/lib/modules/client/terminal/ConnectionStatus.svelte` — aria-label

**Workstream E (Performance):**
- `src/lib/modules/server/sessions/jsonl-reader.ts` — partial reads
- `src/lib/modules/client/common/markdown.ts` — memoization

---

## Workstream A: Quick Wins

### Task A1: Dynamic version in health endpoint

**Files:**
- Modify: `src/routes/api/health/+server.ts:81`

- [ ] **Step 1: Read package.json for version**

```typescript
// At top of file, add:
import { readFileSync } from 'fs';
import { join } from 'path';

const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
```

- [ ] **Step 2: Replace hardcoded version**

Change line 81 from:
```typescript
version: '1.1.0',
```
To:
```typescript
version: PKG_VERSION,
```

- [ ] **Step 3: Verify**

Run: `pnpm build && PORT=54008 timeout 5 pnpm start &; sleep 3; curl -s http://localhost:54008/api/health | grep version`

Expected: `"version": "1.1.0"` (matches package.json)

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/health/+server.ts
git commit -m "fix(health): read version from package.json instead of hardcoding"
```

---

### Task A2: Fix createdAt format inconsistency

**Files:**
- Modify: `src/routes/api/sessions/connect/+server.ts:70`

- [ ] **Step 1: Fix Date serialization**

Change line 70 from:
```typescript
createdAt: terminal.createdAt,
```
To:
```typescript
createdAt: terminal.createdAt instanceof Date ? terminal.createdAt.toISOString() : terminal.createdAt,
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/api/sessions/connect/+server.ts
git commit -m "fix(api): serialize createdAt as ISO string consistently"
```

---

### Task A3: Show error states on client pages

**Files:**
- Modify: `src/routes/+page.svelte:144-145`
- Modify: `src/routes/project/+page.svelte:117-119`
- Modify: `src/routes/terminals/+page.svelte:94-95`

- [ ] **Step 1: Add error state to home page**

In `src/routes/+page.svelte`, add reactive state:
```typescript
let fetchError = $state<string | null>(null);
```

Change the silent return:
```typescript
// Before:
if (!response.ok) { return; }

// After:
if (!response.ok) {
  fetchError = response.status === 401 ? 'Invalid API key. Check Settings.' : 'Failed to load projects.';
  return;
}
```

Clear error on success:
```typescript
// After successful fetch:
fetchError = null;
```

Add Banner to template (after the shimmer/loading block):
```svelte
{#if fetchError}
  <Banner text={fetchError} classes="banner-error" />
{/if}
```

- [ ] **Step 2: Same pattern for project page**

In `src/routes/project/+page.svelte`, add `let fetchError = $state<string | null>(null);` and update the `if (!response.ok)` block the same way. Add `<Banner>` in template.

- [ ] **Step 3: Same pattern for terminals page**

In `src/routes/terminals/+page.svelte`, same pattern.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/project/+page.svelte src/routes/terminals/+page.svelte
git commit -m "fix(ui): show error banners when API calls fail instead of silent swallow"
```

---

### Task A4: WebSocket exponential backoff

**Files:**
- Modify: `src/routes/session/[id]/+page.svelte:192-197,228-234`

- [ ] **Step 1: Replace fixed delay with exponential backoff**

Find both places where `2000` is used as the reconnect delay. Replace with:
```typescript
const backoffMs = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
```

Also increase max retries from 5 to 10.

- [ ] **Step 2: Commit**

```bash
git add src/routes/session/[id]/+page.svelte
git commit -m "fix(ws): exponential backoff for WebSocket reconnection (1s→30s, 10 retries)"
```

---

### Task A5: Prevent polling from clobbering pagination

**Files:**
- Modify: `src/routes/+page.svelte:64-68`

- [ ] **Step 1: Skip poll when user has paginated**

Change the poll timer callback:
```typescript
pollTimer = setInterval(() => {
  if (config?.apiKey && currentOffset <= PAGE_SIZE) {
    // Only auto-refresh when user is on the first page
    void fetchSessions();
  }
}, POLL_INTERVAL_MS);
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "fix(home): skip polling when user has paginated past first page"
```

---

### Task A6: Session page metadata polling

**Files:**
- Modify: `src/routes/session/[id]/+page.svelte`

- [ ] **Step 1: Add metadata refresh interval**

In the `onMount` block (or after initial fetch), add:
```typescript
const metadataPollTimer = setInterval(() => {
  if (isSessionActive && !disposed) {
    // Re-check if session is still active by looking at modified time
    void refreshSessionMetadata();
  }
}, 30_000);
```

Add cleanup in `onDestroy` or `disposed` logic.

Add `refreshSessionMetadata()`:
```typescript
async function refreshSessionMetadata(): Promise<void> {
  // Lightweight: just re-fetch session info, not messages
  // Check modified time, update isSessionActive if stale
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/session/[id]/+page.svelte
git commit -m "fix(session): poll metadata every 30s to update LIVE badge accuracy"
```

---

### Task A7: Shared OpenCode DB path resolver

**Files:**
- Create: `src/lib/modules/server/sessions/opencode-db-path.ts`
- Modify: `src/lib/modules/server/sessions/opencode-reader.ts:12-18`
- Modify: `src/lib/modules/server/terminal/opencode-watcher.ts:29-45`

- [ ] **Step 1: Create shared resolver**

```typescript
// src/lib/modules/server/sessions/opencode-db-path.ts
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export function resolveOpenCodeDbPath(): string {
  const home = homedir();
  const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  const xdgPath = join(xdgData, 'opencode', 'opencode.db');

  if (existsSync(xdgPath)) { return xdgPath; }

  if (process.platform === 'darwin') {
    const legacyPath = join(home, 'Library', 'Application Support', 'opencode', 'opencode.db');
    if (existsSync(legacyPath)) { return legacyPath; }
  }

  return xdgPath;
}
```

- [ ] **Step 2: Use in opencode-reader.ts**

Replace lines 12-18 with:
```typescript
import { resolveOpenCodeDbPath } from './opencode-db-path';
const OPENCODE_DB_PATH = resolveOpenCodeDbPath();
```

- [ ] **Step 3: Use in opencode-watcher.ts**

Replace the IIFE at lines 29-45 with:
```typescript
import { resolveOpenCodeDbPath } from '../sessions/opencode-db-path';
const OPENCODE_DB_PATH = resolveOpenCodeDbPath();
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/server/sessions/opencode-db-path.ts src/lib/modules/server/sessions/opencode-reader.ts src/lib/modules/server/terminal/opencode-watcher.ts
git commit -m "refactor(opencode): shared DB path resolver for reader and watcher"
```

---

### Task A8: readCwdFromProjectDir — read only first line

**Files:**
- Modify: `src/lib/modules/server/sessions/jsonl-reader.ts:363-389`

- [ ] **Step 1: Replace full file read with partial read**

Replace the function body with:
```typescript
function readCwdFromProjectDir(projectDir: string): string {
  try {
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(projectDir, file);
      // Read only first 4KB instead of entire file
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const firstChunk = buf.toString('utf-8', 0, bytesRead);
      const firstLine = firstChunk.split('\n')[0];
      if (!firstLine) { continue; }
      try {
        const entry = JSON.parse(firstLine);
        if (entry.cwd) { return entry.cwd; }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return '';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/modules/server/sessions/jsonl-reader.ts
git commit -m "perf(sessions): read only first 4KB for CWD extraction instead of full file"
```

---

## Workstream B: UX/Onboarding

### Task B1: Config page — API key help text + back button

**Files:**
- Modify: `src/routes/config/+page.svelte`

- [ ] **Step 1: Add help text below API key input**

Find the API key `<Input>` component. After it, add:
```svelte
<p class="input-help">
  Find this in your <code>~/.shooter/.env</code> file (generated during setup).
  Run <code>shooter setup</code> to create one.
</p>
```

Style:
```css
.input-help {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: var(--space-1);
}
.input-help code {
  background: var(--ds-gray-200);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Add back button at top**

Add at the top of the page template:
```svelte
<div class="config-back-row">
  <a href="/" class="back-link">
    <Icon name="play" size={12} class="back-icon" /> Back to Projects
  </a>
</div>
```

Reuse the `.back-link` CSS class from `app.css` (already exists).

- [ ] **Step 3: Mark Device Token as optional**

Find the Device Token input. Add `placeholder="Optional — only needed for push notifications"`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/config/+page.svelte
git commit -m "feat(config): add API key help text, back button, mark device token optional"
```

---

## Workstream C: Navigation

### Task C1: Terminal → Session cross-link

**Files:**
- Modify: `src/routes/terminals/[id]/+page.svelte`

- [ ] **Step 1: Add "View Session" link for AI terminals**

Find the terminal top bar. For AI terminals (`isAI` is true), add a link:
```svelte
{#if terminal.sessionFile}
  {@const sessionId = terminal.sessionFile.split('/').pop()?.replace('.jsonl', '') || ''}
  <a href="/session/{sessionId}" class="view-session-link">
    <Icon name="file" size={12} /> Session
  </a>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/terminals/[id]/+page.svelte
git commit -m "feat(terminal): add link to view associated session history"
```

---

### Task C2: Resilient session deep links

**Files:**
- Modify: `src/routes/session/[id]/+page.svelte`

- [ ] **Step 1: Search all projects when projectId is missing**

In `fetchSession()`, after the current fetch logic, add a fallback:
```typescript
// If projectId is missing, search all projects for this session
if (!pid && !session) {
  const allRes = await fetch('/api/sessions?refresh=true', {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (allRes.ok) {
    const all = await allRes.json();
    for (const p of all.projects) {
      const found = p.sessions.find((s: any) => s.id === sid);
      if (found) {
        // Re-fetch with the correct project ID
        // ... set projectId and re-run fetch
        break;
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/session/[id]/+page.svelte
git commit -m "fix(session): search all projects when deep link has no project param"
```

---

## Workstream D: Mobile Polish

### Task D1: PWA manifest

**Files:**
- Create: `static/manifest.json`
- Modify: `src/app.html`

- [ ] **Step 1: Create manifest**

```json
{
  "name": "Shooter",
  "short_name": "Shooter",
  "description": "Remote terminal & notifications for Claude Code",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Add meta tags to app.html**

In `<head>`:
```html
<link rel="manifest" href="%sveltekit.assets%/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

- [ ] **Step 3: Generate icons**

Create simple 192x192 and 512x512 PNG icons in `static/`.

- [ ] **Step 4: Commit**

```bash
git add static/manifest.json static/icon-192.png static/icon-512.png src/app.html
git commit -m "feat(pwa): add web app manifest for home screen install"
```

---

### Task D2: Fix undersized touch targets

**Files:**
- Modify: `src/lib/theme.css`

- [ ] **Step 1: Add mobile touch target overrides**

At the end of `theme.css`, add:
```css
/* Mobile touch target enforcement (44px minimum) */
@media (max-width: 768px) {
  .btn-xs {
    min-height: 36px;
    padding: 6px 12px;
  }

  .chatview-details-btn {
    min-height: 36px;
    padding: 6px 12px;
    font-size: 0.75rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/theme.css
git commit -m "fix(mobile): increase undersized touch targets for phone usability"
```

---

### Task D3: ConnectionStatus aria-label

**Files:**
- Modify: `src/lib/modules/client/terminal/ConnectionStatus.svelte`

- [ ] **Step 1: Add aria-label**

Find the wrapper div. Add:
```svelte
<div class="connection-status" aria-label="Connection: {label}">
```

This ensures screen readers announce the status even when the label text is hidden on mobile.

- [ ] **Step 2: Commit**

```bash
git add src/lib/modules/client/terminal/ConnectionStatus.svelte
git commit -m "fix(a11y): add aria-label to ConnectionStatus for mobile screen readers"
```

---

## Workstream E: Performance

### Task E1: Memoize markdown rendering

**Files:**
- Modify: `src/lib/modules/client/common/markdown.ts`

- [ ] **Step 1: Add simple cache**

```typescript
const markdownCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

export function renderMarkdown(text: string): string {
  const cached = markdownCache.get(text);
  if (cached) { return cached; }

  const result = DOMPurify.sanitize(marked.parse(text) as string);

  if (markdownCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = markdownCache.keys().next().value;
    if (firstKey) { markdownCache.delete(firstKey); }
  }
  markdownCache.set(text, result);
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/modules/client/common/markdown.ts
git commit -m "perf(markdown): memoize rendered output to avoid re-parsing identical text"
```

---

### Task E2: Partial file read for active session message counting

**Files:**
- Modify: `src/lib/modules/server/sessions/jsonl-reader.ts:220-231`

- [ ] **Step 1: Count newlines instead of parsing JSON**

Replace the full-file JSON parse loop with a byte-level newline count:
```typescript
// For recently active sessions (< 10 min), count message lines efficiently
if (Date.now() - stat.mtime.getTime() < 10 * 60 * 1000) {
  try {
    // Count lines starting with {"type":"user" or {"type":"assistant"
    // Much cheaper than full JSON parse
    const content = fs.readFileSync(jsonlFile, 'utf-8');
    let count = 0;
    let pos = 0;
    while (pos < content.length) {
      const nl = content.indexOf('\n', pos);
      if (nl === -1) { break; }
      const line = content.substring(pos, Math.min(pos + 30, nl));
      if (line.includes('"user"') || line.includes('"assistant"')) { count++; }
      pos = nl + 1;
    }
    if (count > 0) { messageCount = count; }
  } catch { /* keep index count */ }
}
```

This reads the file once but only inspects the first 30 chars of each line instead of parsing full JSON.

- [ ] **Step 2: Commit**

```bash
git add src/lib/modules/server/sessions/jsonl-reader.ts
git commit -m "perf(sessions): count messages by scanning line prefixes instead of full JSON parse"
```

---

## Verification

After all tasks:

- [ ] Run `pnpm lint` — expect 0 errors
- [ ] Run `pnpm build` — expect success
- [ ] Run `PORT=54008 pnpm start` — server starts on 54008
- [ ] Open http://localhost:54008 — see projects with active indicators
- [ ] Open a project — see sessions with Connect/Resume, correct dates
- [ ] Open a session — see recent messages in correct order, input enabled
- [ ] Navigate to /nonexistent — see branded error page
- [ ] Refresh button works on all pages
- [ ] Check PWA: on mobile Safari, "Add to Home Screen" available
