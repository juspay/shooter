# Comprehensive Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all build failures, security vulnerabilities, dead code, and quality issues found during project analysis.

**Architecture:** 8 sequential tasks touching build system, server modules, API endpoints, hook system, iOS app, and frontend components. Each task is self-contained and produces a working build after completion.

**Tech Stack:** SvelteKit, TypeScript, type-crafter (YAML→TS), Node.js (CJS), Swift/SwiftUI

---

## File Structure

### Files to DELETE

- `src/lib/modules/server/apn/apns.ts` — legacy debug APNs implementation
- `src/lib/modules/server/apn/modern-apns.ts` — prototype per-request HTTP/2
- `src/lib/modules/server/apn/direct-apns.ts` — prototype persistent HTTP/2
- `src/routes/api/debug-simple/+server.ts` — unauthenticated info leak
- `src/routes/api/debug-env/+server.ts` — hardcoded credential
- `src/routes/api/debug-apns/+server.ts` — uses wrong APNs service
- `src/routes/api/debug-notifications/+server.ts` — uses wrong APNs service

### Files to CREATE

- `.env.example` — placeholder environment variables
- `src/routes/api/debug/+server.ts` — consolidated debug endpoint

### Files to MODIFY

- `specs/types/cli.yaml` — fix broken $ref
- `src/lib/modules/server/apn/types.ts` — add `category` field
- `src/lib/modules/server/apn/library-apns.ts` — fix return type
- `src/routes/api/response/+server.ts` — remove `test-key` fallback
- `src/routes/api/health/+server.ts` — fix production flag, version
- `.claude/hooks/notifier.cjs` — fix stdout pollution, remove hardcoded key, remove dead completion timer code
- `ios/Shooter/Shooter/NotificationManager.swift` — remove hardcoded API key, remove register call
- `ios/Shooter/Shooter/ConfigurationView.swift` — remove hardcoded API key default
- `ios/Shooter/Shooter/Config.swift` — remove `/api/register` endpoint
- `src/lib/modules/client/common/Tag.svelte` — fix variant prop type
- `src/lib/modules/client/common/EmptyState.svelte` — widen icon prop type
- `src/routes/+page.svelte` — extract shared Config type
- `src/routes/config/+page.svelte` — use shared Config type
- `CLAUDE.md` — add documentation for limitations

---

## Chunk 1: Build & Type System Fixes

### Task 1: Fix type-crafter YAML spec

**Files:**

- Modify: `specs/types/cli.yaml:40`

- [ ] **Step 1: Fix the broken $ref in cli.yaml**

Change line 40 from self-referencing `$ref` to full path:

```yaml
# Before (line 40):
      $ref: '#/CLI/Options'
# After:
      $ref: './specs/types/cli.yaml#/CLI/Options'
```

- [ ] **Step 2: Regenerate types**

Run: `pnpm run gen:types`
Expected: Success — types generated, linted, and formatted

- [ ] **Step 3: Verify generated output**

Run: `ls src/generated/types/`
Expected: `APN.ts`, `CLI.ts`, `JWT.ts`, `index.ts` — all freshly generated

- [ ] **Step 4: Commit**

```bash
git add specs/types/cli.yaml src/generated/types/
git commit -m "fix: repair cli.yaml \$ref for type-crafter generation"
```

---

### Task 2: Fix TypeScript errors in library-apns.ts and types.ts

**Files:**

- Modify: `src/lib/modules/server/apn/types.ts:11-18`
- Modify: `src/lib/modules/server/apn/library-apns.ts:58`

- [ ] **Step 1: Add `category` to NotificationPayload in types.ts**

```typescript
// src/lib/modules/server/apn/types.ts — replace NotificationPayload interface
export interface NotificationPayload {
  badge: null | number;
  body: null | string;
  category?: null | string;
  data: null | Record<string, unknown>;
  message: null | string;
  sound: null | string;
  title: string;
}
```

- [ ] **Step 2: Fix return type in library-apns.ts**

Change line 58 from `APNsNotificationResult` (undefined) to a concrete inline return type:

```typescript
// src/lib/modules/server/apn/library-apns.ts line 55-58
// Before:
  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsNotificationResult> {

// After:
  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<{ details?: unknown[]; error?: string; failed: number; sent: number; success: boolean }> {
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm run check`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/modules/server/apn/types.ts src/lib/modules/server/apn/library-apns.ts
git commit -m "fix: resolve TypeScript errors in APNs types and library-apns"
```

---

### Task 3: Fix formatting across all files

**Files:**

- All 19 files flagged by `pnpm run format:check`

- [ ] **Step 1: Run formatter**

Run: `pnpm run format`
Expected: 19 files reformatted

- [ ] **Step 2: Verify format check passes**

Run: `pnpm run format:check`
Expected: All files pass

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: fix formatting across 19 files"
```

---

## Chunk 2: Delete Legacy APNs & Debug Endpoints

### Task 4: Delete legacy APNs implementations and old debug endpoints

**Files:**

- Delete: `src/lib/modules/server/apn/apns.ts`
- Delete: `src/lib/modules/server/apn/modern-apns.ts`
- Delete: `src/lib/modules/server/apn/direct-apns.ts`
- Delete: `src/routes/api/debug-simple/+server.ts` (and parent dir)
- Delete: `src/routes/api/debug-env/+server.ts` (and parent dir)
- Delete: `src/routes/api/debug-apns/+server.ts` (and parent dir)
- Delete: `src/routes/api/debug-notifications/+server.ts` (and parent dir)
- Create: `src/routes/api/debug/+server.ts`

- [ ] **Step 1: Delete the 3 legacy APNs files**

```bash
rm src/lib/modules/server/apn/apns.ts
rm src/lib/modules/server/apn/modern-apns.ts
rm src/lib/modules/server/apn/direct-apns.ts
```

- [ ] **Step 2: Delete the 4 old debug endpoint directories**

```bash
rm -rf src/routes/api/debug-simple
rm -rf src/routes/api/debug-env
rm -rf src/routes/api/debug-apns
rm -rf src/routes/api/debug-notifications
```

- [ ] **Step 3: Create consolidated `/api/debug` endpoint**

Create `src/routes/api/debug/+server.ts`:

```typescript
import { env } from '$env/dynamic/private';
import { LibraryAPNsService } from '$lib/modules/server/apn/library-apns';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

function validateAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const apiKey = authHeader.substring(7);
  const expectedKey = env.API_KEY?.trim();
  if (!expectedKey) {
    return false;
  }
  return apiKey === expectedKey;
}

export const GET: RequestHandler = ({ request }) => {
  if (!validateAuth(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apnsClient = new LibraryAPNsService();
  const deviceToken = env.DEVICE_TOKEN?.trim();

  return json({
    apns: {
      configured: apnsClient.isConfigured(),
      environment: env.APNS_PRODUCTION === 'true' ? 'production' : 'sandbox',
      hasBundleId: !!env.APNS_BUNDLE_ID,
      hasKey: !!env.APNS_KEY,
      hasKeyId: !!env.APNS_KEY_ID,
      hasTeamId: !!env.APNS_TEAM_ID,
    },
    deviceToken: {
      exists: !!deviceToken,
      length: deviceToken ? deviceToken.length : 0,
      valid: deviceToken ? /^[a-f0-9]{64}$/i.test(deviceToken) : false,
    },
    environment: env.NODE_ENV || 'development',
    hasApiKey: !!env.API_KEY,
    timestamp: new Date().toISOString(),
  });
};
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm run check && pnpm run build`
Expected: No errors — deleted files have no remaining imports

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete legacy APNs implementations, consolidate debug endpoints"
```

---

## Chunk 3: Security Fixes

### Task 5: Remove all hardcoded secrets and add .env.example

**Files:**

- Create: `.env.example`
- Modify: `src/routes/api/response/+server.ts:13`
- Modify: `.claude/hooks/notifier.cjs:44`
- Modify: `ios/Shooter/Shooter/NotificationManager.swift:14`
- Modify: `ios/Shooter/Shooter/ConfigurationView.swift:250`
- Modify: `ios/Shooter/Shooter/Config.swift:11`
- Modify: `src/routes/api/health/+server.ts:45,50`

- [ ] **Step 1: Create .env.example**

```bash
# .env.example
# Copy this to .env and fill in real values

# Authentication
API_KEY=your-api-key-here

# Apple Push Notification Service
APNS_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----
APNS_KEY_ID=YOUR_KEY_ID
APNS_TEAM_ID=YOUR_TEAM_ID
APNS_BUNDLE_ID=your.bundle.id
APNS_PRODUCTION=false

# iOS Device
DEVICE_TOKEN=your-64-char-hex-device-token

# Hook Configuration (set in .claude/settings.json command strings)
# SHOOTER_USE_LOCAL=true
# SHOOTER_LOCAL_PORT=5175
# SHOOTER_API_KEY=your-api-key-here
# SHOOTER_PERMISSION_TIMEOUT=120
```

- [ ] **Step 2: Fix /api/response — remove `test-key` fallback**

In `src/routes/api/response/+server.ts`, change line 13:

```typescript
// Before:
const expectedKey = (env.API_KEY || 'test-key').trim();

// After:
const expectedKey = env.API_KEY?.trim();
if (!expectedKey) {
  return false;
}
```

- [ ] **Step 3: Fix notifier.cjs — remove hardcoded `YOUR_API_KEY` fallback**

In `.claude/hooks/notifier.cjs`, change line 44:

```javascript
// Before:
const AUTH_KEY = API_KEY || 'YOUR_API_KEY';

// After:
const AUTH_KEY = API_KEY || '';
```

And update the validation at line 47-49:

```javascript
// Before:
if (IS_CLAUDE_CODE && !API_KEY && !USE_LOCAL) {
  console.error('SHOOTER_API_KEY environment variable is required');
  process.exit(1);
}

// After:
if (IS_CLAUDE_CODE && !API_KEY) {
  console.error('SHOOTER_API_KEY environment variable is required');
  process.exit(1);
}
```

- [ ] **Step 4: Fix iOS NotificationManager.swift — remove hardcoded API key**

In `ios/Shooter/Shooter/NotificationManager.swift`, change line 14:

```swift
// Before:
    private var apiKey: String = "YOUR_API_KEY"

// After:
    private var apiKey: String = ""
```

- [ ] **Step 5: Fix iOS ConfigurationView.swift — remove hardcoded API key default**

In `ios/Shooter/Shooter/ConfigurationView.swift`, change line 250:

```swift
// Before:
            apiKey = "YOUR_API_KEY" // Smart default for local development

// After:
            apiKey = "" // User must configure via settings
```

- [ ] **Step 6: Fix iOS Config.swift — remove nonexistent `/api/register` endpoint**

In `ios/Shooter/Shooter/Config.swift`, delete line 11:

```swift
// Delete this line:
        static let register = "/api/register"
```

- [ ] **Step 7: Fix /api/health — use APNS_PRODUCTION instead of NODE_ENV for production flag**

In `src/routes/api/health/+server.ts`:

```typescript
// Line 45 — Before:
      production: env.NODE_ENV === 'production',

// After:
      production: env.APNS_PRODUCTION === 'true',
```

Also update the hardcoded version (line 50):

```typescript
// Before:
    version: '1.0.7-dedup',

// After:
    version: '1.1.0',
```

- [ ] **Step 8: Verify build**

Run: `pnpm run check && pnpm run build`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add .env.example src/routes/api/response/+server.ts .claude/hooks/notifier.cjs src/routes/api/health/+server.ts
git commit -m "security: remove all hardcoded secrets, add .env.example, fix auth fallbacks"
```

Note: iOS files should be committed separately if they're in a different workflow, or included here:

```bash
git add ios/Shooter/Shooter/NotificationManager.swift ios/Shooter/Shooter/ConfigurationView.swift ios/Shooter/Shooter/Config.swift
git commit -m "security: remove hardcoded API key from iOS app, remove unused register endpoint"
```

---

## Chunk 4: Hook System Fixes

### Task 6: Fix notifier.cjs — stdout pollution and dead code

**Files:**

- Modify: `.claude/hooks/notifier.cjs`

- [ ] **Step 1: Redirect all console.log to console.error (stderr)**

In `.claude/hooks/notifier.cjs`, replace ALL `console.log(` calls with `console.error(` globally. Claude Code reads stdout for JSON hook responses — any `console.log` output corrupts the JSON.

Search for: `console.log(`
Replace with: `console.error(`

This is a global find-and-replace across the entire file. There should be many instances.

- [ ] **Step 2: Remove dead completion timer code for Claude Code**

The completion timer (45s delay after Stop event) cannot work in Claude Code because each hook invocation is a separate process — the timer fires in an already-exiting process. The relevant code sections to remove or guard:

Find the `scheduleCompletionTimer` function and `checkCompletion` function. Wrap them so they only execute for OpenCode:

```javascript
// At the top of scheduleCompletionTimer function, add:
function scheduleCompletionTimer(sessionId) {
  if (IS_CLAUDE_CODE) {
    // Completion timer cannot work in Claude Code (each hook is a separate process)
    return;
  }
  // ... rest of existing function
}
```

Do the same for `checkCompletion`:

```javascript
function checkCompletion(sessionId) {
  if (IS_CLAUDE_CODE) {
    return;
  }
  // ... rest of existing function
}
```

- [ ] **Step 3: Remove the Vercel URL from REMOTE_BASE_URL default**

Line 36 contains a hardcoded Vercel deployment URL. Replace with empty string so it fails loudly:

```javascript
// Before:
const REMOTE_BASE_URL =
  process.env.SHOOTER_API_URL ||
  'https://your-shooter-app.vercel.app';

// After:
const REMOTE_BASE_URL = process.env.SHOOTER_API_URL || '';
```

And add a guard after BASE_URL:

```javascript
if (!USE_LOCAL && !REMOTE_BASE_URL) {
  console.error(
    'SHOOTER_API_URL environment variable is required when SHOOTER_USE_LOCAL is not true'
  );
  process.exit(1);
}
```

- [ ] **Step 4: Verify the hook still runs**

Run: `echo '{}' | node .claude/hooks/notifier.cjs SessionStart`
Expected: Exits without error (may log to stderr, no stdout JSON corruption)

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/notifier.cjs
git commit -m "fix: redirect hook stdout to stderr, remove dead completion timer for Claude Code"
```

---

## Chunk 5: iOS Fixes

### Task 7: Remove registerWithServer references

**Files:**

- Modify: `ios/Shooter/Shooter/NotificationManager.swift`

- [ ] **Step 1: Remove the `registerWithServer` method**

Delete the entire `registerWithServer(serverUrl:)` method (lines 86-119) from `NotificationManager.swift`. The `/api/register` endpoint doesn't exist on the server.

- [ ] **Step 2: Remove the call to registerWithServer in autoSetupForDevelopment**

In `autoSetupForDevelopment()` (around line 257), remove:

```swift
// Delete this line:
            registerWithServer(serverUrl: serverUrl)
```

- [ ] **Step 3: Remove the call to registerWithServer in updateConfiguration**

In `updateConfiguration(serverUrl:apiKey:)` (around line 287-289), remove:

```swift
// Delete these lines:
        if isAuthorized, deviceToken != nil {
            registerWithServer(serverUrl: serverUrl)
        }
```

- [ ] **Step 4: Verify iOS project builds**

Run: `xcodebuild -project ios/Shooter/Shooter.xcodeproj -scheme Shooter -sdk iphonesimulator build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add ios/Shooter/Shooter/NotificationManager.swift
git commit -m "fix: remove references to nonexistent /api/register endpoint"
```

---

## Chunk 6: Frontend Fixes

### Task 8: Fix frontend type and component issues

**Files:**

- Modify: `src/lib/modules/client/common/Tag.svelte:9`
- Modify: `src/lib/modules/client/common/EmptyState.svelte:9`
- Create: `src/lib/types/config.ts`
- Modify: `src/routes/+page.svelte:30-34`
- Modify: `src/routes/config/+page.svelte:7-11`

- [ ] **Step 1: Fix Tag variant prop type**

In `src/lib/modules/client/common/Tag.svelte`, change line 9:

```typescript
// Before:
    variant?: string;

// After:
    variant?: '' | 'error' | 'info' | 'success' | 'warning';
```

Remove the runtime validation on line 14-15:

```typescript
// Before:
const validVariants = ['', 'error', 'info', 'success', 'warning'];
const variantClass = $derived(validVariants.includes(variant) ? variant : '');

// After:
const variantClass = $derived(variant);
```

- [ ] **Step 2: Widen EmptyState icon prop type**

In `src/lib/modules/client/common/EmptyState.svelte`, change line 9:

```typescript
// Before:
icon: 'bell' | 'settings';

// After:
icon: 'alert-triangle' |
  'bell' |
  'check-circle' |
  'file' |
  'folder' |
  'play' |
  'refresh' |
  'settings' |
  'tool' |
  'x-circle';
```

- [ ] **Step 3: Create shared Config type**

Create `src/lib/types/config.ts`:

```typescript
export interface ShooterConfig {
  apiKey: string;
  deviceToken: string;
  lastUpdated?: number;
}
```

- [ ] **Step 4: Use shared Config type in +page.svelte**

In `src/routes/+page.svelte`, replace lines 30-34:

```typescript
// Before:
interface Config {
  apiKey?: string;
  deviceToken?: string;
  lastUpdated?: number;
}

// After:
import type { ShooterConfig } from '$lib/types/config';
```

And update the usage on line 38:

```typescript
// Before:
let config = $state<Config | null>(null);

// After:
let config = $state<ShooterConfig | null>(null);
```

- [ ] **Step 5: Use shared Config type in config/+page.svelte**

In `src/routes/config/+page.svelte`, replace lines 7-11:

```typescript
// Before:
interface Config {
  apiKey: string;
  deviceToken: string;
  lastUpdated: number;
}

// After:
import type { ShooterConfig } from '$lib/types/config';
```

Update usage to reference `ShooterConfig` instead of `Config` wherever `Config` is used in that file.

- [ ] **Step 6: Verify build**

Run: `pnpm run check && pnpm run build`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/client/common/Tag.svelte src/lib/modules/client/common/EmptyState.svelte src/lib/types/config.ts src/routes/+page.svelte src/routes/config/+page.svelte
git commit -m "fix: deduplicate Config type, fix Tag variant and EmptyState icon prop types"
```

---

## Chunk 7: Documentation

### Task 9: Update CLAUDE.md with limitations and notes

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add known limitations section to CLAUDE.md**

Append the following section to the end of CLAUDE.md:

```markdown
## Known Limitations

### In-Memory Pending Requests Store

The bidirectional permission flow uses an in-memory `Map` in `pending-requests.ts`. This works for single-instance deployments but will break if multiple Vercel serverless instances handle the notify and response endpoints. For multi-instance production use, replace with a shared store (e.g., Upstash Redis).

### Hook Completion Timer

The 45-second completion timer in `notifier.cjs` only works for OpenCode (persistent plugin). For Claude Code, each hook invocation is a separate process, so timers cannot fire across invocations. The code is guarded with `IS_CLAUDE_CODE` checks to skip this path.

### Hook Timeout Mismatch

The `PermissionRequest` hook has a 180-second timeout in `.claude/settings.json`, but the notifier's internal `PERMISSION_TIMEOUT` defaults to 120 seconds. The 60-second buffer ensures the notifier resolves before Claude Code kills the process.

### APNs Environment

The iOS app entitlements declare `aps-environment = production`. The server's `APNS_PRODUCTION` env var controls which APNs gateway is used (default: sandbox). For TestFlight/App Store builds, set `APNS_PRODUCTION=true` in the server environment.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add known limitations section to CLAUDE.md"
```

---

## Final Verification

### Task 10: Full build verification

- [ ] **Step 1: Run all checks**

```bash
pnpm run format:check && pnpm run lint && pnpm run check && pnpm run build
```

Expected: All pass with 0 errors. Lint warnings are acceptable (existing warnings from before this work).

- [ ] **Step 2: Verify gen:types works**

```bash
pnpm run gen:types
```

Expected: Types regenerated successfully

- [ ] **Step 3: Test dev server starts**

```bash
# Start server, hit health endpoint, verify response, kill server
timeout 10 pnpm run dev &
sleep 5
curl -s http://localhost:5173/api/health | head -1
kill %1 2>/dev/null
```

Expected: JSON response with `"status":"healthy"` or `"status":"degraded"`
