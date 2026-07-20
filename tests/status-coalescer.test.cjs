'use strict';
require('tsx/cjs');
const path = require('path');
const { summarizeStatusBuffer, makeStatusCoalescer } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'apn', 'status-coalescer.ts')
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

console.log('\nstatus coalescer unit tests\n');

runTest('summarize: 3 idle → "3 agents idle"', () => {
  const s = summarizeStatusBuffer([
    { category: 'idle_input', title: 'a', body: 'x' },
    { category: 'idle_input', title: 'b', body: 'y' },
    { category: 'idle_input', title: 'c', body: 'z' },
  ]);
  assert(/3/.test(s.title) && /idle/i.test(s.title), s.title);
});

runTest('summarize: 1 idle → singular "agent"', () => {
  const s = summarizeStatusBuffer([{ category: 'idle_input', title: 'a', body: 'x' }]);
  assert(/1 agent idle/.test(s.title), s.title);
});

runTest('summarize: mixed → counts idle and attention', () => {
  const s = summarizeStatusBuffer([
    { category: 'idle_input', title: 'a', body: 'x' },
    { category: 'intervention', title: 'b', body: 'y' },
  ]);
  assert(/idle/i.test(s.title) && /attention/i.test(s.title), s.title);
});

runTest('summarize: body is newest-first, deduped of empties', () => {
  const s = summarizeStatusBuffer([
    { category: 'idle_input', title: 'a', body: 'first' },
    { category: 'idle_input', title: 'b', body: 'second' },
  ]);
  assert(s.body.indexOf('second') < s.body.indexOf('first'), s.body);
});

// async: enqueue → one flush per project with all its items after the window
(async () => {
  const flushes = [];
  const c = makeStatusCoalescer({
    windowMs: 20,
    flush: (project, items) => flushes.push({ project, n: items.length }),
  });
  c.enqueue('lighthouse', { category: 'idle_input', title: 'a', body: 'x' });
  c.enqueue('lighthouse', { category: 'idle_input', title: 'b', body: 'y' });
  c.enqueue('director', { category: 'intervention', title: 'c', body: 'z' });
  await new Promise((r) => setTimeout(r, 50));

  runTest('enqueue: lighthouse flushed once with 2 items', () => {
    const lh = flushes.filter((f) => f.project === 'lighthouse');
    assert(lh.length === 1 && lh[0].n === 2, `flushes=${JSON.stringify(flushes)}`);
  });
  runTest('enqueue: director flushed independently with 1 item', () => {
    const d = flushes.filter((f) => f.project === 'director');
    assert(d.length === 1 && d[0].n === 1, `flushes=${JSON.stringify(flushes)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
