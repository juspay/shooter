/**
 * Tests for the terminal guardrails (G1 + G2 of plans/WORK-IN-SHOOTER.md).
 *
 * G1 — cwd is validated when a terminal is created and never again. A terminal
 * whose directory has been deleted (e.g. `workforge close` removed the worktree
 * it lived in) keeps status=running and is faithfully restored on every server
 * restart, so it looks alive but cannot run a command.
 *
 * G2 — nothing bounds how many terminals run at once. Each costs a detached
 * holder process plus cached scrollback and a replay ring, so the footprint
 * should stay deliberate rather than accumulating silently.
 */

'use strict';
require('tsx/cjs');
const path = require('path');
const {
  MAX_RUNNING_TERMINALS,
  TERMINAL_WARN_THRESHOLD,
  assessCapacity,
  evaluateReconnect,
} = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'terminal', 'terminal-guards.ts')
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

console.log('\nterminal guardrail unit tests\n');

// --- G1: evaluateReconnect -------------------------------------------------

const record = (over) => ({ cwd: '/Users/x/project', id: 't1', socketPath: '/tmp/s.sock', ...over });

runTest('reconnects a terminal whose directory still exists', () => {
  const r = evaluateReconnect(record(), true);
  assert(r.action === 'reconnect', `expected reconnect, got ${r.action}`);
});

runTest('REGRESSION: orphans a terminal whose directory was deleted', () => {
  const r = evaluateReconnect(record({ cwd: '/Users/x/worktree-that-was-closed' }), false);
  assert(
    r.action === 'orphan',
    'a terminal in a deleted directory must not be restored as running'
  );
  assert(typeof r.reason === 'string' && r.reason.length > 0, 'orphaning must explain why');
  assert(
    r.reason.includes('worktree-that-was-closed'),
    `reason should name the missing directory, got: ${r.reason}`
  );
});

// TerminalRecord types these as `string | null`, so null is the shape that
// actually reaches this function; '' only arises from a malformed record.
runTest('orphans a record with no socket path regardless of the directory', () => {
  assert(evaluateReconnect(record({ socketPath: null }), true).action === 'orphan', 'null socket');
  assert(evaluateReconnect(record({ socketPath: '' }), true).action === 'orphan', 'empty socket');
});

runTest('orphans a record with no cwd rather than guessing', () => {
  assert(evaluateReconnect(record({ cwd: null }), true).action === 'orphan', 'null cwd');
  assert(evaluateReconnect(record({ cwd: '' }), true).action === 'orphan', 'empty cwd');
});

// --- G2: assessCapacity ----------------------------------------------------

runTest('exposes a warn threshold below the hard cap', () => {
  assert(
    TERMINAL_WARN_THRESHOLD < MAX_RUNNING_TERMINALS,
    `warn (${TERMINAL_WARN_THRESHOLD}) must be below cap (${MAX_RUNNING_TERMINALS})`
  );
});

runTest('allows creation well below the threshold, without warning', () => {
  const r = assessCapacity(3);
  assert(r.allowed === true, 'should allow');
  assert(r.warn === false, 'should not warn');
});

runTest('still allows at the warn threshold, but warns', () => {
  const r = assessCapacity(TERMINAL_WARN_THRESHOLD);
  assert(r.allowed === true, 'warning must not block work');
  assert(r.warn === true, 'should warn');
  assert(typeof r.reason === 'string' && r.reason.length > 0, 'warning should explain');
});

runTest('REGRESSION: refuses to exceed the hard cap', () => {
  const r = assessCapacity(MAX_RUNNING_TERMINALS);
  assert(r.allowed === false, 'at the cap, creation must be refused');
  assert(typeof r.reason === 'string' && r.reason.length > 0, 'refusal must explain');
  assert(
    r.reason.includes(String(MAX_RUNNING_TERMINALS)),
    `refusal should state the cap, got: ${r.reason}`
  );
});

runTest('stays refused above the cap', () => {
  assert(assessCapacity(MAX_RUNNING_TERMINALS + 5).allowed === false, 'still refused');
});

runTest('treats a nonsense count as allowed rather than bricking creation', () => {
  assert(assessCapacity(-1).allowed === true, 'negative count should not block');
  assert(assessCapacity(Number.NaN).allowed === true, 'NaN should not block');
});

// --- G2 concurrency: synchronous slot reservation ---------------------------
//
// The capacity check used to run in the route: count running terminals, then
// `await ptyManager.create(...)`. create() awaits a holder fork and a socket
// connect before registering the terminal, so two concurrent requests could
// both observe the same count and both create — and because holders are
// detached and survive restarts, the overshoot is permanent, not transient.

const { ptyManager } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'terminal', 'pty-manager.ts')
);

runTest('REGRESSION: concurrent reservations cannot exceed the cap', () => {
  const held = [];
  try {
    for (let i = 0; i < MAX_RUNNING_TERMINALS; i++) {
      const slot = ptyManager.reserveCreateSlot();
      assert(slot.allowed === true, `reservation ${i + 1} should be allowed`);
      held.push(slot);
    }
    // Nothing has been created yet — every slot is still only reserved. A
    // count-then-create check would allow this one through.
    const overflow = ptyManager.reserveCreateSlot();
    assert(
      overflow.allowed === false,
      'a reservation past the cap must be refused even before any create resolves'
    );
  } finally {
    for (let i = 0; i < held.length; i++) {
      ptyManager.releaseCreateSlot();
    }
  }
});

runTest('released reservations become available again', () => {
  const slot = ptyManager.reserveCreateSlot();
  assert(slot.allowed === true, 'should reserve');
  ptyManager.releaseCreateSlot();
  const again = ptyManager.reserveCreateSlot();
  assert(again.allowed === true, 'slot should be reusable after release');
  ptyManager.releaseCreateSlot();
});

runTest('releasing more than reserved never drives the count negative', () => {
  ptyManager.releaseCreateSlot();
  ptyManager.releaseCreateSlot();
  const slot = ptyManager.reserveCreateSlot();
  assert(slot.allowed === true, 'a stray release must not corrupt the counter');
  ptyManager.releaseCreateSlot();
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
