import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';

import type { ConversationMessage, MessagePart } from '../sessions/types';

import { parseJsonlText } from '../sessions/jsonl-parser';

/**
 * Callback invoked when new JSONL entries are parsed from a watched file.
 */
type OnNewEntries = (entries: ConversationMessage[]) => void;

interface WatchedFile {
  callbacks: Set<OnNewEntries>;
  filePath: string;
  offset: number;
  watcher: FSWatcher;
}

// Path to Claude Code's project session data
const CLAUDE_PROJECTS_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

/**
 * SessionWatcher provides incremental, file-change-driven reading of
 * Claude Code JSONL session files. It uses chokidar to detect writes
 * and reads only the bytes appended since the last read, parsing them
 * into structured ConversationMessage entries.
 */
class SessionWatcher {
  // Track assistant turns that span multiple JSONL lines, keyed by filePath
  private assistantTurnsPerFile = new Map<
    string,
    Map<string, { parts: MessagePart[]; timestamp: string }>
  >();
  // Buffer for incomplete trailing lines (no terminating newline yet)
  private lineBufferPerFile = new Map<string, string>();
  // Track message index per file for generating fallback IDs
  private messageIndexPerFile = new Map<string, number>();
  private watchedFiles = new Map<string, WatchedFile>();

  /**
   * Read all entries from a JSONL file from the beginning.
   * Used for catch-up replay when a new client connects mid-session.
   */
  getHistory(filePath: string): ConversationMessage[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const assistantTurns = new Map<string, { parts: MessagePart[]; timestamp: string }>();
      const messages = parseJsonlText(raw, assistantTurns, 0);

      // Flush any remaining incomplete assistant turns
      for (const [msgId, turn] of assistantTurns) {
        if (turn.parts.length > 0) {
          messages.push({
            id: msgId,
            parts: turn.parts,
            role: 'assistant',
            timestamp: turn.timestamp,
          });
        }
      }

      return messages;
    } catch (error) {
      console.error(`[session-watcher] Failed to read history for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get raw JSONL entries from a session file (unparsed objects).
   */
  getRawEntries(filePath: string): Record<string, unknown>[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entries: Record<string, unknown>[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {continue;}
        try {
          entries.push(JSON.parse(trimmed));
        } catch {
          // skip malformed lines
        }
      }
      return entries;
    } catch (error) {
      console.error(`[session-watcher] Failed to read raw entries for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Stop watching a specific file and clean up resources.
   */
  stop(filePath: string): void {
    const watched = this.watchedFiles.get(filePath);
    if (!watched) {
      return;
    }

    watched.watcher.close();
    this.watchedFiles.delete(filePath);
    this.assistantTurnsPerFile.delete(filePath);
    this.messageIndexPerFile.delete(filePath);
    this.lineBufferPerFile.delete(filePath);

    console.log(`[session-watcher] Stopped watching: ${filePath}`);
  }

  /**
   * Stop watching all files and clean up all resources.
   */
  stopAll(): void {
    for (const [filePath] of this.watchedFiles) {
      this.stop(filePath);
    }
  }

  /**
   * Subscribe to new JSONL entries for a file. If the file is not yet
   * being watched, starts watching it. Returns an unsubscribe function
   * that removes the callback (and stops the watcher when no subscribers
   * remain). Matches the multi-subscriber pattern used by OpenCodeWatcher.
   */
  subscribe(filePath: string, onNewEntries: OnNewEntries): () => void {
    const existing = this.watchedFiles.get(filePath);
    if (existing) {
      // Already watching — just add the new callback.
      existing.callbacks.add(onNewEntries);
      console.log(
        `[session-watcher] Added subscriber to: ${filePath} (total=${existing.callbacks.size})`
      );
      return () => {
        existing.callbacks.delete(onNewEntries);
        console.log(
          `[session-watcher] Removed subscriber from: ${filePath} (remaining=${existing.callbacks.size})`
        );
        if (existing.callbacks.size === 0) {
          this.stop(filePath);
        }
      };
    }

    // Initialize tracking state for this file
    const initialOffset = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    this.assistantTurnsPerFile.set(filePath, new Map());
    this.messageIndexPerFile.set(filePath, 0);
    this.lineBufferPerFile.set(filePath, '');

    const watcher = chokidarWatch(filePath, {
      // Debounce rapid successive writes
      awaitWriteFinish: {
        pollInterval: 100,
        stabilityThreshold: 200,
      },
      // Don't emit 'add' event on initial scan — we handle catch-up via getHistory
      ignoreInitial: true,
      // Use polling as a fallback for network filesystems
      usePolling: false,
    });

    const watched: WatchedFile = {
      callbacks: new Set([onNewEntries]),
      filePath,
      offset: initialOffset,
      watcher,
    };

    watcher.on('change', () => {
      this.readNewEntries(watched);
    });

    // Handle file creation if it doesn't exist yet (PTY Manager may
    // start watching before the AI process creates the file)
    watcher.on('add', () => {
      this.readNewEntries(watched);
    });

    watcher.on('error', (error) => {
      console.error(`[session-watcher] Error watching ${filePath}:`, error);
    });

    this.watchedFiles.set(filePath, watched);
    console.log(`[session-watcher] Watching: ${filePath} (offset: ${initialOffset})`);

    return () => {
      watched.callbacks.delete(onNewEntries);
      console.log(
        `[session-watcher] Removed subscriber from: ${filePath} (remaining=${watched.callbacks.size})`
      );
      if (watched.callbacks.size === 0) {
        this.stop(filePath);
      }
    };
  }

  /**
   * Start watching a JSONL file for new entries (legacy API).
   * Delegates to subscribe() internally. Callers that need to
   * unsubscribe should use subscribe() directly instead.
   */
  watch(filePath: string, onNewEntries: OnNewEntries): void {
    this.subscribe(filePath, onNewEntries);
  }

  /**
   * Read bytes appended since last offset, parse new JSONL lines,
   * and invoke the callback with any new messages.
   */
  private readNewEntries(watched: WatchedFile): void {
    const { filePath } = watched;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    const currentSize = stat.size;
    if (currentSize <= watched.offset) {
      // File truncated or unchanged — reset offset if truncated
      if (currentSize < watched.offset) {
        console.warn(`[session-watcher] File truncated, resetting offset: ${filePath}`);
        watched.offset = 0;
        this.assistantTurnsPerFile.set(filePath, new Map());
        this.messageIndexPerFile.set(filePath, 0);
        this.lineBufferPerFile.set(filePath, '');
      }
      return;
    }

    // Read only the new bytes
    const fd = fs.openSync(filePath, 'r');
    try {
      const bytesToRead = currentSize - watched.offset;
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, watched.offset);
      watched.offset = currentSize;

      const chunk = buffer.toString('utf-8');
      // Prepend any buffered incomplete line from previous read
      const previousBuffer = this.lineBufferPerFile.get(filePath) || '';
      const combined = previousBuffer + chunk;

      // Split on newlines. If the chunk does not end with a newline,
      // the last segment is an incomplete line — buffer it for next time.
      const segments = combined.split('\n');
      if (!combined.endsWith('\n')) {
        this.lineBufferPerFile.set(filePath, segments.pop() || '');
      } else {
        this.lineBufferPerFile.set(filePath, '');
        // Remove trailing empty segment from the final newline
        if (segments.length > 0 && segments[segments.length - 1] === '') {
          segments.pop();
        }
      }

      const completeLines = segments.filter((line) => line.trim());
      if (completeLines.length === 0) {
        return;
      }

      // Parse the new lines using the file's accumulated assistant turn state
      const assistantTurns = this.assistantTurnsPerFile.get(filePath) || new Map();
      const startIndex = this.messageIndexPerFile.get(filePath) || 0;
      const newText = completeLines.join('\n');
      const newMessages = parseJsonlText(newText, assistantTurns, startIndex);

      // Update the message index counter
      this.messageIndexPerFile.set(filePath, startIndex + completeLines.length);

      if (newMessages.length > 0) {
        for (const cb of watched.callbacks) {
          try {
            cb(newMessages);
          } catch (cbError) {
            console.error('[session-watcher] Callback error:', cbError);
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

/**
 * Compute the JSONL file path for a Claude Code session.
 * ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl
 */
export function sessionFilePath(cwd: string, sessionId: string): string {
  const encoded = encodeCwd(cwd);
  return path.join(CLAUDE_PROJECTS_DIR, encoded, `${sessionId}.jsonl`);
}

/**
 * Encode a working directory path the way Claude Code does:
 * replace `/` with `-` so `/Users/me/project` becomes `-Users-me-project`.
 */
function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

// Use globalThis to ensure a single shared instance across module loaders.
const SW_GLOBAL_KEY = '__shooter_session_watcher';
export const sessionWatcher: SessionWatcher =
	((globalThis as Record<string, unknown>)[SW_GLOBAL_KEY] as SessionWatcher) ||
	new SessionWatcher();
(globalThis as Record<string, unknown>)[SW_GLOBAL_KEY] = sessionWatcher;
