# Universal Installer & Full Lifecycle CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shooter installable on any macOS machine with one command and controllable via a full lifecycle `shooter` CLI — no knowledge of pnpm, tsx, or launchd required.

**Architecture:** Three entry points (`curl|sh`, `npx`, `brew`) funnel into one setup wizard. A rewritten `bin/shooter.cjs` CLI handles start/stop/restart/status/update/logs/autostart. pnpm is used internally but invisible. A generated launcher wrapper with self-healing Node detection enables launchd auto-start.

**Tech Stack:** POSIX shell (installer), Node.js/CJS (CLI + setup wizard), corepack (pnpm bootstrapping), launchd (macOS auto-start)

**Spec:** `docs/superpowers/specs/2026-03-26-universal-installer-design.md`

---

## File Structure

### Modified files

| File                 | Responsibility                             | Changes                                                                                                    |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `bin/shooter.cjs`    | CLI entry point — all user-facing commands | Rewrite: expand from 4 to 11 commands, add PID management, pnpm resolution, launcher generation            |
| `scripts/install.sh` | `curl\|sh` bootstrap installer             | Rewrite: Node detection chain, Xcode CLT check, corepack/pnpm fallback, `~/.shooter/repo` directory layout |
| `scripts/setup.cjs`  | Interactive configuration wizard           | Modify: write `.env` to `~/.shooter/.env`, remove pnpm prerequisite check, update ROOT resolution          |
| `package.json`       | Project metadata                           | Remove `preinstall` only-allow-pnpm gate                                                                   |
| `server.ts`          | Server entry point                         | Modify: load `.env` from `~/.shooter/.env` via `SHOOTER_HOME` env var with CWD fallback                    |

### New files

| File                          | Responsibility                                              |
| ----------------------------- | ----------------------------------------------------------- |
| `scripts/homebrew/shooter.rb` | Homebrew formula skeleton for `juspay/homebrew-shooter` tap |

### Deleted files

| File                      | Why                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `scripts/start-server.sh` | Replaced by dynamically generated `~/.shooter/launcher.sh` |

> **Note:** `docs/screenshots/verify/` contains actual PNG files (command-palette.png, shortcuts-help.png). Only delete if confirmed unnecessary. The empty subdirs (after/, audit/, baseline/) can be removed.

---

## Task 1: Remove pnpm gate from package.json

**Files:**

- Modify: `package.json:46`

- [ ] **Step 1: Remove the preinstall script**

In `package.json`, change line 46 from:

```json
"preinstall": "npx only-allow pnpm",
```

to remove the line entirely. The `scripts` block should go from `"preinstall"` directly to `"postinstall"`.

```json
"scripts": {
    "postinstall": "node-gyp rebuild --directory=node_modules/node-pty || true",
```

- [ ] **Step 2: Verify pnpm still works**

Run: `pnpm install`
Expected: No errors. The `packageManager` field still exists so corepack/pnpm will still work, but npm/npx won't be blocked.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: remove preinstall pnpm-only gate

Allow npm/npx to interact with the package (needed for npx entry point).
pnpm is still the internal package manager via packageManager field."
```

---

## Task 2: Update server.ts to support external .env location

**Files:**

- Modify: `server.ts:5-6`

- [ ] **Step 1: Replace dotenv/config import with explicit path resolution**

Replace lines 5-6 of `server.ts`:

```typescript
// Load .env into process.env before anything else (adapter-node reads process.env at runtime).
import 'dotenv/config';
```

With:

```typescript
// Load .env — check SHOOTER_HOME first (set by CLI/launcher), fall back to CWD.
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const shooterHome = process.env.SHOOTER_HOME || '';
const envPath = shooterHome ? join(shooterHome, '.env') : undefined; // undefined = dotenv default (CWD/.env)

if (envPath && existsSync(envPath)) {
  config({ path: envPath });
} else {
  config(); // CWD fallback — works for local dev
}
```

- [ ] **Step 2: Verify server still starts in dev mode**

Run: `pnpm build && pnpm start`
Expected: Server starts normally on port 3000, loads `.env` from CWD (no `SHOOTER_HOME` set).

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"healthy",...}`

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: support SHOOTER_HOME env var for .env location

When SHOOTER_HOME is set (by CLI or launcher), load .env from there.
Falls back to CWD/.env for local development."
```

---

## Task 3: Rewrite bin/shooter.cjs — Core infrastructure

The CLI rewrite is large, so it's split into sub-tasks. This task builds the shared helpers and basic commands.

**Files:**

- Modify: `bin/shooter.cjs` (full rewrite)

- [ ] **Step 1: Write the complete CLI file with all commands**

Rewrite `bin/shooter.cjs` with:

```javascript
#!/usr/bin/env node

// Shooter CLI — full lifecycle management.
// Usage: shooter [command]

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn, execSync, execFileSync } = require('child_process');
const os = require('os');
const http = require('http');

// ── Paths ──────────────────────────────────────────────────────────────
const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(os.homedir(), '.shooter');
const SHOOTER_REPO = process.env.SHOOTER_REPO || path.join(SHOOTER_HOME, 'repo');
const PID_FILE = path.join(SHOOTER_HOME, 'shooter.pid');
const ENV_FILE = path.join(SHOOTER_HOME, '.env');
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Shooter');
const PLIST_LABEL = 'com.shooter.server';
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_FILE = path.join(PLIST_DIR, `${PLIST_LABEL}.plist`);
const LAUNCHER_FILE = path.join(SHOOTER_HOME, 'launcher.sh');

// If run from within the repo (dev mode), use the repo directly
const PKG_ROOT = fs.existsSync(path.join(SHOOTER_REPO, 'server.ts'))
  ? SHOOTER_REPO
  : path.resolve(__dirname, '..');

const pkg = (() => {
  try {
    return require(path.join(PKG_ROOT, 'package.json'));
  } catch {
    return { version: 'unknown' };
  }
})();

// ── ANSI helpers ───────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};
function info(msg) {
  console.log(`${C.cyan}[*]${C.reset} ${msg}`);
}
function success(msg) {
  console.log(`${C.green}[+]${C.reset} ${msg}`);
}
function warn(msg) {
  console.log(`${C.yellow}[!]${C.reset} ${msg}`);
}
function error(msg) {
  console.error(`${C.red}[-]${C.reset} ${msg}`);
}

// ── pnpm resolution (order matches spec: corepack > local > global) ──
function findPnpm() {
  // 1. Corepack (preferred — respects packageManager field)
  try {
    execSync('corepack pnpm --version', { stdio: 'pipe', cwd: PKG_ROOT });
    return { cmd: 'corepack', prefix: ['pnpm'] };
  } catch {
    /* continue */
  }
  // 2. Local node_modules (always available after first install)
  const local = path.join(PKG_ROOT, 'node_modules', '.bin', 'pnpm');
  if (fs.existsSync(local)) return { cmd: local, prefix: [] };
  // 3. Global pnpm
  try {
    execSync('pnpm --version', { stdio: 'pipe' });
    return { cmd: 'pnpm', prefix: [] };
  } catch {
    /* continue */
  }
  return null;
}

function runPnpm(args, opts = {}) {
  const pnpm = findPnpm();
  if (!pnpm) {
    error('pnpm not found. Run: shooter setup');
    process.exit(1);
  }
  const spawnArgs = [...pnpm.prefix, ...args];
  return execFileSync(pnpm.cmd, spawnArgs, {
    cwd: PKG_ROOT,
    stdio: opts.silent ? 'pipe' : 'inherit',
    env: { ...process.env, SHOOTER_HOME },
    encoding: 'utf-8',
    ...opts,
  });
}

// ── PID management ────────────────────────────────────────────────────
function readPid() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writePid(pid, port) {
  const data = JSON.stringify({ pid, startedAt: new Date().toISOString(), port });
  const tmp = PID_FILE + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, PID_FILE);
}

function removePid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isShooterProcess(pid) {
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim();
    return cmd.includes('server.ts') || cmd.includes('tsx') || cmd.includes('shooter');
  } catch {
    return false;
  }
}

function readEnvPort() {
  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    const match = envContent.match(/^PORT=(\d+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isLaunchdManaged() {
  try {
    execSync(`launchctl list ${PLIST_LABEL}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Commands ──────────────────────────────────────────────────────────

function cmdStart() {
  // Check if already running
  const pidInfo = readPid();
  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    error(`Server already running (PID ${pidInfo.pid}).`);
    info('Use: shooter restart');
    process.exit(1);
  }
  if (isLaunchdManaged()) {
    warn(
      'Server is managed by launchd. Use: launchctl kickstart -k gui/$(id -u)/com.shooter.server'
    );
    warn('Or disable with: shooter autostart off');
    process.exit(1);
  }

  const serverEntry = path.join(PKG_ROOT, 'server.ts');
  if (!fs.existsSync(serverEntry)) {
    error(`server.ts not found at ${serverEntry}`);
    error('Run: shooter setup');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(PKG_ROOT, 'build', 'handler.js'))) {
    info('Build not found. Building...');
    runPnpm(['build']);
  }

  // Read PORT from .env if not already in environment
  const port = process.env.PORT || readEnvPort() || '3000';

  // Check if port is already in use
  try {
    const lsof = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
    if (lsof) {
      error(`Port ${port} is already in use (PID ${lsof}).`);
      info(`Try: Set PORT=${parseInt(port) + 1} in ${ENV_FILE}`);
      info(`Or:  lsof -i :${port}  (to find what's using it)`);
      process.exit(1);
    }
  } catch {
    /* lsof returns non-zero if nothing found — that's good */
  }
  info(`Starting Shooter on port ${port}...`);

  const child = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env: { ...process.env, SHOOTER_HOME, SHOOTER_PKG_ROOT: PKG_ROOT },
  });

  writePid(child.pid, parseInt(port, 10));

  child.on('error', (err) => {
    error(`Failed to start: ${err.message}`);
    removePid();
    process.exit(1);
  });

  child.on('exit', (code) => {
    removePid();
    process.exit(code ?? 0);
  });

  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}

function cmdStop() {
  if (isLaunchdManaged()) {
    info('Stopping via launchd...');
    try {
      execSync(`launchctl bootout gui/$(id -u)/${PLIST_LABEL}`, { stdio: 'inherit' });
      success('Server stopped (launchd service removed).');
    } catch {
      error('Failed to stop launchd service.');
    }
    removePid();
    return;
  }

  const pidInfo = readPid();
  if (!pidInfo) {
    warn('No PID file found. Server may not be running.');
    return;
  }

  if (!isProcessAlive(pidInfo.pid)) {
    warn(`Process ${pidInfo.pid} is not running. Cleaning up stale PID file.`);
    removePid();
    return;
  }

  if (!isShooterProcess(pidInfo.pid)) {
    error(
      `PID ${pidInfo.pid} is not a Shooter process. Refusing to kill. Removing stale PID file.`
    );
    removePid();
    return;
  }

  info(`Stopping server (PID ${pidInfo.pid})...`);
  process.kill(pidInfo.pid, 'SIGTERM');

  // Wait up to 10s for graceful shutdown
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    if (!isProcessAlive(pidInfo.pid)) {
      clearInterval(check);
      removePid();
      success('Server stopped.');
    } else if (attempts > 20) {
      clearInterval(check);
      warn('Server did not stop gracefully. Sending SIGKILL...');
      try {
        process.kill(pidInfo.pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
      removePid();
      success('Server killed.');
    }
  }, 500);
}

function cmdRestart() {
  const pidInfo = readPid();
  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    if (!isShooterProcess(pidInfo.pid)) {
      error(`PID ${pidInfo.pid} is not a Shooter process. Removing stale PID file.`);
      removePid();
    } else {
      info(`Stopping server (PID ${pidInfo.pid})...`);
      process.kill(pidInfo.pid, 'SIGTERM');
      // Wait for exit (up to 10s)
      const deadline = Date.now() + 10000;
      while (isProcessAlive(pidInfo.pid) && Date.now() < deadline) {
        execSync('sleep 0.5');
      }
      if (isProcessAlive(pidInfo.pid)) {
        warn('Graceful stop timed out. Sending SIGKILL...');
        try {
          process.kill(pidInfo.pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
      removePid();
    }
  }
  cmdStart();
}

function cmdStatus() {
  console.log(`${C.bold}Shooter v${pkg.version}${C.reset}`);
  console.log(`  Install: ${PKG_ROOT}`);
  console.log(`  Data:    ${SHOOTER_HOME}`);

  // Node version
  const nodeVersion = process.versions.node;
  console.log(`  Node:    v${nodeVersion} (${process.execPath})`);

  // Running state
  if (isLaunchdManaged()) {
    console.log(`  Status:  ${C.green}running${C.reset} (managed by launchd)`);
  } else {
    const pidInfo = readPid();
    if (pidInfo && isProcessAlive(pidInfo.pid)) {
      const uptime = Math.floor((Date.now() - new Date(pidInfo.startedAt).getTime()) / 1000);
      const hours = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      console.log(
        `  Status:  ${C.green}running${C.reset} (PID ${pidInfo.pid}, port ${pidInfo.port})`
      );
      console.log(`  Uptime:  ${hours}h ${mins}m`);
    } else {
      console.log(`  Status:  ${C.red}stopped${C.reset}`);
      if (pidInfo) removePid(); // clean stale
    }
  }

  // Health check
  const port = process.env.PORT || '3000';
  const req = http.get(`http://localhost:${port}/api/health`, (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`  Health:  ${C.green}${data.status}${C.reset}`);
      } catch {
        console.log(`  Health:  ${C.yellow}unknown${C.reset}`);
      }
    });
  });
  req.on('error', () => {
    console.log(`  Health:  ${C.red}unreachable${C.reset}`);
  });
  req.setTimeout(3000, () => {
    req.destroy();
    console.log(`  Health:  ${C.red}timeout${C.reset}`);
  });

  // Log sizes
  for (const name of ['stdout.log', 'stderr.log']) {
    const logPath = path.join(LOG_DIR, name);
    try {
      const stat = fs.statSync(logPath);
      const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
      console.log(`  ${name}: ${sizeMB} MB`);
    } catch {
      /* no log file */
    }
  }
}

function cmdSetup() {
  // npx bootstrapper: if ~/.shooter/repo doesn't exist, clone it first
  if (!fs.existsSync(path.join(SHOOTER_REPO, 'server.ts'))) {
    info('Shooter not installed yet. Cloning...');
    fs.mkdirSync(SHOOTER_HOME, { recursive: true });
    try {
      execSync(
        `git clone --branch release --single-branch https://github.com/juspay/shooter.git "${SHOOTER_REPO}"`,
        { stdio: 'inherit' }
      );
      success(`Cloned to ${SHOOTER_REPO}`);
    } catch (e) {
      error(`Clone failed: ${e.message}`);
      info(
        'Try: curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh | sh'
      );
      process.exit(1);
    }

    // Bootstrap pnpm and install
    info('Installing dependencies...');
    try {
      execSync('corepack enable', { stdio: 'pipe' });
    } catch {
      try {
        execSync('npm install -g pnpm', { stdio: 'pipe' });
      } catch {
        /* will use local */
      }
    }
    execSync('pnpm install', { cwd: SHOOTER_REPO, stdio: 'inherit' });
  }

  const repoRoot = fs.existsSync(path.join(SHOOTER_REPO, 'scripts', 'setup.cjs'))
    ? SHOOTER_REPO
    : PKG_ROOT;
  const setupScript = path.join(repoRoot, 'scripts', 'setup.cjs');

  if (!fs.existsSync(setupScript)) {
    error(`Setup wizard not found at ${setupScript}`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [setupScript], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, SHOOTER_HOME, SHOOTER_PKG_ROOT: repoRoot },
  });
  child.on('error', (err) => {
    error(`Setup failed: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function cmdUpdate() {
  info('Checking for updates...');

  // Check for dirty state
  let didStash = false;
  try {
    const status = execSync('git status --porcelain', { cwd: PKG_ROOT, encoding: 'utf-8' }).trim();
    if (status) {
      warn('Working directory has local changes. Stashing...');
      execSync('git stash', { cwd: PKG_ROOT, stdio: 'inherit' });
      didStash = true;
    }
  } catch (e) {
    error(`Git check failed: ${e.message}`);
    process.exit(1);
  }

  // Pull
  info('Pulling latest changes...');
  try {
    execSync('git pull --rebase', { cwd: PKG_ROOT, stdio: 'inherit' });
  } catch {
    error('Git pull failed. Aborting rebase...');
    try {
      execSync('git rebase --abort', { cwd: PKG_ROOT, stdio: 'pipe' });
    } catch {
      /* ignore */
    }
    if (didStash) {
      try {
        execSync('git stash pop', { cwd: PKG_ROOT, stdio: 'pipe' });
      } catch {
        /* ignore */
      }
    }
    process.exit(1);
  }

  // Pop stash if we stashed
  if (didStash) {
    try {
      execSync('git stash pop', { cwd: PKG_ROOT, stdio: 'pipe' });
    } catch {
      /* ignore */
    }
  }

  // Install + build
  info('Installing dependencies...');
  runPnpm(['install']);
  info('Building...');
  runPnpm(['build']);

  // Re-read version after update (pkg was cached at module load time)
  const updatedVersion = (() => {
    try {
      return require(path.join(PKG_ROOT, 'package.json')).version;
    } catch {
      return pkg.version;
    }
  })();
  success(`Updated to v${updatedVersion}`);

  // Restart if running
  const pidInfo = readPid();
  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    info('Restarting server...');
    cmdRestart();
  } else if (isLaunchdManaged()) {
    info('Restarting via launchd...');
    try {
      execSync(`launchctl kickstart -k gui/$(id -u)/${PLIST_LABEL}`, { stdio: 'inherit' });
      success('Server restarted.');
    } catch {
      warn('Could not restart launchd service. Run: shooter restart');
    }
  }
}

function cmdLogs() {
  const args = process.argv.slice(3);
  const follow = args.includes('--follow') || args.includes('-f');
  const clear = args.includes('--clear');

  if (clear) {
    for (const name of ['stdout.log', 'stderr.log']) {
      const logPath = path.join(LOG_DIR, name);
      try {
        fs.writeFileSync(logPath, '', 'utf-8');
      } catch {
        /* ignore */
      }
    }
    success('Logs cleared.');
    return;
  }

  const stdoutLog = path.join(LOG_DIR, 'stdout.log');
  const stderrLog = path.join(LOG_DIR, 'stderr.log');

  if (!fs.existsSync(stdoutLog) && !fs.existsSync(stderrLog)) {
    warn('No log files found at ' + LOG_DIR);
    info('Logs are created when using: shooter autostart on');
    return;
  }

  if (follow) {
    const child = spawn('tail', ['-f', stdoutLog, stderrLog], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    process.on('SIGINT', () => {
      child.kill();
      process.exit(0);
    });
  } else {
    // Show last 50 lines
    try {
      const output = execSync(`tail -n 50 ${stdoutLog} ${stderrLog}`, { encoding: 'utf-8' });
      console.log(output);
    } catch {
      warn('Could not read log files.');
    }
  }
}

function cmdAutostartOn() {
  // Always point to ~/.shooter/repo for autostart, not a dev checkout
  const repoForLauncher = fs.existsSync(path.join(SHOOTER_REPO, 'server.ts'))
    ? SHOOTER_REPO
    : PKG_ROOT;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(PLIST_DIR, { recursive: true });

  // Detect current Node path for fast path
  const nodeBin = process.execPath;

  // Generate launcher.sh
  const launcherContent = `#!/bin/bash
# Auto-generated by shooter autostart — do not edit manually
# Regenerate with: shooter autostart on

SHOOTER_HOME="$HOME/.shooter"
SHOOTER_REPO="${repoForLauncher}"

# ── Source environment ──
set -a
[ -f "$SHOOTER_HOME/.env" ] && source "$SHOOTER_HOME/.env"
set +a

cd "$SHOOTER_REPO"
export SHOOTER_HOME

# ── Fast path: hardcoded Node (set at install time) ──
NODE_BIN="${nodeBin}"

if [ -x "$NODE_BIN" ]; then
    NODE_VERSION=$("$NODE_BIN" --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [ -n "$NODE_VERSION" ] && [ "$NODE_VERSION" -ge 20 ] 2>/dev/null; then
        export PATH="$(dirname "$NODE_BIN"):$SHOOTER_REPO/node_modules/.bin:$PATH"
        exec "$SHOOTER_REPO/node_modules/.bin/tsx" "$SHOOTER_REPO/server.ts"
    else
        echo "$(date): WARN — Node at $NODE_BIN is version $NODE_VERSION (need 20+), trying fallback chain..." >&2
    fi
fi

# ── Self-healing fallback: detection chain ──
check_node_version() {
    local candidate="$1"
    local ver
    ver=$("$candidate" --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    [ -n "$ver" ] && [ "$ver" -ge 20 ] 2>/dev/null
}

find_node() {
    local candidate
    candidate="$(command -v node 2>/dev/null)"
    [ -n "$candidate" ] && check_node_version "$candidate" && { echo "$candidate"; return; }
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
        candidate="$(command -v node 2>/dev/null)"
        [ -n "$candidate" ] && check_node_version "$candidate" && { echo "$candidate"; return; }
    fi
    if command -v fnm >/dev/null 2>&1; then
        eval "$(fnm env)"
        candidate="$(command -v node 2>/dev/null)"
        [ -n "$candidate" ] && check_node_version "$candidate" && { echo "$candidate"; return; }
    fi
    [ -x "$HOME/.volta/bin/node" ] && check_node_version "$HOME/.volta/bin/node" && { echo "$HOME/.volta/bin/node"; return; }
    [ -x "/opt/homebrew/bin/node" ] && check_node_version "/opt/homebrew/bin/node" && { echo "/opt/homebrew/bin/node"; return; }
    [ -x "/usr/local/bin/node" ] && check_node_version "/usr/local/bin/node" && { echo "/usr/local/bin/node"; return; }
}

FOUND_NODE="$(find_node)"
if [ -z "$FOUND_NODE" ]; then
    echo "$(date): FATAL — No Node.js >= 20 found. Run 'shooter autostart on' to regenerate." >&2
    exit 1
fi

export PATH="$(dirname "$FOUND_NODE"):$SHOOTER_REPO/node_modules/.bin:$PATH"
exec "$SHOOTER_REPO/node_modules/.bin/tsx" "$SHOOTER_REPO/server.ts"
`;

  fs.writeFileSync(LAUNCHER_FILE, launcherContent, { mode: 0o755 });
  success(`Generated ${LAUNCHER_FILE}`);

  // Generate plist
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${LAUNCHER_FILE}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${repoForLauncher}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
`;

  fs.writeFileSync(PLIST_FILE, plistContent);
  success(`Generated ${PLIST_FILE}`);

  // Load the service
  try {
    execSync(`launchctl bootout gui/$(id -u)/${PLIST_LABEL} 2>/dev/null || true`, {
      stdio: 'pipe',
    });
  } catch {
    /* ignore */
  }
  try {
    execSync(`launchctl bootstrap gui/$(id -u) ${PLIST_FILE}`, { stdio: 'inherit' });
    success('Shooter will start automatically on login.');
    info(`  Logs:    ${LOG_DIR}/`);
    info(`  Stop:    shooter autostart off`);
    info(`  Restart: launchctl kickstart -k gui/$(id -u)/${PLIST_LABEL}`);
  } catch (e) {
    error(`Failed to load launchd service: ${e.message}`);
  }
}

function cmdAutostartOff() {
  try {
    execSync(`launchctl bootout gui/$(id -u)/${PLIST_LABEL}`, { stdio: 'pipe' });
    success('Launchd service stopped.');
  } catch {
    warn('Launchd service was not running.');
  }

  for (const f of [PLIST_FILE, LAUNCHER_FILE]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  success('Auto-start disabled. Files cleaned up.');
}

function cmdVersion() {
  console.log(`shooter v${pkg.version}`);
  console.log(`node ${process.version}`);
  console.log(`install ${PKG_ROOT}`);
  console.log(`data ${SHOOTER_HOME}`);
}

function cmdHelp() {
  console.log(
    `
${C.bold}Shooter v${pkg.version}${C.reset}

${C.bold}Usage:${C.reset} shooter [command]

${C.bold}Commands:${C.reset}
  start           Start the server (foreground)
  stop            Stop the running server
  restart         Restart the server
  status          Show server status, health, and logs info
  setup           Run the interactive setup wizard
  update          Pull latest, rebuild, restart if running
  logs            Show recent logs (--follow for live, --clear to truncate)
  autostart on    Enable auto-start on login (launchd)
  autostart off   Disable auto-start
  version         Show version and paths
  help            Show this help

${C.bold}Examples:${C.reset}
  shooter                  Start the server
  shooter status           Check if running
  shooter logs -f          Follow live logs
  shooter autostart on     Start on login
`.trim()
  );
}

// ── Main router ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'start';

switch (command) {
  case 'start':
    cmdStart();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'restart':
    cmdRestart();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'setup':
    cmdSetup();
    break;
  case 'update':
    cmdUpdate();
    break;
  case 'logs':
    cmdLogs();
    break;
  case 'autostart':
    if (args[1] === 'on') cmdAutostartOn();
    else if (args[1] === 'off') cmdAutostartOff();
    else {
      error('Usage: shooter autostart on|off');
      process.exit(1);
    }
    break;
  case 'version':
  case '--version':
  case '-v':
    cmdVersion();
    break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  default:
    error(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
```

- [ ] **Step 2: Verify the CLI loads without errors**

Run: `node bin/shooter.cjs help`
Expected: Shows the help text with all commands listed.

Run: `node bin/shooter.cjs version`
Expected: Shows version, node version, install path, data path.

- [ ] **Step 3: Test shooter start + stop cycle**

Run: `node bin/shooter.cjs start` (in one terminal)
Expected: Server starts, PID file created at `~/.shooter/shooter.pid`.

In another terminal:
Run: `node bin/shooter.cjs status`
Expected: Shows running with PID and uptime.

Run: `node bin/shooter.cjs stop`
Expected: Server stops gracefully, PID file removed.

- [ ] **Step 4: Test autostart on/off**

Run: `node bin/shooter.cjs autostart on`
Expected: Generates `~/.shooter/launcher.sh` and `~/Library/LaunchAgents/com.shooter.server.plist`, loads the service.

Run: `node bin/shooter.cjs autostart off`
Expected: Removes plist and launcher, stops launchd service.

- [ ] **Step 5: Commit**

```bash
git add bin/shooter.cjs
git commit -m "feat: rewrite shooter CLI with full lifecycle management

Commands: start, stop, restart, status, setup, update, logs, autostart
on/off, version, help. PID tracking with atomic writes and process
verification. pnpm resolution cascade. Self-healing launcher wrapper
generation for launchd auto-start."
```

---

## Task 4: Update setup.cjs for new directory layout

**Files:**

- Modify: `scripts/setup.cjs:36-37` (ROOT and DOT_ENV_PATH)
- Modify: `scripts/setup.cjs:103-141` (checkPrerequisites — remove pnpm hard check)
- Modify: `scripts/setup.cjs:339-356` (writeEnv — path to `~/.shooter/.env`)

- [ ] **Step 1: Update ROOT and DOT_ENV_PATH constants**

In `scripts/setup.cjs`, change lines 36-37:

From:

```javascript
const ROOT = path.resolve(__dirname, '..');
const DOT_ENV_PATH = path.join(ROOT, '.env');
```

To:

```javascript
const ROOT = process.env.SHOOTER_PKG_ROOT || path.resolve(__dirname, '..');
const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(require('os').homedir(), '.shooter');
const DOT_ENV_PATH = path.join(SHOOTER_HOME, '.env');
```

- [ ] **Step 2: Soften the pnpm prerequisite check**

In `scripts/setup.cjs`, lines 116-123 check for pnpm and `process.exit(1)` if missing. Change to a warning instead:

From:

```javascript
try {
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
  console.log(green(`  pnpm v${pnpmVersion}`));
} catch {
  console.log(red('  pnpm is not installed.'));
  console.log(dim('  Install it: npm install -g pnpm'));
  process.exit(1);
}
```

To:

```javascript
// pnpm check — soft (installer or CLI handle pnpm resolution)
try {
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
  console.log(green(`  pnpm v${pnpmVersion}`));
} catch {
  console.log(yellow('  pnpm not found globally (will use local or corepack)'));
}
```

- [ ] **Step 3: Ensure SHOOTER_HOME directory exists before writing .env**

In the `writeEnv` function (around line 339), add directory creation before writing:

Add before `fs.writeFileSync(DOT_ENV_PATH, content, 'utf-8');`:

```javascript
// Ensure ~/.shooter/ directory exists
const envDir = path.dirname(DOT_ENV_PATH);
if (!fs.existsSync(envDir)) {
  fs.mkdirSync(envDir, { recursive: true });
}
```

- [ ] **Step 4: Update user-facing strings to use `shooter` CLI**

In `scripts/setup.cjs`, update the final output messages (around lines 553-561):

Change:

```javascript
console.log(`  Start the server:  ${cyan('pnpm start')}`);
console.log(`  Dev mode:          ${cyan('pnpm dev')}`);
```

To:

```javascript
console.log(`  Start the server:  ${cyan('shooter start')}`);
console.log(`  Status:            ${cyan('shooter status')}`);
```

And change:

```javascript
console.log(dim('  Run pnpm setup again to add iOS or Android push notifications.'));
```

To:

```javascript
console.log(dim('  Run shooter setup again to add iOS or Android push notifications.'));
```

- [ ] **Step 5: Verify setup wizard runs with new paths**

Run: `SHOOTER_HOME=~/.shooter node scripts/setup.cjs`
Expected: Wizard starts, prerequisites pass (pnpm check is soft), offers to write `.env` to `~/.shooter/.env`.

Press Ctrl+C to exit after verifying the paths look correct.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup.cjs
git commit -m "feat: update setup wizard for ~/.shooter directory layout

.env now writes to SHOOTER_HOME (~/.shooter/) instead of repo root.
pnpm check is now a soft warning (CLI handles resolution).
User-facing strings now reference shooter CLI instead of pnpm.
ROOT resolves from SHOOTER_PKG_ROOT env var."
```

---

## Task 5: Rewrite install.sh with Node detection chain

**Files:**

- Modify: `scripts/install.sh` (significant rewrite)

- [ ] **Step 1: Rewrite the installer**

Replace the entire contents of `scripts/install.sh` with the new version that includes:

1. **Xcode CLT check** — `xcode-select -p` early, offer `xcode-select --install` if missing
2. **Node detection chain** — PATH -> nvm -> fnm -> volta -> Homebrew common paths -> `brew install node` fallback
3. **Version check** — each candidate checked for >= 20
4. **corepack/pnpm bootstrap** — try `corepack enable`, fall back to `npm install -g pnpm`, fall back to `npx pnpm`
5. **Clone to `~/.shooter/repo`** — separate code from data
6. **Create `~/.shooter/` data dir** — mkdir if needed
7. **Updated `handle_existing()`** — only `rm -rf ~/.shooter/repo`, never touch `~/.shooter/.env` or `~/.shooter/shooter.db`
8. **Global CLI link** — symlink `bin/shooter.cjs` to `~/.local/bin/shooter`

Key functions to add/modify:

```bash
# ── Xcode CLT check ─────────────────────────────────────────────────
check_xcode_clt() {
    if ! xcode-select -p >/dev/null 2>&1; then
        warn "Xcode Command Line Tools are required for native modules (node-pty, better-sqlite3)."
        if ask_yes_no "  Install Xcode Command Line Tools now?" "y"; then
            info "Running xcode-select --install..."
            xcode-select --install 2>/dev/null
            info "Follow the system dialog to complete installation, then re-run this script."
            exit 0
        else
            error "Cannot continue without Xcode Command Line Tools."
            exit 1
        fi
    fi
    success "Xcode Command Line Tools installed"
}

# ── Node detection chain ────────────────────────────────────────────
check_node_version() {
    candidate="$1"
    ver="$("$candidate" --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    [ -n "$ver" ] && [ "$ver" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null
}

find_node() {
    # 1. PATH
    candidate="$(command -v node 2>/dev/null)"
    if [ -n "$candidate" ] && check_node_version "$candidate"; then
        printf '%s' "$candidate"
        return 0
    fi

    # 2. nvm
    NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        candidate="$(command -v node 2>/dev/null)"
        if [ -n "$candidate" ] && check_node_version "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    fi

    # 3. fnm
    if command -v fnm >/dev/null 2>&1; then
        eval "$(fnm env 2>/dev/null)"
        candidate="$(command -v node 2>/dev/null)"
        if [ -n "$candidate" ] && check_node_version "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    fi

    # 4. volta
    if [ -x "$HOME/.volta/bin/node" ] && check_node_version "$HOME/.volta/bin/node"; then
        printf '%s' "$HOME/.volta/bin/node"
        return 0
    fi

    # 5. Homebrew (installed but not linked)
    for brew_node in /opt/homebrew/bin/node /usr/local/bin/node; do
        if [ -x "$brew_node" ] && check_node_version "$brew_node"; then
            printf '%s' "$brew_node"
            return 0
        fi
    done

    return 1
}

check_node() {
    NODE_BIN="$(find_node)"
    if [ -n "$NODE_BIN" ]; then
        node_version="$("$NODE_BIN" --version)"
        success "Node.js $node_version ($NODE_BIN)"
        export PATH="$(dirname "$NODE_BIN"):$PATH"
        return 0
    fi

    # Fallback: install via Homebrew
    if command -v brew >/dev/null 2>&1; then
        warn "Node.js >= $REQUIRED_NODE_MAJOR not found."
        if ask_yes_no "  Install Node.js via Homebrew?" "y"; then
            info "Installing Node.js..."
            brew install node
            NODE_BIN="$(command -v node)"
            if [ -n "$NODE_BIN" ] && check_node_version "$NODE_BIN"; then
                success "Node.js $("$NODE_BIN" --version) (installed via Homebrew)"
                return 0
            fi
        fi
    fi

    error "Node.js >= $REQUIRED_NODE_MAJOR is required."
    printf '  Install from: https://nodejs.org\n'
    exit 1
}
```

Update `SHOOTER_DIR` references:

```bash
SHOOTER_HOME="$HOME/.shooter"
SHOOTER_REPO="$SHOOTER_HOME/repo"
```

Update `handle_existing()` to only touch `$SHOOTER_REPO`, never `$SHOOTER_HOME` root.

Update `clone_repo()` to clone into `$SHOOTER_REPO`.

Update `install_deps()` to `cd "$SHOOTER_REPO" && pnpm install`.

Add bootstrap_pnpm():

```bash
bootstrap_pnpm() {
    # Try corepack first
    if command -v corepack >/dev/null 2>&1; then
        if corepack enable 2>/dev/null; then
            success "pnpm enabled via corepack"
            return 0
        fi
    fi

    # Try npm install -g pnpm
    if command -v npm >/dev/null 2>&1; then
        info "Installing pnpm via npm..."
        npm install -g pnpm 2>/dev/null
        if command -v pnpm >/dev/null 2>&1; then
            success "pnpm $(pnpm --version) (installed via npm)"
            return 0
        fi
    fi

    # Will use npx pnpm as last resort during install
    warn "pnpm not available globally. Will use npx pnpm."
    return 0
}
```

Update `offer_global_command()` to symlink to `~/.local/bin/`:

```bash
offer_global_command() {
    step "Global command"
    BIN_DIR="$HOME/.local/bin"
    SHOOTER_BIN="$BIN_DIR/shooter"

    if [ -x "$SHOOTER_BIN" ]; then
        success "'shooter' command already linked."
        return
    fi

    if ask_yes_no "  Install 'shooter' as a global command?" "y"; then
        mkdir -p "$BIN_DIR"
        ln -sf "$SHOOTER_REPO/bin/shooter.cjs" "$SHOOTER_BIN"
        chmod +x "$SHOOTER_BIN"
        success "'shooter' linked to $SHOOTER_BIN"

        # Check if ~/.local/bin is in PATH
        case ":$PATH:" in
            *":$BIN_DIR:"*) ;;
            *)
                warn "$BIN_DIR is not in your PATH."
                info "Add to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
                ;;
        esac
    fi
}
```

- [ ] **Step 2: Test the installer locally (dry run)**

Run: `bash scripts/install.sh` (will detect existing install, choose "Update")
Expected: Finds Node, checks Xcode CLT, bootstraps pnpm, pulls latest, runs setup wizard.

- [ ] **Step 3: Test Node detection with nvm disabled**

Run: `bash -c 'unset NVM_DIR; PATH="/usr/bin:/bin:/usr/sbin:/sbin" bash scripts/install.sh'`
Expected: Falls through PATH check, tries nvm/fnm/volta, finds Homebrew node, or offers to install.

- [ ] **Step 4: Commit**

```bash
git add scripts/install.sh
git commit -m "feat: rewrite installer with Node detection chain and directory separation

Supports nvm, fnm, volta, Homebrew, direct installs. Checks Xcode CLT.
Bootstraps pnpm via corepack with fallbacks. Clones to ~/.shooter/repo,
data stays in ~/.shooter/. Global CLI linked to ~/.local/bin/shooter."
```

---

## Task 6: Delete obsolete files

**Files:**

- Delete: `scripts/start-server.sh`
- Delete: `docs/screenshots/after/`, `docs/screenshots/audit/`, `docs/screenshots/baseline/` (empty dirs)
- Keep: `docs/screenshots/verify/` (contains actual PNGs — command-palette.png, shortcuts-help.png)

- [ ] **Step 1: Remove the files**

```bash
rm -f scripts/start-server.sh
rmdir docs/screenshots/after docs/screenshots/audit docs/screenshots/baseline 2>/dev/null || true
```

- [ ] **Step 2: Verify nothing references start-server.sh**

Run: `grep -r 'start-server.sh' . --include='*.ts' --include='*.js' --include='*.cjs' --include='*.md' | grep -v node_modules`
Expected: No references (may appear in this plan/spec only).

- [ ] **Step 3: Commit**

```bash
git rm -f scripts/start-server.sh
git commit -m "chore: remove obsolete start-server.sh

Replaced by dynamically generated ~/.shooter/launcher.sh via shooter autostart on."
```

---

## Task 7: Create Homebrew formula skeleton

**Files:**

- Create: `scripts/homebrew/shooter.rb`

- [ ] **Step 1: Create the formula**

```ruby
# Homebrew formula for Shooter
# To use: brew tap juspay/shooter && brew install shooter

class Shooter < Formula
  desc "Mobile-first dev notifications & remote terminal for Claude Code"
  homepage "https://github.com/juspay/shooter"
  url "https://github.com/juspay/shooter/archive/refs/tags/v1.0.0.tar.gz"
  # sha256 "UPDATE_WITH_REAL_SHA"
  license "MIT"

  depends_on "node@22"

  def install
    # Enable corepack for pnpm
    system "corepack", "enable"
    system "corepack", "prepare", "pnpm@10.28.2", "--activate"

    # Install dependencies and build
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "build"

    # Install to libexec (keeps node_modules contained)
    libexec.install Dir["*"]

    # Create wrapper script
    (bin/"shooter").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/bin/shooter.cjs" "$@"
    EOS
  end

  def post_install
    ohai "Run 'shooter setup' to configure Shooter"
  end

  service do
    run [opt_bin/"shooter", "start"]
    keep_alive crashed: true
    log_path var/"log/shooter/stdout.log"
    error_log_path var/"log/shooter/stderr.log"
    working_dir var/"lib/shooter"
  end

  test do
    assert_match "shooter v", shell_output("#{bin}/shooter version")
  end
end
```

- [ ] **Step 2: Commit**

```bash
mkdir -p scripts/homebrew
git add scripts/homebrew/shooter.rb
git commit -m "feat: add Homebrew formula skeleton

Template for juspay/homebrew-shooter tap. Uses node@22 dep,
corepack for pnpm, and the shooter CLI wrapper."
```

---

## Task 8: Integration test — full install flow

- [ ] **Step 1: Test the full CLI lifecycle**

```bash
# Build first
pnpm build

# Test help
node bin/shooter.cjs help

# Test version
node bin/shooter.cjs version

# Test status when stopped
node bin/shooter.cjs status

# Test start (background it for testing)
node bin/shooter.cjs start &
sleep 3

# Test status when running
node bin/shooter.cjs status

# Test health
curl -s http://localhost:3000/api/health | head -1

# Test stop
node bin/shooter.cjs stop

# Verify stopped
node bin/shooter.cjs status
```

- [ ] **Step 2: Test autostart cycle**

```bash
# Enable autostart
node bin/shooter.cjs autostart on

# Verify files exist
ls -la ~/.shooter/launcher.sh
ls -la ~/Library/LaunchAgents/com.shooter.server.plist

# Verify launcher is executable
file ~/.shooter/launcher.sh

# Check launchd loaded it
launchctl list | grep com.shooter.server

# Disable autostart
node bin/shooter.cjs autostart off

# Verify cleanup
ls ~/Library/LaunchAgents/com.shooter.server.plist 2>&1 || echo "plist removed"
ls ~/.shooter/launcher.sh 2>&1 || echo "launcher removed"
```

- [ ] **Step 3: Test update command**

```bash
node bin/shooter.cjs update
```

Expected: Pulls, installs, builds, reports version.

- [ ] **Step 4: Final commit with any fixes**

If any issues were found and fixed during testing:

```bash
git add -A
git commit -m "fix: integration test fixes for CLI lifecycle"
```
