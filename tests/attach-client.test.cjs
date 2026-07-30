/**
 * Tests for the `shooter attach` client helpers.
 *
 * Attaching pipes a local terminal into a Shooter-owned PTY over
 * /ws/terminal/<id>. The risky parts are pure: building the upgrade URL,
 * decoding server frames into terminal actions, and spotting the detach key in
 * a raw stdin chunk (it must never be forwarded to the PTY, and everything
 * typed before it must still be).
 */

'use strict';
const path = require('path');
const {
  DETACH_BYTE,
  buildAttachUrl,
  decodeServerFrame,
  splitOnDetach,
} = require(path.join(__dirname, '..', 'scripts', 'attach-client.cjs'));

let passed = 0,
  failed = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
function assert(c, l) {
  if (!c) throw new Error(l || 'assertion failed');
}

console.log('\nattach client unit tests\n');

// --- buildAttachUrl --------------------------------------------------------

runTest('builds a ws:// URL from an http base', () => {
  assert(
    buildAttachUrl('http://localhost:54006', 'abc123', 'tkt') ===
      'ws://localhost:54006/ws/terminal/abc123?ticket=tkt',
    buildAttachUrl('http://localhost:54006', 'abc123', 'tkt')
  );
});

runTest('uses wss:// for an https base', () => {
  assert(
    buildAttachUrl('https://shooter.example.dev', 'abc123', 'tkt') ===
      'wss://shooter.example.dev/ws/terminal/abc123?ticket=tkt',
    buildAttachUrl('https://shooter.example.dev', 'abc123', 'tkt')
  );
});

runTest('tolerates a trailing slash on the base URL', () => {
  assert(
    buildAttachUrl('http://localhost:54006/', 'abc123', 'tkt') ===
      'ws://localhost:54006/ws/terminal/abc123?ticket=tkt',
    buildAttachUrl('http://localhost:54006/', 'abc123', 'tkt')
  );
});

runTest('percent-encodes the ticket and terminal id', () => {
  const url = buildAttachUrl('http://localhost:54006', 'a/b', 'tk t&x=1');
  assert(!url.includes('tk t'), `ticket not encoded: ${url}`);
  assert(!url.includes('a/b'), `id not encoded: ${url}`);
  assert(url.includes('ticket=tk%20t%26x%3D1'), `unexpected encoding: ${url}`);
});

// --- decodeServerFrame -----------------------------------------------------

runTest('decodes output frames', () => {
  const f = decodeServerFrame(JSON.stringify({ data: 'hello', seq: 1, type: 'output' }));
  assert(f.kind === 'output', `expected output, got ${f.kind}`);
  assert(f.data === 'hello', `expected data, got ${f.data}`);
});

runTest('renders scrollback as output so history appears on attach', () => {
  const f = decodeServerFrame(
    JSON.stringify({ chunk: 1, data: 'past output', total: 1, type: 'scrollback' })
  );
  assert(f.kind === 'output', `expected output, got ${f.kind}`);
  assert(f.data === 'past output', `expected scrollback data, got ${f.data}`);
});

runTest('decodes exit frames with the exit code', () => {
  const f = decodeServerFrame(JSON.stringify({ code: 3, signal: null, type: 'exit' }));
  assert(f.kind === 'exit', `expected exit, got ${f.kind}`);
  assert(f.code === 3, `expected code 3, got ${f.code}`);
});

runTest('decodes error frames', () => {
  const f = decodeServerFrame(JSON.stringify({ message: 'Terminal not found', type: 'error' }));
  assert(f.kind === 'error', `expected error, got ${f.kind}`);
  assert(f.message === 'Terminal not found', `expected message, got ${f.message}`);
});

runTest('reports dropped output as a notice rather than silence', () => {
  const f = decodeServerFrame(JSON.stringify({ bytes: 4096, type: 'output-dropped' }));
  assert(f.kind === 'notice', `expected notice, got ${f.kind}`);
  assert(String(f.message).includes('4096'), `notice should mention byte count: ${f.message}`);
});

runTest("ignores the server's resize echo — the local tty is the authority", () => {
  const f = decodeServerFrame(JSON.stringify({ cols: 80, rows: 24, type: 'resize' }));
  assert(f.kind === 'ignore', `expected ignore, got ${f.kind}`);
});

runTest('ignores malformed or unknown frames instead of throwing', () => {
  assert(decodeServerFrame('not json at all').kind === 'ignore', 'malformed JSON ignored');
  assert(decodeServerFrame(JSON.stringify({ type: 'whatever' })).kind === 'ignore', 'unknown type');
  assert(decodeServerFrame(JSON.stringify(null)).kind === 'ignore', 'null payload');
  assert(decodeServerFrame('').kind === 'ignore', 'empty payload');
});

// --- splitOnDetach ---------------------------------------------------------

runTest('passes a chunk through untouched when the detach key is absent', () => {
  const chunk = Buffer.from('ls -la\r');
  const r = splitOnDetach(chunk);
  assert(r.detached === false, 'should not detach');
  assert(r.before.toString() === 'ls -la\r', `expected passthrough, got ${r.before.toString()}`);
});

runTest('REGRESSION: keeps input typed before the detach key and drops the key itself', () => {
  const chunk = Buffer.concat([Buffer.from('echo hi'), Buffer.from([DETACH_BYTE]), Buffer.from('junk')]);
  const r = splitOnDetach(chunk);
  assert(r.detached === true, 'should detach');
  assert(
    r.before.toString() === 'echo hi',
    `input before detach must survive, got '${r.before.toString()}'`
  );
  assert(!r.before.includes(DETACH_BYTE), 'detach byte must never reach the PTY');
});

runTest('detaches on a bare detach key with nothing to forward', () => {
  const r = splitOnDetach(Buffer.from([DETACH_BYTE]));
  assert(r.detached === true, 'should detach');
  assert(r.before.length === 0, `nothing should be forwarded, got ${r.before.length} bytes`);
});

runTest('does not treat Ctrl-C as detach — it must reach the PTY', () => {
  const r = splitOnDetach(Buffer.from([0x03]));
  assert(r.detached === false, 'Ctrl-C is not detach');
  assert(r.before.length === 1 && r.before[0] === 0x03, 'Ctrl-C forwarded verbatim');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
