/**
 * Update State Persistence for Shooter auto-update.
 *
 * Manages persistent state at ~/.shooter/update-state.json.
 * Tracks check timestamps, suppressed versions, and update history.
 * Suppressed versions expire after 24 hours.
 *
 * Adapted from @juspay/neurolink's updateState.ts.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================
// Constants
// ============================================

const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(os.homedir(), '.shooter');
const STATE_FILENAME = 'update-state.json';
const SUPPRESSION_TTL_MS = 86_400_000; // 24 hours

// ============================================
// Internal Helpers
// ============================================

function resolveStatePath(overridePath) {
  return overridePath || path.join(SHOOTER_HOME, STATE_FILENAME);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const LOCK_STALE_MS = 30_000; // 30 seconds — locks older than this are considered stale

/**
 * Check if a lockfile is stale (owner process dead or lock too old).
 */
function isStaleLock(lockPath) {
  try {
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    const pid = parseInt(content, 10);
    // Check if the owning process is still alive
    if (pid && pid > 0) {
      try { process.kill(pid, 0); return false; } catch { /* process dead */ }
      return true;
    }
    // No valid PID — fall back to mtime check
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch {
    return true; // Can't read lock — treat as stale
  }
}

/**
 * Acquire an exclusive lockfile. Returns the fd on success, null on failure.
 * Writes the current PID for stale-lock detection.
 * Retries up to 5 times with 50ms backoff, clearing stale locks.
 */
function acquireLock(lockPath) {
  ensureParentDir(lockPath);
  for (let i = 0; i < 5; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      return fd;
    } catch {
      // Lock exists — check if stale
      if (isStaleLock(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch {}
        continue; // Retry immediately after removing stale lock
      }
      // Lock held by a live process — wait and retry
      const deadline = Date.now() + 50 * (i + 1);
      while (Date.now() < deadline) { /* busy wait */ }
    }
  }
  return null;
}

function releaseLock(lockPath, fd) {
  try { fs.closeSync(fd); } catch {}
  try { fs.unlinkSync(lockPath); } catch {}
}

/**
 * Run a read-modify-write operation on the state file under an exclusive lock.
 * `mutator(state)` receives the current state (never null) and mutates it in place.
 */
function withUpdateStateLocked(mutator, stateFilePath) {
  const filePath = resolveStatePath(stateFilePath);
  const lockPath = filePath + '.lock';
  const fd = acquireLock(lockPath);
  if (fd === null) {
    // Could not acquire lock after retries — proceed unlocked rather than failing silently
    const state = loadUpdateState(stateFilePath) || getDefaultUpdateState();
    mutator(state);
    saveUpdateState(state, stateFilePath);
    return;
  }
  try {
    const state = loadUpdateState(stateFilePath) || getDefaultUpdateState();
    mutator(state);
    saveUpdateState(state, stateFilePath);
  } finally {
    releaseLock(lockPath, fd);
  }
}

// ============================================
// Exported Functions
// ============================================

/**
 * Return an empty/initial state.
 */
function getDefaultUpdateState() {
  return {
    lastCheckAt: new Date(0).toISOString(),
    lastCheckVersion: '',
    suppressedVersions: {},
    lastUpdateAt: null,
    lastUpdateVersion: null,
    updateHistory: [],
  };
}

/**
 * Load the update state from disk.
 * Returns null if the file does not exist.
 * Returns the default state if the file contains corrupt JSON.
 */
function loadUpdateState(stateFilePath) {
  const filePath = resolveStatePath(stateFilePath);
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.suppressedVersions !== 'object' ||
      parsed.suppressedVersions === null ||
      Array.isArray(parsed.suppressedVersions) ||
      typeof parsed.lastCheckAt !== 'string'
    ) {
      return getDefaultUpdateState();
    }
    return parsed;
  } catch {
    return getDefaultUpdateState();
  }
}

/**
 * Save the update state to disk (atomic: temp + rename).
 */
function saveUpdateState(state, stateFilePath) {
  const filePath = resolveStatePath(stateFilePath);
  ensureParentDir(filePath);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Check whether a version is currently suppressed (within the 24-hour window).
 */
function isVersionSuppressed(version, stateFilePath) {
  const state = loadUpdateState(stateFilePath);
  if (!state) return false;
  const entry = state.suppressedVersions[version];
  if (!entry) return false;
  return Date.now() - Date.parse(entry.suppressedAt) < SUPPRESSION_TTL_MS;
}

/**
 * Add a version to the suppressed list and persist.
 */
function suppressVersion(version, reason, stateFilePath) {
  withUpdateStateLocked((state) => {
    state.suppressedVersions[version] = {
      suppressedAt: new Date().toISOString(),
      reason,
    };
  }, stateFilePath);
}

/**
 * Record a successful update: set lastUpdateAt/lastUpdateVersion and
 * append to updateHistory.
 */
function recordSuccessfulUpdate(version, fromVersion, stateFilePath) {
  withUpdateStateLocked((state) => {
    state.lastUpdateAt = new Date().toISOString();
    state.lastUpdateVersion = version;
    if (!state.updateHistory) state.updateHistory = [];
    state.updateHistory.push({
      from: fromVersion,
      to: version,
      at: new Date().toISOString(),
    });
    // Keep last 20 history entries
    if (state.updateHistory.length > 20) {
      state.updateHistory = state.updateHistory.slice(-20);
    }
  }, stateFilePath);
}

/**
 * Record an update check: set lastCheckAt and lastCheckVersion.
 */
function recordCheck(latestVersion, stateFilePath) {
  withUpdateStateLocked((state) => {
    state.lastCheckAt = new Date().toISOString();
    state.lastCheckVersion = latestVersion;
  }, stateFilePath);
}

module.exports = {
  getDefaultUpdateState,
  loadUpdateState,
  saveUpdateState,
  isVersionSuppressed,
  suppressVersion,
  recordSuccessfulUpdate,
  recordCheck,
};
