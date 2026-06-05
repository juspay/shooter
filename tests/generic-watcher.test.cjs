/**
 * Tests for the GenericSessionWatcher + provider-paths dispatch that power
 * live-tailing for the five read-only providers (cursor, copilot, qwen,
 * gemini, amp).
 *
 * Covers three things the byte watchers don't:
 *   1. path → provider dispatch (pure, all five + negatives)
 *   2. getHistory routing (a path is parsed by the right reader)
 *   3. live emission: an append-style provider (cursor JSONL) surfaces a newly
 *      appended message, and a whole-document provider (amp JSON) surfaces only
 *      genuinely new messages on rewrite (ID dedup), emitting nothing when the
 *      rewrite is identical.
 *
 * Uses the real fixtures from tests/fixtures and a throwaway temp tree whose
 * paths contain each provider's root dir, so the path-substring dispatch fires.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

require('tsx/cjs');
const {
  genericSessionWatcher,
} = require('../src/lib/modules/server/terminal/generic-session-watcher.ts');
const {
  isReadOnlyProviderPath,
  readOnlyProviderForPath,
} = require('../src/lib/modules/server/sessions/provider-paths.ts');

const FIXTURES = path.join(__dirname, 'fixtures');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-genwatch-'));

let passed = 0;
const pending = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

function acheck(name, fn) {
  pending.push({ fn, name });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(pred, timeoutMs, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) {
      return true;
    }
    await delay(stepMs);
  }
  return pred();
}

/** Copy a fixture to TMP/relPath (relPath must embed the provider root dir). */
function stageAt(relPath, fixtureRel) {
  const dest = path.join(TMP, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fixtureRel), dest);
  return dest;
}

const hasText = (msg, needle) =>
  msg.parts.some((p) => p.type === 'text' && p.content.includes(needle));

// ── 1. Pure path → provider dispatch ────────────────────────────────────
console.log('generic-watcher: path dispatch');

check('readOnlyProviderForPath maps each provider root dir', () => {
  assert.strictEqual(
    readOnlyProviderForPath('/h/.cursor/projects/-x/agent-transcripts/a.jsonl'),
    'cursor'
  );
  assert.strictEqual(readOnlyProviderForPath('/h/.copilot/session-state/s.jsonl'), 'copilot');
  assert.strictEqual(readOnlyProviderForPath('/h/.qwen/projects/-x/chats/s.jsonl'), 'qwen');
  assert.strictEqual(readOnlyProviderForPath('/h/.gemini/tmp/abc/chats/session-1.json'), 'gemini');
  assert.strictEqual(readOnlyProviderForPath('/h/.local/share/amp/threads/T-1.json'), 'amp');
});

check('readOnlyProviderForPath returns null for claude/codex/opencode', () => {
  assert.strictEqual(readOnlyProviderForPath('/h/.claude/projects/-x/a.jsonl'), null);
  assert.strictEqual(readOnlyProviderForPath('/h/.codex/sessions/2025/rollout-x.jsonl'), null);
  assert.strictEqual(readOnlyProviderForPath('opencode-session-uuid'), null);
  assert.strictEqual(isReadOnlyProviderPath('/h/.claude/projects/-x/a.jsonl'), false);
  assert.strictEqual(isReadOnlyProviderPath('/h/.cursor/projects/-x/agent-transcripts/a.jsonl'), true);
});

// ── 2. getHistory routes to the right reader ────────────────────────────
console.log('generic-watcher: getHistory routing');

check('getHistory parses a cursor path via the cursor reader', () => {
  const p = stageAt('.cursor/projects/-Users-dev-proj/agent-transcripts/hist.jsonl', 'cursor/transcript.jsonl');
  const msgs = genericSessionWatcher.getHistory(p);
  assert.ok(msgs.length >= 6, `expected >=6 cursor msgs, got ${msgs.length}`);
  assert.strictEqual(msgs[0].role, 'user');
});

check('getHistory parses an amp path via the amp reader', () => {
  const p = stageAt('.local/share/amp/threads/T-hist.json', 'amp/thread.json');
  const msgs = genericSessionWatcher.getHistory(p);
  assert.strictEqual(msgs.length, 3);
});

check('getHistory parses a copilot path via the copilot reader', () => {
  const p = stageAt('.copilot/session-state/hist.jsonl', 'copilot/session.jsonl');
  const msgs = genericSessionWatcher.getHistory(p);
  assert.ok(msgs.length > 0, 'expected copilot msgs');
});

// ── 3. Live emission ────────────────────────────────────────────────────
console.log('generic-watcher: live emission');

acheck('subscribe emits a newly appended cursor (JSONL) message', async () => {
  const p = stageAt('.cursor/projects/-Users-dev-live/agent-transcripts/live.jsonl', 'cursor/transcript.jsonl');
  const got = [];
  const unsub = genericSessionWatcher.subscribe(p, (msgs) => got.push(...msgs));
  await delay(400); // let chokidar attach
  fs.appendFileSync(p, `\n${JSON.stringify({ message: { content: 'NEW_LIVE_MSG' }, role: 'user' })}\n`);
  const ok = await waitUntil(() => got.some((m) => hasText(m, 'NEW_LIVE_MSG')), 6000);
  unsub();
  assert.ok(ok, 'did not receive the appended cursor message');
  // Only the new message should be delivered, not the pre-existing history.
  assert.ok(
    got.every((m) => !hasText(m, 'Fix it')),
    'pre-existing history was wrongly re-emitted'
  );
});

acheck('subscribe emits nothing when an amp (whole-doc) file is rewritten identically', async () => {
  const p = stageAt('.local/share/amp/threads/T-noop.json', 'amp/thread.json');
  const got = [];
  const unsub = genericSessionWatcher.subscribe(p, (msgs) => got.push(...msgs));
  await delay(400);
  const doc = JSON.parse(fs.readFileSync(p, 'utf-8'));
  fs.writeFileSync(p, JSON.stringify(doc)); // same content, new bytes
  await delay(1500); // give the watcher a chance to (wrongly) fire
  unsub();
  assert.strictEqual(got.length, 0, `dedup failed: emitted ${got.length} on identical rewrite`);
});

acheck('subscribe emits only the new message when an amp file gains one', async () => {
  const p = stageAt('.local/share/amp/threads/T-grow.json', 'amp/thread.json');
  const got = [];
  const unsub = genericSessionWatcher.subscribe(p, (msgs) => got.push(...msgs));
  await delay(400);
  const doc = JSON.parse(fs.readFileSync(p, 'utf-8'));
  doc.messages.push({ content: [{ text: 'AMP_GROW_MSG', type: 'text' }], role: 'user' });
  fs.writeFileSync(p, JSON.stringify(doc));
  const ok = await waitUntil(() => got.some((m) => hasText(m, 'AMP_GROW_MSG')), 6000);
  unsub();
  assert.ok(ok, 'did not receive the new amp message');
  assert.strictEqual(got.length, 1, `expected exactly 1 new msg, got ${got.length}`);
});

// ── Run async checks, then report ───────────────────────────────────────
(async () => {
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
    fs.rmSync(TMP, { force: true, recursive: true });
  } catch {
    // best-effort cleanup
  }

  console.log(`\ngeneric-watcher: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
})();
