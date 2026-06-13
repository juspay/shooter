/**
 * Unit tests for the server-side LiteLLM client's response parsing
 * (src/lib/modules/server/sessions/litellm-client.ts).
 *
 * The client itself does network I/O; these cover the pure extraction/parse
 * helpers, including the balanced-brace extraction that replaces the old
 * greedy /\{[\s\S]*\}/ regex (which grabbed the wrong span across multiple
 * JSON blocks). tsx/cjs lets this plain-node test require the TS module — it
 * imports only Node built-ins, no SvelteKit aliases.
 */

'use strict';

require('tsx/cjs');
const path = require('path');

const { extractJsonContent, parseJsonResponse } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'sessions', 'litellm-client.ts')
);

let passed = 0;
let failed = 0;
function runTest(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (err) { console.log(`  FAIL  ${name}`); console.log(`        ${err.message}`); failed++; }
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function openai(content) {
  return { choices: [{ message: { content }, finish_reason: 'stop' }] };
}

console.log('\nlitellm-client parse unit tests\n');

runTest('extractJsonContent: clean JSON content', () => {
  assertEqual(extractJsonContent(openai('{"summary":"all good"}')), { summary: 'all good' }, 'clean');
});

runTest('extractJsonContent: strips ```json fences', () => {
  assertEqual(extractJsonContent(openai('```json\n{"steps":[{"text":"go","confidence":0.9}]}\n```')),
    { steps: [{ text: 'go', confidence: 0.9 }] }, 'fenced');
});

runTest('extractJsonContent: extracts FIRST balanced object from prose', () => {
  assertEqual(extractJsonContent(openai('Sure! {"summary":"x"} hope that helps')), { summary: 'x' }, 'prose');
});

runTest('extractJsonContent: two JSON blocks -> first (greedy-regex regression)', () => {
  assertEqual(extractJsonContent(openai('{"summary":"first"} and also {"other":"second"}')),
    { summary: 'first' }, 'first only');
});

runTest('extractJsonContent: nested object parses fully', () => {
  assertEqual(parseJsonResponse('{"a":{"b":1},"c":2}'), { a: { b: 1 }, c: 2 }, 'nested');
});

runTest('extractJsonContent: non-string / missing content -> null', () => {
  assertEqual(extractJsonContent(openai(undefined)), null, 'missing');
  assertEqual(extractJsonContent({}), null, 'no choices');
  assertEqual(extractJsonContent(null), null, 'null');
});

runTest('parseJsonResponse: empty / unparseable -> null', () => {
  assertEqual(parseJsonResponse(''), null, 'empty');
  assertEqual(parseJsonResponse('not json at all'), null, 'prose-only');
});

// A reasoning model often emits an invalid brace region (e.g. "{not: valid}") BEFORE the real
// JSON. The brace-scan must skip the failed region and keep scanning, not give up on the first.
runTest('parseJsonResponse: skips an invalid leading {…} region and parses a later valid object', () => {
  assertEqual(
    parseJsonResponse('Based on {not: valid} the answer is {"summary":"ok"}'),
    { summary: 'ok' },
    'second region'
  );
});

runTest('extractJsonContent: reasoning preamble with bad brace region then valid JSON', () => {
  assertEqual(
    extractJsonContent(openai('Let me think {a, b, c} ... final answer: {"steps":[{"text":"go","confidence":0.5}]}')),
    { steps: [{ text: 'go', confidence: 0.5 }] },
    'preamble'
  );
});

// Regression guard for the original intent: the FIRST *valid* object still wins.
runTest('parseJsonResponse: first valid object still wins when no invalid region precedes it', () => {
  assertEqual(
    parseJsonResponse('{"summary":"first"} and also {"other":"second"}'),
    { summary: 'first' },
    'first valid'
  );
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
