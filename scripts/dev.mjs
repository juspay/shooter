#!/usr/bin/env node
// Dev orchestrator — mirrors exactly what `shooter start` does for users.
//
// Differences from the global server:
//   PORT        54006  (vs 54007 for global)
//   SHOOTER_HOME  ~/.shooter-dev  (isolated PID, DB, logs, tunnel URL)
//
// API key handling:
//   Dev key  = <hostname><4hex>, generated once, persisted in ~/.shooter-dev/.env
//   Global key (shooter2024) in ~/.zshrc is NEVER touched.
//   The dev key is passed explicitly as API_KEY to the server child process,
//   overriding whatever the shell has exported.
//
// Other env/credentials (NeuroLink keys etc.) fall through from project .env
// and ~/.shooter/.env — but never override API_KEY.
//
// On source change: kill server → vite build → restart server → tunnel stays up.

import { spawn, execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { createRequire } from 'module';
import { watch } from 'chokidar';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const DEV_HOME = join(homedir(), '.shooter-dev');
const LOG_DIR = join(DEV_HOME, 'logs');
const TUNNEL_URL_FILE = join(DEV_HOME, '.tunnel_url');
const PORT = 54006;

const _require = createRequire(import.meta.url);
const _crypto = _require('crypto');
const _os = _require('os');

mkdirSync(LOG_DIR, { recursive: true });

// ── Dev API key: generate once, persist, reuse forever ───────────────
// Stored in ~/.shooter-dev/.env — never touches global ~/.shooter/.env
// or ~/.zshrc. Passed as API_KEY env var to server child process.

const devEnvPath = join(DEV_HOME, '.env');

function makeApiKey() {
  const name =
    _os
      .hostname()
      .toLowerCase()
      .replace(/\.local$/, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
      .split(' ')
      .filter((p) => /^[a-z]+$/.test(p))
      .join('')
      .slice(0, 20) || 'shooter';
  const suffix = _crypto.randomBytes(16).toString('hex'); // 128 bits of entropy
  return `${name}-${suffix}`;
}

function isWeakKey(key) {
  // Reject previously generated short keys: <name><4hex> had no hyphen and
  // a trailing ≤4 hex-char suffix. Keys generated now have 32 hex chars
  // separated by a hyphen, which passes this check.
  return !key.includes('-') || !/-[a-f0-9]{32,}$/.test(key);
}

function getOrCreateDevApiKey() {
  if (existsSync(devEnvPath)) {
    const match = readFileSync(devEnvPath, 'utf-8').match(/^API_KEY=(.+)$/m);
    if (match && match[1].trim() && !isWeakKey(match[1].trim())) {
      return match[1].trim();
    }
  }
  const key = makeApiKey();
  const existing = existsSync(devEnvPath) ? readFileSync(devEnvPath, 'utf-8') : '';
  writeFileSync(devEnvPath, `${existing.trimEnd()}\nAPI_KEY=${key}\n`.trimStart());
  return key;
}

const DEV_API_KEY = getOrCreateDevApiKey();

// Load remaining env vars (NeuroLink keys etc.) from project .env and
// ~/.shooter/.env — but never let them override API_KEY.
dotenvConfig({ path: join(PKG_ROOT, '.env') });
dotenvConfig({ override: false, path: join(homedir(), '.shooter', '.env') });

// ── Helpers ───────────────────────────────────────────────────────────

function isCloudflaredAvailable() {
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function dim(s) {
  return `\x1b[2m${s}\x1b[0m`;
}
function green(s) {
  return `\x1b[32m${s}\x1b[0m`;
}
function yellow(s) {
  return `\x1b[33m${s}\x1b[0m`;
}
function cyan(s) {
  return `\x1b[36m${s}\x1b[0m`;
}
function bold(s) {
  return `\x1b[1m${s}\x1b[0m`;
}

function log(msg) {
  console.log(`${dim('[dev]')} ${msg}`);
}

// ── Build ─────────────────────────────────────────────────────────────

async function build() {
  log('Building...');
  return new Promise((resolve, reject) => {
    const proc = spawn('node_modules/.bin/vite', ['build'], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
    proc.on('exit', (code) => {
      if (code === 0) {
        // Copy pty-holder.cjs (same as postbuild script)
        const holderSrc = join(PKG_ROOT, 'src/lib/modules/server/terminal/pty-holder.cjs');
        const holderDest = join(PKG_ROOT, 'build/pty-holder.cjs');
        try {
          const data = readFileSync(holderSrc);
          writeFileSync(holderDest, data);
        } catch (err) {
          console.error(`Failed to copy pty-holder: ${holderSrc} -> ${holderDest}`, err);
        }
        log(green('Build complete.'));
        resolve();
      } else {
        reject(new Error(`vite build exited with code ${code}`));
      }
    });
  });
}

// ── Server ────────────────────────────────────────────────────────────

let serverProc = null;

function startServer() {
  const tsxLoader = join(PKG_ROOT, 'node_modules/tsx/dist/loader.mjs');
  const tsxPreflight = join(PKG_ROOT, 'node_modules/tsx/dist/preflight.cjs');
  const serverEntry = join(PKG_ROOT, 'server.ts');

  const nodeArgs = [];
  if (existsSync(tsxPreflight)) nodeArgs.push('--require', tsxPreflight);
  if (existsSync(tsxLoader)) nodeArgs.push('--import', `file://${tsxLoader}`);
  else nodeArgs.push('--import', 'tsx');
  nodeArgs.push(serverEntry);

  serverProc = spawn(process.execPath, nodeArgs, {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(PORT),
      SHOOTER_HOME: DEV_HOME,
      SHOOTER_PKG_ROOT: PKG_ROOT,
      API_KEY: DEV_API_KEY, // override whatever ~/.zshrc exported
      ORIGIN: `http://localhost:${PORT}`, // prevent SvelteKit from using https from x-forwarded-proto
    },
  });

  serverProc.on('error', (err) => {
    log(`${yellow('Server error:')} ${err.message}`);
    serverProc = null;
  });

  serverProc.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      log(yellow(`Server exited (${signal ?? code})`));
    }
    serverProc = null;
  });
}

function killServer() {
  return new Promise((resolve) => {
    if (!serverProc) {
      resolve();
      return;
    }
    const proc = serverProc;
    serverProc = null;
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    // Force-kill after 5s if graceful shutdown hangs
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 5000).unref();
  });
}

// ── Tunnel ────────────────────────────────────────────────────────────

let tunnelProc = null;

function startTunnel() {
  if (!isCloudflaredAvailable()) {
    log(
      yellow(
        'cloudflared not found — no tunnel. Server available at ' + cyan(`http://localhost:${PORT}`)
      )
    );
    return;
  }

  // Clear previous URL
  try {
    unlinkSync(TUNNEL_URL_FILE);
  } catch {}

  tunnelProc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    cwd: PKG_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onData = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const url = match[0];
      writeFileSync(TUNNEL_URL_FILE, url);
      const configUrl = `http://localhost:${PORT}/config#key=${encodeURIComponent(DEV_API_KEY)}&url=${encodeURIComponent(`http://localhost:${PORT}`)}`;
      const maskedConfigUrl = configUrl.replace(encodeURIComponent(DEV_API_KEY), '(redacted)');
      console.log('');
      console.log(`  ${bold('Shooter dev server ready')}`);
      console.log(`  ${dim('Local:  ')} ${cyan(`http://localhost:${PORT}`)}`);
      console.log(`  ${dim('Tunnel: ')} ${green(url)}`);
      console.log(`  ${dim('API key:')} ${yellow(DEV_API_KEY ? '(set)' : '(not set)')}`);
      console.log(`  ${dim('Config: ')} ${cyan(maskedConfigUrl)}`);
      console.log('');
    }
  };

  tunnelProc.stdout.on('data', onData);
  tunnelProc.stderr.on('data', onData);

  tunnelProc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      log(yellow(`Tunnel exited with code ${code}`));
    }
    tunnelProc = null;
  });
}

function killTunnel() {
  if (!tunnelProc) return;
  try {
    tunnelProc.kill('SIGTERM');
  } catch {}
  tunnelProc = null;
  try {
    unlinkSync(TUNNEL_URL_FILE);
  } catch {}
}

// ── Watcher ───────────────────────────────────────────────────────────

let rebuilding = false;
let pendingRebuild = false;

async function rebuild(reason) {
  if (rebuilding) {
    pendingRebuild = true;
    return;
  }
  rebuilding = true;
  log(dim(`Change detected: ${reason} — rebuilding...`));

  try {
    await killServer();
    await build();
    startServer();
  } catch (err) {
    log(yellow(`Rebuild failed: ${err.message}`));
  }

  rebuilding = false;
  if (pendingRebuild) {
    pendingRebuild = false;
    await rebuild('queued change');
  }
}

function startWatcher() {
  const watcher = watch(
    [
      join(PKG_ROOT, 'src'),
      join(PKG_ROOT, 'server.ts'),
      join(PKG_ROOT, 'svelte.config.js'),
      join(PKG_ROOT, 'vite.config.js'),
    ],
    {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**', '**/*.d.ts'],
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    }
  );

  let debounce = null;
  watcher.on('all', (event, filePath) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const rel = filePath.replace(PKG_ROOT + '/', '');
      rebuild(rel);
    }, 500);
  });

  return watcher;
}

// ── Shutdown ──────────────────────────────────────────────────────────

async function shutdown() {
  console.log('');
  log('Shutting down...');
  await killServer();
  killTunnel();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Main ──────────────────────────────────────────────────────────────

log(
  `${bold('Shooter dev')} — port ${cyan(String(PORT))}, home ${dim(DEV_HOME)}, key ${yellow(DEV_API_KEY ? '(set)' : '(not set)')}`
);

try {
  await build();
} catch (err) {
  log(yellow(`Initial build failed: ${err.message}`));
  process.exit(1);
}

startServer();

// Give server 2s to bind before starting tunnel (same as shooter CLI)
setTimeout(() => startTunnel(), 2000);

startWatcher();
