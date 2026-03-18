import { randomBytes } from 'crypto';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

import pty, { type IPty } from 'node-pty';
import type WebSocket from 'ws';

import { sessionWatcher } from './session-watcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutputBuffer {
  data: string[];
  size: number;
}

interface ManagedTerminal {
  id: string;
  pty: IPty;
  command: string;
  args: string[];
  cwd: string;
  createdAt: Date;
  exitedAt: Date | null;
  pid: number;
  clients: Set<WebSocket>;
  scrollback: string[];
  scrollbackSize: number;
  sessionFile: string | null;
  watcherOffset: number;
  status: 'running' | 'exited';
  exitCode: number | null;
  outputBuffers: Map<WebSocket, OutputBuffer>;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export type { ManagedTerminal };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SCROLLBACK_LINES = 5000;
const MAX_OUTPUT_BUFFER_BYTES = 1024 * 1024; // 1 MB per client
const SCROLLBACK_CHUNK_SIZE = 50 * 1024; // 50 KB per chunk
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXITED_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_EXITED_TERMINALS = 10;
const SIGKILL_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// PtyManager
// ---------------------------------------------------------------------------

class PtyManager {
  private terminals: Map<string, ManagedTerminal> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  create(
    command: string,
    args: string[],
    cwd: string,
    cols: number,
    rows: number
  ): ManagedTerminal {
    const id = randomBytes(4).toString('hex'); // 8 hex chars

    // Build environment — inherit current env
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    const shell = process.env.SHELL || '/bin/zsh';
    const shellEscape = (arg: string): string => `'${arg.replace(/'/g, "'\\''")}'`;
    const fullCommand = [command, ...args].map(shellEscape).join(' ');

    const ptyProcess = pty.spawn(shell, ['-l', '-c', fullCommand], {
      cols,
      cwd,
      env,
      name: 'xterm-color',
      rows,
    });

    const terminal: ManagedTerminal = {
      id,
      pty: ptyProcess,
      command,
      args,
      cwd,
      createdAt: new Date(),
      exitedAt: null,
      pid: ptyProcess.pid,
      clients: new Set(),
      scrollback: [],
      scrollbackSize: 0,
      sessionFile: null,
      watcherOffset: 0,
      status: 'running',
      exitCode: null,
      outputBuffers: new Map(),
      pollTimer: null,
    };

    // Wire up output handler
    ptyProcess.onData((data: string) => {
      this.pushScrollback(terminal, data);
      this.broadcastOutput(terminal, data);
    });

    // Wire up exit handler
    ptyProcess.onExit(({ exitCode }) => {
      terminal.status = 'exited';
      terminal.exitCode = exitCode;
      terminal.exitedAt = new Date();

      // Notify all connected clients of the exit
      const exitMsg = JSON.stringify({
        type: 'exit',
        code: exitCode,
        signal: null,
      });
      for (const ws of terminal.clients) {
        this.safeSend(ws, exitMsg);
      }
    });

    // For Claude Code / OpenCode: detect the session file by watching
    // the project directory for new JSONL files created after launch.
    if (command === 'claude' || command === 'opencode') {
      const projectDir = path.join(
        process.env.HOME || '', '.claude', 'projects',
        cwd.replace(/\//g, '-')
      );
      const launchTime = Date.now();

      terminal.pollTimer = setInterval(() => {
        if (terminal.status === 'exited' || terminal.sessionFile) {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
          if (terminal.sessionFile) {
            sessionWatcher.watch(terminal.sessionFile, () => {});
          }
          return;
        }
        try {
          if (!existsSync(projectDir)) return;
          const files = readdirSync(projectDir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => ({
              name: f,
              fullPath: path.join(projectDir, f),
              mtime: statSync(path.join(projectDir, f)).mtimeMs,
            }))
            .filter((f) => f.mtime > launchTime)
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            terminal.sessionFile = files[0].fullPath;
            if (terminal.pollTimer) {
              clearInterval(terminal.pollTimer);
              terminal.pollTimer = null;
            }
            sessionWatcher.watch(terminal.sessionFile, () => {});
          }
        } catch {
          // ignore filesystem errors
        }
      }, 1500);

      setTimeout(() => {
        if (terminal.pollTimer) {
          clearInterval(terminal.pollTimer);
          terminal.pollTimer = null;
        }
      }, 5 * 60 * 1000);
    }

    this.terminals.set(id, terminal);
    return terminal;
  }

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  get(id: string): ManagedTerminal | null {
    return this.terminals.get(id) ?? null;
  }

  // -----------------------------------------------------------------------
  // list — running first, then recently exited, each group sorted by
  //        createdAt descending
  // -----------------------------------------------------------------------

  list(): ManagedTerminal[] {
    const all = Array.from(this.terminals.values());

    const running = all
      .filter((t) => t.status === 'running')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const exited = all
      .filter((t) => t.status === 'exited')
      .sort((a, b) => {
        const aTime = b.exitedAt?.getTime() ?? b.createdAt.getTime();
        const bTime = a.exitedAt?.getTime() ?? a.createdAt.getTime();
        return aTime - bTime;
      });

    return [...running, ...exited];
  }

  // -----------------------------------------------------------------------
  // kill — SIGTERM, then SIGKILL after 5 s if still alive
  // -----------------------------------------------------------------------

  kill(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    if (terminal.status === 'exited') return true; // already dead

    try {
      // Attempt graceful termination
      process.kill(terminal.pid, 'SIGTERM');
    } catch {
      // Process may already be gone — mark as exited
      terminal.status = 'exited';
      terminal.exitedAt = new Date();
      return true;
    }

    // Schedule forceful kill if still running after delay
    setTimeout(() => {
      if (terminal.status === 'running') {
        try {
          process.kill(terminal.pid, 'SIGKILL');
        } catch {
          // Already gone
        }
        terminal.status = 'exited';
        terminal.exitedAt = terminal.exitedAt ?? new Date();
      }
    }, SIGKILL_DELAY_MS);

    return true;
  }

  // -----------------------------------------------------------------------
  // remove — remove an exited terminal from the map
  // -----------------------------------------------------------------------

  remove(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    if (terminal.status === 'running') return false; // cannot remove running terminals

    this.evict(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // resize
  // -----------------------------------------------------------------------

  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.status === 'exited') return false;

    try {
      terminal.pty.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // attach — register a WebSocket client and replay scrollback
  // -----------------------------------------------------------------------

  attach(id: string, ws: WebSocket): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;

    terminal.clients.add(ws);
    terminal.outputBuffers.set(ws, { data: [], size: 0 });

    // Send scrollback in chunks
    this.sendScrollback(terminal, ws);

    return true;
  }

  // -----------------------------------------------------------------------
  // detach — remove a WebSocket client
  // -----------------------------------------------------------------------

  detach(id: string, ws: WebSocket): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;

    terminal.clients.delete(ws);
    terminal.outputBuffers.delete(ws);
    return true;
  }

  // -----------------------------------------------------------------------
  // getScrollback — return raw scrollback data for replay
  // -----------------------------------------------------------------------

  getScrollback(id: string): string | null {
    const terminal = this.terminals.get(id);
    if (!terminal) return null;

    return terminal.scrollback.join('');
  }

  // -----------------------------------------------------------------------
  // cleanup — evict exited terminals older than 1 hour, cap at 10 exited
  // -----------------------------------------------------------------------

  cleanup(): void {
    const now = Date.now();
    const exited: Array<{ id: string; exitedAt: number }> = [];

    for (const [id, terminal] of this.terminals) {
      if (terminal.status !== 'exited') continue;

      const exitTime = terminal.exitedAt?.getTime() ?? terminal.createdAt.getTime();

      // Evict if older than TTL
      if (now - exitTime > EXITED_TTL_MS) {
        this.evict(id);
        continue;
      }

      exited.push({ id, exitedAt: exitTime });
    }

    // If more than MAX_EXITED_TERMINALS remain, evict the oldest
    if (exited.length > MAX_EXITED_TERMINALS) {
      exited.sort((a, b) => a.exitedAt - b.exitedAt);
      const toEvict = exited.slice(0, exited.length - MAX_EXITED_TERMINALS);
      for (const { id } of toEvict) {
        this.evict(id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // destroy — tear down the manager (for graceful shutdown)
  // -----------------------------------------------------------------------

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [id, terminal] of this.terminals) {
      // Clear session-file poll timer if still running
      if (terminal.pollTimer) {
        clearInterval(terminal.pollTimer);
        terminal.pollTimer = null;
      }

      if (terminal.status === 'running') {
        try {
          terminal.pty.kill();
        } catch {
          // Best effort
        }
      }
      // Close all client connections
      for (const ws of terminal.clients) {
        try {
          ws.close();
        } catch {
          // Best effort
        }
      }
      this.terminals.delete(id);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Push data into the scrollback ring buffer, keeping at most MAX_SCROLLBACK_LINES. */
  private pushScrollback(terminal: ManagedTerminal, data: string): void {
    // Split incoming data by newlines but preserve the original chunks.
    // We track lines for the cap but store raw data segments so replay
    // produces an accurate terminal state.
    const lines = data.split('\n');
    const newLineCount = lines.length > 0 ? lines.length - 1 : 0;

    terminal.scrollback.push(data);
    terminal.scrollbackSize += newLineCount;

    // Trim from the front when we exceed the cap
    while (terminal.scrollbackSize > MAX_SCROLLBACK_LINES && terminal.scrollback.length > 1) {
      const removed = terminal.scrollback.shift();
      if (removed) {
        const removedLines = removed.split('\n');
        terminal.scrollbackSize -= removedLines.length > 0 ? removedLines.length - 1 : 0;
      }
    }
  }

  /** Broadcast output data to all connected clients with backpressure. */
  private broadcastOutput(terminal: ManagedTerminal, data: string): void {
    const msg = JSON.stringify({ type: 'output', data });

    for (const ws of terminal.clients) {
      // Skip if WebSocket has too much queued already
      if (ws.bufferedAmount > MAX_OUTPUT_BUFFER_BYTES) {
        this.safeSend(ws, JSON.stringify({ type: 'output-dropped', bytes: data.length }));
        continue;
      }

      const buffer = terminal.outputBuffers.get(ws);
      if (!buffer) continue;

      const msgSize = Buffer.byteLength(msg, 'utf8');

      // Check backpressure: if buffer exceeds limit, drop oldest data
      if (buffer.size + msgSize > MAX_OUTPUT_BUFFER_BYTES) {
        let droppedBytes = 0;
        while (buffer.size + msgSize > MAX_OUTPUT_BUFFER_BYTES && buffer.data.length > 0) {
          const dropped = buffer.data.shift();
          if (dropped) {
            const droppedSize = Buffer.byteLength(dropped, 'utf8');
            buffer.size -= droppedSize;
            droppedBytes += droppedSize;
          }
        }

        // Notify client of dropped output
        if (droppedBytes > 0) {
          const dropMsg = JSON.stringify({
            type: 'output-dropped',
            bytes: droppedBytes,
          });
          this.safeSend(ws, dropMsg);
        }
      }

      // Buffer the message and attempt to send
      buffer.data.push(msg);
      buffer.size += msgSize;

      this.flushOutputBuffer(ws, buffer);
    }
  }

  /** Attempt to flush buffered messages to a WebSocket client. */
  private flushOutputBuffer(ws: WebSocket, buffer: OutputBuffer): void {
    while (buffer.data.length > 0) {
      const msg = buffer.data[0];
      if (!this.safeSend(ws, msg)) {
        // Send failed — leave remaining messages in the buffer
        break;
      }
      buffer.data.shift();
      buffer.size -= Buffer.byteLength(msg, 'utf8');
    }
  }

  /** Send scrollback data to a newly connected client in 50 KB chunks. */
  private async sendScrollback(terminal: ManagedTerminal, ws: WebSocket): Promise<void> {
    const fullData = terminal.scrollback.join('');
    if (fullData.length === 0) return;

    const totalBytes = Buffer.byteLength(fullData, 'utf8');
    const totalChunks = Math.ceil(totalBytes / SCROLLBACK_CHUNK_SIZE);

    if (totalChunks <= 1) {
      // Single chunk — send directly
      const msg = JSON.stringify({
        type: 'scrollback',
        data: fullData,
        chunk: 1,
        total: 1,
      });
      this.safeSend(ws, msg);
      return;
    }

    // Multi-chunk: split the data into byte-safe segments
    const buf = Buffer.from(fullData, 'utf8');
    let offset = 0;
    let chunkIndex = 1;

    while (offset < buf.length) {
      // Gate scrollback sending on actual socket backpressure
      if (ws.bufferedAmount > SCROLLBACK_CHUNK_SIZE * 2) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const end = Math.min(offset + SCROLLBACK_CHUNK_SIZE, buf.length);
      const chunkData = buf.subarray(offset, end).toString('utf8');
      const msg = JSON.stringify({
        type: 'scrollback',
        data: chunkData,
        chunk: chunkIndex,
        total: totalChunks,
      });
      this.safeSend(ws, msg);
      offset = end;
      chunkIndex++;
    }
  }

  /** Safely send a message to a WebSocket, returning false on failure. */
  private safeSend(ws: WebSocket, msg: string): boolean {
    try {
      // readyState 1 === OPEN
      if (ws.readyState !== 1) return false;
      ws.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  /** Evict a terminal, freeing all resources. */
  private evict(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    // Clear session-file poll timer if still running
    if (terminal.pollTimer) {
      clearInterval(terminal.pollTimer);
      terminal.pollTimer = null;
    }

    // Close remaining client connections
    for (const ws of terminal.clients) {
      try {
        ws.close();
      } catch {
        // Best effort
      }
    }
    terminal.clients.clear();
    terminal.outputBuffers.clear();
    terminal.scrollback.length = 0;
    terminal.scrollbackSize = 0;

    this.terminals.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

// Use globalThis to ensure a single shared instance across module loaders.
// server.ts (tsx) and SvelteKit's build handler load this module separately.
const PTY_GLOBAL_KEY = '__shooter_pty_manager';
export const ptyManager: PtyManager =
	((globalThis as Record<string, unknown>)[PTY_GLOBAL_KEY] as PtyManager) ||
	new PtyManager();
(globalThis as Record<string, unknown>)[PTY_GLOBAL_KEY] = ptyManager;
