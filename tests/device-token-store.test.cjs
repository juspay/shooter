/**
 * Unit tests for src/lib/modules/server/push/device-token-store.ts
 *
 * The DeviceTokenStore is the SQLite-backed registry that replaces the flat
 * ~/.shooter/device-tokens.json. It supports any number of devices per
 * platform, idempotent upsert with token-rotation by deviceId, lazy stale
 * pruning, a 30-day inactive-row cleanup, and migration from the legacy JSON
 * file + a setup-wizard seed file.
 *
 * Loads the REAL TS module via tsx/cjs (the $lib/types import is type-only →
 * erased by esbuild). Each test runs against an isolated temp data dir so the
 * user's real ~/.shooter is never touched. `now` is injected for determinism
 * (same idiom as presence-store.test.cjs).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the eager module-level singleton's default dir away from ~/.shooter.
const SINGLETON_HOME = path.join(os.tmpdir(), 'shooter-test-devtokens-home');
process.env.SHOOTER_HOME = SINGLETON_HOME;

require('tsx/cjs');

const { DeviceTokenStore } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'push', 'device-token-store.ts')
);
const { isDeviceRecord } = require(path.join(__dirname, '..', 'src', 'lib', 'types', 'device.ts'));

// ── Per-test isolated data dir ───────────────────────────────────────

const DATA_DIR = path.join(os.tmpdir(), 'shooter-test-devtokens');

function freshStore() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  return new DeviceTokenStore(DATA_DIR);
}

function writeFile(name, contents) {
  fs.writeFileSync(path.join(DATA_DIR, name), contents);
}

function exists(name) {
  return fs.existsSync(path.join(DATA_DIR, name));
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeInput(overrides = {}) {
  return {
    appEnv: 'sandbox',
    bundleId: null,
    deviceId: null,
    friendlyName: null,
    platform: 'ios',
    token: 'tok-' + Math.random().toString(36).slice(2, 10),
    ...overrides,
  };
}

const T0 = new Date('2025-01-01T00:00:00.000Z');
const T1 = new Date('2025-01-02T00:00:00.000Z');

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function assertNotNull(value, label) {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected non-null value`);
  }
}

// ── Harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  let store;
  try {
    store = freshStore();
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

console.log('\nDeviceTokenStore unit tests\n');

// ── Tests ────────────────────────────────────────────────────────────

runTest('Test 1: upsert inserts a new iOS token; listActive returns it', (s) => {
  s.upsert(makeInput({ token: 'tok-ios-1', platform: 'ios', friendlyName: 'iPhone 15' }));
  const list = s.listActive('ios');
  assertEqual(list.length, 1, 'listActive count');
  assertEqual(list[0].token, 'tok-ios-1', 'token');
  assertEqual(list[0].platform, 'ios', 'platform');
  assertEqual(list[0].appEnv, 'sandbox', 'appEnv');
  assertEqual(list[0].friendlyName, 'iPhone 15', 'friendlyName');
  assertEqual(list[0].isActive, true, 'isActive');
  assertEqual(list[0].failureCount, 0, 'failureCount');
  assertNotNull(list[0].id, 'id generated');
  assertNotNull(list[0].registeredAt, 'registeredAt');
});

runTest('Test 2: upsert same token — no duplicate; last_seen_at updated', (s) => {
  s.upsert(makeInput({ token: 'tok-x', deviceId: null }), T0);
  s.upsert(makeInput({ token: 'tok-x', deviceId: null }), T1);
  const list = s.listActive('ios');
  assertEqual(list.length, 1, 'no duplicate row');
  assertEqual(list[0].lastSeenAt, T1.toISOString(), 'last_seen_at updated');
  assertEqual(list[0].registeredAt, T0.toISOString(), 'registered_at preserved');
});

runTest('Test 3: upsert by deviceId rotation — same deviceId, new token updates row', (s) => {
  s.upsert(makeInput({ token: 'rot-1', deviceId: 'devA', platform: 'ios' }), T0);
  s.upsert(makeInput({ token: 'rot-2', deviceId: 'devA', platform: 'ios' }), T1);
  const list = s.listActive('ios');
  assertEqual(list.length, 1, 'rotation updates in place — one row');
  assertEqual(list[0].token, 'rot-2', 'token rotated');
  assertEqual(list[0].deviceId, 'devA', 'deviceId stable');
  assertEqual(list[0].registeredAt, T0.toISOString(), 'registered_at preserved on rotation');
  assertEqual(list[0].lastSeenAt, T1.toISOString(), 'last_seen_at updated on rotation');
});

runTest('Test 4: listActive(ios) returns only iOS active rows', (s) => {
  s.upsert(makeInput({ token: 'a', platform: 'ios', deviceId: 'd1' }));
  s.upsert(makeInput({ token: 'b', platform: 'android', deviceId: 'd2' }));
  const ios = s.listActive('ios');
  assertEqual(ios.length, 1, 'ios count');
  assertEqual(ios[0].platform, 'ios', 'ios platform');
  assertEqual(ios[0].token, 'a', 'ios token');
});

runTest('Test 5: listActive(android) returns only Android active rows', (s) => {
  s.upsert(makeInput({ token: 'a', platform: 'ios', deviceId: 'd1' }));
  s.upsert(makeInput({ token: 'b', platform: 'android', deviceId: 'd2' }));
  const android = s.listActive('android');
  assertEqual(android.length, 1, 'android count');
  assertEqual(android[0].platform, 'android', 'android platform');
  assertEqual(android[0].token, 'b', 'android token');
});

runTest('Test 6: listActive on empty table returns []', (s) => {
  assertEqual(s.listActive('ios'), [], 'empty ios');
  assertEqual(s.listActive('android'), [], 'empty android');
});

runTest('Test 7: two distinct iOS devices coexist', (s) => {
  s.upsert(makeInput({ token: 'c1', platform: 'ios', deviceId: 'dev-1' }));
  s.upsert(makeInput({ token: 'c2', platform: 'ios', deviceId: 'dev-2' }));
  const ios = s.listActive('ios');
  assertEqual(ios.length, 2, 'both devices active');
  const tokens = ios.map((r) => r.token).sort();
  assertEqual(tokens, ['c1', 'c2'], 'both tokens present');
});

runTest('Test 8: pruneByTokens([token1]) deactivates only token1', (s) => {
  s.upsert(makeInput({ token: 'p1', deviceId: 'd1' }));
  s.upsert(makeInput({ token: 'p2', deviceId: 'd2' }));
  const n = s.pruneByTokens(['p1']);
  assertEqual(n, 1, 'one row pruned');
  const ios = s.listActive('ios');
  assertEqual(ios.length, 1, 'one active remains');
  assertEqual(ios[0].token, 'p2', 'p2 still active');
});

runTest('Test 9: pruneByTokens([]) — no rows affected', (s) => {
  s.upsert(makeInput({ token: 'p1', deviceId: 'd1' }));
  assertEqual(s.pruneByTokens([]), 0, 'no-op on empty list');
  assertEqual(s.listActive('ios').length, 1, 'row untouched');
});

runTest('Test 10: pruneByTokens([nonexistent]) — 0 rows, no error', (s) => {
  s.upsert(makeInput({ token: 'p1', deviceId: 'd1' }));
  assertEqual(s.pruneByTokens(['does-not-exist']), 0, 'no rows matched');
  assertEqual(s.listActive('ios').length, 1, 'row untouched');
});

runTest('Test 11: startupCleanup deletes inactive rows older than 30 days', (s) => {
  s.upsert(makeInput({ token: 'old', deviceId: 'd1' }), T0);
  s.pruneByTokens(['old']); // is_active = 0
  const future = new Date(T0.getTime() + 31 * 24 * 60 * 60 * 1000);
  const deleted = s.startupCleanup(future);
  assertEqual(deleted, 1, 'one inactive old row deleted');
  assertEqual(s.getByToken('old'), null, 'row hard-deleted');
});

runTest('Test 12: startupCleanup retains active recent rows', (s) => {
  s.upsert(makeInput({ token: 'fresh', deviceId: 'd1' }), T0);
  const deleted = s.startupCleanup(T0);
  assertEqual(deleted, 0, 'nothing deleted');
  assertEqual(s.listActive('ios').length, 1, 'fresh row retained');
});

runTest('Test 13: startupCleanup retains active rows older than 30 days', (s) => {
  s.upsert(makeInput({ token: 'oldactive', deviceId: 'd1' }), T0);
  const future = new Date(T0.getTime() + 31 * 24 * 60 * 60 * 1000);
  const deleted = s.startupCleanup(future);
  assertEqual(deleted, 0, 'active rows never pruned by age');
  assertNotNull(s.getByToken('oldactive'), 'old active row retained');
});

runTest('Test 14: migration from legacy string shape {ios:"abc"} → one row', (s) => {
  writeFile('device-tokens.json', JSON.stringify({ ios: 'abc' }));
  s.migrate(T0);
  const ios = s.listActive('ios');
  assertEqual(ios.length, 1, 'one migrated row');
  assertEqual(ios[0].token, 'abc', 'token migrated');
  assertEqual(exists('device-tokens.json'), false, 'legacy file renamed away');
  assertEqual(exists('device-tokens.json.migrated'), true, 'renamed to .migrated');
});

runTest('Test 15: migration from legacy string[] shape → two rows', (s) => {
  writeFile('device-tokens.json', JSON.stringify({ ios: ['abc', 'def'] }));
  s.migrate(T0);
  const ios = s.listActive('ios');
  assertEqual(ios.length, 2, 'two migrated rows');
  const tokens = ios.map((r) => r.token).sort();
  assertEqual(tokens, ['abc', 'def'], 'both tokens migrated');
});

runTest('Test 16: migration is idempotent — running twice keeps one row', (s) => {
  writeFile('device-tokens.json', JSON.stringify({ ios: 'abc' }));
  s.migrate(T0);
  s.migrate(T0);
  assertEqual(s.listActive('ios').length, 1, 'no duplicate on second migrate');
});

runTest('Test 17: deleteById soft-deletes (is_active = 0)', (s) => {
  const rec = s.upsert(makeInput({ token: 'del', deviceId: 'd1' }));
  const n = s.deleteById(rec.id);
  assertEqual(n, 1, 'one row affected');
  assertEqual(s.listActive('ios').length, 0, 'no longer active');
  const got = s.getByToken('del');
  assertNotNull(got, 'row still present (soft delete)');
  assertEqual(got.isActive, false, 'is_active = 0');
});

runTest('Test 18: app_env filter — listActiveForEnv excludes mismatched env', (s) => {
  s.upsert(makeInput({ token: 'sb', deviceId: 'd1', appEnv: 'sandbox' }));
  s.upsert(makeInput({ token: 'pr', deviceId: 'd2', appEnv: 'production' }));
  const prod = s.listActiveForEnv('ios', 'production');
  assertEqual(prod.length, 1, 'one production row');
  assertEqual(prod[0].token, 'pr', 'production token');
  const sand = s.listActiveForEnv('ios', 'sandbox');
  assertEqual(sand.length, 1, 'one sandbox row');
  assertEqual(sand[0].token, 'sb', 'sandbox token');
});

runTest('Test 19: identity-theft guard — conflicting token keeps original deviceId', (s) => {
  s.upsert(makeInput({ token: 'shared', deviceId: 'devA', platform: 'ios' }));
  s.upsert(makeInput({ token: 'shared', deviceId: 'devB', platform: 'ios' }));
  const got = s.getByToken('shared');
  assertEqual(got.deviceId, 'devA', 'original deviceId preserved');
  assertEqual(got.isActive, true, 'record still active after theft attempt');
  assertEqual(s.listActive('ios').length, 1, 'no phantom row inserted for the thief');
});

runTest('Test 20: touchLastSeen updates last_seen_at for the token', (s) => {
  s.upsert(makeInput({ token: 'touch', deviceId: 'd1' }), T0);
  assertEqual(s.getByToken('touch').lastSeenAt, T0.toISOString(), 'baseline last_seen');
  const n = s.touchLastSeen(['touch'], T1);
  assertEqual(n, 1, 'one row touched');
  assertEqual(s.getByToken('touch').lastSeenAt, T1.toISOString(), 'last_seen advanced');
});

runTest('Test 21: old-app null deactivation — new null row deactivates prior null rows', (s) => {
  s.upsert(makeInput({ token: 'null1', deviceId: null, platform: 'ios' }));
  s.upsert(makeInput({ token: 'null2', deviceId: null, platform: 'ios' }));
  const ios = s.listActive('ios');
  assertEqual(ios.length, 1, 'only newest null-device row active');
  assertEqual(ios[0].token, 'null2', 'newest token active');
  const old = s.getByToken('null1');
  assertNotNull(old, 'prior null row still present');
  assertEqual(old.isActive, false, 'prior null row deactivated');
});

runTest('Test 22: seed file migration — produces rows, renamed to .processed', (s) => {
  writeFile('device-token-seeds.json', JSON.stringify({ ios: 'seedtok', android: 'seedandroid' }));
  s.migrate(T0);
  assertEqual(s.listActive('ios')[0].token, 'seedtok', 'ios seed migrated');
  assertEqual(s.listActive('android')[0].token, 'seedandroid', 'android seed migrated');
  assertEqual(exists('device-token-seeds.json'), false, 'seed file renamed away');
  assertEqual(exists('device-token-seeds.json.processed'), true, 'renamed to .processed');
});

runTest(
  'Test 23: rotation onto a token recycled from another device succeeds (no UNIQUE crash)',
  (s) => {
    s.upsert(makeInput({ token: 'recycled', deviceId: 'devB', platform: 'ios' }), T0);
    s.upsert(makeInput({ token: 'tokA', deviceId: 'devA', platform: 'ios' }), T0);
    // APNs reissues 'recycled' to devA; devA rotates onto it.
    const rec = s.upsert(makeInput({ token: 'recycled', deviceId: 'devA', platform: 'ios' }), T1);
    assertEqual(rec.deviceId, 'devA', 'devA now owns the recycled token');
    assertEqual(rec.token, 'recycled', 'token assigned to devA');
    const ios = s.listActive('ios');
    assertEqual(ios.length, 1, 'only devA active — stale owner retired, old token rotated away');
    assertEqual(ios[0].deviceId, 'devA', 'devA is the active device');
    assertEqual(s.getByToken('tokA'), null, "devA's old token no longer present");
  }
);

runTest('Test 24: rotation preserves friendly_name when the new call passes null', (s) => {
  s.upsert(makeInput({ token: 'rot-fn-1', deviceId: 'devFN', friendlyName: 'iPhone 15' }), T0);
  s.upsert(makeInput({ token: 'rot-fn-2', deviceId: 'devFN', friendlyName: null }), T1);
  const list = s.listActive('ios');
  assertEqual(list.length, 1, 'one row after rotation');
  assertEqual(list[0].token, 'rot-fn-2', 'token rotated');
  assertEqual(list[0].friendlyName, 'iPhone 15', 'friendly_name preserved by COALESCE');
});

runTest(
  'Test 25: token-conflict upsert preserves friendly_name when the new call passes null',
  (s) => {
    s.upsert(makeInput({ token: 'conf-fn', deviceId: null, friendlyName: 'iPad Pro' }), T0);
    s.upsert(makeInput({ token: 'conf-fn', deviceId: null, friendlyName: null }), T1);
    const got = s.getByToken('conf-fn');
    assertEqual(got.friendlyName, 'iPad Pro', 'friendly_name preserved on ON CONFLICT DO UPDATE');
  }
);

runTest('Test 26: rotation works for Android (platform binding correct)', (s) => {
  s.upsert(makeInput({ token: 'rot-a1', deviceId: 'devA', platform: 'android' }), T0);
  s.upsert(makeInput({ token: 'rot-a2', deviceId: 'devA', platform: 'android' }), T1);
  const list = s.listActive('android');
  assertEqual(list.length, 1, 'rotation updates in place — one Android row');
  assertEqual(list[0].token, 'rot-a2', 'Android token rotated');
  assertEqual(list[0].deviceId, 'devA', 'Android deviceId stable');
});

runTest('Test 27: listActive returns most-recently-seen device first (ORDER BY DESC)', (s) => {
  s.upsert(makeInput({ token: 'older', platform: 'ios', deviceId: 'dev-1' }), T0);
  s.upsert(makeInput({ token: 'newer', platform: 'ios', deviceId: 'dev-2' }), T1);
  const ios = s.listActive('ios');
  assertEqual(ios.length, 2, 'both devices active');
  assertEqual(ios[0].token, 'newer', 'most-recently-seen first');
  assertEqual(ios[1].token, 'older', 'least-recently-seen last');
});

runTest('Test 28: startupCleanup keys off last_seen_at, not registered_at', (s) => {
  s.upsert(makeInput({ token: 'old', deviceId: 'd1' }), T0); // registered_at = last_seen_at = T0
  s.pruneByTokens(['old']); // is_active = 0
  // Advance last_seen_at well past the window; registered_at stays at T0.
  s.touchLastSeen(['old'], new Date(T0.getTime() + 35 * 24 * 60 * 60 * 1000));
  // now = T0+36d → cutoff = T0+6d. last_seen_at (T0+35d) is NOT < cutoff → must survive.
  const deleted = s.startupCleanup(new Date(T0.getTime() + 36 * 24 * 60 * 60 * 1000));
  assertEqual(deleted, 0, 'inactive row with recent last_seen_at must survive');
  assertNotNull(s.getByToken('old'), 'row still present');
});

runTest(
  'Test 29: null-device deactivation is platform-scoped (no cross-platform collapse)',
  (s) => {
    s.upsert(makeInput({ token: 'anull', deviceId: null, platform: 'android' }));
    s.upsert(makeInput({ token: 'inull', deviceId: null, platform: 'ios' }));
    const android = s.listActive('android');
    assertEqual(android.length, 1, 'android null row survives ios null registration');
    assertEqual(android[0].token, 'anull', 'android token untouched');
  }
);

runTest('Test 30: INSERT OR IGNORE — same token in two migrated files yields one row', (s) => {
  writeFile('device-tokens.json', JSON.stringify({ ios: 'shared-token' }));
  writeFile('device-token-seeds.json', JSON.stringify({ ios: 'shared-token' }));
  s.migrate(T0); // processes both files in one call; second pass hits INSERT OR IGNORE
  assertEqual(s.listActive('ios').length, 1, 'INSERT OR IGNORE keeps exactly one row');
});

runTest('Test 31: isDeviceRecord rejects records missing appEnv / isActive / lastSeenAt', () => {
  const full = {
    appEnv: 'sandbox',
    bundleId: null,
    deviceId: null,
    failureCount: 0,
    friendlyName: null,
    id: 'x',
    isActive: true,
    lastSeenAt: '2025-01-01T00:00:00.000Z',
    platform: 'ios',
    registeredAt: '2025-01-01T00:00:00.000Z',
    token: 'y',
  };
  assertEqual(isDeviceRecord(full), true, 'accepts a complete record');
  assertEqual(isDeviceRecord({ ...full, appEnv: undefined }), false, 'rejects missing appEnv');
  assertEqual(isDeviceRecord({ ...full, appEnv: 'nope' }), false, 'rejects invalid appEnv');
  assertEqual(isDeviceRecord({ ...full, isActive: undefined }), false, 'rejects missing isActive');
  assertEqual(
    isDeviceRecord({ ...full, lastSeenAt: undefined }),
    false,
    'rejects missing lastSeenAt'
  );
});

runTest('Test 32: isDeviceRecord rejects non-objects and wrong-typed fields', () => {
  assertEqual(isDeviceRecord(null), false, 'rejects null');
  assertEqual(isDeviceRecord([]), false, 'rejects array');
  assertEqual(isDeviceRecord('str'), false, 'rejects string');
  assertEqual(isDeviceRecord({}), false, 'rejects empty object');
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(SINGLETON_HOME, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
