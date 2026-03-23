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
// Spawn PTY
// ---------------------------------------------------------------------------

const shell = process.env.SHELL || '/bin/zsh';
const shellEscape = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;
const fullCommand = [command, ...args].map(shellEscape).join(' ');

const ptyProcess = pty.spawn(shell, ['-l', '-c', fullCommand], {
  cols,
  rows,
  cwd,
  env: { ...process.env },
  name: 'xterm-color',
});

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
// PTY event handlers
// ---------------------------------------------------------------------------

ptyProcess.onData((data) => {
  pushScrollback(data);
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

  // On connect: send current state and scrollback
  send(socket, { type: 'info', pid: ptyProcess.pid, exited, exitCode });

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
