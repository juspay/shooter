/**
 * Unit tests for src/lib/modules/server/apn/apns-classify.ts
 *
 * Pure APNs stale-token classification + fan-out aggregation. Lives in its own
 * module (not library-apns.ts) precisely so it can be loaded here — the service
 * imports $env/dynamic/private, which tsx cannot resolve. The actual curl
 * transport + sendToMany are exercised live at the /api/notify surface (PR 5),
 * not here; what is verified here is the decision logic that decides whether a
 * token gets pruned, which is the part that can silently delete every device.
 *
 * Rules (plan §8):
 *   - 400 BadDeviceToken     → stale ONLY if storedAppEnv === serverAppEnv
 *   - 410 Unregistered       → stale, UNLESS the device re-registered after the
 *                              410 timestamp (timestamp guard)
 *   - 400 DeviceTokenNotForTopic → stale (token is for a different bundle)
 *   - 400 TopicDisallowed → transient (push disabled at the account level)
 *   - everything else (5xx, 429, 403, BadCollapseId, …) → transient
 */

'use strict';

const path = require('path');

require('tsx/cjs');

const { classifyApnsReason, summarizeApnsFanOut } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-classify.ts')
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

console.log('\nclassifyApnsReason / summarizeApnsFanOut unit tests\n');

// ── classifyApnsReason ───────────────────────────────────────────────

runTest('Test 1: HTTP 200 → sent', () => {
  assertEqual(classifyApnsReason(200, null, 'sandbox', 'sandbox'), 'sent', 'sent');
});

runTest('Test 2: 410 Unregistered → stale_token', () => {
  assertEqual(
    classifyApnsReason(410, 'Unregistered', 'sandbox', 'sandbox'),
    'stale_token',
    'stale'
  );
});

runTest('Test 3: 400 BadDeviceToken, env MATCH → stale_token', () => {
  assertEqual(
    classifyApnsReason(400, 'BadDeviceToken', 'production', 'production'),
    'stale_token',
    'stale on match'
  );
});

runTest('Test 4: 400 BadDeviceToken, env MISMATCH (sandbox token, prod server) → transient', () => {
  assertEqual(
    classifyApnsReason(400, 'BadDeviceToken', 'sandbox', 'production'),
    'transient_error',
    'transient on mismatch'
  );
});

runTest('Test 5: 400 BadDeviceToken, env MISMATCH (prod token, sandbox server) → transient', () => {
  assertEqual(
    classifyApnsReason(400, 'BadDeviceToken', 'production', 'sandbox'),
    'transient_error',
    'transient on mismatch'
  );
});

runTest('Test 6: 400 DeviceTokenNotForTopic → stale_token', () => {
  assertEqual(
    classifyApnsReason(400, 'DeviceTokenNotForTopic', 'sandbox', 'sandbox'),
    'stale_token',
    'stale'
  );
});

runTest('Test 7: 400 TopicDisallowed → transient_error (account-level config, not a dead token)', () => {
  assertEqual(
    classifyApnsReason(400, 'TopicDisallowed', 'sandbox', 'sandbox'),
    'transient_error',
    'transient — push disabled at the bundle/account level; keep the token'
  );
});

runTest('Test 8: 500 InternalServerError → transient_error', () => {
  assertEqual(
    classifyApnsReason(500, 'InternalServerError', 'sandbox', 'sandbox'),
    'transient_error',
    'transient'
  );
});

runTest('Test 9: 400 BadCollapseId → transient_error (not a token problem)', () => {
  assertEqual(
    classifyApnsReason(400, 'BadCollapseId', 'sandbox', 'sandbox'),
    'transient_error',
    'transient'
  );
});

runTest(
  'Test 10: 403 ExpiredProviderToken → transient_error (server JWT issue, not device)',
  () => {
    assertEqual(
      classifyApnsReason(403, 'ExpiredProviderToken', 'sandbox', 'sandbox'),
      'transient_error',
      'transient'
    );
  }
);

// ── summarizeApnsFanOut ──────────────────────────────────────────────

const REG = '2026-06-01T00:00:00.000Z';

runTest('Test 11: empty outcomes → zero totals, no stale', () => {
  const r = summarizeApnsFanOut([], 'sandbox');
  assertEqual(r.totalSent, 0, 'sent');
  assertEqual(r.totalFailed, 0, 'failed');
  assertEqual(r.staleTokens, [], 'stale');
  assertEqual(r.results, [], 'results');
});

runTest('Test 12: mixed batch aggregates sent/failed and collects only stale tokens', () => {
  const r = summarizeApnsFanOut(
    [
      {
        appEnv: 'sandbox',
        httpStatus: 200,
        reason: null,
        registeredAt: REG,
        timestampMs: 0,
        token: 't-ok',
      },
      {
        appEnv: 'sandbox',
        httpStatus: 400,
        reason: 'BadDeviceToken',
        registeredAt: REG,
        timestampMs: 0,
        token: 't-bad',
      },
      {
        appEnv: 'sandbox',
        httpStatus: 503,
        reason: 'ServiceUnavailable',
        registeredAt: REG,
        timestampMs: 0,
        token: 't-transient',
      },
    ],
    'sandbox'
  );
  assertEqual(r.totalSent, 1, 'one sent');
  assertEqual(r.totalFailed, 2, 'two failed');
  assertEqual(r.staleTokens, ['t-bad'], 'only the dead token is stale');
});

runTest('Test 13: BadDeviceToken with env mismatch is NOT pruned in the aggregate', () => {
  const r = summarizeApnsFanOut(
    [
      {
        appEnv: 'sandbox',
        httpStatus: 400,
        reason: 'BadDeviceToken',
        registeredAt: REG,
        timestampMs: 0,
        token: 't-mismatch',
      },
    ],
    'production'
  );
  assertEqual(r.staleTokens, [], 'env mismatch → not pruned');
  assertEqual(r.totalFailed, 1, 'still counted as a failure');
});

runTest('Test 14: 410 timestamp guard — re-registered AFTER 410 timestamp → NOT pruned', () => {
  // APNs said unregistered at 2026-06-01; device re-registered 2026-06-10 → keep.
  const ts410 = Date.parse('2026-06-01T00:00:00.000Z');
  const r = summarizeApnsFanOut(
    [
      {
        appEnv: 'sandbox',
        httpStatus: 410,
        reason: 'Unregistered',
        registeredAt: '2026-06-10T00:00:00.000Z',
        timestampMs: ts410,
        token: 't-rereg',
      },
    ],
    'sandbox'
  );
  assertEqual(r.staleTokens, [], 're-registered after 410 → kept');
});

runTest('Test 15: 410 timestamp guard — registered BEFORE 410 timestamp → pruned', () => {
  const ts410 = Date.parse('2026-06-15T00:00:00.000Z');
  const r = summarizeApnsFanOut(
    [
      {
        appEnv: 'sandbox',
        httpStatus: 410,
        reason: 'Unregistered',
        registeredAt: '2026-06-01T00:00:00.000Z',
        timestampMs: ts410,
        token: 't-dead',
      },
    ],
    'sandbox'
  );
  assertEqual(r.staleTokens, ['t-dead'], 'registered before 410 → pruned');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

process.exit(failed > 0 ? 1 : 0);
