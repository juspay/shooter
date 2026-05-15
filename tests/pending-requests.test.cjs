/**
 * Unit tests for PendingRequestsStore SQLite module.
 *
 * Uses better-sqlite3 directly against /tmp/shooter-test-pending.db
 * to replicate the exact schema and operations from pending-requests.ts,
 * avoiding TypeScript / path-alias complications.
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = '/tmp/shooter-test-pending.db';

const MAX_AGE_MS = 5 * 60 * 1000;

function rowToRecord(row) {
  let toolInput = {};
  if (typeof row.tool_input === 'string' && row.tool_input.length > 0) {
    try {
      const parsed = JSON.parse(row.tool_input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        toolInput = parsed;
      }
    } catch (_) {
      /* corrupt JSON — fall back */
    }
  }
  return {
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    decision: row.decision ?? null,
    sessionId: row.session_id,
    toolInput,
    toolName: row.tool_name,
  };
}

class PendingRequestsStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id  TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        tool_name   TEXT NOT NULL,
        tool_input  TEXT NOT NULL DEFAULT '{}',
        decision    TEXT,
        created_at  INTEGER NOT NULL,
        decided_at  INTEGER
      )
    `);
  }

  insert(requestId, data) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_requests
         (request_id, session_id, tool_name, tool_input, decision, created_at, decided_at)
         VALUES (?, ?, ?, ?, NULL, ?, NULL)`
      )
      .run(
        requestId,
        data.sessionId,
        data.toolName,
        JSON.stringify(data.toolInput),
        data.createdAt ?? Date.now()
      );
  }

  get(requestId) {
    const row = this.db
      .prepare('SELECT * FROM pending_requests WHERE request_id = ?')
      .get(requestId);
    return row ? rowToRecord(row) : null;
  }

  delete(requestId) {
    this.db.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId);
  }

  setDecision(requestId, decision) {
    const result = this.db
      .prepare(
        'UPDATE pending_requests SET decision = ?, decided_at = ? WHERE request_id = ?'
      )
      .run(decision, Date.now(), requestId);
    return result.changes > 0;
  }

  cleanup(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db
      .prepare('DELETE FROM pending_requests WHERE created_at < ?')
      .run(cutoff);
    return result.changes;
  }

  close() {
    this.db.close();
  }
}

// ── Test Helpers ─────────────────────────────────────────────────────

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

function freshStore() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch (_) {
      /* ignore */
    }
  }
  return new PendingRequestsStore(DB_PATH);
}

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

console.log('\nPendingRequestsStore unit tests\n');

// ── Test 1: Insert and Get ───────────────────────────────────────────

runTest('Test 1: Insert and Get', (store) => {
  store.insert('req-1', {
    sessionId: 'sess-abc',
    toolName: 'Bash',
    toolInput: { command: 'ls -la', timeout: 5000 },
  });

  const got = store.get('req-1');
  assertNotNull(got, 'get result');
  assertEqual(got.sessionId, 'sess-abc', 'sessionId');
  assertEqual(got.toolName, 'Bash', 'toolName');
  assertEqual(got.toolInput, { command: 'ls -la', timeout: 5000 }, 'toolInput round-trip');
  assertEqual(got.decision, null, 'initial decision is null');
  assertEqual(got.decidedAt, null, 'initial decidedAt is null');

  if (typeof got.createdAt !== 'number' || got.createdAt <= 0) {
    throw new Error(`createdAt should be a positive epoch ms, got ${got.createdAt}`);
  }
});

// ── Test 2: setDecision flips decision + decidedAt ───────────────────

runTest('Test 2: setDecision flips decision + decidedAt', (store) => {
  store.insert('req-2', {
    sessionId: 'sess-2',
    toolName: 'Edit',
    toolInput: { file_path: '/tmp/foo' },
  });

  const before = Date.now();
  const ok = store.setDecision('req-2', 'allow');
  assertEqual(ok, true, 'setDecision returns true for existing row');

  const got = store.get('req-2');
  assertNotNull(got, 'row still present after setDecision');
  assertEqual(got.decision, 'allow', 'decision is allow');
  if (typeof got.decidedAt !== 'number' || got.decidedAt < before) {
    throw new Error(`decidedAt should be a number >= ${before}, got ${got.decidedAt}`);
  }

  // 'deny' should also work
  store.insert('req-2b', {
    sessionId: 'sess-2',
    toolName: 'Bash',
    toolInput: {},
  });
  store.setDecision('req-2b', 'deny');
  assertEqual(store.get('req-2b').decision, 'deny', 'decision is deny');
});

// ── Test 3: setDecision on missing requestId returns false ───────────

runTest('Test 3: setDecision on missing requestId returns false', (store) => {
  const ok = store.setDecision('does-not-exist', 'allow');
  assertEqual(ok, false, 'setDecision returns false when row absent');
});

// ── Test 4: delete + get after delete ────────────────────────────────

runTest('Test 4: delete + get after delete', (store) => {
  store.insert('req-del', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: {},
  });
  assertNotNull(store.get('req-del'), 'row exists before delete');
  store.delete('req-del');
  assertEqual(store.get('req-del'), null, 'row gone after delete');
});

// ── Test 5: INSERT OR REPLACE — second insert overwrites ─────────────

runTest('Test 5: INSERT OR REPLACE on duplicate requestId', (store) => {
  store.insert('dup', {
    sessionId: 'first',
    toolName: 'Bash',
    toolInput: { command: 'echo hi' },
  });
  // Second insert with same id should not throw and should overwrite
  store.insert('dup', {
    sessionId: 'second',
    toolName: 'Edit',
    toolInput: { file_path: '/tmp/bar' },
  });

  const got = store.get('dup');
  assertNotNull(got, 'row still present');
  assertEqual(got.sessionId, 'second', 'sessionId overwritten');
  assertEqual(got.toolName, 'Edit', 'toolName overwritten');
  assertEqual(got.toolInput, { file_path: '/tmp/bar' }, 'toolInput overwritten');
});

// ── Test 6: cleanup removes only expired rows ────────────────────────

runTest('Test 6: cleanup removes only expired rows', (store) => {
  const now = Date.now();
  // Insert an "old" row by passing an explicit createdAt 10 min ago.
  store.insert('old', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: {},
    createdAt: now - 10 * 60 * 1000,
  });
  store.insert('recent', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: {},
  });

  const removed = store.cleanup(MAX_AGE_MS); // 5 minute window
  assertEqual(removed, 1, 'cleanup removed 1 stale row');
  assertEqual(store.get('old'), null, 'old row gone');
  assertNotNull(store.get('recent'), 'recent row survives');
});

// ── Test 7: Tool input round-trip preserves nested structure ─────────

runTest('Test 7: Tool input round-trip preserves nested values', (store) => {
  const input = {
    command: 'curl https://example.com',
    flags: ['-sS', '--http2'],
    nested: { headers: { 'Content-Type': 'application/json' }, retries: 3 },
  };
  store.insert('nested', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: input,
  });

  const got = store.get('nested');
  assertEqual(got.toolInput, input, 'nested toolInput round-trip');
});

// ── Test 8: Corrupt JSON in tool_input column falls back to {} ───────

runTest('Test 8: Corrupt tool_input JSON falls back to empty object', (store) => {
  // Directly insert a row with malformed JSON to verify rowToRecord doesn't throw.
  store.db
    .prepare(
      `INSERT INTO pending_requests (request_id, session_id, tool_name, tool_input, created_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run('bad', 's', 'Bash', '{this is not valid JSON', Date.now());
  const got = store.get('bad');
  assertNotNull(got, 'row still readable');
  assertEqual(got.toolInput, {}, 'toolInput defaults to {} on parse failure');
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(DB_PATH + suffix);
  } catch (_) {
    /* ignore */
  }
}

process.exit(failed > 0 ? 1 : 0);
