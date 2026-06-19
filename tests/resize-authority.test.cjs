/**
 * Phase 3 unit tests — resize-authority predicate + terminal-store dims persistence.
 *
 * Mirrors the pure logic of:
 *   - isResizeAuthority(connectionId, authorityConnectionId) in terminal-handler.ts
 *   - terminalStore.resizeDims(id, cols, rows) in terminal-store.ts
 * tested against a real in-memory SQLite db (better-sqlite3).
 */
'use strict';

const assert = require('node:assert');
const Database = require('better-sqlite3');

// ── Pure logic under test (mirrors terminal-handler.ts / terminal-store.ts) ──

/** First-claimer, sticky-until-disconnect. null = unclaimed ⇒ caller may claim. */
function isResizeAuthority(connectionId, authorityConnectionId) {
  if (authorityConnectionId === null) return true;
  return connectionId === authorityConnectionId;
}

function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      cols INTEGER NOT NULL DEFAULT 80,
      rows INTEGER NOT NULL DEFAULT 24,
      created_at TEXT NOT NULL
    )
  `);
  db.prepare("INSERT INTO terminals (id, created_at) VALUES ('term-1', datetime('now'))").run();
  return db;
}

/** Must match terminal-store.ts:resizeDims() exactly. */
function resizeDims(db, id, cols, rows) {
  db.prepare('UPDATE terminals SET cols = ?, rows = ? WHERE id = ?').run(cols, rows, id);
}

function getRecord(db, id) {
  return db.prepare('SELECT * FROM terminals WHERE id = ?').get(id);
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

console.log('\nresize-authority:');

// ── authority predicate ──

test('unclaimed (null) authority: any connection may resize', () => {
  assert.strictEqual(isResizeAuthority('conn-A', null), true);
  assert.strictEqual(isResizeAuthority('conn-B', null), true);
  assert.strictEqual(isResizeAuthority('', null), true); // empty id still wins when unclaimed
});

test('claimed authority: only the holder may resize (no fight)', () => {
  assert.strictEqual(isResizeAuthority('conn-A', 'conn-A'), true);
  assert.strictEqual(isResizeAuthority('conn-B', 'conn-A'), false);
});

test('authority handoff: after the slot clears, the next connection claims it', () => {
  // conn-A holds it.
  let authority = 'conn-A';
  assert.strictEqual(isResizeAuthority('conn-B', authority), false);
  // conn-A disconnects → slot cleared (handler sets authorityConnectionId = null).
  authority = null;
  assert.strictEqual(isResizeAuthority('conn-B', authority), true);
});

// ── resizeDims persistence ──

test('resizeDims persists cols and rows', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 220, 55);
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 220);
  assert.strictEqual(row.rows, 55);
  db.close();
});

test('resizeDims is last-write-wins across repeated calls', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 80, 24);
  resizeDims(db, 'term-1', 200, 50);
  resizeDims(db, 'term-1', 132, 43);
  const row = getRecord(db, 'term-1');
  assert.strictEqual(row.cols, 132);
  assert.strictEqual(row.rows, 43);
  db.close();
});

test('resizeDims does not touch other terminals', () => {
  const db = makeTestDb();
  db.prepare("INSERT INTO terminals (id, created_at) VALUES ('term-2', datetime('now'))").run();
  resizeDims(db, 'term-1', 200, 50);
  const row2 = getRecord(db, 'term-2');
  assert.strictEqual(row2.cols, 80); // default unchanged
  assert.strictEqual(row2.rows, 24);
  db.close();
});

test('reconnect restores the latest dims, not the creation-time default (G5)', () => {
  const db = makeTestDb();
  resizeDims(db, 'term-1', 210, 52);
  const row = getRecord(db, 'term-1'); // simulate restart re-read
  assert.strictEqual(row.cols, 210, 'reconnect must see persisted cols');
  assert.strictEqual(row.rows, 52, 'reconnect must see persisted rows');
  db.close();
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
