// Server module types — extracted from terminal/ module files.
// All terminal server-side type/interface definitions live here.
//
// Names are prefixed to avoid collisions with generated types in the
// barrel (e.g. generated/Holder.ts exports IncomingMessage, OutgoingMessage,
// WatchedFile; generated/OpenCode.ts exports WatchState).

import type { FSWatcher } from 'chokidar';
import type WebSocket from 'ws';

import type { CodexStreamParser } from '../modules/server/sessions/codex-parser';
import type { HolderClient } from '../modules/server/terminal/holder-client';
import type { ConversationMessage } from './sessions';

// ── holder-client types ─────────────────────────────────────────────

export interface CodexWatchState {
  callbacks: Set<(messages: ConversationMessage[]) => void>;
  idleTimer: null | ReturnType<typeof setTimeout>;
  /** Incomplete trailing line buffered between reads. */
  lineBuffer: string;
  offset: number;
  parser: CodexStreamParser;
  watcher: FSWatcher;
}

/** Messages received from the holder process (local ndjson protocol). */
export type HolderIncomingMessage =
  | { active: boolean; type: 'activity' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { data: string; type: 'output' }
  | { data: string; type: 'scrollback' }
  | { exitCode: null | number; exited: boolean; pid: number; type: 'info' }
  | { path: string; type: 'cwd' };

// ── pty-manager types ───────────────────────────────────────────────

/** Messages sent to the holder process (local ndjson protocol). */
export type HolderOutgoingMessage =
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'input' }
  | { signal?: string; type: 'kill' };

/**
 * Callback invoked when new JSONL entries are parsed from a watched file.
 */
export type OnNewEntries = (entries: ConversationMessage[]) => void;

// ── session-watcher types ───────────────────────────────────────────

export interface OpenCodeWatchState {
  callbacks: Set<(messages: ConversationMessage[]) => void>;
  /** Set of message IDs we have already emitted, to avoid duplicates. */
  emittedMessageIds: Set<string>;
  /** Map of part ID to last-seen time_updated, to detect in-place updates. */
  emittedPartUpdatedAt: Map<string, number>;
  intervalHandle: ReturnType<typeof setInterval>;
  /** Highest time_created we have seen for messages (milliseconds). */
  lastMessageTime: number;
  /** Highest time_updated we have seen for parts (milliseconds). */
  lastPartTime: number;
  sessionId: string;
}

export interface PtyManagedTerminal {
  args: string[];
  clients: Set<WebSocket>;
  cols: number;
  command: string;
  createdAt: Date;
  currentCwd: null | string;
  cwd: string;
  exitCode: null | number;
  exitedAt: Date | null;
  holderPid: number;
  id: string;
  isActive: boolean;
  openCodeNoopCb: ((messages: ConversationMessage[]) => void) | null;
  openCodeSessionId: null | string;
  outputBuffers: Map<WebSocket, PtyOutputBuffer>;
  pid: number;
  pollTimer: null | ReturnType<typeof setInterval>;
  pty: HolderClient;
  rows: number;
  scrollback: string;
  sessionFile: null | string;
  socketPath: string;
  status: 'exited' | 'running';
  watcherOffset: number;
}

// ── opencode-watcher types ──────────────────────────────────────────

export interface PtyOutputBuffer {
  data: string[];
  size: number;
}

// ── codex-watcher types ─────────────────────────────────────────────

export interface SessionWatchedFile {
  callbacks: Set<OnNewEntries>;
  filePath: string;
  offset: number;
  watcher: FSWatcher;
}
