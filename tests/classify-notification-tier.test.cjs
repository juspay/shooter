'use strict';
require('tsx/cjs');
const path = require('path');
const { classifyNotificationTier } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-classify.ts')
);
let passed = 0,
  failed = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nclassifyNotificationTier unit tests\n');
runTest('permission → decision', () =>
  assert(classifyNotificationTier('permission') === 'decision')
);
runTest('question → decision', () => assert(classifyNotificationTier('question') === 'decision'));
runTest('idle_input → status', () => assert(classifyNotificationTier('idle_input') === 'status'));
runTest('intervention → status', () =>
  assert(classifyNotificationTier('intervention') === 'status')
);
runTest('permission_notification → drop', () =>
  assert(classifyNotificationTier('permission_notification') === 'drop')
);
runTest('unknown → drop', () => assert(classifyNotificationTier('task_completed') === 'drop'));
runTest('undefined → drop', () => assert(classifyNotificationTier(undefined) === 'drop'));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
