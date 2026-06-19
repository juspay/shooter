/**
 * Phase 1 keystone test — proves @xterm/headless + @xterm/addon-serialize can
 * snapshot the CURRENT screen (including an alternate-buffer TUI) and round-trip
 * it into a fresh terminal. Replicates the TerminalEmulator wrapper logic in
 * plain CJS (the repo's test convention) so a dependency upgrade that breaks the
 * snapshot mechanism fails CI loudly.
 *
 * Mirrors src/lib/modules/server/terminal/terminal-emulator.ts.
 */

'use strict';

const assert = require('node:assert');
const { Terminal } = require('@xterm/headless');
const { SerializeAddon } = require('@xterm/addon-serialize');

const SCROLLBACK = 1000;

function makeTerm() {
  const term = new Terminal({ allowProposedApi: true, cols: 120, rows: 30, scrollback: SCROLLBACK });
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);
  return { serializer, term };
}

/** Serialize inside a write() callback so all queued bytes are parsed first. */
function snapshot(term, serializer, cursorHidden) {
  return new Promise((resolve) => {
    term.write('', () => {
      let data = serializer.serialize({ scrollback: SCROLLBACK });
      if (cursorHidden) data += '\x1b[?25l';
      resolve(data);
    });
  });
}

function writeAsync(term, data) {
  return new Promise((resolve) => term.write(data, resolve));
}

function visibleLines(term) {
  const buf = term.buffer.active;
  const out = [];
  for (let i = 0; i < term.rows; i++) {
    out.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  return out;
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  // Return the promise so `await test(...)` actually sequences the async tests;
  // without this the awaits were no-ops and a late failure could exit(0) first.
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ok ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`  FAIL ${name}`);
      console.log(`       ${err.message}`);
      failed++;
    });
}

async function run() {
  console.log('\nterminal-emulator (xterm headless + serialize):');

  await test('snapshot captures an alternate-screen TUI and round-trips', async () => {
    const a = makeTerm();
    await writeAsync(a.term, 'scrollback line one\r\nscrollback line two\r\n');
    // Enter alt screen, draw a "TUI": colors, cursor moves, a status line.
    await writeAsync(
      a.term,
      '\x1b[?1049h\x1b[H\x1b[2J' +
        '\x1b[38;2;0;255;0mGREEN HEADER\x1b[0m\r\n' +
        '\x1b[5;10H\x1b[7mreverse cell\x1b[0m' +
        '\x1b[30;1H\x1b[38;5;201mstatus: running\x1b[0m'
    );
    const snap = await snapshot(a.term, a.serializer, false);
    assert.ok(snap.includes('\x1b[?1049h'), 'snapshot must re-enter the alt screen');

    // Round-trip into a fresh terminal; compare rendered content (not bytes).
    const b = makeTerm();
    await writeAsync(b.term, snap);
    const before = visibleLines(a.term);
    const after = visibleLines(b.term);
    assert.deepStrictEqual(after, before, 'restored screen content must match');
    assert.ok(before.some((l) => l.includes('GREEN HEADER')), 'TUI header present');
    assert.ok(before.some((l) => l.includes('status: running')), 'status line present');
    a.term.dispose();
    b.term.dispose();
  });

  await test('hide-cursor (?25l) is re-emitted by the wrapper workaround', async () => {
    const a = makeTerm();
    await writeAsync(a.term, 'before\x1b[?25l'); // hide cursor
    const snap = await snapshot(a.term, a.serializer, true);
    assert.ok(snap.includes('\x1b[?25l'), 'hidden cursor must be re-emitted in the snapshot');
    a.term.dispose();
  });

  await test('scrollback option bounds the snapshot without throwing', async () => {
    const a = makeTerm();
    for (let i = 0; i < 50; i++) await writeAsync(a.term, `line ${i}\r\n`);
    const snap = await snapshot(a.term, a.serializer, false);
    assert.ok(typeof snap === 'string' && snap.length > 0, 'snapshot produced');
    a.term.dispose();
  });

  // All tests above are awaited in order, so the counts are final here.
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

void run();
