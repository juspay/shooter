'use strict';
const path = require('path');
const { isAskUserQuestionTool } = require(
  path.join(__dirname, '..', '.claude', 'hooks', 'notifier.cjs')
);
let passed = 0,
  failed = 0;
function runTest(n, fn) {
  try {
    fn();
    console.log(`  PASS  ${n}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${n}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nAskUserQuestion permission-dedup unit tests\n');

runTest('true for tool=AskUserQuestion', () =>
  assert(isAskUserQuestionTool({ tool: 'AskUserQuestion' }) === true)
);
runTest('true for toolName=AskUserQuestion', () =>
  assert(isAskUserQuestionTool({ toolName: 'AskUserQuestion' }) === true)
);
runTest('false for a real tool (Bash) — still pushes+polls', () =>
  assert(isAskUserQuestionTool({ tool: 'Bash' }) === false)
);
runTest('false for ExitPlanMode — plan approval still pushes', () =>
  assert(isAskUserQuestionTool({ tool: 'ExitPlanMode' }) === false)
);
runTest('false for empty data', () => assert(isAskUserQuestionTool({}) === false));
runTest('undefined-safe', () => assert(isAskUserQuestionTool(undefined) === false));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
