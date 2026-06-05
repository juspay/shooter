/**
 * Integration test for the Session-Over-Sessions coordinator (Phase 1 MVP).
 *
 * Drives the real coordinator with the real generic-session-watcher (so member
 * subscription + live merge go through production code) and a fake injector.
 * Verifies: create, add member + history replay into the merged transcript,
 * live merge of a new message, relay-forward (injector called + relayed entry
 * recorded), the no-terminal guard, member removal, and delete.
 *
 * HOME is pointed at a temp dir BEFORE requiring the coordinator so relay-store
 * writes its SQLite db there, not into the real ~/.shooter.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-sos-'));
process.env.HOME = HOME;

require('tsx/cjs');
const { sosCoordinator } = require('../src/lib/modules/server/sos/coordinator.ts');
const {
  genericSessionWatcher,
} = require('../src/lib/modules/server/terminal/generic-session-watcher.ts');

// Wire the coordinator: real watcher + a fake injector that records calls.
const injectorCalls = [];
sosCoordinator.setWatcher(genericSessionWatcher);
sosCoordinator.setInjector((terminalId, text) => {
  injectorCalls.push({ terminalId, text });
  return { ok: true };
});

function stage(relInHome, fixtureRel) {
  const dest = path.join(HOME, relInHome);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fixtureRel), dest);
  return dest;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(pred, timeoutMs, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await delay(stepMs);
  }
  return pred();
}
const hasText = (msg, needle) =>
  msg.parts.some((p) => p.type === 'text' && p.content.includes(needle));
const sosMessages = (events) => events.filter((e) => e.type === 'sos-message');

let passed = 0;
const pending = [];
function acheck(name, fn) {
  pending.push({ fn, name });
}

const m1File = stage('.cursor/projects/-Users-dev-a/agent-transcripts/member1.jsonl', 'cursor/transcript.jsonl');
const m2File = stage('.cursor/projects/-Users-dev-b/agent-transcripts/member2.jsonl', 'cursor/transcript.jsonl');

(async () => {
  const events = [];
  let superId = '';
  let m1Id = '';
  let m2Id = '';

  acheck('createSuperSession returns an active session with an id', () => {
    const ss = sosCoordinator.createSuperSession('test-sos');
    superId = ss.id;
    assert.ok(superId, 'no id');
    assert.strictEqual(ss.status, 'active');
    assert.strictEqual(ss.members.length, 0);
  });

  acheck('subscribe replays an (empty) sos-history immediately', () => {
    sosCoordinator.subscribe(superId, (m) => events.push(m));
    assert.strictEqual(events[0].type, 'sos-history');
    assert.strictEqual(events[0].entries.length, 0);
  });

  acheck('addMember replays the member history into the merged transcript', () => {
    const m1 = sosCoordinator.addMember(superId, {
      provider: 'cursor',
      sessionKey: m1File,
      terminalId: null,
    });
    m1Id = m1.id;
    const msgs = sosMessages(events);
    assert.strictEqual(msgs.length, 6, `expected 6 replayed msgs, got ${msgs.length}`);
    assert.strictEqual(msgs[0].entry.memberId, m1Id);
    assert.strictEqual(msgs[0].entry.provider, 'cursor');
    assert.strictEqual(msgs[0].entry.relayed, false);
    assert.ok(events.some((e) => e.type === 'sos-member-added'));
    assert.strictEqual(sosCoordinator.getSuperSession(superId).transcript.length, 6);
  });

  acheck('a new message in a member file is merged live', async () => {
    await delay(600); // let chokidar finish attaching the member's watcher
    const before = sosMessages(events).length;
    fs.appendFileSync(
      m1File,
      `\n${JSON.stringify({ message: { content: 'SOS_LIVE_MERGE' }, role: 'user' })}\n`
    );
    const ok = await waitUntil(
      () => sosMessages(events).some((e) => hasText(e.entry.message, 'SOS_LIVE_MERGE')),
      6000
    );
    assert.ok(ok, 'live-merged message not received');
    const live = sosMessages(events).find((e) => hasText(e.entry.message, 'SOS_LIVE_MERGE'));
    assert.strictEqual(live.entry.memberId, m1Id);
    assert.ok(sosMessages(events).length > before);
  });

  acheck('relay-forward to a member with no terminal is rejected', () => {
    const err = sosCoordinator.relayForward(superId, m1Id, 'hi');
    assert.ok(err && err.includes('no Shooter-owned terminal'), `expected guard error, got: ${err}`);
    assert.strictEqual(injectorCalls.length, 0);
  });

  acheck('relay-forward to a terminal-backed member injects + records a relayed entry', () => {
    const m2 = sosCoordinator.addMember(superId, {
      provider: 'cursor',
      sessionKey: m2File,
      terminalId: 'fake-terminal-1',
    });
    m2Id = m2.id;
    const err = sosCoordinator.relayForward(superId, m2Id, 'do-the-thing');
    assert.strictEqual(err, null, `unexpected error: ${err}`);
    assert.strictEqual(injectorCalls.length, 1);
    assert.strictEqual(injectorCalls[0].terminalId, 'fake-terminal-1');
    assert.strictEqual(injectorCalls[0].text, 'do-the-thing');
    const relayed = sosMessages(events).find((e) => e.entry.relayed === true);
    assert.ok(relayed, 'no relayed entry recorded');
    assert.strictEqual(relayed.entry.memberId, m2Id);
    assert.ok(hasText(relayed.entry.message, 'do-the-thing'));
  });

  acheck('relay-store persists the super-session + members for restart recovery', () => {
    // This is exactly what coordinator.reconnectAll() reads on boot.
    const { relayStore } = require('../src/lib/modules/server/sos/relay-store.ts');
    const persisted = relayStore.loadAll().find((s) => s.id === superId);
    assert.ok(persisted, 'super-session not persisted to SQLite');
    assert.strictEqual(persisted.members.length, 2);
    assert.ok(persisted.members.some((m) => m.terminalId === 'fake-terminal-1'));
    assert.strictEqual(persisted.transcript.length, 0); // transcript is in-memory only by design
  });

  acheck('removeMember unsubscribes and drops the member', () => {
    assert.strictEqual(sosCoordinator.removeMember(superId, m1Id), true);
    assert.strictEqual(sosCoordinator.getSuperSession(superId).members.length, 1);
    assert.ok(events.some((e) => e.type === 'sos-member-removed'));
  });

  acheck('listSuperSessions includes it; deleteSuperSession tears it down', () => {
    assert.ok(sosCoordinator.listSuperSessions().some((s) => s.id === superId));
    assert.strictEqual(sosCoordinator.deleteSuperSession(superId), true);
    assert.strictEqual(sosCoordinator.getSuperSession(superId), undefined);
  });

  for (const { fn, name } of pending) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}\n    ${err.message}`);
      process.exitCode = 1;
    }
  }

  try {
    genericSessionWatcher.stopAll();
    fs.rmSync(HOME, { force: true, recursive: true });
  } catch {
    // best-effort
  }
  console.log(`\nsos-coordinator: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
})();
