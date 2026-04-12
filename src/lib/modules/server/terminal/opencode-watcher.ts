/**
 * OpenCode Session Watcher
 *
 * Polls the OpenCode SQLite database for new messages in a session and
 * streams them as ConversationMessage objects that the session handler
 * can consume directly for both history and live updates.
 *
 * Unlike the JSONL-based SessionWatcher (which uses chokidar for file
 * change detection), this module polls SQLite because OpenCode holds a
 * write lock on the database and we must open/close quickly in read-only
 * mode to avoid contention.
 */

import type {
  ConversationMessage,
  MessagePart,
  OpenCodeMessage,
  OpenCodePart,
  OpenCodePartData,
  OpenCodeSession,
  OpenCodeWatchState as WatchState,
} from '$lib/types';

import Database from 'better-sqlite3';
import * as fs from 'fs';

import { resolveOpenCodeDbPath } from '../sessions/opencode-db-path';

// ── Constants ────────────────────────────────────────────────────────

const OPENCODE_DB_PATH = resolveOpenCodeDbPath();

/** Poll interval in milliseconds. */
const POLL_INTERVAL_MS = 2000;

/** Maximum parameters per SQLite IN clause (SQLite limit is 999). */
const SQLITE_MAX_PARAMS = 500;

class OpenCodeWatcher {
  private watchers = new Map<string, WatchState>();

  /**
   * Find the most recent non-archived OpenCode session that matches
   * the given working directory. Checks session.directory equals or
   * starts with `cwd`.
   *
   * Returns the session ID or null if none found.
   */
  findSessionId(cwd: string, createdAfter?: number): null | string {
    const db = openDb();
    if (!db) {
      return null;
    }

    try {
      // Match sessions that were active (updated) after the terminal was launched.
      // OpenCode resumes existing sessions rather than always creating new ones,
      // so we filter on time_updated (not time_created) to find the session
      // that's being actively used by this terminal instance.
      //
      // createdAfter is JS milliseconds (Date.getTime()), but OpenCode may
      // store time_updated in either seconds or milliseconds. Provide both
      // representations and let the SQL match whichever unit the DB uses:
      //   - If time_updated is in seconds: compare against secondsFilter
      //   - If time_updated is in milliseconds (>= 1e12): compare against millisFilter
      const millisFilter = createdAfter ?? 0;
      const secondsFilter = createdAfter ? Math.floor(createdAfter / 1000) : 0;
      // Escape LIKE metacharacters (%, _) in the cwd to prevent false
      // matches on paths containing those characters. Uses \ as the
      // escape character declared via the ESCAPE clause.
      const cwdLikePattern = `${cwd.replace(/[%_\\]/g, '\\$&')}/%`;
      const row = db
        .prepare(
          `
				SELECT id
				FROM session
				WHERE (time_archived IS NULL OR time_archived = 0)
				  AND (directory = ? OR directory LIKE ? ESCAPE '\\')
				  AND (
				    (time_updated >= 1e12 AND time_updated > ?)
				    OR (time_updated < 1e12 AND time_updated > ?)
				  )
				ORDER BY time_updated DESC
				LIMIT 1
			`
        )
        .get(cwd, cwdLikePattern, millisFilter, secondsFilter) as OpenCodeSession | undefined;

      return row?.id ?? null;
    } catch (error) {
      console.error('[opencode-watcher] Failed to find session:', error);
      return null;
    } finally {
      db.close();
    }
  }

  /**
   * Read all messages and parts for a session from SQLite, converting
   * them to ConversationMessage format.
   */
  getHistory(sessionId: string): ConversationMessage[] {
    const db = openDb();
    if (!db) {
      return [];
    }

    try {
      // Fetch all messages for this session, ordered chronologically.
      const messages = db
        .prepare(
          `
				SELECT id, session_id, time_created, time_updated, data
				FROM message
				WHERE session_id = ?
				ORDER BY time_created ASC
			`
        )
        .all(sessionId) as OpenCodeMessage[];

      if (messages.length === 0) {
        return [];
      }

      // Fetch all parts for these messages (batched to avoid SQLite param limit).
      const messageIds = messages.map((m) => m.id);
      const parts = batchInQuery<OpenCodePart>(
        db,
        `SELECT id, message_id, session_id, time_created, time_updated, data
				FROM part
				WHERE message_id IN (__PLACEHOLDERS__)
				ORDER BY time_created ASC`,
        messageIds
      );

      // Group parts by message ID.
      const partsByMessage = new Map<string, OpenCodePart[]>();
      for (const part of parts) {
        if (!partsByMessage.has(part.message_id)) {
          partsByMessage.set(part.message_id, []);
        }
        const bucket = partsByMessage.get(part.message_id);
        if (bucket) {
          bucket.push(part);
        }
      }

      return this.buildMessages(messages, partsByMessage);
    } catch (error) {
      console.error('[opencode-watcher] Failed to read history:', error);
      return [];
    } finally {
      db.close();
    }
  }

  /**
   * Stop watching a specific session. If a callback is provided, only that
   * subscriber is removed — the interval keeps running while other subscribers
   * remain. If no callback is provided, all subscribers and the interval are
   * cleared (backward compat).
   */
  stop(sessionId: string, callback?: (messages: ConversationMessage[]) => void): void {
    const state = this.watchers.get(sessionId);
    if (!state) {
      return;
    }

    if (callback) {
      state.callbacks.delete(callback);
      console.log(
        `[opencode-watcher] Removed subscriber from session: ${sessionId} ` +
          `(remaining=${state.callbacks.size})`
      );

      // Only tear down the interval when no subscribers remain.
      if (state.callbacks.size > 0) {
        return;
      }
    }

    clearInterval(state.intervalHandle);
    this.watchers.delete(sessionId);
    console.log(`[opencode-watcher] Stopped watching session: ${sessionId}`);
  }

  /**
   * Stop all active watchers.
   */
  stopAll(): void {
    for (const [sessionId] of this.watchers) {
      this.stop(sessionId);
    }
  }

  /**
   * Start polling the SQLite DB every 2 seconds for new messages/parts
   * in the given session. Converts new data to ConversationMessage
   * format and invokes the callback.
   */
  watch(sessionId: string, callback: (messages: ConversationMessage[]) => void): void {
    const existing = this.watchers.get(sessionId);
    if (existing) {
      // Already watching — just add the new callback, don't create a new interval.
      existing.callbacks.add(callback);
      console.log(
        `[opencode-watcher] Added subscriber to session: ${sessionId} ` +
          `(total=${existing.callbacks.size})`
      );
      return;
    }

    // Determine the initial high-water marks by scanning existing data.
    const { emittedMessageIds, emittedPartUpdatedAt, lastMessageTime, lastPartTime } =
      this.getHighWaterMarks(sessionId);

    const intervalHandle = setInterval(() => {
      this.poll(sessionId);
    }, POLL_INTERVAL_MS);

    const state: WatchState = {
      callbacks: new Set([callback]),
      emittedMessageIds,
      emittedPartUpdatedAt,
      intervalHandle,
      lastMessageTime,
      lastPartTime,
      sessionId,
    };

    this.watchers.set(sessionId, state);
    console.log(
      `[opencode-watcher] Watching session: ${sessionId} ` +
        `(lastMsg=${lastMessageTime}, lastPart=${lastPartTime})`
    );
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /**
   * Convert OpenCode messages + their parts into ConversationMessage
   * objects for consumption by the session handler.
   */
  private buildMessages(
    messages: OpenCodeMessage[],
    partsByMessage: Map<string, OpenCodePart[]>
  ): ConversationMessage[] {
    const result: ConversationMessage[] = [];

    for (const msg of messages) {
      // Parse message data to determine role.
      let msgData: { agent?: string; role?: string } = {};
      try {
        msgData = JSON.parse(msg.data) as typeof msgData;
      } catch {
        // Skip unparseable message data.
        continue;
      }

      const role = msgData.role === 'user' ? 'user' : 'assistant';
      const msgParts = partsByMessage.get(msg.id) || [];

      // Convert each part to a MessagePart.
      const parts: MessagePart[] = [];

      for (const part of msgParts) {
        let partData: OpenCodePartData;
        try {
          partData = JSON.parse(part.data) as OpenCodePartData;
        } catch {
          continue;
        }

        const converted = convertPartToMessagePart(partData);
        if (converted) {
          parts.push(converted);
        }
      }

      // Skip messages with no usable content.
      if (parts.length === 0) {
        console.debug(`[opencode-watcher] Skipping message ${msg.id} (no usable parts)`);
        continue;
      }

      result.push({
        id: msg.id,
        parts,
        role,
        timestamp: new Date(toMillis(msg.time_created)).toISOString(),
      });
    }

    return result;
  }

  /**
   * Scan existing messages/parts to determine the starting high-water
   * marks for time-based polling. Also collects the set of already-seen
   * message IDs so we do not re-emit them.
   */
  private getHighWaterMarks(sessionId: string): {
    emittedMessageIds: Set<string>;
    emittedPartUpdatedAt: Map<string, number>;
    lastMessageTime: number;
    lastPartTime: number;
  } {
    const db = openDb();
    if (!db) {
      return {
        emittedMessageIds: new Set(),
        emittedPartUpdatedAt: new Map(),
        lastMessageTime: 0,
        lastPartTime: 0,
      };
    }

    try {
      const msgRow = db
        .prepare(
          `
				SELECT MAX(time_created) as maxTime
				FROM message
				WHERE session_id = ?
			`
        )
        .get(sessionId) as undefined | { maxTime: null | number };

      const partRow = db
        .prepare(
          `
				SELECT MAX(time_updated) as maxTime
				FROM part
				WHERE session_id = ?
			`
        )
        .get(sessionId) as undefined | { maxTime: null | number };

      // Collect all existing message IDs.
      const existingIds = db
        .prepare(
          `
				SELECT id FROM message WHERE session_id = ?
			`
        )
        .all(sessionId) as { id: string }[];

      const emittedMessageIds = new Set(existingIds.map((r) => r.id));

      // Collect all existing part IDs with their time_updated for change detection.
      const existingParts = db
        .prepare(
          `
				SELECT id, time_updated FROM part WHERE session_id = ?
			`
        )
        .all(sessionId) as { id: string; time_updated: number }[];

      const emittedPartUpdatedAt = new Map<string, number>();
      for (const p of existingParts) {
        emittedPartUpdatedAt.set(p.id, p.time_updated);
      }

      return {
        emittedMessageIds,
        emittedPartUpdatedAt,
        lastMessageTime: msgRow?.maxTime ?? 0,
        lastPartTime: partRow?.maxTime ?? 0,
      };
    } catch (error) {
      console.error('[opencode-watcher] Failed to get high-water marks:', error);
      return {
        emittedMessageIds: new Set(),
        emittedPartUpdatedAt: new Map(),
        lastMessageTime: 0,
        lastPartTime: 0,
      };
    } finally {
      db.close();
    }
  }

  /**
   * Single poll iteration. Opens the DB, queries for new messages and
   * updated parts, converts them to ConversationMessage[], and invokes
   * the watcher callbacks.
   */
  private poll(sessionId: string): void {
    const state = this.watchers.get(sessionId);
    if (!state) {
      return;
    }

    const db = openDb();
    if (!db) {
      return;
    }

    try {
      const results: ConversationMessage[] = [];

      // ── 1. Check for brand-new messages ──────────────────────────
      const newMessages = db
        .prepare(
          `
				SELECT id, session_id, time_created, time_updated, data
				FROM message
				WHERE session_id = ? AND time_created > ?
				ORDER BY time_created ASC
			`
        )
        .all(sessionId, state.lastMessageTime) as OpenCodeMessage[];

      if (newMessages.length > 0) {
        // Deduplicate: skip messages we have already emitted (guards
        // against clock-tie edge cases where time_created equals the
        // high-water mark and the row slips through the > filter again).
        const dedupedMessages = newMessages.filter((m) => !state.emittedMessageIds.has(m.id));

        if (dedupedMessages.length > 0) {
          // Fetch parts for these new messages (batched to avoid SQLite param limit).
          const newMsgIds = dedupedMessages.map((m) => m.id);
          const newParts = batchInQuery<OpenCodePart>(
            db,
            `SELECT id, message_id, session_id, time_created, time_updated, data
						FROM part
						WHERE message_id IN (__PLACEHOLDERS__)
						ORDER BY time_created ASC`,
            newMsgIds
          );

          // Group parts by message.
          const partsByMessage = new Map<string, OpenCodePart[]>();
          for (const part of newParts) {
            if (!partsByMessage.has(part.message_id)) {
              partsByMessage.set(part.message_id, []);
            }
            const bucket = partsByMessage.get(part.message_id);
            if (bucket) {
              bucket.push(part);
            }
          }

          const newEntries = this.buildMessages(dedupedMessages, partsByMessage);
          results.push(...newEntries);

          // Track emitted part timestamps and update part high-water mark.
          for (const part of newParts) {
            if (part.time_updated > state.lastPartTime) {
              state.lastPartTime = part.time_updated;
            }
            state.emittedPartUpdatedAt.set(part.id, part.time_updated);
          }
        }

        // Always update message high-water marks (even for already-emitted messages).
        for (const msg of newMessages) {
          if (msg.time_created > state.lastMessageTime) {
            state.lastMessageTime = msg.time_created;
          }
          state.emittedMessageIds.add(msg.id);
        }
      }

      // ── 2. Check for updated parts on existing messages ──────────
      // Parts may be added or updated after the initial message row is
      // created (e.g., streaming assistant response). Look for parts
      // whose time_updated exceeds our last-seen mark, but whose parent
      // message is NOT in the new-messages set (those were handled above).
      const updatedParts = db
        .prepare(
          `
				SELECT id, message_id, session_id, time_created, time_updated, data
				FROM part
				WHERE session_id = ? AND time_updated > ?
				ORDER BY time_created ASC
			`
        )
        .all(sessionId, state.lastPartTime) as OpenCodePart[];

      if (updatedParts.length > 0) {
        // Filter out parts that belong to messages we just processed.
        // For previously-emitted parts, allow re-emission only if
        // time_updated has increased (in-place update detection).
        const newMsgIdSet = new Set(newMessages.map((m) => m.id));
        const newParts = updatedParts.filter((p) => {
          if (newMsgIdSet.has(p.message_id)) {
            return false;
          }
          const lastSeen = state.emittedPartUpdatedAt.get(p.id);
          // New part (never emitted) or updated since last emission
          return lastSeen === undefined || p.time_updated > lastSeen;
        });

        if (newParts.length > 0) {
          // Group the NEW parts by message ID.
          const partsByMessage = new Map<string, OpenCodePart[]>();
          for (const part of newParts) {
            if (!partsByMessage.has(part.message_id)) {
              partsByMessage.set(part.message_id, []);
            }
            const bucket = partsByMessage.get(part.message_id);
            if (bucket) {
              bucket.push(part);
            }
          }

          // Fetch the parent messages for context (batched to avoid SQLite param limit).
          const affectedMsgIds = [...partsByMessage.keys()];
          const affectedMessages = batchInQuery<OpenCodeMessage>(
            db,
            `SELECT id, session_id, time_created, time_updated, data
						FROM message
						WHERE id IN (__PLACEHOLDERS__)
						ORDER BY time_created ASC`,
            affectedMsgIds
          );

          // Build entries from ONLY the new parts (delta), not all
          // parts for the message. This prevents re-emitting content
          // the session handler has already seen.
          const updatedEntries = this.buildMessages(affectedMessages, partsByMessage);
          results.push(...updatedEntries);

          // Track emitted part timestamps for change detection.
          for (const part of newParts) {
            state.emittedPartUpdatedAt.set(part.id, part.time_updated);
          }
        }

        // Update part high-water mark.
        for (const part of updatedParts) {
          if (part.time_updated > state.lastPartTime) {
            state.lastPartTime = part.time_updated;
          }
        }
      }

      // ── 3. Invoke all callbacks if there are new entries ─────────
      if (results.length > 0) {
        for (const cb of state.callbacks) {
          try {
            cb(results);
          } catch (cbError) {
            console.error('[opencode-watcher] Callback error:', cbError);
          }
        }
      }
    } catch (error) {
      // Log but do not crash — the next poll will retry.
      console.error('[opencode-watcher] Poll error:', error);
    } finally {
      db.close();
    }
  }
}

// ── OpenCodeWatcher Class ────────────────────────────────────────────

/**
 * Execute a SELECT query with an IN clause, batching in chunks of
 * SQLITE_MAX_PARAMS to stay within SQLite's 999-parameter limit.
 */
function batchInQuery<T>(db: Database.Database, sql: string, ids: string[]): T[] {
  if (ids.length === 0) {
    return [];
  }

  const results: T[] = [];
  for (let i = 0; i < ids.length; i += SQLITE_MAX_PARAMS) {
    const chunk = ids.slice(i, i + SQLITE_MAX_PARAMS);
    const placeholders = chunk.map(() => '?').join(',');
    const query = sql.replace('__PLACEHOLDERS__', placeholders);
    const rows = db.prepare(query).all(...chunk) as T[];
    results.push(...rows);
  }
  return results;
}

// ── Database Helpers ─────────────────────────────────────────────────

function convertPartToMessagePart(data: OpenCodePartData): MessagePart | null {
  switch (data.type) {
    case 'reasoning':
      return { content: data.text || '', type: 'thinking' };

    case 'text':
      return { content: data.text || '', type: 'text' };

    case 'tool':
      return {
        id: data.callID || data.id || '',
        input: data.state?.input || {},
        toolName: data.tool || 'Unknown',
        type: 'tool_use',
      };

    default:
      // Skip snapshot, patch, step-start, step-finish, subtask, retry, compaction
      return null;
  }
}

// ── Part Conversion ──────────────────────────────────────────────────
// Maps OpenCode part types to MessagePart directly, skipping the
// intermediate Record<string, unknown> stage.

/**
 * Open the OpenCode SQLite database in read-only mode.
 * Returns null if the file does not exist or cannot be opened.
 */
function openDb(): Database.Database | null {
  if (!fs.existsSync(OPENCODE_DB_PATH)) {
    return null;
  }
  try {
    return new Database(OPENCODE_DB_PATH, { readonly: true });
  } catch {
    return null;
  }
}

/**
 * Normalise a timestamp from OpenCode's SQLite database to milliseconds.
 *
 * OpenCode currently stores `time_created` / `time_updated` as Unix
 * **milliseconds**, but this is not formally documented and could change.
 * A simple heuristic distinguishes seconds from milliseconds:
 *   - Values < 1e12 (~2001-09-09 in ms, ~33658 AD in seconds) are seconds.
 *   - Values >= 1e12 are already milliseconds.
 */
function toMillis(timestamp: number): number {
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

// ── Singleton ────────────────────────────────────────────────────────
// Use globalThis to ensure a single shared instance across module
// loaders (same pattern as pty-manager and session-watcher).

const OW_GLOBAL_KEY = '__shooter_opencode_watcher';
export const openCodeWatcher: OpenCodeWatcher =
  ((globalThis as Record<string, unknown>)[OW_GLOBAL_KEY] as OpenCodeWatcher) ||
  new OpenCodeWatcher();
(globalThis as Record<string, unknown>)[OW_GLOBAL_KEY] = openCodeWatcher;
