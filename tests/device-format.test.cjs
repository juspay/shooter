/**
 * Unit tests for src/lib/modules/server/push/device-format.ts
 *
 * Pure presentation logic for the GET /api/device-token response: token
 * masking (so the registered-devices list never leaks a full push token) and
 * the DeviceRecord → DeviceListItem shaper. Route handlers themselves are
 * verified end-to-end against the running server, not here (they import the
 * SvelteKit-only $env/dynamic/private virtual module).
 *
 * Loads the real TS module via tsx/cjs (the $lib/types import is type-only).
 */

'use strict';

const path = require('path');

require('tsx/cjs');

const { maskToken, toDeviceListItem } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'push', 'device-format.ts')
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

function assertTrue(cond, label) {
  if (!cond) {
    throw new Error(`${label}: expected true`);
  }
}

console.log('\ndevice-format unit tests\n');

const HEX64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

runTest('Test 1: maskToken shows a short prefix + suffix and hides the middle', () => {
  const masked = maskToken(HEX64);
  assertEqual(masked, 'a1b2c3…8f90', 'masked form');
  assertTrue(!masked.includes(HEX64.slice(10, 50)), 'middle of the token is not present');
  assertTrue(masked.length < HEX64.length, 'masked string is shorter than the raw token');
});

runTest('Test 2: maskToken masks short tokens too (no near-full reveal)', () => {
  assertEqual(maskToken('shorttoken'), 'sh…en', 'short token masked');
});

runTest('Test 3: maskToken handles empty / missing input', () => {
  assertEqual(maskToken(''), '', 'empty string');
  assertEqual(maskToken(undefined), '', 'undefined');
  assertEqual(maskToken(null), '', 'null');
});

runTest('Test 4: toDeviceListItem maps fields, masks the token, omits the raw token', () => {
  const record = {
    appEnv: 'production',
    bundleId: 'com.example.app',
    deviceId: 'dev-uuid-1',
    failureCount: 0,
    friendlyName: "Sachin's iPhone",
    id: 'row-1',
    isActive: true,
    lastSeenAt: '2026-06-20T10:00:00.000Z',
    platform: 'ios',
    registeredAt: '2026-06-19T10:00:00.000Z',
    token: HEX64,
  };
  const item = toDeviceListItem(record);
  assertEqual(item.id, 'row-1', 'id');
  assertEqual(item.platform, 'ios', 'platform');
  assertEqual(item.appEnv, 'production', 'appEnv');
  assertEqual(item.deviceId, 'dev-uuid-1', 'deviceId');
  assertEqual(item.friendlyName, "Sachin's iPhone", 'friendlyName');
  assertEqual(item.tokenMasked, 'a1b2c3…8f90', 'tokenMasked');
  assertEqual(item.registeredAt, '2026-06-19T10:00:00.000Z', 'registeredAt');
  assertEqual(item.lastSeenAt, '2026-06-20T10:00:00.000Z', 'lastSeenAt');
  assertEqual(item.isActive, true, 'isActive');
  assertEqual(item.failureCount, 0, 'failureCount');
  assertTrue(!('token' in item), 'raw token field is NOT present in the API shape');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

process.exit(failed > 0 ? 1 : 0);
