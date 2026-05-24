// Named-tunnel auto-discovery and self-heal for cloudflared.
//
// On macOS, scans ~/.cloudflared/*.yml for tunnel configs that proxy a
// shooter-matching localhost port, then correlates them with LaunchAgents
// in ~/Library/LaunchAgents/*.plist that run `cloudflared tunnel ... run`
// against the same config. If a discovered LaunchAgent points to a stale
// cloudflared binary (e.g. an Intel Homebrew path after migrating to
// Apple Silicon), the plist is rewritten in-place against `which
// cloudflared` and reloaded via `launchctl bootout` + `bootstrap`.
//
// The Linux variant is intentionally limited to discovery (no auto-heal
// of systemd units yet); shooter on Linux primarily uses the quick-tunnel
// flow today.

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const CLOUDFLARED_DIR = path.join(os.homedir(), '.cloudflared');
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');

// ── YAML parsing (intentionally minimal) ────────────────────────────
//
// Cloudflared tunnel configs are flat enough that we don't need a full
// YAML library. We extract only:
//   - tunnel: <uuid>
//   - credentials-file: <path>
//   - ingress: [{ hostname, service, path? }, ...]
function parseCloudflaredConfig(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const out = { tunnel: null, credentialsFile: null, ingress: [] };
  let inIngress = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (!inIngress) {
      const tunnel = line.match(/^tunnel:\s*(\S+)/);
      if (tunnel) {
        out.tunnel = tunnel[1].replace(/^["']|["']$/g, '');
        continue;
      }
      const creds = line.match(/^credentials-file:\s*(\S+)/);
      if (creds) {
        out.credentialsFile = creds[1].replace(/^["']|["']$/g, '');
        continue;
      }
      if (/^ingress:\s*$/.test(line)) {
        inIngress = true;
        continue;
      }
      continue;
    }

    // We're inside ingress:
    if (/^[A-Za-z]/.test(line)) {
      // A new top-level key terminates the ingress block.
      if (current) out.ingress.push(current);
      current = null;
      inIngress = false;
      continue;
    }
    const itemStart = line.match(/^\s*-\s*(\S+):\s*(.*)$/);
    if (itemStart) {
      if (current) out.ingress.push(current);
      current = {};
      current[itemStart[1]] = itemStart[2].replace(/^["']|["']$/g, '');
      continue;
    }
    const cont = line.match(/^\s+(\S+):\s*(.*)$/);
    if (cont && current) {
      current[cont[1]] = cont[2].replace(/^["']|["']$/g, '');
    }
  }
  if (current) out.ingress.push(current);
  return out;
}

// ── plist parsing (intentionally minimal) ───────────────────────────
//
// Apple's plist format supports XML and binary; LaunchAgents written by
// hand or by `cloudflared service install` are XML. We extract:
//   - Label
//   - ProgramArguments[] (array of string children of the array)
//
// Entities (&amp;, &lt;, &gt;, &quot;, &apos;) are decoded so the
// captured values round-trip with rewritePlistBinaryPath (which encodes
// the same five) and compare correctly against on-disk paths used by
// e.g. `programArguments.includes(cfg.path)`.
function xmlUnescapeText(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // last so we don't double-decode
}

function parseLaunchAgentPlist(xml) {
  const out = { label: null, programArguments: [] };

  const labelMatch = xml.match(/<key>\s*Label\s*<\/key>\s*<string>([^<]*)<\/string>/);
  if (labelMatch) out.label = xmlUnescapeText(labelMatch[1]);

  const argsBlock = xml.match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (argsBlock) {
    const strs = argsBlock[1].matchAll(/<string>([^<]*)<\/string>/g);
    for (const m of strs) out.programArguments.push(xmlUnescapeText(m[1]));
  }
  return out;
}

// ── filesystem scans ────────────────────────────────────────────────

function listCloudflaredConfigs() {
  try {
    return fs
      .readdirSync(CLOUDFLARED_DIR)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => path.join(CLOUDFLARED_DIR, f));
  } catch {
    return [];
  }
}

function listLaunchAgents() {
  try {
    return fs
      .readdirSync(LAUNCH_AGENTS_DIR)
      .filter((f) => f.endsWith('.plist'))
      .map((f) => path.join(LAUNCH_AGENTS_DIR, f));
  } catch {
    return [];
  }
}

function listSystemdUserUnits() {
  try {
    return fs
      .readdirSync(SYSTEMD_USER_DIR)
      .filter((f) => f.endsWith('.service'))
      .map((f) => path.join(SYSTEMD_USER_DIR, f));
  } catch {
    return [];
  }
}

// ── matching ────────────────────────────────────────────────────────

function ingressMatchesPort(ingress, port) {
  if (!ingress) return false;
  const wanted = parseInt(port, 10);
  if (isNaN(wanted)) return false;
  for (const item of ingress) {
    const svc = item.service || '';
    // Only http[s] ingress with localhost / 127.0.0.1 host; compare the
    // port numerically to avoid substring false-positives (e.g. port 80
    // matching localhost:8080).
    const m = svc.match(/^https?:\/\/(localhost|127\.0\.0\.1):(\d+)(?:\/|\?|#|$)/);
    if (m && parseInt(m[2], 10) === wanted) return true;
  }
  return false;
}

// When `port` is supplied, return the hostname of the ingress entry whose
// service actually targets that port — important when one tunnel routes
// several hostnames to several local ports. Falls back to the first
// hostname only if no entry matches (preserves the old behavior for
// callers that don't pass a port).
function hostnameFromIngress(ingress, port) {
  if (!ingress) return null;
  if (port != null) {
    for (const item of ingress) {
      if (item.hostname && ingressMatchesPort([item], port)) return item.hostname;
    }
  }
  for (const item of ingress) {
    if (item.hostname) return item.hostname;
  }
  return null;
}

// ── launchctl state ─────────────────────────────────────────────────

// Launchd labels are reverse-DNS strings; restrict to a conservative
// charset so a hostile plist Label can't influence argv parsing even
// though we already avoid the shell.
const LAUNCHD_LABEL_RE = /^[A-Za-z0-9._-]+$/;

function getLaunchctlState(label) {
  if (!label || !LAUNCHD_LABEL_RE.test(label)) {
    return { loaded: false, state: null, pid: null, lastExitCode: null };
  }
  try {
    const uid = process.getuid
      ? process.getuid()
      : execFileSync('id', ['-u'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    const out = execFileSync('launchctl', ['print', `gui/${uid}/${label}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const stateMatch = out.match(/^\s*state\s*=\s*(\S+)/m);
    const pidMatch = out.match(/^\s*pid\s*=\s*(\d+)/m);
    const exitMatch = out.match(/^\s*last exit code\s*=\s*(.+)$/m);
    return {
      loaded: true,
      state: stateMatch ? stateMatch[1] : null,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
      lastExitCode: exitMatch ? exitMatch[1] : null,
    };
  } catch {
    return { loaded: false, state: null, pid: null, lastExitCode: null };
  }
}

// ── binary path validation ──────────────────────────────────────────

function isExecutable(p) {
  try {
    // Resolve through symlinks; if the chain dangles, fs.statSync throws.
    fs.statSync(p);
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCloudflaredBinary() {
  // Prefer `which`, falling back to common Homebrew prefixes. We never
  // return a path that doesn't actually exist.
  try {
    const p = execFileSync('which', ['cloudflared'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (p && isExecutable(p)) return p;
  } catch {}
  for (const candidate of [
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
  ]) {
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

// ── discovery (public) ──────────────────────────────────────────────
//
// Returns an array of NamedTunnel records:
// {
//   kind: 'launchd' | 'systemd',
//   label,
//   unitPath,               // .plist on macOS, .service on Linux
//   configPath,
//   hostname, port,
//   binaryPath,             // what the unit *currently* says
//   binaryPathHealthy,      // does that file exist + execute?
//   tunnelUuid, credentialsFile,
//   launch: { loaded, state, pid, lastExitCode } | null,
// }
function discoverNamedTunnels(port) {
  const platform = os.platform();
  const configs = listCloudflaredConfigs()
    .map((p) => {
      try {
        return { path: p, data: parseCloudflaredConfig(fs.readFileSync(p, 'utf8')) };
      } catch {
        return null;
      }
    })
    .filter((c) => c && ingressMatchesPort(c.data.ingress, port));

  if (configs.length === 0) return [];

  if (platform === 'darwin') {
    const agents = listLaunchAgents()
      .map((p) => {
        try {
          return { path: p, data: parseLaunchAgentPlist(fs.readFileSync(p, 'utf8')) };
        } catch {
          return null;
        }
      })
      .filter(
        (a) =>
          a && a.data.programArguments.length > 0 && /cloudflared$/.test(a.data.programArguments[0])
      );

    const tunnels = [];
    for (const cfg of configs) {
      const agent = agents.find((a) => a.data.programArguments.includes(cfg.path));
      if (!agent) continue;
      const binaryPath = agent.data.programArguments[0];
      const launch = agent.data.label ? getLaunchctlState(agent.data.label) : null;
      tunnels.push({
        kind: 'launchd',
        label: agent.data.label,
        unitPath: agent.path,
        configPath: cfg.path,
        hostname: hostnameFromIngress(cfg.data.ingress, port),
        port,
        binaryPath,
        binaryPathHealthy: isExecutable(binaryPath),
        tunnelUuid: cfg.data.tunnel,
        credentialsFile: cfg.data.credentialsFile,
        launch,
      });
    }
    return tunnels;
  }

  if (platform === 'linux') {
    const units = listSystemdUserUnits()
      .map((p) => {
        try {
          return { path: p, contents: fs.readFileSync(p, 'utf8') };
        } catch {
          return null;
        }
      })
      .filter((u) => u && /cloudflared\b.*\btunnel\b/.test(u.contents));

    const tunnels = [];
    for (const cfg of configs) {
      const unit = units.find((u) => u.contents.includes(cfg.path));
      if (!unit) continue;
      const execMatch = unit.contents.match(/ExecStart\s*=\s*(\S+)/);
      const rawBinary = execMatch ? execMatch[1] : 'cloudflared';
      // systemd unit files commonly use a bare command name
      // (`ExecStart=cloudflared …`) and resolve it via $PATH at exec
      // time. `isExecutable` does a literal stat, so a bare name would
      // always report unhealthy. Resolve to a real path first.
      const binaryPath = rawBinary.includes('/')
        ? rawBinary
        : resolveCloudflaredBinary() || rawBinary;
      tunnels.push({
        kind: 'systemd',
        label: path.basename(unit.path, '.service'),
        unitPath: unit.path,
        configPath: cfg.path,
        hostname: hostnameFromIngress(cfg.data.ingress, port),
        port,
        binaryPath,
        binaryPathHealthy: isExecutable(binaryPath),
        tunnelUuid: cfg.data.tunnel,
        credentialsFile: cfg.data.credentialsFile,
        launch: null, // systemctl status integration is deferred
      });
    }
    return tunnels;
  }

  return [];
}

// ── self-heal ───────────────────────────────────────────────────────
//
// Rewrites the plist's first <string> under ProgramArguments (the
// program path) to `newPath`. We write a `.bak` copy first; the
// rewrite uses a string slice rather than an XML library to preserve
// the file's exact formatting / quirks. `newPath` is XML-escaped so a
// filesystem path containing `&`, `<`, or `>` can't corrupt the plist.
function xmlEscapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rewritePlistBinaryPath(plistPath, oldPath, newPath) {
  const xml = fs.readFileSync(plistPath, 'utf8');
  // Locate the first <string>...</string> inside ProgramArguments.
  const argsStart = xml.indexOf('<key>ProgramArguments</key>');
  if (argsStart < 0) {
    throw new Error(`No ProgramArguments key in ${plistPath}`);
  }
  const arrayOpen = xml.indexOf('<array>', argsStart);
  if (arrayOpen < 0) throw new Error(`No <array> after ProgramArguments`);
  const firstStringOpen = xml.indexOf('<string>', arrayOpen);
  const firstStringClose = xml.indexOf('</string>', firstStringOpen);
  if (firstStringOpen < 0 || firstStringClose < 0) {
    throw new Error(`Malformed ProgramArguments array`);
  }
  const existingRaw = xml.slice(firstStringOpen + '<string>'.length, firstStringClose);
  // Compare in the decoded domain so paths containing XML special chars
  // round-trip with parseLaunchAgentPlist (which decodes the same entities).
  const existing = xmlUnescapeText(existingRaw);
  if (existing !== oldPath) {
    throw new Error(`ProgramArguments[0] is ${existing}, expected ${oldPath} — refusing to heal`);
  }
  const next =
    xml.slice(0, firstStringOpen + '<string>'.length) +
    xmlEscapeText(newPath) +
    xml.slice(firstStringClose);

  fs.writeFileSync(plistPath + '.bak', xml);
  fs.writeFileSync(plistPath, next);
}

function reloadLaunchAgent(plistPath, label) {
  const uid = process.getuid
    ? process.getuid()
    : execFileSync('id', ['-u'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
  // bootout may fail if not loaded; ignore.
  try {
    execFileSync('launchctl', ['bootout', `gui/${uid}/${label}`], {
      stdio: 'ignore',
    });
  } catch {}
  execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], {
    stdio: 'ignore',
  });
}

function kickstartLaunchAgent(label) {
  const uid = process.getuid
    ? process.getuid()
    : execFileSync('id', ['-u'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
  try {
    execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`], {
      stdio: 'ignore',
    });
  } catch {}
}

// Heal-and-ensure-running. Returns one of:
//   { action: 'healed', from, to }
//   { action: 'reloaded' }   - was loaded, kickstarted
//   { action: 'started' }    - was not loaded, bootstrapped
//   { action: 'ok' }         - already running, nothing done
//   { action: 'failed', reason }
function healAndEnsureRunning(tunnel) {
  if (tunnel.kind !== 'launchd') {
    return { action: 'ok' }; // systemd auto-heal is out of scope
  }
  try {
    if (!tunnel.binaryPathHealthy) {
      const realPath = resolveCloudflaredBinary();
      if (!realPath) {
        return {
          action: 'failed',
          reason: 'cloudflared binary not found on PATH',
        };
      }
      rewritePlistBinaryPath(tunnel.unitPath, tunnel.binaryPath, realPath);
      reloadLaunchAgent(tunnel.unitPath, tunnel.label);
      return { action: 'healed', from: tunnel.binaryPath, to: realPath };
    }

    if (!tunnel.launch || !tunnel.launch.loaded) {
      reloadLaunchAgent(tunnel.unitPath, tunnel.label);
      return { action: 'started' };
    }
    if (tunnel.launch.state !== 'running') {
      kickstartLaunchAgent(tunnel.label);
      return { action: 'reloaded' };
    }
    return { action: 'ok' };
  } catch (err) {
    return { action: 'failed', reason: err.message };
  }
}

// ── reachability ────────────────────────────────────────────────────
//
// Curl the public URL with a short timeout. We use curl directly for
// the same reason apn.ts does: native http modules occasionally fail
// at TLS on this user's Node.
function probeReachability(url, timeoutMs = 5000) {
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '--max-time',
        String(Math.ceil(timeoutMs / 1000)),
        url,
      ],
      { encoding: 'utf8', timeout: timeoutMs + 2000 }
    ).trim();
    const code = parseInt(out, 10);
    return { ok: code >= 200 && code < 500, status: isNaN(code) ? null : code };
  } catch {
    return { ok: false, status: null };
  }
}

module.exports = {
  discoverNamedTunnels,
  healAndEnsureRunning,
  probeReachability,
  resolveCloudflaredBinary,
  xmlEscapeText,
  // exported for tests
  parseCloudflaredConfig,
  parseLaunchAgentPlist,
  rewritePlistBinaryPath,
  ingressMatchesPort,
  hostnameFromIngress,
};
