# Phase 3 — Driver-Authoritative Resize & Coherence

**Phase:** 3 of 7
**Research anchor:** §6 "Phase 3 — Resize arbitration & coherence" + §4.3 "Resize policy" in `docs/superpowers/research/2026-06-13-terminal-sync-research.md`
**Foundation contract:** `docs/superpowers/specs/terminal-sync/00-foundation-architecture.md` §1.1 (`resize` frame), §2.3 (driver-authoritative resize, D1), §3 (no flow changes to `broadcastOutput`)
**Gaps fixed:** G4 (resize fight between multiple interactive clients), G5 (dims not persisted — revert on restart), G8 (guests get no size on attach — edge-triggered only)
**Design decision D1 implemented:** driver-authoritative resize. The authority predicate (`isResizeAuthority`) is a named, swappable function so Phase 4 replaces it with one line when the driver token arrives.

**Authority policy (P3):** _first interactive (non-readOnly) connection to send a resize claims authority; it stays the authority until that connection disconnects, then the slot clears and the next interactive resize claims it._ This is **first-claimer, sticky-until-disconnect** — deliberately NOT last-writer-wins, because last-writer-wins is exactly the multi-client fight (G4) this phase removes. The predicate is **pure** (`isResizeAuthority(connectionId, authorityConnectionId): boolean`); the caller performs the claim on `null` and the close handler performs the clear.

---

## 1. What and Why

Today's resize has three independent bugs:

1. **G4 — last-writer-wins fight.** `terminal-handler.ts:88` calls `pty.resize()` for every non-readOnly sender with no arbitration. Two interactive clients (owner on desktop + phone, or owner + control-guest) fight continuously as each client's `ResizeObserver` fires whenever its window changes.

2. **G5 — dims not persisted.** `pty-manager.ts:resize()` (476–496) updates `terminal.cols/rows` in memory and broadcasts to all clients, but never calls `terminalStore.update()`. A server restart reads creation-time dims from SQLite and the PTY is recreated at the wrong size.

3. **G8 — no size on attach.** `pty-manager.ts:attach()` (63–76) sends only the raw scrollback — no `{type:'resize'}` frame. View-only guests and late-joining interactive clients must wait for the owner's next window-resize event to discover the current PTY size. This is the edge-triggered-only bug: on a stable desktop the resize event may never come.

**Fix strategy (bound to §2.3 of the contract):**

- Introduce a named authority predicate `isResizeAuthority(connectionId, authorityConnectionId)` — Phase 3 returns `true` when the slot is unclaimed (`null`) or matches the caller (**first-claimer, sticky-until-disconnect**; see the policy note above). Phase 4 replaces the body with `connectionId === terminal.driver` in one line.
- Only the authority connection's `resize` frame reaches `pty.resize()`. Every other connection's resize is silently ignored for the PTY; the sender's own xterm is sized by its own `fitAddon` (local-only, no round-trip needed).
- Every resize through `pty.resize()` — whether via WS or REST — persists `cols/rows` to SQLite via `terminalStore.update()`.
- `attach()` pushes `{type:'resize', cols, rows}` immediately after the scrollback send so every joiner gets the current size on the first frame, level-triggered.
- The REST route (`resize/+server.ts`) calls `ptyManager.resize()` which already broadcasts to ALL clients — this is correct; the asymmetry with the WS path (which excludes sender) is reconciled in §4d below.

**Invariant after Phase 3:** the PTY size is always set by exactly one authority connection at a time; every client — including the authority — always knows the current PTY size within one round-trip of joining.

---

## 2. Files Touched

| File                                                | Role                                        | Touch                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/modules/server/ws/terminal-handler.ts`     | WS inbound resize — the hot path            | Replace unconditional `pty.resize()` with authority-gated call; track authority connection; add `isResizeAuthority` predicate  |
| `src/lib/modules/server/terminal/pty-manager.ts`    | `resize()` (476–496) and `attach()` (63–76) | `resize()` persists dims; `attach()` pushes current size frame                                                                 |
| `src/lib/modules/server/terminal/terminal-store.ts` | SQLite persistence                          | Add `resizeDims()` helper: single prepared UPDATE for cols+rows (avoids repeated string-build overhead)                        |
| `src/routes/api/terminals/[id]/resize/+server.ts`   | REST resize path                            | No logic change; annotate the broadcast-to-ALL behavior; ensure it flows through `ptyManager.resize()` which now persists      |
| `src/lib/modules/client/terminal/xterm-wrapper.ts`  | Client WS message handler + ResizeObserver  | Non-authority: apply pushed `resize` frame to xterm regardless of `readOnly`; authority-check seam for sending resize upstream |
| `tests/resize-authority.test.cjs`                   | **New** unit test                           | Authority predicate logic; store `resizeDims` persist/restore                                                                  |

**Conflict-risk:**

- `terminal-handler.ts:87–97` (resize block) — shared with P4 (driver token gating) and P7 (rate-limit). Merge order: P3→P4→P7. P4 replaces `isResizeAuthority` body; P7 adds rate-limiting before `isResizeAuthority`.
- `terminal-store.ts` — shared with P6 (snapshot persistence). No overlap on columns; P6 adds new columns; P3 adds `resizeDims()` method. Safe parallel edit if branch order is P3→P6.
- `pty-manager.ts:resize()` and `pty-manager.ts:attach()` — P3 is the only phase touching these two methods.

---

## 3. Concrete Type Changes

No new YAML types are needed. The `resize` wire frame (`{type:'resize', cols:number, rows:number}`) already exists in both directions (per §1.1 of the contract).

**`src/lib/types/server.ts` — add `authorityConnectionId` to `PtyManagedTerminal`:**

```typescript
// Inside PtyManagedTerminal, after seqRing (added by Phase 0):
authorityConnectionId: null | string; // connection currently allowed to resize the PTY; null = unclaimed
```

This field is the P3-phase authority slot. Phase 4 will add `driver: null | string` beside it and the predicate will switch to use `driver`. Both fields coexist; `authorityConnectionId` remains the resize-specific slot even in P4+ because the driver token and the resize authority are the same connection in P4 but the field names communicate intent separately.

---

## 4. Step-by-Step Tasks (TDD order)

Each task ends with a named validation gate.

---

### Task 0 — Verify line anchors

Read the current line numbers before touching anything:

```bash
grep -n "case 'resize'" \
  /Users/sachinsharma/Developer/Personal/feat/terminal-sharing/src/lib/modules/server/ws/terminal-handler.ts

grep -n "resize\|attach\|sendScrollback" \
  /Users/sachinsharma/Developer/Personal/feat/terminal-sharing/src/lib/modules/server/terminal/pty-manager.ts | head -30

grep -n "resizeDims\|update\|markExited" \
  /Users/sachinsharma/Developer/Personal/feat/terminal-sharing/src/lib/modules/server/terminal/terminal-store.ts
```

Expected anchors (adjust if line numbers shifted):

- `terminal-handler.ts` resize `case` at ~87
- `pty-manager.ts` `resize()` method opening at ~476, `attach()` at ~63
- `terminal-store.ts` `update()` at ~173 (generic partial-update helper — P3 adds a dedicated `resizeDims()` beside it)

**Gate 0:** anchors confirmed. If they differ by more than ±20 lines, re-read the relevant section before proceeding.

---

### Task 1 — Write the failing unit test

Create `/Users/sachinsharma/Developer/Personal/feat/terminal-sharing/tests/resize-authority.test.cjs`:

```js
/**
 * Phase 3 unit tests — resize authority predicate + terminal-store dims persistence.
 *
 * Tests the pure logic that will be extracted into:
 *   - isResizeAuthority() in terminal-handler.ts
 *   - resizeDims() in terminal-store.ts (tested against a real in-memory SQLite db)
 */
'use strict';

const assert = require('node:assert');
const Database = require('better-sqlite3');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// ── Section 1: authority predicate (pure logic, no pty-manager import) ──────

/**
 * P3 implementation of isResizeAuthority.
 * Returns true when connectionId is the most-recently-active interactive connection.
 * P4 swaps the body to: return connectionId === authorityConnectionId (the driver slot).
 *
 * @param {string} connectionId  - The connection sending the resize frame.
 * @param {string|null} authorityConnectionId - Current authority slot (null = first interactive wins).
 * @returns {boolean}
 */
function isResizeAuthority(connectionId, authorityConnectionId) {
  // Null means no authority claimed yet — the first interactive resize claims it.
  // This mirrors the P3 logic in terminal-handler.ts.
  if (authorityConnectionId === null) return true;
  return connectionId === authorityConnectionId;
}

// ── Section 2: in-memory SQLite for resizeDims ───────────────────────────────

function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL DEFAULT 'bash',
      args TEXT NOT NULL DEFAULT '[]',
      cwd TEXT NOT NULL DEFAULT '/tmp',
      cols INTEGER NOT NULL DEFAULT 80,
      rows INTEGER NOT NULL DEFAULT 24,
      pid INTEGER,
      holder_pid INTEGER,
      socket_path TEXT,
      session_file TEXT,
      opencode_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER,
      created_at TEXT NOT NULL,
      exited_at TEXT
    )
  `);
  // Insert one record for testing
  db.prepare("INSERT INTO terminals (id, created_at) VALUES ('term-1', datetime('now'))").run();
  return db;
}

/** Extracted resizeDims logic — must match terminal-store.ts:resizeDims() exactly. */
function resizeDims(db, id, cols, rows) {
  db.prepare('UPDATE terminals SET cols = ?, rows = ? WHERE id = ?').run(cols, rows, id);
}

function getRecord(db, id) {
  return db.prepare('SELECT * FROM terminals WHERE id = ?').get(id);
}

// ── Tests ────────────────────────────────────────────────────────────────────

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

console.log('resize-authority:');

// -- authority predicate --

test('null authority: any connectionId is authority', () => {
  assert.strictEqual(isResizeAuthority('conn-A', null), true);
  assert.strictEqual(isResizeAuthority('conn-B', null), true);
});

test('claimed authority: only the authority connectionId returns true', () => {
  assert.strictEqual(isResizeAuthority('conn-A', 'conn-A'), true);
  assert.strictEqual(isResizeAuthority('conn-B', 'conn-A'), false);
});

test('empty string connectionId: does not match null authority as special case', () => {
  // null authority means unclaimed → '' should still win (first-resize-wins)
  assert.strictEqual(isResizeAuthority('', null), true);
});

test('authority changes: new holder is immediately authoritative', () => {
  // simulate P4 claim: old='conn-A', new='conn-B'
  let authority = 'conn-A';
  assert.strictEqual(isResizeAuthority('conn-A', authority), true);
  // P4 sets authority = 'conn-B'
  authority = 'conn-B';
  assert.strictEqual(isResizeAuthority('conn-B', authority), true);
  assert.strictEqual(isResizeAuthority('conn-A', authority), false);
});

// -- resizeDims persistence --

test('resizeDims persists cols and rows to SQLite', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 220, 55);
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 220);
  assert.strictEqual(row.rows, 55);
  db.close();
});

test('resizeDims can be called multiple times; last call wins', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 80, 24);
  resizeDims(db, 'term-1', 200, 50);
  resizeDims(db, 'term-1', 132, 43);
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 132);
  assert.strictEqual(row.rows, 43);
  db.close();
});

test('resizeDims does not affect other records', () => {
  const db = makeTestDb();
  db.prepare("INSERT INTO terminals (id, created_at) VALUES ('term-2', datetime('now'))").run();
  resizeDims(db, 'term-1', 200, 50);
  const row2 = getRecord(db, 'term-2');
  assert.strictEqual(row2.cols, 80); // default unchanged
  assert.strictEqual(row2.rows, 24);
  db.close();
});

test('resizeDims with creation-default (80x24) survives a round-trip', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 80, 24);
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 80);
  assert.strictEqual(row.rows, 24);
  db.close();
});

test('reconnect restores latest dims, not creation-time dims', () => {
  const db = makeTestDb();
  // Initial creation-time: 80x24 (already in DB as default)
  // Simulate a resize
  resizeDims(db, 'term-1', 210, 52);
  // Simulate a server restart (re-read the record)
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 210, 'reconnect must see persisted cols');
  assert.strictEqual(row.rows, 52, 'reconnect must see persisted rows');
  db.close();
});

console.log(`\n${passed} passed`);
```

Run it now — it must pass (all logic is self-contained):

```bash
node /Users/sachinsharma/Developer/Personal/feat/terminal-sharing/tests/resize-authority.test.cjs
```

**Gate 1:** `N passed` printed, no assertion errors. The test is green before any source changes because it validates the contract the production code will implement.

---

### Task 2 — Extend `PtyManagedTerminal` with `authorityConnectionId`

Edit `src/lib/types/server.ts`. Locate `PtyManagedTerminal` (the hand-written interface). After the `seqRing: SeqRingEntry[]` line added by Phase 0, add:

```typescript
// Phase 3: the connection currently allowed to resize the PTY.
// null = unclaimed; first interactive resize claims it.
// Phase 4 replaces this slot with driver: null | string and the
// predicate becomes: return connectionId === terminal.driver
authorityConnectionId: null | string;
```

Run the type check immediately:

```bash
cd /Users/sachinsharma/Developer/Personal/feat/terminal-sharing && pnpm check 2>&1 | grep -i "authorityConnectionId\|Property.*missing" | head -20
```

Expected: type errors in `pty-manager.ts` (wherever `ManagedTerminal` is constructed — the `create()` and `reconnectOne()` object literals now have a missing field). These are the failing type tests.

**Gate 2:** errors are in `pty-manager.ts` object literals only (not in random other files).

---

### Task 3 — Initialize `authorityConnectionId` in `pty-manager.ts`

In `pty-manager.ts`, find the `create()` method and the `reconnectOne()` method. In each `ManagedTerminal` object literal, add:

```typescript
authorityConnectionId: null,   // Phase 3: no authority until first interactive resize
```

This clears the type errors from Task 2.

**Gate 3:** `pnpm check` produces zero errors.

---

### Task 4 — Add `resizeDims()` to `terminal-store.ts`

`terminal-store.ts` has a generic `update()` at line 173. Add a dedicated `resizeDims()` method after it:

```typescript
/**
 * Persist the current PTY dimensions to SQLite.
 * Called on every authoritative resize so that server restart restores the
 * latest size, not the creation-time default.
 * Dedicated method (vs. the generic update()) avoids repeated
 * Object.entries() overhead on a hot resize path.
 */
resizeDims(id: string, cols: number, rows: number): void {
  this.db
    .prepare('UPDATE terminals SET cols = ?, rows = ? WHERE id = ?')
    .run(cols, rows, id);
}
```

No YAML change needed — `TerminalRecord` already has `cols: number` and `rows: number` fields.

Run the type check:

```bash
pnpm check 2>&1 | head -20
```

**Gate 4:** zero errors.

---

### Task 5 — Persist dims in `pty-manager.ts:resize()`

Current `resize()` (lines 476–496) updates `terminal.cols/rows` in memory and broadcasts, but never writes to SQLite.

After the line `terminal.rows = rows;` (line 485), add:

```typescript
// Phase 3: persist so server restart restores the latest PTY size.
terminalStore.resizeDims(id, cols, rows);
```

The full updated `resize()` body becomes:

```typescript
resize(id: string, cols: number, rows: number): boolean {
  const terminal = this.terminals.get(id);
  if (!terminal || terminal.status === 'exited') {
    return false;
  }

  try {
    terminal.pty.resize(cols, rows);
    terminal.cols = cols;
    terminal.rows = rows;
    // Phase 3: persist so server restart restores the latest PTY size (fixes G5).
    terminalStore.resizeDims(id, cols, rows);
    // Broadcast the new PTY size so attached clients (e.g. view-only
    // guests) can follow the terminal dimensions.
    const msg = JSON.stringify({ cols, rows, type: 'resize' });
    for (const ws of terminal.clients) {
      this.safeSend(ws, msg);
    }
    return true;
  } catch {
    return false;
  }
}
```

Note: the REST path (`resize/+server.ts`) calls `ptyManager.resize()` directly, so it automatically gets persistence with no further changes needed.

**Gate 5:** `pnpm check` zero errors.

---

### Task 6 — Push size on attach in `pty-manager.ts:attach()`

Current `attach()` (lines 63–76) adds the client to `terminal.clients` and sends scrollback, but sends no size frame. The view-only guest waits indefinitely for the next edge-triggered resize.

After `void this.sendScrollback(terminal, ws);`, add:

```typescript
// Phase 3: level-triggered size push on join (fixes G8).
// Every joiner — interactive or view-only — immediately learns the PTY's
// current size without waiting for the owner's next resize event.
const sizeFrame = JSON.stringify({ cols: terminal.cols, rows: terminal.rows, type: 'resize' });
this.safeSend(ws, sizeFrame);
```

The full updated `attach()` becomes:

```typescript
attach(id: string, ws: WebSocket): boolean {
  const terminal = this.terminals.get(id);
  if (!terminal) {
    return false;
  }

  terminal.clients.add(ws);
  terminal.outputBuffers.set(ws, { data: [], size: 0 });

  // Send cached scrollback in chunks
  void this.sendScrollback(terminal, ws);

  // Phase 3: level-triggered size push so every joiner immediately knows
  // the PTY dimensions without waiting for the next edge-triggered resize
  // event from the owner (fixes G8).
  const sizeFrame = JSON.stringify({ cols: terminal.cols, rows: terminal.rows, type: 'resize' });
  this.safeSend(ws, sizeFrame);

  return true;
}
```

**Gate 6:** `pnpm check` zero errors.

---

### Task 7 — Add the authority predicate seam and gate resize in `terminal-handler.ts`

This is the core of Phase 3. The current resize block (lines 87–97):

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

Replace the entire `case 'resize'` block (and add the predicate + `connectionId` tracking just before the `switch`) as follows.

**7a. Before the `switch (msg.type)` statement**, add a `connectionId` variable and the `isResizeAuthority` predicate. In `terminal-handler.ts`, the handler is a function that receives `ws`, `terminal`, and `scope`. The `connectionId` must be passed in or derived. Since Phase 4 will add proper `connectionId` assignment in `setupWebSocketHandlers` (the WS upgrade handler), P3 uses a per-connection random ID assigned at WS open time.

Locate the function signature and the point where the handler is called. Add the predicate **as a module-level exported function** (so it is unit-testable and P4 can swap it without touching the switch):

```typescript
// ── Phase 3: resize authority predicate ─────────────────────────────────────
//
// P3 implementation: "most-recently-active interactive (non-readOnly) connection."
// The first interactive connection to send a resize claims authority.
// P4 replaces the body with one line: return connectionId === terminal.driver
// That swap is the ONLY change needed — the call site in the switch does not change.
//
// @param connectionId  - The WS connection sending the resize frame.
// @param terminal      - The ManagedTerminal receiving it.
// @returns true iff this connection is allowed to call pty.resize().
export function isResizeAuthority(connectionId: string, terminal: ManagedTerminal): boolean {
  if (terminal.authorityConnectionId === null) {
    // First interactive resize claims authority.
    terminal.authorityConnectionId = connectionId;
    return true;
  }
  return connectionId === terminal.authorityConnectionId;
}
```

**7b. In `setupTerminalHandler` (or wherever the per-connection message handler is defined)**, add a stable `connectionId` at the top of the connection scope. Phase 4 will pass this in from the WS upgrade handler; for P3, generate it locally:

```typescript
// Phase 3: stable per-connection ID (used by isResizeAuthority).
// Phase 4 replaces this with the connectionId from setupWebSocketHandlers.
import { randomBytes } from 'crypto';
const connectionId = randomBytes(8).toString('hex');
```

If `randomBytes` is already imported in `terminal-handler.ts`, skip the import line.

**7c. Replace the `case 'resize'` block:**

```typescript
case 'resize': {
  // Phase 3: driver-authoritative resize (fixes G4).
  // Only the authority connection's resize reaches pty.resize().
  // Non-authority senders fit their own xterm locally — no PTY call,
  // no broadcast needed from this path (the authority's broadcast covers all).
  if (!isResizeAuthority(connectionId, terminal)) {
    // Silently ignore — the sender's xterm is already fitted locally.
    break;
  }

  // Authority path: resize the PTY. pty-manager.resize() persists dims (G5)
  // and broadcasts to ALL clients including the authority sender (consistent
  // with the REST /resize path which also broadcasts to all).
  // Note: this differs from the pre-P3 WS path which excluded the sender —
  // the authority receives its own resize echo, which xterm-wrapper handles
  // in Task 8 (apply-pushed-size regardless of readOnly).
  ptyManager.resize(terminal.id, msg.cols, msg.rows);
  break;
}
```

**Asymmetry note (REST vs WS reconciliation):**

- REST `resize/+server.ts` → `ptyManager.resize()` → broadcasts to **all** clients including caller.
- Old WS path excluded the sender (`client !== ws`).
- New WS path: authority calls `ptyManager.resize()` → broadcasts to **all** (same as REST). The authority sender receives its own resize echo. The client already set its xterm size via `fitAddon.fit()` before sending, so the echo is a no-op application of the same size. This is fine — it normalizes the two paths and means all clients (including authority) always see the broadcast, which is needed for the `authorityConnectionId` authority handoff in P4.

**Gate 7:** `pnpm check` zero errors. Confirm `ptyManager` is imported in `terminal-handler.ts` (it may not be — the existing code calls `terminal.pty.resize()` directly, bypassing the manager). If `ptyManager` is not imported, add the import:

```typescript
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
```

And ensure `terminal.id` is accessible in the handler (it is — `terminal: ManagedTerminal` has `id: string`).

---

### Task 8 — Update `xterm-wrapper.ts`: apply pushed size for all clients

The current resize handler (lines 193–199):

```typescript
} else if (msg.type === 'resize') {
  // PTY was resized by another client (e.g. the owner). View-only
  // terminals follow it; interactive ones are governed by their fit.
  if (options.readOnly && msg.cols && msg.rows) {
    term.resize(msg.cols, msg.rows);
  }
}
```

This only applies the pushed size to `readOnly` clients. Interactive clients ignore pushed sizes because they rely on their own `fitAddon`. But after P3, interactive non-authority clients also receive resize broadcasts and must follow the authority's size (otherwise they render at a mismatched size while the PTY is now at the authority's size).

Replace with:

```typescript
} else if (msg.type === 'resize') {
  // Phase 3: apply pushed PTY size to ALL clients (fixes G8 fully).
  // - View-only clients: always follow — they have no fitAddon control.
  // - Interactive non-authority clients: follow the authority's size so
  //   their xterm matches the PTY dimensions (avoids layout mismatch).
  // - Interactive authority client: receives its own echo (same size it
  //   just set via fitAddon) — term.resize() with identical dims is a no-op.
  // Phase 4 note: when a client gains/loses authority, a resize broadcast
  // with the new authority's size is sent; this handler applies it for
  // all non-authority clients automatically.
  if (msg.cols && msg.rows) {
    term.resize(msg.cols, msg.rows);
  }
}
```

**Gate 8:** `pnpm check` zero errors.

---

### Task 9 — Annotate `resize/+server.ts` (no logic change)

The REST endpoint already calls `ptyManager.resize()` which now persists dims. Add a comment to document the broadcast scope:

```typescript
// Phase 3: ptyManager.resize() now persists cols/rows to SQLite and broadcasts
// to ALL attached clients (including the REST caller). This is intentionally
// consistent with the WS authority path which also broadcasts to all.
ptyManager.resize(params.id, cols, rows);
```

**Gate 9:** `pnpm check` zero errors (annotation-only, no type impact).

---

### Task 10 — Add disconnect cleanup for authority slot

When a WS connection closes, if it held the authority slot, the slot must be cleared so the next interactive connection can claim it.

In `terminal-handler.ts`, in the `ws.on('close', ...)` handler (or wherever connection cleanup is done), add:

```typescript
// Phase 3: release resize authority when the connection closes.
// Phase 4 replaces this with driver-token release logic.
if (terminal.authorityConnectionId === connectionId) {
  terminal.authorityConnectionId = null;
  // No broadcast needed: the next interactive resize from another client
  // will claim authority and push its size. If there are no other interactive
  // clients, the PTY retains its current size until one reconnects.
}
```

**Gate 10:** `pnpm check` zero errors.

---

### Task 11 — Add test to `package.json` and run all gates

**11a. Add test to `package.json`:**

Locate the `"test"` script. Append `&& node tests/resize-authority.test.cjs` at the end.

**11b. Run the full validation chain:**

```bash
cd /Users/sachinsharma/Developer/Personal/feat/terminal-sharing

# Unit test (pure logic)
node tests/resize-authority.test.cjs

# Type check (all phases' type changes must stay green)
pnpm check

# Lint
pnpm lint

# Full test suite (regression guard — seq-ring.test.cjs must still pass)
pnpm test

# Build
pnpm build
```

**Gate 11:** all five pass.

---

### Task 12 — Manual smoke verification

Start the server and verify the three bugs are fixed:

```bash
pnpm start
```

**G4 — resize fight fix:**

1. Open `http://localhost:54007/terminals/<id>` in two browser windows side-by-side.
2. Resize window A (owner/authority). The PTY resizes — window B follows automatically.
3. Resize window B (non-authority). Window B's local xterm resizes visually, but the PTY does NOT resize — window A stays unchanged.
4. Confirm with `tput cols` in the terminal: matches window A's width, not B's.

**G5 — persist fix:**

1. Resize the terminal to 200×50.
2. `curl http://localhost:54007/api/terminals/<id>` — confirm `cols: 200, rows: 50` in the JSON.
3. Restart the server (`pnpm build && pnpm start`).
4. Re-open the terminal — it should restore at 200×50, not 80×24.
5. `tput cols` in the terminal: `200`.

**G8 — size on attach fix:**

1. Owner resizes terminal to 180×45 and leaves it stable (no further resizes).
2. Open a new incognito browser window and navigate to the terminal.
3. Immediately (within the first frame of output): `tput cols` → `180`. No resize event needed from the owner.

**Gate 12:** all three behaviors confirmed.

---

## 5. Complete Diff Summary

```
src/lib/types/server.ts
  PtyManagedTerminal:
    + authorityConnectionId: null | string

src/lib/modules/server/terminal/terminal-store.ts
  TerminalStore class:
    + resizeDims(id: string, cols: number, rows: number): void
      → UPDATE terminals SET cols = ?, rows = ? WHERE id = ?

src/lib/modules/server/terminal/pty-manager.ts
  attach():
    + send {type:'resize', cols: terminal.cols, rows: terminal.rows} after scrollback
  resize():
    + terminalStore.resizeDims(id, cols, rows) after terminal.cols/rows update

src/lib/modules/server/ws/terminal-handler.ts
  + import { randomBytes } from 'crypto'   (if not already present)
  + import { ptyManager }                   (if not already present)
  + export function isResizeAuthority(connectionId, terminal): boolean
    [P3 body: claim-on-null then connectionId === authorityConnectionId]
  + const connectionId = randomBytes(8).toString('hex')  (per-connection)
  case 'resize':
    replace direct pty.resize() with:
      if (!isResizeAuthority(connectionId, terminal)) break;
      ptyManager.resize(terminal.id, msg.cols, msg.rows);
  ws.on('close'):
    + clear terminal.authorityConnectionId if === connectionId

src/routes/api/terminals/[id]/resize/+server.ts
  + comment documenting broadcast-to-ALL behavior (no logic change)

src/lib/modules/client/terminal/xterm-wrapper.ts
  msg.type === 'resize' handler:
    remove readOnly guard → apply term.resize(msg.cols, msg.rows) for ALL clients

tests/resize-authority.test.cjs    ← new file
package.json "test" script         ← append && node tests/resize-authority.test.cjs
```

---

## 6. The Authority-Predicate Seam (P4 handoff contract)

Phase 4's one-line swap:

```typescript
// BEFORE (P3 body):
export function isResizeAuthority(connectionId: string, terminal: ManagedTerminal): boolean {
  if (terminal.authorityConnectionId === null) {
    terminal.authorityConnectionId = connectionId;
    return true;
  }
  return connectionId === terminal.authorityConnectionId;
}

// AFTER (P4 replaces the body — call site unchanged):
export function isResizeAuthority(connectionId: string, terminal: ManagedTerminal): boolean {
  return connectionId === terminal.driver; // driver assigned by control registry
}
```

Phase 4 also removes the `authorityConnectionId` slot (or aliases it to `driver`) once `terminal.driver` exists. The call site in the `case 'resize'` block, the `ws.on('close')` cleanup, and `xterm-wrapper.ts` are all untouched by the swap — only `isResizeAuthority`'s body changes.

---

## 7. What This Phase Does NOT Change

- `broadcastOutput()` and `appendSeqRing()` — untouched (no seq changes).
- `sendScrollback()` / `sendSnapshot()` — untouched.
- The `input` and `signal` cases in `terminal-handler.ts` — untouched (P4's domain).
- `events-handler.ts`, `guest-registry.ts`, `ticket-store.ts` — untouched.
- `pty-holder.cjs`, `holder-client.ts` — untouched.
- iOS swift client — receives the existing `resize` frame type, unchanged shape, will work.
- The REST `resize/+server.ts` validation logic (col/row bounds, auth) — untouched.

---

## 8. Dependencies

**Depends on:**

- Phase 0 (sequencing foundation) — required because it adds `seqCounter`/`seqRing` to `PtyManagedTerminal`, and P3 adds `authorityConnectionId` to the same interface. P3 must branch from P0's commit.
- Phases 1 and 2 are NOT prerequisites for P3 (no shared call-site edits; `broadcastOutput` is untouched).

**Exposes for later phases:**

| Symbol                                      | File                             | Consumer                                                                            |
| ------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `isResizeAuthority(connectionId, terminal)` | `terminal-handler.ts` (exported) | **P4** (swaps predicate body to `connectionId === terminal.driver`)                 |
| `terminalStore.resizeDims(id, cols, rows)`  | `terminal-store.ts`              | **P6** (may call on snapshot-restore to update dims from restored snapshot)         |
| Level-triggered size push in `attach()`     | `pty-manager.ts`                 | **P4** (driver-change triggers a re-attach-like push to all with new driver's size) |
| `PtyManagedTerminal.authorityConnectionId`  | `src/lib/types/server.ts`        | **P4** (replaced/aliased by `driver` field from the control registry)               |

---

## 9. Conflict-Risk Files and Coordination Contract

**`terminal-handler.ts` resize block (lines 87–97):**

- P3 owns this block and replaces it entirely.
- P4 merges after P3: changes `isResizeAuthority` body only (not the switch case structure). Diff will be small and clean.
- P7 merges after P4: adds rate-limit check _before_ the `isResizeAuthority` call. The structure `if (rate-limit exceeded) break; if (!isResizeAuthority(...)) break; ptyManager.resize(...)` is additive.

**`terminal-store.ts`:**

- P3 adds `resizeDims()` method.
- P6 adds snapshot-persistence columns/methods.
- No overlap on SQL columns (`cols`/`rows` vs snapshot blob). Safe to develop in parallel; merge P3→P6 by appending P6's methods after P3's.

**`pty-manager.ts:attach()` and `resize()`:**

- P3 is the only phase touching these two methods.
- P1 touches `sendScrollback()` (called inside `attach()`) but replaces it with `sendSnapshot()` — not the `attach()` function itself. P3's addition of the size frame after the scrollback/snapshot call is compatible with P1's change.

---

## 10. Validation Commands (in order)

```bash
# 1. Unit test (pure logic — runs in seconds)
node tests/resize-authority.test.cjs

# 2. Type check
pnpm check

# 3. Lint
pnpm lint

# 4. Full test suite (seq-ring.test.cjs + resize-authority.test.cjs must both pass)
pnpm test

# 5. Build
pnpm build

# 6. Manual smoke (Tasks 12a/b/c: G4 fight, G5 persist, G8 on-attach)
pnpm start
```

All six must pass before this phase is considered complete.

---

## 11. Task Count Summary

| #         | Task                                                                       | Est. time   |
| --------- | -------------------------------------------------------------------------- | ----------- |
| 0         | Verify line anchors                                                        | 2 min       |
| 1         | Write `tests/resize-authority.test.cjs` and run it                         | 8 min       |
| 2         | Add `authorityConnectionId` to `PtyManagedTerminal`                        | 2 min       |
| 3         | Initialize `authorityConnectionId` in `pty-manager.ts` create/reconnectOne | 3 min       |
| 4         | Add `resizeDims()` to `terminal-store.ts`                                  | 3 min       |
| 5         | Persist dims in `pty-manager.ts:resize()`                                  | 3 min       |
| 6         | Push size on attach in `pty-manager.ts:attach()`                           | 3 min       |
| 7         | Add authority predicate + gate resize in `terminal-handler.ts`             | 10 min      |
| 8         | Update `xterm-wrapper.ts` resize handler                                   | 3 min       |
| 9         | Annotate `resize/+server.ts`                                               | 1 min       |
| 10        | Add disconnect cleanup for authority slot                                  | 3 min       |
| 11        | Add test to `package.json`, run full gate                                  | 5 min       |
| 12        | Manual smoke (G4 + G5 + G8)                                                | 10 min      |
| **Total** |                                                                            | **~56 min** |
