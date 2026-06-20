/**
 * Unit tests for src/lib/modules/server/fcm/fcm-classify.ts
 *
 * Pure FCM stale-token classification + multicast chunking + fan-out
 * aggregation. Separate from fcm-service.ts (which pulls in firebase-admin and
 * needs real credentials) so the prune decision — the part that can silently
 * delete every Android device — is unit-testable. Real multicast delivery is
 * exercised live at the /api/notify surface (PR 5).
 *
 * Rule (plan §8): ONLY `messaging/registration-token-not-registered` prunes.
 * `messaging/invalid-argument` is explicitly NOT prunable (it usually means a
 * payload bug affecting the whole batch, not a dead token).
 */

'use strict';

const path = require('path');

require('tsx/cjs');

const { chunk, classifyFcmError, summarizeFcmFanOut } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'fcm', 'fcm-classify.ts')
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

console.log('\nfcm-classify unit tests\n');

runTest('Test 1: registration-token-not-registered → prune', () => {
  assertEqual(classifyFcmError('messaging/registration-token-not-registered'), 'prune', 'prune');
});

runTest('Test 2: invalid-argument → keep (NOT prunable — may be a batch payload bug)', () => {
  assertEqual(classifyFcmError('messaging/invalid-argument'), 'keep', 'keep');
});

runTest('Test 3: unavailable → keep (transient)', () => {
  assertEqual(classifyFcmError('messaging/unavailable'), 'keep', 'keep');
});

runTest('Test 4: internal-error → keep', () => {
  assertEqual(classifyFcmError('messaging/internal-error'), 'keep', 'keep');
});

runTest('Test 5: mismatched-credential → keep (server config, not the token)', () => {
  assertEqual(classifyFcmError('messaging/mismatched-credential'), 'keep', 'keep');
});

runTest('Test 6: null / unknown code → keep', () => {
  assertEqual(classifyFcmError(null), 'keep', 'null');
  assertEqual(classifyFcmError('something/else'), 'keep', 'unknown');
});

runTest('Test 7: chunk splits into max-size groups preserving order', () => {
  const arr = Array.from({ length: 250 }, (_, i) => i);
  const chunks = chunk(arr, 100);
  assertEqual(
    chunks.map((c) => c.length),
    [100, 100, 50],
    'chunk sizes'
  );
  assertEqual(chunks[0][0], 0, 'first element');
  assertEqual(chunks[2][49], 249, 'last element');
});

runTest('Test 8: chunk of empty array → []', () => {
  assertEqual(chunk([], 100), [], 'empty');
});

runTest('Test 9: chunk smaller than size → single chunk', () => {
  assertEqual(chunk([1, 2, 3], 100), [[1, 2, 3]], 'single chunk');
});

runTest('Test 10: summarizeFcmFanOut empty → zeros', () => {
  const r = summarizeFcmFanOut([]);
  assertEqual(r.successCount, 0, 'success');
  assertEqual(r.failureCount, 0, 'failure');
  assertEqual(r.staleTokens, [], 'stale');
  assertEqual(r.results, [], 'results');
});

runTest('Test 11: mixed batch → only not-registered tokens are stale', () => {
  const r = summarizeFcmFanOut([
    { errorCode: null, messageId: 'm1', success: true, token: 't-ok' },
    {
      errorCode: 'messaging/registration-token-not-registered',
      messageId: null,
      success: false,
      token: 't-dead',
    },
    { errorCode: 'messaging/unavailable', messageId: null, success: false, token: 't-transient' },
  ]);
  assertEqual(r.successCount, 1, 'one success');
  assertEqual(r.failureCount, 2, 'two failures');
  assertEqual(r.staleTokens, ['t-dead'], 'only the dead token is stale');
});

runTest('Test 12: invalid-argument failure is counted but NOT pruned', () => {
  const r = summarizeFcmFanOut([
    {
      errorCode: 'messaging/invalid-argument',
      messageId: null,
      success: false,
      token: 't-bad-payload',
    },
  ]);
  assertEqual(r.failureCount, 1, 'counted as failure');
  assertEqual(r.staleTokens, [], 'NOT pruned');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

process.exit(failed > 0 ? 1 : 0);
