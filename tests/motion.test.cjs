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
