/**
 * Unit tests for src/lib/modules/server/apn/apns-liveactivity.ts
 *
 * The APNs Live Activity (ActivityKit) `aps` envelope and topic are what APNs is
 * strict about, so the pure builders get deterministic coverage: topic suffix,
 * required timestamp/event/content-state, and the event-conditional fields
 * (dismissal-date only on 'end', optional stale-date / relevance-score / alert).
 */

'use strict';

require('tsx/cjs');
const path = require('path');
const { buildLiveActivityBody, liveActivityTopic } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'apns-liveactivity.ts')
);

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    failed++;
  }
}

console.log('\nAPNs Live Activity builders\n');

// topic
ok(
  liveActivityTopic('com.shooter.app') === 'com.shooter.app.push-type.liveactivity',
  'topic appends the liveactivity push-type suffix'
);

const cs = { title: 'claude', status: 'Running', detail: 'Edit', updatedAt: '2026-07-11T00:00:00Z' };

// update
const upd = buildLiveActivityBody({ event: 'update', contentState: cs }, 1_780_000_000);
ok(upd.aps.event === 'update', 'update: event set');
ok(upd.aps.timestamp === 1_780_000_000, 'update: timestamp is the injected nowSec');
ok(upd.aps['content-state'] === cs, 'update: content-state carried through');
ok(!('dismissal-date' in upd.aps), 'update: no dismissal-date on a non-end event');
ok(!('stale-date' in upd.aps), 'update: no stale-date unless provided');

// end with dismissal + stale + relevance + alert
const end = buildLiveActivityBody(
  {
    event: 'end',
    contentState: cs,
    dismissalDate: 1_780_000_600,
    staleDate: 1_780_000_300,
    relevanceScore: 75,
    alert: { title: 'Done', body: 'Session complete' },
  },
  1_780_000_000
);
ok(end.aps.event === 'end', 'end: event set');
ok(end.aps['dismissal-date'] === 1_780_000_600, 'end: dismissal-date included');
ok(end.aps['stale-date'] === 1_780_000_300, 'end: stale-date included');
ok(end.aps['relevance-score'] === 75, 'end: relevance-score included');
ok(end.aps.alert && end.aps.alert.title === 'Done', 'end: alert carried through');

// dismissal-date is ignored on a non-end event
const updWithDismissal = buildLiveActivityBody(
  { event: 'update', contentState: cs, dismissalDate: 1_780_000_600 },
  1_780_000_000
);
ok(!('dismissal-date' in updWithDismissal.aps), 'dismissal-date is dropped on update events');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
