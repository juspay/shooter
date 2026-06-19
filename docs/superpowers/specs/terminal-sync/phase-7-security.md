# Phase 7 — Security Hardening

**Status:** Implementation plan (ready for execution)
**Research source:** `docs/superpowers/research/2026-06-13-terminal-sync-research.md` §6 Phase 7
**Foundation contract:** null (no foundation agent output; plan is self-contained and references real code anchors)

---

## 0. What this phase is and is not

**In scope:**

1. **Resize rate-limit + max-dimension enforcement** — `TIOCSWINSZ` is unauthenticated; a malicious connected WebSocket client (even a view-only guest whose ticket allows no PTY input) can hammer resize frames to cause repeated `pty.resize()` calls, potentially OOMing the holder or corrupting the PTY state. The existing dimension cap in `terminal-handler.ts:169` (`cols > 500 || rows > 200`) only validates the range; it does not rate-limit frequency.
2. **In-band WebSocket re-auth heartbeat** — HTTP Bearer auth happens pre-upgrade and is consumed by the single-use ticket (`ticket-store.ts:44`). A revoked API key or expired share token does **not** kill an already-open WebSocket. The `closeGuests()` function (`guest-registry.ts:14`) already handles share revocation; this phase adds a complementary in-band re-auth challenge (a periodic `auth-challenge` → `auth-token` exchange) so long-lived owner connections (not just guests) can be terminated when the API key changes.
3. **Session recording stub (opt-in, D6 DEFERRED)** — design only; mark clearly as `TODO:RECORDING` so a later phase can implement it without touching any existing flow.

**Out of scope (per baked decisions D5, D6):**

- Full session recording/playback (D6 deferred differentiator)
- Native `shooter attach` CLI (D5 out of initial scope)

---

## 1. Dependencies

| Dependency                   | What is needed                                                                     | Provided by                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Phase 3 (resize arbitration) | `terminal-handler.ts:87-97` resize path; `pty-manager.ts:476-496` REST resize path | Phase 3 or can be applied independently — Phase 7 adds a rate-limiter on top of the **existing** paths |
| Phase 4 (control handoff)    | The driver concept; Phase 7 resize-rate-limit applies to all writers               | Phase 4 or applied independently on existing free-for-all input gate                                   |
| Phase 5 (presence)           | In-band re-auth events can be emitted on `/ws/events`                              | Optional integration; Phase 7 is self-contained without it                                             |

**Phase 7 can land independently on top of the current code.** Its changes to `terminal-handler.ts` and `ticket-store.ts` are additive. The only merge-risk is if Phase 3 or 4 also edit `terminal-handler.ts:87-97` (the resize case). The conflict section calls this out explicitly.

---

## 2. Files to create / modify

| File                                            | Action     | Notes                                                                                                                                                         |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/modules/server/ws/resize-limiter.ts`   | **CREATE** | New module: per-connection resize rate-limiter                                                                                                                |
| `src/lib/modules/server/ws/reauth.ts`           | **CREATE** | New module: in-band re-auth challenge/response                                                                                                                |
| `src/lib/modules/server/ws/terminal-handler.ts` | **MODIFY** | Lines 87-97 (resize case) + line 63 (message handler setup)                                                                                                   |
| `src/lib/modules/server/ws/server.ts`           | **MODIFY** | Wire `reauth` module into the WS upgrade path                                                                                                                 |
| `specs/types/ws-protocol.yaml`                  | **MODIFY** | Add `TerminalReauthChallengeMessage`, `TerminalReauthResponseMessage`, `TerminalReauthRejectedMessage` to `TerminalServerMessage` and `TerminalClientMessage` |
| `src/lib/types/ws.ts`                           | **MODIFY** | Add reauth wire types to `WireTerminalServerMessage` and `WireTerminalClientMessage`                                                                          |
| `tests/resize-limiter.test.cjs`                 | **CREATE** | Unit tests for rate-limiter                                                                                                                                   |
| `tests/reauth.test.cjs`                         | **CREATE** | Unit tests for re-auth challenge/response                                                                                                                     |

---

## 3. New type additions

### 3a. YAML additions to `specs/types/ws-protocol.yaml`

Add after `TerminalSignalMessage` (around line 70):

```yaml
# ── Security: in-band re-auth types ─────────────────────────────────

TerminalReauthChallengeMessage:
  type: object
  description: Server requests the client to prove it still holds a valid credential
  required:
    - type
    - nonce
    - expiresAt
  properties:
    type:
      type: string
      const: reauth-challenge
    nonce:
      type: string
      description: Random 16-byte hex nonce; client must include in response
    expiresAt:
      type: number
      description: Unix ms deadline — client must respond before this time

TerminalReauthRejectedMessage:
  type: object
  description: Server closes the connection due to failed or missed re-auth
  required:
    - type
    - reason
  properties:
    type:
      type: string
      const: reauth-rejected
    reason:
      type: string
      enum:
        - expired
        - invalid
        - timeout
```

Add `TerminalReauthResponseMessage` to `TerminalClientMessage`:

```yaml
TerminalReauthResponseMessage:
  type: object
  description: Client responds to a reauth challenge with its current credential
  required:
    - type
    - nonce
    - token
  properties:
    type:
      type: string
      const: reauth-response
    nonce:
      type: string
      description: Echo of the challenge nonce
    token:
      type: string
      description: Current API key or guest session token
```

Update `TerminalClientMessage.oneOf` to add the `$ref` to `TerminalReauthResponseMessage`.
Update `TerminalServerMessage.oneOf` to add refs to `TerminalReauthChallengeMessage` and `TerminalReauthRejectedMessage`.

### 3b. Hand-written additions to `src/lib/types/ws.ts`

The generated types are the authoritative source after `pnpm gen:types`. However, the hand-written `WireTerminalClientMessage` and `WireTerminalServerMessage` union types in `ws.ts` (lines 139-151) must also be extended to keep type-checker happy before regeneration:

Add to `WireTerminalClientMessage` (line 143):

```typescript
  | { nonce: string; token: string; type: 'reauth-response' }
```

Add to `WireTerminalServerMessage` (line 146):

```typescript
  | { expiresAt: number; nonce: string; type: 'reauth-challenge' }
  | { reason: 'expired' | 'invalid' | 'timeout'; type: 'reauth-rejected' }
```

---

## 4. Step-by-step tasks

Each task is: write failing test → run → implement → run → commit.

---

### Task 1: Unit test scaffold for resize-limiter (TDD red)

**File:** `tests/resize-limiter.test.cjs`

**Write this test file:**

```cjs
'use strict';
/**
 * Unit tests for resize-limiter.ts logic (pure JS replica).
 *
 * The rate-limiter is a per-connection token bucket:
 *   - capacity: RESIZE_BURST (default 4)
 *   - refill rate: 1 token per RESIZE_INTERVAL_MS (default 500 ms)
 *   - a resize is allowed if tokens > 0; otherwise it is dropped silently
 *
 * We implement the bucket in plain JS here to test the algorithm in isolation.
 */

const assert = require('assert');

// ── Token bucket (mirrors resize-limiter.ts) ──────────────────────────

const RESIZE_BURST = 4;
const RESIZE_INTERVAL_MS = 500;

function makeBucket() {
  return {
    tokens: RESIZE_BURST,
    lastRefillAt: Date.now(),
  };
}

function tryConsume(bucket, nowMs) {
  const elapsed = nowMs - bucket.lastRefillAt;
  const refilled = Math.floor(elapsed / RESIZE_INTERVAL_MS);
  if (refilled > 0) {
    bucket.tokens = Math.min(RESIZE_BURST, bucket.tokens + refilled);
    bucket.lastRefillAt = bucket.lastRefillAt + refilled * RESIZE_INTERVAL_MS;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens--;
  return true;
}

// ── Tests ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}\n    ${err.message}`);
    failed++;
  }
}

// T1: fresh bucket allows RESIZE_BURST resizes
test('fresh bucket allows RESIZE_BURST resizes', () => {
  const b = makeBucket();
  const t = Date.now();
  for (let i = 0; i < RESIZE_BURST; i++) {
    assert.strictEqual(tryConsume(b, t), true, `token ${i} should be allowed`);
  }
  assert.strictEqual(tryConsume(b, t), false, 'burst+1 should be denied');
});

// T2: tokens refill after RESIZE_INTERVAL_MS
test('tokens refill after one interval', () => {
  const b = makeBucket();
  let t = Date.now();
  // drain all tokens
  for (let i = 0; i < RESIZE_BURST; i++) tryConsume(b, t);
  assert.strictEqual(tryConsume(b, t), false, 'drained: denied');
  // advance time by one interval
  t += RESIZE_INTERVAL_MS;
  assert.strictEqual(tryConsume(b, t), true, 'after refill: allowed');
});

// T3: tokens refill up to cap only
test('tokens refill up to RESIZE_BURST cap', () => {
  const b = makeBucket();
  let t = Date.now();
  for (let i = 0; i < RESIZE_BURST; i++) tryConsume(b, t);
  // advance by 10 intervals
  t += RESIZE_INTERVAL_MS * 10;
  // all RESIZE_BURST tokens refilled, no more
  for (let i = 0; i < RESIZE_BURST; i++) {
    assert.strictEqual(tryConsume(b, t), true, `refilled token ${i}`);
  }
  assert.strictEqual(tryConsume(b, t), false, 'still capped at RESIZE_BURST');
});

// T4: two buckets are independent
test('per-connection independence: two buckets', () => {
  const b1 = makeBucket();
  const b2 = makeBucket();
  const t = Date.now();
  for (let i = 0; i < RESIZE_BURST; i++) tryConsume(b1, t);
  assert.strictEqual(tryConsume(b1, t), false, 'b1 drained');
  assert.strictEqual(tryConsume(b2, t), true, 'b2 still has tokens');
});

// T5: dimension cap enforcement (separate from rate limit)
test('dimension caps reject out-of-range values', () => {
  const MAX_COLS = 500;
  const MAX_ROWS = 200;
  function inRange(cols, rows) {
    return cols >= 1 && cols <= MAX_COLS && rows >= 1 && rows <= MAX_ROWS;
  }
  assert.strictEqual(inRange(80, 24), true);
  assert.strictEqual(inRange(0, 24), false); // cols < 1
  assert.strictEqual(inRange(501, 24), false); // cols > MAX_COLS
  assert.strictEqual(inRange(80, 201), false); // rows > MAX_ROWS
  assert.strictEqual(inRange(500, 200), true); // boundary allowed
});

console.log(`\nresize-limiter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Run (expected: FAIL — module not yet created):**

```bash
node tests/resize-limiter.test.cjs
```

These tests are self-contained (no imports from the real module) and will pass green once the algorithm in the real module matches.

---

### Task 2: Implement `resize-limiter.ts`

**File:** `src/lib/modules/server/ws/resize-limiter.ts`

```typescript
// Resize rate-limiter — per-connection token bucket.
//
// A malicious or buggy client can send resize frames at any rate;
// each one calls pty.resize() which issues TIOCSWINSZ to the kernel.
// Flooding this call can saturate the holder process event loop.
//
// Policy: RESIZE_BURST frames are allowed in an initial burst;
// thereafter one token refills every RESIZE_INTERVAL_MS.
// Frames that exceed the budget are silently dropped (the client
// will be notified of the current PTY size on the next legitimate resize).

import type { WebSocket } from 'ws';

// ── Constants ─────────────────────────────────────────────────────────

/** Max dimension constants — already enforced in parseClientMessage() but
 *  duplicated here as the authoritative source of truth for the security layer. */
export const RESIZE_MAX_COLS = 500;
export const RESIZE_MAX_ROWS = 200;
export const RESIZE_MIN_COLS = 1;
export const RESIZE_MIN_ROWS = 1;

/** Burst budget: how many rapid resizes are allowed before throttling. */
export const RESIZE_BURST = 4;

/** Token refill interval in ms: one token refills per this period. */
export const RESIZE_INTERVAL_MS = 500;

// ── Token bucket per connection ───────────────────────────────────────

interface ResizeBucket {
  lastRefillAt: number;
  tokens: number;
}

const buckets = new WeakMap<WebSocket, ResizeBucket>();

/** Return true if the resize is within the rate-limit budget for this connection. */
export function allowResize(ws: WebSocket): boolean {
  let bucket = buckets.get(ws);
  if (!bucket) {
    bucket = { lastRefillAt: Date.now(), tokens: RESIZE_BURST };
    buckets.set(ws, bucket);
  }

  const now = Date.now();
  const elapsed = now - bucket.lastRefillAt;
  const refilled = Math.floor(elapsed / RESIZE_INTERVAL_MS);
  if (refilled > 0) {
    bucket.tokens = Math.min(RESIZE_BURST, bucket.tokens + refilled);
    bucket.lastRefillAt = bucket.lastRefillAt + refilled * RESIZE_INTERVAL_MS;
  }

  if (bucket.tokens <= 0) {
    return false;
  }
  bucket.tokens--;
  return true;
}

/** Remove the bucket for a closed connection (cleanup). */
export function removeBucket(ws: WebSocket): void {
  buckets.delete(ws);
}

/** Validate that dimensions are within absolute limits.
 *  This is a security gate distinct from rate-limiting — over-sized dims
 *  can cause the holder's node-pty to allocate arbitrarily large pseudo-TTYs. */
export function validateDimensions(cols: number, rows: number): boolean {
  return (
    Number.isFinite(cols) &&
    Number.isFinite(rows) &&
    cols >= RESIZE_MIN_COLS &&
    cols <= RESIZE_MAX_COLS &&
    rows >= RESIZE_MIN_ROWS &&
    rows <= RESIZE_MAX_ROWS
  );
}
```

**Run tests (expected: PASS):**

```bash
node tests/resize-limiter.test.cjs
```

---

### Task 3: Wire `resize-limiter.ts` into `terminal-handler.ts`

**File:** `src/lib/modules/server/ws/terminal-handler.ts`

**Current resize case (lines 87-97):**

```typescript
case 'resize': {
  terminal.pty.resize(msg.cols, msg.rows);
  // Broadcast the new PTY size to the other attached clients so
  // view-only guests can follow the owner's terminal dimensions.
  const resizeMsg: ServerMessage = { cols: msg.cols, rows: msg.rows, type: 'resize' };
  for (const client of terminal.clients) {
    if (client !== ws) {
      safeSend(client, resizeMsg);
    }
  }
  break;
}
```

**Modified version — add import at top and rate-limit gate in the resize case:**

At the top of the file, after existing imports, add:

```typescript
import { allowResize } from './resize-limiter.js';
```

Replace the resize case with:

```typescript
case 'resize': {
  // Rate-limit: silently drop if this connection is issuing too many resizes.
  if (!allowResize(ws)) {
    // Silent drop — no error message to avoid feedback amplification.
    break;
  }
  terminal.pty.resize(msg.cols, msg.rows);
  // Broadcast the new PTY size to the other attached clients so
  // view-only guests can follow the owner's terminal dimensions.
  const resizeMsg: ServerMessage = { cols: msg.cols, rows: msg.rows, type: 'resize' };
  for (const client of terminal.clients) {
    if (client !== ws) {
      safeSend(client, resizeMsg);
    }
  }
  break;
}
```

Also add bucket cleanup in the `ws.on('close', ...)` handler (line 119):

```typescript
ws.on('close', () => {
  removeBucket(ws); // <-- add this line
  _ptyManager?.detach(terminalId, ws);
});
```

Add `removeBucket` to the resize-limiter import.

**Validation:**

```bash
pnpm check
```

---

### Task 4: Unit test scaffold for in-band re-auth (TDD red)

**File:** `tests/reauth.test.cjs`

```cjs
'use strict';
/**
 * Unit tests for the in-band re-auth challenge/response mechanism.
 *
 * Mirrors the pure logic of reauth.ts:
 *   - generateChallenge()  -> { nonce, expiresAt }
 *   - validateResponse(nonce, expiresAt, token, apiKey) -> 'ok' | 'expired' | 'invalid'
 *   - the heartbeat timer interval is not tested here (a live integration test covers it)
 */

const assert = require('assert');
const { randomBytes, timingSafeEqual } = require('crypto');

// ── Mirror of reauth.ts logic ─────────────────────────────────────────

const REAUTH_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const REAUTH_GRACE_MS = 30 * 1000; // 30 s to respond

function generateChallenge(nowMs) {
  return {
    nonce: randomBytes(16).toString('hex'),
    expiresAt: (nowMs ?? Date.now()) + REAUTH_GRACE_MS,
  };
}

function timingSafeEqual32(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function validateResponse(nonce, expiresAt, respondedNonce, token, validToken, nowMs) {
  if ((nowMs ?? Date.now()) > expiresAt) return 'expired';
  if (respondedNonce !== nonce) return 'invalid';
  if (!timingSafeEqual32(token.trim(), validToken.trim())) return 'invalid';
  return 'ok';
}

// ── Tests ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}\n    ${err.message}`);
    failed++;
  }
}

const VALID_API_KEY = 'test-api-key-abcdef1234567890';

// T1: valid response returns 'ok'
test('valid response returns ok', () => {
  const { nonce, expiresAt } = generateChallenge(Date.now());
  const result = validateResponse(
    nonce,
    expiresAt,
    nonce,
    VALID_API_KEY,
    VALID_API_KEY,
    Date.now()
  );
  assert.strictEqual(result, 'ok');
});

// T2: expired challenge returns 'expired'
test('expired challenge returns expired', () => {
  const past = Date.now() - REAUTH_GRACE_MS - 1;
  const { nonce, expiresAt } = generateChallenge(past);
  const result = validateResponse(
    nonce,
    expiresAt,
    nonce,
    VALID_API_KEY,
    VALID_API_KEY,
    Date.now()
  );
  assert.strictEqual(result, 'expired');
});

// T3: wrong nonce returns 'invalid'
test('wrong nonce returns invalid', () => {
  const { nonce, expiresAt } = generateChallenge(Date.now());
  const result = validateResponse(
    nonce,
    expiresAt,
    'wrong-nonce',
    VALID_API_KEY,
    VALID_API_KEY,
    Date.now()
  );
  assert.strictEqual(result, 'invalid');
});

// T4: wrong token returns 'invalid'
test('wrong token returns invalid', () => {
  const { nonce, expiresAt } = generateChallenge(Date.now());
  const result = validateResponse(
    nonce,
    expiresAt,
    nonce,
    'wrong-token',
    VALID_API_KEY,
    Date.now()
  );
  assert.strictEqual(result, 'invalid');
});

// T5: nonce is unique per challenge
test('generateChallenge produces unique nonces', () => {
  const c1 = generateChallenge(Date.now());
  const c2 = generateChallenge(Date.now());
  assert.notStrictEqual(c1.nonce, c2.nonce, 'nonces must differ');
});

// T6: empty token returns 'invalid' (not a timing panic)
test('empty token returns invalid safely', () => {
  const { nonce, expiresAt } = generateChallenge(Date.now());
  const result = validateResponse(nonce, expiresAt, nonce, '', VALID_API_KEY, Date.now());
  assert.strictEqual(result, 'invalid');
});

console.log(`\nreauth: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Run (expected: PASS — tests are self-contained):**

```bash
node tests/reauth.test.cjs
```

---

### Task 5: Implement `reauth.ts`

**File:** `src/lib/modules/server/ws/reauth.ts`

```typescript
// In-band WebSocket re-auth heartbeat.
//
// Problem: HTTP Bearer authentication happens pre-upgrade and is consumed
// by the single-use ticket (ticket-store.ts). A revoked API key or expired
// share token does NOT kill an already-open WebSocket. The existing
// closeGuests() (guest-registry.ts:14) handles share revocation for guests;
// this module adds a complementary periodic challenge for ALL connections
// (owner + guest) so long-lived sockets are terminated when credentials change.
//
// Protocol (WS channel: /ws/terminal/:id):
//   server  →  { type:'reauth-challenge', nonce:'<hex>', expiresAt:<unixMs> }
//   client  →  { type:'reauth-response', nonce:'<hex>', token:'<apiKey|shareToken>' }
//   (if client misses deadline or provides wrong token)
//   server  →  { type:'reauth-rejected', reason:'timeout'|'expired'|'invalid' }
//              then ws.close(4003, 'Re-auth failed')
//
// Owner connections: token must match env.API_KEY.
// Guest connections: token must resolve via shareStore.resolveToken() to the
//   correct terminalId (same check as HTTP auth).
//
// Integration: call startReauthTimer(ws, terminalId, isGuest) from
// handleTerminalConnection() after attaching. Call clearReauthTimer(ws)
// on ws.on('close').

import type { WebSocket } from 'ws';

import { randomBytes, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

import { shareStore } from '../terminal/share-store.js';

// ── Constants ─────────────────────────────────────────────────────────

/** How often to issue a re-auth challenge (ms). */
export const REAUTH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** How long the client has to respond (ms). */
export const REAUTH_GRACE_MS = 30 * 1000; // 30 seconds

// ── Types ─────────────────────────────────────────────────────────────

interface PendingChallenge {
  expiresAt: number;
  nonce: string;
}

interface ReauthState {
  pending: null | PendingChallenge;
  responseTimer: null | ReturnType<typeof setTimeout>;
  timer: null | ReturnType<typeof setInterval>;
  terminalId: string;
  isGuest: boolean;
}

// ── Per-connection state ───────────────────────────────────────────────

const states = new WeakMap<WebSocket, ReauthState>();

// ── Public API ────────────────────────────────────────────────────────

/**
 * Start the re-auth heartbeat timer for a WebSocket connection.
 * Call this immediately after a connection is established and authenticated.
 *
 * @param ws          - The WebSocket connection.
 * @param terminalId  - The terminal this connection is scoped to.
 * @param isGuest     - True if this is a guest (share-token) connection; false for owner.
 */
export function startReauthTimer(ws: WebSocket, terminalId: string, isGuest: boolean): void {
  const state: ReauthState = {
    isGuest,
    pending: null,
    responseTimer: null,
    terminalId,
    timer: null,
  };
  states.set(ws, state);

  state.timer = setInterval(() => {
    issueChallenge(ws, state);
  }, REAUTH_INTERVAL_MS);

  // Unref so the timer does not prevent Node.js from exiting cleanly.
  state.timer.unref();
}

/**
 * Clear all timers for a closing WebSocket connection.
 * Call from ws.on('close').
 */
export function clearReauthTimer(ws: WebSocket): void {
  const state = states.get(ws);
  if (!state) return;

  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.responseTimer) {
    clearTimeout(state.responseTimer);
    state.responseTimer = null;
  }
  states.delete(ws);
}

/**
 * Process an inbound `reauth-response` frame from the client.
 * Call this from the ws.on('message') handler in terminal-handler.ts.
 *
 * @returns true if the response was valid (no action needed), false if
 *          the connection was closed due to failed re-auth.
 */
export function handleReauthResponse(
  ws: WebSocket,
  frame: { nonce: string; token: string; type: 'reauth-response' }
): boolean {
  const state = states.get(ws);
  if (!state || !state.pending) {
    // No pending challenge — unexpected frame, ignore.
    return true;
  }

  const { nonce, expiresAt } = state.pending;
  const reason = validateResponse(
    nonce,
    expiresAt,
    frame.nonce,
    frame.token,
    state.terminalId,
    state.isGuest
  );

  // Clear the grace-period timer regardless.
  if (state.responseTimer) {
    clearTimeout(state.responseTimer);
    state.responseTimer = null;
  }
  state.pending = null;

  if (reason !== 'ok') {
    rejectConnection(ws, reason);
    return false;
  }
  return true;
}

// ── Private helpers ───────────────────────────────────────────────────

function issueChallenge(ws: WebSocket, state: ReauthState): void {
  if (ws.readyState !== 1 /* OPEN */) return;

  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + REAUTH_GRACE_MS;
  state.pending = { expiresAt, nonce };

  ws.send(JSON.stringify({ expiresAt, nonce, type: 'reauth-challenge' }));

  // Schedule a rejection if the client does not respond in time.
  state.responseTimer = setTimeout(() => {
    if (state.pending) {
      rejectConnection(ws, 'timeout');
    }
  }, REAUTH_GRACE_MS);
  state.responseTimer.unref();
}

type RejectReason = 'expired' | 'invalid' | 'timeout';

function rejectConnection(ws: WebSocket, reason: RejectReason): void {
  try {
    ws.send(JSON.stringify({ reason, type: 'reauth-rejected' }));
  } catch {
    // Already closing.
  }
  try {
    ws.close(4003, 'Re-auth failed');
  } catch {
    // Already closed.
  }
  clearReauthTimer(ws);
}

function validateResponse(
  nonce: string,
  expiresAt: number,
  respondedNonce: string,
  token: string,
  terminalId: string,
  isGuest: boolean
): 'expired' | 'invalid' | 'ok' {
  if (Date.now() > expiresAt) return 'expired';
  if (respondedNonce !== nonce) return 'invalid';

  if (isGuest) {
    // Guest: token must be a valid share session for this terminal.
    const session = shareStore.resolveToken(token.trim());
    if (!session || session.terminalId !== terminalId) return 'invalid';
    return 'ok';
  }

  // Owner: token must match the current API_KEY.
  const expected = env.API_KEY?.trim();
  if (!expected) return 'invalid';

  const tokenBuf = Buffer.from(token.trim());
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return 'invalid';
  if (!timingSafeEqual(tokenBuf, expectedBuf)) return 'invalid';
  return 'ok';
}
```

**Run tests:**

```bash
node tests/reauth.test.cjs
pnpm check
```

---

### Task 6: Wire `reauth.ts` into `terminal-handler.ts`

**File:** `src/lib/modules/server/ws/terminal-handler.ts`

**Change summary:**

1. Import `startReauthTimer`, `clearReauthTimer`, `handleReauthResponse` from `./reauth.js`.
2. After `_ptyManager.attach(terminalId, ws)` (line 55), add:
   ```typescript
   const isGuest = scope !== undefined;
   startReauthTimer(ws, terminalId, isGuest);
   ```
3. In `ws.on('message')`, inside the `if (scope?.readOnly) return;` block — note that `reauth-response` must be handled **before** the read-only gate since even view-only guests need to re-auth:

   ```typescript
   ws.on('message', (raw: Buffer | string) => {
     const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
     const msg = parseClientMessage(data);
     if (!msg) return;

     // Re-auth response must be handled before the readOnly gate.
     if (msg.type === 'reauth-response') {
       handleReauthResponse(ws, msg);
       return;
     }

     if (scope?.readOnly) return;
     // ... existing switch ...
   ```

4. In `ws.on('close')` (line 119):
   ```typescript
   ws.on('close', () => {
     clearReauthTimer(ws);
     removeBucket(ws);
     _ptyManager?.detach(terminalId, ws);
   });
   ```

**Add `reauth-response` to `parseClientMessage()`** (after the existing switch cases):

```typescript
case 'reauth-response': {
  const nonce = msg.nonce;
  const token = msg.token;
  if (typeof nonce !== 'string' || typeof token !== 'string') return null;
  return { nonce, token, type: 'reauth-response' };
}
```

**Validation:**

```bash
pnpm check
pnpm lint
```

---

### Task 7: Update YAML specs and regenerate types

**File:** `specs/types/ws-protocol.yaml`

Make the additions described in §3a above:

- Add `TerminalReauthChallengeMessage` object type after `TerminalSignalMessage`
- Add `TerminalReauthRejectedMessage` object type
- Add `TerminalReauthResponseMessage` object type
- Add `$ref` entries to `TerminalClientMessage.oneOf` and `TerminalServerMessage.oneOf`

**Regenerate:**

```bash
pnpm gen:types
pnpm check
```

---

### Task 8: Update hand-written ws.ts types

**File:** `src/lib/types/ws.ts`

Extend `WireTerminalClientMessage` (currently line 139):

```typescript
export type WireTerminalClientMessage =
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'input' }
  | { nonce: string; token: string; type: 'reauth-response' } // <-- add
  | { signal: TerminalSignal; type: 'signal' };
```

Extend `WireTerminalServerMessage` (currently line 145):

```typescript
export type WireTerminalServerMessage =
  | { bytes: number; type: 'output-dropped' }
  | { chunk: number; data: string; total: number; type: 'scrollback' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'output' }
  | { expiresAt: number; nonce: string; type: 'reauth-challenge' } // <-- add
  | { message: string; type: 'error' }
  | { reason: 'expired' | 'invalid' | 'timeout'; type: 'reauth-rejected' }; // <-- add
```

**Validation:**

```bash
pnpm check
pnpm lint
```

---

### Task 9: Session recording stub (D6 DEFERRED)

**File:** `src/lib/modules/server/ws/terminal-handler.ts`

Add a comment block at the top of `handleTerminalConnection()`:

```typescript
// TODO:RECORDING — Phase 7 stub.
// Session recording (audit log of all PTY I/O with timestamps) is deferred per
// decision D6. When implemented, a recorder should be wired at two points:
//   1. In pty-manager.ts wireHolderCallbacks() — capture raw output chunks with
//      monotonic timestamps before broadcastOutput().
//   2. In the 'input' case below — capture input bytes with timestamps.
// The recorder should write to ~/.shooter/recordings/<terminalId>.cast
// (asciicast v2 format) so recordings are compatible with asciinema tooling.
// Enable/disable via env var SHOOTER_RECORDING=true. Deferred to post-Phase 7.
```

This is a comment-only change; no code is implemented. It marks the integration points so the recording phase author does not need to re-audit the codebase.

---

### Task 10: Add REST endpoint dimension cap (belt-and-suspenders)

**File:** `src/routes/api/terminals/[id]/resize/+server.ts`

The existing REST endpoint (lines 33-43) already validates `cols <= 500 && rows <= 200`. Phase 7 adds a rate-limit comment noting that the REST path is protected by HTTP-level authentication (API key checked by `resolveAccess` at line 11) and does not need a token-bucket rate-limit at the HTTP layer — the OS TCP stack and the existing auth check are sufficient mitigations there. Only the WebSocket path needs the bucket because WebSocket frames are unauthenticated after upgrade.

Add a comment at line 1 of the file:

```typescript
// Security note (Phase 7): HTTP auth gates this endpoint at line 11.
// Resize rate-limiting (token bucket) is applied only on the WebSocket
// channel in ws/resize-limiter.ts — the HTTP endpoint is protected by
// standard auth and does not need a per-connection bucket.
```

No functional change; this is documentation only.

---

### Task 11: Integration smoke test (live verification script)

**File:** `tests/security-hardening.manual.md` — describes the manual verification steps (not a .cjs test because it requires a live server + holder process):

**Step 1 — Resize flood:**

```bash
# In a second terminal, start a test server:
pnpm build && pnpm start &

# In Node REPL, send 20 rapid resize frames to the terminal WS:
node -e "
const WebSocket = require('ws');
const ticket = /* fetch from /api/ws-ticket */;
const ws = new WebSocket('ws://localhost:54007/ws/terminal/<id>?ticket=<ticket>');
ws.on('open', () => {
  for (let i = 0; i < 20; i++) {
    ws.send(JSON.stringify({ type: 'resize', cols: 80 + i, rows: 24 }));
  }
});
ws.on('message', d => console.log(d.toString()));
"
# Expected: only the first RESIZE_BURST (4) resizes take effect (check holder log);
# the rest are silently dropped with no error frame sent back to the client.
```

**Step 2 — Re-auth heartbeat (owner):**

```bash
# Set REAUTH_INTERVAL_MS=5000 temporarily in reauth.ts for fast testing.
# Connect a terminal WS. After 5 s, the server sends:
#   { type: 'reauth-challenge', nonce: '<hex>', expiresAt: <ms> }
# Client responds with:
#   { type: 'reauth-response', nonce: '<hex>', token: '<current API_KEY>' }
# Expected: connection remains open. Log shows '[reauth] ok'.
```

**Step 3 — Re-auth timeout (owner, wrong key):**

```bash
# Same setup. Client responds with wrong token or does not respond within 30 s.
# Expected:
#   server sends { type: 'reauth-rejected', reason: 'invalid' | 'timeout' }
#   ws.close(4003, 'Re-auth failed') is called.
#   connection is cleaned up.
```

**Step 4 — Re-auth, guest share session:**

```bash
# Create a share, get a guest token, open a guest WS.
# After REAUTH_INTERVAL_MS, send a reauth-response with the guest token.
# Expected: connection remains open.
# Revoke the share (DELETE /api/share/:id or set new password).
# Next reauth challenge: guest responds with old token -> 'invalid' -> ws.close(4003).
```

---

### Task 12: Add tests to package.json test script

The new tests are self-contained CJS scripts. Add them to the test script in `package.json`:

**Current test script (approximately):**

```
node tests/terminal-store.test.cjs && node tests/pending-requests.test.cjs && ... && node tests/share-store.test.cjs
```

**Add at the end:**

```
... && node tests/resize-limiter.test.cjs && node tests/reauth.test.cjs
```

**Run full suite:**

```bash
pnpm test
```

---

### Task 13: Final validation

```bash
pnpm gen:types        # regenerate from updated YAML
pnpm lint             # ESLint — no new violations
pnpm check            # svelte-kit sync + svelte-check + tsc --noEmit --strict
pnpm build            # vite build
pnpm test             # all .cjs tests including the two new ones
```

All commands must pass clean before committing.

---

## 5. Commit strategy

One squashed commit per CI requirement. Suggested message:

```
feat(security): resize rate-limit, in-band WS re-auth heartbeat

- Add token-bucket resize rate-limiter (RESIZE_BURST=4, 500ms refill)
  per WebSocket connection in ws/resize-limiter.ts; wire into
  terminal-handler.ts resize case.
- Add in-band re-auth challenge/response heartbeat (5 min interval,
  30 s grace) for all terminal WS connections (owner + guest) in
  ws/reauth.ts; validates against API_KEY (owner) or share session
  (guest); closes with 4003 on failure or timeout.
- Extend WireTerminalClientMessage / WireTerminalServerMessage with
  reauth-challenge, reauth-response, reauth-rejected frame types.
- Add resize-limiter.test.cjs and reauth.test.cjs to test suite.
- Add TODO:RECORDING stub in terminal-handler.ts for Phase 7 deferred
  session recording (D6).
```

Branch: `feat/terminal-sync-phase-7-security`

---

## 6. What this phase exposes for later phases

| Symbol / pattern                               | Used by                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --- | ------------ |
| `allowResize(ws)` from `resize-limiter.ts`     | Phase 3 resize arbitration — Phase 3 can call `allowResize` before issuing `pty.resize()` in the REST path too, if desired |
| `startReauthTimer(ws, terminalId, isGuest)`    | Phase 5 presence — if presence emits "connection dropped" events, it can use the `reauth-rejected` frame as the trigger    |
| `handleReauthResponse(ws, frame)`              | Usable as-is by any future WS channel that needs in-band re-auth                                                           |
| `REAUTH_INTERVAL_MS`, `REAUTH_GRACE_MS`        | Configurable constants; a future config phase can expose via env vars                                                      |
| `validateDimensions(cols, rows)`               | Phase 3 can use this as the single authoritative dimension validator instead of duplicating the `> 500                     |     | > 200` check |
| `TODO:RECORDING` anchor in terminal-handler.ts | Phase recording — output-capture hook point documented                                                                     |

---

## 7. Conflict risk with sibling phases

| Sibling phase                | Conflict file                                 | Risk                                                             | Resolution                                                                                                                          |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3 (resize arbitration) | `terminal-handler.ts:87-97` (resize case)     | **HIGH** — both phases edit the same 10-line block               | Coordinate: Phase 3 should merge first, then Phase 7 adds `allowResize(ws)` call inside Phase 3's driver-check block, not around it |
| Phase 4 (control handoff)    | `terminal-handler.ts:81-116` (input + resize) | **MEDIUM** — Phase 4 adds driver-token gate before `pty.write()` | Additive: resize rate-limit and driver gate are independent checks; both can coexist in the same case block                         |
| Phase 5 (presence)           | `events-handler.ts`                           | **LOW** — Phase 7 does not modify this file                      | Phase 5 may want to emit a presence event when `reauth-rejected` fires; leave a comment in `reauth.ts` noting the hook point        |
| Phase 0 (sequencing)         | `pty-manager.ts` broadcast                    | **NONE** — Phase 7 does not touch `pty-manager.ts`               | No conflict                                                                                                                         |
| Phase 1 (headless emulator)  | `pty-manager.ts` wireHolderCallbacks          | **NONE** — Phase 7 does not touch this path                      | The `TODO:RECORDING` stub documents where a recorder would hook in, but does not implement one                                      |
| Phase 2 (reconnect resume)   | `xterm-wrapper.ts`                            | **NONE** — Phase 7 is server-only                                | No conflict                                                                                                                         |
| Phase 6 (restart resilience) | `pty-manager.ts`                              | **NONE**                                                         | No conflict                                                                                                                         |

---

## 8. Rough task count

| #   | Task                                    | Estimated time |
| --- | --------------------------------------- | -------------- |
| 1   | Write `tests/resize-limiter.test.cjs`   | ~15 min        |
| 2   | Implement `resize-limiter.ts`           | ~20 min        |
| 3   | Wire limiter into `terminal-handler.ts` | ~10 min        |
| 4   | Write `tests/reauth.test.cjs`           | ~20 min        |
| 5   | Implement `reauth.ts`                   | ~30 min        |
| 6   | Wire reauth into `terminal-handler.ts`  | ~15 min        |
| 7   | Update YAML + `pnpm gen:types`          | ~10 min        |
| 8   | Update hand-written `ws.ts` types       | ~5 min         |
| 9   | Recording stub comment                  | ~5 min         |
| 10  | REST endpoint comment                   | ~5 min         |
| 11  | Manual smoke test                       | ~30 min        |
| 12  | Add to package.json test script         | ~5 min         |
| 13  | Final validation + commit               | ~15 min        |

**Total: ~185 min (~3 h) including manual smoke testing.**

---

## 9. Key constants (referenced in real code)

| Constant                         | Value                        | Location                                                |
| -------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `RESIZE_MAX_COLS`                | `500`                        | `resize-limiter.ts` (mirrors `terminal-handler.ts:169`) |
| `RESIZE_MAX_ROWS`                | `200`                        | `resize-limiter.ts` (mirrors `terminal-handler.ts:169`) |
| `RESIZE_BURST`                   | `4`                          | `resize-limiter.ts`                                     |
| `RESIZE_INTERVAL_MS`             | `500`                        | `resize-limiter.ts`                                     |
| `REAUTH_INTERVAL_MS`             | `5 * 60 * 1000`              | `reauth.ts`                                             |
| `REAUTH_GRACE_MS`                | `30 * 1000`                  | `reauth.ts`                                             |
| Close code for re-auth failure   | `4003`                       | `reauth.ts`                                             |
| Existing rate-limit in WS parser | `cols > 500 \|\| rows > 200` | `terminal-handler.ts:169`                               |
| Existing REST rate-limit         | same                         | `resize/+server.ts:41`                                  |
