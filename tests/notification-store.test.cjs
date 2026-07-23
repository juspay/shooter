'use strict';
require('tsx/cjs');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { NotificationStore, computeStats, detectBursts } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'notification-store.ts')
);

let passed = 0,
  failed = 0;
function runTest(n, fn) {
  try {
    fn();
    console.log(`  PASS  ${n}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${n}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nnotification store unit tests\n');

const tmp = path.join(os.tmpdir(), `shooter-notif-test-${process.pid}-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });
const store = new NotificationStore(tmp);

const T = 1_700_000_000_000; // fixed base ts (Nov 2023)
store.record({
  id: 'r1',
  tier: 'decision',
  category: 'permission',
  project: 'dopamine',
  disposition: 'sent',
  sent: 1,
  ts: T,
});
store.record({
  id: 'r2',
  tier: 'decision',
  category: 'question',
  project: 'dopamine',
  disposition: 'sent',
  sent: 1,
  ts: T + 2000,
});
store.record({
  id: 'r3',
  tier: 'decision',
  category: 'permission',
  project: 'dopamine',
  disposition: 'sent',
  sent: 1,
  ts: T + 5000,
});
store.record({
  id: 'r4',
  tier: 'status',
  category: 'idle_input',
  project: 'marketing',
  disposition: 'coalesced',
  ts: T + 1000,
});
store.record({
  id: 'r5',
  tier: 'drop',
  category: 'permission_notification',
  project: 'marketing',
  disposition: 'dropped',
  ts: T + 1500,
});
store.record({
  id: 'r6',
  tier: 'decision',
  category: 'question',
  project: 'neurolink',
  disposition: 'failed',
  failed: 1,
  detail: JSON.stringify({ apns: { 413: 1 } }),
  ts: T + 3000,
});

runTest('recent returns newest first', () => {
  const r = store.recent(10);
  assert(r.length === 6, `got ${r.length}`);
  assert(r[0].ts >= r[1].ts, 'newest first');
  assert(r[0].category === 'permission' && r[0].project === 'dopamine', 'newest row shape');
});

runTest('stats aggregates by tier / category / project / disposition', () => {
  const s = store.stats(T - 1000, T + 10000);
  assert(s.total === 6, `total ${s.total}`);
  assert(s.byTier.decision === 4, `decision ${s.byTier.decision}`);
  assert(s.byTier.status === 1 && s.byTier.drop === 1, 'status/drop tiers');
  assert(s.byCategory.permission === 2, `perm ${s.byCategory.permission}`);
  assert(s.byProject.dopamine === 3, `dopamine ${s.byProject.dopamine}`);
  assert(s.byDisposition.sent === 3, `sent ${s.byDisposition.sent}`);
});

runTest('delivery health surfaces apns 413 from detail', () => {
  const s = store.stats(T - 1000, T + 10000);
  assert(s.delivery.byStatus['413'] === 1, `413 count ${JSON.stringify(s.delivery.byStatus)}`);
  assert(s.delivery.sent === 3 && s.delivery.failed === 1, 'sent/failed totals');
});

runTest('detectBursts flags 3 sends to dopamine within 30s window', () => {
  const s = store.stats(T - 1000, T + 10000);
  const dop = s.bursts.find((b) => b.project === 'dopamine');
  assert(dop && dop.count >= 3, `bursts=${JSON.stringify(s.bursts)}`);
});

runTest('detectBursts (pure): spread-out sends are not a burst', () => {
  const rows = [
    { disposition: 'sent', project: 'p', ts: 0 },
    { disposition: 'sent', project: 'p', ts: 60000 },
    { disposition: 'sent', project: 'p', ts: 120000 },
  ];
  assert(detectBursts(rows, 30000, 3).length === 0, 'no burst when spread out');
});

runTest('detectBursts (pure): sent + failed both count as push attempts', () => {
  const rows = [
    { disposition: 'sent', project: 'p', ts: 0 },
    { disposition: 'failed', project: 'p', ts: 1000 },
    { disposition: 'failed', project: 'p', ts: 2000 },
    { disposition: 'coalesced', project: 'p', ts: 2500 },
  ];
  const b = detectBursts(rows, 30000, 3);
  assert(
    b.length === 1 && b[0].count === 3,
    `expected burst of 3 attempts, got ${JSON.stringify(b)}`
  );
});

runTest('computeStats (pure): empty rows → zeroed stats', () => {
  const s = computeStats([], 3600_000, []);
  assert(s.total === 0 && s.delivery.sent === 0 && s.bursts.length === 0, 'empty');
});

runTest('startupCleanup drops events older than 30 days', () => {
  const removed = store.startupCleanup(new Date()); // real now (2026) → all 2023 rows are >30d old
  assert(removed === 6, `removed ${removed}`);
  assert(store.recent(10).length === 0, 'all cleaned');
});

store.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
