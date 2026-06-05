/**
 * Codex live session watcher.
 *
 * Codex rollout files are append-only JSONL (like Claude's), so this mirrors
 * SessionWatcher: chokidar detects writes, only the newly-appended bytes are
 * read, and lines are fed to a CodexStreamParser that emits messages as each
 * conversation run completes. Because Codex's role-run grouping only flushes a
 * run when the *next* run begins, an idle timer flushes the final open run when
 * writing stops, so the last message isn't withheld.
 */

import type { ConversationMessage, CodexWatchState as WatchState } from '$lib/types';

import { watch as chokidarWatch } from 'chokidar';
import * as fs from 'fs';

import { CodexStreamParser, parseCodexRollout } from '../sessions/codex-parser';

/** Flush the open run after this many ms without a write. */
const IDLE_FLUSH_MS = 1500;

class CodexWatcher {
  private watched = new Map<string, WatchState>();

  /** One-shot full-history read of a rollout file (bypasses the live watch). */
  getHistory(filePath: string): ConversationMessage[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      return parseCodexRollout(fs.readFileSync(filePath, 'utf-8')).messages;
    } catch (error) {
      console.error(`[codex-watcher] Failed to read history for ${filePath}:`, error);
      return [];
    }
  }

  /** Detach one `callback` (closing the watcher only when none remain), or stop entirely if no callback is given. */
  stop(filePath: string, callback?: (messages: ConversationMessage[]) => void): void {
    const state = this.watched.get(filePath);
    if (!state) {
      return;
    }
    if (callback) {
      state.callbacks.delete(callback);
      if (state.callbacks.size > 0) {
        return;
      }
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }
    void state.watcher.close();
    this.watched.delete(filePath);
    console.log(`[codex-watcher] Stopped watching: ${filePath}`);
  }

  /** Stop watching every file. */
  stopAll(): void {
    for (const [filePath] of this.watched) {
      this.stop(filePath);
    }
  }

  /** Watch a rollout file for appended messages; returns an unsubscribe function. */
  subscribe(filePath: string, callback: (messages: ConversationMessage[]) => void): () => void {
    const existing = this.watched.get(filePath);
    if (existing) {
      existing.callbacks.add(callback);
      return () => {
        this.stop(filePath, callback);
      };
    }

    const watcher = chokidarWatch(filePath, {
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 200 },
      ignoreInitial: true,
    });

    const state: WatchState = {
      callbacks: new Set([callback]),
      idleTimer: null,
      lineBuffer: '',
      offset: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
      parser: new CodexStreamParser(),
      watcher,
    };

    watcher.on('change', () => {
      this.readNew(filePath);
    });
    watcher.on('add', () => {
      this.readNew(filePath);
    });
    watcher.on('error', (err) => {
      console.error(`[codex-watcher] watch error ${filePath}:`, err);
    });

    this.watched.set(filePath, state);
    console.log(`[codex-watcher] Watching: ${filePath} (offset ${state.offset})`);
    return () => {
      this.stop(filePath, callback);
    };
  }

  private emit(state: WatchState, messages: ConversationMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    for (const cb of state.callbacks) {
      try {
        cb(messages);
      } catch (err) {
        console.error('[codex-watcher] callback error:', err);
      }
    }
  }

  private readNew(filePath: string): void {
    const state = this.watched.get(filePath);
    if (!state) {
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }
    if (stat.size < state.offset) {
      // Truncated/rotated — reset.
      state.offset = 0;
      state.lineBuffer = '';
      state.parser = new CodexStreamParser();
    }
    if (stat.size <= state.offset) {
      return;
    }

    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(stat.size - state.offset);
      fs.readSync(fd, buf, 0, buf.length, state.offset);
      state.offset = stat.size;

      const combined = state.lineBuffer + buf.toString('utf-8');
      const segments = combined.split('\n');
      state.lineBuffer = combined.endsWith('\n') ? '' : (segments.pop() ?? '');

      const emitted: ConversationMessage[] = [];
      for (const line of segments) {
        if (line.trim()) {
          emitted.push(...state.parser.pushLine(line));
        }
      }
      this.emit(state, emitted);
    } finally {
      fs.closeSync(fd);
    }

    // Reset the idle timer; flush the final open run once writes stop.
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }
    state.idleTimer = setTimeout(() => {
      const current = this.watched.get(filePath);
      if (current) {
        this.emit(current, current.parser.flushOpen());
      }
    }, IDLE_FLUSH_MS);
  }
}

// Single shared instance across module loaders (same pattern as the other watchers).
const CW_GLOBAL_KEY = '__shooter_codex_watcher';
export const codexWatcher: CodexWatcher =
  ((globalThis as Record<string, unknown>)[CW_GLOBAL_KEY] as CodexWatcher) || new CodexWatcher();
(globalThis as Record<string, unknown>)[CW_GLOBAL_KEY] = codexWatcher;
