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
