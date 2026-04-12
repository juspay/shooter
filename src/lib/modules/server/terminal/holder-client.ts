/**
 * Holder Client
 *
 * Communicates with a PTY holder process over a Unix domain socket using
 * ndjson (newline-delimited JSON). Exposes the same duck-typed interface
 * that terminal-handler.ts and session-handler.ts expect (write, resize, pid),
 * so PtyManager can slot it in as `ManagedTerminal.pty`.
 */

import type {
  ConnectResult,
  HolderIncomingMessage as IncomingMessage,
  HolderOutgoingMessage as OutgoingMessage,
} from '$lib/types';

import * as net from 'net';

// ── HolderClient ──────────────────────────────────────────────────────

export class HolderClient {
  connected = false;
  pid = 0;

  private activityCb: ((active: boolean) => void) | null = null;
  private cwdCb: ((path: string) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  private exitCb: ((code: null | number) => void) | null = null;

  private lineBuf = '';
  private outputCb: ((data: string) => void) | null = null;
  private socket: net.Socket | null = null;

  /**
   * Connect to a holder process via its Unix domain socket.
   * Resolves once the initial `info` and `scrollback` handshake messages
   * have been received.
   */
  connect(socketPath: string): Promise<ConnectResult> {
    return new Promise<ConnectResult>((resolve, reject) => {
      let settled = false;
      let info: null | { exitCode: null | number; exited: boolean; pid: number } = null;
      let scrollback = '';
      const pendingMessages: IncomingMessage[] = [];

      // Handshake timeout: if the holder never sends info/scrollback,
      // reject so the caller does not hang indefinitely.
      const HANDSHAKE_TIMEOUT_MS = 10_000;
      const handshakeTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connected = false;
          if (this.socket) {
            this.socket.destroy();
            this.socket = null;
          }
          reject(
            new Error(`Handshake timeout: holder did not respond within ${HANDSHAKE_TIMEOUT_MS}ms`)
          );
        }
      }, HANDSHAKE_TIMEOUT_MS);

      const socket = net.createConnection(socketPath);
      this.socket = socket;

      socket.setEncoding('utf8');

      socket.on('connect', () => {
        this.connected = true;
      });

      socket.on('data', (chunk: string) => {
        this.lineBuf += chunk;
        const lines = this.lineBuf.split('\n');
        // Keep the last element — it is either empty (complete line)
        // or a partial line still being received.
        this.lineBuf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.length === 0) {
            continue;
          }

          let msg: IncomingMessage;
          try {
            msg = JSON.parse(line) as IncomingMessage;
          } catch {
            continue;
          }

          if (!settled) {
            // During handshake, collect info + scrollback.
            // Queue other messages (activity, cwd) to replay after settlement.
            if (msg.type === 'info') {
              info = { exitCode: msg.exitCode, exited: msg.exited, pid: msg.pid };
              this.pid = msg.pid;
            } else if (msg.type === 'scrollback') {
              scrollback = msg.data;
            } else {
              // Queue activity/cwd/exit messages received during handshake
              pendingMessages.push(msg);
            }

            // Handshake complete once we have info.
            if (info !== null) {
              const settle = (): void => {
                if (settled || !info) {
                  return;
                }
                settled = true;
                clearTimeout(handshakeTimer);
                resolve({
                  exitCode: info.exitCode,
                  exited: info.exited,
                  pid: info.pid,
                  scrollback,
                });
                // Replay queued messages in the next macrotask so that
                // callbacks registered after `await connect()` are wired
                // before the replay fires.
                const queued = [...pendingMessages];
                pendingMessages.length = 0;
                setTimeout(() => {
                  for (const pending of queued) {
                    this.handleMessage(pending);
                  }
                }, 0);
              };

              if (msg.type === 'scrollback') {
                // Got scrollback — resolve immediately.
                settle();
              } else if (msg.type === 'info') {
                // Got info but no scrollback yet. The holder sends
                // scrollback right after info if there IS data. Wait
                // 100ms to give scrollback time to arrive in a separate
                // TCP frame before resolving with empty scrollback.
                setTimeout(settle, 100);
              }
            }
          } else {
            this.handleMessage(msg);
          }
        }
      });

      socket.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(handshakeTimer);
          this.connected = false;
          this.socket = null;
          reject(err);
        }
      });

      socket.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.socket = null;
        this.lineBuf = '';

        if (!settled) {
          settled = true;
          clearTimeout(handshakeTimer);
          reject(new Error('Socket closed before handshake completed'));
          return;
        }

        // Unexpected disconnect after successful handshake.
        if (wasConnected && this.disconnectCb) {
          this.disconnectCb();
        }
      });
    });
  }

  /** Gracefully disconnect from the holder (does NOT kill the holder). */
  disconnect(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.lineBuf = '';
  }

  /** Send a signal to the PTY process (default SIGTERM). */
  kill(signal?: string): void {
    const msg: OutgoingMessage = { type: 'kill' };
    if (signal) {
      msg.signal = signal;
    }
    this.send(msg);
  }

  /** Register callback for activity state changes. */
  onActivity(cb: (active: boolean) => void): void {
    this.activityCb = cb;
  }

  /** Register callback for CWD changes. */
  onCwd(cb: (path: string) => void): void {
    this.cwdCb = cb;
  }

  /** Register callback for unexpected disconnect from holder. */
  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  /** Register callback for PTY exit. */
  onExit(cb: (code: null | number) => void): void {
    this.exitCb = cb;
  }

  /** Register callback for PTY output data. */
  onOutput(cb: (data: string) => void): void {
    this.outputCb = cb;
  }

  /** Resize the PTY. */
  resize(cols: number, rows: number): void {
    this.send({ cols, rows, type: 'resize' });
  }

  /** Write data to the PTY stdin. */
  write(data: string): void {
    this.send({ data, type: 'input' });
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /** Dispatch a post-handshake message from the holder. */
  private handleMessage(msg: IncomingMessage): void {
    switch (msg.type) {
      case 'activity':
        if (this.activityCb) {
          this.activityCb(msg.active);
        }
        break;

      case 'cwd':
        if (this.cwdCb) {
          this.cwdCb(msg.path);
        }
        break;

      case 'exit':
        if (this.exitCb) {
          this.exitCb(msg.code);
        }
        break;

      case 'output':
        if (this.outputCb) {
          this.outputCb(msg.data);
        }
        break;

      // info / scrollback after handshake are ignored.
      default:
        break;
    }
  }

  /** Send an ndjson message to the holder. */
  private send(msg: OutgoingMessage): void {
    if (!this.socket || !this.connected) {
      return;
    }
    this.socket.write(`${JSON.stringify(msg)}\n`);
  }
}
