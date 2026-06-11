/**
 * Unit tests for ShareStore SQLite module.
 *
 * Uses better-sqlite3 directly against /tmp/shooter-test-share-store.db
 * to replicate the exact schema and operations from share-store.ts,
 * avoiding TypeScript / path-alias complications.
 */

'use strict';

const Database = require('better-sqlite3');
const { createHash, randomBytes, scryptSync, timingSafeEqual } = require('crypto');
const fs = require('fs');

const DB_PATH = '/tmp/shooter-test-share-store.db';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Crypto helpers (mirror share-store.ts) ───────────────────────────

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, parts[1], 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// ── ShareStore (mirrors the real class) ──────────────────────────────

class ShareStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
			CREATE TABLE IF NOT EXISTS terminal_shares (
				terminal_id   TEXT PRIMARY KEY,
				password_hash TEXT NOT NULL,
				mode          TEXT NOT NULL,
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS share_sessions (
				token_hash  TEXT PRIMARY KEY,
				terminal_id TEXT NOT NULL,
				created_at  INTEGER NOT NULL,
				expires_at  INTEGER NOT NULL
			)
		`);
  }

  cleanup() {
    this.db.prepare('DELETE FROM share_sessions WHERE expires_at < ?').run(Date.now());
    try {
      this.db
        .prepare('DELETE FROM terminal_shares WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
      this.db
        .prepare('DELETE FROM share_sessions WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
    } catch (_) {
      /* terminals table may not exist — skip orphan cleanup */
    }
  }

  close() {
    this.db.close();
  }

  createSession(terminalId) {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .prepare(
        'INSERT INTO share_sessions (token_hash, terminal_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(hashToken(token), terminalId, now, expiresAt);
    return { expiresAt, token };
  }

  deleteSessions(terminalId) {
    this.db.prepare('DELETE FROM share_sessions WHERE terminal_id = ?').run(terminalId);
  }

  deleteShare(terminalId) {
    this.db.prepare('DELETE FROM terminal_shares WHERE terminal_id = ?').run(terminalId);
    this.deleteSessions(terminalId);
  }

  getShare(terminalId) {
    const row = this.db
      .prepare('SELECT * FROM terminal_shares WHERE terminal_id = ?')
      .get(terminalId);
    if (!row) return null;
    return {
      createdAt: row.created_at,
      mode: row.mode,
      passwordHash: row.password_hash,
      terminalId: row.terminal_id,
      updatedAt: row.updated_at,
    };
  }

  resolveToken(token) {
    if (!token) return null;
    const row = this.db
      .prepare(
        `SELECT s.terminal_id, s.expires_at, sh.mode
				 FROM share_sessions s
				 JOIN terminal_shares sh ON sh.terminal_id = s.terminal_id
				 WHERE s.token_hash = ?`
      )
      .get(hashToken(token));
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.db.prepare('DELETE FROM share_sessions WHERE token_hash = ?').run(hashToken(token));
      return null;
    }
    return { mode: row.mode, terminalId: row.terminal_id };
  }

  setShare(record) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO terminal_shares
				 (terminal_id, password_hash, mode, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.terminalId, record.passwordHash, record.mode, record.createdAt, record.updatedAt);
  }
}

// ── Assertions ───────────────────────────────────────────────────────

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

function assertTrue(value, label) {
  if (value !== true) {
    throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
  }
}

function assertFalse(value, label) {
  if (value !== false) {
    throw new Error(`${label}: expected false, got ${JSON.stringify(value)}`);
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
  return new ShareStore(DB_PATH);
}

function makeShare(overrides = {}) {
  return {
    terminalId: 'term-1',
    passwordHash: hashPassword('secret123'),
    mode: 'view',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
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

console.log('\nShareStore unit tests\n');

// ── Test 1: Set, get, and upsert share ───────────────────────────────

runTest('Test 1: Set, get, and upsert share', (store) => {
  const share = makeShare();
  store.setShare(share);

  const got = store.getShare('term-1');
  assertNotNull(got, 'getShare after set');
  assertEqual(got.mode, 'view', 'mode');
  assertEqual(got.passwordHash, share.passwordHash, 'passwordHash');

  // Upsert replaces, keeps single row per terminal (PK)
  store.setShare(makeShare({ mode: 'control', updatedAt: share.updatedAt + 1000 }));
  const updated = store.getShare('term-1');
  assertEqual(updated.mode, 'control', 'mode after upsert');
  const count = store.db.prepare('SELECT COUNT(*) AS n FROM terminal_shares').get().n;
  assertEqual(count, 1, 'single row after upsert');

  assertEqual(store.getShare('missing'), null, 'getShare for unknown terminal');
});

// ── Test 2: Password hashing ─────────────────────────────────────────

runTest('Test 2: Password hash format and verification', () => {
  const stored = hashPassword('hunter2-secret');
  const parts = stored.split(':');
  assertEqual(parts.length, 3, 'hash has 3 segments');
  assertEqual(parts[0], 'scrypt', 'scheme prefix');
  assertEqual(parts[1].length, 32, 'salt is 16 bytes hex');
  assertEqual(parts[2].length, 128, 'hash is 64 bytes hex');

  assertTrue(verifyPassword('hunter2-secret', stored), 'correct password verifies');
  assertFalse(verifyPassword('wrong-password', stored), 'wrong password fails');
  assertFalse(verifyPassword('hunter2-secret', 'garbage'), 'malformed stored string fails');
  assertFalse(verifyPassword('hunter2-secret', 'md5:abc:def'), 'wrong scheme fails');

  // Same password, different salts → different hashes
  const stored2 = hashPassword('hunter2-secret');
  if (stored === stored2) {
    throw new Error('two hashes of the same password should differ (random salt)');
  }
});

// ── Test 3: Session create and resolve ───────────────────────────────

runTest('Test 3: Session create and resolve', (store) => {
  store.setShare(makeShare({ mode: 'control' }));
  const { expiresAt, token } = store.createSession('term-1');

  assertEqual(token.length, 64, 'token is 32 bytes hex');
  assertTrue(expiresAt > Date.now(), 'expiry in the future');

  const resolved = store.resolveToken(token);
  assertNotNull(resolved, 'token resolves');
  assertEqual(resolved.terminalId, 'term-1', 'resolved terminal');
  assertEqual(resolved.mode, 'control', 'resolved mode follows the share');

  assertEqual(store.resolveToken('0'.repeat(64)), null, 'unknown token → null');
  assertEqual(store.resolveToken(''), null, 'empty token → null');

  // Token is stored hashed, never in plaintext
  const raw = store.db.prepare('SELECT token_hash FROM share_sessions').get().token_hash;
  assertEqual(raw, hashToken(token), 'stored value is sha256 of token');
});

// ── Test 4: Expired sessions resolve to null and are purged ──────────

runTest('Test 4: Expired session purged on resolve', (store) => {
  store.setShare(makeShare());
  const { token } = store.createSession('term-1');
  store.db
    .prepare('UPDATE share_sessions SET expires_at = ? WHERE token_hash = ?')
    .run(Date.now() - 1000, hashToken(token));

  assertEqual(store.resolveToken(token), null, 'expired token → null');
  const count = store.db.prepare('SELECT COUNT(*) AS n FROM share_sessions').get().n;
  assertEqual(count, 0, 'expired session row purged');
});

// ── Test 5: Revoke cascade is per-terminal ───────────────────────────

runTest('Test 5: Revoke cascades sessions, per terminal only', (store) => {
  store.setShare(makeShare({ terminalId: 'term-a' }));
  store.setShare(makeShare({ terminalId: 'term-b' }));
  const a = store.createSession('term-a');
  const b = store.createSession('term-b');

  store.deleteShare('term-a');

  assertEqual(store.getShare('term-a'), null, 'share a deleted');
  assertEqual(store.resolveToken(a.token), null, 'session a revoked');
  assertNotNull(store.getShare('term-b'), 'share b intact');
  assertNotNull(store.resolveToken(b.token), 'session b intact');
});

// ── Test 6: Revoked share invalidates surviving session rows ─────────

runTest('Test 6: Session without share resolves to null (join)', (store) => {
  store.setShare(makeShare());
  const { token } = store.createSession('term-1');
  // Delete only the share row, leaving the session row behind
  store.db.prepare('DELETE FROM terminal_shares WHERE terminal_id = ?').run('term-1');
  assertEqual(store.resolveToken(token), null, 'orphan session no longer resolves');
});

// ── Test 7: Orphan cleanup against terminals table ───────────────────

runTest('Test 7: Cleanup removes shares for deleted terminals', (store) => {
  store.db.exec(
    "CREATE TABLE terminals (id TEXT PRIMARY KEY); INSERT INTO terminals VALUES ('t1')"
  );
  store.setShare(makeShare({ terminalId: 't1' }));
  store.setShare(makeShare({ terminalId: 't2' }));
  const s1 = store.createSession('t1');
  store.createSession('t2');

  store.cleanup();

  assertNotNull(store.getShare('t1'), 'share for live terminal survives');
  assertNotNull(store.resolveToken(s1.token), 'session for live terminal survives');
  assertEqual(store.getShare('t2'), null, 'orphan share removed');
  const orphanSessions = store.db
    .prepare("SELECT COUNT(*) AS n FROM share_sessions WHERE terminal_id = 't2'")
    .get().n;
  assertEqual(orphanSessions, 0, 'orphan sessions removed');
});

// ── Test 8: Cleanup tolerates a missing terminals table ──────────────

runTest('Test 8: Cleanup without terminals table is a no-op', (store) => {
  store.setShare(makeShare());
  store.cleanup();
  assertNotNull(store.getShare('term-1'), 'share survives cleanup on fresh db');
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
