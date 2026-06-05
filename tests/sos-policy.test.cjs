/**
 * Tests for SoS Phase 2 — the Tier-1 routing policy gate and the coordinator's
 * auto-relay path (relay / block / escalate), loop guards, and cooldown.
 *
 * Pure checks exercise evaluateRelayRule + isValidRoutingRule directly. The live
 * checks drive the real coordinator (with the real generic-session-watcher and a
 * fake injector): a routing rule auto-relays a member's new message into another
 * member's terminal; relayed messages don't re-trigger routing (loop guard); a
 * rapid second match is suppressed by cooldown; an escalate rule queues a
 * pending relay that injects only on approval.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-sospolicy-'));
process.env.HOME = HOME;

require('tsx/cjs');
const { evaluateRelayRule, isValidRoutingRule } = require('../src/lib/modules/server/sos/policy-gate.ts');
const { sosCoordinator } = require('../src/lib/modules/server/sos/coordinator.ts');
const {
  genericSessionWatcher,
} = require('../src/lib/modules/server/terminal/generic-session-watcher.ts');

const injectorCalls = [];
sosCoordinator.setWatcher(genericSessionWatcher);
sosCoordinator.setInjector((terminalId, text) => {
  injectorCalls.push({ terminalId, text });
  return { ok: true };
});

const rule = (o) => ({
  action: 'relay',
  fromMemberId: 'ANY',
  id: 'r',
  matchPattern: '',
  priority: 100,
  toMemberId: 'B',
  ...o,
});
const stage = (rel, fix) => {
  const dest = path.join(HOME, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fix), dest);
  return dest;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(pred, timeoutMs, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await delay(stepMs);
  }
  return pred();
}
const appendUser = (file, content) =>
  fs.appendFileSync(file, `\n${JSON.stringify({ message: { content }, role: 'user' })}\n`);

let passed = 0;
const pending = [];
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};
const acheck = (name, fn) => pending.push({ fn, name });

// ── Pure policy gate ────────────────────────────────────────────────────
console.log('sos-policy: evaluateRelayRule / isValidRoutingRule');

check('matches on fromMemberId + substring pattern', () => {
  const r = rule({ fromMemberId: 'A', matchPattern: 'deploy' });
  assert.strictEqual(evaluateRelayRule([r], 'A', 'please DEPLOY now').id, 'r'); // case-insensitive
  assert.strictEqual(evaluateRelayRule([r], 'B', 'please deploy now'), null); // wrong sender
  assert.strictEqual(evaluateRelayRule([r], 'A', 'nothing here'), null); // pattern miss
});

check('fromMemberId ANY matches any sender; empty pattern matches all text', () => {
  const r = rule({ fromMemberId: 'ANY', matchPattern: '' });
  assert.strictEqual(evaluateRelayRule([r], 'anyone', 'whatever').id, 'r');
});

check('ANY -> member rule never matches a message from that same member (self-relay guard)', () => {
  const r = rule({ fromMemberId: 'ANY', toMemberId: 'B' });
  assert.strictEqual(evaluateRelayRule([r], 'B', 'whatever'), null); // would self-relay
  assert.strictEqual(evaluateRelayRule([r], 'A', 'whatever').id, 'r'); // other senders still match
});

check('lowest priority wins', () => {
  const lo = rule({ action: 'block', id: 'lo', priority: 1 });
  const hi = rule({ action: 'relay', id: 'hi', priority: 9 });
  assert.strictEqual(evaluateRelayRule([hi, lo], 'A', 'x').id, 'lo');
});

check('isValidRoutingRule rejects self-relay and ANY destination', () => {
  assert.strictEqual(isValidRoutingRule(rule({ fromMemberId: 'A', toMemberId: 'A' })), false);
  assert.strictEqual(isValidRoutingRule(rule({ toMemberId: 'ANY' })), false);
  assert.strictEqual(isValidRoutingRule(rule({ fromMemberId: 'A', toMemberId: 'B' })), true);
});

// ── Live coordinator auto-relay ─────────────────────────────────────────
const fromFile = stage('.cursor/projects/-Users-x-from/agent-transcripts/from.jsonl', 'cursor/transcript.jsonl');
const toFile = stage('.cursor/projects/-Users-x-to/agent-transcripts/to.jsonl', 'cursor/transcript.jsonl');

(async () => {
  console.log('sos-policy: live auto-relay');
  const ss = sosCoordinator.createSuperSession('policy');
  const A = sosCoordinator.addMember(ss.id, { provider: 'cursor', sessionKey: fromFile, terminalId: null });
  const B = sosCoordinator.addMember(ss.id, { provider: 'cursor', sessionKey: toFile, terminalId: 'term-B' });
  const events = [];
  sosCoordinator.subscribe(ss.id, (m) => events.push(m));
  await delay(500); // let watchers attach

  acheck('a relay rule auto-injects a matching member message into the target terminal', async () => {
    sosCoordinator.setRoutingRules(ss.id, [
      { action: 'relay', fromMemberId: A.id, id: 'r1', matchPattern: 'deploy', priority: 1, toMemberId: B.id },
    ]);
    appendUser(fromFile, 'please deploy the build');
    const ok = await waitUntil(() => injectorCalls.some((c) => c.terminalId === 'term-B'), 6000);
    assert.ok(ok, 'auto-relay did not inject into term-B');
    assert.ok(injectorCalls.find((c) => c.terminalId === 'term-B').text.includes('deploy'));
    assert.ok(events.some((e) => e.type === 'sos-message' && e.entry.relayed === true && e.entry.memberId === B.id));
  });

  acheck('a relayed message does not itself trigger another relay (loop guard)', async () => {
    const before = injectorCalls.length;
    await delay(1200); // relayed entry was appended to the transcript; ensure no cascade
    assert.strictEqual(injectorCalls.length, before, 'a relayed entry triggered a further relay');
  });

  acheck('cooldown suppresses a rapid second matching message', async () => {
    const before = injectorCalls.filter((c) => c.terminalId === 'term-B').length;
    appendUser(fromFile, 'deploy again immediately');
    await delay(1500);
    const after = injectorCalls.filter((c) => c.terminalId === 'term-B').length;
    assert.strictEqual(after, before, `cooldown failed: ${before} -> ${after}`);
  });

  console.log('sos-policy: live escalate (HITL)');
  const ss2 = sosCoordinator.createSuperSession('escalate');
  const fromFile2 = stage('.cursor/projects/-Users-y-from/agent-transcripts/from2.jsonl', 'cursor/transcript.jsonl');
  const toFile2 = stage('.cursor/projects/-Users-y-to/agent-transcripts/to2.jsonl', 'cursor/transcript.jsonl');
  const A2 = sosCoordinator.addMember(ss2.id, { provider: 'cursor', sessionKey: fromFile2, terminalId: null });
  const B2 = sosCoordinator.addMember(ss2.id, { provider: 'cursor', sessionKey: toFile2, terminalId: 'term-B2' });
  const events2 = [];
  sosCoordinator.subscribe(ss2.id, (m) => events2.push(m));
  await delay(500);

  acheck('an escalate rule queues a pending relay without injecting', async () => {
    sosCoordinator.setRoutingRules(ss2.id, [
      { action: 'escalate', fromMemberId: A2.id, id: 'e1', matchPattern: 'review', priority: 1, toMemberId: B2.id },
    ]);
    const injectsBefore = injectorCalls.length;
    appendUser(fromFile2, 'please review this change');
    const ok = await waitUntil(() => events2.some((e) => e.type === 'sos-relay-pending'), 6000);
    assert.ok(ok, 'no sos-relay-pending emitted');
    assert.strictEqual(injectorCalls.length, injectsBefore, 'escalate injected before approval');
  });

  acheck('approving a pending relay injects it and resolves approved', async () => {
    const pendingEvt = events2.find((e) => e.type === 'sos-relay-pending');
    const injectsBefore = injectorCalls.length;
    assert.strictEqual(sosCoordinator.approveRelay(ss2.id, pendingEvt.relayId), true);
    assert.strictEqual(injectorCalls.length, injectsBefore + 1);
    assert.strictEqual(injectorCalls.at(-1).terminalId, 'term-B2');
    assert.ok(events2.some((e) => e.type === 'sos-relay-resolved' && e.decision === 'approved'));
  });

  acheck('self-relay routing rules are rejected by setRoutingRules', () => {
    const err = sosCoordinator.setRoutingRules(ss.id, [
      { action: 'relay', fromMemberId: A.id, id: 'bad', matchPattern: '', priority: 1, toMemberId: A.id },
    ]);
    assert.ok(typeof err === 'string' && err.includes('itself'), `expected rejection, got ${err}`);
  });

  for (const { fn, name } of pending) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}\n    ${e.message}`);
      process.exitCode = 1;
    }
  }

  sosCoordinator.deleteSuperSession(ss.id);
  sosCoordinator.deleteSuperSession(ss2.id);
  try {
    genericSessionWatcher.stopAll();
    fs.rmSync(HOME, { force: true, recursive: true });
  } catch {
    /* best effort */
  }
  console.log(`\nsos-policy: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
})();
