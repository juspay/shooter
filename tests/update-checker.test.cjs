/**
 * Tests for scripts/update-checker.cjs
 *
 * The regression under test: update detection used to compare package.json
 * versions only, so any commit that ships without a version bump — docs, chore,
 * ci (all `"release": false` in .releaserc.json) — was invisible. Dependency
 * security bumps land as `chore(deps):`, so installations silently never
 * received them while `shooter update` reported "Already up to date".
 *
 * These build real git repositories (a bare "origin" plus a clone) so the
 * fetch/rev-list path is exercised for real rather than mocked.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildUpdateRef,
  checkForUpdate,
  countCommitsBehind,
  isNewerVersion,
} = require('../scripts/update-checker.cjs');
const { pruneExpiredSuppressions } = require('../scripts/update-state.cjs');

let passed = 0;
let failed = 0;

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

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function writePkg(dir, version) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: '@juspay/shooter', version }, null, 2)}\n`
  );
}

/**
 * Build a bare origin with a `release` branch plus a clone of it.
 * Returns { root, origin, work }.
 */
function makeRepos(initialVersion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-update-'));
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const work = path.join(root, 'work');

  git(root, ['init', '--bare', '--initial-branch=release', origin]);
  git(root, ['clone', origin, seed]);
  writePkg(seed, initialVersion);
  git(seed, ['add', '.']);
  git(seed, ['commit', '-m', 'chore: seed']);
  git(seed, ['push', 'origin', 'release']);

  git(root, ['clone', origin, work]);
  return { origin, root, seed, work };
}

/** Push a commit to origin/release without touching the working clone. */
function pushCommit(seed, message, version) {
  if (version) writePkg(seed, version);
  else {
    fs.appendFileSync(path.join(seed, 'NOTES.md'), `${message}\n`);
  }
  git(seed, ['add', '.']);
  git(seed, ['commit', '-m', message]);
  git(seed, ['push', 'origin', 'release']);
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

console.log('\nupdate-checker unit tests\n');

runTest('reports no update when the clone matches origin/release', () => {
  const { root, work } = makeRepos('1.33.1');
  try {
    const result = checkForUpdate(work);
    assert(result.checkFailed === false, `check should succeed (${result.error})`);
    assert(result.updateAvailable === false, 'no update expected');
    assert(result.commitsBehind === 0, `commitsBehind should be 0, got ${result.commitsBehind}`);
  } finally {
    cleanup(root);
  }
});

runTest('REGRESSION: detects a chore(deps) security bump that does not change the version', () => {
  const { root, seed, work } = makeRepos('1.33.1');
  try {
    pushCommit(seed, 'chore(deps): bump dompurify from 3.4.11 to 3.4.12');

    const result = checkForUpdate(work);
    assert(result.checkFailed === false, `check should succeed (${result.error})`);
    assert(
      result.updateAvailable === true,
      'version-less security bump MUST be detected as an available update'
    );
    assert(result.commitsBehind === 1, `commitsBehind should be 1, got ${result.commitsBehind}`);
    assert(
      result.currentVersion === result.latestVersion,
      'versions are identical — which is exactly why the old check missed this'
    );
  } finally {
    cleanup(root);
  }
});

runTest('detects several version-less commits and counts them', () => {
  const { root, seed, work } = makeRepos('1.33.1');
  try {
    pushCommit(seed, 'docs: refresh readme');
    pushCommit(seed, 'ci: fix publish gate');
    pushCommit(seed, 'chore(deps): bump sveltekit');

    const result = checkForUpdate(work);
    assert(result.updateAvailable === true, 'update expected');
    assert(result.commitsBehind === 3, `commitsBehind should be 3, got ${result.commitsBehind}`);
  } finally {
    cleanup(root);
  }
});

runTest('still detects a normal version bump', () => {
  const { root, seed, work } = makeRepos('1.33.1');
  try {
    pushCommit(seed, 'chore(release): 1.34.0 [skip ci]', '1.34.0');

    const result = checkForUpdate(work);
    assert(result.updateAvailable === true, 'update expected');
    assert(result.latestVersion === '1.34.0', `latestVersion=${result.latestVersion}`);
    assert(result.currentVersion === '1.33.1', `currentVersion=${result.currentVersion}`);
  } finally {
    cleanup(root);
  }
});

runTest('does not report an update when the clone is ahead of origin/release', () => {
  const { root, work } = makeRepos('1.33.1');
  try {
    fs.appendFileSync(path.join(work, 'LOCAL.md'), 'local work\n');
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'feat: local only']);

    const result = checkForUpdate(work);
    assert(result.updateAvailable === false, 'local-ahead must not be an update');
    assert(result.commitsBehind === 0, `commitsBehind should be 0, got ${result.commitsBehind}`);
  } finally {
    cleanup(root);
  }
});

runTest('reports commit hashes for both sides', () => {
  const { root, seed, work } = makeRepos('1.33.1');
  try {
    pushCommit(seed, 'docs: something');
    const result = checkForUpdate(work);
    assert(result.currentCommit.length > 0, 'currentCommit should be populated');
    assert(result.latestCommit.length > 0, 'latestCommit should be populated');
    assert(result.currentCommit !== result.latestCommit, 'commits should differ');
  } finally {
    cleanup(root);
  }
});

runTest('buildUpdateRef distinguishes version-less updates from version bumps', () => {
  assert(
    buildUpdateRef('1.33.1', '1.34.0', 'abc1234') === '1.34.0',
    'a real version bump keys on the version alone'
  );
  assert(
    buildUpdateRef('1.33.1', '1.33.1', 'abc1234') === '1.33.1+abc1234',
    'a version-less update must not suppress the running version'
  );
  assert(
    buildUpdateRef('1.33.1', '1.33.1', '') === '1.33.1',
    'falls back to the version when no commit is known'
  );
});

runTest('falls back to the version comparison when the commit count is unavailable', () => {
  // No `origin` remote at all: the fetch fails, so the check reports failure
  // rather than silently claiming "up to date".
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-update-'));
  try {
    git(root, ['init', '--initial-branch=release', '.']);
    writePkg(root, '1.33.1');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'chore: seed']);

    const result = checkForUpdate(root);
    assert(result.checkFailed === true, 'a missing origin must surface as a check failure');
    assert(result.updateAvailable === false, 'never claim an update when the check failed');
    assert(result.error.length > 0, 'an error message should be reported');
  } finally {
    cleanup(root);
  }
});

runTest('countCommitsBehind returns null outside a git repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shooter-nogit-'));
  try {
    assert(countCommitsBehind(root) === null, 'null signals "fall back to version comparison"');
  } finally {
    cleanup(root);
  }
});

runTest('pruneExpiredSuppressions drops only entries past the 24h window', () => {
  const now = Date.parse('2026-07-25T12:00:00.000Z');
  const state = {
    suppressedVersions: {
      '1.33.1+aaaaaaa': { suppressedAt: '2026-07-25T11:00:00.000Z', reason: 'recent' },
      '1.33.1+bbbbbbb': { suppressedAt: '2026-07-23T11:00:00.000Z', reason: 'expired' },
      '1.33.1+ccccccc': { suppressedAt: 'not-a-date', reason: 'corrupt' },
    },
  };
  pruneExpiredSuppressions(state, now);
  const keys = Object.keys(state.suppressedVersions);
  assert(keys.length === 1, `only the recent entry should survive, got ${keys.join(', ')}`);
  assert(keys[0] === '1.33.1+aaaaaaa', 'the in-window entry must be kept');
});

runTest('isNewerVersion still behaves (unchanged helper)', () => {
  assert(isNewerVersion('1.33.1', '1.34.0') === true, '1.33.1 < 1.34.0');
  assert(isNewerVersion('1.33.1', '1.33.1') === false, 'equal is not newer');
  assert(isNewerVersion('1.34.0', '1.33.1') === false, 'older is not newer');
  assert(isNewerVersion('bad', '1.33.1') === false, 'unparseable is never newer');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
