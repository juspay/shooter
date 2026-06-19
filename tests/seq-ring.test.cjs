/**
 * Unit tests for the Phase 0 sequence-ring logic.
 *
 * Replicates the exact functions added to pty-manager.ts (appendSeqRing,
 * getSeqRingFrom) as pure CJS — no TypeScript / path aliases — mirroring the
 * repo's test convention.
 */

'use strict';

const assert = require('node:assert');

const SEQ_RING_MAX_ENTRIES = 2000; // must match pty-manager.ts

// ── Pure implementations under test (mirror pty-manager.ts) ──────────────────

/** Append one entry; trim oldest past the cap. Returns the new seq. */
function appendSeqRing(state, data) {
  const seq = state.seqCounter + 1;
  state.seqRing.push({ data, seq });
  if (state.seqRing.length > SEQ_RING_MAX_ENTRIES) {
    state.seqRing.shift();
  }
  state.seqCounter = seq;
  return seq;
}

/**
 * Entries with seq > afterSeq, or null when the gap is unresolvable from the
 * ring (caller must snapshot). Mirrors pty-manager.ts getSeqRingFrom — takes
 * the {seqCounter, seqRing} state so it can detect a counter reset.
 */
function getSeqRingFrom(state, afterSeq) {
  if (afterSeq > state.seqCounter) return null; // counter reset (restart) / client ahead
  const ring = state.seqRing;
  if (ring.length === 0) return afterSeq <= 0 ? [] : null;
  if (afterSeq < ring[0].seq - 1) return null;
  return ring.filter((e) => e.seq > afterSeq);
}

// ── Harness ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
    failed++;
  }
}

console.log('\nseq-ring:');

test('seq starts at 1 for an empty ring', () => {
  const s = { seqCounter: 0, seqRing: [] };
  assert.strictEqual(appendSeqRing(s, 'hello'), 1);
  assert.strictEqual(s.seqRing.length, 1);
  assert.deepStrictEqual(s.seqRing[0], { data: 'hello', seq: 1 });
});

test('seq increments monotonically and tracks the counter', () => {
  const s = { seqCounter: 0, seqRing: [] };
  appendSeqRing(s, 'a');
  appendSeqRing(s, 'b');
  appendSeqRing(s, 'c');
  assert.strictEqual(s.seqRing.map((e) => e.seq).join(','), '1,2,3');
  assert.strictEqual(s.seqCounter, 3);
});

test('ring trims the oldest entry when the cap is exceeded', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < SEQ_RING_MAX_ENTRIES + 1; i++) appendSeqRing(s, `c${i}`);
  assert.strictEqual(s.seqRing.length, SEQ_RING_MAX_ENTRIES);
  assert.strictEqual(s.seqRing[0].seq, 2); // seq 1 evicted
  assert.strictEqual(s.seqRing[s.seqRing.length - 1].seq, SEQ_RING_MAX_ENTRIES + 1);
});

test('getSeqRingFrom returns entries after afterSeq in order', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < 5; i++) appendSeqRing(s, `d${i}`);
  assert.deepStrictEqual(
    getSeqRingFrom(s, 3).map((e) => e.seq),
    [4, 5]
  );
});

test('getSeqRingFrom returns [] when afterSeq equals the highest seq', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < 3; i++) appendSeqRing(s, `x${i}`);
  assert.deepStrictEqual(getSeqRingFrom(s, 3), []);
});

test('getSeqRingFrom returns [] for an empty ring at afterSeq 0', () => {
  assert.deepStrictEqual(getSeqRingFrom({ seqCounter: 0, seqRing: [] }, 0), []);
});

test('getSeqRingFrom returns null when the gap predates the ring', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < SEQ_RING_MAX_ENTRIES + 10; i++) appendSeqRing(s, 'y');
  // ring[0].seq === 11; afterSeq 0 is before it ⇒ unresolvable gap
  assert.strictEqual(getSeqRingFrom(s, 0), null);
});

test('getSeqRingFrom returns all entries when afterSeq=0 and the ring fits', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < 5; i++) appendSeqRing(s, `z${i}`);
  const tail = getSeqRingFrom(s, 0);
  assert.strictEqual(tail.length, 5);
  assert.strictEqual(tail[0].seq, 1);
});

// ── Phase 2 reconnect-resume decision edge cases ─────────────────────────────

test('getSeqRingFrom returns null when afterSeq exceeds seqCounter (restart reset)', () => {
  // A client reconnects with lastSeq=500 from a previous terminal lifetime, but
  // the server restarted and the counter is back near zero ⇒ cannot resume.
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < 3; i++) appendSeqRing(s, `r${i}`); // seqCounter = 3
  assert.strictEqual(getSeqRingFrom(s, 500), null);
});

test('getSeqRingFrom returns null for a positive afterSeq against a fresh terminal', () => {
  // seqCounter 0 with no output, but the client claims seq 5 ⇒ it cannot belong
  // to this lifetime ⇒ snapshot (this is the only reachable empty-ring state).
  assert.strictEqual(getSeqRingFrom({ seqCounter: 0, seqRing: [] }, 5), null);
});

test('getSeqRingFrom is caught up at the boundary of a trimmed ring', () => {
  const s = { seqCounter: 0, seqRing: [] };
  // seqCounter 2010, oldest retained seq 11 (1..10 evicted).
  for (let i = 0; i < SEQ_RING_MAX_ENTRIES + 10; i++) appendSeqRing(s, 'b');
  assert.deepStrictEqual(getSeqRingFrom(s, s.seqCounter), []); // exactly caught up ⇒ replay nothing
});

test('getSeqRingFrom resumes from the oldest bridgeable seq but not older', () => {
  const s = { seqCounter: 0, seqRing: [] };
  for (let i = 0; i < SEQ_RING_MAX_ENTRIES + 10; i++) appendSeqRing(s, 'b');
  const oldest = s.seqRing[0].seq; // 11
  // afterSeq just before the oldest entry is bridgeable (next frame is in ring)…
  assert.strictEqual(getSeqRingFrom(s, oldest - 1).length, s.seqRing.length);
  // …one earlier is an unresolvable gap ⇒ snapshot.
  assert.strictEqual(getSeqRingFrom(s, oldest - 2), null);
});

test('data is preserved exactly, including VT escape sequences', () => {
  const s = { seqCounter: 0, seqRing: [] };
  const vt = '\x1b[?1049h\x1b[H\x1b[2J';
  appendSeqRing(s, vt);
  assert.strictEqual(s.seqRing[0].data, vt);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
