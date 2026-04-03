#!/usr/bin/env node

// CLI entry point for the Shooter server.
// Usage: shooter [command]

'use strict';

const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

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
      if (!cmdline.includes('shooter') && !cmdline.includes('server.ts') && !cmdline.includes('tsx')) {
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
  try { fs.unlinkSync(PID_FILE); } catch {}
}

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

function isCloudflaredAvailable() {
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
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
        console.log(`Tunnel active: ${match[0]}`);
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

function stopTunnel() {
  const tunnelPidFile = path.join(SHOOTER_HOME, 'tunnel.pid');
  const tunnelUrlFile = path.join(SHOOTER_HOME, '.tunnel_url');
  try {
    const pid = parseInt(fs.readFileSync(tunnelPidFile, 'utf8').trim(), 10);
    if (!isNaN(pid)) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    try { fs.unlinkSync(tunnelPidFile); } catch {}
    try { fs.unlinkSync(tunnelUrlFile); } catch {}
  } catch {}
}

function startServer() {
  const serverEntry = path.join(PKG_ROOT, 'server.ts');

  if (!fs.existsSync(serverEntry)) {
    console.error('Error: server.ts not found at', serverEntry);
    console.error('The Shooter package may not be installed correctly.');
    process.exit(1);
  }

  // Check if already running
  const existingPid = readPid();
  if (existingPid) {
    console.log(`Shooter is already running (PID ${existingPid}).`);
    console.log('Run "shooter stop" first, or "shooter status" for details.');
    process.exit(0);
  }

  const daemon = hasFlag('--daemon') || hasFlag('-d');
  const noTunnel = hasFlag('--no-tunnel');
  const port = resolvePort();

  // Check if port is already in use (no external tools needed)
  try {
    execSync(
      `"${process.execPath}" -e "const s=require('net').createServer();s.listen(${parseInt(port, 10)},()=>s.close());s.on('error',e=>{if(e.code==='EADDRINUSE')process.exit(1)})"`,
      { stdio: 'ignore', timeout: 2000 }
    );
  } catch {
    console.error(`Error: Port ${port} is already in use.`);
    console.error('Stop the existing process or set a different PORT in ~/.shooter/.env');
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
        SHOOTER_PKG_ROOT: PKG_ROOT,
        SHOOTER_HOME,
      },
    });

    writePid(child.pid);
    child.unref();
    fs.closeSync(logFd);

    console.log(`Shooter started in background (PID ${child.pid}).`);
    console.log(`  URL:   http://localhost:${port}`);
    console.log(`  Logs:  ${LOG_FILE}`);

    // Start tunnel in background if available; it writes URL to ~/.shooter/.tunnel_url
    if (!noTunnel && isCloudflaredAvailable()) {
      setTimeout(() => {
        startTunnel(port);
      }, 3000);
    } else if (!noTunnel && !isCloudflaredAvailable()) {
      console.log('  (cloudflared not found — no tunnel. Install: brew install cloudflared)');
    }
    // Exit immediately — daemon is running, tunnel starts async
    process.exit(0);
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
        SHOOTER_PKG_ROOT: PKG_ROOT,
        SHOOTER_HOME,
      },
    });

    writePid(child.pid);

    // Clean up any stale tunnel from previous run (important for LaunchAgent restart)
    stopTunnel();

    // Start tunnel in foreground mode too (unless --no-tunnel)
    let tunnelStarted = false;
    if (!noTunnel && isCloudflaredAvailable()) {
      // Give server 3s to start before launching tunnel
      setTimeout(() => {
        startTunnel(port);
        tunnelStarted = true;
      }, 3000);
    }

    child.on('error', (err) => {
      removePid();
      if (tunnelStarted) stopTunnel();
      console.error('Failed to start Shooter server:', err.message);
      process.exit(1);
    });

    child.on('exit', (code, signal) => {
      removePid();
      stopTunnel();
      if (signal) {
        process.exit(128 + (signalCode(signal) || 1));
      }
      process.exit(code ?? 1);
    });

    // Forward signals to the child so graceful shutdown works
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      process.on(sig, () => {
        child.kill(sig);
        stopTunnel();
      });
    }
  }
}

// ── stop ────────────────────────────────────────────────────────────

function stopServer() {
  const pid = readPid();
  if (!pid) {
    // Still try to stop tunnel even if server isn't running
    stopTunnel();
    console.log('Shooter is not running.');
    process.exit(0);
  }

  console.log(`Stopping Shooter (PID ${pid})...`);
  stopTunnel();
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
          try { process.kill(pid, 'SIGKILL'); } catch {}
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
  try { tunnelUrl = fs.readFileSync(tunnelUrlFile, 'utf8').trim(); } catch {}

  if (pid) {
    console.log(`Shooter is running`);
    console.log(`  PID:        ${pid}`);
    console.log(`  URL:        http://localhost:${port}`);
    if (tunnelUrl) {
      console.log(`  Tunnel:     ${tunnelUrl}`);
    }
    console.log(`  Autostart:  ${autostartEnabled ? 'enabled' : 'disabled'}`);
    console.log(`  Logs:       ${LOG_FILE}`);
    console.log(`  Home:       ${SHOOTER_HOME}`);
  } else {
    console.log('Shooter is not running.');
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

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${shooterBin}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PKG_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${path.dirname(nodeBin)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>SHOOTER_HOME</key>
    <string>${SHOOTER_HOME}</string>
  </dict>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>`;

  // Ensure directories exist
  fs.mkdirSync(path.dirname(LAUNCHD_PLIST), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // Unload existing if present
  if (fs.existsSync(LAUNCHD_PLIST)) {
    try { execSync(`launchctl unload "${LAUNCHD_PLIST}" 2>/dev/null`); } catch {}
  }

  fs.writeFileSync(LAUNCHD_PLIST, plist);
  execSync(`launchctl load "${LAUNCHD_PLIST}"`);

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

  try { execSync(`launchctl unload "${LAUNCHD_PLIST}" 2>/dev/null`); } catch {}
  fs.unlinkSync(LAUNCHD_PLIST);
  console.log('Autostart disabled. LaunchAgent removed.');
}

// ── Linux systemd user unit ─────────────────────────────────────────

function enableSystemdUnit() {
  const shooterBin = resolveShooterBin();

  const unit = `[Unit]
Description=Shooter — Mobile dev notifications & remote terminal
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${shooterBin} start
WorkingDirectory=${PKG_ROOT}
Environment=SHOOTER_HOME=${SHOOTER_HOME}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;

  fs.mkdirSync(path.dirname(SYSTEMD_UNIT), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(SYSTEMD_UNIT, unit);

  execSync('systemctl --user daemon-reload');
  execSync('systemctl --user enable shooter.service');
  execSync('systemctl --user start shooter.service');

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

  try { execSync('systemctl --user stop shooter.service 2>/dev/null'); } catch {}
  try { execSync('systemctl --user disable shooter.service 2>/dev/null'); } catch {}
  fs.unlinkSync(SYSTEMD_UNIT);
  try { execSync('systemctl --user daemon-reload'); } catch {}
  console.log('Autostart disabled. systemd unit removed.');
}

// ── logs ────────────────────────────────────────────────────────────

function showLogs() {
  const platform = os.platform();

  // For systemd on Linux, use journalctl
  if (platform === 'linux' && fs.existsSync(SYSTEMD_UNIT)) {
    const child = spawn('journalctl', ['--user', '-u', 'shooter.service', '-f', '--no-pager', '-n', '50'], {
      stdio: 'inherit',
    });
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
  version          Show version number
  help             Show this help message

Start options:
  -d, --daemon     Run in background (detach from terminal)
  --no-tunnel      Don't start a Cloudflare Tunnel

Examples:
  shooter                  Start the server + tunnel (foreground)
  shooter start -d         Start in background (daemon mode)
  shooter start --no-tunnel  Start without Cloudflare Tunnel
  shooter status           Check status and tunnel URL
  shooter autostart on     Enable autostart on login
  shooter logs             Follow server logs
  shooter setup            Quick setup (~60s, push deferred)
  shooter setup --push     Add iOS/Android push notifications
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
