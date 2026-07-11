/**
 * Unit tests for src/lib/modules/server/webpush/web-push-store.ts
 *
 * WebPushStore is the SQLite-backed registry for browser/PWA push subscriptions
 * (endpoint + p256dh/auth keys), separate from the APNs/FCM device_tokens table.
 * Covers idempotent upsert keyed by endpoint, key rotation, listActive, lazy
 * pruning by endpoint, touchLastSeen, explicit delete, and the 30-day cleanup.
 *
 * Loads the REAL TS module via tsx/cjs (the $lib/types import is type-only →
 * erased). Each test runs against an isolated temp data dir so ~/.shooter is
 * never touched; `now` is injected for determinism.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SINGLETON_HOME = path.join(os.tmpdir(), 'shooter-test-webpush-home');
process.env.SHOOTER_HOME = SINGLETON_HOME;

require('tsx/cjs');

const { WebPushStore } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'webpush', 'web-push-store.ts')
);

const DATA_DIR = path.join(os.tmpdir(), 'shooter-test-webpush');

function freshStore() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  return new WebPushStore(DATA_DIR);
}

function makeInput(overrides = {}) {
  const n = Math.random().toString(36).slice(2, 10);
  return {
    endpoint: 'https://push.example.com/' + n,
    keys: { auth: 'auth-' + n, p256dh: 'p256-' + n },
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

function assertThrows(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${label}: expected a throw, but none occurred`);
  }
}

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

console.log('\nWebPushStore unit tests\n');

runTest('upsert inserts a subscription; listActive returns it', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/1', friendlyName: 'Chrome' }));
  const list = s.listActive();
  assertEqual(list.length, 1, 'count');
  assertEqual(list[0].endpoint, 'https://push/1', 'endpoint');
  assertEqual(list[0].friendlyName, 'Chrome', 'friendlyName');
  assertEqual(list[0].isActive, true, 'isActive');
  assertEqual(list[0].failureCount, 0, 'failureCount');
});

runTest('upsert same endpoint rotates keys, no duplicate row', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/2', keys: { auth: 'a1', p256dh: 'k1' } }), T0);
  s.upsert(makeInput({ endpoint: 'https://push/2', keys: { auth: 'a2', p256dh: 'k2' } }), T1);
  const list = s.listActive();
  assertEqual(list.length, 1, 'no duplicate');
  assertEqual(list[0].auth, 'a2', 'auth rotated');
  assertEqual(list[0].p256dh, 'k2', 'p256dh rotated');
  assertEqual(list[0].lastSeenAt, T1.toISOString(), 'last_seen bumped');
});

runTest('upsert preserves friendlyName when re-sent without one (COALESCE)', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/3', friendlyName: 'iOS Safari' }));
  s.upsert(makeInput({ endpoint: 'https://push/3', friendlyName: null }));
  const list = s.listActive();
  assertEqual(list[0].friendlyName, 'iOS Safari', 'name preserved');
});

runTest('pruneByEndpoints soft-deletes; listActive drops it', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/dead' }));
  s.upsert(makeInput({ endpoint: 'https://push/live' }));
  const pruned = s.pruneByEndpoints(['https://push/dead']);
  assertEqual(pruned, 1, 'pruned count');
  const list = s.listActive();
  assertEqual(list.length, 1, 'only live remains');
  assertEqual(list[0].endpoint, 'https://push/live', 'live endpoint');
});

runTest('re-subscribing a pruned endpoint reactivates it', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/back' }));
  s.pruneByEndpoints(['https://push/back']);
  assertEqual(s.listActive().length, 0, 'pruned');
  s.upsert(makeInput({ endpoint: 'https://push/back' }));
  assertEqual(s.listActive().length, 1, 'reactivated');
});

runTest('touchLastSeen bumps timestamp for delivered endpoints', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/t' }), T0);
  s.touchLastSeen(['https://push/t'], T1);
  assertEqual(s.listActive()[0].lastSeenAt, T1.toISOString(), 'bumped');
});

runTest('deleteByEndpoint hard-removes the row', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/x' }));
  const removed = s.deleteByEndpoint('https://push/x');
  assertEqual(removed, 1, 'removed');
  assertEqual(s.listActive().length, 0, 'gone');
});

runTest('startupCleanup deletes only inactive rows older than 30 days', (s) => {
  s.upsert(makeInput({ endpoint: 'https://push/old' }), T0);
  s.pruneByEndpoints(['https://push/old']); // inactive
  s.upsert(makeInput({ endpoint: 'https://push/active' }), T0); // active, old
  const now = new Date(T0.getTime() + 31 * 24 * 60 * 60 * 1000);
  const deleted = s.startupCleanup(now);
  assertEqual(deleted, 1, 'only the inactive old row deleted');
  assertEqual(s.listActive().length, 1, 'active old row kept');
});

runTest('upsert rejects empty endpoint / keys', (s) => {
  assertThrows(() => s.upsert(makeInput({ endpoint: '' })), 'empty endpoint');
  assertThrows(
    () => s.upsert(makeInput({ endpoint: 'https://push/y', keys: { auth: '', p256dh: 'k' } })),
    'empty auth'
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
