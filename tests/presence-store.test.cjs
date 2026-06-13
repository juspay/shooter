/**
 * Unit tests for src/lib/modules/server/ws/presence-store.ts
 *
 * The presence store decides "is a viewer actually watching" (foreground) vs "away",
 * independent of raw WebSocket connection count (the autonomous loop holds a persistent
 * WS, so connection-count is no longer a valid proxy for attention). Pure TTL logic with
 * `now` passed in for determinism.
 *
 * Loads the TS module via tsx/cjs (the $lib/types import is type-only → erased).
 */

'use strict';

require('tsx/cjs');

const path = require('path');
const { hasEverReported, isViewerPresent, reportPresence } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'ws', 'presence-store.ts')
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
  if (actual !== expected) {
    throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const TTL = 45_000;

// Must run FIRST, before any report mutates the shared global singleton.
runTest('hasEverReported is false before any report', () => {
  assertEqual(hasEverReported(), false, 'everReported');
});

runTest('foreground within TTL → viewer present', () => {
  reportPresence('foreground', 100_000);
  assertEqual(isViewerPresent(100_000 + 44_000, TTL), true, 'present within TTL');
});

runTest('foreground beyond TTL → away (stale heartbeat)', () => {
  reportPresence('foreground', 100_000);
  assertEqual(isViewerPresent(100_000 + 46_000, TTL), false, 'away beyond TTL');
});

runTest('background report → away immediately', () => {
  reportPresence('background', 200_000);
  assertEqual(isViewerPresent(200_001, TTL), false, 'away after background');
});

runTest('a later foreground report overrides an earlier background', () => {
  reportPresence('background', 300_000);
  reportPresence('foreground', 301_000);
  assertEqual(isViewerPresent(302_000, TTL), true, 'present after re-foreground');
});

runTest('hasEverReported flips true after a report', () => {
  reportPresence('foreground', 1);
  assertEqual(hasEverReported(), true, 'everReported');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
