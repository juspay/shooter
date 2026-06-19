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
import type { TerminalEmulator } from '../modules/server/terminal/terminal-emulator';
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

/**
 * Watch state for the generic re-read-on-change watcher used by the
 * read-only providers (cursor, copilot, qwen, gemini, amp). Unlike the
 * byte-offset watchers, it re-parses the whole file on each change and
 * dedupes by message ID — robust for both append-only JSONL and
 * whole-document JSON formats.
 */
export interface GenericWatchedFile {
  callbacks: Set<OnNewEntries>;
  /** Message IDs already delivered, so re-reads only emit genuinely new messages. */
  emittedMessageIds: Set<string>;
  filePath: string;
  watcher: FSWatcher;
}

// ── pty-manager types ───────────────────────────────────────────────

/** Messages received from the holder process (local ndjson protocol). */
export type HolderIncomingMessage =
  | { active: boolean; type: 'activity' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { data: string; type: 'output' }
  | { data: string; type: 'scrollback' }
  | { exitCode: null | number; exited: boolean; pid: number; type: 'info' }
  | { path: string; type: 'cwd' };

/** Messages sent to the holder process (local ndjson protocol). */
export type HolderOutgoingMessage =
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'input' }
  | { signal?: string; type: 'kill' };

// ── session-watcher types ───────────────────────────────────────────

/**
 * Callback invoked when new JSONL entries are parsed from a watched file.
 */
export type OnNewEntries = (entries: ConversationMessage[]) => void;

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

// ── opencode-watcher types ──────────────────────────────────────────

export interface PtyManagedTerminal {
  args: string[];
  clients: Set<WebSocket>;
  cols: number;
  command: string;
  createdAt: Date;
  currentCwd: null | string;
  cwd: string;
  /** Server-side headless emulator for snapshot-on-join (null when disabled). */
  emulator: null | TerminalEmulator;
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
  /** Monotonic counter; equals the last assigned seq for this terminal. */
  seqCounter: number;
  /** Bounded replay ring of recent output chunks (max SEQ_RING_MAX_ENTRIES). */
  seqRing: SeqRingEntry[];
  sessionFile: null | string;
  socketPath: string;
  status: 'exited' | 'running';
  watcherOffset: number;
}

// ── codex-watcher types ─────────────────────────────────────────────

export interface PtyOutputBuffer {
  data: string[];
  size: number;
}

/**
 * One entry in the per-terminal sequence ring (in-memory store type;
 * structurally identical to the generated wire SeqRingEntry).
 */
export interface SeqRingEntry {
  data: string;
  seq: number;
}

export interface SessionWatchedFile {
  callbacks: Set<OnNewEntries>;
  filePath: string;
  offset: number;
  watcher: FSWatcher;
}

// ── generic-session-watcher types ───────────────────────────────────

/**
 * A serialized snapshot of a terminal's current screen (VT escape string)
 * produced by the server-side headless emulator, plus its dimensions.
 */
export interface TerminalSnapshot {
  cols: number;
  data: string;
  rows: number;
}
