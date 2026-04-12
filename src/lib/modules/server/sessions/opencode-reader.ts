import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import { resolveOpenCodeDbPath } from './opencode-db-path';

const OPENCODE_DB_PATH = resolveOpenCodeDbPath();

export function getOpenCodeConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    // Get the LAST `limit` messages (most recent conversation)
    // by using a subquery to reverse the order
    const messages = db
      .prepare(
        `
      SELECT id, session_id, time_created, data FROM (
        SELECT id, session_id, time_created, data
        FROM message
        WHERE session_id = ?
        ORDER BY time_created DESC
        LIMIT ? OFFSET ?
      ) ORDER BY time_created ASC
    `
      )
      .all(sessionId, limit, offset) as {
      data: string;
      id: string;
      session_id: string;
      time_created: number;
    }[];

    // Get parts for these messages
    const messageIds = messages.map((m) => m.id);
    if (messageIds.length === 0) {
      return [];
    }

    const placeholders = messageIds.map(() => '?').join(',');
    const parts = db
      .prepare(
        `
      SELECT id, message_id, time_created, data
      FROM part
      WHERE message_id IN (${placeholders})
      ORDER BY time_created ASC
    `
      )
      .all(...messageIds) as {
      data: string;
      id: string;
      message_id: string;
      time_created: number;
    }[];

    // Group parts by message
    const partsByMessage = new Map<string, typeof parts>();
    for (const part of parts) {
      if (!partsByMessage.has(part.message_id)) {
        partsByMessage.set(part.message_id, []);
      }
      const bucket = partsByMessage.get(part.message_id);
      if (bucket) {
        bucket.push(part);
      }
    }

    // Build ConversationMessage array
    const result: ConversationMessage[] = [];

    for (const msg of messages) {
      let msgData: { agent?: string; role?: string } = {};
      try {
        msgData = JSON.parse(msg.data) as typeof msgData;
      } catch {
        // skip unparseable message data
      }

      const role = msgData.role === 'user' ? 'user' : 'assistant';
      const msgParts = partsByMessage.get(msg.id) || [];
      const convertedParts: MessagePart[] = [];

      for (const part of msgParts) {
        let partData: Record<string, unknown> = {};
        try {
          partData = JSON.parse(part.data) as Record<string, unknown>;
        } catch {
          continue;
        }

        const converted = convertOpenCodePart(partData);
        if (converted) {
          convertedParts.push(converted);
        }
      }

      if (convertedParts.length > 0) {
        result.push({
          id: msg.id,
          parts: convertedParts,
          role: role as 'assistant' | 'system' | 'user',
          timestamp: new Date(msg.time_created).toISOString(),
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[opencode] Failed to read conversation:', error);
    return [];
  } finally {
    db.close();
  }
}

export function listOpenCodeProjects(): ProjectGroup[] {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    // Get all sessions with their directories
    const sessions = db
      .prepare(
        `
      SELECT id, directory, title, slug, time_created, time_updated, parent_id
      FROM session
      WHERE time_archived IS NULL OR time_archived = 0
      ORDER BY time_updated DESC
    `
      )
      .all() as {
      directory: string;
      id: string;
      parent_id: null | string;
      slug: null | string;
      time_created: number;
      time_updated: number;
      title: null | string;
    }[];

    // Get message counts per session
    const msgCounts = db
      .prepare(`SELECT session_id, COUNT(*) as count FROM message GROUP BY session_id`)
      .all() as { count: number; session_id: string }[];
    const msgCountMap = new Map(msgCounts.map((r) => [r.session_id, r.count]));

    // Group by directory (project)
    const projectMap = new Map<string, SessionInfo[]>();

    for (const row of sessions) {
      const dir = row.directory || 'unknown';
      if (!projectMap.has(dir)) {
        projectMap.set(dir, []);
      }

      const sessionInfo: SessionInfo = {
        created: new Date(row.time_created).toISOString(),
        gitBranch: '',
        id: row.id,
        messageCount: msgCountMap.get(row.id) || 0,
        modified: new Date(row.time_updated).toISOString(),
        projectPath: dir,
        source: 'opencode' as const,
        summary: '',
        title: row.title || row.slug || 'Untitled Session',
      };

      const bucket = projectMap.get(dir);
      if (bucket) {
        bucket.push(sessionInfo);
      }
    }

    // Build ProjectGroup array
    const projects: ProjectGroup[] = [];

    for (const [dir, dirSessions] of projectMap) {
      const pathSegments = dir.split('/').filter(Boolean);
      const projectName = pathSegments.slice(-2).join('/');

      // Sort sessions by modified desc
      dirSessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      projects.push({
        fullPath: dir,
        id: shortHash(dir),
        lastModified: dirSessions[0]?.modified || '',
        name: `${projectName} (OpenCode)`,
        sessionCount: dirSessions.length,
        sessions: dirSessions,
      });
    }

    return projects.sort(
      (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  } catch (error) {
    console.error('[opencode] Failed to read sessions:', error);
    return [];
  } finally {
    db.close();
  }
}

function convertOpenCodePart(data: Record<string, unknown>): MessagePart | null {
  const type = data.type as string;

  switch (type) {
    case 'reasoning':
      return {
        content: (data.text as string) || '',
        type: 'thinking',
      };

    case 'text':
      return {
        content: (data.text as string) || '',
        type: 'text',
      };

    case 'tool': {
      const state = data.state as Record<string, unknown> | undefined;
      return {
        id: (data.callID as string) || (data.id as string) || '',
        input: (state?.input as Record<string, unknown>) || {},
        toolName: (data.tool as string) || 'Unknown',
        type: 'tool_use',
      };
    }

    default:
      // Skip snapshot, patch, step-start, step-finish, subtask, retry, compaction
      return null;
  }
}

function getDb(): Database.Database | null {
  if (!fs.existsSync(OPENCODE_DB_PATH)) {
    return null;
  }
  try {
    return new Database(OPENCODE_DB_PATH, { readonly: true });
  } catch {
    return null;
  }
}
