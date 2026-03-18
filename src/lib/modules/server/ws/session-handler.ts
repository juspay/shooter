// WebSocket handler for /ws/session/:id — structured session stream.
// Used by the Chat view for AI sessions. Sends parsed conversation history
// on connect and streams new entries (messages, tool-use, tool-result,
// thinking) as they appear in the session file.

import type { WebSocket } from 'ws';

// ── Types ────────────────────────────────────────────────────────────

/** Content block in a message (text, image, tool-use, etc.). */
type ContentBlock = Record<string, unknown>;

/** Inbound messages from the client. */
type ClientMessage =
  | { type: 'send-input'; text: string }
  | { type: 'cancel' }
  | { type: 'subscribe'; sessionId: string };

/** Outbound messages to the client. */
type ServerMessage =
  | { type: 'history'; messages: HistoryMessage[] }
  | { type: 'message'; role: string; content: ContentBlock[]; timestamp: string }
  | { type: 'tool-use'; name: string; input: Record<string, unknown>; status: string; id: string }
  | { type: 'tool-result'; id: string; output: string; status: string; isError: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'session-end' }
  | { type: 'error'; message: string };

/** A message in the history payload. */
interface HistoryMessage {
  id: string;
  role: string;
  content: HistoryPart[];
  timestamp: string;
}

/** A single part within a history message. */
interface HistoryPart {
  type: string;
  [key: string]: unknown;
}

// ── PTY Manager interface ────────────────────────────────────────────

interface ManagedTerminal {
  id: string;
  pty: {
    write: (data: string) => void;
    pid: number;
  };
  sessionFile: string | null;
  status: 'running' | 'exited';
}

interface PtyManagerLike {
  getTerminal: (id: string) => ManagedTerminal | undefined;
}

// ── Session Watcher interface ────────────────────────────────────────

/** A parsed session entry from JSONL or SQLite. */
interface SessionEntry {
  type: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    content?: unknown;
    stop_reason?: string;
  };
  toolUseResult?: {
    content?: unknown;
  };
}

/** Callback invoked when new entries appear in a session file. */
type EntryCallback = (entries: SessionEntry[]) => void;

interface SessionWatcherLike {
  getHistory: (sessionFile: string) => SessionEntry[];
  subscribe: (sessionFile: string, callback: EntryCallback) => () => void;
}

// ── Module-level references ──────────────────────────────────────────

let _ptyManager: PtyManagerLike | null = null;
let _sessionWatcher: SessionWatcherLike | null = null;

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

/** Parse and validate an inbound client message. */
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return null;
    }

    switch (msg.type) {
      case 'send-input':
        if (typeof msg.text !== 'string' || msg.text.length === 0) return null;
        // Cap input length at 10KB to prevent abuse.
        if (msg.text.length > 10240) return null;
        return { type: 'send-input', text: msg.text };
      case 'cancel':
        return { type: 'cancel' };
      case 'subscribe':
        if (typeof msg.sessionId !== 'string' || msg.sessionId.length === 0) return null;
        return { type: 'subscribe', sessionId: msg.sessionId };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Convert raw SessionEntry[] from the watcher into HistoryMessage[] for
 * the initial `history` payload. Groups assistant entries by message ID,
 * extracts text/thinking/tool_use/tool_result parts.
 */
function entriesToHistoryMessages(entries: SessionEntry[]): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  const assistantTurns = new Map<string, { content: HistoryPart[]; timestamp: string }>();

  for (const entry of entries) {
    try {
      if (entry.type === 'user') {
        const msg = entry.message;
        if (!msg?.content) continue;

        const parts: HistoryPart[] = [];
        const content = Array.isArray(msg.content) ? msg.content : [msg.content];

        for (const block of content) {
          if (typeof block === 'string') {
            parts.push({ type: 'text', content: block });
          } else if (block && typeof block === 'object') {
            const b = block as Record<string, unknown>;
            if (b.type === 'text') {
              parts.push({ type: 'text', content: (b.text as string) || '' });
            } else if (b.type === 'tool_result') {
              let output = '';
              if (typeof b.content === 'string') {
                output = b.content;
              } else if (Array.isArray(b.content)) {
                output = (b.content as Record<string, unknown>[])
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text as string)
                  .join('\n');
              }
              // Check toolUseResult for richer data.
              if (entry.toolUseResult?.content) {
                const trc = entry.toolUseResult.content;
                if (typeof trc === 'string') {
                  output = trc;
                } else if (Array.isArray(trc)) {
                  output = (trc as Record<string, unknown>[])
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text as string)
                    .join('\n');
                }
              }
              parts.push({
                type: 'tool_result',
                toolUseId: (b.tool_use_id as string) || '',
                output: typeof output === 'string' ? output.slice(0, 2000) : '',
                isError: !!b.is_error,
              });
            }
          }
        }

        if (parts.length > 0) {
          messages.push({
            id: entry.uuid || `user-${messages.length}`,
            role: 'user',
            content: parts,
            timestamp: entry.timestamp || '',
          });
        }
      } else if (entry.type === 'assistant') {
        const msg = entry.message;
        if (!msg?.content) continue;

        const content = Array.isArray(msg.content) ? msg.content : [msg.content];
        const msgId = msg.id || entry.uuid || `assistant-${messages.length}`;

        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          const b = block as Record<string, unknown>;

          let part: HistoryPart | null = null;
          switch (b.type) {
            case 'text':
              part = { type: 'text', content: (b.text as string) || '' };
              break;
            case 'thinking':
              part = { type: 'thinking', content: (b.thinking as string) || '' };
              break;
            case 'tool_use':
              part = {
                type: 'tool_use',
                id: (b.id as string) || '',
                toolName: (b.name as string) || 'Unknown',
                input: (b.input as Record<string, unknown>) || {},
              };
              break;
          }

          if (part) {
            if (!assistantTurns.has(msgId)) {
              assistantTurns.set(msgId, { content: [], timestamp: entry.timestamp || '' });
            }
            assistantTurns.get(msgId)!.content.push(part);
          }
        }

        // If this entry has a stop_reason, the turn is complete.
        if (msg.stop_reason) {
          const turn = assistantTurns.get(msgId);
          if (turn && turn.content.length > 0) {
            messages.push({
              id: msgId,
              role: 'assistant',
              content: turn.content,
              timestamp: turn.timestamp,
            });
            assistantTurns.delete(msgId);
          }
        }
      }
    } catch {
      // Skip malformed entries.
    }
  }

  // Flush remaining assistant turns (in-progress or missing stop_reason).
  for (const [msgId, turn] of assistantTurns) {
    if (turn.content.length > 0) {
      messages.push({
        id: msgId,
        role: 'assistant',
        content: turn.content,
        timestamp: turn.timestamp,
      });
    }
  }

  return messages;
}

/**
 * Convert a single new SessionEntry into one or more ServerMessages for
 * the live stream. Returns an array because one entry may produce
 * multiple messages (e.g., an assistant entry with text + tool_use).
 */
function entryToLiveMessages(entry: SessionEntry): ServerMessage[] {
  const messages: ServerMessage[] = [];

  try {
    if (entry.type === 'user') {
      const msg = entry.message;
      if (!msg?.content) return messages;

      const content = Array.isArray(msg.content) ? msg.content : [msg.content];
      const contentBlocks: ContentBlock[] = [];

      for (const block of content) {
        if (typeof block === 'string') {
          contentBlocks.push({ type: 'text', text: block });
        } else if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (b.type === 'text') {
            contentBlocks.push({ type: 'text', text: (b.text as string) || '' });
          } else if (b.type === 'tool_result') {
            let output = '';
            if (typeof b.content === 'string') {
              output = b.content;
            } else if (Array.isArray(b.content)) {
              output = (b.content as Record<string, unknown>[])
                .filter((c) => c.type === 'text')
                .map((c) => c.text as string)
                .join('\n');
            }
            if (entry.toolUseResult?.content) {
              const trc = entry.toolUseResult.content;
              if (typeof trc === 'string') {
                output = trc;
              } else if (Array.isArray(trc)) {
                output = (trc as Record<string, unknown>[])
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text as string)
                  .join('\n');
              }
            }
            messages.push({
              type: 'tool-result',
              id: (b.tool_use_id as string) || '',
              output: typeof output === 'string' ? output.slice(0, 2000) : '',
              status: 'done',
              isError: !!b.is_error,
            });
          }
        }
      }

      if (contentBlocks.length > 0) {
        messages.push({
          type: 'message',
          role: 'user',
          content: contentBlocks,
          timestamp: entry.timestamp || '',
        });
      }
    } else if (entry.type === 'assistant') {
      const msg = entry.message;
      if (!msg?.content) return messages;

      const content = Array.isArray(msg.content) ? msg.content : [msg.content];
      const textBlocks: ContentBlock[] = [];

      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;

        switch (b.type) {
          case 'text':
            textBlocks.push({ type: 'text', text: (b.text as string) || '' });
            break;
          case 'thinking':
            messages.push({
              type: 'thinking',
              text: (b.thinking as string) || '',
            });
            break;
          case 'tool_use':
            messages.push({
              type: 'tool-use',
              name: (b.name as string) || 'Unknown',
              input: (b.input as Record<string, unknown>) || {},
              status: 'running',
              id: (b.id as string) || '',
            });
            break;
        }
      }

      if (textBlocks.length > 0) {
        messages.push({
          type: 'message',
          role: 'assistant',
          content: textBlocks,
          timestamp: entry.timestamp || '',
        });
      }

      // If the assistant turn is complete, optionally signal it.
      if (msg.stop_reason === 'end_turn') {
        messages.push({ type: 'session-end' });
      }
    }
  } catch {
    // Skip malformed entries.
  }

  return messages;
}

// ── Connection state ─────────────────────────────────────────────────

/** Per-connection state tracked for cleanup. */
interface ConnectionState {
  terminalId: string;
  unsubscribe: (() => void) | null;
}

// ── Main handler ─────────────────────────────────────────────────────

/**
 * Handle a new WebSocket connection on the `/ws/session/:id` channel.
 * Sends full conversation history on connect, then streams new entries
 * as they appear in the session file.
 */
export function handleSessionConnection(ws: WebSocket, terminalId: string): void {
  const state: ConnectionState = { terminalId, unsubscribe: null };

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
        case 'send-input': {
          // Write text + newline to PTY stdin (the Chat view sends complete
          // messages, not raw keystrokes).
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { type: 'error', message: 'Terminal has exited' });
            return;
          }
          currentTerminal.pty.write(msg.text + '\n');
          break;
        }

        case 'cancel': {
          // Send SIGINT to the terminal process.
          const currentTerminal = _ptyManager?.getTerminal(state.terminalId);
          if (!currentTerminal || currentTerminal.status === 'exited') {
            safeSend(ws, { type: 'error', message: 'Terminal has exited' });
            return;
          }
          try {
            process.kill(currentTerminal.pty.pid, 'SIGINT');
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            safeSend(ws, { type: 'error', message: `Failed to cancel: ${errMsg}` });
          }
          break;
        }

        case 'subscribe': {
          // (Re)subscribe to a different session. Clean up the old subscription
          // and attach to the new terminal.
          const newTerminal = _ptyManager?.getTerminal(msg.sessionId);
          if (!newTerminal) {
            safeSend(ws, {
              type: 'error',
              message: `Terminal not found: ${msg.sessionId}`,
            });
            return;
          }

          // Tear down old subscription.
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
      safeSend(ws, { type: 'error', message: `Failed to handle ${msg.type}: ${errMsg}` });
    }
  });

  // ── 4. Cleanup on disconnect ─────────────────────────────────────
  ws.on('close', () => {
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
 * Subscribe to a terminal's session file. Sends the full history as a
 * `history` message, then streams new entries as they appear.
 */
function subscribeToSession(
  ws: WebSocket,
  state: ConnectionState,
  terminal: ManagedTerminal
): void {
  // If no session file (e.g., a plain shell), send empty history.
  if (!terminal.sessionFile) {
    safeSend(ws, { type: 'history', messages: [] });

    // If the terminal already exited, signal it.
    if (terminal.status === 'exited') {
      safeSend(ws, { type: 'session-end' });
    }
    return;
  }

  if (!_sessionWatcher) {
    safeSend(ws, { type: 'error', message: 'Session watcher not initialised' });
    safeSend(ws, { type: 'history', messages: [] });
    return;
  }

  // ── Send full history ────────────────────────────────────────────
  try {
    const allEntries = _sessionWatcher.getHistory(terminal.sessionFile);
    const historyMessages = entriesToHistoryMessages(allEntries);
    safeSend(ws, { type: 'history', messages: historyMessages });
  } catch (err) {
    console.error(`[ws/session] Failed to read history for ${terminal.id}:`, err);
    safeSend(ws, { type: 'history', messages: [] });
  }

  // ── Stream new entries ───────────────────────────────────────────
  try {
    const unsubscribe = _sessionWatcher.subscribe(
      terminal.sessionFile,
      (entries: SessionEntry[]) => {
        if (ws.readyState !== 1 /* OPEN */) {
          return;
        }

        for (const entry of entries) {
          const liveMessages = entryToLiveMessages(entry);
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
    safeSend(ws, { type: 'error', message: 'Failed to subscribe to session updates' });
  }

  // If the terminal already exited, signal it.
  if (terminal.status === 'exited') {
    safeSend(ws, { type: 'session-end' });
  }
}
