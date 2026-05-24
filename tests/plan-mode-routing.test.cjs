/**
 * Unit tests for the plan-mode decision routing helpers in
 * .claude/hooks/notifier.cjs.
 *
 * The notifier.cjs file conditionally exports its pure helpers via
 * `module.exports` only when `require()`'d (i.e. when require.main !==
 * module). When executed as a Claude Code hook subprocess, the export
 * is skipped so we don't pollute the runtime path.
 *
 * That lets us unit-test the decision-to-hook-response mapping (which
 * is pure) without spawning Claude Code or mocking the polling loop.
 */

'use strict';

const path = require('path');

const notifier = require(path.join(__dirname, '..', '.claude', 'hooks', 'notifier.cjs'));

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function assertNull(value, label) {
  if (value !== null) {
    throw new Error(`${label}: expected null, got ${JSON.stringify(value)}`);
  }
}

console.log('\nplan-mode routing unit tests\n');

// ── isPlanModePermission ─────────────────────────────────────────────

runTest('isPlanModePermission: matches tool === "ExitPlanMode"', () => {
  assertEqual(notifier.isPlanModePermission({ tool: 'ExitPlanMode' }), true, 'tool field');
});

runTest('isPlanModePermission: matches toolName === "ExitPlanMode"', () => {
  assertEqual(
    notifier.isPlanModePermission({ toolName: 'ExitPlanMode' }),
    true,
    'toolName field'
  );
});

runTest('isPlanModePermission: rejects other tools', () => {
  assertEqual(notifier.isPlanModePermission({ tool: 'Bash' }), false, 'Bash');
  assertEqual(notifier.isPlanModePermission({ tool: 'Edit' }), false, 'Edit');
  assertEqual(notifier.isPlanModePermission({}), false, 'empty');
});

// ── planDecisionToHookResponse ───────────────────────────────────────

runTest('planDecisionToHookResponse(plan_auto) — allow + bypassPermissions', () => {
  const out = notifier.planDecisionToHookResponse('plan_auto');
  assertEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'allow',
        updatedPermissions: [{ type: 'setMode', mode: 'bypassPermissions', destination: 'session' }],
      },
    },
  }, 'plan_auto');
});

runTest('planDecisionToHookResponse(plan_accept) — allow + acceptEdits', () => {
  const out = notifier.planDecisionToHookResponse('plan_accept');
  assertEqual(out.hookSpecificOutput.decision.updatedPermissions[0].mode, 'acceptEdits', 'mode');
  assertEqual(out.hookSpecificOutput.decision.behavior, 'allow', 'behavior');
});

runTest('planDecisionToHookResponse(plan_review) — allow + default', () => {
  const out = notifier.planDecisionToHookResponse('plan_review');
  assertEqual(out.hookSpecificOutput.decision.updatedPermissions[0].mode, 'default', 'mode');
  assertEqual(out.hookSpecificOutput.decision.behavior, 'allow', 'behavior');
});

runTest('planDecisionToHookResponse(plan_keep) — deny with reason', () => {
  const out = notifier.planDecisionToHookResponse('plan_keep');
  assertEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: 'deny',
      permissionDecisionReason: 'User chose to keep planning',
    },
  }, 'plan_keep');
});

runTest('planDecisionToHookResponse(unknown decision) — null', () => {
  assertNull(notifier.planDecisionToHookResponse('option_1'), 'option_1 not a plan mode value');
  assertNull(notifier.planDecisionToHookResponse('allow'), 'allow not a plan mode value');
  assertNull(notifier.planDecisionToHookResponse(''), 'empty');
});

// ── binaryDecisionToHookResponse ─────────────────────────────────────

runTest('binaryDecisionToHookResponse(allow, wsActive=false)', () => {
  const out = notifier.binaryDecisionToHookResponse('allow', false);
  assertEqual(out.hookSpecificOutput.permissionDecision, 'allow', 'decision');
  assertEqual(
    out.hookSpecificOutput.permissionDecisionReason.includes('approved'),
    true,
    'reason mentions approved'
  );
  assertEqual(
    out.hookSpecificOutput.permissionDecisionReason.includes('iPhone notification'),
    true,
    'reason mentions iPhone'
  );
});

runTest('binaryDecisionToHookResponse(deny, wsActive=true)', () => {
  const out = notifier.binaryDecisionToHookResponse('deny', true);
  assertEqual(out.hookSpecificOutput.permissionDecision, 'deny', 'decision');
  assertEqual(
    out.hookSpecificOutput.permissionDecisionReason.includes('denied'),
    true,
    'reason mentions denied'
  );
  assertEqual(
    out.hookSpecificOutput.permissionDecisionReason.includes('WebSocket'),
    true,
    'reason mentions WebSocket'
  );
});

// ── PLAN_MODE_OPTIONS shape ──────────────────────────────────────────

runTest('PLAN_MODE_OPTIONS has 4 entries with id+label+hint', () => {
  const opts = notifier.PLAN_MODE_OPTIONS;
  assertEqual(opts.length, 4, 'option count');
  const ids = opts.map((o) => o.id).sort();
  assertEqual(ids, ['plan_accept', 'plan_auto', 'plan_keep', 'plan_review'], 'ids');
  for (const o of opts) {
    if (typeof o.label !== 'string' || o.label.length === 0) {
      throw new Error(`option ${o.id} missing label`);
    }
    if (typeof o.hint !== 'string' || o.hint.length === 0) {
      throw new Error(`option ${o.id} missing hint`);
    }
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
