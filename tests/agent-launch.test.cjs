/**
 * Unit tests for src/lib/modules/server/terminal/agent-launch.ts
 *
 * withAgentPermissionMode() injects a default `--permission-mode <mode>` into a claude launch so
 * managed agent terminals can act without hitting the user's restrictive global permission config.
 * Configurable (off when mode is empty), claude-only, and never overrides an explicit flag.
 *
 * Pure module, loaded via tsx/cjs.
 */
'use strict';
require('tsx/cjs');
const path = require('path');
const { withAgentPermissionMode } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'terminal', 'agent-launch.ts')
);

let passed = 0, failed = 0;
function runTest(name, fn) { try { fn(); console.log(`  PASS  ${name}`); passed++; } catch (e) { console.log(`  FAIL  ${name}`); console.log(`        ${e.message}`); failed++; } }
function eq(a, b, l) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${l}: expected ${y}, got ${x}`); }

console.log('\nagent-launch (default permission mode) tests\n');

runTest('claude + mode + no existing flag -> appends --permission-mode', () => {
  eq(withAgentPermissionMode('claude', [], 'bypassPermissions'), ['--permission-mode', 'bypassPermissions'], 'append');
});

runTest('keeps existing args and appends the mode', () => {
  eq(withAgentPermissionMode('claude', ['--resume', 'abc'], 'bypassPermissions'), ['--resume', 'abc', '--permission-mode', 'bypassPermissions'], 'with resume');
});

runTest('explicit --permission-mode wins (no override)', () => {
  eq(withAgentPermissionMode('claude', ['--permission-mode', 'plan'], 'bypassPermissions'), ['--permission-mode', 'plan'], 'explicit kept');
});

runTest('no mode configured -> unchanged', () => {
  eq(withAgentPermissionMode('claude', ['--resume', 'x'], undefined), ['--resume', 'x'], 'undefined');
  eq(withAgentPermissionMode('claude', [], ''), [], 'empty');
  eq(withAgentPermissionMode('claude', [], '   '), [], 'whitespace');
});

runTest('non-claude command -> unchanged (mode flag is claude-specific)', () => {
  eq(withAgentPermissionMode('bash', [], 'bypassPermissions'), [], 'bash');
  eq(withAgentPermissionMode('node', ['x.js'], 'bypassPermissions'), ['x.js'], 'node');
});

runTest('resolves claude by basename (absolute path)', () => {
  eq(withAgentPermissionMode('/opt/homebrew/bin/claude', [], 'acceptEdits'), ['--permission-mode', 'acceptEdits'], 'abs path');
});

runTest('trims the configured mode value', () => {
  eq(withAgentPermissionMode('claude', [], '  bypassPermissions  '), ['--permission-mode', 'bypassPermissions'], 'trim');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
