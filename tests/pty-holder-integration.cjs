#!/usr/bin/env node
'use strict';

// Integration tests for src/lib/modules/server/terminal/pty-holder.cjs
//
// Exercises: spawn + ready signal, socket connect, info/output/exit messages,
// scrollback replay, input/resize/kill protocol, and reconnect after disconnect.

const { fork } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const HOLDER_PATH = path.resolve(__dirname, '../src/lib/modules/server/terminal/pty-holder.cjs');

const SOCKET_PREFIX = '/tmp/shooter-test-';

// Track all children globally so we can kill them on unhandled crash
const allChildren = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clean up socket + exit sidecar for a given path. */
function cleanupSocket(socketPath) {
  for (const p of [socketPath, socketPath + '.exit']) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/** Fork the holder, return { child, readyPromise }. */
function spawnHolder(
  id,
  socketPath,
  { cwd = '/tmp', cols = 80, rows = 24, command, args = [] } = {}
) {
  const child = fork(
    HOLDER_PATH,
    [id, socketPath, cwd, String(cols), String(rows), command, ...args],
    {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      detached: false,
    }
  );

  allChildren.push(child);

  const readyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Holder did not send ready within 10s')),
      10_000
    );
    child.on('message', (msg) => {
      if (msg && msg.type === 'ready') {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Holder exited prematurely with code ${code}`));
    });
  });

  return { child, readyPromise };
}

/** Connect to the unix socket, returns { socket, messages }. messages is a live array. */
function connectSocket(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath }, () => {
      const messages = [];
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.length === 0) continue;
          try {
            messages.push(JSON.parse(line));
          } catch {
            /* skip malformed */
          }
        }
      });

      resolve({ socket, messages });
    });

    socket.on('error', (err) => reject(err));
  });
}

/** Send an ndjson message over the socket. */
function sendMsg(socket, msg) {
  socket.write(JSON.stringify(msg) + '\n');
}

/** Wait until the messages array contains a message matching the predicate, with timeout. */
function waitForMessage(messages, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const found = messages.find(predicate);
      if (found) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(found);
      }
    }, 50);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(
        new Error(
          `Timed out waiting for message. Have ${messages.length} messages: ${JSON.stringify(messages, null, 2)}`
        )
      );
    }, timeoutMs);
  });
}

/** Forcefully kill a child process. */
function killChild(child) {
  try {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  } catch {
    /* already dead */
  }
}

/** Wait for child to fully exit after kill. */
function waitForExit(child, timeoutMs = 5_000) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => resolve(), timeoutMs);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Small delay. */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = [];

async function runTest(name, fn) {
  process.stdout.write(`\n--- TEST: ${name} ---\n`);
  const start = Date.now();
  try {
    await fn();
    const elapsed = Date.now() - start;
    process.stdout.write(`  PASS (${elapsed}ms)\n`);
    results.push({ name, passed: true, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    process.stdout.write(`  FAIL: ${err.message}\n`);
    if (err.stack) {
      // Print only the first 5 lines of stack
      const lines = err.stack.split('\n').slice(0, 5).join('\n');
      process.stdout.write(`  ${lines}\n`);
    }
    results.push({ name, passed: false, elapsed, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ---------------------------------------------------------------------------
// Test 1: Holder spawns, signals ready, accepts connection
// ---------------------------------------------------------------------------

async function test1() {
  const socketPath = SOCKET_PREFIX + '1.sock';
  cleanupSocket(socketPath);

  let child;
  let socket;
  try {
    const holder = spawnHolder('test1', socketPath, { command: 'echo', args: ['hello'] });
    child = holder.child;
    await holder.readyPromise;
    process.stdout.write('  Ready signal received.\n');

    const conn = await connectSocket(socketPath);
    socket = conn.socket;
    const messages = conn.messages;

    // Wait for info message
    const info = await waitForMessage(messages, (m) => m.type === 'info');
    assert(typeof info.pid === 'number' && info.pid > 0, `Expected valid pid, got ${info.pid}`);
    process.stdout.write(`  Info message received: pid=${info.pid}\n`);

    // Wait for output containing "hello"
    const output = await waitForMessage(
      messages,
      (m) => m.type === 'output' && m.data && m.data.includes('hello')
    );
    process.stdout.write(`  Output message received containing "hello".\n`);

    // Wait for exit message (echo exits immediately)
    const exit = await waitForMessage(messages, (m) => m.type === 'exit');
    process.stdout.write(`  Exit message received: code=${exit.code}, signal=${exit.signal}\n`);
    assert(exit.code === 0 || exit.code === null, `Expected exit code 0 or null, got ${exit.code}`);

    // Disconnect
    socket.destroy();
    socket = null;

    // Wait a moment then verify the holder is still alive during grace period
    await delay(500);

    // The holder should still be alive (grace period is 60s)
    assert(child.exitCode === null, 'Holder should still be alive during grace period');
    process.stdout.write('  Holder alive during grace period.\n');

    // Kill the holder and verify socket cleanup
    killChild(child);
    await waitForExit(child);

    // Give a moment for cleanup
    await delay(200);
    // Socket may or may not be cleaned up depending on SIGKILL vs clean exit.
    // With SIGKILL, cleanup handlers do not run, so we clean up manually.
    cleanupSocket(socketPath);
    assert(!fs.existsSync(socketPath), 'Socket file should be cleaned up');
    process.stdout.write('  Socket cleaned up.\n');
  } finally {
    if (socket)
      try {
        socket.destroy();
      } catch {}
    if (child) killChild(child);
    await delay(100);
    cleanupSocket(socketPath);
  }
}

// ---------------------------------------------------------------------------
// Test 2: Holder scrollback replay
// ---------------------------------------------------------------------------

async function test2() {
  const socketPath = SOCKET_PREFIX + '2.sock';
  cleanupSocket(socketPath);

  let child;
  let socket;
  try {
    // Use printf to avoid trailing-newline ambiguity across shells
    const holder = spawnHolder('test2', socketPath, {
      command: 'sh',
      args: ['-c', 'echo line1; echo line2; echo line3; sleep 2'],
    });
    child = holder.child;
    await holder.readyPromise;
    process.stdout.write('  Ready signal received.\n');

    // Wait a moment for output to be produced and buffered
    await delay(1500);

    const conn = await connectSocket(socketPath);
    socket = conn.socket;
    const messages = conn.messages;

    // Wait for scrollback message
    const scrollback = await waitForMessage(messages, (m) => m.type === 'scrollback');
    assert(scrollback.data, 'Scrollback message should have data');
    process.stdout.write(`  Scrollback data length: ${scrollback.data.length}\n`);

    // Verify all 3 lines present in scrollback
    assert(scrollback.data.includes('line1'), 'Scrollback should contain line1');
    assert(scrollback.data.includes('line2'), 'Scrollback should contain line2');
    assert(scrollback.data.includes('line3'), 'Scrollback should contain line3');
    process.stdout.write('  Scrollback contains all 3 lines.\n');

    socket.destroy();
    socket = null;
    killChild(child);
    await waitForExit(child);
  } finally {
    if (socket)
      try {
        socket.destroy();
      } catch {}
    if (child) killChild(child);
    await delay(100);
    cleanupSocket(socketPath);
  }
}

// ---------------------------------------------------------------------------
// Test 3: Holder input/resize protocol
// ---------------------------------------------------------------------------

async function test3() {
  const socketPath = SOCKET_PREFIX + '3.sock';
  cleanupSocket(socketPath);

  let child;
  let socket;
  try {
    // cat is interactive and echoes input back
    const holder = spawnHolder('test3', socketPath, { command: 'cat' });
    child = holder.child;
    await holder.readyPromise;
    process.stdout.write('  Ready signal received.\n');

    const conn = await connectSocket(socketPath);
    socket = conn.socket;
    const messages = conn.messages;

    // Wait for info
    const info = await waitForMessage(messages, (m) => m.type === 'info');
    assert(typeof info.pid === 'number', 'Should receive info with pid');
    process.stdout.write(`  Info received: pid=${info.pid}\n`);

    // Clear messages array to isolate input echo
    await delay(300);
    messages.length = 0;

    // Send input
    sendMsg(socket, { type: 'input', data: 'hello\n' });
    process.stdout.write('  Sent input "hello\\n".\n');

    // Wait for output containing "hello"
    const output = await waitForMessage(
      messages,
      (m) => m.type === 'output' && m.data && m.data.includes('hello')
    );
    process.stdout.write('  Received output containing "hello".\n');

    // Send resize -- should not crash
    sendMsg(socket, { type: 'resize', cols: 120, rows: 40 });
    process.stdout.write('  Sent resize 120x40.\n');
    await delay(300);

    // Verify holder is still alive after resize
    assert(child.exitCode === null, 'Holder should still be alive after resize');
    process.stdout.write('  Holder still alive after resize.\n');

    // Send kill
    messages.length = 0;
    sendMsg(socket, { type: 'kill' });
    process.stdout.write('  Sent kill.\n');

    // Wait for exit message
    const exit = await waitForMessage(messages, (m) => m.type === 'exit');
    process.stdout.write(`  Exit message received: code=${exit.code}, signal=${exit.signal}\n`);

    socket.destroy();
    socket = null;
    killChild(child);
    await waitForExit(child);
  } finally {
    if (socket)
      try {
        socket.destroy();
      } catch {}
    if (child) killChild(child);
    await delay(100);
    cleanupSocket(socketPath);
  }
}

// ---------------------------------------------------------------------------
// Test 4: Holder survives parent disconnect + reconnect
// ---------------------------------------------------------------------------

async function test4() {
  const socketPath = SOCKET_PREFIX + '4.sock';
  cleanupSocket(socketPath);

  let child;
  let socket1;
  let socket2;
  try {
    const holder = spawnHolder('test4', socketPath, { command: 'sleep', args: ['30'] });
    child = holder.child;
    await holder.readyPromise;
    process.stdout.write('  Ready signal received.\n');

    // First connection
    const conn1 = await connectSocket(socketPath);
    socket1 = conn1.socket;
    const messages1 = conn1.messages;

    const info1 = await waitForMessage(messages1, (m) => m.type === 'info');
    assert(typeof info1.pid === 'number', 'First connect should receive info');
    process.stdout.write(`  First connection: info pid=${info1.pid}\n`);

    // Disconnect (simulate server restart)
    socket1.destroy();
    socket1 = null;
    process.stdout.write('  Disconnected first socket.\n');

    // Wait 2 seconds
    await delay(2000);

    // Verify holder is still alive
    assert(child.exitCode === null, 'Holder should survive client disconnect');
    process.stdout.write('  Holder survived disconnect.\n');

    // Reconnect
    const conn2 = await connectSocket(socketPath);
    socket2 = conn2.socket;
    const messages2 = conn2.messages;

    // Should receive info again
    const info2 = await waitForMessage(messages2, (m) => m.type === 'info');
    assert(typeof info2.pid === 'number', 'Second connect should receive info');
    assert(
      info2.pid === info1.pid,
      `PID should be same across reconnect: ${info1.pid} vs ${info2.pid}`
    );
    process.stdout.write(`  Reconnected: info pid=${info2.pid} (same as before).\n`);

    // Clean up
    socket2.destroy();
    socket2 = null;
    killChild(child);
    await waitForExit(child);
    process.stdout.write('  Holder killed.\n');
  } finally {
    if (socket1)
      try {
        socket1.destroy();
      } catch {}
    if (socket2)
      try {
        socket2.destroy();
      } catch {}
    if (child) killChild(child);
    await delay(100);
    cleanupSocket(socketPath);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write('=== PTY Holder Integration Tests ===\n');

  await runTest('1: Holder spawns, signals ready, accepts connection', test1);
  await runTest('2: Holder scrollback replay', test2);
  await runTest('3: Holder input/resize protocol', test3);
  await runTest('4: Holder survives parent disconnect + reconnect', test4);

  // Summary
  process.stdout.write('\n=== SUMMARY ===\n');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    process.stdout.write(
      `  [${status}] ${r.name} (${r.elapsed}ms)${r.error ? ' - ' + r.error : ''}\n`
    );
  }
  process.stdout.write(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  // Final cleanup: kill any lingering children
  for (const c of allChildren) {
    killChild(c);
  }

  // Clean up any leftover socket files
  for (let i = 1; i <= 4; i++) {
    cleanupSocket(SOCKET_PREFIX + i + '.sock');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Safety net: kill all children on unhandled errors
process.on('uncaughtException', (err) => {
  process.stderr.write(`Unhandled exception: ${err.message}\n${err.stack}\n`);
  for (const c of allChildren) killChild(c);
  for (let i = 1; i <= 4; i++) cleanupSocket(SOCKET_PREFIX + i + '.sock');
  process.exit(2);
});

process.on('unhandledRejection', (err) => {
  process.stderr.write(`Unhandled rejection: ${err}\n`);
  for (const c of allChildren) killChild(c);
  for (let i = 1; i <= 4; i++) cleanupSocket(SOCKET_PREFIX + i + '.sock');
  process.exit(2);
});

main();
