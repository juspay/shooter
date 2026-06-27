/**
 * Unit tests for bin/lib/service-manager.cjs.
 *
 * Pure decider tests (resolveStartAction / resolveStopAction) and unit-file
 * generation tests (buildLaunchdPlist / buildSystemdUnit). No real launchctl
 * or systemctl interaction.
 */

'use strict';

const {
  resolveStartAction,
  resolveStopAction,
  buildLaunchdPlist,
  buildSystemdUnit,
} = require('../bin/lib/service-manager.cjs');

let passed = 0;
let failed = 0;
const failures = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
    failed++;
    failures.push({ name, err });
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── resolveStartAction ──────────────────────────────────────────────
//
// A process spawned by the service manager (managed=true) always runs the
// server directly — this is what prevents the ExecStart `shooter start` from
// recursively delegating to itself. An unmanaged (real CLI) invocation
// delegates to the installed manager; with no manager installed it runs
// directly (dev mode).

runTest('resolveStartAction: managed instance always runs the server directly', () => {
  assertEqual(
    resolveStartAction({ managed: true, agentInstalled: true, platform: 'darwin' }),
    'run-server',
    'managed darwin'
  );
  assertEqual(
    resolveStartAction({ managed: true, agentInstalled: true, platform: 'linux' }),
    'run-server',
    'managed linux'
  );
});

runTest('resolveStartAction: unmanaged with no unit installed runs directly (dev)', () => {
  assertEqual(
    resolveStartAction({ managed: false, agentInstalled: false, platform: 'darwin' }),
    'run-server',
    'dev darwin'
  );
  assertEqual(
    resolveStartAction({ managed: false, agentInstalled: false, platform: 'linux' }),
    'run-server',
    'dev linux'
  );
});

runTest('resolveStartAction: unmanaged CLI with a unit installed delegates to the manager', () => {
  assertEqual(
    resolveStartAction({ managed: false, agentInstalled: true, platform: 'darwin' }),
    'delegate-launchd',
    'darwin delegates to launchd'
  );
  assertEqual(
    resolveStartAction({ managed: false, agentInstalled: true, platform: 'linux' }),
    'delegate-systemd',
    'linux delegates to systemd'
  );
});

runTest('resolveStartAction: unknown platform never delegates', () => {
  assertEqual(
    resolveStartAction({ managed: false, agentInstalled: true, platform: 'win32' }),
    'run-server',
    'win32 runs directly'
  );
});

runTest('resolveStartAction: runtime overrides (--port/--daemon/--no-tunnel) run directly', () => {
  // A one-off invocation with start flags the static unit can't honour must run
  // the server directly rather than delegate and silently drop the flags.
  assertEqual(
    resolveStartAction({
      managed: false,
      agentInstalled: true,
      platform: 'darwin',
      hasRuntimeOverrides: true,
    }),
    'run-server',
    'darwin with overrides runs directly'
  );
  assertEqual(
    resolveStartAction({
      managed: false,
      agentInstalled: true,
      platform: 'linux',
      hasRuntimeOverrides: true,
    }),
    'run-server',
    'linux with overrides runs directly'
  );
  // No overrides → still delegates.
  assertEqual(
    resolveStartAction({
      managed: false,
      agentInstalled: true,
      platform: 'darwin',
      hasRuntimeOverrides: false,
    }),
    'delegate-launchd',
    'no overrides still delegates'
  );
});

// ── resolveStopAction ───────────────────────────────────────────────
//
// When a manager owns the service, a deliberate stop removes the job from the
// manager (bootout / systemctl stop) so KeepAlive/Restart can't resurrect it.
// In dev (no manager) we fall back to killing the pidfile process.

runTest('resolveStopAction: no manager falls back to pid-kill', () => {
  assertEqual(
    resolveStopAction({ agentManaging: false, platform: 'darwin' }),
    'pid-kill',
    'darwin dev'
  );
  assertEqual(
    resolveStopAction({ agentManaging: false, platform: 'linux' }),
    'pid-kill',
    'linux dev'
  );
});

runTest('resolveStopAction: managed service stops via the manager', () => {
  assertEqual(
    resolveStopAction({ agentManaging: true, platform: 'darwin' }),
    'bootout',
    'darwin bootout'
  );
  assertEqual(
    resolveStopAction({ agentManaging: true, platform: 'linux' }),
    'systemctl-stop',
    'linux systemctl stop'
  );
});

runTest('resolveStopAction: unknown platform falls back to pid-kill', () => {
  assertEqual(
    resolveStopAction({ agentManaging: true, platform: 'win32' }),
    'pid-kill',
    'win32 pid-kill'
  );
});

// ── buildLaunchdPlist ───────────────────────────────────────────────

const PLIST_ARGS = {
  label: 'com.juspay.shooter',
  nodeBin: '/usr/local/bin/node',
  shooterBin: '/pkg/bin/shooter.cjs',
  pkgRoot: '/pkg',
  pathEnv: '/usr/local/bin:/usr/bin:/bin',
  shooterHome: '/home/.shooter',
  logFile: '/home/.shooter/logs/shooter.log',
};

runTest('buildLaunchdPlist: KeepAlive is unconditional (true), not SuccessfulExit-gated', () => {
  const plist = buildLaunchdPlist(PLIST_ARGS);
  assertTrue(
    /<key>KeepAlive<\/key>\s*<true\/>/.test(plist),
    'KeepAlive should be <true/> so any clean exit still restarts'
  );
  assertTrue(
    !plist.includes('SuccessfulExit'),
    'SuccessfulExit gating must be gone (that is the bug being fixed)'
  );
});

runTest('buildLaunchdPlist: injects the SHOOTER_MANAGED=1 marker', () => {
  const plist = buildLaunchdPlist(PLIST_ARGS);
  assertTrue(
    /<key>SHOOTER_MANAGED<\/key>\s*<string>1<\/string>/.test(plist),
    'marker env distinguishes the manager-spawned instance from a CLI invocation'
  );
});

runTest('buildLaunchdPlist: keeps RunAtLoad and the start ProgramArguments', () => {
  const plist = buildLaunchdPlist(PLIST_ARGS);
  assertTrue(/<key>RunAtLoad<\/key>\s*<true\/>/.test(plist), 'RunAtLoad retained');
  assertTrue(plist.includes('<string>/pkg/bin/shooter.cjs</string>'), 'shooterBin in args');
  assertTrue(plist.includes('<string>start</string>'), 'start subcommand in args');
  assertTrue(plist.includes('<string>com.juspay.shooter</string>'), 'label present');
});

runTest('buildLaunchdPlist: XML-escapes &, <, and > in interpolated paths', () => {
  const plist = buildLaunchdPlist({ ...PLIST_ARGS, pkgRoot: '/p<a>&b' });
  assertTrue(
    plist.includes('<string>/p&lt;a&gt;&amp;b</string>'),
    '<, >, and & are all escaped in the WorkingDirectory path'
  );
  assertTrue(!/<string>[^<]*&b<\/string>/.test(plist), 'no raw & inside a <string>');
});

// ── buildSystemdUnit ────────────────────────────────────────────────

const UNIT_ARGS = {
  nodeBin: '/usr/bin/node',
  shooterBin: '/pkg/bin/shooter.cjs',
  pkgRoot: '/pkg',
  shooterHome: '/home/.shooter',
};

runTest('buildSystemdUnit: Restart=always (not on-failure) so clean exits recover', () => {
  const unit = buildSystemdUnit(UNIT_ARGS);
  assertTrue(/^Restart=always$/m.test(unit), 'Restart=always');
  assertTrue(!unit.includes('Restart=on-failure'), 'on-failure removed');
});

runTest('buildSystemdUnit: injects the SHOOTER_MANAGED=1 marker', () => {
  const unit = buildSystemdUnit(UNIT_ARGS);
  assertTrue(unit.includes('Environment="SHOOTER_MANAGED=1"'), 'marker env present');
});

// Documents the quoting contract: each ExecStart token and the Environment value
// are wrapped in double quotes at their boundary, which systemd strips
// (EXTRACT_UNQUOTE) so a path containing spaces stays a single argument.
runTest('buildSystemdUnit: double-quotes ExecStart tokens so spaced paths stay one arg', () => {
  const unit = buildSystemdUnit({
    nodeBin: '/home/John Doe/.nvm/node',
    shooterBin: '/home/John Doe/.local/bin/shooter.cjs',
    pkgRoot: '/home/John Doe/projects/shooter',
    shooterHome: '/home/John Doe/.shooter',
  });
  assertTrue(
    unit.includes(
      'ExecStart="/home/John Doe/.nvm/node" "/home/John Doe/.local/bin/shooter.cjs" start'
    ),
    'each ExecStart token is double-quoted at its boundary'
  );
  assertTrue(
    unit.includes('Environment="SHOOTER_HOME=/home/John Doe/.shooter"'),
    'Environment value with spaces is double-quoted'
  );
});

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
