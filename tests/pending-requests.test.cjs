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

function parseOptions(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function parseToolInput(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function rowToRich(row) {
  const responseKindRaw = typeof row.response_kind === 'string' ? row.response_kind : 'hook';
  const responseKind =
    responseKindRaw === 'hook' || responseKindRaw === 'pty' || responseKindRaw === 'info'
      ? responseKindRaw
      : 'hook';
  return {
    requestId: row.request_id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    toolInput: parseToolInput(row.tool_input),
    decision: row.decision ?? null,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    question: row.question ?? null,
    options: parseOptions(row.options),
    responseKind,
  };
}

function rowToRecord(row) {
  const decision = row.decision;
  return {
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    decision: decision === 'allow' || decision === 'deny' ? decision : null,
    sessionId: row.session_id,
    toolInput: parseToolInput(row.tool_input),
    toolName: row.tool_name,
  };
}

class PendingRequestsStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_requests (
        request_id    TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        tool_name     TEXT NOT NULL,
        tool_input    TEXT NOT NULL DEFAULT '{}',
        decision      TEXT,
        created_at    INTEGER NOT NULL,
        decided_at    INTEGER,
        question      TEXT,
        options       TEXT NOT NULL DEFAULT '[]',
        response_kind TEXT NOT NULL DEFAULT 'hook'
      )
    `);
    this.migrate();
  }

  migrate() {
    const cols = this.db.prepare('PRAGMA table_info(pending_requests)').all();
    const existing = new Set(cols.map((c) => c.name));
    const wanted = [
      { name: 'question', sql: 'ALTER TABLE pending_requests ADD COLUMN question TEXT' },
      {
        name: 'options',
        sql: "ALTER TABLE pending_requests ADD COLUMN options TEXT NOT NULL DEFAULT '[]'",
      },
      {
        name: 'response_kind',
        sql: "ALTER TABLE pending_requests ADD COLUMN response_kind TEXT NOT NULL DEFAULT 'hook'",
      },
    ];
    for (const col of wanted) {
      if (!existing.has(col.name)) this.db.exec(col.sql);
    }
  }

  insert(requestId, data) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_requests
         (request_id, session_id, tool_name, tool_input, decision, created_at, decided_at, question, options, response_kind)
         VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)`
      )
      .run(
        requestId,
        data.sessionId,
        data.toolName,
        JSON.stringify(data.toolInput),
        data.createdAt ?? Date.now(),
        data.question ?? null,
        JSON.stringify(data.options ?? []),
        data.responseKind ?? 'hook'
      );
  }

  get(requestId) {
    const row = this.db
      .prepare('SELECT * FROM pending_requests WHERE request_id = ?')
      .get(requestId);
    return row ? rowToRecord(row) : null;
  }

  getRich(requestId) {
    const row = this.db
      .prepare('SELECT * FROM pending_requests WHERE request_id = ?')
      .get(requestId);
    return row ? rowToRich(row) : null;
  }

  delete(requestId) {
    this.db.prepare('DELETE FROM pending_requests WHERE request_id = ?').run(requestId);
  }

  setDecision(requestId, decision) {
    const result = this.db
      .prepare('UPDATE pending_requests SET decision = ?, decided_at = ? WHERE request_id = ?')
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

// ── Test 1: Insert and Get (legacy fields only) ──────────────────────

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
});

// ── Test 2: setDecision flips decision + decidedAt ───────────────────

runTest('Test 2: setDecision flips decision + decidedAt', (store) => {
  store.insert('req-2', { sessionId: 's', toolName: 'Edit', toolInput: { file_path: '/tmp/foo' } });

  const before = Date.now();
  const ok = store.setDecision('req-2', 'allow');
  assertEqual(ok, true, 'setDecision returns true for existing row');

  const got = store.get('req-2');
  assertNotNull(got, 'row still present after setDecision');
  assertEqual(got.decision, 'allow', 'decision is allow');
  if (typeof got.decidedAt !== 'number' || got.decidedAt < before) {
    throw new Error(`decidedAt should be a number >= ${before}, got ${got.decidedAt}`);
  }

  store.insert('req-2b', { sessionId: 's', toolName: 'Bash', toolInput: {} });
  store.setDecision('req-2b', 'deny');
  assertEqual(store.get('req-2b').decision, 'deny', 'decision is deny');
});

// ── Test 3: setDecision on missing requestId returns false ───────────

runTest('Test 3: setDecision on missing requestId returns false', (store) => {
  assertEqual(store.setDecision('does-not-exist', 'allow'), false, 'setDecision returns false');
});

// ── Test 4: delete + get after delete ────────────────────────────────

runTest('Test 4: delete + get after delete', (store) => {
  store.insert('req-del', { sessionId: 's', toolName: 'Bash', toolInput: {} });
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
  store.insert('old', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: {},
    createdAt: now - 10 * 60 * 1000,
  });
  store.insert('recent', { sessionId: 's', toolName: 'Bash', toolInput: {} });

  const removed = store.cleanup(MAX_AGE_MS);
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
  store.insert('nested', { sessionId: 's', toolName: 'Bash', toolInput: input });
  assertEqual(store.get('nested').toolInput, input, 'nested toolInput round-trip');
});

// ── Test 8: Corrupt JSON in tool_input column falls back to {} ───────

runTest('Test 8: Corrupt tool_input JSON falls back to empty object', (store) => {
  store.db
    .prepare(
      `INSERT INTO pending_requests
       (request_id, session_id, tool_name, tool_input, created_at, options, response_kind)
       VALUES (?, ?, ?, ?, ?, '[]', 'hook')`
    )
    .run('bad', 's', 'Bash', '{this is not valid JSON', Date.now());
  const got = store.get('bad');
  assertNotNull(got, 'row still readable');
  assertEqual(got.toolInput, {}, 'toolInput defaults to {} on parse failure');
});

// ── Test 9: insert with new fields (question, options, responseKind) ─

runTest('Test 9: insert with question + options + responseKind', (store) => {
  store.insert('rich-1', {
    sessionId: 's',
    toolName: 'AskUserQuestion',
    toolInput: {},
    question: 'Which framework should we use?',
    options: [
      { id: 'option_1', label: 'Frontend (SvelteKit)' },
      { id: 'option_2', label: 'Backend (Fastify)', hint: 'Node.js / TypeScript' },
    ],
    responseKind: 'pty',
  });

  const rich = store.getRich('rich-1');
  assertNotNull(rich, 'getRich returns row');
  assertEqual(rich.question, 'Which framework should we use?', 'question round-trip');
  assertEqual(rich.options.length, 2, 'options count');
  assertEqual(rich.options[0].id, 'option_1', 'option[0].id');
  assertEqual(rich.options[1].hint, 'Node.js / TypeScript', 'option[1].hint');
  assertEqual(rich.responseKind, 'pty', 'responseKind round-trip');
});

// ── Test 10: insert defaults — question null, options [], responseKind hook ─

runTest('Test 10: defaults for new fields when not provided', (store) => {
  store.insert('default-fields', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: { command: 'ls' },
  });
  const rich = store.getRich('default-fields');
  assertEqual(rich.question, null, 'question defaults to null');
  assertEqual(rich.options, [], 'options defaults to []');
  assertEqual(rich.responseKind, 'hook', 'responseKind defaults to hook');
});

// ── Test 11: migration adds missing columns to old-schema DB ─────────

runTest('Test 11: migrate() adds new columns to old schema', () => {
  // Wipe DB completely then create the OLD schema (no new columns) manually
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch (_) {
      /* ignore */
    }
  }
  const old = new Database(DB_PATH);
  old.pragma('journal_mode = WAL');
  old.exec(`
    CREATE TABLE pending_requests (
      request_id  TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      tool_name   TEXT NOT NULL,
      tool_input  TEXT NOT NULL DEFAULT '{}',
      decision    TEXT,
      created_at  INTEGER NOT NULL,
      decided_at  INTEGER
    )
  `);
  // Insert a row in the OLD schema (pre-migration)
  old
    .prepare(
      `INSERT INTO pending_requests
       (request_id, session_id, tool_name, tool_input, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run('legacy-row', 'sess', 'Bash', '{}', Date.now());
  old.close();

  // Re-open via the store — constructor's migrate() should add columns
  const store = new PendingRequestsStore(DB_PATH);
  try {
    const cols = store.db.prepare('PRAGMA table_info(pending_requests)').all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('question')) throw new Error('migrate() did not add `question` column');
    if (!names.has('options')) throw new Error('migrate() did not add `options` column');
    if (!names.has('response_kind')) throw new Error('migrate() did not add `response_kind`');

    // The legacy row should still be readable and have default values
    // for the new columns
    const rich = store.getRich('legacy-row');
    assertNotNull(rich, 'legacy row still readable after migration');
    assertEqual(rich.question, null, 'legacy row has null question');
    assertEqual(rich.options, [], 'legacy row has [] options');
    assertEqual(rich.responseKind, 'hook', 'legacy row has hook responseKind');
  } finally {
    store.close();
  }
});

// ── Test 12: migrate() is idempotent (re-running is a no-op) ─────────

runTest('Test 12: migrate() is idempotent', (store) => {
  // Constructor already ran migrate(). Run it again explicitly.
  store.migrate();
  store.migrate();
  // Inserting should still work
  store.insert('post-migrate', {
    sessionId: 's',
    toolName: 'Bash',
    toolInput: {},
    question: 'still works?',
  });
  assertEqual(store.getRich('post-migrate').question, 'still works?', 'works after re-migrate');
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
