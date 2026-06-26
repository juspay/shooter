/**
 * Integration test: APNs fan-out classification → registry pruning.
 *
 * Wires the real summarizeApnsFanOut (decides which tokens are stale) to the
 * real DeviceTokenStore.pruneByTokens (deactivates them), proving the lazy
 * prune path the /api/notify route runs after every fan-out. Loaded via tsx
 * against an isolated temp dir.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SINGLETON_HOME = path.join(os.tmpdir(), 'shooter-test-prune-home');
process.env.SHOOTER_HOME = SINGLETON_HOME;

require('tsx/cjs');

const { DeviceTokenStore } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'push', 'device-token-store.ts')
);
const { summarizeApnsFanOut } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-classify.ts')
);

const DATA_DIR = path.join(os.tmpdir(), 'shooter-test-prune');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  let store;
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    store = new DeviceTokenStore(DATA_DIR);
    fn(store);
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  } finally {
    if (store) store.close();
  }
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

console.log('\ndevice-registry prune integration tests\n');

runTest(
  'Test 1: a BadDeviceToken (env match) is classified stale and pruned from the registry',
  (s) => {
    const reg = '2026-06-01T00:00:00.000Z';
    s.upsert({ appEnv: 'sandbox', deviceId: 'devA', platform: 'ios', token: 'tok-ok' });
    s.upsert({ appEnv: 'sandbox', deviceId: 'devB', platform: 'ios', token: 'tok-dead' });
    s.upsert({ appEnv: 'sandbox', deviceId: 'devC', platform: 'ios', token: 'tok-transient' });
    assertEqual(s.listActive('ios').length, 3, 'three registered');

    // Simulate the fan-out delivery outcomes the route would collect.
    const summary = summarizeApnsFanOut(
      [
        {
          appEnv: 'sandbox',
          httpStatus: 200,
          reason: null,
          registeredAt: reg,
          timestampMs: 0,
          token: 'tok-ok',
        },
        {
          appEnv: 'sandbox',
          httpStatus: 400,
          reason: 'BadDeviceToken',
          registeredAt: reg,
          timestampMs: 0,
          token: 'tok-dead',
        },
        {
          appEnv: 'sandbox',
          httpStatus: 503,
          reason: 'ServiceUnavailable',
          registeredAt: reg,
          timestampMs: 0,
          token: 'tok-transient',
        },
      ],
      'sandbox'
    );
    assertEqual(summary.staleTokens, ['tok-dead'], 'only the dead token is stale');

    // The route's lazy prune.
    const pruned = s.pruneByTokens(summary.staleTokens);
    assertEqual(pruned, 1, 'one row pruned');

    const active = s
      .listActive('ios')
      .map((r) => r.token)
      .sort();
    assertEqual(active, ['tok-ok', 'tok-transient'], 'dead token gone; transient one kept');
  }
);

runTest('Test 2: env-mismatch BadDeviceToken is NOT pruned (kept alive)', (s) => {
  const reg = '2026-06-01T00:00:00.000Z';
  s.upsert({ appEnv: 'sandbox', deviceId: 'devA', platform: 'ios', token: 'tok-sandbox' });
  // Server running production gateway; a sandbox token returns BadDeviceToken
  // but must NOT be pruned (it is our config, not a dead device).
  const summary = summarizeApnsFanOut(
    [
      {
        appEnv: 'sandbox',
        httpStatus: 400,
        reason: 'BadDeviceToken',
        registeredAt: reg,
        timestampMs: 0,
        token: 'tok-sandbox',
      },
    ],
    'production'
  );
  const pruned = s.pruneByTokens(summary.staleTokens);
  assertEqual(pruned, 0, 'nothing pruned');
  assertEqual(s.listActive('ios').length, 1, 'device kept');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(SINGLETON_HOME, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
