/**
 * Unit tests for src/lib/modules/server/apn/apns-payload.ts
 *
 * APNs caps an alert payload at ~4 KB. Idle/autopilot notifications embed the agent's full last
 * message in alert.body (plus a goal subtitle), which can blow past the cap → APNs 413
 * PayloadTooLarge → the notification silently fails to deliver. fitApnsPayload() truncates the
 * body (then subtitle) so the JSON payload fits, preserving title + custom data.
 *
 * Pure module, loaded via tsx/cjs (same pattern as next-step-consensus.test.cjs).
 */
'use strict';
require('tsx/cjs');
const path = require('path');
const { fitApnsPayload, APNS_MAX_BYTES } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-payload.ts')
);

let passed = 0, failed = 0;
function runTest(name, fn) { try { fn(); console.log(`  PASS  ${name}`); passed++; } catch (e) { console.log(`  FAIL  ${name}`); console.log(`        ${e.message}`); failed++; } }
function assert(c, l) { if (!c) throw new Error(l || 'assertion failed'); }
const blen = (s) => Buffer.byteLength(s, 'utf8');
const size = (b) => blen(JSON.stringify(b));

console.log('\napns payload fit unit tests\n');

runTest('a small payload is returned unchanged', () => {
  const body = { aps: { alert: { title: 'Hi', body: 'short message' }, badge: 1 }, category: 'x' };
  const out = fitApnsPayload(body, 4000);
  assert(out.aps.alert.body === 'short message', 'body untouched');
  assert(out.aps.alert.title === 'Hi', 'title untouched');
});

runTest('a long body is truncated so the payload fits under the cap', () => {
  const body = { aps: { alert: { title: 'Idle', body: 'x'.repeat(9000) }, badge: 1 } };
  const out = fitApnsPayload(body, 1000);
  assert(size(out) <= 1000, `payload must fit: got ${size(out)}`);
  assert(out.aps.alert.body.length < 9000, 'body was shortened');
  assert(out.aps.alert.body.endsWith('…'), 'truncation marked with ellipsis');
});

runTest('title and custom data survive body truncation', () => {
  const body = { aps: { alert: { title: 'orders · Waiting', body: 'y'.repeat(9000) }, badge: 1 }, category: 'idle_input', sessionId: 'abc123', source: 'modern-apns-api' };
  const out = fitApnsPayload(body, 800);
  assert(size(out) <= 800, `fits: got ${size(out)}`);
  assert(out.aps.alert.title === 'orders · Waiting', 'title preserved');
  assert(out.category === 'idle_input' && out.sessionId === 'abc123', 'custom data preserved');
});

runTest('subtitle is trimmed too when body alone is not enough', () => {
  const body = { aps: { alert: { title: 'T', body: 'b'.repeat(2000), subtitle: 'Goal: ' + 'g'.repeat(2000) }, badge: 1 } };
  const out = fitApnsPayload(body, 600);
  assert(size(out) <= 600, `fits: got ${size(out)}`);
});

runTest('multibyte content still fits under the byte cap', () => {
  const body = { aps: { alert: { title: 'T', body: ('🚀 build failing — ' + 'é'.repeat(4000)) }, badge: 1 } };
  const out = fitApnsPayload(body, 900);
  assert(size(out) <= 900, `byte-accurate fit: got ${size(out)}`);
});

runTest('body is omitted (not left as "") when truncation bottoms out', () => {
  const body = { aps: { alert: { title: 'A reasonably long-ish notification title', body: 'z'.repeat(500) }, badge: 1 } };
  const out = fitApnsPayload(body, 60); // impossibly small → body must fully truncate away
  assert(out.aps.alert.body === undefined, 'emptied body is undefined (omitted), not ""');
  assert(!JSON.stringify(out).includes('"body":""'), 'serialised payload has no empty body key');
});

runTest('exports a sane default cap (<= 4096)', () => {
  assert(typeof APNS_MAX_BYTES === 'number' && APNS_MAX_BYTES > 0 && APNS_MAX_BYTES <= 4096, 'APNS_MAX_BYTES in range');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
