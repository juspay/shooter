#!/usr/bin/env node

// CLI entry point for the Shooter server.
// Usage: shooter [command]

'use strict';

const os = require('os');
const path = require('path');
const { spawn, execSync, execFileSync } = require('child_process');
const fs = require('fs');
const {
  discoverNamedTunnels,
  healAndEnsureRunning,
  probeReachability,
} = require('./lib/tunnel-discovery.cjs');
const {
  MANAGED_ENV,
  resolveStartAction,
  resolveStopAction,
  buildLaunchdPlist,
  buildSystemdUnit,
} = require('./lib/service-manager.cjs');

// ── Resolve paths ───────────────────────────────────────────────────
const PKG_ROOT = path.resolve(__dirname, '..');
const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(os.homedir(), '.shooter');
const PID_FILE = path.join(SHOOTER_HOME, 'shooter.pid');
const LOG_DIR = path.join(SHOOTER_HOME, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'shooter.log');
const DEFAULT_PORT = 54007;
const LAUNCHD_LABEL = 'com.juspay.shooter';
const LAUNCHD_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
const SYSTEMD_UNIT = path.join(os.homedir(), '.config', 'systemd', 'user', 'shooter.service');

const pkg = require(path.join(PKG_ROOT, 'package.json'));

// ── Read API key from env files (same chain as src/lib/env.ts) ──────
function readApiKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  const envFiles = [
    path.join(SHOOTER_HOME, '.env'),
    path.join(PKG_ROOT, '.env'),
    path.join(os.homedir(), '.shooter', '.env'),
  ];
  for (const f of envFiles) {
    try {
      const match = fs.readFileSync(f, 'utf8').match(/^API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    } catch {}
  }
  return null;
}

// ── Signal Helpers ──────────────────────────────────────────────────
function signalCode(sig) {
  return os.constants.signals[sig] || 0;
}

// ── PID helpers ─────────────────────────────────────────────────────
function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid)) return null;
    // Check if process is alive
    process.kill(pid, 0);
    // Verify it's actually a node/shooter process (prevent PID reuse attacks)
    try {
      const cmdline = execSync(`ps -p ${pid} -o command= 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (
        !cmdline.includes('shooter') &&
        !cmdline.includes('server.ts') &&
        !cmdline.includes('tsx')
      ) {
        // PID was reused by a different process — stale pidfile
        fs.unlinkSync(PID_FILE);
        return null;
      }
    } catch {
      // ps failed — process may have exited between kill(0) and ps
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

function writePid(pid) {
  fs.mkdirSync(SHOOTER_HOME, { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

// ── Guard / auto-update constants ──────────────────────────────────
const GUARD_PID_FILE = path.join(SHOOTER_HOME, 'guard.pid');
const GUARD_LOG_FILE = path.join(LOG_DIR, 'guard.log');
const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const UPDATE_FIRST_CHECK_MS = 30_000; // 30 seconds after start
const INSTALL_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 30_000;

// ── CLI argument parsing ────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'start';

switch (command) {
  case 'start':
    startServer();
    break;
  case 'stop':
    stopServer();
    break;
  case 'status':
    showStatus();
    break;
  case 'autostart':
    manageAutostart(args[1]);
    break;
  case 'logs':
    showLogs();
    break;
  case 'setup':
    runSetup();
    break;
  case 'update':
    runUpdate(args[1]);
    break;
  case 'guard':
    runGuard();
    break;
  case 'version':
  case '--version':
  case '-v':
    console.log(`shooter v${pkg.version}`);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    showHelp();
    process.exit(1);
}

// ── start ───────────────────────────────────────────────────────────

function hasFlag(flag) {
  return args.includes(flag);
}

// Keep in sync with `parsePortArg` in server.ts.
function parsePortFlag() {
  const isValid = (n) => Number.isInteger(n) && n >= 0 && n < 65536;
  const fail = (raw) => {
    console.error(`Error: invalid --port value "${raw}" — expected an integer in 0-65535.`);
    process.exit(2);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--port' || a === '-p') && args[i + 1] !== undefined) {
      const raw = args[i + 1];
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    } else if (a.startsWith('--port=')) {
      const raw = a.slice('--port='.length);
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    } else if (a.startsWith('-p=')) {
      const raw = a.slice('-p='.length);
      const n = parseInt(raw, 10);
      if (!isValid(n)) fail(raw);
      return n;
    }
  }
  return undefined;
}

function isCloudflaredAvailable() {
  try {
    execFileSync('which', ['cloudflared'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function startTunnel(port) {
  const tunnelLog = path.join(LOG_DIR, 'tunnel.log');
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    cwd: PKG_ROOT,
    detached: true,
    stdio: ['ignore', fs.openSync(tunnelLog, 'w'), fs.openSync(tunnelLog, 'w')],
  });

  const tunnelPidFile = path.join(SHOOTER_HOME, 'tunnel.pid');
  fs.writeFileSync(tunnelPidFile, String(cf.pid));
  cf.unref();

  // Poll for the tunnel URL (up to 15s)
  const tunnelUrlFile = path.join(SHOOTER_HOME, '.tunnel_url');
  let waited = 0;
  const poll = setInterval(() => {
    try {
      const log = fs.readFileSync(tunnelLog, 'utf8');
      const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        clearInterval(poll);
        fs.writeFileSync(tunnelUrlFile, match[0]);
        const apiKey = readApiKey();
        console.log(`Tunnel active: ${match[0]}`);
        console.log(`  API key: ${apiKey ? '(set)' : '(not set — run shooter setup)'}`);
      }
    } catch {}
    waited += 1;
    if (waited > 15) {
      clearInterval(poll);
      console.log('Tunnel is starting in the background. Check logs: ' + tunnelLog);
    }
  }, 1000);

  return cf.pid;
}

// Polls for ~/.shooter/.tunnel_url written by the URL detector inside
// startTunnel. Async so it yields control to the event loop between
// reads — letting startTunnel's setInterval actually fire to write the
// file. Resolves to the URL on success, or null on timeout.
async function waitForPersistedTunnelUrl(timeoutMs) {
  const file = path.join(SHOOTER_HOME, '.tunnel_url');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const url = fs.readFileSync(file, 'utf8').trim();
      if (url) return url;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function stopTunnel() {
  const tunnelPidFile = path.join(SHOOTER_HOME, 'tunnel.pid');
  const tunnelUrlFile = path.join(SHOOTER_HOME, '.tunnel_url');
  try {
    const pid = parseInt(fs.readFileSync(tunnelPidFile, 'utf8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
    try {
      fs.unlinkSync(tunnelPidFile);
    } catch {}
    try {
      fs.unlinkSync(tunnelUrlFile);
    } catch {}
  } catch {}
}

// Returns:
//   { kind: 'named', url, label }  – a pre-configured named tunnel is now
//                                    managed (healed/started as needed)
//   { kind: 'quick' }              – no named tunnel found; caller should
//                                    fall back to startTunnel()
function ensureNamedTunnelOrFallback(port) {
  let tunnels;
  try {
    tunnels = discoverNamedTunnels(parseInt(port, 10));
  } catch (err) {
    console.warn(`(named-tunnel discovery failed: ${err.message})`);
    return { kind: 'quick' };
  }
  if (!tunnels.length) return { kind: 'quick' };

  // Prefer the first match — port + hostname combination is typically unique.
  const tunnel = tunnels[0];
  const result = healAndEnsureRunning(tunnel);

  if (result.action === 'failed') {
    console.warn(`Named tunnel ${tunnel.label} could not be managed: ${result.reason}`);
    console.warn('Falling back to a quick tunnel.');
    return { kind: 'quick' };
  }
  if (result.action === 'healed') {
    console.log(`Tunnel plist binary path updated: ${result.from} → ${result.to}`);
  } else if (result.action === 'started') {
    console.log(`Tunnel ${tunnel.label} started.`);
  } else if (result.action === 'reloaded') {
    console.log(`Tunnel ${tunnel.label} kickstarted.`);
  }

  const url = tunnel.hostname ? `https://${tunnel.hostname}` : null;
  if (url) {
    try {
      fs.mkdirSync(SHOOTER_HOME, { recursive: true });
      fs.writeFileSync(path.join(SHOOTER_HOME, '.tunnel_url'), url);
    } catch {}
  }
  return { kind: 'named', url, label: tunnel.label };
}

function startServer() {
  const serverEntry = path.join(PKG_ROOT, 'server.ts');

  if (!fs.existsSync(serverEntry)) {
    console.error('Error: server.ts not found at', serverEntry);
    console.error('The Shooter package may not be installed correctly.');
    process.exit(1);
  }

  // Service-manager delegation: a real `shooter start` (not spawned by the
  // service manager) hands off to launchd/systemd so the OS owns restart and
  // recovers from any clean SIGTERM. The manager-spawned instance carries
  // SHOOTER_MANAGED=1 (or ppid 1 on macOS) and falls through to run directly.
  // Runtime start flags the static unit can't express must bypass delegation so
  // they aren't silently dropped (e.g. `shooter start --port 9000` on a machine
  // with autostart installed).
  const hasRuntimeOverrides =
    parsePortFlag() !== undefined || hasFlag('--daemon') || hasFlag('-d') || hasFlag('--no-tunnel');
  const startAction = resolveStartAction({
    managed: isSpawnedByManager(),
    agentInstalled: isAutostartInstalled(),
    platform: os.platform(),
    hasRuntimeOverrides,
  });
  if (startAction === 'delegate-launchd') return delegateStartToLaunchd();
  if (startAction === 'delegate-systemd') return delegateStartToSystemd();

  // Check if already running
  const existingPid = readPid();
  if (existingPid) {
    console.log(`Shooter is already running (PID ${existingPid}).`);
    console.log('Run "shooter stop" first, or "shooter status" for details.');
    process.exit(0);
  }

  const daemon = hasFlag('--daemon') || hasFlag('-d');
  const noTunnel = hasFlag('--no-tunnel');
  const cliPort = parsePortFlag();
  const port = cliPort ?? resolvePort();

  // Fail-fast pre-flight so a busy port is surfaced before we spawn the
  // server and start the Cloudflare Tunnel — keeping tunnel and listen
  // port in sync.
  try {
    execSync(
      `"${process.execPath}" -e "const s=require('net').createServer();s.listen(${parseInt(port, 10)},()=>s.close());s.on('error',e=>{if(e.code==='EADDRINUSE')process.exit(1)})"`,
      { stdio: 'ignore', timeout: 2000 }
    );
  } catch {
    console.error(`Error: Port ${port} is already in use.`);
    console.error('Stop the existing process, pass --port <num>, or set PORT in ~/.shooter/.env');
    process.exit(1);
  }

  if (daemon) {
    // ── Daemon mode: detach, redirect to log file ──
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFd = fs.openSync(LOG_FILE, 'a');

    // Use tsx's register hook via --import so the child is the actual server process
    // (not a wrapper that spawns another child)
    const tsxLoader = path.join(PKG_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    const tsxPreflight = path.join(PKG_ROOT, 'node_modules', 'tsx', 'dist', 'preflight.cjs');
    const nodeArgs = [];
    if (fs.existsSync(tsxPreflight)) {
      nodeArgs.push('--require', tsxPreflight);
    }
    if (fs.existsSync(tsxLoader)) {
      nodeArgs.push('--import', `file://${tsxLoader}`);
    } else {
      nodeArgs.push('--import', 'tsx');
    }
    nodeArgs.push(serverEntry);

    const child = spawn(process.execPath, nodeArgs, {
      cwd: PKG_ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        PORT: String(port),
        SHOOTER_PKG_ROOT: PKG_ROOT,
        SHOOTER_HOME,
      },
    });

    writePid(child.pid);
    child.unref();
    fs.closeSync(logFd);

    const apiKey = readApiKey();
    console.log(`Shooter started in background (PID ${child.pid}).`);
    console.log(`  URL:     http://localhost:${port}`);
    console.log(`  API key: ${apiKey ? '(set)' : '(not set — run shooter setup)'}`);
    console.log(`  Logs:    ${LOG_FILE}`);

    // Start tunnel in background if available; it writes URL to ~/.shooter/.tunnel_url.
    // startTunnel spawns cloudflared detached + unref'd, so the child survives the
    // CLI's process.exit(0) below — a setTimeout would have been killed before it
    // fires. For the quick-tunnel branch we briefly wait for the URL-detection
    // poller inside startTunnel to write .tunnel_url so `shooter status` and the
    // user can see the URL after the daemon detaches.
    let waitForQuickTunnel = false;
    if (!noTunnel && isCloudflaredAvailable()) {
      const t = ensureNamedTunnelOrFallback(port);
      if (t.kind === 'named') {
        if (t.url) console.log(`  Tunnel:  ${t.url} (named: ${t.label})`);
      } else {
        startTunnel(port);
        waitForQuickTunnel = true;
      }
    } else if (!noTunnel && !isCloudflaredAvailable()) {
      console.log('  (cloudflared not found — no tunnel. Install: brew install cloudflared)');
    }

    // Spawn auto-update guard (detached) — only when launchd is managing
    spawnGuard(child.pid, port);

    if (waitForQuickTunnel) {
      // Hand control back to the event loop so the URL poller inside
      // startTunnel can write .tunnel_url. The poller has its own 15s
      // ceiling and will clearInterval itself; once it does, no event
      // sources remain and the daemon process exits naturally.
      waitForPersistedTunnelUrl(15000).then(() => process.exit(0));
    } else {
      process.exit(0);
    }
  } else {
    // ── Foreground mode: inherit stdio ──
    const tsxLoader = path.join(PKG_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    const nodeArgs = fs.existsSync(tsxLoader)
      ? ['--import', `file://${tsxLoader}`, serverEntry]
      : ['--import', 'tsx', serverEntry];
    const child = spawn(process.execPath, nodeArgs, {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(port),
        SHOOTER_PKG_ROOT: PKG_ROOT,
        SHOOTER_HOME,
      },
    });

    writePid(child.pid);

    // Clean up any stale tunnel from previous run (important for LaunchAgent restart)
    stopTunnel();

    // Start tunnel in foreground mode too (unless --no-tunnel). We capture
    // the timer handle so signal/exit/error paths can cancel it — otherwise
    // a Ctrl-C between t=0 and t=3s would let the deferred startTunnel fire
    // after the server has begun shutting down, spawning a cloudflared that
    // points at a dead local port (the eventual exit handler reaps it via
    // pidfile, but the brief spawn is wasteful and confusing in logs).
    let tunnelStarted = false;
    let tunnelTimer = null;
    if (!noTunnel && isCloudflaredAvailable()) {
      const t = ensureNamedTunnelOrFallback(port);
      if (t.kind === 'named') {
        if (t.url) console.log(`Tunnel: ${t.url} (named: ${t.label})`);
      } else {
        tunnelTimer = setTimeout(() => {
          tunnelTimer = null;
          startTunnel(port);
          tunnelStarted = true;
        }, 3000);
      }
    }
    const cancelTunnelTimer = () => {
      if (tunnelTimer) {
        clearTimeout(tunnelTimer);
        tunnelTimer = null;
      }
    };

    // Spawn auto-update guard (detached) — only when launchd is managing
    spawnGuard(child.pid, port);

    child.on('error', (err) => {
      cancelTunnelTimer();
      removePid();
      if (tunnelStarted) stopTunnel();
      stopGuard();
      console.error('Failed to start Shooter server:', err.message);
      process.exit(1);
    });

    child.on('exit', (code, signal) => {
      cancelTunnelTimer();
      removePid();
      stopTunnel();
      stopGuard();
      if (signal) {
        process.exit(128 + (signalCode(signal) || 1));
      }
      process.exit(code ?? 1);
    });

    // Forward signals to the child so graceful shutdown works
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      process.on(sig, () => {
        cancelTunnelTimer();
        child.kill(sig);
        stopTunnel();
        stopGuard();
      });
    }
  }
}

// ── stop ────────────────────────────────────────────────────────────

function stopServer() {
  // Manager-owned services stop by removing the job from the manager (bootout /
  // systemctl stop) so KeepAlive/Restart can't immediately resurrect it.
  // Dev/manual runs fall through to the pidfile path below.
  const stopAction = resolveStopAction({
    agentManaging: isLaunchdManaging() || isSystemdManaging(),
    platform: os.platform(),
  });
  if (stopAction === 'bootout') return stopViaLaunchd();
  if (stopAction === 'systemctl-stop') return stopViaSystemd();

  const pid = readPid();
  if (!pid) {
    // Still try to stop tunnel even if server isn't running
    stopTunnel();
    console.log('Shooter is not running.');
    process.exit(0);
  }

  console.log(`Stopping Shooter (PID ${pid})...`);
  stopTunnel();
  stopGuard();
  try {
    process.kill(pid, 'SIGTERM');
    // Wait briefly for clean shutdown
    let waited = 0;
    const check = setInterval(() => {
      try {
        process.kill(pid, 0);
        waited += 100;
        if (waited > 5000) {
          clearInterval(check);
          console.log('Force-killing...');
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
          removePid();
          console.log('Shooter stopped.');
        }
      } catch {
        clearInterval(check);
        removePid();
        console.log('Shooter stopped.');
      }
    }, 100);
  } catch (err) {
    removePid();
    console.log('Shooter is not running (stale PID file removed).');
  }
}

// ── status ──────────────────────────────────────────────────────────

function resolvePort() {
  // Read PORT from ~/.shooter/.env if not in environment
  if (process.env.PORT) return process.env.PORT;
  const envFile = path.join(SHOOTER_HOME, '.env');
  try {
    const contents = fs.readFileSync(envFile, 'utf8');
    const match = contents.match(/^PORT=(\d+)/m);
    if (match) return match[1];
  } catch {}
  return DEFAULT_PORT;
}

function showStatus() {
  const pid = readPid();
  const port = resolvePort();
  const autostartEnabled = isAutostartInstalled();
  const tunnelUrlFile = path.join(SHOOTER_HOME, '.tunnel_url');
  let tunnelUrl = null;
  try {
    tunnelUrl = fs.readFileSync(tunnelUrlFile, 'utf8').trim();
  } catch {}

  let namedTunnel = null;
  try {
    const list = discoverNamedTunnels(parseInt(port, 10));
    if (list.length) namedTunnel = list[0];
  } catch (err) {
    console.warn(`(named-tunnel discovery failed: ${err.message})`);
  }

  if (pid) {
    console.log(`Shooter is running`);
    console.log(`  PID:        ${pid}`);
    console.log(`  URL:        http://localhost:${port}`);
    if (namedTunnel) {
      const url = namedTunnel.hostname ? `https://${namedTunnel.hostname}` : null;
      const ls = namedTunnel.launch || {};
      if (url) {
        const reach = probeReachability(url, 1500);
        const reachStr = reach.ok
          ? `reachable (${reach.status})`
          : `unreachable${reach.status ? ` (${reach.status})` : ''}`;
        console.log(`  Tunnel:     ${url}  [${reachStr}]`);
      }
      console.log(
        `  Agent:      ${namedTunnel.label} ` +
          `(state=${ls.state ?? 'unknown'}, last exit=${ls.lastExitCode ?? 'n/a'})`
      );
      if (!namedTunnel.binaryPathHealthy) {
        console.log(
          `  WARNING:    cloudflared at ${namedTunnel.binaryPath} not found — will self-heal on next start`
        );
      }
    } else if (tunnelUrl) {
      console.log(`  Tunnel:     ${tunnelUrl}`);
    }
    console.log(`  Autostart:  ${autostartEnabled ? 'enabled' : 'disabled'}`);
    console.log(`  Logs:       ${LOG_FILE}`);
    console.log(`  Home:       ${SHOOTER_HOME}`);
  } else {
    console.log('Shooter is not running.');
    if (namedTunnel) {
      console.log(
        `  Tunnel:     named (${namedTunnel.label}) at https://${namedTunnel.hostname || '?'}`
      );
      if (!namedTunnel.binaryPathHealthy) {
        console.log(
          `  WARNING:    cloudflared at ${namedTunnel.binaryPath} not found — will self-heal on next start`
        );
      }
    }
    console.log(`  Autostart:  ${autostartEnabled ? 'enabled' : 'disabled'}`);
    console.log(`  Home:       ${SHOOTER_HOME}`);
    console.log('\nRun "shooter start" to start the server.');
  }
}

// ── autostart ───────────────────────────────────────────────────────

function isAutostartInstalled() {
  if (os.platform() === 'darwin') {
    return fs.existsSync(LAUNCHD_PLIST);
  } else if (os.platform() === 'linux') {
    return fs.existsSync(SYSTEMD_UNIT);
  }
  return false;
}

function manageAutostart(action) {
  if (!action || (action !== 'on' && action !== 'off')) {
    const status = isAutostartInstalled() ? 'enabled' : 'disabled';
    console.log(`Autostart is currently ${status}.`);
    console.log('\nUsage:');
    console.log('  shooter autostart on    Enable autostart on login');
    console.log('  shooter autostart off   Disable autostart');
    return;
  }

  if (action === 'on') {
    enableAutostart();
  } else {
    disableAutostart();
  }
}

function enableAutostart() {
  const platform = os.platform();

  if (platform === 'darwin') {
    enableLaunchAgent();
  } else if (platform === 'linux') {
    enableSystemdUnit();
  } else {
    console.error(`Autostart is not supported on ${platform}.`);
    console.log('You can add "shooter start" to your system startup scripts manually.');
    process.exit(1);
  }
}

function disableAutostart() {
  const platform = os.platform();

  if (platform === 'darwin') {
    disableLaunchAgent();
  } else if (platform === 'linux') {
    disableSystemdUnit();
  } else {
    console.error(`Autostart is not supported on ${platform}.`);
    process.exit(1);
  }
}

// ── macOS LaunchAgent ───────────────────────────────────────────────

function enableLaunchAgent() {
  const shooterBin = resolveShooterBin();
  const nodeBin = process.execPath;

  // Path interpolations are XML-escaped inside buildLaunchdPlist so a path
  // containing `&`, `<`, or `>` can't corrupt the plist.
  const plist = buildLaunchdPlist({
    label: LAUNCHD_LABEL,
    nodeBin,
    shooterBin,
    pkgRoot: PKG_ROOT,
    pathEnv: `${path.dirname(nodeBin)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
    shooterHome: SHOOTER_HOME,
    logFile: LOG_FILE,
  });

  // Ensure directories exist
  fs.mkdirSync(path.dirname(LAUNCHD_PLIST), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // Unload existing if present
  if (fs.existsSync(LAUNCHD_PLIST)) {
    try {
      execFileSync('launchctl', ['unload', LAUNCHD_PLIST], { stdio: 'ignore' });
    } catch {}
  }

  fs.writeFileSync(LAUNCHD_PLIST, plist);
  execFileSync('launchctl', ['load', LAUNCHD_PLIST], { stdio: 'ignore' });

  console.log('Autostart enabled (macOS LaunchAgent).');
  console.log(`  Plist:  ${LAUNCHD_PLIST}`);
  console.log(`  Logs:   ${LOG_FILE}`);
  console.log('\nShooter will start automatically on login.');
  console.log('To start now: shooter start');
}

function disableLaunchAgent() {
  if (!fs.existsSync(LAUNCHD_PLIST)) {
    console.log('Autostart is not enabled.');
    return;
  }

  try {
    execFileSync('launchctl', ['unload', LAUNCHD_PLIST], { stdio: 'ignore' });
  } catch {}
  fs.unlinkSync(LAUNCHD_PLIST);
  console.log('Autostart disabled. LaunchAgent removed.');
}

// ── Linux systemd user unit ─────────────────────────────────────────

function enableSystemdUnit() {
  const shooterBin = resolveShooterBin();

  // Paths are double-quoted inside buildSystemdUnit so systemd's word-splitter
  // doesn't treat a space inside e.g. "/Users/John Doe/.local/bin/shooter" as
  // an argument separator.
  const unit = buildSystemdUnit({
    nodeBin: process.execPath,
    shooterBin,
    pkgRoot: PKG_ROOT,
    shooterHome: SHOOTER_HOME,
  });

  fs.mkdirSync(path.dirname(SYSTEMD_UNIT), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(SYSTEMD_UNIT, unit);

  execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  execFileSync('systemctl', ['--user', 'enable', 'shooter.service'], { stdio: 'inherit' });
  execFileSync('systemctl', ['--user', 'start', 'shooter.service'], { stdio: 'inherit' });

  console.log('Autostart enabled (systemd user unit).');
  console.log(`  Unit:   ${SYSTEMD_UNIT}`);
  console.log(`  Logs:   journalctl --user -u shooter.service`);
  console.log('\nShooter is now running and will start automatically on login.');
}

function disableSystemdUnit() {
  if (!fs.existsSync(SYSTEMD_UNIT)) {
    console.log('Autostart is not enabled.');
    return;
  }

  try {
    execFileSync('systemctl', ['--user', 'stop', 'shooter.service'], { stdio: 'ignore' });
  } catch {}
  try {
    execFileSync('systemctl', ['--user', 'disable', 'shooter.service'], { stdio: 'ignore' });
  } catch {}
  fs.unlinkSync(SYSTEMD_UNIT);
  try {
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  } catch {}
  console.log('Autostart disabled. systemd unit removed.');
}

// ── logs ────────────────────────────────────────────────────────────

function showLogs() {
  const platform = os.platform();

  // For systemd on Linux, use journalctl
  if (platform === 'linux' && fs.existsSync(SYSTEMD_UNIT)) {
    const child = spawn(
      'journalctl',
      ['--user', '-u', 'shooter.service', '-f', '--no-pager', '-n', '50'],
      {
        stdio: 'inherit',
      }
    );
    child.on('exit', (code) => process.exit(code ?? 0));
    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.on(sig, () => child.kill(sig));
    }
    return;
  }

  // For macOS LaunchAgent or manual runs, tail the log file
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found.');
    console.log(`Expected at: ${LOG_FILE}`);
    console.log('\nLogs are only written when running via autostart.');
    console.log('For foreground runs, logs are printed directly to the terminal.');
    return;
  }

  const child = spawn('tail', ['-f', '-n', '50', LOG_FILE], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => child.kill(sig));
  }
}

// ── setup ───────────────────────────────────────────────────────────

function runSetup() {
  const setupScript = path.join(PKG_ROOT, 'scripts', 'setup.cjs');

  if (!fs.existsSync(setupScript)) {
    console.error('Error: Setup wizard not found at', setupScript);
    console.error('The setup script (scripts/setup.cjs) has not been created yet.');
    process.exit(1);
  }

  const child = spawn(process.execPath, [setupScript, ...args.slice(1)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      SHOOTER_PKG_ROOT: PKG_ROOT,
    },
  });

  child.on('error', (err) => {
    console.error('Failed to run setup wizard:', err.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(128 + (signalCode(signal) || 1));
    }
    process.exit(code ?? 1);
  });
}

// ── update ──────────────────────────────────────────────────────────

function runUpdate(subcommand) {
  const { checkForUpdate } = require(path.join(PKG_ROOT, 'scripts', 'update-checker.cjs'));
  const { recordCheck, isVersionSuppressed } = require(
    path.join(PKG_ROOT, 'scripts', 'update-state.cjs')
  );

  const result = checkForUpdate(PKG_ROOT);
  if (!result.checkFailed) recordCheck(result.latestVersion);

  if (subcommand === 'check') {
    // Just check, don't install
    if (result.checkFailed) {
      console.error(`Update check failed: ${result.error}`);
      process.exitCode = 1;
    } else if (result.updateAvailable) {
      console.log(`Update available: ${result.currentVersion} → ${result.latestVersion}`);
      console.log(`  Current commit: ${result.currentCommit}`);
      console.log(`  Latest commit:  ${result.latestCommit}`);
      if (isVersionSuppressed(result.latestVersion)) {
        console.log(
          `  (version ${result.latestVersion} is temporarily suppressed — will retry in <24h)`
        );
      }
    } else {
      console.log(`Already up to date: v${result.currentVersion} (${result.currentCommit})`);
    }
    return;
  }

  // Default: check + install
  if (result.checkFailed) {
    console.error(`Update check failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  if (!result.updateAvailable) {
    console.log(`Already up to date: v${result.currentVersion} (${result.currentCommit})`);
    return;
  }

  // Only allow installs on the release branch
  const { getCurrentBranch } = require(path.join(PKG_ROOT, 'scripts', 'update-checker.cjs'));
  const branch = getCurrentBranch(PKG_ROOT);
  if (branch !== 'release') {
    console.log(
      `Cannot update: currently on branch '${branch || 'unknown'}', updates only apply to 'release'.`
    );
    console.log('Switch to the release branch and try again.');
    return;
  }

  if (isVersionSuppressed(result.latestVersion)) {
    console.log(`Update to ${result.latestVersion} is temporarily suppressed (previous failure).`);
    console.log('Suppression expires within 24 hours. Use a fresh git pull to override.');
    return;
  }

  console.log(`Updating: ${result.currentVersion} → ${result.latestVersion}...`);
  const success = performUpdate(result);
  if (success) {
    console.log(`\nUpdate complete! Now running v${result.latestVersion}.`);

    // Restart if server is running
    const pid = readPid();
    if (pid) {
      if (isLaunchdManaging()) {
        const uid = process.getuid ? process.getuid() : 501;
        try {
          execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${LAUNCHD_LABEL}`], {
            timeout: 10_000,
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          console.log('Signaled launchd to restart the server.');
        } catch {
          console.log('launchctl kickstart failed — the server may need a manual restart.');
        }
      } else {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {}
        console.log('Server process terminated. Run "shooter start" to restart.');
      }
    }
  }
}

/**
 * Perform the actual update: git pull → pnpm install → pnpm build.
 * Returns true on success. On failure, rolls back and returns false.
 */
function performUpdate(result) {
  const { suppressVersion, recordSuccessfulUpdate } = require(
    path.join(PKG_ROOT, 'scripts', 'update-state.cjs')
  );

  // Save current HEAD for rollback
  let savedHead = '';
  try {
    savedHead = execSync('git rev-parse HEAD', {
      cwd: PKG_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}

  // 1. Git pull (fast-forward only)
  try {
    console.log('  Pulling latest changes...');
    execSync('git pull --ff-only origin release', {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: 30_000,
    });
  } catch (err) {
    console.error('  Git pull failed:', err.message || err);
    suppressVersion(result.latestVersion, 'pull_failed');
    return false;
  }

  // 2. Install dependencies
  try {
    console.log('  Installing dependencies...');
    execSync('pnpm install --frozen-lockfile', {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: INSTALL_TIMEOUT_MS,
    });
  } catch (err) {
    console.error('  pnpm install failed:', err.message || err);
    rollback(savedHead);
    suppressVersion(result.latestVersion, 'install_failed');
    return false;
  }

  // 3. Build
  try {
    console.log('  Building...');
    execSync('pnpm build', {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: BUILD_TIMEOUT_MS,
    });
  } catch (err) {
    console.error('  Build failed:', err.message || err);
    rollback(savedHead);
    suppressVersion(result.latestVersion, 'build_failed');
    return false;
  }

  recordSuccessfulUpdate(result.latestVersion, result.currentVersion);
  return true;
}

/**
 * Roll back to a previous commit after a failed update.
 */
function rollback(savedHead) {
  if (!savedHead) return;
  console.log('  Rolling back to previous version...');
  try {
    execSync(`git reset --hard ${savedHead}`, {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: 10_000,
    });
    execSync('pnpm install --frozen-lockfile', {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: INSTALL_TIMEOUT_MS,
    });
    execSync('pnpm build', {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      timeout: BUILD_TIMEOUT_MS,
    });
  } catch (rollbackErr) {
    console.error('  WARNING: Rollback failed:', rollbackErr.message || rollbackErr);
    console.error('  Manual intervention may be required.');
  }
}

// ── guard (hidden — spawned by start) ──────────────────────────────

function spawnGuard(parentPid, port) {
  // Only spawn guard when launchd is managing the service
  if (!isLaunchdManaging()) return;

  const shooterBin = path.join(PKG_ROOT, 'bin', 'shooter.cjs');
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFd = fs.openSync(GUARD_LOG_FILE, 'a');

    const child = spawn(
      process.execPath,
      [shooterBin, 'guard', '--parent-pid', String(parentPid), '--port', String(port)],
      {
        cwd: PKG_ROOT,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          SHOOTER_PKG_ROOT: PKG_ROOT,
          SHOOTER_HOME,
        },
      }
    );

    if (child.pid) {
      fs.mkdirSync(SHOOTER_HOME, { recursive: true });
      fs.writeFileSync(GUARD_PID_FILE, String(child.pid));
    }
    child.unref();
    fs.closeSync(logFd);
  } catch (err) {
    // Non-fatal — server runs fine without guard
    console.log(`  (auto-update guard failed to start: ${err.message})`);
  }
}

function stopGuard() {
  try {
    const pid = parseInt(fs.readFileSync(GUARD_PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(pid) && pid > 0) {
      // Validate the PID is actually a guard process (prevent PID reuse attacks)
      try {
        const cmdline = execSync(`ps -p ${pid} -o command= 2>/dev/null`, {
          encoding: 'utf8',
        }).trim();
        if (!cmdline.includes('shooter.cjs') || !cmdline.includes('guard')) {
          // PID reused by an unrelated process — just clean up the stale pidfile
          fs.unlinkSync(GUARD_PID_FILE);
          return;
        }
      } catch {
        // ps failed — process likely already exited
        fs.unlinkSync(GUARD_PID_FILE);
        return;
      }
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
  } catch {}
  try {
    fs.unlinkSync(GUARD_PID_FILE);
  } catch {}
}

function isLaunchdManaging() {
  if (os.platform() !== 'darwin') return false;
  try {
    const uid = process.getuid ? process.getuid() : 501;
    execFileSync('launchctl', ['print', `gui/${uid}/${LAUNCHD_LABEL}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function isSystemdManaging() {
  if (os.platform() !== 'linux') return false;
  try {
    execFileSync('systemctl', ['--user', 'is-active', '--quiet', 'shooter.service'], {
      stdio: 'ignore',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

// True when this process was spawned by the service manager — so `shooter start`
// runs the server directly instead of delegating back to the manager.
function isSpawnedByManager() {
  // Primary signal: the marker env injected into the generated unit.
  if (process.env[MANAGED_ENV] === '1') return true;
  // Best-effort transition fallback for an older, marker-less plist still on
  // disk: launchd reparents its GUI agents to PID 1, so a launchd-spawned
  // `shooter start` has ppid 1 while a shell-run one does not. This is only a
  // heuristic (it won't hold if shooter is wrapped by e.g. sudo) and exists
  // solely to avoid delegate-recursion until the plist is regenerated with the
  // SHOOTER_MANAGED marker — it can be dropped once all installs carry it.
  if (os.platform() === 'darwin' && process.ppid === 1) return true;
  return false;
}

// Hand a manual `shooter start` off to launchd. If the job is already loaded it
// is already running (KeepAlive); otherwise bootstrap it (e.g. after a stop).
function delegateStartToLaunchd() {
  const uid = process.getuid ? process.getuid() : 501;
  // bootstrap if the job isn't loaded; if it is, `kickstart -k` restarts it so
  // `shooter start` recycles a loaded-but-stale agent instead of no-opping.
  const loaded = isLaunchdManaging();
  try {
    if (loaded) {
      execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${LAUNCHD_LABEL}`], {
        stdio: 'ignore',
      });
    } else {
      execFileSync('launchctl', ['bootstrap', `gui/${uid}`, LAUNCHD_PLIST], { stdio: 'ignore' });
    }
  } catch (err) {
    console.error(`Failed to start via launchd: ${err.message}`);
    console.error('Try: shooter autostart on');
    process.exit(1);
  }
  console.log(`Shooter ${loaded ? 'restarted' : 'started'} (launchd-managed).`);
  console.log('  Logs:   shooter logs');
}

function delegateStartToSystemd() {
  // restart if the unit is active (recycle a stale instance), else start it.
  const active = isSystemdManaging();
  const action = active ? 'restart' : 'start';
  try {
    execFileSync('systemctl', ['--user', action, 'shooter.service'], { stdio: 'ignore' });
  } catch (err) {
    console.error(`Failed to start via systemd: ${err.message}`);
    console.error('Try: shooter autostart on');
    process.exit(1);
  }
  console.log(`Shooter ${active ? 'restarted' : 'started'} (systemd-managed).`);
  console.log('  Logs:   shooter logs');
}

// Stop a launchd-managed service by removing the job from the domain. The plist
// file stays on disk, so it returns on next login or `shooter start`.
function stopViaLaunchd() {
  const uid = process.getuid ? process.getuid() : 501;
  console.log('Stopping Shooter (launchd-managed)...');
  stopTunnel();
  stopGuard();
  try {
    execFileSync('launchctl', ['bootout', `gui/${uid}/${LAUNCHD_LABEL}`], { stdio: 'ignore' });
  } catch {
    // Not loaded / already booted out — nothing to do.
  }
  removePid();
  console.log('Shooter stopped. (Returns on next login or "shooter start".)');
}

function stopViaSystemd() {
  console.log('Stopping Shooter (systemd-managed)...');
  stopTunnel();
  stopGuard();
  try {
    execFileSync('systemctl', ['--user', 'stop', 'shooter.service'], { stdio: 'ignore' });
  } catch {
    // Not active — nothing to do.
  }
  removePid();
  console.log('Shooter stopped.');
}

function runGuard() {
  // Parse guard-specific args
  let parentPid = 0;
  let port = DEFAULT_PORT;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--parent-pid' && args[i + 1]) {
      parentPid = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!parentPid || parentPid <= 0) {
    console.error('[guard] Invalid --parent-pid');
    process.exit(1);
  }

  const { checkForUpdate, getCurrentBranch } = require(
    path.join(PKG_ROOT, 'scripts', 'update-checker.cjs')
  );
  const { recordCheck, isVersionSuppressed, suppressVersion, recordSuccessfulUpdate } = require(
    path.join(PKG_ROOT, 'scripts', 'update-state.cjs')
  );

  const log = (msg) => console.log(`[guard] ${new Date().toISOString()} ${msg}`);

  // Check if parent is alive
  function isParentAlive() {
    try {
      process.kill(parentPid, 0);
      return true;
    } catch {
      return false;
    }
  }

  let updateInProgress = false;
  let updateRestartInProgress = false;

  async function runUpdateCheck() {
    if (updateInProgress) return;
    updateInProgress = true;

    try {
      // Only auto-update on release branch
      const branch = getCurrentBranch(PKG_ROOT);
      if (branch !== 'release') {
        log(`skipping update check — on branch '${branch}', not 'release'`);
        return;
      }

      // 1. Check for update
      const result = checkForUpdate(PKG_ROOT);
      if (result.checkFailed) {
        log(`update check failed: ${result.error}`);
        return;
      }
      recordCheck(result.latestVersion);

      if (!result.updateAvailable) {
        log(`up to date: v${result.currentVersion}`);
        return;
      }

      if (isVersionSuppressed(result.latestVersion)) {
        log(`version ${result.latestVersion} is suppressed, skipping`);
        return;
      }

      log(`update available: ${result.currentVersion} → ${result.latestVersion}`);

      // 2. Save current HEAD for rollback
      let savedHead = '';
      try {
        savedHead = execSync('git rev-parse HEAD', {
          cwd: PKG_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {}

      // 3. Git pull
      try {
        execSync('git pull --ff-only origin release', {
          cwd: PKG_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000,
        });
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim().slice(-500) : '';
        log(`git pull failed: ${err.message}${stderr ? '\n' + stderr : ''}`);
        suppressVersion(result.latestVersion, 'pull_failed');
        return;
      }

      // 4. Install dependencies
      try {
        log('installing dependencies...');
        execSync('pnpm install --frozen-lockfile', {
          cwd: PKG_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: INSTALL_TIMEOUT_MS,
        });
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim().slice(-500) : '';
        log(`pnpm install failed: ${err.message}${stderr ? '\n' + stderr : ''}`);
        guardRollback(savedHead);
        suppressVersion(result.latestVersion, 'install_failed');
        return;
      }

      // 5. Build
      try {
        log('building...');
        execSync('pnpm build', {
          cwd: PKG_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: BUILD_TIMEOUT_MS,
        });
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim().slice(-500) : '';
        log(`build failed: ${err.message}${stderr ? '\n' + stderr : ''}`);
        guardRollback(savedHead);
        suppressVersion(result.latestVersion, 'build_failed');
        return;
      }

      // 6. Restart via launchctl
      updateRestartInProgress = true;
      log('restarting via launchctl...');
      const uid = process.getuid ? process.getuid() : 501;
      try {
        execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${LAUNCHD_LABEL}`], {
          timeout: 10_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        log('WARNING: launchctl kickstart failed');
        suppressVersion(result.latestVersion, 'restart_failed');
        updateRestartInProgress = false;
        return;
      }

      // 7. Wait for healthy restart
      let healthy = false;
      const restartStart = Date.now();
      while (Date.now() - restartStart < HEALTH_TIMEOUT_MS) {
        await sleep(2000);
        try {
          const resp = await fetch(`http://localhost:${port}/api/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.version === result.latestVersion) {
              healthy = true;
              break;
            }
          }
        } catch {
          /* retry */
        }
      }

      if (healthy) {
        log(`update successful: now running v${result.latestVersion}`);
        recordSuccessfulUpdate(result.latestVersion, result.currentVersion);
        // New server will spawn its own guard — exit this one
        process.exit(0);
      } else {
        log(`WARNING: server unhealthy after update to ${result.latestVersion}`);
        suppressVersion(result.latestVersion, 'unhealthy_after_restart');
        updateRestartInProgress = false;
      }
    } catch (err) {
      log(`update check error: ${err.message || err}`);
    } finally {
      updateInProgress = false;
    }
  }

  function guardRollback(savedHead) {
    if (!savedHead) return;
    log('rolling back...');
    try {
      execSync(`git reset --hard ${savedHead}`, {
        cwd: PKG_ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
      });
      execSync('pnpm install --frozen-lockfile', {
        cwd: PKG_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: INSTALL_TIMEOUT_MS,
      });
      execSync('pnpm build', {
        cwd: PKG_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: BUILD_TIMEOUT_MS,
      });
    } catch (rollbackErr) {
      log(`WARNING: rollback failed: ${rollbackErr.message}`);
    }
  }

  // Parent process health monitor
  const parentCheckInterval = setInterval(() => {
    if (!isParentAlive() && !updateRestartInProgress) {
      log('parent process died, exiting guard');
      clearInterval(parentCheckInterval);
      process.exit(0);
    }
  }, 5_000);

  // Schedule update checks
  setTimeout(() => void runUpdateCheck(), UPDATE_FIRST_CHECK_MS);
  setInterval(() => void runUpdateCheck(), UPDATE_CHECK_INTERVAL_MS);

  log(`started (parent PID: ${parentPid}, port: ${port})`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── help ────────────────────────────────────────────────────────────

function showHelp() {
  console.log(
    `
Shooter v${pkg.version}

Usage: shooter [command] [options]

Commands:
  start            Start the server (default, foreground)
  stop             Stop the running server and tunnel
  status           Show server status and tunnel URL
  autostart on     Start automatically on login (macOS/Linux)
  autostart off    Disable autostart
  logs             Tail server logs
  setup            Quick setup (API key + build, ~60 seconds)
  setup --push     Add/reconfigure push notifications
  update           Check for updates and install if available
  update check     Check for updates without installing
  version          Show version number
  help             Show this help message

Start options:
  -d, --daemon         Run in background (detach from terminal)
  --no-tunnel          Don't start a Cloudflare Tunnel
  -p, --port <num>     Port to listen on (overrides PORT env)

Auto-update:
  When running as a LaunchAgent, Shooter automatically checks for updates
  every 2 hours. Updates are pulled from origin/release, built, and the
  server is restarted via launchctl. Terminal sessions survive restarts.

Examples:
  shooter                    Start the server + tunnel (foreground)
  shooter start -d           Start in background (daemon mode)
  shooter start --no-tunnel  Start without Cloudflare Tunnel
  shooter start --port 3000  Start on port 3000
  shooter status             Check status and tunnel URL
  shooter autostart on       Enable autostart on login
  shooter logs               Follow server logs
  shooter setup              Quick setup (~60s, push deferred)
  shooter setup --push       Add iOS/Android push notifications
  shooter update             Check and install updates
  shooter update check       Check for updates only
`.trim()
  );
}

// ── Resolve shooter binary path ─────────────────────────────────────

function resolveShooterBin() {
  // Prefer the global symlink if it exists
  const globalBin = path.join(os.homedir(), '.local', 'bin', 'shooter');
  if (fs.existsSync(globalBin)) return globalBin;
  // Fall back to this script
  return path.join(PKG_ROOT, 'bin', 'shooter.cjs');
}
