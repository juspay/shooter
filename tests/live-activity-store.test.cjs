/**
 * Unit tests for src/lib/modules/server/apn/live-activity-store.ts
 *
 * Maps a session to its current ActivityKit push token. Covers idempotent
 * upsert (latest token wins as ActivityKit rotates it), lookup, remove by
 * session and by token, and non-empty validation.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SHOOTER_HOME = path.join(os.tmpdir(), 'shooter-test-la-home');
require('tsx/cjs');

const { LiveActivityStore } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'live-activity-store.ts')
);

const DATA_DIR = path.join(os.tmpdir(), 'shooter-test-liveactivity');
function freshStore() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  return new LiveActivityStore(DATA_DIR);
}

let passed = 0;
let failed = 0;
function run(name, fn) {
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
function eq(a, b, label) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}
function throws(fn, label) {
  let t = false;
  try {
    fn();
  } catch {
    t = true;
  }
  if (!t) throw new Error(`${label}: expected throw`);
}

console.log('\nLiveActivityStore unit tests\n');

run('upsert + getBySession round-trips', (s) => {
  s.upsert('sess-1', 'tok-abc');
  eq(s.getBySession('sess-1').activityPushToken, 'tok-abc', 'token');
});

run('upsert rotates the token for the same session (no dup)', (s) => {
  s.upsert('sess-1', 'tok-old');
  s.upsert('sess-1', 'tok-new');
  eq(s.getBySession('sess-1').activityPushToken, 'tok-new', 'latest token wins');
});

run('getBySession returns null for unknown session', (s) => {
  eq(s.getBySession('nope'), null, 'unknown');
});

run('remove deletes by session', (s) => {
  s.upsert('sess-1', 'tok');
  eq(s.remove('sess-1'), 1, 'removed');
  eq(s.getBySession('sess-1'), null, 'gone');
});

run('removeByToken drops the holder (410 cleanup)', (s) => {
  s.upsert('sess-1', 'dead-tok');
  s.upsert('sess-2', 'live-tok');
  eq(s.removeByToken('dead-tok'), 1, 'removed by token');
  eq(s.getBySession('sess-1'), null, 'dead session gone');
  eq(s.getBySession('sess-2').activityPushToken, 'live-tok', 'live session kept');
});

run('upsert rejects empty session or token', (s) => {
  throws(() => s.upsert('', 'tok'), 'empty session');
  throws(() => s.upsert('sess', ''), 'empty token');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
