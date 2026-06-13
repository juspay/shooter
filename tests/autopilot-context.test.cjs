/**
 * Unit tests for src/lib/modules/server/sessions/autopilot-context.ts
 *
 * The autopilot engine builds its LLM context from the last few session events but has no
 * memory of the session GOAL — so across cycles the goal scrolls out of the window and the
 * derived next-steps drift. These tests cover the goal-pin: a per-terminal goal store plus a
 * pure context builder that prepends `Goal: <goal>` so consensus stays anchored every cycle.
 *
 * Pure module (no server imports), loaded via tsx/cjs register — same pattern as
 * next-step-consensus.test.cjs.
 */

'use strict';

require('tsx/cjs');

const path = require('path');
const mod = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'sessions', 'autopilot-context.ts')
);
const { buildEngineContext, setEngineGoal, getEngineGoal, clearEngineGoal } = mod;

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

function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected truthy, got ${JSON.stringify(cond)}`);
}

function assertFalse(cond, label) {
  if (cond) throw new Error(`${label}: expected falsy, got ${JSON.stringify(cond)}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const baseSession = {
  projectName: 'temp/workforge',
  status: 'idle',
  errorCount: 0,
  toolCallCount: 4,
  events: ['agent-idle msg=added the --dry-run option', 'tool-completed tool=Edit'],
  trigger: 'agent-idle',
};

console.log('\nautopilot context (goal-pin) unit tests\n');

// ── buildEngineContext: goal prepended ────────────────────────────────────────

runTest('with a goal: context leads with "Goal: <goal>"', () => {
  const goal = 'Add a --dry-run flag to workforge create';
  const ctx = buildEngineContext({ ...baseSession, goal });
  assertTrue(ctx.includes(`Goal: ${goal}`), 'context contains the goal line');
  assertTrue(ctx.indexOf('Goal:') === 0, 'goal is the very first thing (anchors the lenses)');
  assertTrue(ctx.indexOf('Goal:') < ctx.indexOf('Project:'), 'goal precedes project');
});

runTest('without a goal: no "Goal:" line', () => {
  const ctx = buildEngineContext({ ...baseSession });
  assertFalse(ctx.includes('Goal:'), 'no goal line when goal is absent');
  assertTrue(ctx.includes('Project: temp/workforge'), 'still has project');
});

runTest('whitespace-only goal is treated as no goal', () => {
  const ctx = buildEngineContext({ ...baseSession, goal: '   \n  ' });
  assertFalse(ctx.includes('Goal:'), 'blank goal does not produce a goal line');
});

runTest('context still carries status, tool calls, recent events, trigger', () => {
  const ctx = buildEngineContext({ ...baseSession, goal: 'G' });
  assertTrue(ctx.includes('Status: idle'), 'status present');
  assertTrue(ctx.includes('Tool calls: 4'), 'tool count present');
  assertTrue(ctx.includes('--dry-run option'), 'recent events present');
  assertTrue(ctx.includes('Trigger: agent-idle'), 'trigger present');
});

// ── goal store: set / get / clear ─────────────────────────────────────────────

runTest('setEngineGoal + getEngineGoal round-trips per terminal', () => {
  setEngineGoal('term-A', 'goal A');
  setEngineGoal('term-B', 'goal B');
  assertEqual(getEngineGoal('term-A'), 'goal A', 'A');
  assertEqual(getEngineGoal('term-B'), 'goal B', 'B');
  assertEqual(getEngineGoal('term-unknown'), undefined, 'unknown terminal → undefined');
});

runTest('setEngineGoal trims the stored goal', () => {
  setEngineGoal('term-C', '  trimmed goal  ');
  assertEqual(getEngineGoal('term-C'), 'trimmed goal', 'stored goal is trimmed');
});

runTest('setEngineGoal with blank clears any existing goal', () => {
  setEngineGoal('term-D', 'temp');
  setEngineGoal('term-D', '   ');
  assertEqual(getEngineGoal('term-D'), undefined, 'blank set clears the goal');
});

runTest('clearEngineGoal removes a stored goal', () => {
  setEngineGoal('term-E', 'to be cleared');
  clearEngineGoal('term-E');
  assertEqual(getEngineGoal('term-E'), undefined, 'cleared');
});

runTest('setEngineGoal caps the stored goal at 500 chars (context bloat defense)', () => {
  const long = 'x'.repeat(900);
  setEngineGoal('term-cap', long);
  assertEqual(getEngineGoal('term-cap').length, 500, 'stored goal capped to 500 chars');
});

// ── integration: stored goal flows into the built context ─────────────────────

runTest('a stored goal flows into buildEngineContext for that terminal', () => {
  setEngineGoal('term-F', 'Ship the dry-run preview');
  const ctx = buildEngineContext({ ...baseSession, goal: getEngineGoal('term-F') });
  assertTrue(ctx.includes('Goal: Ship the dry-run preview'), 'stored goal appears in context');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
