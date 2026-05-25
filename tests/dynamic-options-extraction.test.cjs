/**
 * Unit tests for the dynamic-options extraction helpers in
 * .claude/hooks/notifier.cjs:
 *
 *   - categoryForOptionCount
 *   - extractAskUserQuestionOptions
 *   - extractElicitationChoices
 *
 * Same require-but-don't-run pattern as tests/plan-mode-routing.test.cjs
 * — the notifier module attaches pure helpers to module.exports when
 * require()'d, but doesn't run the main hook-processing path because
 * IS_CLAUDE_CODE is false (require.main !== module).
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

console.log('\ndynamic-options extraction unit tests\n');

// ── categoryForOptionCount ───────────────────────────────────────────

runTest('categoryForOptionCount(2) → CLAUDE_CHOICE_2', () => {
  assertEqual(notifier.categoryForOptionCount(2), 'CLAUDE_CHOICE_2', 'count=2');
});

runTest('categoryForOptionCount(3) → CLAUDE_CHOICE_3', () => {
  assertEqual(notifier.categoryForOptionCount(3), 'CLAUDE_CHOICE_3', 'count=3');
});

runTest('categoryForOptionCount(4) → CLAUDE_CHOICE_4', () => {
  assertEqual(notifier.categoryForOptionCount(4), 'CLAUDE_CHOICE_4', 'count=4');
});

runTest('categoryForOptionCount(out-of-range) → null', () => {
  assertNull(notifier.categoryForOptionCount(0), 'count=0');
  assertNull(notifier.categoryForOptionCount(1), 'count=1');
  assertNull(notifier.categoryForOptionCount(5), 'count=5');
  assertNull(notifier.categoryForOptionCount(99), 'count=99');
});

// ── extractAskUserQuestionOptions ────────────────────────────────────

runTest('extractAskUserQuestionOptions: empty/invalid input → null', () => {
  assertNull(notifier.extractAskUserQuestionOptions({}), 'empty object');
  assertNull(notifier.extractAskUserQuestionOptions({ questions: [] }), 'empty questions');
  assertNull(
    notifier.extractAskUserQuestionOptions({ questions: [{ options: [] }] }),
    'question with empty options'
  );
  assertNull(
    notifier.extractAskUserQuestionOptions({ questions: [{ options: [{ label: 'Just one' }] }] }),
    'only 1 option (need ≥2)'
  );
});

runTest('extractAskUserQuestionOptions: 2 options with descriptions', () => {
  const result = notifier.extractAskUserQuestionOptions({
    questions: [
      {
        question: 'Which framework should we use?',
        header: 'Framework choice',
        options: [
          { label: 'SvelteKit', description: 'Full-stack reactive' },
          { label: 'Next.js', description: 'React-based' },
        ],
      },
    ],
  });
  assertEqual(result.question, 'Which framework should we use?', 'question');
  assertEqual(result.header, 'Framework choice', 'header');
  assertEqual(result.options.length, 2, 'option count');
  assertEqual(
    result.options[0],
    { id: 'option_1', label: 'SvelteKit', hint: 'Full-stack reactive' },
    'option 1'
  );
  assertEqual(
    result.options[1],
    { id: 'option_2', label: 'Next.js', hint: 'React-based' },
    'option 2'
  );
});

runTest('extractAskUserQuestionOptions: drops description when absent', () => {
  const result = notifier.extractAskUserQuestionOptions({
    questions: [
      {
        question: 'Continue?',
        options: [{ label: 'Yes' }, { label: 'No' }],
      },
    ],
  });
  assertEqual(result.options[0], { id: 'option_1', label: 'Yes' }, 'no hint for option 1');
  assertEqual(result.options[1], { id: 'option_2', label: 'No' }, 'no hint for option 2');
});

runTest('extractAskUserQuestionOptions: caps at 4 options', () => {
  const result = notifier.extractAskUserQuestionOptions({
    questions: [
      {
        question: 'Pick one',
        options: [
          { label: 'A' },
          { label: 'B' },
          { label: 'C' },
          { label: 'D' },
          { label: 'E (should be dropped)' },
          { label: 'F (should be dropped)' },
        ],
      },
    ],
  });
  assertEqual(result.options.length, 4, 'capped at 4');
  assertEqual(
    result.options.map((o) => o.label),
    ['A', 'B', 'C', 'D'],
    'kept first 4'
  );
});

runTest('extractAskUserQuestionOptions: synthesizes Option N label when blank', () => {
  const result = notifier.extractAskUserQuestionOptions({
    questions: [{ question: '?', options: [{ label: '' }, { label: '' }] }],
  });
  assertEqual(result.options[0].label, 'Option 1', 'fallback label 1');
  assertEqual(result.options[1].label, 'Option 2', 'fallback label 2');
});

// ── extractElicitationChoices ────────────────────────────────────────

runTest('extractElicitationChoices: direct choices[] on data', () => {
  const result = notifier.extractElicitationChoices({
    choices: ['frontend', 'backend', 'fullstack'],
  });
  assertEqual(result.fieldName, null, 'no fieldName for direct shape');
  assertEqual(result.options.length, 3, 'option count');
  assertEqual(result.options[0], { id: 'option_1', label: 'frontend' }, 'option 1');
  assertEqual(result.options[1], { id: 'option_2', label: 'backend' }, 'option 2');
  assertEqual(result.options[2], { id: 'option_3', label: 'fullstack' }, 'option 3');
});

runTest('extractElicitationChoices: nested fields[].choices (MCP shape)', () => {
  const result = notifier.extractElicitationChoices({
    fields: [
      { name: 'env', type: 'text', label: 'Env name' },
      {
        name: 'mode',
        type: 'select',
        label: 'Mode',
        choices: [
          { value: 'dev', label: 'Development' },
          { value: 'prod', label: 'Production' },
        ],
      },
    ],
  });
  assertEqual(result.fieldName, 'mode', 'fieldName picked up from select field');
  assertEqual(result.options.length, 2, 'option count');
  assertEqual(result.options[0].label, 'Development', 'option 1 label from value+label object');
  assertEqual(result.options[1].label, 'Production', 'option 2 label');
});

runTest('extractElicitationChoices: no select field → null', () => {
  assertNull(notifier.extractElicitationChoices({}), 'empty');
  assertNull(notifier.extractElicitationChoices({ fields: [] }), 'empty fields');
  assertNull(
    notifier.extractElicitationChoices({
      fields: [{ name: 'x', type: 'text' }],
    }),
    'no select fields'
  );
  assertNull(
    notifier.extractElicitationChoices({
      fields: [{ name: 'x', type: 'select', choices: ['only-one'] }],
    }),
    'select with only 1 choice'
  );
});

runTest('extractElicitationChoices: caps at 4 choices', () => {
  const result = notifier.extractElicitationChoices({
    choices: ['a', 'b', 'c', 'd', 'e', 'f'],
  });
  assertEqual(result.options.length, 4, 'capped at 4');
  assertEqual(
    result.options.map((o) => o.label),
    ['a', 'b', 'c', 'd'],
    'kept first 4'
  );
});

runTest('extractElicitationChoices: string and object choice items', () => {
  const result = notifier.extractElicitationChoices({
    choices: ['plain-string', { label: 'with-label' }, { value: 'just-value' }],
  });
  assertEqual(result.options[0].label, 'plain-string', 'string item');
  assertEqual(result.options[1].label, 'with-label', 'object with label');
  assertEqual(result.options[2].label, 'just-value', 'object with value fallback');
});

// ── adaptClaudeCodeEvent forwards elicitation choices ────────────────
// Regression: the Notification adapter previously dropped `choices` /
// `fields` from stdin, leaving extractElicitationChoices nothing to
// read from. The pure helper passed its own tests; the full hook path
// silently emitted a no-options notification.

runTest('adaptClaudeCodeEvent: elicitation_dialog forwards direct choices[]', () => {
  const event = notifier.adaptClaudeCodeEvent('Notification', {
    session_id: 'abc',
    notification_type: 'elicitation_dialog',
    message: 'Pick one',
    choices: ['a', 'b', 'c'],
  });
  assertEqual(event.data.choices, ['a', 'b', 'c'], 'choices forwarded into data');
  const extracted = notifier.extractElicitationChoices(event.data);
  if (!extracted) throw new Error('extractElicitationChoices returned null after adapter');
  assertEqual(extracted.options.length, 3, 'extractor sees 3 options post-adapter');
});

runTest('adaptClaudeCodeEvent: elicitation_dialog forwards MCP fields[]', () => {
  const event = notifier.adaptClaudeCodeEvent('Notification', {
    session_id: 'abc',
    notification_type: 'elicitation_dialog',
    message: 'Pick one',
    fields: [
      {
        name: 'env',
        type: 'select',
        label: 'Env',
        choices: [
          { value: 'p', label: 'Prod' },
          { value: 's', label: 'Stage' },
        ],
      },
    ],
  });
  if (!Array.isArray(event.data.fields)) throw new Error('fields not forwarded into data');
  const extracted = notifier.extractElicitationChoices(event.data);
  if (!extracted) throw new Error('extractElicitationChoices returned null after adapter');
  assertEqual(extracted.options.length, 2, 'extractor sees 2 options from MCP fields');
  assertEqual(extracted.fieldName, 'env', 'fieldName propagated');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
