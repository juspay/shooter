// WebSocket handler for /ws/terminal/:id — raw PTY I/O stream.
// Relays terminal output to connected clients and routes client input
// (keystrokes, resize, signals) back to the PTY.

import type { TerminalSignal } from '$generated/types';
import type { WebSocket } from 'ws';

// ── Types ────────────────────────────────────────────────────────────

/** Inbound messages from the client. */
type ClientMessage =
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'input' }
  | { signal: TerminalSignal; type: 'signal' };

/** Outbound messages to the client. */
type ServerMessage =
  | { bytes: number; type: 'output-dropped' }
  | { chunk: number; data: string; total: number; type: 'scrollback' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { data: string; type: 'output' }
  | { message: string; type: 'error' };

// ── Constants ────────────────────────────────────────────────────────

/** Signal name → numeric code for process.kill(). */
const SIGNAL_MAP: Record<string, NodeJS.Signals> = {
  SIGINT: 'SIGINT',
  SIGTERM: 'SIGTERM',
  SIGTSTP: 'SIGTSTP',
};

// ── PTY Manager type ─────────────────────────────────────────────────
// Minimal duck-typed shape matching the real pty-manager singleton.

interface ManagedTerminal {
  clients: Set<WebSocket>;
  exitCode: null | number;
  id: string;
  pty: {
    kill: (signal: string) => void;
    pid: number;
    resize: (cols: number, rows: number) => void;
    write: (data: string) => void;
  };
  status: 'exited' | 'running';
}

interface PtyManagerLike {
  attach: (id: string, ws: WebSocket) => boolean;
  detach: (id: string, ws: WebSocket) => boolean;
  getTerminal: (id: string) => ManagedTerminal | undefined;
}

// Placeholder: will be replaced with the real ptyManager singleton import.
// import { ptyManager } from '../terminal/pty-manager';
let _ptyManager: null | PtyManagerLike = null;

/**
 * Handle a new WebSocket connection on the `/ws/terminal/:id` channel.
 * Attaches the client to the terminal's viewer set, replays scrollback,
 * and relays PTY I/O bidirectionally.
 */
export function handleTerminalConnection(ws: WebSocket, terminalId: string): void {
  // ── 1. Look up the terminal ──────────────────────────────────────
  if (!_ptyManager) {
    safeSend(ws, { message: 'PTY manager not initialised', type: 'error' });
    ws.close(1011, 'PTY manager not initialised');
    return;
  }

  const terminal = _ptyManager.getTerminal(terminalId);
  if (!terminal) {
    safeSend(ws, { message: `Terminal not found: ${terminalId}`, type: 'error' });
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
    safeSend(ws, { code: terminal.exitCode, signal: null, type: 'exit' });
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
      safeSend(ws, { message: 'Terminal has exited', type: 'error' });
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
          } else if (msg.signal === 'SIGTERM') {
            terminal.pty.kill('SIGTERM');
          }
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ws/terminal] Error handling ${msg.type} for ${terminalId}:`, errMsg);
      safeSend(ws, { message: `Failed to handle ${msg.type}: ${errMsg}`, type: 'error' });
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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Register the PTY manager instance. Called once during server bootstrap
 * after the PTY manager is initialised.
 */
export function setPtyManager(manager: PtyManagerLike): void {
  _ptyManager = manager;
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
        if (typeof msg.data !== 'string') {
          return null;
        }
        return { data: msg.data, type: 'input' };
      case 'resize':
        if (
          typeof msg.cols !== 'number' ||
          typeof msg.rows !== 'number' ||
          !Number.isFinite(msg.cols) ||
          !Number.isFinite(msg.rows)
        ) {
          return null;
        }
        if (msg.cols < 1 || msg.rows < 1 || msg.cols > 500 || msg.rows > 200) {
          return null;
        }
        return { cols: Math.floor(msg.cols), rows: Math.floor(msg.rows), type: 'resize' };
      case 'signal':
        if (typeof msg.signal !== 'string' || !Object.hasOwn(SIGNAL_MAP, msg.signal)) {
          return null;
        }
        return {
          signal: msg.signal as TerminalSignal,
          type: 'signal',
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────

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
