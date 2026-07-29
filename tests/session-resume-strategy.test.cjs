/**
 * Tests for the resume strategy used by POST /api/sessions/connect.
 *
 * The gap under test: `resumeArgsForCommand()` returns [] for every provider
 * without a resume flag (gemini, qwen, cursor-agent, copilot, amp). The connect
 * route passed that straight to ptyManager.create(), so "Connect" on one of
 * those sessions silently spawned a BRAND NEW session and orphaned the
 * transcript the user was trying to return to.
 */

'use strict';
require('tsx/cjs');
const path = require('path');
const { canResumeCommand, decideResumeStrategy } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'sessions', 'registry.ts')
);

let passed = 0,
  failed = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nsession resume strategy unit tests\n');

// --- canResumeCommand ------------------------------------------------------

runTest('canResumeCommand is true for providers with a resume flag', () => {
  assert(canResumeCommand('claude') === true, 'claude resumes');
  assert(canResumeCommand('codex') === true, 'codex resumes');
  assert(canResumeCommand('opencode') === true, 'opencode resumes');
});

runTest('canResumeCommand is false for providers without one', () => {
  for (const command of ['gemini', 'qwen', 'cursor-agent', 'copilot', 'amp']) {
    assert(canResumeCommand(command) === false, `${command} cannot resume`);
  }
});

runTest('canResumeCommand is false for an unknown command', () => {
  assert(canResumeCommand('definitely-not-an-agent') === false, 'unknown cannot resume');
});

// --- decideResumeStrategy --------------------------------------------------

runTest('resumes with the provider-specific args', () => {
  const claude = decideResumeStrategy('claude', 'abc-123', false);
  assert(claude.kind === 'resume', `expected resume, got ${claude.kind}`);
  assert(
    JSON.stringify(claude.args) === JSON.stringify(['--resume', 'abc-123']),
    `claude args wrong: ${JSON.stringify(claude.args)}`
  );

  const codex = decideResumeStrategy('codex', 'abc-123', false);
  assert(codex.kind === 'resume', 'codex resumes');
  assert(
    JSON.stringify(codex.args) === JSON.stringify(['resume', 'abc-123']),
    `codex args wrong: ${JSON.stringify(codex.args)}`
  );

  const opencode = decideResumeStrategy('opencode', 'abc-123', false);
  assert(opencode.kind === 'resume', 'opencode resumes');
  assert(
    JSON.stringify(opencode.args) === JSON.stringify(['--session', 'abc-123']),
    `opencode args wrong: ${JSON.stringify(opencode.args)}`
  );
});

runTest('REGRESSION: refuses instead of silently starting a fresh session', () => {
  for (const command of ['gemini', 'qwen', 'cursor-agent', 'copilot', 'amp']) {
    const decision = decideResumeStrategy(command, 'abc-123', false);
    assert(
      decision.kind === 'refuse',
      `${command} must refuse rather than silently start fresh, got '${decision.kind}'`
    );
    assert(
      typeof decision.reason === 'string' && decision.reason.length > 0,
      `${command} refusal must explain why`
    );
    assert(
      decision.reason.includes(command),
      `${command} refusal should name the command, got: ${decision.reason}`
    );
  }
});

runTest('starts fresh only when the caller explicitly opts in', () => {
  const decision = decideResumeStrategy('gemini', 'abc-123', true);
  assert(decision.kind === 'fresh', `expected fresh, got ${decision.kind}`);
});

runTest('opting in does not downgrade a provider that can resume', () => {
  const decision = decideResumeStrategy('claude', 'abc-123', true);
  assert(decision.kind === 'resume', 'claude still resumes even with allowFresh');
  assert(
    JSON.stringify(decision.args) === JSON.stringify(['--resume', 'abc-123']),
    'claude args preserved'
  );
});

runTest('refuses an unknown command even with allowFresh', () => {
  const decision = decideResumeStrategy('definitely-not-an-agent', 'abc-123', true);
  assert(decision.kind === 'refuse', `unknown command must refuse, got ${decision.kind}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
