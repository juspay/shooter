#!/usr/bin/env node
'use strict';

// pty-holder.cjs — Standalone detached process that owns a single PTY.
// Spawned by PtyManager via child_process.fork(). Communicates with the
// server over a Unix domain socket using ndjson (newline-delimited JSON).
//
// argv: id socketPath cwd cols rows command [args...]

const net = require('net');
const fs = require('fs');
const pty = require('node-pty');

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------

const [,, id, socketPath, cwd, colsStr, rowsStr, command, ...args] = process.argv;

if (!id || !socketPath || !cwd || !colsStr || !rowsStr || !command) {
  process.stderr.write('pty-holder: missing required arguments\n');
  process.exit(1);
}

const cols = parseInt(colsStr, 10);
const rows = parseInt(rowsStr, 10);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SCROLLBACK_LINES = 5000;
const MAX_INPUT_BYTES = 65_536; // 64 KB — cap per-write to prevent memory abuse
const GRACE_PERIOD_MS = 60_000; // 60 seconds after PTY exit before self-terminating
const ACTIVITY_IDLE_MS = 5_000; // 5 seconds of no output → idle

// ---------------------------------------------------------------------------
// Scrollback ring buffer
// ---------------------------------------------------------------------------

const scrollbackChunks = [];
let scrollbackLineCount = 0;

function pushScrollback(data) {
  const newLines = data.split('\n').length - 1;
  scrollbackChunks.push(data);
  scrollbackLineCount += newLines;

  while (scrollbackLineCount > MAX_SCROLLBACK_LINES && scrollbackChunks.length > 1) {
    const removed = scrollbackChunks.shift();
    if (removed) {
      scrollbackLineCount -= (removed.split('\n').length - 1);
    }
  }
}

function getScrollback() {
  return scrollbackChunks.join('');
}

// ---------------------------------------------------------------------------
// Clean up stale socket file
// ---------------------------------------------------------------------------

try {
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
} catch {
  // Ignore — may not exist or may be cleaned up already
}

// ---------------------------------------------------------------------------
// Shell hook injection for OSC 7
// ---------------------------------------------------------------------------

const os = require('os');
const path = require('path');

const OSC7_HOOK = `__shooter_osc7() { printf '\\033]7;file://%s%s\\033\\\\' "$(hostname)" "$PWD"; }`;

const SHELL_COMMANDS = ['zsh', 'bash', 'sh', 'fish'];
const commandBase = command.split('/').pop() || command;
const ptyEnv = { ...process.env };

// Clipboard image paste support: per-terminal clipboard directory
const clipboardDir = path.join(os.tmpdir(), `shooter-clipboard-${id}`);
try { fs.mkdirSync(clipboardDir, { recursive: true }); } catch { /* best effort */ }
ptyEnv.SHOOTER_CLIPBOARD_DIR = clipboardDir;

// Prepend clipboard shim scripts to PATH so tools find our xclip/wl-paste
const shimsDir = path.resolve(__dirname, '..', 'scripts', 'clipboard-shims');
// Also check relative to cwd for dev mode
const shimsDir2 = path.resolve(process.cwd(), 'scripts', 'clipboard-shims');
if (fs.existsSync(shimsDir)) {
  ptyEnv.PATH = `${shimsDir}:${ptyEnv.PATH || ''}`;
} else if (fs.existsSync(shimsDir2)) {
  ptyEnv.PATH = `${shimsDir2}:${ptyEnv.PATH || ''}`;
}

let spawnCommand;
let spawnArgs;

if (SHELL_COMMANDS.includes(commandBase)) {
  if (commandBase === 'zsh' || (commandBase === 'sh' && (process.env.SHELL || '').includes('zsh'))) {
    // zsh: use ZDOTDIR with custom .zshrc
    const zdotdir = path.join(os.tmpdir(), `shooter-zd-${id}`);
    try {
      fs.mkdirSync(zdotdir, { recursive: true });
      const realRc = path.join(process.env.HOME || '', '.zshrc');
      const rcContent = [
        `[ -f "${realRc}" ] && source "${realRc}"`,
        OSC7_HOOK,
        `precmd_functions+=(__shooter_osc7)`,
        '',
      ].join('\n');
      fs.writeFileSync(path.join(zdotdir, '.zshrc'), rcContent, 'utf8');
      ptyEnv.ZDOTDIR = zdotdir;
    } catch {
      // Best effort — shell will work without the hook
    }
    spawnCommand = command;
    spawnArgs = args;
  } else if (commandBase === 'bash') {
    // bash: use --rcfile
    const rcPath = path.join(os.tmpdir(), `shooter-rc-${id}.sh`);
    try {
      const realRc = path.join(process.env.HOME || '', '.bashrc');
      const rcContent = [
        `[ -f "${realRc}" ] && source "${realRc}"`,
        OSC7_HOOK,
        `PROMPT_COMMAND="__shooter_osc7\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"`,
        '',
      ].join('\n');
      fs.writeFileSync(rcPath, rcContent, 'utf8');
    } catch {
      // Best effort
    }
    spawnCommand = command;
    spawnArgs = ['--rcfile', rcPath, ...args];
  } else {
    // sh/fish: no hook injection
    spawnCommand = command;
    spawnArgs = args;
  }
} else {
  // Non-shell commands: wrap in login shell
  spawnCommand = null;
  spawnArgs = null;
}

// ---------------------------------------------------------------------------
// Spawn PTY
// ---------------------------------------------------------------------------

let ptyProcess;

if (spawnCommand) {
  // Interactive shell: spawn directly for proper rc injection
  ptyProcess = pty.spawn(spawnCommand, spawnArgs, {
    cols,
    rows,
    cwd,
    env: ptyEnv,
    name: 'xterm-color',
  });
} else {
  // Non-shell command: wrap in login shell as before
  const shell = process.env.SHELL || '/bin/zsh';
  const shellEscape = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;
  const fullCommand = [command, ...args].map(shellEscape).join(' ');
  ptyProcess = pty.spawn(shell, ['-l', '-c', fullCommand], {
    cols,
    rows,
    cwd,
    env: ptyEnv,
    name: 'xterm-color',
  });
}

let exited = false;
let exitCode = null;
let exitSignal = null;
let gracePeriodTimer = null;

// ---------------------------------------------------------------------------
// Connected clients (multiple concurrent sockets)
// ---------------------------------------------------------------------------

const clients = new Set();

function send(socket, msg) {
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch {
    // Socket may have been destroyed
  }
}

function broadcast(msg) {
  for (const socket of clients) {
    send(socket, msg);
  }
}

// ---------------------------------------------------------------------------
// OSC 7 CWD parsing
// ---------------------------------------------------------------------------

// Matches: \x1b]7;file://hostname/path\x1b\\ or \x1b]7;file://hostname/path\x07
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)\x07|\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)\x1b\\/g;

// Buffer for incomplete OSC 7 sequences split across data chunks
let osc7PartialBuf = '';

let currentCwd = cwd; // Initialize with launch cwd

function parseOsc7(data) {
  // Prepend any partial OSC 7 sequence from the previous chunk
  const combined = osc7PartialBuf + data;
  osc7PartialBuf = '';

  // Check for an incomplete trailing OSC 7 sequence (starts with \x1b]7; but
  // no terminator \x07 or \x1b\\ before end of data)
  const lastEsc = combined.lastIndexOf('\x1b]7;');
  if (lastEsc !== -1) {
    const afterEsc = combined.slice(lastEsc);
    if (!afterEsc.includes('\x07') && !afterEsc.includes('\x1b\\')) {
      // Incomplete sequence — buffer it for the next chunk
      osc7PartialBuf = afterEsc;
      // Only parse the portion before the incomplete sequence
      if (lastEsc === 0) return;
    }
  }

  const toParse = osc7PartialBuf.length > 0 ? combined.slice(0, -osc7PartialBuf.length) : combined;

  let match;
  let lastPath = null;
  OSC7_RE.lastIndex = 0;
  while ((match = OSC7_RE.exec(toParse)) !== null) {
    const rawPath = match[1] || match[2] || '';
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      // Malformed percent-encoding — use the raw path as fallback
      decoded = rawPath;
    }
    if (decoded) lastPath = decoded;
  }
  if (lastPath && lastPath !== currentCwd) {
    currentCwd = lastPath;
    broadcast({ type: 'cwd', path: currentCwd });
  }
}

// ---------------------------------------------------------------------------
// Activity tracking
// ---------------------------------------------------------------------------

let isActive = false;
let activityTimer = null;

function touchActivity() {
  if (!isActive) {
    isActive = true;
    broadcast({ type: 'activity', active: true });
  }
  if (activityTimer) clearTimeout(activityTimer);
  activityTimer = setTimeout(() => {
    isActive = false;
    activityTimer = null;
    broadcast({ type: 'activity', active: false });
  }, ACTIVITY_IDLE_MS);
}

// ---------------------------------------------------------------------------
// PTY event handlers
// ---------------------------------------------------------------------------

ptyProcess.onData((data) => {
  pushScrollback(data);
  touchActivity();
  parseOsc7(data);
  broadcast({ type: 'output', data });
});

ptyProcess.onExit(({ exitCode: code, signal }) => {
  exited = true;
  exitCode = code ?? null;
  exitSignal = signal != null ? String(signal) : null;

  broadcast({ type: 'exit', code: exitCode, signal: exitSignal });

  // Write sidecar exit file so the server can detect exits that happened
  // while it was disconnected.
  try {
    const exitData = JSON.stringify({ code: exitCode, timestamp: Date.now() });
    fs.writeFileSync(socketPath + '.exit', exitData, 'utf8');
  } catch {
    // Best effort
  }

  // Grace period: stay alive so the server can reconnect and read exit info
  gracePeriodTimer = setTimeout(() => {
    cleanupAndExit();
  }, GRACE_PERIOD_MS);
});

// ---------------------------------------------------------------------------
// Unix domain socket server
// ---------------------------------------------------------------------------

const server = net.createServer((socket) => {
  clients.add(socket);

  // On connect: send current state, activity, cwd, and scrollback
  send(socket, { type: 'info', pid: ptyProcess.pid, exited, exitCode });
  send(socket, { type: 'activity', active: isActive });
  if (currentCwd) {
    send(socket, { type: 'cwd', path: currentCwd });
  }

  const sb = getScrollback();
  if (sb.length > 0) {
    send(socket, { type: 'scrollback', data: sb });
  }

  // If PTY already exited, send exit message and cancel grace timer
  if (exited) {
    send(socket, { type: 'exit', code: exitCode, signal: exitSignal });

    // Cancel grace period — server has reconnected and received exit info
    if (gracePeriodTimer) {
      clearTimeout(gracePeriodTimer);
      gracePeriodTimer = null;
    }

    // Server connected during grace period — it gets exit info via protocol,
    // so delete the sidecar file.
    try {
      const exitFilePath = socketPath + '.exit';
      if (fs.existsSync(exitFilePath)) {
        fs.unlinkSync(exitFilePath);
      }
    } catch {
      // Best effort
    }
  }

  // ndjson line buffer for incoming messages
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;

      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // Skip malformed messages
      }

      handleMessage(msg);
    }
  });

  socket.on('error', () => {
    clients.delete(socket);
  });

  socket.on('close', () => {
    clients.delete(socket);
  });
});

function handleMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'input':
      // Security note: writing user-provided data to PTY stdin IS the intended
      // behaviour — this is a remote terminal, so input by definition comes from
      // the user.  We validate type (must be string) and cap size to satisfy
      // static-analysis scanners and prevent memory abuse.
      if (!exited && typeof msg.data === 'string' && msg.data.length > 0) {
        try {
          const input = msg.data.length > MAX_INPUT_BYTES
            ? msg.data.slice(0, MAX_INPUT_BYTES)
            : msg.data;
          ptyProcess.write(input); // CodeQL[js/code-injection] — intentional PTY stdin
        } catch {
          // PTY may have closed between check and write
        }
      }
      break;

    case 'resize':
      if (!exited && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
        try {
          ptyProcess.resize(msg.cols, msg.rows);
        } catch {
          // PTY may have closed
        }
      }
      break;

    case 'kill': {
      if (!exited) {
        const sig = msg.signal || 'SIGTERM';
        try {
          process.kill(ptyProcess.pid, sig);
        } catch {
          // Process may already be gone
        }
      }
      break;
    }
  }
}

server.on('error', (err) => {
  process.stderr.write(`pty-holder: socket server error: ${err.message}\n`);
  cleanupAndExit();
});

server.listen(socketPath, () => {
  // Signal parent that the holder is ready
  if (typeof process.send === 'function') {
    process.send({ type: 'ready' });
  }
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanupAndExit() {
  // Close all client sockets
  for (const socket of clients) {
    try {
      socket.destroy();
    } catch {
      // Best effort
    }
  }
  clients.clear();

  // Close the socket server
  try {
    server.close();
  } catch {
    // Best effort
  }

  // Delete the socket file
  try {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  } catch {
    // Best effort
  }

  // Clean up shell hook temp files
  try {
    const zdotdir = path.join(os.tmpdir(), `shooter-zd-${id}`);
    const rcPath = path.join(os.tmpdir(), `shooter-rc-${id}.sh`);
    if (fs.existsSync(path.join(zdotdir, '.zshrc'))) {
      fs.unlinkSync(path.join(zdotdir, '.zshrc'));
      fs.rmdirSync(zdotdir);
    }
    if (fs.existsSync(rcPath)) {
      fs.unlinkSync(rcPath);
    }
  } catch {
    // Best effort
  }

  // Clean up clipboard directory
  try {
    const clipImg = path.join(clipboardDir, 'image.png');
    if (fs.existsSync(clipImg)) fs.unlinkSync(clipImg);
    if (fs.existsSync(clipboardDir)) fs.rmdirSync(clipboardDir);
  } catch {
    // Best effort
  }

  process.exit(0);
}

// Handle signals for clean shutdown
process.on('SIGTERM', cleanupAndExit);
process.on('SIGINT', cleanupAndExit);

// Prevent unhandled exceptions from crashing silently
process.on('uncaughtException', (err) => {
  process.stderr.write(`pty-holder[${id}]: uncaught exception: ${err.message}\n`);
  cleanupAndExit();
});

process.on('unhandledRejection', (err) => {
  process.stderr.write(`pty-holder[${id}]: unhandled rejection: ${err}\n`);
});
