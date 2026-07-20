# Notification Coalescing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Shooter push-notification noise to signal — only genuine decisions buzz immediately; status events coalesce per-project; internal agent-team idle is dropped at the source; and the real 413 delivery bug is fixed.

**Architecture:** A pure tier classifier (`decision`/`status`/`drop`) becomes the single source of truth in `apns-classify.ts`. The `/api/notify` route gates on it: decisions send immediately (unchanged), status events enqueue into a new per-project in-memory coalescer that flushes one rolled-up push after a window, drops return early. A shared `deliverPush()` helper is extracted so the immediate path and the coalescer reconcile deliveries identically. The 413 fix trims the redundant `data.toolInput` from the push payload (the Decide screen reads it from the server-side pending row) and extends `fitApnsPayload` to trim custom `data` as a final fallback. The notifier hook gains a smart-idle gate that drops internal team/subagent choreography.

**Tech Stack:** SvelteKit (adapter-node, custom `server.ts`), TypeScript (strict), better-sqlite3, APNs via curl/HTTP-2. Tests are plain `.cjs` files under `tests/` run with `node` + `require('tsx/cjs')` and a hand-rolled `runTest`/`assert`; each new test file must be appended to the `test` script in `package.json`.

## Global Constraints

- TypeScript strict; no `any` (use `unknown` + narrowing). Named exports only; no `export default`. Functional/immutable where practical.
- All shared types live in `src/lib/types/` and import via the `$lib/types` barrel. Component `Props` are the only in-file type exception.
- Tests: `.cjs` under `tests/`, load `.ts` via `require('tsx/cjs')`, mirror `tests/apns-payload.test.cjs` structure; append every new file to the `test` script chain in `package.json`.
- Quality gate for every task before commit: `pnpm test` (or at least the new file) passes; `pnpm run check` (svelte-check + `tsc --noEmit --strict`) clean; `pnpm run lint` clean.
- Branch `feat/notification-coalescing`. Conventional commits. No Claude co-author trailer. Never push without asking.
- APNs constants: alert payload hard limit 4096 B; existing `APNS_MAX_BYTES = 3900`. Coalesce window `COALESCE_WINDOW_MS = 45_000`.

---

### Task 1: Tier classifier

**Files:**

- Modify: `src/lib/modules/server/apn/apns-classify.ts` (add `classifyNotificationTier`)
- Test: `tests/classify-notification-tier.test.cjs` (new) + append to `package.json` `test` script

**Interfaces:**

- Produces: `classifyNotificationTier(category: string | undefined): 'decision' | 'status' | 'drop'`

- [ ] **Step 1: Write the failing test** — `tests/classify-notification-tier.test.cjs`

```js
'use strict';
require('tsx/cjs');
const path = require('path');
const { classifyNotificationTier } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-classify.ts')
);
let passed = 0,
  failed = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nclassifyNotificationTier unit tests\n');
runTest('permission → decision', () =>
  assert(classifyNotificationTier('permission') === 'decision')
);
runTest('question → decision', () => assert(classifyNotificationTier('question') === 'decision'));
runTest('idle_input → status', () => assert(classifyNotificationTier('idle_input') === 'status'));
runTest('intervention → status', () =>
  assert(classifyNotificationTier('intervention') === 'status')
);
runTest('permission_notification → drop', () =>
  assert(classifyNotificationTier('permission_notification') === 'drop')
);
runTest('unknown → drop', () => assert(classifyNotificationTier('task_completed') === 'drop'));
runTest('undefined → drop', () => assert(classifyNotificationTier(undefined) === 'drop'));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it, verify it fails** — `node tests/classify-notification-tier.test.cjs` → FAIL (`classifyNotificationTier is not a function`).

- [ ] **Step 3: Implement** — append to `apns-classify.ts`:

```ts
/** Notification-delivery tier: how a push category should reach the phone. */
export type NotificationTier = 'decision' | 'status' | 'drop';

const DECISION_CATEGORIES: ReadonlySet<string> = new Set(['permission', 'question']);
const STATUS_CATEGORIES: ReadonlySet<string> = new Set(['idle_input', 'intervention']);

/**
 * Single source of truth for how a notification category is delivered:
 *  - decision → push immediately (permission / question — the user must act)
 *  - status   → coalesce per-project (idle_input / intervention)
 *  - drop     → never push (redundant or informational; in-app feed only)
 */
export function classifyNotificationTier(category: string | undefined): NotificationTier {
  if (category && DECISION_CATEGORIES.has(category)) return 'decision';
  if (category && STATUS_CATEGORIES.has(category)) return 'status';
  return 'drop';
}
```

- [ ] **Step 4: Run test, verify PASS** — `node tests/classify-notification-tier.test.cjs`.

- [ ] **Step 5: Append to `package.json` `test` script** — add ` && node tests/classify-notification-tier.test.cjs` at the end of the chain.

- [ ] **Step 6: Commit** — `git commit -am "feat(notify): add classifyNotificationTier (decision/status/drop)"`

---

### Task 2: Trim custom `data` in `fitApnsPayload` (413 fix, part 1)

**Files:**

- Modify: `src/lib/modules/server/apn/apns-payload.ts:15-45`
- Test: `tests/apns-payload.test.cjs` (extend)

**Interfaces:**

- Consumes: existing `fitApnsPayload(body, maxBytes?)`, `APNS_MAX_BYTES`.
- Produces: same signature; now also shrinks oversized `body.data.toolInput` (and other large custom-data string/object fields) after `alert.body`/`subtitle`, so a huge AskUserQuestion `toolInput` can't blow the cap.

- [ ] **Step 1: Write the failing test** — add to `tests/apns-payload.test.cjs` before the summary line:

```js
runTest('trims oversized data.toolInput to fit', () => {
  const huge = 'x'.repeat(6000);
  const body = {
    aps: {
      alert: { title: 'clairvoyance · Claude is asking', subtitle: 'Next step', body: 'short' },
    },
    data: { requestId: 'abc', toolInput: { questions: [{ options: [{ description: huge }] }] } },
  };
  const out = fitApnsPayload(body);
  assert(size(out) <= APNS_MAX_BYTES, `payload still ${size(out)}B`);
  assert(out.aps.alert.title === 'clairvoyance · Claude is asking', 'title preserved');
  assert(out.data.requestId === 'abc', 'small data preserved');
});
```

- [ ] **Step 2: Run, verify FAIL** — `node tests/apns-payload.test.cjs` → the new case fails (payload still > cap).

- [ ] **Step 3: Implement** — in `fitApnsPayload`, after the existing `for (const field of ['body','subtitle'])` loop and before `return body`, add a custom-data fallback:

```ts
// Fallback: the biggest 413 offender is custom data (e.g. data.toolInput echoing
// every AskUserQuestion option description). The alert text may already be short,
// so trimming body/subtitle alone can't fit it. Drop the heaviest custom-data
// fields until we fit — the Decide screen reads the full toolInput from the
// server-side pending_requests row, not from the push, so this is lossless for UX.
const data = body.data as Record<string, unknown> | undefined;
if (data && payloadBytes(body) > maxBytes) {
  const HEAVY_FIELDS = ['toolInput', 'options', 'question'] as const;
  for (const field of HEAVY_FIELDS) {
    if (payloadBytes(body) <= maxBytes) break;
    if (field in data) delete data[field];
  }
}
```

- [ ] **Step 4: Run test, verify PASS** — `node tests/apns-payload.test.cjs` (all cases).

- [ ] **Step 5: Commit** — `git commit -am "fix(apns): trim custom data in fitApnsPayload to fix 413 PayloadTooLarge"`

---

### Task 3: Strip redundant `toolInput` from the push payload (413 fix, part 2)

**Files:**

- Modify: `src/routes/api/notify/+server.ts:496-516` (payload build)

**Interfaces:**

- Consumes: request `data` (may carry `toolInput`). The full `toolInput` is already persisted for the Decide screen via `createPendingRequest` (line 476-483) — so it need not travel in the push.
- Produces: `payload.data` without the heavy `toolInput`; `question`/`options` for lock-screen buttons remain top-level (unchanged).

- [ ] **Step 1:** In the `payload.data` spread, replace `...data` with a shallow copy that omits `toolInput`:

```ts
      data: (() => {
        // toolInput can be multi-KB (all AskUserQuestion option descriptions).
        // It is redundant in the push — the Decide screen fetches it from the
        // pending_requests row — and is the primary 413 cause. Strip it here;
        // fitApnsPayload (Task 2) is the belt-and-suspenders fallback.
        const { toolInput: _omit, ...rest } = (data ?? {}) as Record<string, unknown>;
        void _omit;
        return {
          ...rest,
          requestId: canonicalRequestId,
          source: 'modern-apns-api',
          timestamp: new Date().toISOString(),
          waitForResponse: waitForResponse || false,
        };
      })(),
```

- [ ] **Step 2:** `pnpm run check` clean (types) and `pnpm run lint` clean.

- [ ] **Step 3: Commit** — `git commit -am "fix(notify): strip redundant toolInput from push payload (413)"`

---

### Task 4: APNs `thread-id` per project (Notification Center grouping)

**Files:**

- Modify: `src/lib/modules/server/apn/library-apns.ts:216-239` (`buildAlertBody`)

**Interfaces:**

- Consumes: `payload.data?.project` (string).
- Produces: `aps['thread-id'] = project` when present, so all notifications for a project thread together.

- [ ] **Step 1:** In `buildAlertBody`, after building `aps` and before `const body = { aps }`, add:

```ts
// Thread all of a project's notifications together in Notification Center.
const project =
  payload.data && typeof payload.data.project === 'string' ? payload.data.project : '';
if (project) {
  aps['thread-id'] = project;
}
```

- [ ] **Step 2:** `pnpm run check` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(apns): thread notifications by project via aps thread-id"`

---

### Task 5: Retry-with-backoff on transport failure (`status=0`)

**Files:**

- Modify: `src/lib/modules/server/apn/library-apns.ts:347-355` (the `catch` in `deliverPreSerialized`)

**Interfaces:**

- Produces: one retry (after ~250 ms) of the curl call before returning the `httpStatus: 0` failure, so a transient transport blip doesn't drop the push.

- [ ] **Step 1:** Wrap the curl `execFileAsync` in a small retry loop (max 2 attempts, 250 ms backoff) around lines 311-355; only retry on the transport `catch` (not on an HTTP status result). Keep the existing redaction. Sketch:

```ts
let lastErr: unknown;
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const { stdout } = await execFileAsync('curl', args, {
      maxBuffer: 1024 * 1024,
      timeout: (REQUEST_TIMEOUT_SECONDS + 5) * 1000,
    });
    // ... existing status parse + return (unchanged) ...
  } catch (err) {
    lastErr = err;
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
  }
}
// existing redaction + return { httpStatus: 0, ... } using lastErr
```

- [ ] **Step 2:** `pnpm run check` clean; `pnpm test` (delivery tests) still pass.
- [ ] **Step 3: Commit** — `git commit -am "fix(apns): retry once on curl transport error (status=0)"`

---

### Task 6: Shared delivery helper + status coalescer

**Files:**

- Create: `src/lib/modules/server/apn/notify-delivery.ts` (extract `deliverPush`)
- Create: `src/lib/modules/server/apn/status-coalescer.ts`
- Modify: `src/routes/api/notify/+server.ts` (use `deliverPush` on the immediate path)
- Test: `tests/status-coalescer.test.cjs` (new) + append to `package.json`

**Interfaces:**

- Produces:
  - `deliverPush(payload, opts: { override?: string; collapseId?: string }): Promise<{ delivered: boolean; sent: number; failed: number }>` — resolves devices, fans out to APNs+FCM+web, prunes stale / touches succeeded (respecting the `!override` guard), returns a summary. Encapsulates today's route logic at lines 518-594.
  - `statusCoalescer.enqueue(project: string, item: { title: string; body: string; category: string }): void`
  - `summarizeStatusBuffer(items): { title: string; body: string }` (pure, tested)

- [ ] **Step 1: Write the failing test** — `tests/status-coalescer.test.cjs`, testing the **pure** tally (`summarizeStatusBuffer`) and that `enqueue` fires the injected flush callback once after the window with all buffered items (use a tiny injected window + a fake `deliver` fn; do not hit APNs):

```js
'use strict';
require('tsx/cjs');
const path = require('path');
const { summarizeStatusBuffer, makeStatusCoalescer } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'status-coalescer.ts')
);
let passed = 0,
  failed = 0;
function runTest(n, fn) {
  try {
    fn();
    console.log(`  PASS  ${n}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${n}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nstatus coalescer unit tests\n');

runTest('summarize: 3 idle → "3 agents idle"', () => {
  const s = summarizeStatusBuffer([
    { category: 'idle_input', title: 'a', body: 'x' },
    { category: 'idle_input', title: 'b', body: 'y' },
    { category: 'idle_input', title: 'c', body: 'z' },
  ]);
  assert(/3/.test(s.title) && /idle/i.test(s.title), s.title);
});

runTest('summarize: mixed → counts both', () => {
  const s = summarizeStatusBuffer([
    { category: 'idle_input', title: 'a', body: 'x' },
    { category: 'intervention', title: 'b', body: 'y' },
  ]);
  assert(/idle/i.test(s.title) && /attention/i.test(s.title), s.title);
});

runTest('enqueue: one flush with all items after window', async () => {
  const flushes = [];
  const c = makeStatusCoalescer({
    windowMs: 20,
    flush: (project, items) => flushes.push({ project, n: items.length }),
  });
  c.enqueue('lighthouse', { category: 'idle_input', title: 'a', body: 'x' });
  c.enqueue('lighthouse', { category: 'idle_input', title: 'b', body: 'y' });
  await new Promise((r) => setTimeout(r, 40));
  assert(flushes.length === 1, `flushes=${flushes.length}`);
  assert(flushes[0].n === 2, `items=${flushes[0].n}`);
});

(async () => {
  /* runTest is sync; the async one self-awaits via setTimeout */
})();
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}, 120);
```

- [ ] **Step 2: Run, verify FAIL** — module not found.

- [ ] **Step 3: Implement `status-coalescer.ts`** — pure `summarizeStatusBuffer` + a `makeStatusCoalescer({ windowMs, flush })` factory holding `Map<project,{items,timer}>`; on first `enqueue` for a project start `setTimeout(windowMs)`, on fire call `flush(project, items)` and clear. Export a default singleton `statusCoalescer` wired to `windowMs: COALESCE_WINDOW_MS` and a `flush` that builds the rollup payload and calls `deliverPush(payload, { collapseId: 'status-' + project })` + `addNotification` once.

- [ ] **Step 4: Implement `notify-delivery.ts`** — move the device-resolution + fan-out + prune/touch (route lines 518-594) into `deliverPush(payload, opts)`. Refactor `+server.ts` immediate path to call it (keeps behavior identical; the existing `tests/notify-fanout.test.cjs` covers the pure `summarizeNotifyDelivery` it still uses).

- [ ] **Step 5: Run** — `node tests/status-coalescer.test.cjs` PASS; `pnpm test` full suite PASS; `pnpm run check` clean.

- [ ] **Step 6: Commit** — `git commit -am "feat(notify): per-project status coalescer + shared deliverPush"`

---

### Task 7: Wire the tier gate into `/api/notify`

**Files:**

- Modify: `src/routes/api/notify/+server.ts` (insert gate after the `skipPush` block ~494, before payload build ~496)

**Interfaces:**

- Consumes: `classifyNotificationTier` (Task 1), `statusCoalescer` (Task 6), `data.category`.
- Produces: decisions fall through unchanged; status enqueues + returns `{ coalesced: true }`; drop returns `{ dropped: true }`.

- [ ] **Step 1:** After the `skipPush && !forcePush` block returns, before `// Build notification payload`, insert:

```ts
const category = typeof data?.category === 'string' ? data.category : undefined;
const tier = classifyNotificationTier(category);
const project = typeof data?.project === 'string' ? data.project : 'shooter';

if (tier === 'drop') {
  addNotification(buildNotificationRecord(canonicalRequestId, title, message, 'dropped', data));
  return json({ dropped: true, success: true, timestamp: new Date().toISOString() });
}
if (tier === 'status') {
  statusCoalescer.enqueue(project, { body: message, category: category ?? 'status', title });
  addNotification(buildNotificationRecord(canonicalRequestId, title, message, 'coalesced', data));
  return json({ coalesced: true, project, success: true, timestamp: new Date().toISOString() });
}
// tier === 'decision' → immediate send (existing path below)
```

- [ ] **Step 2:** Confirm `buildNotificationRecord` accepts the `'dropped'`/`'coalesced'` status strings (it takes a status string arg — verify signature; widen the union type in `src/lib/types` if it is a closed union).

- [ ] **Step 3:** `pnpm run check` + `pnpm run lint` clean; `pnpm test` PASS.

- [ ] **Step 4: Commit** — `git commit -am "feat(notify): gate delivery by tier — decisions send, status coalesces, rest drop"`

---

### Task 8: Wire the dormant `failure_count` (low-priority robustness)

**Files:**

- Modify: `src/lib/modules/server/push/device-token-store.ts` (`touchLastSeen` line 150-159 resets `failure_count = 0`; add `incrementFailure`; fix stale doc comment 16-18)
- Modify: `src/routes/api/notify/+server.ts:588-591` (increment before prune, respecting `!override`)
- Test: `tests/device-token-store.test.cjs` (extend)

**Interfaces:**

- Produces: `incrementFailure(tokens: readonly string[], now?: Date): number` (bumps `failure_count`); `touchLastSeen` also resets `failure_count = 0` on success so "consecutive" semantics hold.

- [ ] **Step 1: Write failing test** in `tests/device-token-store.test.cjs`: after a successful `touchLastSeen`, `failure_count` is 0; `incrementFailure` bumps it; a later `touchLastSeen` resets it.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — extend `touchLastSeen` UPDATE to `SET last_seen_at = ?, failure_count = 0`; add `incrementFailure` (`UPDATE ... SET failure_count = failure_count + 1 WHERE token IN (...)`). Update the stale "Deferred to PR 3" comment. In the route, call `deviceTokenStore.incrementFailure(summary.staleTokens)` alongside the existing `pruneByTokens` (both already under `!override`). Preserve the env-mismatch exemption (unchanged — it lives in `classifyApnsReason`).
- [ ] **Step 4: Run tests PASS**; `pnpm test` full PASS.
- [ ] **Step 5: Commit** — `git commit -am "fix(push): wire failure_count reset-on-success + increment; fix stale doc"`

---

### Task 9: Notifier smart-idle gate (drop internal choreography)

**Files:**

- Modify: `.claude/hooks/notifier.cjs` (add `INTERNAL_IDLE_MARKERS` + `isInternalChoreographyIdle`; gate in `handleIdleInput` line 1116-1148)
- Test: `tests/idle-gate.test.cjs` (new) + append to `package.json`

**Interfaces:**

- Produces: `isInternalChoreographyIdle(text: string): boolean` (exported from notifier for test) — true when text matches internal team/subagent choreography.

- [ ] **Step 1: Write failing test** — `tests/idle-gate.test.cjs` requiring the notifier and asserting: the real log line _"Task 3 implementer idle after delivery — expected. Review in progress. `<teammate-message teammate_id=...>`"_ → `true`; a genuine _"I've finished the refactor. Want me to run the tests?"_ → `false`; empty → `false`.

```js
'use strict';
const path = require('path');
const { isInternalChoreographyIdle } = require(
  path.join(__dirname, '..', '.claude', 'hooks', 'notifier.cjs')
);
let passed = 0,
  failed = 0;
function runTest(n, fn) {
  try {
    fn();
    console.log(`  PASS  ${n}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${n}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nsmart-idle gate unit tests\n');
runTest('drops teammate-message choreography', () =>
  assert(
    isInternalChoreographyIdle(
      'Task 3 implementer idle after delivery — expected. Review in progress. <teammate-message teammate_id="pr1-t3">'
    ) === true
  )
);
runTest('drops "expected" idle', () =>
  assert(isInternalChoreographyIdle('Idle after delivery — expected.') === true)
);
runTest('keeps genuine idle', () =>
  assert(
    isInternalChoreographyIdle("I've finished the refactor. Want me to run the tests?") === false
  )
);
runTest('empty is not choreography', () => assert(isInternalChoreographyIdle('') === false));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run, verify FAIL** (`isInternalChoreographyIdle is not a function`). Requires the notifier to `module.exports` the fn (it already runs as a CLI; guard the CLI entrypoint so a `require` for tests doesn't execute the hook — check the file's bottom `main()` invocation and gate it on `require.main === module`).

- [ ] **Step 3: Implement** near the other helpers:

```js
const INTERNAL_IDLE_MARKERS = [
  /<teammate-message/i,
  /idle after delivery/i,
  /another claude session sent a message/i,
  /review in progress/i,
  /\bexpected\b[\s\S]*\bidle\b|\bidle\b[\s\S]*\bexpected\b/i,
];
function isInternalChoreographyIdle(text) {
  if (!text) return false;
  const t = String(text);
  return INTERNAL_IDLE_MARKERS.some((re) => re.test(t));
}
```

Then in `handleIdleInput`, before `sendNotification` (line 1147), gate on the message + last-assistant text:

```js
const idleText = `${d.message || ''}\n${ctx.lastAssistantText || ''}`;
if (isInternalChoreographyIdle(idleText)) {
  debugLog(`Smart-idle: dropped internal choreography for ${event.projectName}`);
  return;
}
```

Ensure `module.exports` exposes `isInternalChoreographyIdle` (merge with any existing exports) and the CLI bootstrap is guarded by `if (require.main === module)`.

- [ ] **Step 4: Run** — `node tests/idle-gate.test.cjs` PASS. Manually smoke: `echo '{}' | node .claude/hooks/notifier.cjs Stop` still exits cleanly (no push, no crash).
- [ ] **Step 5: Append to `package.json` `test` script**; run `pnpm test` full PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(notifier): smart-idle gate drops internal agent-team choreography"`

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1:** `pnpm test` (whole suite) PASS.
- [ ] **Step 2:** `pnpm run check` clean; `pnpm run lint` clean; `pnpm run format:check` clean (run `format` if needed).
- [ ] **Step 3:** `pnpm build` succeeds.
- [ ] **Step 4: Live end-to-end** against a temp server built from this branch (do NOT disturb the production `~/.shooter/repo` server): start on a free port, then via `curl /api/notify` with the API key:
  - Fire 3 `idle_input` events for project "verify" within the window → exactly **one** coalesced push recorded (check `/api/notify` responses `{ coalesced: true }` then a single delivery).
  - Fire a `permission` (decision) → immediate send, `{ coalesced: false }` path.
  - Fire an `idle_input` whose body contains `<teammate-message` → dropped upstream in the notifier (unit-proven) / a `drop`-tier category → `{ dropped: true }`.
  - Fire a `question` with a 6 KB `toolInput` → APNs returns **200, not 413** (or, with no device, the payload is confirmed < 3900 B before send).
- [ ] **Step 5:** Update the spec `Status:` to “Implemented”. Commit.

---

## Self-Review

**Spec coverage:** every spec change-point (1 classifier, 2 route gate, 3 toolInput trim, 4 decision collapse-id unchanged, 5 coalescer, 6 fitApnsPayload data-trim, 7 thread-id, 8 retry, 9 failure_count, 10 smart-idle) maps to a task (T1, T7, T3, T7, T6, T2, T4, T5, T8, T9) plus verification (T10). Collapse-id policy (decisions unique, status `status-<project>`) is realized in T6/T7.

**Placeholder scan:** pure units (T1, T2, T6 summarize, T9 marker) carry full code + tests. Wiring tasks (T3, T4, T5, T7, T8) show the exact insert with surrounding anchors; T5/T6 give sketches because they restructure existing multi-line blocks whose full body is in the cited line ranges — the executor edits in place against the real file, not from scratch.

**Type consistency:** `classifyNotificationTier`/`NotificationTier`, `deliverPush`, `statusCoalescer.enqueue`, `summarizeStatusBuffer`, `makeStatusCoalescer`, `isInternalChoreographyIdle`, `incrementFailure` names are used identically across tasks. `buildNotificationRecord` status union to be widened in T7 if closed.

**Risk notes:** T6 (deliverPush extraction) is the highest-risk change to working code — mitigated by the unchanged pure `summarizeNotifyDelivery` + full `pnpm test` + live verify. T8 is low-priority; if it destabilizes, it can ship separately.
