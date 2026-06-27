// Service-manager lifecycle helpers for the `shooter` CLI.
//
// Background: the LaunchAgent/systemd unit runs `shooter start` in the
// foreground. The old plist used KeepAlive={SuccessfulExit:false}, so a clean
// SIGTERM (the parent forwards it, the server exits 0) was treated as a
// successful exit and deliberately NOT restarted — any clean stop killed the
// daemon until the next login.
//
// Fix: let the service manager own restart. KeepAlive=true / Restart=always
// restart on ANY exit; a deliberate stop is expressed by removing the job from
// the manager (`launchctl bootout` / `systemctl stop`), not by exit code.
//
// This module holds the pure decision logic and unit-file generation so they
// can be unit-tested without touching launchctl/systemctl. The impure plumbing
// (running launchctl, detecting managed context) stays in bin/shooter.cjs.

'use strict';

const { xmlEscapeText } = require('./tunnel-discovery.cjs');

// Env marker injected into the generated unit so the manager-spawned
// `shooter start` runs the server directly instead of recursively delegating.
const MANAGED_ENV = 'SHOOTER_MANAGED';

/**
 * Decide what `shooter start` should do.
 *
 * @param {object} o
 * @param {boolean} o.managed             - this process was spawned by the manager
 * @param {boolean} o.agentInstalled      - a unit file for the service exists on disk
 * @param {string}  o.platform            - process.platform / os.platform()
 * @param {boolean} [o.hasRuntimeOverrides] - start flags (--port/--daemon/--no-tunnel) the static unit can't honour
 * @returns {'run-server'|'delegate-launchd'|'delegate-systemd'}
 */
function resolveStartAction({ managed, agentInstalled, platform, hasRuntimeOverrides }) {
  // The manager-spawned instance must run the server directly — otherwise the
  // unit's `shooter start` would delegate to itself forever.
  if (managed) return 'run-server';
  // No unit installed → dev/manual run; just run the server.
  if (!agentInstalled) return 'run-server';
  // A one-off invocation carrying start flags the static unit can't express
  // (--port/--daemon/--no-tunnel) must run directly rather than delegate and
  // silently drop them.
  if (hasRuntimeOverrides) return 'run-server';
  // A real CLI invocation with a unit installed: hand off to the manager so the
  // OS owns restart (and a prior `stop`/bootout gets re-bootstrapped).
  if (platform === 'darwin') return 'delegate-launchd';
  if (platform === 'linux') return 'delegate-systemd';
  return 'run-server';
}

/**
 * Decide what `shooter stop` should do.
 *
 * @param {object} o
 * @param {boolean} o.agentManaging - a manager currently owns the service
 * @param {string}  o.platform      - process.platform / os.platform()
 * @returns {'bootout'|'systemctl-stop'|'pid-kill'}
 */
function resolveStopAction({ agentManaging, platform }) {
  // Dev/manual run (no manager) → kill the pidfile process.
  if (!agentManaging) return 'pid-kill';
  // Remove the job from the manager so KeepAlive/Restart can't resurrect it.
  if (platform === 'darwin') return 'bootout';
  if (platform === 'linux') return 'systemctl-stop';
  return 'pid-kill';
}

/**
 * Build the macOS LaunchAgent plist.
 *
 * KeepAlive is unconditional (`<true/>`) so any exit — crash, kill, or an
 * accidental clean SIGTERM — is restarted. The SHOOTER_MANAGED marker lets the
 * spawned instance know not to re-delegate.
 */
function buildLaunchdPlist({ label, nodeBin, shooterBin, pkgRoot, pathEnv, shooterHome, logFile }) {
  const e = xmlEscapeText;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${e(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${e(nodeBin)}</string>
    <string>${e(shooterBin)}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${e(pkgRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${e(pathEnv)}</string>
    <key>SHOOTER_HOME</key>
    <string>${e(shooterHome)}</string>
    <key>${MANAGED_ENV}</key>
    <string>1</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${e(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${e(logFile)}</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>`;
}

/**
 * Build the Linux systemd user unit.
 *
 * Restart=always (not on-failure) so a clean exit also recovers; a deliberate
 * `systemctl --user stop` keeps it stopped. The SHOOTER_MANAGED marker mirrors
 * the launchd path.
 */
function buildSystemdUnit({ nodeBin, shooterBin, pkgRoot, shooterHome }) {
  return `[Unit]
Description=Shooter — Mobile dev notifications & remote terminal
After=network.target

[Service]
Type=simple
ExecStart="${nodeBin}" "${shooterBin}" start
WorkingDirectory="${pkgRoot}"
Environment="SHOOTER_HOME=${shooterHome}"
Environment="${MANAGED_ENV}=1"
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`;
}

module.exports = {
  MANAGED_ENV,
  resolveStartAction,
  resolveStopAction,
  buildLaunchdPlist,
  buildSystemdUnit,
};
