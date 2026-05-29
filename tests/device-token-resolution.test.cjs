/**
 * Unit tests for resolveDeviceToken in
 * src/lib/modules/server/apn/device-token.ts.
 *
 * Regression target: the iOS push path used to resolve the target token as
 * `requestToken || env.DEVICE_TOKEN`, ignoring the token the phone persisted
 * via /api/device-token. After a server restart, env.DEVICE_TOKEN reverts to
 * the (often stale) .env value, so every push went to a dead token →
 * BadDeviceToken. The persisted token (device-tokens.json) is the freshest
 * source of truth and must take precedence over the env fallback.
 *
 * tsx/cjs lets this plain-node .cjs test require the TypeScript helper; the
 * helper imports only Node built-ins, so no SvelteKit ($env/$lib) aliases are
 * pulled in.
 */

'use strict';

require('tsx/cjs');
const path = require('path');

const { resolveDeviceToken } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'device-token.ts')
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
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\ndevice-token resolution unit tests\n');

runTest('request token wins over persisted and env', () => {
  assertEqual(resolveDeviceToken('req-tok', 'persisted-tok', 'env-tok'), 'req-tok', 'precedence');
});

runTest('persisted token wins over env (stale-env regression)', () => {
  // The bug: a stale env.DEVICE_TOKEN must NOT override the fresh persisted token.
  assertEqual(resolveDeviceToken(undefined, 'fresh-persisted', 'stale-env'), 'fresh-persisted', 'persisted>env');
});

runTest('env token used when no request and no persisted', () => {
  assertEqual(resolveDeviceToken(undefined, undefined, 'env-tok'), 'env-tok', 'env fallback');
});

runTest('returns undefined when all sources absent', () => {
  assertEqual(resolveDeviceToken(undefined, undefined, undefined), undefined, 'all absent');
});

runTest('whitespace-only values are treated as absent', () => {
  assertEqual(resolveDeviceToken('   ', '  ', 'env-tok'), 'env-tok', 'trims blanks');
});

runTest('trims the chosen token', () => {
  assertEqual(resolveDeviceToken('  req-tok  ', undefined, undefined), 'req-tok', 'trimmed request');
});

runTest('empty-string request falls through to persisted', () => {
  assertEqual(resolveDeviceToken('', 'persisted-tok', 'env-tok'), 'persisted-tok', 'empty request skipped');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
