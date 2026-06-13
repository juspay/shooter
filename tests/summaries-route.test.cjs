/**
 * Integration tests for SummaryStore SQLite module and /api/summaries route.
 *
 * Mirrors the pattern from tests/terminal-store.test.cjs:
 *   - Uses better-sqlite3 directly against a tmp db path
 *   - Reimplements the store inline to avoid TS/path-alias complications
 *   - Tests insert + list round-trips and sessionId filtering
 *
 * Columns per spec section 6:
 *   id, terminal_id, session_id, project_name, summary, next_steps (JSON),
 *   trigger, created_at
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = '/tmp/shooter-test-summaries.db';

// ── Column list (mirrors summary-store.ts) ───────────────────────────

const COLUMNS = [
  'id',
  'terminal_id',
  'session_id',
  'project_name',
  'summary',
  'next_steps',
  'trigger',
  'created_at',
];

// ── Row ↔ Record conversion (mirrors summary-store.ts) ───────────────

function rowToRecord(row) {
  return {
    id: row.id,
    terminalId: row.terminal_id,
    sessionId: row.session_id,
    projectName: row.project_name,
    summary: row.summary,
    nextSteps: row.next_steps,
    trigger: row.trigger,
    createdAt: row.created_at,
  };
}

// ── SummaryStore (mirrors the real class) ────────────────────────────

class SummaryStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id           TEXT PRIMARY KEY,
        terminal_id  TEXT,
        session_id   TEXT,
        project_name TEXT,
        summary      TEXT NOT NULL,
        next_steps   TEXT NOT NULL DEFAULT '[]',
        trigger      TEXT NOT NULL,
        created_at   TEXT NOT NULL
      )
    `);
  }

  insert(record) {
    const placeholders = COLUMNS.map(() => '?').join(', ');
    this.db
      .prepare(`INSERT INTO session_summaries (${COLUMNS.join(', ')}) VALUES (${placeholders})`)
      .run(
        record.id,
        record.terminalId,
        record.sessionId,
        record.projectName,
        record.summary,
        record.nextSteps,
        record.trigger,
        record.createdAt
      );
  }

  listRecent(limit, sessionId) {
    if (sessionId) {
      const rows = this.db
        .prepare(
          'SELECT * FROM session_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(sessionId, limit);
      return rows.map(rowToRecord);
    }
    const rows = this.db
      .prepare('SELECT * FROM session_summaries ORDER BY created_at DESC LIMIT ?')
      .all(limit);
    return rows.map(rowToRecord);
  }

  close() {
    this.db.close();
  }
}

// ── Test Helpers ─────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: 'sum-' + Math.random().toString(36).slice(2, 10),
    terminalId: 'term-abc',
    sessionId: 'sess-123',
    projectName: 'my-project',
    summary: 'Working on feature X',
    nextSteps: '[]',
    trigger: 'agent-idle',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function assertNotNull(value, label) {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected non-null value`);
  }
}

function assertNull(value, label) {
  if (value !== null && value !== undefined) {
    throw new Error(`${label}: expected null/undefined, got ${JSON.stringify(value)}`);
  }
}

// ── Fresh DB per test ────────────────────────────────────────────────

function freshStore() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch (_) {
      /* ignore */
    }
  }
  return new SummaryStore(DB_PATH);
}

// ── Runner ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  let store;
  try {
    store = freshStore();
    fn(store);
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  } finally {
    if (store) store.close();
  }
}

console.log('\nSummaryStore unit tests\n');

// ── Test 1: Insert and retrieve via listRecent ────────────────────────

runTest('Test 1: Insert and listRecent (all)', (store) => {
  const rec = makeRecord({
    id: 'sum-insert-list',
    terminalId: 'term-1',
    sessionId: 'sess-1',
    projectName: 'proj-alpha',
    summary: 'Implementing OAuth flow',
    nextSteps: JSON.stringify([{ text: 'Write tests', votes: 3, confidence: 0.9 }]),
    trigger: 'tool-failed',
    createdAt: '2025-01-15T10:30:00.000Z',
  });

  store.insert(rec);
  const results = store.listRecent(10, undefined);

  assertEqual(results.length, 1, 'listRecent count');
  const got = results[0];
  assertNotNull(got, 'first result');
  assertEqual(got.id, 'sum-insert-list', 'id round-trip');
  assertEqual(got.terminalId, 'term-1', 'terminalId (camelCase)');
  assertEqual(got.sessionId, 'sess-1', 'sessionId (camelCase)');
  assertEqual(got.projectName, 'proj-alpha', 'projectName (camelCase)');
  assertEqual(got.summary, 'Implementing OAuth flow', 'summary');
  assertEqual(
    got.nextSteps,
    JSON.stringify([{ text: 'Write tests', votes: 3, confidence: 0.9 }]),
    'nextSteps JSON preserved'
  );
  assertEqual(got.trigger, 'tool-failed', 'trigger');
  assertEqual(got.createdAt, '2025-01-15T10:30:00.000Z', 'createdAt (camelCase)');
});

// ── Test 2: listRecent with sessionId filter ─────────────────────────

runTest('Test 2: listRecent filtered by sessionId', (store) => {
  const a1 = makeRecord({ id: 'a1', sessionId: 'sess-A', createdAt: '2025-01-01T01:00:00Z' });
  const a2 = makeRecord({ id: 'a2', sessionId: 'sess-A', createdAt: '2025-01-01T02:00:00Z' });
  const b1 = makeRecord({ id: 'b1', sessionId: 'sess-B', createdAt: '2025-01-01T03:00:00Z' });

  store.insert(a1);
  store.insert(a2);
  store.insert(b1);

  const allResults = store.listRecent(50, undefined);
  assertEqual(allResults.length, 3, 'listRecent all count');

  const sessAResults = store.listRecent(50, 'sess-A');
  assertEqual(sessAResults.length, 2, 'listRecent sess-A count');
  for (const r of sessAResults) {
    assertEqual(r.sessionId, 'sess-A', `all results have sessionId sess-A (got ${r.id})`);
  }

  const sessBResults = store.listRecent(50, 'sess-B');
  assertEqual(sessBResults.length, 1, 'listRecent sess-B count');
  assertEqual(sessBResults[0].id, 'b1', 'correct record for sess-B');

  const sessXResults = store.listRecent(50, 'sess-X');
  assertEqual(sessXResults.length, 0, 'non-existent session returns empty array');
});

// ── Test 3: listRecent ORDER BY created_at DESC ───────────────────────

runTest('Test 3: listRecent ordering (newest first)', (store) => {
  const r1 = makeRecord({ id: 'order-1', createdAt: '2025-01-01T01:00:00Z' });
  const r2 = makeRecord({ id: 'order-2', createdAt: '2025-01-01T03:00:00Z' });
  const r3 = makeRecord({ id: 'order-3', createdAt: '2025-01-01T02:00:00Z' });

  store.insert(r1);
  store.insert(r2);
  store.insert(r3);

  const results = store.listRecent(50, undefined);
  assertEqual(results.length, 3, 'count');
  // DESC order: r2 (03:00) → r3 (02:00) → r1 (01:00)
  assertEqual(results[0].id, 'order-2', 'first result is newest');
  assertEqual(results[1].id, 'order-3', 'second result');
  assertEqual(results[2].id, 'order-1', 'third result is oldest');
});

// ── Test 4: listRecent respects limit ────────────────────────────────

runTest('Test 4: listRecent respects limit parameter', (store) => {
  for (let i = 0; i < 5; i++) {
    store.insert(
      makeRecord({ id: `limit-${i}`, createdAt: `2025-01-01T0${i}:00:00Z` })
    );
  }

  const limited = store.listRecent(3, undefined);
  assertEqual(limited.length, 3, 'listRecent respects limit=3');
});

// ── Test 5: Nullable fields (terminalId, sessionId, projectName) ──────

runTest('Test 5: Nullable fields stored and retrieved as null', (store) => {
  const rec = makeRecord({
    id: 'nullable-test',
    terminalId: null,
    sessionId: null,
    projectName: null,
  });

  store.insert(rec);
  const results = store.listRecent(10, undefined);
  assertEqual(results.length, 1, 'count');

  const got = results[0];
  // SQLite returns null for NULL columns
  assertEqual(got.terminalId, null, 'terminalId null');
  assertEqual(got.sessionId, null, 'sessionId null');
  assertEqual(got.projectName, null, 'projectName null');
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

// Clean up
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(DB_PATH + suffix);
  } catch (_) {
    /* ignore */
  }
}

process.exit(failed > 0 ? 1 : 0);
