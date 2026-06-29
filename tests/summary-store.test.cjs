/**
 * Unit tests for src/lib/modules/server/sessions/summary-store.ts
 *
 * The SummaryStore persists the autopilot engine's per-run SessionSummaryRecord
 * rows. This suite covers the lifecycle additions:
 *   - a `status` ('active' | 'completed') + `completionReason` column,
 *   - idempotent migration that ADDs those columns to a pre-existing
 *     (old-schema) shooter.db without data loss,
 *   - retention: pruneOld() by age and by per-terminal cap,
 *   - deleteById() for the manual-dismiss path.
 *
 * Loads the REAL TS module via tsx/cjs (the $lib/types import is type-only →
 * erased by esbuild). Each test runs against an isolated temp data dir so the
 * user's real ~/.shooter is never touched.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the eager module-level singleton's default dir away from ~/.shooter.
const SINGLETON_HOME = path.join(os.tmpdir(), 'shooter-test-summary-home');
process.env.SHOOTER_HOME = SINGLETON_HOME;

require('tsx/cjs');

const Database = require('better-sqlite3');
const { SummaryStore } = require(
  path.join(__dirname, '..', 'src', 'lib', 'modules', 'server', 'sessions', 'summary-store.ts')
);

const DATA_ROOT = path.join(os.tmpdir(), 'shooter-test-summary');

let passed = 0;
let failed = 0;
let dirSeq = 0;

// Each test gets its OWN dir: SummaryStore holds its SQLite connection open
// (WAL files outlive an rmSync of a shared dir), so isolation must be per-test.
function freshDir() {
  const dir = path.join(DATA_ROOT, `t${dirSeq++}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runTest(name, fn) {
  try {
    fn(new SummaryStore(freshDir()));
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
    failed++;
  }
}

// For the migration test we need an old-schema DB to exist BEFORE any
// new-code SummaryStore touches the dir — so the store is created inside fn.
function runTestRaw(name, fn) {
  try {
    fn(freshDir());
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
    failed++;
  }
}

function rec(over) {
  return {
    completionReason: null,
    createdAt: new Date('2026-06-30T12:00:00.000Z').toISOString(),
    id: `id-${Math.random().toString(36).slice(2)}`,
    nextSteps: '[]',
    projectName: 'proj',
    sessionId: 't1',
    status: 'active',
    summary: 'doing things',
    terminalId: 't1',
    trigger: 'agent-idle',
    ...over,
  };
}

// ── Round-trip: status + completionReason persist and read back ────────

runTest('insert + listRecent round-trips status=active by default', (s) => {
  s.insert(rec({ id: 'a1' }));
  const [r] = s.listRecent(10);
  assert.strictEqual(r.status, 'active', 'status defaults to active');
  assert.strictEqual(r.completionReason, null, 'completionReason null');
});

runTest('insert + listRecent round-trips a completed record', (s) => {
  s.insert(rec({ completionReason: 'goal met: tests pass', id: 'c1', status: 'completed' }));
  const [r] = s.listRecent(10);
  assert.strictEqual(r.status, 'completed', 'status completed');
  assert.strictEqual(r.completionReason, 'goal met: tests pass', 'reason persisted');
});

// ── Migration: old-schema DB gains the new columns idempotently ────────

runTestRaw('migration ADDs status/completion_reason to a pre-existing old-schema DB', (dir) => {
  // Simulate a shooter.db created before the lifecycle columns existed.
  const dbPath = path.join(dir, 'shooter.db');
  const old = new Database(dbPath);
  old.exec(`
    CREATE TABLE session_summaries (
      id           TEXT PRIMARY KEY,
      terminal_id  TEXT,
      session_id   TEXT,
      project_name TEXT,
      summary      TEXT NOT NULL,
      next_steps   TEXT NOT NULL DEFAULT '[]',
      trigger      TEXT NOT NULL,
      created_at   TEXT NOT NULL
    )`);
  old
    .prepare(
      `INSERT INTO session_summaries (id, terminal_id, session_id, project_name, summary, next_steps, trigger, created_at)
       VALUES ('legacy1','t1','t1','proj','legacy row','[]','agent-idle','2026-06-13T00:00:00.000Z')`
    )
    .run();
  old.close();

  // Opening the store must migrate the schema without dropping the legacy row.
  const s = new SummaryStore(dir);
  const [r] = s.listRecent(10);
  assert.strictEqual(r.id, 'legacy1', 'legacy row preserved');
  assert.strictEqual(r.status, 'active', 'legacy row reads back as active');
  assert.strictEqual(r.completionReason, null, 'legacy completionReason null');
  // Idempotent: a second open must not throw (duplicate-column error).
  const s2 = new SummaryStore(dir);
  assert.strictEqual(s2.listRecent(10).length, 1, 'second open is a no-op migration');
});

// ── Retention: pruneOld() by age ───────────────────────────────────────

runTest('pruneOld removes rows older than maxAgeDays, keeps recent', (s) => {
  s.insert(rec({ createdAt: '2026-06-01T00:00:00.000Z', id: 'old', sessionId: 'tA', terminalId: 'tA' }));
  s.insert(rec({ createdAt: '2026-06-29T00:00:00.000Z', id: 'new', sessionId: 'tA', terminalId: 'tA' }));
  const removed = s.pruneOld({ maxAgeDays: 7, now: new Date('2026-06-30T00:00:00.000Z') });
  assert.strictEqual(removed, 1, 'one stale row removed');
  const ids = s.listRecent(10).map((r) => r.id);
  assert.deepStrictEqual(ids, ['new'], 'only the recent row remains');
});

// ── Retention: pruneOld() per-terminal cap ─────────────────────────────

runTest('pruneOld enforces maxPerTerminal, keeping the newest', (s) => {
  for (let i = 0; i < 5; i++) {
    s.insert(
      rec({
        createdAt: `2026-06-30T12:0${i}:00.000Z`,
        id: `cap${i}`,
        sessionId: 'tCap',
        terminalId: 'tCap',
      })
    );
  }
  const removed = s.pruneOld({ maxPerTerminal: 2, now: new Date('2026-06-30T13:00:00.000Z') });
  assert.strictEqual(removed, 3, 'three oldest-per-terminal rows removed');
  const ids = s.listRecent(10).map((r) => r.id);
  assert.deepStrictEqual(ids, ['cap4', 'cap3'], 'newest two kept (desc order)');
});

runTest('pruneOld per-terminal cap never deletes completed rows', (s) => {
  // Oldest row is the completed card — it must survive the cap so the user still sees "done".
  s.insert(
    rec({
      completionReason: 'done',
      createdAt: '2026-06-30T12:00:00.000Z',
      id: 'cmp',
      sessionId: 'tEx',
      status: 'completed',
      terminalId: 'tEx',
    })
  );
  for (let i = 1; i <= 4; i++) {
    s.insert(
      rec({ createdAt: `2026-06-30T12:0${i}:00.000Z`, id: `act${i}`, sessionId: 'tEx', terminalId: 'tEx' })
    );
  }
  const removed = s.pruneOld({ maxPerTerminal: 2, now: new Date('2026-06-30T13:00:00.000Z') });
  const ids = s.listRecent(10).map((r) => r.id);
  assert.ok(ids.includes('cmp'), 'completed row survives the per-terminal cap');
  assert.deepStrictEqual([...ids].sort(), ['act3', 'act4', 'cmp'], 'completed + newest 2 active kept');
  assert.strictEqual(removed, 2, 'only the 2 oldest ACTIVE rows removed');
});

runTest('pruneOld per-terminal cap treats null-terminal rows as independent', (s) => {
  for (let i = 0; i < 3; i++) {
    s.insert(
      rec({ createdAt: `2026-06-30T12:0${i}:00.000Z`, id: `n${i}`, sessionId: null, terminalId: null })
    );
  }
  const removed = s.pruneOld({ maxPerTerminal: 1, now: new Date('2026-06-30T13:00:00.000Z') });
  assert.strictEqual(removed, 0, 'null-terminal rows are not lumped into one capped partition');
  assert.strictEqual(s.listRecent(10).length, 3, 'all three null-terminal rows survive');
});

runTest('pruneOld maxAgeDays=0 removes every row created before now', (s) => {
  s.insert(rec({ createdAt: '2026-06-29T00:00:00.000Z', id: 'z1' }));
  s.insert(rec({ createdAt: '2026-06-30T11:59:59.000Z', id: 'z2' }));
  const removed = s.pruneOld({ maxAgeDays: 0, now: new Date('2026-06-30T12:00:00.000Z') });
  assert.strictEqual(removed, 2, 'maxAgeDays=0 → cutoff is now, all past rows removed');
  assert.strictEqual(s.listRecent(10).length, 0, 'store emptied');
});

runTest('pruneOld negative maxAgeDays does not throw (cutoff pushed into the future)', (s) => {
  s.insert(rec({ createdAt: '2026-06-30T11:00:00.000Z', id: 'neg1' }));
  let removed;
  assert.doesNotThrow(() => {
    removed = s.pruneOld({ maxAgeDays: -1, now: new Date('2026-06-30T12:00:00.000Z') });
  }, 'negative maxAgeDays handled gracefully');
  assert.strictEqual(removed, 1, 'past row removed against a future cutoff');
});

runTest('pruneOld maxPerTerminal <= 0 is a no-op (guards a misconfigured cap)', (s) => {
  for (let i = 0; i < 3; i++) {
    s.insert(rec({ createdAt: `2026-06-30T12:0${i}:00.000Z`, id: `g${i}`, sessionId: 'tG', terminalId: 'tG' }));
  }
  assert.strictEqual(
    s.pruneOld({ maxPerTerminal: 0, now: new Date('2026-06-30T13:00:00.000Z') }),
    0,
    'cap 0 deletes nothing (not everything)'
  );
  assert.strictEqual(
    s.pruneOld({ maxPerTerminal: -5, now: new Date('2026-06-30T13:00:00.000Z') }),
    0,
    'negative cap deletes nothing'
  );
  assert.strictEqual(s.listRecent(10).length, 3, 'all rows survive a non-positive cap');
});

// ── Manual dismiss: deleteById ─────────────────────────────────────────

runTest('deleteById removes one row and reports the count', (s) => {
  s.insert(rec({ id: 'd1' }));
  s.insert(rec({ id: 'd2' }));
  assert.strictEqual(s.deleteById('d1'), 1, 'deletes the matching row');
  assert.strictEqual(s.deleteById('nope'), 0, 'unknown id removes nothing');
  const ids = s.listRecent(10).map((r) => r.id);
  assert.deepStrictEqual(ids, ['d2'], 'only the undeleted row remains');
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
fs.rmSync(DATA_ROOT, { recursive: true, force: true });
fs.rmSync(SINGLETON_HOME, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
