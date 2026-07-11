/**
 * Unit tests for src/lib/modules/client/common/edge-swipe.ts
 *
 * Pure decision helpers for the edge-swipe-back gesture: edge engagement,
 * axis lock (dead-zone), and the commit-back threshold. The touch plumbing in
 * EdgeSwipeBack.svelte calls these; testing them here makes the gesture logic
 * deterministically verifiable without a DOM.
 */

'use strict';

require('tsx/cjs');
const path = require('path');
const { shouldEngageEdge, resolveSwipeAxis, shouldCommitBack } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'client', 'common', 'edge-swipe.ts')
);

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    failed++;
  }
}

console.log('\nedge-swipe gesture logic\n');

// shouldEngageEdge
ok(shouldEngageEdge(0, 28) === true, 'engages at the very edge (x=0)');
ok(shouldEngageEdge(28, 28) === true, 'engages exactly at the edge width');
ok(shouldEngageEdge(29, 28) === false, 'does not engage just past the edge');
ok(shouldEngageEdge(200, 28) === false, 'does not engage mid-screen');

// resolveSwipeAxis
ok(resolveSwipeAxis(3, 2) === '', 'undecided inside the 8px dead-zone');
ok(resolveSwipeAxis(20, 4) === 'x', 'horizontal drag locks to x');
ok(resolveSwipeAxis(4, 20) === 'y', 'vertical drag locks to y');
ok(resolveSwipeAxis(10, 10) === 'x', 'a tie favours horizontal (back-swipe)');
ok(resolveSwipeAxis(-20, 3) === 'x', 'leftward horizontal still locks x (rejected later by sign)');

// shouldCommitBack (default threshold 0.32)
ok(shouldCommitBack(200, 500) === true, 'commits past 32% of width');
ok(shouldCommitBack(100, 500) === false, 'does not commit below 32%');
ok(shouldCommitBack(160, 500) === false, 'exactly at threshold does not commit (strict >)');
ok(shouldCommitBack(161, 500) === true, 'just past threshold commits');
ok(shouldCommitBack(100, 0) === false, 'zero width never commits (avoids div-by-zero engage)');
ok(shouldCommitBack(50, 100, 0.4) === true, 'custom threshold honoured');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
