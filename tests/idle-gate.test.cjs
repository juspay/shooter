'use strict';
const path = require('path');
const { isInternalChoreographyIdle } = require(
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

console.log('\nsmart-idle gate unit tests\n');

runTest('drops teammate-message choreography', () =>
  assert(
    isInternalChoreographyIdle(
      'Task 3 implementer idle after delivery — expected. Review in progress. <teammate-message teammate_id="pr1-t3">'
    ) === true
  )
);
runTest('drops "expected … idle" phrasing', () =>
  assert(isInternalChoreographyIdle('Idle after delivery — expected.') === true)
);
runTest('drops "another claude session sent a message"', () =>
  assert(isInternalChoreographyIdle('Another Claude session sent a message: do the thing') === true)
);
runTest('keeps a genuine "your move" idle', () =>
  assert(
    isInternalChoreographyIdle("I've finished the refactor. Want me to run the tests?") === false
  )
);
runTest('empty text is not choreography', () => assert(isInternalChoreographyIdle('') === false));
runTest('undefined text is not choreography', () =>
  assert(isInternalChoreographyIdle(undefined) === false)
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
