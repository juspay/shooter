// WebSocket handler for /ws/terminal/:id — raw PTY I/O stream.
// Relays terminal output to connected clients and routes client input
// (keystrokes, resize, signals) back to the PTY.

import type { WebSocket } from 'ws';

// ── Types ────────────────────────────────────────────────────────────

/** Inbound messages from the client. */
type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'signal'; signal: 'SIGINT' | 'SIGTERM' | 'SIGTSTP' };

/** Outbound messages to the client. */
type ServerMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'scrollback'; data: string; chunk: number; total: number }
  | { type: 'output-dropped'; bytes: number }
  | { type: 'error'; message: string };

// ── Constants ────────────────────────────────────────────────────────

/** Signal name → numeric code for process.kill(). */
const SIGNAL_MAP: Record<string, NodeJS.Signals> = {
  SIGINT: 'SIGINT',
  SIGTERM: 'SIGTERM',
  SIGTSTP: 'SIGTSTP',
};

// ── PTY Manager interface ────────────────────────────────────────────
// Minimal duck-typed interface matching the real pty-manager singleton.

interface ManagedTerminal {
  id: string;
  pty: {
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    pid: number;
  };
  clients: Set<WebSocket>;
  scrollback: string[];
  status: 'running' | 'exited';
  exitCode: number | null;
}

interface PtyManagerLike {
  getTerminal: (id: string) => ManagedTerminal | undefined;
  attach: (id: string, ws: WebSocket) => boolean;
  detach: (id: string, ws: WebSocket) => boolean;
}

// Placeholder: will be replaced with the real ptyManager singleton import.
// import { ptyManager } from '../terminal/pty-manager';
let _ptyManager: PtyManagerLike | null = null;

/**
 * Register the PTY manager instance. Called once during server bootstrap
 * after the PTY manager is initialised.
 */
export function setPtyManager(manager: PtyManagerLike): void {
  _ptyManager = manager;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Safely send a JSON message over a WebSocket. */
function safeSend(ws: WebSocket, msg: ServerMessage): boolean {
  try {
    if (ws.readyState !== 1 /* OPEN */) {
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

/** Parse and validate an inbound client message. Returns null for invalid messages. */
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return null;
    }

    switch (msg.type) {
      case 'input':
        if (typeof msg.data !== 'string') return null;
        return { type: 'input', data: msg.data };
      case 'resize':
        if (typeof msg.cols !== 'number' || typeof msg.rows !== 'number') return null;
        if (msg.cols < 1 || msg.rows < 1 || msg.cols > 500 || msg.rows > 200) return null;
        return { type: 'resize', cols: Math.floor(msg.cols), rows: Math.floor(msg.rows) };
      case 'signal':
        if (typeof msg.signal !== 'string' || !(msg.signal in SIGNAL_MAP)) return null;
        return {
          type: 'signal',
          signal: msg.signal as ClientMessage & { type: 'signal' } extends { signal: infer S }
            ? S
            : never,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────

/**
 * Handle a new WebSocket connection on the `/ws/terminal/:id` channel.
 * Attaches the client to the terminal's viewer set, replays scrollback,
 * and relays PTY I/O bidirectionally.
 */
export function handleTerminalConnection(ws: WebSocket, terminalId: string): void {
  // ── 1. Look up the terminal ──────────────────────────────────────
  if (!_ptyManager) {
    safeSend(ws, { type: 'error', message: 'PTY manager not initialised' });
    ws.close(1011, 'PTY manager not initialised');
    return;
  }

  const terminal = _ptyManager.getTerminal(terminalId);
  if (!terminal) {
    safeSend(ws, { type: 'error', message: `Terminal not found: ${terminalId}` });
    ws.close(1008, 'Terminal not found');
    return;
  }

  // ── 2. Attach via pty-manager (registers client + sends scrollback) ──
  // The pty-manager's attach() adds ws to terminal.clients AND
  // terminal.outputBuffers, then replays scrollback. Its broadcastOutput()
  // loop delivers all PTY output — no per-client onData listener needed.
  _ptyManager.attach(terminalId, ws);

  // If the terminal already exited, tell the client immediately.
  if (terminal.status === 'exited') {
    safeSend(ws, { type: 'exit', code: terminal.exitCode, signal: null });
  }

  // ── 3. Handle messages from the client ───────────────────────────
  ws.on('message', (raw: Buffer | string) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const msg = parseClientMessage(data);
    if (!msg) {
      return; // Silently ignore malformed messages.
    }

    // Don't allow input to exited terminals.
    if (terminal.status === 'exited') {
      safeSend(ws, { type: 'error', message: 'Terminal has exited' });
      return;
    }

    try {
      switch (msg.type) {
        case 'input':
          terminal.pty.write(msg.data);
          break;

        case 'resize':
          terminal.pty.resize(msg.cols, msg.rows);
          break;

        case 'signal': {
          if (msg.signal === 'SIGINT') {
            terminal.pty.write('\x03');
          } else if (msg.signal === 'SIGTSTP') {
            terminal.pty.write('\x1a');
          } else if (msg.signal === 'SIGTERM' && terminal.pty.pid) {
            process.kill(terminal.pty.pid, 'SIGTERM');
          }
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ws/terminal] Error handling ${msg.type} for ${terminalId}:`, errMsg);
      safeSend(ws, { type: 'error', message: `Failed to handle ${msg.type}: ${errMsg}` });
    }
  });

  // ── 4. Cleanup on disconnect ─────────────────────────────────────
  ws.on('close', () => {
    _ptyManager?.detach(terminalId, ws);
  });

  ws.on('error', () => {
    // Errors are followed by 'close', which handles cleanup.
    // This handler prevents unhandled error crashes.
  });
}
