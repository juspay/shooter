// WebSocket handler for /ws/terminal/:id — raw PTY I/O stream.
// Relays terminal output to connected clients and routes client input
// (keystrokes, resize, signals) back to the PTY.

import type {
  WireTerminalClientMessage as ClientMessage,
  TerminalPtyManagerLike as PtyManagerLike,
  WireTerminalServerMessage as ServerMessage,
  TerminalSignal,
  TicketScope,
} from '$lib/types';
import type { WebSocket } from 'ws';

import { randomBytes } from 'crypto';

// ── Constants ────────────────────────────────────────────────────────

/** Signal name → numeric code for process.kill(). */
const SIGNAL_MAP: Record<string, NodeJS.Signals> = {
  SIGINT: 'SIGINT',
  SIGTERM: 'SIGTERM',
  SIGTSTP: 'SIGTSTP',
};

// Placeholder: will be replaced with the real ptyManager singleton import.
// import { ptyManager } from '../terminal/pty-manager';
let _ptyManager: null | PtyManagerLike = null;

/**
 * Handle a new WebSocket connection on the `/ws/terminal/:id` channel.
 * Attaches the client to the terminal's viewer set, replays scrollback,
 * and relays PTY I/O bidirectionally.
 */
export function handleTerminalConnection(
  ws: WebSocket,
  terminalId: string,
  scope?: TicketScope,
  snapshotCapable = false,
  lastSeq = 0
): void {
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

  // Phase 3: stable per-connection id, used to claim/hold resize authority.
  // Phase 4 will pass this in from setupWebSocketHandlers (the WS upgrade handler).
  const connectionId = randomBytes(8).toString('hex');

  // ── 2. Attach via pty-manager (registers client + sends initial state) ──
  // Snapshot-capable clients (?caps=snapshot) get a serialized current-screen
  // snapshot; others get the legacy raw scrollback replay. A reconnecting
  // client also passes lastSeq (>0) so attach() can replay only the missing
  // frames from the ring instead of re-snapshotting. attach() adds the ws to
  // terminal.clients + outputBuffers; broadcastOutput() then delivers all live
  // PTY output — no per-client onData listener needed.
  _ptyManager.attach(terminalId, ws, { lastSeq, snapshot: snapshotCapable });

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

    // View-only guests: every inbound frame type mutates the PTY — drop them all.
    if (scope?.readOnly) {
      return;
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

        case 'resize': {
          // Phase 3: driver-authoritative resize (fixes G4). Only the authority
          // connection's resize reaches the PTY; non-authority senders keep their
          // own xterm fitted locally — no PTY call and no broadcast from here.
          if (!isResizeAuthority(connectionId, terminal.authorityConnectionId)) {
            break;
          }
          // Claim the slot on the first authoritative resize (sticky until this
          // connection disconnects — see the close handler below).
          if (terminal.authorityConnectionId === null) {
            terminal.authorityConnectionId = connectionId;
          }
          // Route through the manager so dims persist (G5) and the new size
          // broadcasts to ALL clients including this sender (a no-op echo),
          // matching the REST /resize path.
          _ptyManager?.resize(terminal.id, msg.cols, msg.rows);
          break;
        }

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
    // Phase 3: release resize authority if this connection held it, so the next
    // interactive client can claim it. Phase 4 replaces this with driver release.
    if (terminal.authorityConnectionId === connectionId) {
      terminal.authorityConnectionId = null;
    }
    _ptyManager?.detach(terminalId, ws);
  });

  ws.on('error', () => {
    // Errors are followed by 'close', which handles cleanup.
    // This handler prevents unhandled error crashes.
  });
}

/**
 * Phase 3: driver-authoritative resize predicate (D1). Returns true iff this
 * connection may resize the PTY.
 *
 * P3 policy: the first interactive (non-readOnly) connection to send a resize
 * claims authority; it stays the authority until that connection disconnects,
 * at which point the slot clears and the next interactive resize claims it.
 * This is "first-claimer, sticky-until-disconnect" — NOT last-writer-wins, which
 * is exactly what causes the multi-client resize fight (G4).
 *
 * Pure decision (the caller performs the claim/clear), so it mirrors the unit
 * test and lets Phase 4 swap the body to `connectionId === terminal.driver`
 * without touching the call site.
 */
export function isResizeAuthority(
  connectionId: string,
  authorityConnectionId: null | string
): boolean {
  if (authorityConnectionId === null) {
    return true; // unclaimed — the first interactive resize wins
  }
  return connectionId === authorityConnectionId;
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
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const msg = parsed as Record<string, unknown>;
    if (typeof msg.type !== 'string') {
      return null;
    }

    switch (msg.type) {
      case 'input':
        if (typeof msg.data !== 'string') {
          return null;
        }
        return { data: msg.data, type: 'input' };
      case 'resize': {
        const cols = msg.cols;
        const rows = msg.rows;
        if (
          typeof cols !== 'number' ||
          typeof rows !== 'number' ||
          !Number.isFinite(cols) ||
          !Number.isFinite(rows)
        ) {
          return null;
        }
        if (cols < 1 || rows < 1 || cols > 500 || rows > 200) {
          return null;
        }
        return { cols: Math.floor(cols), rows: Math.floor(rows), type: 'resize' };
      }
      case 'signal': {
        const signal = msg.signal;
        if (typeof signal !== 'string' || !Object.hasOwn(SIGNAL_MAP, signal)) {
          return null;
        }
        return {
          signal: signal as TerminalSignal,
          type: 'signal',
        };
      }
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
