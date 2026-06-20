/**
 * Unit tests for src/lib/modules/server/apn/notify-fanout.ts
 *
 * Pure orchestration helpers for the /api/notify fan-out cutover: which
 * platforms to deliver to (DEVICE_PLATFORM as a filter, not a binary switch),
 * and how to combine the APNs + FCM results into one summary. The route's live
 * HTTP behavior is verified against the running server.
 */

'use strict';

const path = require('path');

require('tsx/cjs');

const { selectPlatforms, summarizeNotifyDelivery } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'notify-fanout.ts')
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

console.log('\nnotify-fanout unit tests\n');

runTest('Test 1: DEVICE_PLATFORM=ios → iOS only', () => {
  assertEqual(selectPlatforms('ios'), { doAndroid: false, doIos: true }, 'ios');
});

runTest('Test 2: DEVICE_PLATFORM=android → Android only', () => {
  assertEqual(selectPlatforms('android'), { doAndroid: true, doIos: false }, 'android');
});

runTest('Test 3: DEVICE_PLATFORM unset → BOTH platforms (the new default)', () => {
  assertEqual(selectPlatforms(undefined), { doAndroid: true, doIos: true }, 'unset');
  assertEqual(selectPlatforms(''), { doAndroid: true, doIos: true }, 'empty');
});

runTest('Test 4: unknown DEVICE_PLATFORM value → both (never silently drop)', () => {
  assertEqual(selectPlatforms('windows'), { doAndroid: true, doIos: true }, 'unknown');
});

const APNS_EMPTY = { results: [], staleTokens: [], totalFailed: 0, totalSent: 0 };
const FCM_EMPTY = { failureCount: 0, results: [], staleTokens: [], successCount: 0 };

runTest('Test 5: empty results → not delivered, zero sent/failed', () => {
  const s = summarizeNotifyDelivery(APNS_EMPTY, FCM_EMPTY);
  assertEqual(s.delivered, false, 'delivered');
  assertEqual(s.sent, 0, 'sent');
  assertEqual(s.failed, 0, 'failed');
  assertEqual(s.staleTokens, [], 'stale');
  assertEqual(s.succeededTokens, [], 'succeeded');
});

runTest('Test 6: combines APNs + FCM sent/failed and merges stale tokens', () => {
  const apns = {
    results: [
      {
        disposition: 'sent',
        httpStatus: 200,
        reason: null,
        success: true,
        timestampMs: 0,
        token: 'ios-ok',
      },
      {
        disposition: 'stale_token',
        httpStatus: 400,
        reason: 'BadDeviceToken',
        success: false,
        timestampMs: 0,
        token: 'ios-dead',
      },
    ],
    staleTokens: ['ios-dead'],
    totalFailed: 1,
    totalSent: 1,
  };
  const fcm = {
    failureCount: 1,
    results: [
      { error: null, messageId: 'm1', success: true, token: 'and-ok' },
      {
        error: 'messaging/registration-token-not-registered',
        messageId: null,
        success: false,
        token: 'and-dead',
      },
    ],
    staleTokens: ['and-dead'],
    successCount: 1,
  };
  const s = summarizeNotifyDelivery(apns, fcm);
  assertEqual(s.sent, 2, 'sent = iOS 1 + Android 1');
  assertEqual(s.failed, 2, 'failed = iOS 1 + Android 1');
  assertEqual(s.delivered, true, 'delivered (>=1 sent)');
  assertEqual(s.staleTokens.sort(), ['and-dead', 'ios-dead'], 'merged stale tokens');
  assertEqual(s.succeededTokens.sort(), ['and-ok', 'ios-ok'], 'succeeded tokens for touchLastSeen');
});

runTest('Test 7: all failed → not delivered (notifier should fast-fail)', () => {
  const apns = {
    results: [
      {
        disposition: 'transient_error',
        httpStatus: 500,
        reason: 'InternalServerError',
        success: false,
        timestampMs: 0,
        token: 'x',
      },
    ],
    staleTokens: [],
    totalFailed: 1,
    totalSent: 0,
  };
  const s = summarizeNotifyDelivery(apns, FCM_EMPTY);
  assertEqual(s.delivered, false, 'not delivered');
  assertEqual(s.sent, 0, 'sent 0');
  assertEqual(s.failed, 1, 'failed 1');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

process.exit(failed > 0 ? 1 : 0);
