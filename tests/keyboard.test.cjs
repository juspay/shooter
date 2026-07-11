'use strict';

require('tsx/cjs');

const path = require('path');
const mod = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'common', 'keyboard.ts')
);
const { computeKeyboardInset } = mod;

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

console.log('keyboard inset geometry\n');

runTest('no inset when the keyboard is closed (viewport equals layout)', () => {
  assertEqual(computeKeyboardInset(844, 844, 0), 0, 'closed');
});

runTest('inset equals the keyboard height when open', () => {
  assertEqual(computeKeyboardInset(844, 500, 0), 344, 'open');
});

runTest('subtracts the visual-viewport offsetTop', () => {
  assertEqual(computeKeyboardInset(844, 500, 44), 300, 'with offset');
});

runTest('clamps to 0 when the viewport is taller than the layout', () => {
  assertEqual(computeKeyboardInset(844, 900, 0), 0, 'clamped');
});

runTest('clamps to 0 when offset alone would push it negative', () => {
  assertEqual(computeKeyboardInset(844, 844, 100), 0, 'clamped offset');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
