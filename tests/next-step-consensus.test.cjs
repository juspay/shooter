/**
 * Unit tests for src/lib/modules/server/sessions/next-step-consensus.ts
 *
 * Tests the pure mergeNextStepConsensus() function:
 *   - quorum (default 3-of-5)
 *   - dedupe/grouping (exact + Jaccard >= 0.6)
 *   - ranking (votes desc, then mean confidence desc)
 *   - no-quorum -> tentative fallback
 *   - empty input
 *   - K-cap (each agent list capped at K=3 items)
 *
 * Loads the TypeScript module via tsx/cjs register.
 */

'use strict';

require('tsx/cjs');

const path = require('path');
const { mergeNextStepConsensus } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'sessions', 'next-step-consensus.ts')
);

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

function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected truthy, got ${JSON.stringify(cond)}`);
}

function assertFalse(cond, label) {
  if (cond) throw new Error(`${label}: expected falsy, got ${JSON.stringify(cond)}`);
}

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

console.log('\nnext-step consensus unit tests\n');

// ── 1. Empty input ──────────────────────────────────────────────────────────

runTest('empty array of lists returns tentative fallback with empty steps', () => {
  const result = mergeNextStepConsensus([]);
  assertEqual(result.steps.length, 0, 'steps should be empty');
  assertEqual(result.agentCount, 0, 'agentCount should be 0');
  assertEqual(result.quorum, 3, 'default quorum');
});

runTest('all-empty agent lists returns empty result', () => {
  const result = mergeNextStepConsensus([[], [], [], [], []]);
  assertEqual(result.steps.length, 0, 'no steps when all lists empty');
  assertEqual(result.agentCount, 5, 'agentCount reflects 5 agents');
});

// ── 2. Quorum met — 3 of 5 agents agree ─────────────────────────────────────

runTest('quorum: 3 of 5 agents propose identical step → 1 consensus step (not tentative)', () => {
  const lists = [
    [{ text: 'Run the tests', confidence: 0.9 }],
    [{ text: 'Run the tests', confidence: 0.8 }],
    [{ text: 'Run the tests', confidence: 0.7 }],
    [{ text: 'Do something else', confidence: 0.5 }],
    [{ text: 'Do another thing', confidence: 0.4 }],
  ];
  const result = mergeNextStepConsensus(lists);
  assertTrue(result.steps.length >= 1, 'at least one step');
  const top = result.steps[0];
  assertEqual(top.votes, 3, 'top step has 3 votes');
  assertFalse(top.tentative, 'should not be tentative');
  assertEqual(result.agentCount, 5, 'agentCount=5');
});

runTest('quorum: 5 of 5 agents all agree → 1 consensus step', () => {
  const lists = [
    [{ text: 'Fix the bug', confidence: 0.9 }],
    [{ text: 'Fix the bug', confidence: 0.85 }],
    [{ text: 'Fix the bug', confidence: 0.8 }],
    [{ text: 'Fix the bug', confidence: 0.75 }],
    [{ text: 'Fix the bug', confidence: 0.7 }],
  ];
  const result = mergeNextStepConsensus(lists);
  assertEqual(result.steps.length, 1, 'exactly one consensus step');
  assertEqual(result.steps[0].votes, 5, 'all 5 vote');
  assertFalse(result.steps[0].tentative, 'not tentative');
});

// ── 3. No quorum → tentative fallback ────────────────────────────────────────

runTest('no quorum: 2 of 5 agree → tentative fallback with 1 step', () => {
  const lists = [
    [{ text: 'Step A', confidence: 0.9 }],
    [{ text: 'Step A', confidence: 0.8 }],
    [{ text: 'Step B', confidence: 0.7 }],
    [{ text: 'Step C', confidence: 0.6 }],
    [{ text: 'Step D', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists);
  assertEqual(result.steps.length, 1, 'exactly one step returned in tentative mode');
  assertEqual(result.steps[0].tentative, true, 'step is tentative');
  assertEqual(result.steps[0].votes, 2, 'highest vote group has 2 votes');
});

runTest('no quorum: 1 of 5 agree → tentative fallback picks highest confidence', () => {
  const lists = [
    [{ text: 'Alpha', confidence: 0.3 }],
    [{ text: 'Beta', confidence: 0.9 }],
    [{ text: 'Gamma', confidence: 0.5 }],
    [{ text: 'Delta', confidence: 0.6 }],
    [{ text: 'Epsilon', confidence: 0.4 }],
  ];
  const result = mergeNextStepConsensus(lists);
  // all have 1 vote, pick highest mean confidence
  assertEqual(result.steps.length, 1, 'one tentative step');
  assertEqual(result.steps[0].tentative, true, 'marked tentative');
  assertEqual(result.steps[0].votes, 1, 'one vote');
  // highest confidence item should win when votes are tied
  assertEqual(result.steps[0].text, 'Beta', 'highest confidence wins tie');
});

// ── 4. Deduplication/grouping — exact normalization ───────────────────────────

runTest('dedupe: same text differing by case/whitespace/trailing punct → single group', () => {
  const lists = [
    [{ text: 'Run the tests.', confidence: 0.9 }],
    [{ text: 'run the tests', confidence: 0.8 }],
    [{ text: 'RUN THE TESTS!', confidence: 0.7 }],
    [{ text: 'run  the  tests', confidence: 0.85 }], // extra whitespace
    [{ text: 'Run the tests,', confidence: 0.75 }],
  ];
  const result = mergeNextStepConsensus(lists);
  assertEqual(result.steps.length, 1, 'all 5 variants collapse to 1 group');
  assertEqual(result.steps[0].votes, 5, 'all 5 votes');
  assertFalse(result.steps[0].tentative, 'not tentative');
});

runTest('dedupe: strips trailing punctuation (periods, commas, semicolons, colons, exclamation, question)', () => {
  const lists = [
    [{ text: 'Update dependencies;', confidence: 0.9 }],
    [{ text: 'Update dependencies:', confidence: 0.8 }],
    [{ text: 'Update dependencies?', confidence: 0.7 }],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 2 });
  assertEqual(result.steps[0].votes, 3, 'all 3 punctuation variants merge');
  assertFalse(result.steps[0].tentative, 'not tentative with quorum=2');
});

// ── 5. Jaccard grouping ──────────────────────────────────────────────────────

runTest('Jaccard >= 0.6 groups near-duplicate phrases', () => {
  // "refactor the auth module" vs "refactor auth module"
  // tokens: {"refactor","the","auth","module"} vs {"refactor","auth","module"}
  // intersection=3 (refactor,auth,module), union=4 → 3/4 = 0.75 >= 0.6 → same group
  const lists = [
    [{ text: 'refactor the auth module', confidence: 0.9 }],
    [{ text: 'refactor auth module', confidence: 0.8 }],
    [{ text: 'refactor the auth module', confidence: 0.7 }],
    [{ text: 'refactor auth module', confidence: 0.85 }],
    [{ text: 'do something unrelated', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists);
  // the 4 "refactor" variants should group together with 4 votes
  const top = result.steps[0];
  assertEqual(top.votes, 4, 'Jaccard groups the 4 near-duplicate proposals');
  assertFalse(top.tentative, 'quorum of 4 (>= default 3) is not tentative');
});

runTest('Jaccard < 0.6 keeps phrases separate', () => {
  // "fix bug" (2 tokens) vs "run all integration tests now" (5 tokens)
  // intersection: empty (no common tokens) → 0/7 = 0 < 0.6 → different groups
  const lists = [
    [{ text: 'fix bug', confidence: 0.9 }],
    [{ text: 'fix bug', confidence: 0.8 }],
    [{ text: 'fix bug', confidence: 0.7 }],
    [{ text: 'run all integration tests now', confidence: 0.6 }],
    [{ text: 'run all integration tests now', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists);
  // "fix bug" has 3 votes (quorum), "run all..." has 2 (no quorum by default)
  const topTexts = result.steps.map((s) => s.text);
  assertTrue(topTexts.some((t) => t.includes('fix bug')), '"fix bug" group in results');
  // the second group does not meet quorum so it should not appear
  assertFalse(topTexts.some((t) => t.includes('integration')), '"integration tests" not in consensus');
});

// ── 6. Ranking: votes desc, then mean confidence desc ────────────────────────

runTest('ranking: higher vote count sorts before lower vote count', () => {
  const lists = [
    [{ text: 'Step High', confidence: 0.5 }, { text: 'Step Low', confidence: 0.9 }],
    [{ text: 'Step High', confidence: 0.5 }, { text: 'Step Low', confidence: 0.9 }],
    [{ text: 'Step High', confidence: 0.5 }, { text: 'Step Low', confidence: 0.9 }],
    [{ text: 'Step High', confidence: 0.5 }],
    [{ text: 'Step High', confidence: 0.5 }],
  ];
  // Step High: 5 votes, Step Low: 3 votes
  const result = mergeNextStepConsensus(lists);
  assertEqual(result.steps[0].votes, 5, 'most votes first');
  assertEqual(result.steps[1].votes, 3, 'fewer votes second');
});

runTest('ranking: equal votes → higher mean confidence ranks first', () => {
  const lists = [
    [{ text: 'Low Conf Step', confidence: 0.3 }, { text: 'High Conf Step', confidence: 0.9 }],
    [{ text: 'Low Conf Step', confidence: 0.3 }, { text: 'High Conf Step', confidence: 0.9 }],
    [{ text: 'Low Conf Step', confidence: 0.3 }, { text: 'High Conf Step', confidence: 0.9 }],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 3 });
  assertEqual(result.steps[0].votes, 3, 'both have 3 votes');
  assertEqual(result.steps[0].text, 'High Conf Step', 'higher confidence ranks first');
  assertEqual(result.steps[1].text, 'Low Conf Step', 'lower confidence second');
});

// ── 7. K-cap (each agent list capped at K=3) ─────────────────────────────────

runTest('K-cap: only first K=3 steps from each agent list are considered', () => {
  // Agent 0 proposes 5 items; only first 3 should count
  const lists = [
    [
      { text: 'Step One', confidence: 0.9 },
      { text: 'Step Two', confidence: 0.8 },
      { text: 'Step Three', confidence: 0.7 },
      { text: 'Step Four should be ignored', confidence: 0.95 },
      { text: 'Step Five should be ignored', confidence: 0.99 },
    ],
    [{ text: 'Step Four should be ignored', confidence: 0.9 }],
    [{ text: 'Step Four should be ignored', confidence: 0.9 }],
    [{ text: 'Step Four should be ignored', confidence: 0.9 }],
    [{ text: 'Step One', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists);
  // "Step Four..." appears in agent 0 (position 4, beyond K=3), agents 1,2,3 (within K=1)
  // When K-capped, "Step Four..." from agent 0 is dropped → 3 votes (agents 1,2,3)
  // "Step One" appears in agents 0 and 4 → 2 votes
  const topStep = result.steps[0];
  // With quorum=3, "Step Four..." gets exactly 3 votes from agents 1,2,3 → consensus
  assertEqual(topStep.votes, 3, 'Step Four has 3 votes from agents 1-3');
  assertTrue(topStep.text.includes('Step Four'), 'Step Four from agents 1-3 wins');
  assertFalse(topStep.tentative, 'meets quorum');
});

runTest('K-cap: custom K via opts.k', () => {
  // With K=1, only first step from each agent counts
  const lists = [
    [{ text: 'Primary', confidence: 0.9 }, { text: 'Secondary should be ignored', confidence: 0.99 }],
    [{ text: 'Primary', confidence: 0.8 }, { text: 'Secondary should be ignored', confidence: 0.99 }],
    [{ text: 'Primary', confidence: 0.7 }, { text: 'Secondary should be ignored', confidence: 0.99 }],
    [{ text: 'Secondary should be ignored', confidence: 0.99 }],
    [{ text: 'Secondary should be ignored', confidence: 0.99 }],
  ];
  const result = mergeNextStepConsensus(lists, { k: 1, quorum: 3 });
  // With K=1: agents 0,1,2 contribute 'Primary'; agents 3,4 contribute 'Secondary'
  // Primary: 3 votes → quorum; Secondary: 2 votes → no quorum
  assertEqual(result.steps.length, 1, 'only primary reaches quorum with k=1');
  assertEqual(result.steps[0].text, 'Primary', 'Primary wins with k=1');
});

// ── 8. Custom quorum via opts ─────────────────────────────────────────────────

runTest('custom quorum: quorum=2 lowers the threshold', () => {
  const lists = [
    [{ text: 'Common step', confidence: 0.8 }],
    [{ text: 'Common step', confidence: 0.7 }],
    [{ text: 'Other step', confidence: 0.9 }],
    [{ text: 'Another step', confidence: 0.6 }],
    [{ text: 'Yet another', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 2 });
  // "Common step" has 2 votes, meets quorum=2
  const commonStep = result.steps.find((s) => s.text === 'Common step');
  assertTrue(commonStep !== undefined, 'Common step in consensus with quorum=2');
  assertFalse(commonStep.tentative, 'not tentative');
});

runTest('custom quorum: quorum=5 requires all agents to agree', () => {
  const lists = [
    [{ text: 'Unanimous step', confidence: 0.9 }],
    [{ text: 'Unanimous step', confidence: 0.8 }],
    [{ text: 'Unanimous step', confidence: 0.7 }],
    [{ text: 'Unanimous step', confidence: 0.6 }],
    [{ text: 'Unanimous step', confidence: 0.5 }],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 5 });
  assertEqual(result.steps.length, 1, 'one step');
  assertEqual(result.steps[0].votes, 5, 'all 5 votes');
  assertFalse(result.steps[0].tentative, 'meets quorum=5');
});

// ── 9. Per-step confidence is mean of proposers' confidences ─────────────────

runTest('confidence: output confidence is mean of the group members confidences', () => {
  const lists = [
    [{ text: 'Step X', confidence: 0.9 }],
    [{ text: 'Step X', confidence: 0.8 }],
    [{ text: 'Step X', confidence: 0.7 }],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 3 });
  const step = result.steps[0];
  // mean = (0.9 + 0.8 + 0.7) / 3 = 0.8
  const expectedMean = (0.9 + 0.8 + 0.7) / 3;
  const diff = Math.abs(step.confidence - expectedMean);
  assertTrue(diff < 0.0001, `confidence should be ~${expectedMean}, got ${step.confidence}`);
});

// ── 10. agentCount and quorum in result ──────────────────────────────────────

runTest('result metadata: agentCount and quorum are set correctly', () => {
  const result = mergeNextStepConsensus(
    [[{ text: 'A', confidence: 0.5 }], [{ text: 'A', confidence: 0.5 }], []],
    { quorum: 2 }
  );
  assertEqual(result.agentCount, 3, 'agentCount=3');
  assertEqual(result.quorum, 2, 'quorum=2');
});

// ── 11. Label: keep highest-confidence original phrasing ──────────────────────

runTest('label: highest-confidence variant is used as group text', () => {
  // All normalize to the same string; the one with 0.95 confidence should be the label
  const lists = [
    [{ text: 'Run tests', confidence: 0.5 }],
    [{ text: 'Run tests!', confidence: 0.95 }], // highest confidence, trailing punct stripped
    [{ text: 'run tests', confidence: 0.4 }],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 3 });
  // All three normalize to "run tests", group to 3 votes, quorum met
  const step = result.steps[0];
  assertEqual(step.votes, 3, '3 votes');
  // The label should be the original phrasing from the highest-confidence member
  assertEqual(step.text, 'Run tests!', 'highest-confidence original phrasing used as label');
});

// ── 12. Multiple consensus steps sorted correctly ─────────────────────────────

runTest('multiple quorum steps: sorted votes desc then confidence desc', () => {
  const lists = [
    [{ text: 'Top step', confidence: 0.8 }, { text: 'Middle step', confidence: 0.5 }],
    [{ text: 'Top step', confidence: 0.9 }, { text: 'Middle step', confidence: 0.6 }],
    [{ text: 'Top step', confidence: 0.7 }, { text: 'Middle step', confidence: 0.7 }],
    [{ text: 'Top step', confidence: 0.6 }],
    [{ text: 'Middle step', confidence: 0.4 }],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 3 });
  // Top step: 4 votes, Middle step: 4 votes but let's check...
  // Actually "Top step": agents 0,1,2,3 = 4 votes
  // "Middle step": agents 0,1,2,4 = 4 votes
  // Same votes → sort by confidence
  assertTrue(result.steps.length >= 2, 'at least 2 consensus steps');
  // All with quorum should appear; verify sorted
  for (let i = 1; i < result.steps.length; i++) {
    const prev = result.steps[i - 1];
    const curr = result.steps[i];
    assertTrue(
      prev.votes > curr.votes || (prev.votes === curr.votes && prev.confidence >= curr.confidence),
      `step[${i-1}] should rank >= step[${i}]: got votes(${prev.votes},${curr.votes}) conf(${prev.confidence.toFixed(3)},${curr.confidence.toFixed(3)})`
    );
  }
});

// ── 13. Invalid confidence sanitisation ───────────────────────────────────────

runTest('NaN confidence is treated as 0 (no NaN leaks into meanConf)', () => {
  const lists = [
    [{ text: 'do x', confidence: NaN }],
    [{ text: 'do x', confidence: 0.9 }],
    [],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 2 });
  const top = result.steps[0];
  assertTrue(Number.isFinite(top.confidence), 'confidence must be finite');
  // mean of (0, 0.9) = 0.45
  assertTrue(Math.abs(top.confidence - 0.45) < 1e-9, `mean should be 0.45, got ${top.confidence}`);
});

runTest('out-of-range confidence is clamped into [0,1]', () => {
  const lists = [
    [{ text: 'do y', confidence: 5 }],
    [{ text: 'do y', confidence: 1 }],
    [],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 2 });
  // both clamp to 1 → mean 1
  assertEqual(result.steps[0].confidence, 1, 'clamped mean is 1');
});

runTest('undefined/missing confidence defaults to 0', () => {
  const lists = [
    [{ text: 'do z' }],
    [{ text: 'do z', confidence: 0.6 }],
    [],
    [],
    [],
  ];
  const result = mergeNextStepConsensus(lists, { quorum: 2 });
  const top = result.steps[0];
  assertTrue(Number.isFinite(top.confidence), 'finite');
  assertTrue(Math.abs(top.confidence - 0.3) < 1e-9, `mean of (0,0.6)=0.3, got ${top.confidence}`);
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
