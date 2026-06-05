/**
 * Fixture-based validation for the three "spec-built" provider readers:
 * Cursor, GitHub Copilot CLI, and Amp.
 *
 * These readers were written against a format spec but had no real local
 * sessions on the dev machine to prove them end to end. This suite closes that
 * gap by exercising them against ground-truth fixtures taken from the wesm/
 * agentsview reference implementation (its own parser testdata + inline test
 * fixtures) — the same implementation Shooter's provider-registry pattern was
 * modelled on.
 *
 * Each reader derives its session root from os.homedir() at module load, and
 * Node honours $HOME on POSIX — so we point HOME at a temp dir, stage each
 * fixture at the path the reader expects, then drive the real public API
 * (list*Projects + get*Conversation) and assert on the canonical
 * ConversationMessage output. This tests discovery + parsing together, not just
 * an internal function.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point HOME at a throwaway dir BEFORE loading any reader, so each reader's
// module-load `homedir()` root resolves inside our staging area.
const FIXTURES = path.join(__dirname, 'fixtures');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-readers-'));
process.env.HOME = HOME;

function stage(relInHome, fixtureRel) {
  const dest = path.join(HOME, relInHome);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fixtureRel), dest);
  return dest;
}

// Stage all three providers into the temp HOME at the paths each reader scans.
stage('.cursor/projects/-Users-dev-proj/agent-transcripts/abc123.jsonl', 'cursor/transcript.jsonl');
stage('.copilot/session-state/copilot-sess.jsonl', 'copilot/session.jsonl');
stage('.local/share/amp/threads/T-amptest.json', 'amp/thread.json');

// Load the real TS readers via the tsx CJS loader (type-only $lib imports erase
// at runtime). Required AFTER HOME is set so their roots point at the staging dir.
require('tsx/cjs');
const SESSIONS = '../src/lib/modules/server/sessions';
const cursor = require(`${SESSIONS}/cursor-reader.ts`);
const copilot = require(`${SESSIONS}/copilot-reader.ts`);
const amp = require(`${SESSIONS}/amp-reader.ts`);
const providerPaths = require(`${SESSIONS}/provider-paths.ts`);

let passed = 0;
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

const types = (msg) => msg.parts.map((p) => p.type);
const roles = (msgs) => msgs.map((m) => m.role);
const firstOfType = (msg, t) => msg.parts.find((p) => p.type === t);

// ── Cursor ──────────────────────────────────────────────────────────────
console.log('provider-readers: cursor');

check('listCursorProjects groups the staged transcript under its decoded cwd', () => {
  const projects = cursor.listCursorProjects();
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].fullPath, '/Users/dev/proj');
  assert.strictEqual(projects[0].sessionCount, 1);
  assert.strictEqual(projects[0].sessions[0].id, 'abc123');
  assert.strictEqual(projects[0].sessions[0].source, 'cursor');
});

check('getCursorConversation yields the expected role + part sequence', () => {
  const msgs = cursor.getCursorConversation('abc123');
  assert.deepStrictEqual(roles(msgs), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.deepStrictEqual(types(msgs[1]), ['text', 'tool_use']);
  assert.deepStrictEqual(types(msgs[3]), ['thinking', 'text']);
  assert.deepStrictEqual(types(msgs[5]), ['thinking', 'tool_use', 'text']);
});

check('cursor tool_use blocks carry name + input', () => {
  const msgs = cursor.getCursorConversation('abc123');
  const edit = firstOfType(msgs[1], 'tool_use');
  assert.strictEqual(edit.toolName, 'Edit');
  assert.strictEqual(edit.input.file_path, 'main.go');
  assert.strictEqual(edit.id, 'tu_1');
  const bash = firstOfType(msgs[5], 'tool_use');
  assert.strictEqual(bash.toolName, 'Bash');
  assert.strictEqual(bash.input.command, 'ls');
});

check('cursor thinking blocks preserve their text', () => {
  const msgs = cursor.getCursorConversation('abc123');
  assert.strictEqual(firstOfType(msgs[3], 'thinking').content, 'Let me reason...');
});

// ── Launch-time discovery (the path that makes Shooter-launched live-tail engage) ──
console.log('provider-readers: discovery');

check('resolveReadOnlyProviderFile maps a cursor session id to its staged path', () => {
  const p = providerPaths.resolveReadOnlyProviderFile('cursor', 'abc123');
  assert.ok(typeof p === 'string' && p.endsWith('/agent-transcripts/abc123.jsonl'), `got ${p}`);
});

check('discoverReadOnlyProviderSessionFile picks a session created after launch', () => {
  // WRITE (not copy) a fresh transcript so its birthtime == now — this models a
  // real `cursor-agent` launch, which creates a brand-new session file. (Copying
  // would clone the fixture's old birthtime on APFS and be wrongly filtered out.)
  const freshDir = path.join(HOME, '.cursor/projects/-Users-dev-fresh/agent-transcripts');
  fs.mkdirSync(freshDir, { recursive: true });
  fs.writeFileSync(
    path.join(freshDir, 'fresh999.jsonl'),
    fs.readFileSync(path.join(FIXTURES, 'cursor/transcript.jsonl'))
  );
  const now = Date.now();
  const file = providerPaths.discoverReadOnlyProviderSessionFile(
    'cursor',
    '/Users/dev/fresh',
    now - 3000,
    now
  );
  assert.ok(typeof file === 'string' && file.endsWith('fresh999.jsonl'), `expected fresh999.jsonl, got ${file}`);
});

check('discoverReadOnlyProviderSessionFile returns null when no session started after launch', () => {
  // Launch timestamp in the future → nothing qualifies → null (the silent-degrade
  // branch that would leave a Shooter-launched terminal without a session key).
  const now = Date.now();
  const file = providerPaths.discoverReadOnlyProviderSessionFile(
    'cursor',
    '/Users/dev/fresh',
    now + 100_000,
    now + 100_000
  );
  assert.strictEqual(file, null);
});

// ── Copilot ─────────────────────────────────────────────────────────────
console.log('provider-readers: copilot');

check('listCopilotProjects reads cwd + branch from session.start', () => {
  const projects = copilot.listCopilotProjects();
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].fullPath, '/Users/dev/proj');
  assert.strictEqual(projects[0].sessions[0].id, 'copilot-sess');
  assert.strictEqual(projects[0].sessions[0].gitBranch, 'main');
});

check('getCopilotConversation yields the expected role sequence', () => {
  const msgs = copilot.getCopilotConversation('copilot-sess');
  assert.deepStrictEqual(roles(msgs), ['user', 'assistant', 'system', 'assistant', 'assistant', 'system']);
});

check('copilot toolRequests become tool_use with parsed string arguments', () => {
  const msgs = copilot.getCopilotConversation('copilot-sess');
  const tool = firstOfType(msgs[1], 'tool_use');
  assert.strictEqual(tool.toolName, 'view');
  assert.strictEqual(tool.input.path, 'config.json');
  assert.strictEqual(tool.id, 'tc-1');
});

check('copilot tool.execution_complete maps to tool_result (success=true → not error)', () => {
  const msgs = copilot.getCopilotConversation('copilot-sess');
  const tr = firstOfType(msgs[2], 'tool_result');
  assert.strictEqual(tr.toolUseId, 'tc-1');
  assert.strictEqual(tr.isError, false);
  assert.ok(tr.output.includes('key'));
});

check('copilot inline reasoningText becomes a thinking part before the text', () => {
  const msgs = copilot.getCopilotConversation('copilot-sess');
  assert.deepStrictEqual(types(msgs[3]), ['thinking', 'text']);
  assert.ok(firstOfType(msgs[3], 'thinking').content.includes('carefully'));
  assert.strictEqual(firstOfType(msgs[3], 'text').content, 'Here is my analysis.');
});

check('copilot success=false marks the tool_result as an error', () => {
  const msgs = copilot.getCopilotConversation('copilot-sess');
  const tr = firstOfType(msgs[5], 'tool_result');
  assert.strictEqual(tr.isError, true);
  assert.strictEqual(tr.output, 'boom');
});

// ── Amp ─────────────────────────────────────────────────────────────────
console.log('provider-readers: amp');

check('listAmpProjects derives project from env.initial.trees[0].displayName', () => {
  const projects = amp.listAmpProjects();
  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].fullPath, 'myrepo');
  assert.strictEqual(projects[0].sessions[0].id, 'amptest');
  assert.strictEqual(projects[0].sessions[0].messageCount, 3);
});

check('getAmpConversation yields user → assistant(thinking+tool) → user(tool_result)', () => {
  const msgs = amp.getAmpConversation('amptest');
  assert.deepStrictEqual(roles(msgs), ['user', 'assistant', 'user']);
  assert.deepStrictEqual(types(msgs[1]), ['thinking', 'tool_use']);
  const read = firstOfType(msgs[1], 'tool_use');
  assert.strictEqual(read.toolName, 'Read');
  assert.strictEqual(read.input.file_path, 'main.go');
  const tr = firstOfType(msgs[2], 'tool_result');
  assert.strictEqual(tr.toolUseId, 'tu1');
  assert.strictEqual(tr.output, 'package main');
});

// ── Teardown ──────────────────────────────────────────────────────────────
try {
  fs.rmSync(HOME, { recursive: true, force: true });
} catch {
  // best-effort cleanup
}

console.log(`\nprovider-readers: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
