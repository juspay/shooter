/**
 * Unit tests for the Codex rollout parser (codex-parser.ts).
 *
 * Loads the real TypeScript module via the tsx CJS loader (its `$lib/types`
 * imports are type-only and erased at runtime, so no path-alias resolution is
 * needed). Validates the canonical-message mapping against a synthetic golden
 * fixture, then smoke-tests against real ~/.codex sessions when present.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

require('tsx/cjs');
const {
  parseCodexRollout,
  parseCodexMeta,
  CodexStreamParser,
} = require('../src/lib/modules/server/sessions/codex-parser.ts');

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

const fixturePath = path.join(__dirname, 'fixtures', 'codex', 'sample-rollout.jsonl');
const fixture = fs.readFileSync(fixturePath, 'utf8');
const { meta, messages } = parseCodexRollout(fixture);

console.log('codex-parser: golden fixture');

check('extracts session_meta (id, cwd, model, cliVersion)', () => {
  assert.ok(meta, 'meta should be present');
  assert.strictEqual(meta.id, 'fixture-uuid-0001');
  assert.strictEqual(meta.cwd, '/Users/dev/proj');
  assert.strictEqual(meta.model, 'gpt-5.5');
  assert.strictEqual(meta.cliVersion, '0.133.0');
});

check('role-run grouping yields the expected role sequence', () => {
  const roles = messages.map((m) => m.role);
  assert.deepStrictEqual(roles, ['user', 'assistant', 'system', 'assistant', 'system', 'assistant', 'user']);
});

check('skips the developer (permissions) preamble', () => {
  const hasPreamble = messages.some((m) => m.parts.some((p) => p.type === 'text' && p.content.includes('permissions')));
  assert.strictEqual(hasPreamble, false);
});

check('first user message is the prompt text', () => {
  assert.deepStrictEqual(messages[0].parts, [{ type: 'text', content: 'List the files' }]);
});

check('assistant turn merges thinking + text + tool_use (encrypted reasoning skipped)', () => {
  const a = messages[1];
  const types = a.parts.map((p) => p.type);
  assert.deepStrictEqual(types, ['thinking', 'text', 'tool_use']);
  assert.strictEqual(a.parts[0].content, 'Planning to list files');
  const tool = a.parts[2];
  assert.strictEqual(tool.toolName, 'shell');
  assert.deepStrictEqual(tool.input, { command: ['ls'] });
  assert.strictEqual(tool.id, 'call_1');
});

check('only one thinking part exists (encrypted-only reasoning produced none)', () => {
  const thinking = messages.flatMap((m) => m.parts).filter((p) => p.type === 'thinking');
  assert.strictEqual(thinking.length, 1);
});

check('function_call_output becomes a system tool_result (not an error)', () => {
  const sys = messages[2];
  assert.strictEqual(sys.parts.length, 1);
  assert.strictEqual(sys.parts[0].type, 'tool_result');
  assert.strictEqual(sys.parts[0].toolUseId, 'call_1');
  assert.strictEqual(sys.parts[0].isError, false);
  assert.ok(sys.parts[0].output.includes('file1.txt'));
});

check('custom_tool_call (apply_patch) maps to tool_use with raw input', () => {
  const a = messages[3];
  assert.strictEqual(a.parts[0].type, 'tool_use');
  assert.strictEqual(a.parts[0].toolName, 'apply_patch');
  assert.ok(String(a.parts[0].input.raw).startsWith('*** Begin Patch'));
});

check('Exit code: 1 output is flagged isError', () => {
  const sys = messages[4];
  assert.strictEqual(sys.parts[0].type, 'tool_result');
  assert.strictEqual(sys.parts[0].isError, true);
});

check('web_search_call maps to tool_use; trailing assistant text merges', () => {
  const a = messages[5];
  const types = a.parts.map((p) => p.type);
  assert.deepStrictEqual(types, ['tool_use', 'text']);
  assert.strictEqual(a.parts[0].toolName, 'web_search_call');
  assert.deepStrictEqual(a.parts[0].input, { type: 'search', query: 'codex notify' });
  assert.strictEqual(a.parts[1].content, 'Done.');
});

check('parseCodexMeta reads only the first line', () => {
  const firstLine = fixture.split('\n')[0];
  const m = parseCodexMeta(firstLine);
  assert.strictEqual(m.id, 'fixture-uuid-0001');
  assert.strictEqual(parseCodexMeta('{"type":"event_msg"}'), null);
  assert.strictEqual(parseCodexMeta('not json'), null);
});

// ── Streaming parser (live watcher) ────────────────────────────────────
console.log('codex-parser: streaming parser');

check('CodexStreamParser fed line-by-line matches the batch parse', () => {
  const sp = new CodexStreamParser();
  const streamed = [];
  for (const line of fixture.split('\n')) {
    streamed.push(...sp.pushLine(line));
  }
  streamed.push(...sp.flushOpen());
  assert.deepStrictEqual(
    streamed.map((m) => m.role),
    messages.map((m) => m.role)
  );
  assert.deepStrictEqual(
    streamed.map((m) => m.parts.map((p) => p.type)),
    messages.map((m) => m.parts.map((p) => p.type))
  );
});

check('CodexStreamParser holds the open run until flushOpen', () => {
  const sp = new CodexStreamParser();
  // Two user lines with an assistant line between: the trailing assistant run
  // stays open until flushOpen().
  const lines = [
    '{"type":"response_item","timestamp":"t","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}}',
    '{"type":"response_item","timestamp":"t","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"working"}]}}',
  ];
  const a = sp.pushLine(lines[0]); // user run open, nothing completed yet
  assert.strictEqual(a.length, 0);
  const b = sp.pushLine(lines[1]); // assistant run starts -> user run completes
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].role, 'user');
  const c = sp.flushOpen(); // assistant run flushes
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].role, 'assistant');
  assert.strictEqual(c[0].parts[0].content, 'working');
});

// ── Smoke test against real sessions (skipped if none present) ──────────
console.log('codex-parser: real-session smoke test');
const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
function findRollouts(dir, acc) {
  if (acc.length >= 3 || !fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (acc.length >= 3) break;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findRollouts(p, acc);
    else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}
const real = findRollouts(sessionsDir, []);
if (real.length === 0) {
  console.log('  - skipped (no ~/.codex sessions on this machine)');
} else {
  for (const f of real) {
    check(`parses ${path.basename(f)} without throwing and yields a cwd`, () => {
      const r = parseCodexRollout(fs.readFileSync(f, 'utf8'));
      assert.ok(r.meta && typeof r.meta.cwd === 'string' && r.meta.cwd.length > 0);
      assert.ok(Array.isArray(r.messages));
      for (const m of r.messages) {
        assert.ok(['user', 'assistant', 'system'].includes(m.role));
        assert.ok(Array.isArray(m.parts) && m.parts.length > 0);
      }
    });
  }
}

console.log(`\ncodex-parser: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
