import type {
  ConversationMessage,
  PtyManagedTerminal as ManagedTerminal,
  PtyOutputBuffer as OutputBuffer,
  SeqRingEntry,
  TerminalRecord,
} from '$lib/types';
import type WebSocket from 'ws';

import { type ChildProcess, fork } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { findCodexRolloutForCwd } from '../sessions/codex-reader';
import {
  discoverReadOnlyProviderSessionFile,
  readOnlySourceForCommand,
} from '../sessions/provider-paths';
import { broadcastEvent } from '../ws/server.js';
import { withAgentPermissionMode } from './agent-launch.js';
import { HolderClient } from './holder-client';
import { openCodeWatcher } from './opencode-watcher';
import { TerminalEmulator } from './terminal-emulator';
import { terminalStore } from './terminal-store';

export type { ManagedTerminal };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SCROLLBACK_BYTES = 512 * 1024; // 512 KB cached scrollback cap
const MAX_OUTPUT_BUFFER_BYTES = 1024 * 1024; // 1 MB per client
const SCROLLBACK_CHUNK_SIZE = 50 * 1024; // 50 KB per chunk
const SEQ_RING_MAX_ENTRIES = 2000; // bounded replay ring (~2-10 MB of recent output)
// Server-side emulator + snapshot-on-join is on unless explicitly disabled
// (SHOOTER_SNAPSHOT_FALLBACK=raw reverts to legacy raw-scrollback replay).
const SNAPSHOT_ENABLED = process.env.SHOOTER_SNAPSHOT_FALLBACK !== 'raw';
// Phase 2 backpressure convergence: when a client falls behind we stop dropping
// bytes silently and instead resnapshot it to the current screen once its socket
// drains below the low-water mark (or after a hard timeout if it never drains).
const RESNAPSHOT_LOW_WATER_BYTES = MAX_OUTPUT_BUFFER_BYTES / 4;
const RESNAPSHOT_POLL_MS = 100;
const RESNAPSHOT_MAX_WAIT_MS = 10_000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXITED_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_EXITED_TERMINALS = 10;
const SIGKILL_DELAY_MS = 5000;
const HOLDER_READY_TIMEOUT_MS = 5000;
const DB_CLEANUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for SQLite records

// ---------------------------------------------------------------------------
// Resolve holder script path (ESM — no __dirname)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PtyManager {
  private cleanupTimer: null | ReturnType<typeof setInterval> = null;
  // Clients currently converging via a resnapshot (Phase 2). While pending, a
  // client receives no normal output frames — the forthcoming snapshot brings
  // it to the current screen. WeakSet so disconnected sockets drop out on GC.
  private resnapshotPending = new WeakSet<WebSocket>();
  private terminals = new Map<string, ManagedTerminal>();

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  // -----------------------------------------------------------------------
  // create — now async: forks a holder process, connects via HolderClient,
  //          persists to SQLite
  // -----------------------------------------------------------------------

  attach(id: string, ws: WebSocket, opts?: { lastSeq?: number; snapshot?: boolean }): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }

    terminal.outputBuffers.set(ws, { data: [], size: 0 });

    // Phase 3: level-triggered size push on join (fixes G8). Every joiner —
    // interactive or view-only, on any of the paths below — immediately learns
    // the PTY's current size without waiting for the next edge-triggered resize.
    // Sent first (a direct send, not a broadcast) so it applies before the
    // snapshot/scrollback paints.
    this.safeSend(ws, JSON.stringify({ cols: terminal.cols, rows: terminal.rows, type: 'resize' }));

    const wantsSnapshot = opts?.snapshot === true;
    const lastSeq = opts?.lastSeq ?? 0;

    // Reconnect resume (Phase 2): the client already applied output up to
    // lastSeq. If those missing frames are still in the ring, replay just the
    // gap and go live — a seamless catch-up with no screen flash. This branch
    // is fully synchronous, so no live frame can interleave between computing
    // the gap and registering the client (no missed frames). Falls through to a
    // fresh snapshot/scrollback when the gap predates the ring (getSeqRingFrom
    // returns null) or the seq counter reset across a server restart.
    if (wantsSnapshot && lastSeq > 0) {
      const gap = this.getSeqRingFrom(id, lastSeq);
      if (gap !== null) {
        for (const entry of gap) {
          this.safeSend(ws, JSON.stringify({ data: entry.data, seq: entry.seq, type: 'output' }));
        }
        terminal.clients.add(ws);
        return true;
      }
    }

    if (wantsSnapshot && terminal.emulator) {
      // Snapshot-capable client: send the current-screen snapshot FIRST, then
      // start the live tail (add to clients). Adding to clients only after the
      // snapshot is sent guarantees no live frame precedes or duplicates it —
      // the emulator already includes any output produced while snapshotting,
      // and the snapshot's seq lets the client drop already-included frames.
      void this.snapshotAndSend(terminal, ws).then((ok) => {
        if (ws.readyState !== 1 /* OPEN */) {
          return;
        }
        if (!ok) {
          // Snapshot failed — fall back to the legacy raw scrollback replay.
          terminal.clients.add(ws);
          void this.sendScrollback(terminal, ws);
          return;
        }
        terminal.clients.add(ws);
      });
      return true;
    }

    terminal.clients.add(ws);
    // Send cached scrollback in chunks (legacy / non-snapshot-capable clients).
    void this.sendScrollback(terminal, ws);

    return true;
  }

  cleanup(): void {
    const now = Date.now();
    const exited: { exitedAt: number; id: string }[] = [];

    for (const [id, terminal] of this.terminals) {
      if (terminal.status !== 'exited') {
        continue;
      }

      const exitTime = terminal.exitedAt?.getTime() ?? terminal.createdAt.getTime();

      // Evict if older than TTL
      if (now - exitTime > EXITED_TTL_MS) {
        this.evict(id);
        continue;
      }

      exited.push({ exitedAt: exitTime, id });
    }

    // If more than MAX_EXITED_TERMINALS remain, evict the oldest
    if (exited.length > MAX_EXITED_TERMINALS) {
      exited.sort((a, b) => a.exitedAt - b.exitedAt);
      const toEvict = exited.slice(0, exited.length - MAX_EXITED_TERMINALS);
      for (const { id } of toEvict) {
        this.evict(id);
      }
    }

    // Clean up old SQLite records (exited/orphaned older than 24 hours)
    try {
      const deleted = terminalStore.deleteOlderThan(DB_CLEANUP_TTL_MS);
      if (deleted > 0) {
        console.log(`[pty-manager] Cleaned up ${deleted} old terminal record(s) from SQLite`);
      }
    } catch {
      // Best effort — don't crash the cleanup cycle
    }
  }

  // -----------------------------------------------------------------------
  // reconnectAll — recover persisted terminals on server startup
  // -----------------------------------------------------------------------

  async create(
    command: string,
    args: string[],
    cwd: string,
    cols: number,
    rows: number
  ): Promise<ManagedTerminal> {
    const id = randomBytes(4).toString('hex'); // 8 hex chars
    const socketPath = `/tmp/shooter-term-${id}.sock`;
    const holderScript = resolveHolderPath();

    // Inject the configured default --permission-mode for claude (SHOOTER_AGENT_PERMISSION_MODE),
    // so a managed agent can act instead of being auto-denied by a restrictive global config.
    // No-op unless set; never overrides an explicit flag. Persisted so reconnect keeps it.
    const launchArgs = withAgentPermissionMode(
      command,
      args,
      process.env.SHOOTER_AGENT_PERMISSION_MODE
    );

    // Fork the holder process as detached so it survives server restarts
    const holderArgs = [id, socketPath, cwd, String(cols), String(rows), command, ...launchArgs];
    const holder: ChildProcess = fork(holderScript, holderArgs, {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    holder.unref();

    // Wait for the holder to signal ready (socket listening)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        holder.kill();
        reject(new Error('Holder ready timeout'));
      }, HOLDER_READY_TIMEOUT_MS);

      holder.on('message', (msg: { type: string }) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          holder.disconnect(); // Release IPC — holder is now fully detached
          resolve();
        }
      });

      holder.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Holder process error: ${err.message}`));
      });

      holder.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Holder process exited with code ${code} before ready`));
      });
    });

    if (holder.pid === undefined || holder.pid === null) {
      throw new Error(`Holder process forked but PID unavailable for terminal ${id}`);
    }
    const holderPid = holder.pid;

    // Connect to the holder via Unix socket
    const client = new HolderClient();
    const connectResult = await client.connect(socketPath);

    const now = new Date();
    const terminal: ManagedTerminal = {
      args: launchArgs,
      authorityConnectionId: null, // Phase 3: claimed by the first interactive resize
      clients: new Set(),
      cols,
      command,
      createdAt: now,
      currentCwd: null,
      cwd,
      emulator: SNAPSHOT_ENABLED ? new TerminalEmulator(cols, rows) : null,
      exitCode: connectResult.exitCode,
      exitedAt: null,
      holderPid,
      id,
      isActive: false,
      openCodeNoopCb: null,
      openCodeSessionId: null,
      outputBuffers: new Map(),
      pid: connectResult.pid,
      pollTimer: null,
      pty: client,
      rows,
      scrollback: connectResult.scrollback,
      seqCounter: 0,
      seqRing: [],
      sessionFile: null,
      socketPath,
      status: connectResult.exited ? 'exited' : 'running',
      watcherOffset: 0,
    };

    // Wire up all HolderClient callbacks
    this.wireHolderCallbacks(client, terminal);

    // Persist to SQLite
    terminalStore.insert({
      args: JSON.stringify(launchArgs),
      cols,
      command,
      createdAt: now.toISOString(),
      cwd,
      exitCode: null,
      exitedAt: null,
      holderPid,
      id,
      opencodeSessionId: null,
      pid: connectResult.pid,
      rows,
      sessionFile: null,
      socketPath,
      status: 'running',
    });

    // Start session file discovery (same polling logic as before)
    this.startSessionDiscovery(terminal);

    this.terminals.set(id, terminal);

    broadcastEvent({
      command: terminal.command ?? command,
      terminalId: id,
      type: 'terminal-created',
    });

    return terminal;
  }

  // -----------------------------------------------------------------------
  // disconnectAll — graceful shutdown: disconnect clients, keep holders alive
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
          terminal.pty.kill('SIGTERM');
        } catch {
          // Best effort
        }
        // Also kill the holder process directly (guard against invalid PIDs —
        // process.kill(0) targets the current process group, -1 targets all)
        if (terminal.holderPid > 0) {
          try {
            process.kill(terminal.holderPid, 'SIGKILL');
          } catch {
            // Best effort — holder may already be gone
          }
        }
      }

      // Disconnect from holder socket
      terminal.pty.disconnect();

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
  // get
  // -----------------------------------------------------------------------

  detach(id: string, ws: WebSocket): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }

    terminal.clients.delete(ws);
    terminal.outputBuffers.delete(ws);
    return true;
  }

  // -----------------------------------------------------------------------
  // list — running first, then recently exited, each group sorted by
  //        createdAt descending
  // -----------------------------------------------------------------------

  disconnectAll(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [, terminal] of this.terminals) {
      // Clear session-file poll timer
      if (terminal.pollTimer) {
        clearInterval(terminal.pollTimer);
        terminal.pollTimer = null;
      }

      // Disconnect from holder (does NOT kill the holder process)
      terminal.pty.disconnect();

      // Close all WS client connections
      for (const ws of terminal.clients) {
        try {
          ws.close();
        } catch {
          // Best effort
        }
      }
      terminal.clients.clear();
      terminal.outputBuffers.clear();
    }

    this.terminals.clear();
  }

  // -----------------------------------------------------------------------
  // kill — route through holder: SIGTERM, then SIGKILL after 5 s
  // -----------------------------------------------------------------------

  get(id: string): ManagedTerminal | null {
    return this.terminals.get(id) ?? null;
  }

  // -----------------------------------------------------------------------
  // remove — remove an exited terminal from the map
  // -----------------------------------------------------------------------

  getScrollback(id: string): null | string {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return null;
    }

    return terminal.scrollback;
  }

  // -----------------------------------------------------------------------
  // resize
  // -----------------------------------------------------------------------

  /** Current highest assigned seq for a terminal, or null if unknown. */
  getSeqCounter(id: string): null | number {
    return this.terminals.get(id)?.seqCounter ?? null;
  }

  /**
   * Return the ring entries with seq > afterSeq, in order. Returns an empty
   * array when the caller is already current, or null when the gap is
   * unresolvable from the ring (caller must take a full snapshot). Unresolvable
   * means any of:
   *   - afterSeq > seqCounter: the caller claims a seq we never produced — this
   *     happens when the seq counter reset across a server restart (the client
   *     is from a previous terminal lifetime), so its content is unrelated.
   *   - ring empty but afterSeq > 0: nothing buffered to bridge the gap.
   *   - afterSeq predates the oldest retained entry: the gap aged out.
   */
  getSeqRingFrom(id: string, afterSeq: number): null | readonly SeqRingEntry[] {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return null;
    }
    if (afterSeq > terminal.seqCounter) {
      return null; // counter reset (restart) or client ahead of us — snapshot
    }
    const ring = terminal.seqRing;
    if (ring.length === 0) {
      // Caught up (afterSeq 0, nothing produced) vs. an impossible-to-bridge
      // positive gap with no buffered frames.
      return afterSeq <= 0 ? [] : null;
    }
    if (afterSeq < ring[0].seq - 1) {
      return null; // gap predates the ring — caller must send a full snapshot
    }
    return ring.filter((e) => e.seq > afterSeq);
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }
    if (terminal.status === 'exited') {
      return true;
    } // already dead

    try {
      // Send SIGTERM through the holder protocol
      terminal.pty.kill('SIGTERM');
    } catch {
      // Holder may already be gone — mark as exited
      terminal.status = 'exited';
      terminal.exitedAt = new Date();
      terminalStore.markExited(id, null);
      this.emitTerminalExited(id, null);
      return true;
    }

    // Schedule forceful kill if still running after delay
    setTimeout(() => {
      if (terminal.status === 'running') {
        try {
          terminal.pty.kill('SIGKILL');
        } catch {
          // Already gone
        }
        terminal.status = 'exited';
        terminal.exitedAt = terminal.exitedAt ?? new Date();
        terminalStore.markExited(id, null);
        this.emitTerminalExited(id, null);
      }
    }, SIGKILL_DELAY_MS);

    return true;
  }

  // -----------------------------------------------------------------------
  // attach — register a WebSocket client and replay scrollback
  // -----------------------------------------------------------------------

  list(): ManagedTerminal[] {
    const all = Array.from(this.terminals.values());

    const running = all
      .filter((t) => t.status === 'running')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const exited = all
      .filter((t) => t.status === 'exited')
      .sort((a, b) => {
        const aTime = a.exitedAt?.getTime() ?? a.createdAt.getTime();
        const bTime = b.exitedAt?.getTime() ?? b.createdAt.getTime();
        return bTime - aTime;
      });

    return [...running, ...exited];
  }

  // -----------------------------------------------------------------------
  // detach — remove a WebSocket client
  // -----------------------------------------------------------------------

  async reconnectAll(): Promise<void> {
    const running = terminalStore.listRunning();
    if (running.length === 0) {
      console.log('[pty-manager] No persisted terminals to reconnect');
      return;
    }

    console.log(`[pty-manager] Reconnecting to ${running.length} persisted terminal(s)...`);

    for (const record of running) {
      try {
        await this.reconnectOne(record);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[pty-manager] Failed to reconnect terminal ${record.id}: ${errMsg}`);
        this.handleReconnectFailure(record);
      }
    }
  }

  // -----------------------------------------------------------------------
  // getScrollback — return raw scrollback data for replay
  // -----------------------------------------------------------------------

  remove(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }
    if (terminal.status === 'running') {
      return false;
    } // cannot remove running terminals

    this.evict(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // cleanup — evict exited terminals older than 1 hour, cap at 10 exited;
  //           also clean up old SQLite records
  // -----------------------------------------------------------------------

  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.status === 'exited') {
      return false;
    }

    try {
      terminal.pty.resize(cols, rows);
      terminal.cols = cols;
      terminal.rows = rows;
      terminal.emulator?.resize(cols, rows);
      // Phase 3: persist so a server restart restores the latest size, not the
      // creation-time default (fixes G5).
      terminalStore.resizeDims(id, cols, rows);
      // Broadcast the new PTY size so attached clients (e.g. view-only
      // guests) can follow the terminal dimensions.
      const msg = JSON.stringify({ cols, rows, type: 'resize' });
      for (const ws of terminal.clients) {
        this.safeSend(ws, msg);
      }
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // destroy — emergency forced kill (kills holder processes too)
  // -----------------------------------------------------------------------

  /**
   * Compute the current-screen snapshot from the emulator and send it as a
   * single {type:'snapshot'} frame stamped with the current seq. Returns false
   * if there is no emulator, the socket closed, or serialization failed.
   * Reused by Phase 2 to resnapshot a client after a backpressure gap.
   */
  async snapshotAndSend(terminal: ManagedTerminal, ws: WebSocket): Promise<boolean> {
    if (!terminal.emulator) {
      return false;
    }
    try {
      const snap = await terminal.emulator.snapshot();
      if (ws.readyState !== 1 /* OPEN */) {
        return false;
      }
      this.safeSend(
        ws,
        JSON.stringify({
          cols: snap.cols,
          data: snap.data,
          rows: snap.rows,
          seq: terminal.seqCounter,
          type: 'snapshot',
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Private: reconnectOne — reconnect to a single persisted terminal
  // -----------------------------------------------------------------------

  private appendScrollback(terminal: ManagedTerminal, data: string): void {
    terminal.scrollback += data;

    // Trim at newline boundary when we exceed the byte cap
    // (avoids corrupting multi-byte UTF-8 chars or VT escape sequences)
    if (Buffer.byteLength(terminal.scrollback, 'utf8') > MAX_SCROLLBACK_BYTES) {
      const mid = Math.floor(terminal.scrollback.length / 2);
      const newlineIdx = terminal.scrollback.indexOf('\n', mid);
      if (newlineIdx !== -1) {
        terminal.scrollback = terminal.scrollback.slice(newlineIdx + 1);
      } else {
        // No newline found after midpoint — discard the first half entirely
        terminal.scrollback = terminal.scrollback.slice(mid);
      }
    }
  }

  /**
   * Assign the next sequence number to an output chunk and append it to the
   * bounded replay ring. Returns the new seq. Phase 2 uses the ring to replay
   * the gap to a reconnecting client without a full snapshot.
   */
  private appendSeqRing(terminal: ManagedTerminal, data: string): number {
    const seq = terminal.seqCounter + 1;
    terminal.seqRing.push({ data, seq });
    if (terminal.seqRing.length > SEQ_RING_MAX_ENTRIES) {
      terminal.seqRing.shift();
    }
    terminal.seqCounter = seq;
    return seq;
  }

  /**
   * Mark a client for convergence (Phase 2). Its queued output is discarded and
   * further live frames are withheld until its socket drains below the low-water
   * mark (or a hard timeout elapses), at which point a fresh snapshot resets it
   * to the current screen. This replaces silent byte-dropping so a slow or
   * throttled client can never diverge permanently (G1).
   */
  private beginResnapshot(terminal: ManagedTerminal, ws: WebSocket): void {
    if (this.resnapshotPending.has(ws)) {
      return; // already converging
    }
    this.resnapshotPending.add(ws);

    // Drop the now-stale queue; the snapshot supersedes it.
    const buffer = terminal.outputBuffers.get(ws);
    if (buffer) {
      buffer.data.length = 0;
      buffer.size = 0;
    }

    // Signal the gap so the client can show a "resyncing" state; the snapshot
    // that follows performs the actual screen reset.
    this.safeSend(ws, JSON.stringify({ bytes: 0, type: 'output-dropped' }));

    const startedAt = Date.now();
    const poll = (): void => {
      if (!this.resnapshotPending.has(ws)) {
        return; // resolved or cancelled elsewhere
      }
      // Give up if the client left or the terminal/emulator went away meanwhile.
      if (ws.readyState !== 1 /* OPEN */ || !terminal.emulator || !terminal.clients.has(ws)) {
        this.resnapshotPending.delete(ws);
        return;
      }
      const drained = ws.bufferedAmount <= RESNAPSHOT_LOW_WATER_BYTES;
      const timedOut = Date.now() - startedAt > RESNAPSHOT_MAX_WAIT_MS;
      if (drained || timedOut) {
        // snapshotAndSend reads seqCounter after awaiting the emulator, so the
        // client's lastSeq jumps to "now" and the withheld frames (already in
        // the snapshot) are never replayed. Clear pending only after it sends.
        void this.snapshotAndSend(terminal, ws).finally(() => {
          this.resnapshotPending.delete(ws);
        });
        return;
      }
      setTimeout(poll, RESNAPSHOT_POLL_MS);
    };
    setTimeout(poll, RESNAPSHOT_POLL_MS);
  }

  // -----------------------------------------------------------------------
  // Private: handleReconnectFailure — handle failed reconnection
  // -----------------------------------------------------------------------

  private broadcastOutput(terminal: ManagedTerminal, data: string): void {
    // Assign a sequence number and append to the replay ring before broadcasting.
    const seq = this.appendSeqRing(terminal, data);
    const msg = JSON.stringify({ data, seq, type: 'output' });

    // Fallback mode (SHOOTER_SNAPSHOT_FALLBACK=raw): no emulator, so a slow
    // client cannot be resnapshotted — keep the legacy drop-oldest behaviour.
    if (!terminal.emulator) {
      this.broadcastOutputLegacy(terminal, msg);
      return;
    }

    const msgSize = Buffer.byteLength(msg, 'utf8');
    for (const ws of terminal.clients) {
      // A converging client receives no live frames until its snapshot is sent;
      // buffering them here would just re-overflow the socket.
      if (this.resnapshotPending.has(ws)) {
        continue;
      }

      const buffer = terminal.outputBuffers.get(ws);
      if (!buffer) {
        continue;
      }

      // Socket- or buffer-level overflow ⇒ the client cannot keep up. Converge
      // it to the current screen via resnapshot instead of dropping bytes (G1).
      if (
        ws.bufferedAmount > MAX_OUTPUT_BUFFER_BYTES ||
        buffer.size + msgSize > MAX_OUTPUT_BUFFER_BYTES
      ) {
        this.beginResnapshot(terminal, ws);
        continue;
      }

      buffer.data.push(msg);
      buffer.size += msgSize;
      this.flushOutputBuffer(ws, buffer);
    }
  }

  /**
   * Legacy broadcast path used only when the emulator is disabled
   * (SHOOTER_SNAPSHOT_FALLBACK=raw). Drops the oldest buffered output to make
   * room and notifies the client; there is no snapshot to converge it to.
   */
  private broadcastOutputLegacy(terminal: ManagedTerminal, msg: string): void {
    const msgSize = Buffer.byteLength(msg, 'utf8');
    for (const ws of terminal.clients) {
      // Skip if the socket has too much queued already.
      if (ws.bufferedAmount > MAX_OUTPUT_BUFFER_BYTES) {
        this.safeSend(ws, JSON.stringify({ bytes: msgSize, type: 'output-dropped' }));
        continue;
      }

      const buffer = terminal.outputBuffers.get(ws);
      if (!buffer) {
        continue;
      }

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
        if (droppedBytes > 0) {
          this.safeSend(ws, JSON.stringify({ bytes: droppedBytes, type: 'output-dropped' }));
        }
      }

      buffer.data.push(msg);
      buffer.size += msgSize;
      this.flushOutputBuffer(ws, buffer);
    }
  }

  // -----------------------------------------------------------------------
  // Private: startSessionDiscovery — polling for session files
  // -----------------------------------------------------------------------

  /** Broadcast a terminal-exited event to /ws/events for the activity feed. */
  private emitTerminalExited(terminalId: string, exitCode: null | number): void {
    broadcastEvent({
      code: exitCode ?? null,
      terminalId,
      type: 'terminal-exited',
    });
  }

  /** Evict a terminal, freeing all resources. */
  private evict(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return;
    }

    // Clear session-file poll timer if still running
    if (terminal.pollTimer) {
      clearInterval(terminal.pollTimer);
      terminal.pollTimer = null;
    }

    // Unsubscribe the no-op OpenCode watcher callback if present
    if (terminal.openCodeSessionId && terminal.openCodeNoopCb) {
      openCodeWatcher.stop(terminal.openCodeSessionId, terminal.openCodeNoopCb);
      terminal.openCodeNoopCb = null;
    }

    // Dispose the server-side emulator (frees its parser/buffer state)
    terminal.emulator?.dispose();
    terminal.emulator = null;

    // Disconnect from holder (but don't kill it — it may already be gone)
    terminal.pty.disconnect();

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
    terminal.scrollback = '';

    this.terminals.delete(id);
  }

  // -----------------------------------------------------------------------
  // Private: appendScrollback — append to cached scrollback string,
  //          trim from midpoint when cap exceeded
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Private: broadcastOutput — send output to all connected WS clients
  //          with backpressure management
  // -----------------------------------------------------------------------

  private handleReconnectFailure(
    record: Pick<TerminalRecord, 'holderPid' | 'id' | 'socketPath'>
  ): void {
    // Check if holder PID is still alive
    if (record.holderPid) {
      try {
        process.kill(record.holderPid, 0); // Signal 0 = check alive
        // PID is alive but socket failed — unusual state, still mark orphaned
        console.warn(
          `[pty-manager] Holder PID ${record.holderPid} alive but socket dead for ${record.id}`
        );
      } catch {
        // PID is dead — expected case
      }
    }

    // Check for .exit sidecar
    if (record.socketPath) {
      const exitFilePath = `${record.socketPath}.exit`;
      if (existsSync(exitFilePath)) {
        try {
          const exitData = JSON.parse(readFileSync(exitFilePath, 'utf8')) as {
            code: null | number;
            timestamp: number;
          };
          unlinkSync(exitFilePath);
          terminalStore.markExited(record.id, exitData.code);
          console.log(
            `[pty-manager] Terminal ${record.id} exited while disconnected (code=${exitData.code})`
          );
          return;
        } catch {
          // Malformed sidecar — fall through to orphan
        }
      }
    }

    // Mark as orphaned in SQLite (not added to in-memory Map)
    terminalStore.markOrphaned(record.id);
    console.log(`[pty-manager] Marked terminal ${record.id} as orphaned`);
  }

  private async reconnectOne(record: TerminalRecord): Promise<void> {
    if (!record.socketPath) {
      throw new Error('No socket path stored');
    }

    // Check for .exit sidecar file — the PTY may have exited while
    // the server was down
    const exitFilePath = `${record.socketPath}.exit`;
    if (existsSync(exitFilePath)) {
      try {
        const exitData = JSON.parse(readFileSync(exitFilePath, 'utf8')) as {
          code: null | number;
          timestamp: number;
        };
        unlinkSync(exitFilePath); // Clean up sidecar immediately
        terminalStore.markExited(record.id, exitData.code);
        console.log(
          `[pty-manager] Terminal ${record.id} exited while disconnected (code=${exitData.code})`
        );
        return; // Do not add to in-memory Map
      } catch {
        // Sidecar file may be malformed — continue with socket connect attempt
      }
    }

    // Try connecting to the holder via its Unix socket
    const client = new HolderClient();
    const connectResult = await client.connect(record.socketPath);

    // Parse stored args
    let parsedArgs: string[] = [];
    try {
      parsedArgs = JSON.parse(record.args) as string[];
    } catch {
      // Fallback to empty
    }

    const terminal: ManagedTerminal = {
      args: parsedArgs,
      authorityConnectionId: null, // Phase 3: claimed by the first interactive resize
      clients: new Set(),
      cols: record.cols,
      command: record.command,
      createdAt: new Date(record.createdAt),
      currentCwd: null,
      cwd: record.cwd,
      emulator: SNAPSHOT_ENABLED ? new TerminalEmulator(record.cols, record.rows) : null,
      exitCode: connectResult.exitCode,
      exitedAt: record.exitedAt ? new Date(record.exitedAt) : null,
      holderPid: record.holderPid ?? 0,
      id: record.id,
      isActive: false,
      openCodeNoopCb: null,
      openCodeSessionId: record.opencodeSessionId ?? null,
      outputBuffers: new Map(),
      pid: connectResult.pid,
      pollTimer: null,
      pty: client,
      rows: record.rows,
      scrollback: connectResult.scrollback,
      seqCounter: 0,
      seqRing: [],
      sessionFile: record.sessionFile ?? null,
      socketPath: record.socketPath,
      status: connectResult.exited ? 'exited' : 'running',
      watcherOffset: 0,
    };

    // Seed the fresh emulator with the holder's retained scrollback so a
    // snapshot taken right after a server restart reflects the screen as it was,
    // not a blank buffer. The scrollback is raw PTY bytes (escape sequences
    // included), which the emulator parses into the current screen state.
    if (terminal.emulator && connectResult.scrollback.length > 0) {
      terminal.emulator.write(connectResult.scrollback);
    }

    // If the PTY already exited, update SQLite and add to Map for visibility
    if (connectResult.exited) {
      terminal.exitedAt = terminal.exitedAt ?? new Date();
      terminalStore.markExited(record.id, connectResult.exitCode);
    }

    // Wire up all HolderClient callbacks
    this.wireHolderCallbacks(client, terminal);

    // Re-attach session watchers
    if (terminal.sessionFile) {
      // No-op: session-handler.ts subscribes when a client connects.
      // Previously called sessionWatcher.watch() with an empty callback,
      // which blocked real subscribers due to the single-callback guard.
    }
    if (terminal.openCodeSessionId) {
      const noopCb = (_messages: ConversationMessage[]): void => {
        /* noop */
      };
      terminal.openCodeNoopCb = noopCb;
      openCodeWatcher.watch(terminal.openCodeSessionId, noopCb);
    }

    // Restart session discovery if session hasn't been found yet
    if (!terminal.sessionFile && !terminal.openCodeSessionId && terminal.status === 'running') {
      this.startSessionDiscovery(terminal);
    }

    // Update PID in SQLite if it changed (e.g., holder restarted PTY — unlikely but defensive)
    if (record.pid !== connectResult.pid) {
      terminalStore.update(record.id, { pid: connectResult.pid });
    }

    this.terminals.set(record.id, terminal);
    console.log(
      `[pty-manager] Reconnected terminal ${record.id} (pid=${connectResult.pid}, ` +
        `holder=${record.holderPid}, status=${terminal.status})`
    );
  }

  /** Safely send a message to a WebSocket, returning false on failure. */
  private safeSend(ws: WebSocket, msg: string): boolean {
    try {
      // readyState 1 === OPEN
      if (ws.readyState !== 1) {
        return false;
      }
      ws.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  /** Send cached scrollback data to a newly connected client in 50 KB chunks. */
  private async sendScrollback(terminal: ManagedTerminal, ws: WebSocket): Promise<void> {
    const fullData = terminal.scrollback;
    if (fullData.length === 0) {
      return;
    }

    const totalBytes = Buffer.byteLength(fullData, 'utf8');
    const totalChunks = Math.ceil(totalBytes / SCROLLBACK_CHUNK_SIZE);

    if (totalChunks <= 1) {
      // Single chunk — send directly
      const msg = JSON.stringify({
        chunk: 1,
        data: fullData,
        total: 1,
        type: 'scrollback',
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
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const end = Math.min(offset + SCROLLBACK_CHUNK_SIZE, buf.length);
      const chunkData = buf.subarray(offset, end).toString('utf8');
      const msg = JSON.stringify({
        chunk: chunkIndex,
        data: chunkData,
        total: totalChunks,
        type: 'scrollback',
      });
      this.safeSend(ws, msg);
      offset = end;
      chunkIndex++;
    }
  }

  private startSessionDiscovery(terminal: ManagedTerminal): void {
    const { command, cwd, id } = terminal;

    // For Claude Code: detect the session file by watching the project
    // directory for new JSONL files created after launch.
    if (command === 'claude') {
      const projectDir = path.join(
        process.env.HOME || '',
        '.claude',
        'projects',
        cwd.replace(/\//g, '-')
      );

      // Fast path: `claude --resume <uuid>` resumes an existing session whose
      // JSONL file was created before this terminal launched. The birthtime
      // filter used in the polling loop would never find it, so check directly.
      const resumeIdx = terminal.args.indexOf('--resume');
      if (resumeIdx !== -1 && resumeIdx + 1 < terminal.args.length) {
        const resumeId = terminal.args[resumeIdx + 1];
        // Validate resumeId is a safe identifier (UUID or hex string, no path separators)
        if (!/^[0-9a-f-]+$/i.test(resumeId)) {
          console.warn(`[pty-manager] Invalid resume ID: ${resumeId}`);
        } else {
          const resumeFile = path.join(projectDir, `${resumeId}.jsonl`);
          if (existsSync(resumeFile)) {
            terminal.sessionFile = resumeFile;
            terminalStore.update(id, { sessionFile: resumeFile });
            return; // File found immediately — no polling needed
          }
        }
      }

      const launchTime = terminal.createdAt.getTime();

      terminal.pollTimer = setInterval(() => {
        if (terminal.status === 'exited' || terminal.sessionFile) {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
          return;
        }
        try {
          if (!existsSync(projectDir)) {
            return;
          }
          const files = readdirSync(projectDir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => {
              const stat = statSync(path.join(projectDir, f));
              return {
                birthtime: stat.birthtimeMs,
                fullPath: path.join(projectDir, f),
                mtime: stat.mtimeMs,
                name: f,
              };
            })
            // Filter by CREATION time, not modification time.
            // Using mtime would match existing active sessions in the same
            // project directory (their mtime keeps updating as they write).
            .filter((f) => f.birthtime > launchTime)
            .sort((a, b) => b.birthtime - a.birthtime);

          if (files.length > 0) {
            terminal.sessionFile = files[0].fullPath;
            if (terminal.pollTimer) {
              clearInterval(terminal.pollTimer);
              terminal.pollTimer = null;
            }
            // Persist session file to SQLite
            terminalStore.update(id, { sessionFile: terminal.sessionFile });
          }
        } catch {
          // ignore filesystem errors
        }
      }, 1500);

      setTimeout(
        () => {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
        },
        5 * 60 * 1000
      );
    }

    // For OpenCode: detect the session via SQLite database lookup.
    // Only match sessions created AFTER this terminal launched (prevents
    // latching onto old sessions in the same directory).
    if (command === 'opencode') {
      const launchTime = terminal.createdAt.getTime();
      const pollInterval = setInterval(() => {
        if (terminal.status === 'exited' || terminal.openCodeSessionId) {
          clearInterval(pollInterval);
          if (terminal.openCodeSessionId) {
            const noopCb = (_messages: ConversationMessage[]): void => {
              /* noop */
            };
            terminal.openCodeNoopCb = noopCb;
            openCodeWatcher.watch(terminal.openCodeSessionId, noopCb);
          }
          return;
        }
        const sessionId = openCodeWatcher.findSessionId(cwd, launchTime);
        if (sessionId) {
          terminal.openCodeSessionId = sessionId;
          clearInterval(pollInterval);
          const noopCb = (_messages: ConversationMessage[]): void => {
            /* noop */
          };
          terminal.openCodeNoopCb = noopCb;
          openCodeWatcher.watch(sessionId, noopCb);
          // Persist session ID to SQLite
          terminalStore.update(id, { opencodeSessionId: sessionId });
        }
      }, 2000);

      terminal.pollTimer = pollInterval;
      setTimeout(
        () => {
          clearInterval(pollInterval);
          terminal.pollTimer = null;
        },
        5 * 60 * 1000
      );
    }

    // For Codex: poll ~/.codex/sessions for the rollout file created after
    // launch whose session_meta.cwd matches. Codex reuses the sessionFile
    // field (a JSONL path, like Claude); the WS adapter routes it to the
    // Codex watcher by its /.codex/ path.
    if (command === 'codex') {
      const launchTime = terminal.createdAt.getTime();
      terminal.pollTimer = setInterval(() => {
        if (terminal.status === 'exited' || terminal.sessionFile) {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
          return;
        }
        try {
          const rollout = findCodexRolloutForCwd(cwd, launchTime);
          if (rollout) {
            terminal.sessionFile = rollout;
            if (terminal.pollTimer) {
              clearInterval(terminal.pollTimer);
              terminal.pollTimer = null;
            }
            terminalStore.update(id, { sessionFile: rollout });
          }
        } catch {
          // ignore filesystem errors
        }
      }, 1500);

      setTimeout(
        () => {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
        },
        5 * 60 * 1000
      );
    }

    // For the read-only providers (cursor/copilot/qwen/gemini/amp): poll their
    // store for a session started after launch and matching this cwd, then set
    // sessionFile to that path. The WS adapter routes it to the generic watcher
    // by its provider-root path, giving the same live-tail the JSONL watchers
    // provide for Claude/Codex.
    const readOnlySource = readOnlySourceForCommand(command);
    if (readOnlySource) {
      const launchTime = terminal.createdAt.getTime();
      terminal.pollTimer = setInterval(() => {
        if (terminal.status === 'exited' || terminal.sessionFile) {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
          return;
        }
        try {
          const file = discoverReadOnlyProviderSessionFile(
            readOnlySource,
            cwd,
            launchTime,
            Date.now()
          );
          if (file) {
            terminal.sessionFile = file;
            if (terminal.pollTimer) {
              clearInterval(terminal.pollTimer);
              terminal.pollTimer = null;
            }
            terminalStore.update(id, { sessionFile: file });
          }
        } catch {
          // ignore filesystem errors
        }
      }, 2000);

      setTimeout(
        () => {
          if (terminal.pollTimer) {
            clearInterval(terminal.pollTimer);
            terminal.pollTimer = null;
          }
        },
        5 * 60 * 1000
      );
    }
  }

  /** Wire up all HolderClient callbacks (activity, CWD, output, exit, disconnect). */
  private wireHolderCallbacks(client: HolderClient, terminal: ManagedTerminal): void {
    client.onActivity((active: boolean) => {
      terminal.isActive = active;
      const msg = JSON.stringify({ active, type: 'activity' });
      for (const ws of terminal.clients) {
        this.safeSend(ws, msg);
      }
    });

    client.onCwd((path: string) => {
      terminal.currentCwd = path;
      const msg = JSON.stringify({ path, type: 'cwd' });
      for (const ws of terminal.clients) {
        this.safeSend(ws, msg);
      }
    });

    client.onOutput((data: string) => {
      terminal.emulator?.write(data);
      this.appendScrollback(terminal, data);
      this.broadcastOutput(terminal, data);
    });

    client.onExit((exitCode: null | number) => {
      terminal.status = 'exited';
      terminal.exitCode = exitCode;
      terminal.exitedAt = new Date();
      terminalStore.markExited(terminal.id, exitCode);

      this.emitTerminalExited(terminal.id, exitCode);

      const exitMsg = JSON.stringify({
        code: exitCode,
        signal: null,
        type: 'exit',
      });
      for (const ws of terminal.clients) {
        this.safeSend(ws, exitMsg);
      }
    });

    client.onDisconnect(() => {
      if (terminal.status === 'running') {
        console.warn(`[pty-manager] Holder disconnected unexpectedly for terminal ${terminal.id}`);
        terminal.status = 'exited';
        terminal.exitedAt = new Date();
        terminalStore.markOrphaned(terminal.id);
        this.emitTerminalExited(terminal.id, null);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// PtyManager
// ---------------------------------------------------------------------------

function resolveHolderPath(): string {
  if (process.env.SHOOTER_HOLDER_PATH) {
    return process.env.SHOOTER_HOLDER_PATH;
  }
  // In dev: __dirname is src/lib/modules/server/terminal/ → pty-holder.cjs is co-located
  // In prod: __dirname is build/server/chunks/ → pty-holder.cjs is at build/ (copied by postbuild)
  const colocated = path.join(__dirname, 'pty-holder.cjs');
  if (existsSync(colocated)) {
    return colocated;
  }
  // Walk up from build/server/chunks/ to build/
  return path.resolve(__dirname, '..', '..', 'pty-holder.cjs');
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

// Use globalThis to ensure a single shared instance across module loaders.
// server.ts (tsx) and SvelteKit's build handler load this module separately.
const PTY_GLOBAL_KEY = '__shooter_pty_manager';
export const ptyManager: PtyManager =
  ((globalThis as Record<string, unknown>)[PTY_GLOBAL_KEY] as PtyManager) || new PtyManager();
(globalThis as Record<string, unknown>)[PTY_GLOBAL_KEY] = ptyManager;
