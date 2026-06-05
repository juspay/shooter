/**
 * Tests for ptySubmitSequence — the PTY byte sequence that delivers and submits
 * a message to an interactive agent TUI.
 *
 * The bug this guards against: a bare LF (`\n`) never submits to an agent TUI
 * (raw mode), and `"<text>\r"` in one write is absorbed as a bracketed paste so
 * the CR doesn't submit either. The fix wraps the body in an explicit bracketed
 * paste (ESC[200~ … ESC[201~) followed by a CR, which submits reliably and was
 * verified live against codex 0.136 and claude 2.1.
 */

'use strict';

const assert = require('node:assert');

require('tsx/cjs');
const { ptySubmitSequence } = require('../src/lib/modules/server/terminal/pty-input.ts');

const START = '\x1b[200~';
const END = '\x1b[201~';
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

console.log('ptySubmitSequence:');

test('wraps the body in a bracketed paste and ends with a single CR', () => {
  assert.strictEqual(ptySubmitSequence('hello'), `${START}hello${END}\r`);
});

test('never emits a bare LF as the submit byte', () => {
  const seq = ptySubmitSequence('do the thing');
  assert.ok(!seq.endsWith('\n'), 'must not submit with LF');
  assert.ok(seq.endsWith('\r'), 'must submit with CR');
});

test('strips a trailing newline the caller appended (LF)', () => {
  assert.strictEqual(ptySubmitSequence('review this\n'), `${START}review this${END}\r`);
});

test('strips trailing CR / CRLF / multiple newlines', () => {
  assert.strictEqual(ptySubmitSequence('a\r'), `${START}a${END}\r`);
  assert.strictEqual(ptySubmitSequence('b\r\n'), `${START}b${END}\r`);
  assert.strictEqual(ptySubmitSequence('c\n\n\n'), `${START}c${END}\r`);
});

test('preserves embedded newlines inside the paste (multi-line fidelity)', () => {
  const body = 'line one\nline two\nline three';
  assert.strictEqual(ptySubmitSequence(`${body}\n`), `${START}${body}${END}\r`);
});

test('produces exactly one CR (no premature submit inside the body)', () => {
  const seq = ptySubmitSequence('para one\npara two');
  assert.strictEqual((seq.match(/\r/g) || []).length, 1);
});

test('handles an empty string', () => {
  assert.strictEqual(ptySubmitSequence(''), `${START}${END}\r`);
});

console.log(`\n${passed} passed`);
