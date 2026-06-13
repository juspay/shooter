/**
 * Unit tests for src/lib/modules/client/dashboard/decide-injection.ts
 *
 * Two pure functions guarding the auto-inject loop:
 *   - decideInjection(state, consensus, now, policy): the GATE — idle-only,
 *     managed-only, dedup-by-step, rate-limit, circuit-breaker, confidence floor.
 *   - guardCommand(command, lastInjectedCommand, policy): vets the concrete
 *     command before it is written to the PTY (single-line, length, dangerous
 *     patterns, duplicate).
 *
 * Loads the TypeScript module via tsx/cjs register (import type is erased, so the
 * $lib/types type-only import does not need alias resolution at runtime).
 */

'use strict';

require('tsx/cjs');

const path = require('path');
const mod = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'dashboard', 'decide-injection.ts')
);
const { DEFAULT_INJECTION_POLICY, decideInjection, guardCommand } = mod;

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

function assert(cond, label) {
  if (!cond) {
    throw new Error(label || 'assertion failed');
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = 1_000_000;

// A state in which every gate passes (idle, managed, no recent activity/injection).
function passingState(overrides) {
  return Object.assign(
    {
      autoActionCount: 0,
      isManaged: true,
      lastActedStep: null,
      lastActivityAt: 0,
      lastEventType: 'agent-idle',
      lastInjectedAt: 0,
      terminalId: 't1',
    },
    overrides || {}
  );
}

function passingConsensus(overrides) {
  const step = Object.assign({ confidence: 0.9, text: 'Run pnpm install', votes: 4 }, (overrides && overrides.step) || {});
  return { agentCount: 5, quorum: 3, steps: [step] };
}

// ── decideInjection: the gate ────────────────────────────────────────

runTest('acts when idle + managed + high-confidence non-tentative consensus', () => {
  const d = decideInjection(passingState(), passingConsensus(), NOW);
  assertEqual(d.act, true, 'act');
  assert(d.step && d.step.text === 'Run pnpm install', 'step carried through');
});

runTest('no consensus steps -> no act', () => {
  const d = decideInjection(passingState(), { agentCount: 5, quorum: 3, steps: [] }, NOW);
  assertEqual(d.act, false, 'act');
});

runTest('tentative top step -> no act', () => {
  const d = decideInjection(passingState(), passingConsensus({ step: { tentative: true } }), NOW);
  assertEqual(d.act, false, 'act');
});

// allowTentative: for AGENT terminals the injection is a PROMPT the agent reasons about (not a
// raw command executed verbatim), so the quorum/tentative precision filter is relaxed there.
// The real guards (confidence floor, dedup, breaker, managed/idle/grace/rate) all still apply.
runTest('allowTentative=true -> acts on a tentative step (agent terminal)', () => {
  const d = decideInjection(
    passingState(),
    passingConsensus({ step: { tentative: true } }),
    NOW,
    DEFAULT_INJECTION_POLICY,
    { allowTentative: true }
  );
  assertEqual(d.act, true, 'act');
  assert(d.step && d.step.tentative === true, 'the tentative step is carried through');
});

runTest('allowTentative=true does NOT bypass the confidence floor', () => {
  const d = decideInjection(
    passingState(),
    passingConsensus({ step: { tentative: true, confidence: 0.4 } }),
    NOW,
    DEFAULT_INJECTION_POLICY,
    { allowTentative: true }
  );
  assertEqual(d.act, false, 'low-confidence tentative still blocked by the floor');
});

runTest('allowTentative=true does NOT bypass other guards (not idle)', () => {
  const d = decideInjection(
    passingState({ lastEventType: 'tool-started' }),
    passingConsensus({ step: { tentative: true } }),
    NOW,
    DEFAULT_INJECTION_POLICY,
    { allowTentative: true }
  );
  assertEqual(d.act, false, 'not-idle still blocks even with allowTentative');
});

runTest('external/read-only (not managed) -> no act', () => {
  const d = decideInjection(passingState({ isManaged: false }), passingConsensus(), NOW);
  assertEqual(d.act, false, 'act');
});

runTest('agent not idle (tool running) -> no act', () => {
  const d = decideInjection(passingState({ lastEventType: 'tool-started' }), passingConsensus(), NOW);
  assertEqual(d.act, false, 'act');
});

runTest('recent activity within human grace -> no act', () => {
  const d = decideInjection(
    passingState({ lastActivityAt: NOW - 1_000 }),
    passingConsensus(),
    NOW
  );
  assertEqual(d.act, false, 'act');
});

runTest('within min interval since last injection -> no act', () => {
  const d = decideInjection(
    passingState({ lastInjectedAt: NOW - 1_000 }),
    passingConsensus(),
    NOW
  );
  assertEqual(d.act, false, 'act');
});

runTest('circuit breaker: autoActionCount at max -> no act', () => {
  const d = decideInjection(
    passingState({ autoActionCount: DEFAULT_INJECTION_POLICY.maxAutoActions }),
    passingConsensus(),
    NOW
  );
  assertEqual(d.act, false, 'act');
});

runTest('confidence below floor -> no act', () => {
  const d = decideInjection(passingState(), passingConsensus({ step: { confidence: 0.2 } }), NOW);
  assertEqual(d.act, false, 'act');
});

runTest('already acted on this exact step -> no act', () => {
  const d = decideInjection(
    passingState({ lastActedStep: 'run pnpm install' }),
    passingConsensus(),
    NOW
  );
  assertEqual(d.act, false, 'act');
});

// ── guardCommand: vets the concrete command ──────────────────────────

runTest('accepts a normal single-line command (trimmed)', () => {
  const v = guardCommand('  pnpm install  ', null);
  assertEqual(v.safe, true, 'safe');
  assertEqual(v.command, 'pnpm install', 'trimmed command');
});

runTest('rejects empty / whitespace-only', () => {
  assertEqual(guardCommand('', null).safe, false, 'empty');
  assertEqual(guardCommand('   ', null).safe, false, 'whitespace');
});

runTest('rejects multi-line command', () => {
  assertEqual(guardCommand('echo a\nrm b', null).safe, false, 'multiline');
});

runTest('rejects rm -rf / family', () => {
  assertEqual(guardCommand('rm -rf /', null).safe, false, 'rm -rf /');
  assertEqual(guardCommand('sudo rm -rf /*', null).safe, false, 'rm -rf /*');
});

runTest('rejects fork bomb', () => {
  assertEqual(guardCommand(':(){ :|:& };:', null).safe, false, 'fork bomb');
});

runTest('rejects write to device / disk', () => {
  assertEqual(guardCommand('dd if=/dev/zero of=/dev/sda', null).safe, false, 'dd to disk');
  assertEqual(guardCommand('mkfs.ext4 /dev/sda1', null).safe, false, 'mkfs');
});

runTest('rejects duplicate of last injected command', () => {
  assertEqual(guardCommand('pnpm install', 'pnpm install').safe, false, 'duplicate');
  assertEqual(guardCommand(' pnpm install ', 'pnpm install').safe, false, 'duplicate (untrimmed)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
