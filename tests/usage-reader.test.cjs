/**
 * Unit tests for the token-usage reader and its pricing table.
 *
 * Loads the real TypeScript modules via the tsx CJS loader (their `$lib/types`
 * imports are type-only and erased at runtime, so no path-alias resolution is
 * needed), and builds a synthetic ~/.claude/projects corpus in a tmp dir that
 * SHOOTER_CLAUDE_PROJECTS_DIR points at.
 *
 * The behaviours worth guarding are the ones that were measured wrong before
 * they were fixed:
 *   - summing every assistant record inflated output tokens by 124.6% on a real
 *     transcript, so responses are deduped on message.id;
 *   - but keeping the FIRST record of a streamed response under-counted by 4.3%
 *     on that same corpus, so the last write must win;
 *   - an unpriced model must read as UNKNOWN, never as $0.00, or the panel
 *     under-reports spend while looking authoritative.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CORPUS = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-usage-'));
process.env.SHOOTER_CLAUDE_PROJECTS_DIR = CORPUS;
// Fixed table so the assertions do not depend on the machine's own config.
process.env.SHOOTER_MODEL_PRICING = JSON.stringify({
  'test-priced': { cacheRead: 1, cacheWrite: 10, input: 2, output: 20 },
  'test-priced-long': { cacheRead: 3, cacheWrite: 30, input: 6, output: 60 },
});

require('tsx/cjs');
const {
  resetTranscriptCache,
  usageSnapshot,
} = require('../src/lib/modules/server/sessions/usage-reader.ts');
const {
  costOf,
  rateFor,
  resetRateCache,
} = require('../src/lib/modules/server/sessions/usage-pricing.ts');

let passed = 0;
const pending = [];

/**
 * Queue a check. The corpus is wiped in `finally` regardless of outcome — a
 * failed assertion used to skip its own cleanup, leaving stale transcripts that
 * made every later check fail for unrelated reasons.
 */
function check(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}\n    ${err.message}`);
      process.exitCode = 1;
    } finally {
      fs.rmSync(CORPUS, { force: true, recursive: true });
      fs.mkdirSync(CORPUS, { recursive: true });
      resetTranscriptCache();
    }
  });
}

/** Section header, printed in order with the checks that follow it. */
function section(title) {
  pending.push(() => {
    console.log(title);
  });
}

/** An assistant record carrying a usage block, as Claude Code writes them. */
function assistantRecord({ id, model, minutesAgo = 1, usage = {} }) {
  return JSON.stringify({
    cwd: '/Users/dev/proj/widget',
    message: {
      id,
      model,
      role: 'assistant',
      usage: {
        cache_creation_input_tokens: usage.cacheCreation ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
      },
    },
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    type: 'assistant',
    uuid: `uuid-${id}-${minutesAgo}`,
  });
}

/** Write a transcript at <encodedDir>/<extra...>/<sessionId>.jsonl. */
function writeTranscript(encodedDir, sessionId, lines, subPath = []) {
  const dir = path.join(CORPUS, encodedDir, ...subPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
}

/** Fresh snapshot with the directory listing cache dropped. */
async function snapshot(options) {
  resetTranscriptCache();
  return usageSnapshot(options);
}

// ── Pricing table ────────────────────────────────────────────────────

section('usage-pricing: rate resolution');

check('unknown model has no rate and no cost', async () => {
  assert.strictEqual(rateFor('totally-unknown-model'), null);
  assert.strictEqual(
    costOf('totally-unknown-model', {
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    null,
    'unknown model must return null, not 0 — 0 would under-report spend as if it were free'
  );
});

check('longest prefix wins regardless of key order', async () => {
  // Both 'test-priced' and 'test-priced-long' prefix-match this id; the more
  // specific entry must win or dated model variants get the wrong rate.
  assert.strictEqual(rateFor('test-priced-long-20260101').input, 6);
  assert.strictEqual(rateFor('test-priced-20260101').input, 2);
});

check('cost is computed per million tokens across all four classes', async () => {
  const cost = costOf('test-priced', {
    cacheCreationTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  // 2 + 20 + 10 + 1
  assert.strictEqual(cost, 33);
});

check('a non-billed synthetic model costs exactly zero, not unknown', async () => {
  assert.strictEqual(
    costOf('<synthetic>', {
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      inputTokens: 500,
      outputTokens: 500,
    }),
    0
  );
});

// ── Dedup ────────────────────────────────────────────────────────────

section('usage-reader: duplicate responses');

check('a response repeated in the transcript is counted once', async () => {
  const dup = assistantRecord({
    id: 'msg-dup',
    model: 'test-priced',
    usage: { input: 10, output: 100 },
  });
  writeTranscript('-Users-dev-proj-widget', 'session-dup', [dup, dup, dup]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 1, 'three identical records are one response');
  assert.strictEqual(snap.tokens.outputTokens, 100, 'output tokens must not triple');
});

check('a streamed response counts its LAST entry, not its first', async () => {
  // Claude Code splits one response across entries sharing a message.id, and
  // usage accumulates as it streams. Keeping the first entry under-counted real
  // output tokens by 4.3%; the schema doc says the last entry is authoritative.
  writeTranscript('-Users-dev-proj-widget', 'session-stream', [
    assistantRecord({ id: 'msg-stream', model: 'test-priced', usage: { output: 10 } }),
    assistantRecord({ id: 'msg-stream', model: 'test-priced', usage: { output: 40 } }),
    assistantRecord({ id: 'msg-stream', model: 'test-priced', usage: { output: 90 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 1, 'still one response');
  assert.strictEqual(
    snap.tokens.outputTokens,
    90,
    'the final cumulative usage wins, not 10 or 140'
  );
});

check('distinct responses are all counted', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-multi', [
    assistantRecord({ id: 'a', model: 'test-priced', usage: { output: 10 } }),
    assistantRecord({ id: 'b', model: 'test-priced', usage: { output: 20 } }),
    assistantRecord({ id: 'c', model: 'test-priced', usage: { output: 30 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 3);
  assert.strictEqual(snap.tokens.outputTokens, 60);
});

// ── Window ───────────────────────────────────────────────────────────

section('usage-reader: trailing window');

check('records older than the window are excluded', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-window', [
    assistantRecord({ id: 'recent', minutesAgo: 5, model: 'test-priced', usage: { output: 7 } }),
    assistantRecord({ id: 'old', minutesAgo: 600, model: 'test-priced', usage: { output: 999 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 1, 'only the in-window record counts');
  assert.strictEqual(snap.tokens.outputTokens, 7);

  const wide = await snapshot({ windowMinutes: 1440 });
  assert.strictEqual(wide.requests, 2, 'a wider window picks the older record back up');
  assert.strictEqual(wide.tokens.outputTokens, 1006);
});

check('burn rate divides window tokens by the window width', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-burn', [
    assistantRecord({ id: 'burn', minutesAgo: 1, model: 'test-priced', usage: { output: 600 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.burn.tokensPerMinute, 10);
  assert.strictEqual(snap.burn.windowMinutes, 60);
});

// ── Unpriced models ──────────────────────────────────────────────────

section('usage-reader: unpriced models');

check('an unpriced model is reported as unknown, not as zero spend', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-unpriced', [
    assistantRecord({ id: 'u1', model: 'brand-new-model', usage: { output: 1000 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.priced, false, 'snapshot must not claim a complete cost');
  assert.deepStrictEqual(snap.unpricedModels, ['brand-new-model']);
  assert.strictEqual(snap.tokens.outputTokens, 1000, 'tokens are still exact when cost is not');
  assert.strictEqual(snap.burn.priced, false);
});

check('one unpriced model makes the whole session unpriced', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-mixed', [
    assistantRecord({ id: 'p', model: 'test-priced', usage: { output: 1_000_000 } }),
    assistantRecord({ id: 'q', model: 'brand-new-model', usage: { output: 5 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  const session = snap.sessions.find((s) => s.sessionId === 'session-mixed');
  assert.ok(session, 'session should be present');
  assert.strictEqual(session.priced, false, 'a partially-priced total is a lower bound');
  assert.strictEqual(snap.priced, false);
});

check('a fully priced session reports its cost', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-priced', [
    assistantRecord({ id: 'p1', model: 'test-priced', usage: { input: 1_000_000 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.priced, true);
  assert.strictEqual(snap.costUsd, 2);
  assert.strictEqual(snap.burn.costPerHour, 2, 'a 60-minute window extrapolates 1:1 to the hour');
});

// ── Subagent discovery ───────────────────────────────────────────────

section('usage-reader: nested subagent transcripts');

check('subagent transcripts nested under a session are counted', async () => {
  writeTranscript('-Users-dev-proj-widget', 'main-session', [
    assistantRecord({ id: 'main', model: 'test-priced', usage: { output: 10 } }),
  ]);
  writeTranscript(
    '-Users-dev-proj-widget',
    'agent-abc',
    [assistantRecord({ id: 'sub', model: 'test-priced', usage: { output: 90 } })],
    ['main-session', 'subagents']
  );

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 2, 'a flat readdir would miss the subagent entirely');
  assert.strictEqual(snap.tokens.outputTokens, 100);
  assert.ok(
    snap.sessions.some((s) => s.sessionId === 'agent-abc'),
    'the subagent should appear as its own row'
  );
});

check('synthetic records are ignored entirely', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-synthetic', [
    assistantRecord({ id: 's1', model: '<synthetic>', usage: { output: 42 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 0);
  assert.deepStrictEqual(snap.unpricedModels, []);
});

check('a malformed line does not abort the file', async () => {
  writeTranscript('-Users-dev-proj-widget', 'session-garbage', [
    '{"usage": this is not json',
    assistantRecord({ id: 'good', model: 'test-priced', usage: { output: 5 } }),
  ]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.requests, 1);
  assert.strictEqual(snap.tokens.outputTokens, 5);
});

// ── Malformed rate tables ────────────────────────────────────────────

section('usage-pricing: rejecting bad rate tables');

check('a blank model id is rejected, not applied to everything', async () => {
  const original = process.env.SHOOTER_MODEL_PRICING;
  try {
    // '' prefix-matches every model id, so accepting it would price the whole
    // corpus at one arbitrary rate.
    process.env.SHOOTER_MODEL_PRICING = JSON.stringify({
      '': { cacheRead: 1, cacheWrite: 1, input: 999, output: 999 },
    });
    resetRateCache();
    assert.strictEqual(rateFor('some-unrelated-model'), null);
  } finally {
    process.env.SHOOTER_MODEL_PRICING = original;
    resetRateCache();
  }
});

check('negative rates are rejected rather than producing negative spend', async () => {
  const original = process.env.SHOOTER_MODEL_PRICING;
  try {
    process.env.SHOOTER_MODEL_PRICING = JSON.stringify({
      'negative-model': { cacheRead: -1, cacheWrite: -1, input: -5, output: -5 },
      'partial-model': { cacheRead: -1, cacheWrite: -1, input: 2, output: 4 },
    });
    resetRateCache();
    assert.strictEqual(rateFor('negative-model'), null, 'a negative rate is no rate');
    // A negative cache rate falls back to the input rate instead of subtracting.
    const partial = rateFor('partial-model');
    assert.strictEqual(partial.cacheRead, 2);
    assert.strictEqual(partial.cacheWrite, 2);
  } finally {
    process.env.SHOOTER_MODEL_PRICING = original;
    resetRateCache();
  }
});

// ── Oversized records ────────────────────────────────────────────────

section('usage-reader: records larger than the read budget');

check('a single record larger than the tail budget is flagged truncated', async () => {
  // The tail then contains no newline at all, so nothing parses. Without an
  // explicit flag the file would look simply empty and the totals would be
  // silently short rather than reported as a lower bound.
  const padded = JSON.stringify({
    cwd: '/Users/dev/proj/widget',
    filler: 'x'.repeat(5 * 1024 * 1024),
    message: {
      id: 'msg-huge',
      model: 'test-priced',
      role: 'assistant',
      usage: { output_tokens: 123 },
    },
    timestamp: new Date().toISOString(),
    type: 'assistant',
  });
  writeTranscript('-Users-dev-proj-widget', 'session-huge', [padded]);

  const snap = await snapshot({ windowMinutes: 60 });
  assert.strictEqual(snap.truncatedFiles, 1, 'the oversized transcript must be reported');
  assert.strictEqual(snap.requests, 0, 'nothing in it was parseable');
});

// ── Runner ───────────────────────────────────────────────────────────

void (async () => {
  for (const step of pending) {
    await step();
  }
  resetRateCache();
  fs.rmSync(CORPUS, { force: true, recursive: true });
  console.log(`\nusage-reader: ${passed} checks passed`);
})();
