/**
 * Git-based auto-update version checker for Shooter.
 *
 * Runs `git fetch` and compares the local package.json version against
 * origin/release. Designed to be failure-tolerant — any error silently
 * returns `{ updateAvailable: false }`.
 *
 * Adapted from @juspay/neurolink's updateChecker.ts.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIT_FETCH_TIMEOUT_MS = 15_000;
const GIT_SHOW_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Semver helpers (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a version string of the form `major.minor.patch` into numeric
 * components. Returns null when the string does not match.
 */
function parseSemVer(version) {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Returns true when `latest` is strictly greater than `current`.
 * Both arguments must be valid semver strings; returns false on any
 * parse failure so the caller never sees a spurious "update available".
 */
function isNewerVersion(current, latest) {
  const cur = parseSemVer(current);
  const lat = parseSemVer(latest);
  if (!cur || !lat) return false;

  if (lat.major !== cur.major) return lat.major > cur.major;
  if (lat.minor !== cur.minor) return lat.minor > cur.minor;
  return lat.patch > cur.patch;
}

// ---------------------------------------------------------------------------
// Branch check
// ---------------------------------------------------------------------------

/**
 * Returns the current git branch name, or null on failure.
 */
function getCurrentBranch(pkgRoot) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: pkgRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_SHOW_TIMEOUT_MS,
    }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Check for updates by comparing local package.json version against
 * origin/release's package.json.
 *
 * On failure, returns { updateAvailable: false, checkFailed: true, error: '...' }
 * so callers can distinguish "no update" from "check error".
 *
 * @param {string} pkgRoot - Absolute path to the Shooter repo root.
 * @returns {{ updateAvailable: boolean, checkFailed: boolean, error: string, currentVersion: string, latestVersion: string, currentCommit: string, latestCommit: string, branch: string }}
 */
function checkForUpdate(pkgRoot) {
  const fail = {
    updateAvailable: false,
    checkFailed: true,
    error: '',
    currentVersion: 'unknown',
    latestVersion: 'unknown',
    currentCommit: '',
    latestCommit: '',
    branch: '',
  };

  try {
    // Read local version
    const localPkg = JSON.parse(
      fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')
    );
    const currentVersion = localPkg.version || 'unknown';
    fail.currentVersion = currentVersion;

    // Get current branch
    const branch = getCurrentBranch(pkgRoot);
    fail.branch = branch || '';

    // Get current commit
    let currentCommit = '';
    try {
      currentCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: pkgRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_SHOW_TIMEOUT_MS,
      }).trim();
    } catch { /* ignore */ }
    fail.currentCommit = currentCommit;

    // Fetch latest from origin
    try {
      execFileSync('git', ['fetch', 'origin', 'release', '--quiet'], {
        cwd: pkgRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_FETCH_TIMEOUT_MS,
      });
    } catch (fetchErr) {
      fail.error = `git fetch failed: ${fetchErr.message || fetchErr}`;
      return fail;
    }

    // Read remote version from origin/release's package.json
    let remoteVersionStr;
    try {
      remoteVersionStr = execFileSync(
        'git',
        ['show', 'origin/release:package.json'],
        {
          cwd: pkgRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: GIT_SHOW_TIMEOUT_MS,
        }
      );
    } catch {
      fail.error = 'origin/release branch not found';
      return fail;
    }

    const remotePkg = JSON.parse(remoteVersionStr);
    const latestVersion = remotePkg.version || 'unknown';

    if (!parseSemVer(latestVersion)) {
      fail.error = `invalid remote version: ${latestVersion}`;
      return fail;
    }

    // Get remote commit
    let latestCommit = '';
    try {
      latestCommit = execFileSync(
        'git',
        ['rev-parse', '--short', 'origin/release'],
        {
          cwd: pkgRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: GIT_SHOW_TIMEOUT_MS,
        }
      ).trim();
    } catch { /* ignore */ }

    const updateAvailable = isNewerVersion(currentVersion, latestVersion);

    return {
      updateAvailable,
      checkFailed: false,
      error: '',
      currentVersion,
      latestVersion,
      currentCommit,
      latestCommit,
      branch: branch || '',
    };
  } catch (err) {
    fail.error = `update check failed: ${err.message || err}`;
    return fail;
  }
}

module.exports = { checkForUpdate, isNewerVersion, parseSemVer, getCurrentBranch };
