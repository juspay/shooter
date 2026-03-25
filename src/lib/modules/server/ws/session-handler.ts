// WebSocket handler for /ws/session/:id — structured session stream.
// Used by the Chat view for AI sessions. Sends parsed conversation history
// on connect and streams new messages (text, tool-use, tool-result,
// thinking) as they appear.

import type { WebSocket } from 'ws';

import type { ConversationMessage, MessagePart } from '../sessions/types';

// ── Types ────────────────────────────────────────────────────────────

/** Inbound messages from the client. */
type ClientMessage =
  | { sessionId: string; type: 'subscribe'; }
  | { text: string; type: 'send-input'; }
  | { type: 'cancel' };

/** A message in the history payload. */
interface HistoryMessage {
  content: HistoryPart[];
  id: string;
  role: MessageRole;
  timestamp: string;
}

/** A single part within a history message — discriminated union. */
type HistoryPart =
  | { content: string; type: 'text'; }
  | { content: string; type: 'thinking'; }
  | { id: string; input: Record<string, unknown>; toolName: string; type: 'tool_use'; }
  | { isError: boolean; output: string; toolUseId: string; type: 'tool_result'; };

interface ManagedTerminal {
  id: string;
  openCodeSessionId: null | string;
  pty: {
    pid: number;
    write: (data: string) => void;
  };
  sessionFile: null | string;
  status: 'exited' | 'running';
}

/** Role values that appear in session messages. */
type MessageRole = 'assistant' | 'system' | 'user';

interface PtyManagerLike {
  getTerminal: (id: string) => ManagedTerminal | undefined;
}

// ── PTY Manager interface ────────────────────────────────────────────

/** Outbound messages to the client. */
type ServerMessage =
  | { content: TextContentBlock[]; role: MessageRole; timestamp: string; type: 'message'; }
  | { id: string; input: Record<string, unknown>; name: string; status: 'running'; type: 'tool-use'; }
  | { id: string; isError: boolean; output: string; status: 'done'; type: 'tool-result'; }
  | { message: string; type: 'error'; }
  | { messages: HistoryMessage[]; type: 'history'; }
  | { text: string; type: 'thinking'; }
  | { type: 'session-end' };

interface SessionWatcherLike {
  getHistory: (sessionFile: string) => ConversationMessage[];
  subscribe: (sessionFile: string, callback: (messages: ConversationMessage[]) => void) => () => void;
}

// ── Session Watcher interface ────────────────────────────────────────

/** Content block in the live 'message' payload. */
interface TextContentBlock {
  content: string;
  type: 'text';
}

// ── Module-level references ──────────────────────────────────────────

let _ptyManager: null | PtyManagerLike = null;
let _sessionWatcher: null | SessionWatcherLike = null;

/** Per-connection state tracked for cleanup. */
interface ConnectionState {
  retryInterval: null | ReturnType<typeof setInterval>;
  terminalId: string;
  unsubscribe: (() => void) | null;
}

/**
 * Handle a new WebSocket connection on the `/ws/session/:id` channel.
 * Sends full conversation history on connect, then streams new entries
 * as they appear in the session file.
 */
export function handleSessionConnection(ws: WebSocket, terminalId: string): void {
  const state: ConnectionState = { retryInterval: null, terminalId, unsubscribe: null };

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

  // ── 2. Subscribe to session file ─────────────────────────────────
  subscribeToSession(ws, state, terminal);

  // ── 3. Handle messages from the client ───────────────────────────
  ws.on('message', (raw: Buffer | string) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const msg = parseClientMessage(data);
    if (!msg) {
      return;
    }

    try {
      switch (msg.type) {
        case 'cancel': {
          // Send SIGINT to the terminal process.
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { message: 'Terminal has exited', type: 'error' });
            return;
          }
          currentTerminal.pty.write('\x03');
          break;
        }

        case 'send-input': {
          // Write text + newline to PTY stdin (the Chat view sends complete
          // messages, not raw keystrokes).
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { message: 'Terminal has exited', type: 'error' });
            return;
          }
          currentTerminal.pty.write(`${msg.text  }\n`);
          break;
        }

        case 'subscribe': {
          // (Re)subscribe to a different session. Clean up the old subscription
          // and attach to the new terminal.
          const newTerminal = _ptyManager?.getTerminal(msg.sessionId);
          if (!newTerminal) {
            safeSend(ws, {
              message: `Terminal not found: ${msg.sessionId}`,
              type: 'error',
            });
            return;
          }

          // Tear down old subscription and retry interval.
          if (state.retryInterval) {
            clearInterval(state.retryInterval);
            state.retryInterval = null;
          }
          if (state.unsubscribe) {
            state.unsubscribe();
            state.unsubscribe = null;
          }

          state.terminalId = msg.sessionId;
          subscribeToSession(ws, state, newTerminal);
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ws/session] Error handling ${msg.type} for ${state.terminalId}:`, errMsg);
      safeSend(ws, { message: `Failed to handle ${msg.type}: ${errMsg}`, type: 'error' });
    }
  });

  // ── 4. Cleanup on disconnect ─────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Register the PTY manager instance. Called once during server bootstrap.
 */
export function setPtyManager(manager: PtyManagerLike): void {
  _ptyManager = manager;
}

/**
 * Register the session watcher instance. Called once during server bootstrap.
 */
export function setSessionWatcher(watcher: SessionWatcherLike): void {
  _sessionWatcher = watcher;
}

// ── Conversion: ConversationMessage → wire format ────────────────────

/**
 * Convert ConversationMessage[] into HistoryMessage[] for the initial
 * `history` payload sent when a client connects.
 */
function conversationToHistory(messages: ConversationMessage[]): HistoryMessage[] {
  return messages
    .filter(msg => msg.parts.length > 0)
    .map(msg => ({
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

/** Parse and validate an inbound client message. */
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return null;
    }

    switch (msg.type) {
      case 'cancel':
        return { type: 'cancel' };
      case 'send-input':
        if (typeof msg.text !== 'string' || msg.text.length === 0) {return null;}
        // Cap input length at 10KB to prevent abuse.
        if (msg.text.length > 10240) {return null;}
        return { text: msg.text, type: 'send-input' };
      case 'subscribe':
        if (typeof msg.sessionId !== 'string' || msg.sessionId.length === 0) {return null;}
        return { sessionId: msg.sessionId, type: 'subscribe' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Connection state ─────────────────────────────────────────────────

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
      return { isError: part.isError, output: part.output, toolUseId: part.toolUseId, type: 'tool_result' };
    case 'tool_use':
      return { id: part.id, input: part.input, toolName: part.toolName, type: 'tool_use' };
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
    const unsubscribe = _sessionWatcher.subscribe(
      sessionKey,
      (messages: ConversationMessage[]) => {
        if (ws.readyState !== 1 /* OPEN */) {
          return;
        }

        for (const msg of messages) {
          const liveMessages = conversationToLive(msg);
          for (const liveMsg of liveMessages) {
            safeSend(ws, liveMsg);
          }
        }
      }
    );

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
