'use strict';

require('tsx/cjs');

const path = require('path');
const mod = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'common', 'pull-refresh.ts')
);
const { resistPull, shouldTriggerRefresh } = mod;

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

function assertTrue(cond, label) {
  if (!cond) {
    throw new Error(label || 'assertTrue failed');
  }
}

console.log('pull-refresh gesture math\n');

runTest('resistPull returns 0 for no drag', () => {
  assertEqual(resistPull(0), 0, 'zero');
});

runTest('resistPull returns 0 for an upward (negative) drag', () => {
  assertEqual(resistPull(-80), 0, 'negative');
});

runTest('resistPull returns 0 when max is non-positive', () => {
  assertEqual(resistPull(100, 0), 0, 'zero max');
});

runTest('resistPull is monotonically increasing with drag', () => {
  assertTrue(resistPull(100) > resistPull(50), 'monotonic 100>50');
  assertTrue(resistPull(50) > resistPull(20), 'monotonic 50>20');
});

runTest('resistPull never exceeds the max cap', () => {
  assertTrue(resistPull(10_000, 120) <= 120, 'never above cap');
  assertTrue(resistPull(10_000, 120) > 119.9, 'approaches cap');
});

runTest('resistPull moves nearly 1:1 for a small initial drag', () => {
  // At 12px with max 120, eased ~= 11.4px — within 10% of raw.
  const eased = resistPull(12, 120);
  assertTrue(eased > 10.8 && eased < 12, `small-drag easing (${eased})`);
});

runTest('shouldTriggerRefresh is true at and above the threshold', () => {
  assertEqual(shouldTriggerRefresh(64), true, 'at threshold');
  assertEqual(shouldTriggerRefresh(100), true, 'above threshold');
});

runTest('shouldTriggerRefresh is false below the threshold', () => {
  assertEqual(shouldTriggerRefresh(63.9), false, 'just below');
  assertEqual(shouldTriggerRefresh(0), false, 'zero');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
