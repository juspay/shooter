import { type FSWatcher, watch as chokidarWatch } from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';

import type { ConversationMessage, MessagePart } from '../sessions/types';

/**
 * Callback invoked when new JSONL entries are parsed from a watched file.
 */
type OnNewEntries = (entries: ConversationMessage[]) => void;

interface WatchedFile {
  callback: OnNewEntries;
  filePath: string;
  offset: number;
  watcher: FSWatcher;
}

// Path to Claude Code's project session data
const CLAUDE_PROJECTS_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

/**
 * Encode a working directory path the way Claude Code does:
 * replace `/` with `-` so `/Users/me/project` becomes `-Users-me-project`.
 */
function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
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
 * Parse assistant content blocks into MessagePart entries.
 * Mirrors the logic in jsonl-reader.ts parseAssistantBlock.
 */
function parseAssistantBlock(block: Record<string, unknown>): MessagePart | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  switch (block.type) {
    case 'text':
      return { content: (block.text as string) || '', type: 'text' };
    case 'thinking':
      return { content: (block.thinking as string) || '', type: 'thinking' };
    case 'tool_use':
      return {
        id: (block.id as string) || '',
        input: (block.input as Record<string, unknown>) || {},
        toolName: (block.name as string) || 'Unknown',
        type: 'tool_use',
      };
    default:
      return null;
  }
}

/**
 * Parse a single JSONL line into zero or more ConversationMessage entries.
 * Returns an array because a single line may produce both a user message
 * and associated tool result entries.
 *
 * For assistant entries, partial accumulation is handled by the caller
 * using the assistantTurns map.
 */
function parseJsonlLine(
  line: string,
  assistantTurns: Map<string, { parts: MessagePart[]; timestamp: string }>,
  messageIndex: number
): { assistantCompleted: ConversationMessage[]; messages: ConversationMessage[] } {
  const messages: ConversationMessage[] = [];
  const assistantCompleted: ConversationMessage[] = [];

  const entry = JSON.parse(line);
  const entryType = entry.type;

  if (entryType === 'user') {
    const msg = entry.message;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const parts: MessagePart[] = [];
    const content = Array.isArray(msg.content) ? msg.content : [msg.content];

    for (const block of content) {
      if (typeof block === 'string') {
        parts.push({ content: block, type: 'text' });
      } else if (block.type === 'text') {
        parts.push({ content: block.text || '', type: 'text' });
      } else if (block.type === 'tool_result') {
        let output = '';
        if (typeof block.content === 'string') {
          output = block.content;
        } else if (Array.isArray(block.content)) {
          output = block.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n');
        }
        if (entry.toolUseResult?.content) {
          const trc = entry.toolUseResult.content;
          if (typeof trc === 'string') {
            output = trc;
          } else if (Array.isArray(trc)) {
            output = trc
              .filter((c: { type: string }) => c.type === 'text')
              .map((c: { text: string }) => c.text)
              .join('\n');
          }
        }
        parts.push({
          isError: block.is_error || false,
          output: output.slice(0, 2000),
          toolUseId: block.tool_use_id || '',
          type: 'tool_result',
        });
      }
    }

    if (parts.length > 0 && parts.some((p) => p.type === 'text')) {
      messages.push({
        id: entry.uuid || `user-${messageIndex}`,
        parts: parts.filter((p) => p.type === 'text'),
        role: 'user',
        timestamp: entry.timestamp || '',
      });
    }

    const toolResults = parts.filter((p) => p.type === 'tool_result');
    if (toolResults.length > 0) {
      messages.push({
        id: `tool-result-${entry.uuid || messageIndex}`,
        parts: toolResults,
        role: 'system',
        timestamp: entry.timestamp || '',
      });
    }
  } else if (entryType === 'assistant') {
    const msg = entry.message;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const content = Array.isArray(msg.content) ? msg.content : [msg.content];
    const msgId = msg.id || entry.uuid;

    for (const block of content) {
      const part = parseAssistantBlock(block);
      if (!part) {
        continue;
      }

      if (!assistantTurns.has(msgId)) {
        assistantTurns.set(msgId, { parts: [], timestamp: entry.timestamp || '' });
      }
      assistantTurns.get(msgId)!.parts.push(part);
    }

    // If this entry has stop_reason, the turn is complete
    if (msg.stop_reason) {
      const turn = assistantTurns.get(msgId);
      if (turn && turn.parts.length > 0) {
        assistantCompleted.push({
          id: msgId,
          parts: turn.parts,
          role: 'assistant',
          timestamp: turn.timestamp,
        });
        assistantTurns.delete(msgId);
      }
    }
  }
  // Skip progress, system, file-history-snapshot, queue-operation, etc.

  return { assistantCompleted, messages };
}

/**
 * Parse raw JSONL text into ConversationMessage entries.
 * Handles multi-entry assistant turns that span multiple JSONL lines.
 */
function parseJsonlText(
  text: string,
  assistantTurns: Map<string, { parts: MessagePart[]; timestamp: string }>,
  startIndex: number
): ConversationMessage[] {
  const lines = text.split('\n').filter((line) => line.trim());
  const allMessages: ConversationMessage[] = [];
  let idx = startIndex;

  for (const line of lines) {
    try {
      const { assistantCompleted, messages } = parseJsonlLine(line, assistantTurns, idx);
      allMessages.push(...messages, ...assistantCompleted);
      idx++;
    } catch {
      // Skip malformed lines
    }
  }

  return allMessages;
}

/**
 * SessionWatcher provides incremental, file-change-driven reading of
 * Claude Code JSONL session files. It uses chokidar to detect writes
 * and reads only the bytes appended since the last read, parsing them
 * into structured ConversationMessage entries.
 */
class SessionWatcher {
  private watchedFiles = new Map<string, WatchedFile>();
  // Track assistant turns that span multiple JSONL lines, keyed by filePath
  private assistantTurnsPerFile = new Map<
    string,
    Map<string, { parts: MessagePart[]; timestamp: string }>
  >();
  // Track message index per file for generating fallback IDs
  private messageIndexPerFile = new Map<string, number>();
  // Buffer for incomplete trailing lines (no terminating newline yet)
  private lineBufferPerFile = new Map<string, string>();

  /**
   * Start watching a JSONL file for new entries.
   * On each append, the callback receives only the newly parsed messages.
   */
  watch(filePath: string, onNewEntries: OnNewEntries): void {
    if (this.watchedFiles.has(filePath)) {
      console.warn(`[session-watcher] Already watching: ${filePath}`);
      return;
    }

    // Initialize tracking state for this file
    const initialOffset = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    this.assistantTurnsPerFile.set(filePath, new Map());
    this.messageIndexPerFile.set(filePath, 0);
    this.lineBufferPerFile.set(filePath, '');

    const watcher = chokidarWatch(filePath, {
      // Don't emit 'add' event on initial scan — we handle catch-up via getHistory
      ignoreInitial: true,
      // Use polling as a fallback for network filesystems
      usePolling: false,
      // Debounce rapid successive writes
      awaitWriteFinish: {
        pollInterval: 100,
        stabilityThreshold: 200,
      },
    });

    const watched: WatchedFile = {
      callback: onNewEntries,
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
  }

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
   * Used by the session WebSocket handler which does its own parsing.
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
        if (!trimmed) continue;
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
        watched.callback(newMessages);
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

// Use globalThis to ensure a single shared instance across module loaders.
const SW_GLOBAL_KEY = '__shooter_session_watcher';
export const sessionWatcher: SessionWatcher =
	((globalThis as Record<string, unknown>)[SW_GLOBAL_KEY] as SessionWatcher) ||
	new SessionWatcher();
(globalThis as Record<string, unknown>)[SW_GLOBAL_KEY] = sessionWatcher;
