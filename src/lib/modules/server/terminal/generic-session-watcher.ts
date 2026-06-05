/**
 * GenericSessionWatcher — live tailing for the five read-only providers
 * (cursor, copilot, qwen, gemini, amp).
 *
 * The byte-offset watchers (claude/codex) and the SQLite poller (opencode)
 * each understand one wire format. These five providers store sessions in
 * heterogeneous shapes — per-turn JSONL for some, a single rewritten JSON
 * document for others — so a byte-incremental reader would need five bespoke
 * parsers. Instead this watcher re-parses the whole file on each change via
 * the shared `parseReadOnlyProviderFile` dispatch and emits only messages
 * whose ID it has not delivered before. That makes it correct for both
 * append-only and whole-document-rewrite formats with one code path.
 *
 * The public surface (getHistory + ref-counted subscribe) matches
 * SessionWatcherLike, so the server's session-watcher adapter can route to it
 * by path without any handler changes.
 */

import type { ConversationMessage, GenericWatchedFile, OnNewEntries } from '$lib/types';

import { watch as chokidarWatch } from 'chokidar';

import { parseReadOnlyProviderFile } from '../sessions/provider-paths';

class GenericSessionWatcher {
  private watched = new Map<string, GenericWatchedFile>();

  /** Re-read the whole file and return the full parsed conversation. */
  getHistory(filePath: string): ConversationMessage[] {
    return parseReadOnlyProviderFile(filePath);
  }

  /** Stop watching a single file and release its chokidar handle. */
  stop(filePath: string): void {
    const watched = this.watched.get(filePath);
    if (!watched) {
      return;
    }
    void watched.watcher.close();
    this.watched.delete(filePath);
    console.log(`[generic-watcher] Stopped watching: ${filePath}`);
  }

  /** Stop watching every file. */
  stopAll(): void {
    for (const [filePath] of this.watched) {
      this.stop(filePath);
    }
  }

  /**
   * Subscribe to new messages for a file. Adds the callback to an existing
   * watcher when one is present (ref-counted), otherwise starts a chokidar
   * watch. Returns an unsubscribe function that tears the watcher down once
   * the last subscriber leaves — identical lifecycle to SessionWatcher.
   */
  subscribe(filePath: string, onNewEntries: OnNewEntries): () => void {
    const existing = this.watched.get(filePath);
    if (existing) {
      existing.callbacks.add(onNewEntries);
      return () => {
        this.removeCallback(filePath, onNewEntries);
      };
    }

    // Seed the emitted set with everything already in the file so the first
    // change only surfaces genuinely new messages — history is sent separately
    // via getHistory, mirroring the byte watchers' initial-offset behaviour.
    const emittedMessageIds = new Set<string>();
    try {
      for (const msg of parseReadOnlyProviderFile(filePath)) {
        emittedMessageIds.add(msg.id);
      }
    } catch (error) {
      // Degrade gracefully: an unreadable/racy file at subscribe time must not
      // prevent watching — the first change will just re-surface what's there.
      console.error(`[generic-watcher] Failed to seed ${filePath}:`, error);
    }

    const watcher = chokidarWatch(filePath, {
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 200 },
      ignoreInitial: true,
      usePolling: false,
    });

    const watched: GenericWatchedFile = {
      callbacks: new Set([onNewEntries]),
      emittedMessageIds,
      filePath,
      watcher,
    };

    const onChange = (): void => {
      this.readNew(watched);
    };
    watcher.on('add', onChange);
    watcher.on('change', onChange);
    watcher.on('error', (error) => {
      console.error(`[generic-watcher] Error watching ${filePath}:`, error);
    });

    this.watched.set(filePath, watched);
    console.log(`[generic-watcher] Watching: ${filePath} (seeded ${emittedMessageIds.size} msgs)`);

    return () => {
      this.removeCallback(filePath, onNewEntries);
    };
  }

  /** Legacy fire-and-forget API matching SessionWatcher.watch(). */
  watch(filePath: string, onNewEntries: OnNewEntries): void {
    this.subscribe(filePath, onNewEntries);
  }

  /**
   * Re-parse the file and deliver any messages whose ID has not been emitted.
   * If a rewrite drops the count below what we have seen (truncation/reset),
   * the new IDs simply won't match, so nothing spurious is sent.
   */
  private readNew(watched: GenericWatchedFile): void {
    let messages: ConversationMessage[];
    try {
      messages = parseReadOnlyProviderFile(watched.filePath);
    } catch (error) {
      console.error(`[generic-watcher] Failed to re-read ${watched.filePath}:`, error);
      return;
    }

    const fresh = messages.filter((msg) => !watched.emittedMessageIds.has(msg.id));
    if (fresh.length === 0) {
      return;
    }
    for (const msg of fresh) {
      watched.emittedMessageIds.add(msg.id);
    }
    for (const cb of watched.callbacks) {
      try {
        cb(fresh);
      } catch (cbError) {
        console.error('[generic-watcher] Callback error:', cbError);
      }
    }
  }

  /** Remove one callback; stop watching when none remain. */
  private removeCallback(filePath: string, onNewEntries: OnNewEntries): void {
    const watched = this.watched.get(filePath);
    if (!watched) {
      return;
    }
    watched.callbacks.delete(onNewEntries);
    if (watched.callbacks.size === 0) {
      this.stop(filePath);
    }
  }
}

// Single shared instance across module loaders (matches sessionWatcher).
const GW_GLOBAL_KEY = '__shooter_generic_session_watcher';
export const genericSessionWatcher: GenericSessionWatcher =
  ((globalThis as Record<string, unknown>)[GW_GLOBAL_KEY] as GenericSessionWatcher) ||
  new GenericSessionWatcher();
(globalThis as Record<string, unknown>)[GW_GLOBAL_KEY] = genericSessionWatcher;
