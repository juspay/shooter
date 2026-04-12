// WebSocket module types — extracted from ws/ handler files.
// All WebSocket-related type/interface definitions live here.
//
// Names use a "Wire" prefix where they collide with generated types
// in WsProtocol.ts (which use class-wrapper discriminated unions).
// These "Wire" types are the simple literal unions used at runtime.

import type { WebSocket } from 'ws';

import type {
  MessageRole,
  NotificationSession,
  PermissionDecision,
  SessionSource,
  TerminalSignal,
  TextContentBlock,
} from './generated';
import type { ConversationMessage } from './sessions';

// ── events-handler types ────────────────────────────────────────────

export interface PendingPong {
  onClose: () => void;
  onPong: () => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── keepalive types ─────────────────────────────────────────────────

export type Session = NotificationSession;

// ── session-handler types ───────────────────────────────────────────

export interface SessionManagedTerminal {
  id: string;
  openCodeSessionId: null | string;
  pty: {
    pid: number;
    write: (data: string) => void;
  };
  sessionFile: null | string;
  status: 'exited' | 'running';
}

/** Extended PTY manager interface with list() for UUID-based terminal search. */
export interface SessionPtyManagerFullLike extends SessionPtyManagerLike {
  list: () => SessionManagedTerminal[];
}

export interface SessionPtyManagerLike {
  getTerminal: (id: string) => SessionManagedTerminal | undefined;
}

export interface SessionWatcherLike {
  getHistory: (sessionFile: string) => ConversationMessage[];
  subscribe: (
    sessionFile: string,
    callback: (messages: ConversationMessage[]) => void
  ) => () => void;
}

export interface TerminalManagedTerminal {
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

export interface TerminalPtyManagerLike {
  attach: (id: string, ws: WebSocket) => boolean;
  detach: (id: string, ws: WebSocket) => boolean;
  getTerminal: (id: string) => TerminalManagedTerminal | undefined;
}

/** A message in the history payload. */
export interface WireHistoryMessage {
  content: WireHistoryPart[];
  id: string;
  role: MessageRole;
  timestamp: string;
}

/** A single part within a history message — discriminated union. */
export type WireHistoryPart =
  | { content: string; type: 'text' }
  | { content: string; type: 'thinking' }
  | { id: string; input: Record<string, unknown>; toolName: string; type: 'tool_use' }
  | { isError: boolean; output: string; toolUseId: string; type: 'tool_result' };

/** Inbound messages from the client (session channel). */
export type WireSessionClientMessage =
  | { sessionId: string; type: 'subscribe' }
  | { text: string; type: 'send-input' }
  | { type: 'cancel' };

// ── terminal-handler types ──────────────────────────────────────────

/** Outbound messages to the client (session channel). */
export type WireSessionServerMessage =
  | { content: TextContentBlock[]; role: MessageRole; timestamp: string; type: 'message' }
  | {
      id: string;
      input: Record<string, unknown>;
      name: string;
      status: 'running';
      type: 'tool-use';
    }
  | { id: string; isError: boolean; output: string; status: 'done'; type: 'tool-result' }
  | { message: string; type: 'error' }
  | { messages: WireHistoryMessage[]; type: 'history' }
  | { text: string; type: 'thinking' }
  | { type: 'session-end' };

export type WireShooterEvent =
  | { code: null | number; terminalId: string; type: 'terminal-exited' }
  | { command: string; terminalId: string; type: 'terminal-created' }
  | { command?: string; filePath?: string; terminalId?: string; tool: string; type: 'tool-started' }
  | { decision: PermissionDecision; requestId: string; type: 'permission-resolved' }
  | { error: string; terminalId?: string; tool: string; type: 'tool-failed' }
  | {
      input: Record<string, unknown>;
      requestId: string;
      tool: string;
      type: 'permission-requested';
    }
  | { message: string; sessionId?: string; terminalId?: string; type: 'agent-question' }
  | { message?: string; sessionId?: string; terminalId?: string; type: 'agent-idle' }
  | { project: string; sessionId: string; source: SessionSource; type: 'session-started' }
  | { sessionId: string; summary: string; type: 'session-ended' }
  | { success: boolean; terminalId?: string; tool: string; type: 'tool-completed' };

/** Inbound messages from the client (terminal channel). */
export type WireTerminalClientMessage =
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'input' }
  | { signal: TerminalSignal; type: 'signal' };

/** Outbound messages to the client (terminal channel). */
export type WireTerminalServerMessage =
  | { bytes: number; type: 'output-dropped' }
  | { chunk: number; data: string; total: number; type: 'scrollback' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { data: string; type: 'output' }
  | { message: string; type: 'error' };

// ── notification-sessions type alias ────────────────────────────────

/** Per-connection state tracked for cleanup. */
export interface WsConnectionState {
  /** True when the session is file-only (no terminal backing it). */
  isExternalSession: boolean;
  retryInterval: null | ReturnType<typeof setInterval>;
  terminalId: string;
  unsubscribe: (() => void) | null;
}
