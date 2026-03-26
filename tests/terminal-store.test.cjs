/**
 * Unit tests for TerminalStore SQLite module.
 *
 * Uses better-sqlite3 directly against /tmp/shooter-test-store.db
 * to replicate the exact schema and operations from terminal-store.ts,
 * avoiding TypeScript / path-alias complications.
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = '/tmp/shooter-test-store.db';

// ── Column list (mirrors terminal-store.ts) ──────────────────────────

const COLUMNS = [
  'id',
  'command',
  'args',
  'cwd',
  'cols',
  'rows',
  'pid',
  'holder_pid',
  'socket_path',
  'session_file',
  'opencode_session_id',
  'status',
  'exit_code',
  'created_at',
  'exited_at',
];

const CAMEL_TO_SNAKE = {
  createdAt: 'created_at',
  exitCode: 'exit_code',
  exitedAt: 'exited_at',
  holderPid: 'holder_pid',
  opencodeSessionId: 'opencode_session_id',
  sessionFile: 'session_file',
  socketPath: 'socket_path',
};

function toSnake(key) {
  return CAMEL_TO_SNAKE[key] || key;
}

function rowToRecord(row) {
  return {
    args: row.args,
    cols: row.cols,
    command: row.command,
    createdAt: row.created_at,
    cwd: row.cwd,
    exitCode: row.exit_code ?? null,
    exitedAt: row.exited_at ?? null,
    holderPid: row.holder_pid ?? null,
    id: row.id,
    opencodeSessionId: row.opencode_session_id ?? null,
    pid: row.pid ?? null,
    rows: row.rows,
    sessionFile: row.session_file ?? null,
    socketPath: row.socket_path ?? null,
    status: row.status,
  };
}

// ── TerminalStore (mirrors the real class) ───────────────────────────

class TerminalStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
			CREATE TABLE IF NOT EXISTS terminals (
				id                    TEXT PRIMARY KEY,
				command               TEXT NOT NULL,
				args                  TEXT NOT NULL DEFAULT '[]',
				cwd                   TEXT NOT NULL,
				cols                  INTEGER NOT NULL DEFAULT 80,
				rows                  INTEGER NOT NULL DEFAULT 24,
				pid                   INTEGER,
				holder_pid            INTEGER,
				socket_path           TEXT,
				session_file          TEXT,
				opencode_session_id   TEXT,
				status                TEXT NOT NULL DEFAULT 'running',
				exit_code             INTEGER,
				created_at            TEXT NOT NULL,
				exited_at             TEXT
			)
		`);
  }

  insert(terminal) {
    const placeholders = COLUMNS.map(() => '?').join(', ');
    const stmt = this.db.prepare(
      `INSERT INTO terminals (${COLUMNS.join(', ')}) VALUES (${placeholders})`
    );
    stmt.run(
      terminal.id,
      terminal.command,
      terminal.args,
      terminal.cwd,
      terminal.cols,
      terminal.rows,
      terminal.pid,
      terminal.holderPid,
      terminal.socketPath,
      terminal.sessionFile,
      terminal.opencodeSessionId,
      terminal.status,
      terminal.exitCode,
      terminal.createdAt,
      terminal.exitedAt
    );
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM terminals WHERE id = ?').get(id);
    return row ? rowToRecord(row) : null;
  }

  listAll() {
    const rows = this.db.prepare('SELECT * FROM terminals ORDER BY created_at DESC').all();
    return rows.map(rowToRecord);
  }

  listRunning() {
    const rows = this.db
      .prepare("SELECT * FROM terminals WHERE status = 'running' ORDER BY created_at DESC")
      .all();
    return rows.map(rowToRecord);
  }

  markOrphaned(id) {
    this.db.prepare("UPDATE terminals SET status = 'orphaned' WHERE id = ?").run(id);
  }

  markExited(id, exitCode) {
    this.db
      .prepare("UPDATE terminals SET status = 'exited', exit_code = ?, exited_at = ? WHERE id = ?")
      .run(exitCode, new Date().toISOString(), id);
  }

  deleteOlderThan(ms) {
    const cutoff = new Date(Date.now() - ms).toISOString();
    const result = this.db
      .prepare(
        "DELETE FROM terminals WHERE status IN ('exited', 'orphaned') AND COALESCE(exited_at, created_at) < ?"
      )
      .run(cutoff);
    return result.changes;
  }

  update(id, fields) {
    const entries = Object.entries(fields).filter(
      ([key, val]) => key !== 'id' && val !== undefined
    );
    if (entries.length === 0) return;

    const sets = entries.map(([key]) => `${toSnake(key)} = ?`).join(', ');
    const values = entries.map(([, val]) => val ?? null);

    this.db.prepare(`UPDATE terminals SET ${sets} WHERE id = ?`).run(...values, id);
  }

  close() {
    this.db.close();
  }
}

// ── Test Helpers ─────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 10),
    command: '/bin/bash',
    args: '[]',
    cwd: '/tmp',
    cols: 80,
    rows: 24,
    pid: 12345,
    holderPid: 12344,
    socketPath: '/tmp/test.sock',
    sessionFile: null,
    opencodeSessionId: null,
    status: 'running',
    exitCode: null,
    createdAt: new Date().toISOString(),
    exitedAt: null,
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

// ── Fresh DB per test ────────────────────────────────────────────────

function freshStore() {
  // Remove any existing test DB files
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch (_) {
      /* ignore */
    }
  }
  return new TerminalStore(DB_PATH);
}

// ── Tests ────────────────────────────────────────────────────────────

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

console.log('\nTerminalStore unit tests\n');

// ── Test 1: Insert and Get ───────────────────────────────────────────

runTest('Test 1: Insert and Get', (store) => {
  const rec = makeRecord({
    id: 'term-insert-get',
    command: '/usr/bin/zsh',
    args: '["-l"]',
    cwd: '/home/user',
    cols: 120,
    rows: 40,
    pid: 9999,
    holderPid: 9998,
    socketPath: '/tmp/holder.sock',
    sessionFile: '/tmp/session.jsonl',
    opencodeSessionId: 'oc-session-1',
    status: 'running',
    exitCode: null,
    createdAt: '2025-01-15T10:30:00.000Z',
    exitedAt: null,
  });

  store.insert(rec);
  const got = store.get('term-insert-get');

  assertNotNull(got, 'get result');
  assertEqual(got.id, 'term-insert-get', 'id');
  assertEqual(got.command, '/usr/bin/zsh', 'command');
  assertEqual(got.args, '["-l"]', 'args');
  assertEqual(got.cwd, '/home/user', 'cwd');
  assertEqual(got.cols, 120, 'cols');
  assertEqual(got.rows, 40, 'rows');
  assertEqual(got.pid, 9999, 'pid');
  assertEqual(got.holderPid, 9998, 'holderPid (camelCase)');
  assertEqual(got.socketPath, '/tmp/holder.sock', 'socketPath (camelCase)');
  assertEqual(got.sessionFile, '/tmp/session.jsonl', 'sessionFile (camelCase)');
  assertEqual(got.opencodeSessionId, 'oc-session-1', 'opencodeSessionId (camelCase)');
  assertEqual(got.status, 'running', 'status');
  assertEqual(got.exitCode, null, 'exitCode');
  assertEqual(got.createdAt, '2025-01-15T10:30:00.000Z', 'createdAt (camelCase)');
  assertEqual(got.exitedAt, null, 'exitedAt');
});

// ── Test 2: List methods ─────────────────────────────────────────────

runTest('Test 2: listAll and listRunning', (store) => {
  const r1 = makeRecord({ id: 'r1', status: 'running', createdAt: '2025-01-01T01:00:00Z' });
  const r2 = makeRecord({ id: 'r2', status: 'running', createdAt: '2025-01-01T02:00:00Z' });
  const r3 = makeRecord({
    id: 'r3',
    status: 'exited',
    exitCode: 0,
    createdAt: '2025-01-01T03:00:00Z',
    exitedAt: '2025-01-01T03:05:00Z',
  });

  store.insert(r1);
  store.insert(r2);
  store.insert(r3);

  const all = store.listAll();
  assertEqual(all.length, 3, 'listAll count');

  // Verify order: DESC by created_at — r3 first, then r2, then r1
  assertEqual(all[0].id, 'r3', 'listAll order[0]');
  assertEqual(all[1].id, 'r2', 'listAll order[1]');
  assertEqual(all[2].id, 'r1', 'listAll order[2]');

  const running = store.listRunning();
  assertEqual(running.length, 2, 'listRunning count');
  // Both should be running
  for (const r of running) {
    assertEqual(r.status, 'running', `listRunning status for ${r.id}`);
  }
  // Should NOT contain the exited record
  const runningIds = running.map((r) => r.id);
  assertEqual(runningIds.includes('r3'), false, 'listRunning excludes exited');
});

// ── Test 3: markOrphaned ─────────────────────────────────────────────

runTest('Test 3: markOrphaned', (store) => {
  const rec = makeRecord({ id: 'orphan-me', status: 'running' });
  store.insert(rec);

  store.markOrphaned('orphan-me');
  const got = store.get('orphan-me');

  assertNotNull(got, 'get after markOrphaned');
  assertEqual(got.status, 'orphaned', 'status after markOrphaned');
});

// ── Test 4: markExited ───────────────────────────────────────────────

runTest('Test 4: markExited', (store) => {
  const rec = makeRecord({ id: 'exit-me', status: 'running' });
  store.insert(rec);

  store.markExited('exit-me', 0);
  const got = store.get('exit-me');

  assertNotNull(got, 'get after markExited');
  assertEqual(got.status, 'exited', 'status after markExited');
  assertEqual(got.exitCode, 0, 'exitCode after markExited');
  assertNotNull(got.exitedAt, 'exitedAt should be set');

  // exitedAt should be a valid ISO string
  const ts = new Date(got.exitedAt);
  if (isNaN(ts.getTime())) {
    throw new Error('exitedAt is not a valid ISO timestamp');
  }

  // Verify exitCode works with non-zero values too
  const rec2 = makeRecord({ id: 'exit-me-2', status: 'running' });
  store.insert(rec2);
  store.markExited('exit-me-2', 137);
  const got2 = store.get('exit-me-2');
  assertEqual(got2.exitCode, 137, 'exitCode with non-zero value');
});

// ── Test 5: deleteOlderThan ──────────────────────────────────────────

runTest('Test 5: deleteOlderThan', (store) => {
  const now = Date.now();
  const h48ago = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const h1ago = new Date(now - 1 * 60 * 60 * 1000).toISOString();

  const old = makeRecord({
    id: 'old-record',
    status: 'exited',
    exitCode: 0,
    createdAt: h48ago,
    exitedAt: h48ago,
  });
  const recent = makeRecord({
    id: 'recent-record',
    status: 'exited',
    exitCode: 0,
    createdAt: h1ago,
    exitedAt: h1ago,
  });

  store.insert(old);
  store.insert(recent);

  // Delete anything older than 24 hours
  const deleted = store.deleteOlderThan(24 * 60 * 60 * 1000);
  assertEqual(deleted, 1, 'deleteOlderThan should remove 1 record');

  // Old record should be gone
  assertEqual(store.get('old-record'), null, 'old record deleted');
  // Recent record should still exist
  assertNotNull(store.get('recent-record'), 'recent record survives');

  // Running records should NOT be deleted even if old
  const oldRunning = makeRecord({
    id: 'old-running',
    status: 'running',
    createdAt: h48ago,
  });
  store.insert(oldRunning);
  const deleted2 = store.deleteOlderThan(24 * 60 * 60 * 1000);
  assertEqual(deleted2, 0, 'deleteOlderThan skips running records');
  assertNotNull(store.get('old-running'), 'old running record survives');
});

// ── Test 6: Update ───────────────────────────────────────────────────

runTest('Test 6: Update', (store) => {
  const rec = makeRecord({
    id: 'update-me',
    sessionFile: null,
    opencodeSessionId: null,
  });
  store.insert(rec);

  store.update('update-me', {
    sessionFile: '/new/session.jsonl',
    opencodeSessionId: 'oc-updated-123',
  });

  const got = store.get('update-me');
  assertNotNull(got, 'get after update');
  assertEqual(got.sessionFile, '/new/session.jsonl', 'sessionFile after update');
  assertEqual(got.opencodeSessionId, 'oc-updated-123', 'opencodeSessionId after update');

  // Other fields should be unchanged
  assertEqual(got.command, rec.command, 'command unchanged');
  assertEqual(got.cwd, rec.cwd, 'cwd unchanged');
  assertEqual(got.cols, rec.cols, 'cols unchanged');
  assertEqual(got.status, rec.status, 'status unchanged');
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

// Clean up test DB
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(DB_PATH + suffix);
  } catch (_) {
    /* ignore */
  }
}

process.exit(failed > 0 ? 1 : 0);
