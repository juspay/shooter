// WebSocket handler for /ws/session/:id — structured session stream.
// Used by the Chat view for AI sessions. Sends parsed conversation history
// on connect and streams new messages (text, tool-use, tool-result,
// thinking) as they appear.

import type {
  WireSessionClientMessage as ClientMessage,
  WsConnectionState as ConnectionState,
  ConversationMessage,
  WireHistoryMessage as HistoryMessage,
  WireHistoryPart as HistoryPart,
  SessionManagedTerminal as ManagedTerminal,
  MessagePart,
  SessionPtyManagerFullLike as PtyManagerFullLike,
  SessionPtyManagerLike as PtyManagerLike,
  WireSessionServerMessage as ServerMessage,
  SessionWatcherLike,
  TextContentBlock,
} from '$lib/types';
import type { WebSocket } from 'ws';

import * as fs from 'fs';
import * as path from 'path';

import { findCodexRolloutById } from '../sessions/codex-reader';

// ── Module-level references ──────────────────────────────────────────

let _ptyManager: null | PtyManagerLike = null;
let _ptyManagerFull: null | PtyManagerFullLike = null;
let _sessionWatcher: null | SessionWatcherLike = null;

/**
 * Handle a new WebSocket connection on the `/ws/session/:id` channel.
 * Accepts BOTH Shooter terminal IDs and external Claude Code session UUIDs.
 *
 * Resolution order:
 * 1. Try `_ptyManager.getTerminal(id)` — works for Shooter terminal IDs.
 * 2. Search all terminals for one whose `sessionFile` contains the UUID.
 * 3. If still no terminal, treat as an external session — find the JSONL
 *    file directly and stream it via the session watcher.
 */
export function handleSessionConnection(ws: WebSocket, id: string): void {
  const state: ConnectionState = {
    isExternalSession: false,
    retryInterval: null,
    terminalId: id,
    unsubscribe: null,
  };

  // ── 1. Try to resolve to a terminal ──────────────────────────────
  let terminal: ManagedTerminal | undefined;

  if (_ptyManager) {
    // 1a. Direct terminal ID lookup
    terminal = _ptyManager.getTerminal(id);

    // 1b. Search by session UUID in sessionFile paths
    if (!terminal) {
      terminal = findTerminalBySessionUuid(id);
    }
  }

  // ── 2. If we found a terminal, use the normal flow ───────────────
  if (terminal) {
    state.terminalId = terminal.id;
    subscribeToSession(ws, state, terminal);
    wireClientMessages(ws, state);
    wireCleanup(ws, state);
    return;
  }

  // ── 3. External session — find JSONL file directly ───────────────
  const jsonlPath = findJsonlFileForSession(id);
  if (jsonlPath) {
    state.isExternalSession = true;
    subscribeToExternalSession(ws, state, jsonlPath);
    wireClientMessages(ws, state);
    wireCleanup(ws, state);
    return;
  }

  // Nothing found at all
  safeSend(ws, { message: `Session not found: ${id}`, type: 'error' });
  ws.close(1008, 'Session not found');
}

/**
 * Register the PTY manager instance. Called once during server bootstrap.
 * If the manager also exposes a `list()` method, it is stored as the full
 * reference for UUID-based terminal search.
 */
export function setPtyManager(manager: PtyManagerLike): void {
  _ptyManager = manager;
  if ('list' in manager && typeof (manager as PtyManagerFullLike).list === 'function') {
    _ptyManagerFull = manager as PtyManagerFullLike;
  }
}

/**
 * Register the session watcher instance. Called once during server bootstrap.
 */
export function setSessionWatcher(watcher: SessionWatcherLike): void {
  _sessionWatcher = watcher;
}

/**
 * Convert ConversationMessage[] into HistoryMessage[] for the initial
 * `history` payload sent when a client connects.
 */
function conversationToHistory(messages: ConversationMessage[]): HistoryMessage[] {
  return messages
    .filter((msg) => msg.parts.length > 0)
    .map((msg) => ({
      content: msg.parts.map(partToHistoryPart),
      id: msg.id,
      role: msg.role,
      timestamp: msg.timestamp,
    }));
}

/**
 * Convert a single ConversationMessage into one or more ServerMessages
 * for the live stream.
 */
function conversationToLive(msg: ConversationMessage): ServerMessage[] {
  const messages: ServerMessage[] = [];
  const textBlocks: TextContentBlock[] = [];

  for (const part of msg.parts) {
    switch (part.type) {
      case 'text':
        textBlocks.push({ content: part.content, type: 'text' });
        break;
      case 'thinking':
        messages.push({ text: part.content, type: 'thinking' });
        break;
      case 'tool_result':
        messages.push({
          id: part.toolUseId,
          isError: part.isError,
          output: part.output,
          status: 'done',
          type: 'tool-result',
        });
        break;
      case 'tool_use':
        messages.push({
          id: part.id,
          input: part.input,
          name: part.toolName,
          status: 'running',
          type: 'tool-use',
        });
        break;
    }
  }

  if (textBlocks.length > 0) {
    messages.push({
      content: textBlocks,
      role: msg.role,
      timestamp: msg.timestamp,
      type: 'message',
    });
  }

  return messages;
}

/**
 * Scan ~/.claude/projects/ for a JSONL file matching the given session UUID.
 * Returns the absolute path if found, or null.
 */
function findJsonlFileForSession(sessionId: string): null | string {
  // Reject anything that could traverse out of the session directories before
  // it is interpolated into a filesystem path.
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return null;
  }

  const claudeProjectsDir = path.join(process.env.HOME || '', '.claude', 'projects');
  if (fs.existsSync(claudeProjectsDir)) {
    try {
      for (const dir of fs.readdirSync(claudeProjectsDir)) {
        const fullDir = path.join(claudeProjectsDir, dir);
        try {
          if (!fs.statSync(fullDir).isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }
        const jsonlPath = path.join(fullDir, `${sessionId}.jsonl`);
        if (fs.existsSync(jsonlPath)) {
          return jsonlPath;
        }
      }
    } catch {
      // Ignore filesystem errors
    }
  }

  // Fall back to an external Codex session: ~/.codex/sessions/**/rollout-*-<id>.jsonl
  return findCodexRolloutById(sessionId);
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Search all managed terminals for one whose sessionFile contains the
 * given session UUID. Returns the first match or undefined.
 */
function findTerminalBySessionUuid(uuid: string): ManagedTerminal | undefined {
  if (!_ptyManager) {
    return undefined;
  }

  // getTerminal only takes an ID — we need to probe. The PtyManager
  // exposes a list() method via its adapter, but the handler only has
  // the PtyManagerLike interface with getTerminal(). We'll use the
  // module-level _ptyManagerFull reference if available.
  if (_ptyManagerFull) {
    for (const t of _ptyManagerFull.list()) {
      // Match across every provider's file naming so a running non-Claude
      // agent can be reached (and replied to) by its session UUID:
      //   claude/cursor/qwen: <uuid>.jsonl ; codex: -<uuid>.jsonl ;
      //   copilot: <uuid>.jsonl OR <uuid>/events.jsonl ; amp: T-<uuid>.json ;
      //   opencode: bare session id.
      if (
        t.sessionFile?.includes(`${uuid}.jsonl`) ||
        t.sessionFile?.endsWith(`/${uuid}/events.jsonl`) ||
        t.sessionFile?.endsWith(`/T-${uuid}.json`) ||
        t.openCodeSessionId === uuid
      ) {
        return _ptyManager.getTerminal(t.id);
      }
    }
  }
  return undefined;
}

/** Parse and validate an inbound client message. */
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return null;
    }

    switch (msg.type) {
      case 'cancel':
        return { type: 'cancel' };
      case 'send-input':
        if (typeof msg.text !== 'string' || msg.text.length === 0) {
          return null;
        }
        // Cap input length at 10KB to prevent abuse.
        if (msg.text.length > 10240) {
          return null;
        }
        return { text: msg.text, type: 'send-input' };
      case 'subscribe':
        if (typeof msg.sessionId !== 'string' || msg.sessionId.length === 0) {
          return null;
        }
        return { sessionId: msg.sessionId, type: 'subscribe' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Conversion: ConversationMessage → wire format ────────────────────

/**
 * Map a single MessagePart to the HistoryPart wire format.
 */
function partToHistoryPart(part: MessagePart): HistoryPart {
  switch (part.type) {
    case 'text':
      return { content: part.content, type: 'text' };
    case 'thinking':
      return { content: part.content, type: 'thinking' };
    case 'tool_result':
      return {
        isError: part.isError,
        output: part.output,
        toolUseId: part.toolUseId,
        type: 'tool_result',
      };
    case 'tool_use':
      return { id: part.id, input: part.input, toolName: part.toolName, type: 'tool_use' };
  }
}

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

/**
 * Subscribe to an external session (one with no Shooter terminal).
 * Reads history from the JSONL file and streams live updates via
 * the session watcher.
 */
function subscribeToExternalSession(
  ws: WebSocket,
  state: ConnectionState,
  jsonlPath: string
): void {
  if (!_sessionWatcher) {
    safeSend(ws, { message: 'Session watcher not initialised', type: 'error' });
    safeSend(ws, { messages: [], type: 'history' });
    return;
  }

  // Send full history
  try {
    const allMessages = _sessionWatcher.getHistory(jsonlPath);
    const historyMessages = conversationToHistory(allMessages);
    safeSend(ws, { messages: historyMessages, type: 'history' });
  } catch (err) {
    console.error(`[ws/session] Failed to read external history for ${state.terminalId}:`, err);
    safeSend(ws, { messages: [], type: 'history' });
  }

  // Stream live updates
  try {
    const unsubscribe = _sessionWatcher.subscribe(jsonlPath, (messages: ConversationMessage[]) => {
      if (ws.readyState !== 1 /* OPEN */) {
        return;
      }
      for (const msg of messages) {
        const liveMessages = conversationToLive(msg);
        for (const liveMsg of liveMessages) {
          safeSend(ws, liveMsg);
        }
      }
    });
    state.unsubscribe = unsubscribe;
  } catch (err) {
    console.error(`[ws/session] Failed to subscribe to external session ${state.terminalId}:`, err);
    safeSend(ws, { message: 'Failed to subscribe to session updates', type: 'error' });
  }
}

// ── Connection state ─────────────────────────────────────────────────

/**
 * Subscribe to a terminal's session file. Sends the full history as a
 * `history` message, then streams new entries as they appear.
 */
function subscribeToSession(
  ws: WebSocket,
  state: ConnectionState,
  terminal: ManagedTerminal
): void {
  // Use sessionFile for Claude Code (JSONL) or openCodeSessionId for OpenCode (SQLite).
  const sessionKey = terminal.sessionFile || terminal.openCodeSessionId;

  // If no session key yet and the terminal is still running, the session ID
  // may not have been discovered yet (e.g., pty-manager is still polling for
  // the OpenCode session). Poll until it appears rather than giving up.
  if (!sessionKey && terminal.status === 'running') {
    safeSend(ws, { messages: [], type: 'history' });

    // Clear any previous retry interval to prevent accumulation on re-subscribe.
    if (state.retryInterval) {
      clearInterval(state.retryInterval);
      state.retryInterval = null;
    }

    state.retryInterval = setInterval(() => {
      // Re-fetch the terminal to get the latest sessionFile / openCodeSessionId.
      const freshTerminal = _ptyManager?.getTerminal(terminal.id);
      if (!freshTerminal) {
        if (state.retryInterval) {
          clearInterval(state.retryInterval);
          state.retryInterval = null;
        }
        return;
      }

      const key = freshTerminal.sessionFile || freshTerminal.openCodeSessionId;
      if (key || freshTerminal.status === 'exited') {
        if (state.retryInterval) {
          clearInterval(state.retryInterval);
          state.retryInterval = null;
        }
        if (key) {
          // Session discovered — send history and subscribe.
          subscribeWithSessionKey(ws, state, freshTerminal, key);
        } else {
          safeSend(ws, { type: 'session-end' });
        }
      }
    }, 2000);

    // Cleanup is handled by the single 'close' listener in handleSessionConnection.
    return;
  }

  // If no session key (e.g., a plain shell or already exited), send empty history.
  if (!sessionKey) {
    safeSend(ws, { messages: [], type: 'history' });

    if (terminal.status === 'exited') {
      safeSend(ws, { type: 'session-end' });
    }
    return;
  }

  subscribeWithSessionKey(ws, state, terminal, sessionKey);
}

// ── Main handler ─────────────────────────────────────────────────────

/**
 * Subscribe to a session using an already-known session key. Sends history
 * and starts streaming new entries. Extracted so both the normal path and
 * the retry-after-discovery path can share it.
 */
function subscribeWithSessionKey(
  ws: WebSocket,
  state: ConnectionState,
  terminal: ManagedTerminal,
  sessionKey: string
): void {
  if (!_sessionWatcher) {
    safeSend(ws, { message: 'Session watcher not initialised', type: 'error' });
    safeSend(ws, { messages: [], type: 'history' });
    return;
  }

  // ── Send full history ────────────────────────────────────────────
  try {
    const allMessages = _sessionWatcher.getHistory(sessionKey);
    const historyMessages = conversationToHistory(allMessages);
    safeSend(ws, { messages: historyMessages, type: 'history' });
  } catch (err) {
    console.error(`[ws/session] Failed to read history for ${terminal.id}:`, err);
    safeSend(ws, { messages: [], type: 'history' });
  }

  // ── Stream new messages ────────────────────────────────────────
  try {
    const unsubscribe = _sessionWatcher.subscribe(sessionKey, (messages: ConversationMessage[]) => {
      if (ws.readyState !== 1 /* OPEN */) {
        return;
      }

      for (const msg of messages) {
        const liveMessages = conversationToLive(msg);
        for (const liveMsg of liveMessages) {
          safeSend(ws, liveMsg);
        }
      }
    });

    // Store unsubscribe so we can clean up on close or re-subscribe.
    state.unsubscribe = unsubscribe;
  } catch (err) {
    console.error(`[ws/session] Failed to subscribe for ${terminal.id}:`, err);
    safeSend(ws, { message: 'Failed to subscribe to session updates', type: 'error' });
  }

  // If the terminal already exited, signal it.
  if (terminal.status === 'exited') {
    safeSend(ws, { type: 'session-end' });
  }
}

/**
 * Wire up cleanup handlers for WebSocket close and error events.
 */
function wireCleanup(ws: WebSocket, state: ConnectionState): void {
  ws.on('close', () => {
    if (state.retryInterval) {
      clearInterval(state.retryInterval);
      state.retryInterval = null;
    }
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }
  });

  ws.on('error', () => {
    // Errors are followed by 'close', which handles cleanup.
  });
}

/**
 * Wire up client message handling (send-input, cancel, subscribe).
 * Extracted so both terminal-backed and external sessions share the same
 * message loop.
 */
function wireClientMessages(ws: WebSocket, state: ConnectionState): void {
  ws.on('message', (raw: Buffer | string) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const msg = parseClientMessage(data);
    if (!msg) {
      return;
    }

    try {
      switch (msg.type) {
        case 'cancel': {
          if (state.isExternalSession) {
            safeSend(ws, {
              message: 'Cannot cancel — this is a read-only session. Connect to a terminal first.',
              type: 'error',
            });
            return;
          }
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { message: 'Terminal has exited', type: 'error' });
            return;
          }
          currentTerminal.pty.write('\x03');
          break;
        }

        case 'send-input': {
          if (state.isExternalSession) {
            safeSend(ws, {
              message:
                'Cannot send input — this is a read-only session. Connect to a terminal first.',
              type: 'error',
            });
            return;
          }
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { message: 'Terminal has exited', type: 'error' });
            return;
          }
          currentTerminal.pty.write(`${msg.text}\n`);
          break;
        }

        case 'subscribe': {
          // (Re)subscribe to a different session. Clean up the old subscription.
          if (state.retryInterval) {
            clearInterval(state.retryInterval);
            state.retryInterval = null;
          }
          if (state.unsubscribe) {
            state.unsubscribe();
            state.unsubscribe = null;
          }

          // Try terminal first, then external
          const newTerminal =
            _ptyManager?.getTerminal(msg.sessionId) ?? findTerminalBySessionUuid(msg.sessionId);

          if (newTerminal) {
            state.terminalId = newTerminal.id;
            state.isExternalSession = false;
            subscribeToSession(ws, state, newTerminal);
          } else {
            const jsonlPath = findJsonlFileForSession(msg.sessionId);
            if (jsonlPath) {
              state.terminalId = msg.sessionId;
              state.isExternalSession = true;
              subscribeToExternalSession(ws, state, jsonlPath);
            } else {
              safeSend(ws, {
                message: `Session not found: ${msg.sessionId}`,
                type: 'error',
              });
            }
          }
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ws/session] Error handling ${msg.type} for ${state.terminalId}:`, errMsg);
      safeSend(ws, { message: `Failed to handle ${msg.type}: ${errMsg}`, type: 'error' });
    }
  });
}
