/**
 * Gemini CLI session reader — listing + conversation retrieval.
 *
 * Mirrors codex-reader.ts (Codex) for structure/conventions: produces the
 * same SessionInfo / ProjectGroup / ConversationMessage shapes so the rest of
 * the app is provider-agnostic.
 *
 * Data sources (in preference order per session):
 *   1. ~/.gemini/tmp/<projectHash>/chats/session-*.json
 *      Full ConversationRecord (user + model + tool calls + thoughts).
 *      Present only in newer gemini-cli versions; NOT present on older installs.
 *   2. ~/.gemini/tmp/<projectHash>/logs.json
 *      User-messages-only JSON array (LogEntry[]). Always present.
 *
 * Project hash → CWD reverse-lookup:
 *   - Read ~/.gemini/projects.json if present (slug → absolute path, new format).
 *   - For SHA-256 hash dirs (old format), the hash is irreversible without
 *     brute-force; we surface the hash itself as the projectPath in that case.
 */

import type {
  ConversationMessage,
  GeminiConversationRecord,
  GeminiLogEntry,
  GeminiMessageRecord,
  GeminiProjectsJson,
  MessagePart,
  ProjectGroup,
  SessionInfo,
} from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Files above this size are SKIPPED, not truncated — these are single JSON
 * documents/arrays, so a partial read would be invalid JSON. Gemini session
 * files are small in practice; this is only an OOM backstop.
 */
const MAX_GEMINI_FILE_BYTES = 64 * 1024 * 1024; // 64 MB

/** Gemini tmp root. */
const GEMINI_TMP = path.join(homedir(), '.gemini', 'tmp');

/** Gemini projects registry (slug → absolute path). */
const GEMINI_PROJECTS_JSON = path.join(homedir(), '.gemini', 'projects.json');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return sessions whose logs.json or chat file was written within `thresholdMs`
 * of now — i.e. sessions that are currently (or very recently) active.
 */
export function detectActiveGeminiSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const projectHashToCwd = buildHashToCwdMap();
  const projectDirs = collectProjectHashDirs();
  const out: { cwd: string; id: string; startedAt: number }[] = [];

  for (const hashDir of projectDirs) {
    const hash = path.basename(hashDir);
    const cwd = projectHashToCwd.get(hash) ?? hash;

    // Check chats/session-*.json files.
    const chatFiles = collectChatFiles(hashDir);
    for (const chatFile of chatFiles) {
      try {
        const stat = fs.statSync(chatFile);
        if (stat.mtimeMs < cutoff) {
          continue;
        }
        const record = readChatFile(chatFile);
        if (record) {
          out.push({
            cwd,
            id: record.sessionId,
            startedAt: new Date(record.startTime).getTime(),
          });
        }
      } catch {
        // skip unreadable files
      }
    }

    // Also check logs.json mtime (covers old-format sessions).
    const logsPath = path.join(hashDir, 'logs.json');
    try {
      const stat = fs.statSync(logsPath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      // Surface the most recent session in this logs.json.
      const entries = readLogsJson(logsPath);
      if (entries.length > 0) {
        const last = entries[entries.length - 1];
        if (last) {
          // Only add if not already captured from a chat file.
          const alreadyAdded = out.some((o) => o.id === last.sessionId && o.cwd === cwd);
          if (!alreadyAdded) {
            out.push({
              cwd,
              id: last.sessionId,
              startedAt: new Date(entries[0]?.timestamp ?? last.timestamp).getTime(),
            });
          }
        }
      }
    } catch {
      // logs.json missing or unreadable — skip
    }
  }

  return out;
}

/**
 * Return the conversation messages for a given Gemini session ID.
 * Prefers chats/session-*.json (full record) over logs.json (user-only).
 * Mirrors getCodexConversation() pagination behaviour.
 */
export function getGeminiConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  const projectDirs = collectProjectHashDirs();

  for (const hashDir of projectDirs) {
    // Try full chat record first.
    const chatFile = findChatFileForSession(hashDir, sessionId);
    if (chatFile) {
      return conversationFromChatFile(chatFile, offset, limit);
    }
  }

  // Fall back to logs.json user-only messages.
  for (const hashDir of projectDirs) {
    const messages = conversationFromLogsJson(hashDir, sessionId);
    if (messages.length > 0) {
      if (offset === 0 && messages.length > limit) {
        return messages.slice(messages.length - limit);
      }
      return messages.slice(offset, offset + limit);
    }
  }

  return [];
}

/**
 * List all Gemini CLI sessions grouped by project, sorted by most-recently-
 * modified first.  Mirrors listCodexProjects() from codex-reader.ts.
 */
export function listGeminiProjects(): ProjectGroup[] {
  const projectHashToCwd = buildHashToCwdMap();
  const projectDirs = collectProjectHashDirs();

  const byCwd = new Map<string, SessionInfo[]>();

  for (const hashDir of projectDirs) {
    const hash = path.basename(hashDir);
    const cwd = projectHashToCwd.get(hash) ?? hash;

    // Prefer full chat records if any exist; fall back to logs.json.
    const chatSessions = collectChatSessions(hashDir, cwd);
    if (chatSessions.length > 0) {
      for (const session of chatSessions) {
        appendToMap(byCwd, cwd, session);
      }
      continue;
    }

    // Fall back: derive sessions from logs.json.
    const logSessions = sessionsFromLogsJson(hashDir, cwd);
    for (const session of logSessions) {
      appendToMap(byCwd, cwd, session);
    }
  }

  const projects: ProjectGroup[] = [];
  for (const [cwd, sessions] of byCwd) {
    sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const segments = cwd.split('/').filter(Boolean);
    // When the project hash couldn't be reverse-mapped to a real cwd, show a
    // short friendly label instead of the raw 64-char SHA-256 hash.
    const isRawHash = /^[0-9a-f]{64}$/i.test(cwd);
    projects.push({
      fullPath: cwd,
      id: shortHash(cwd),
      lastModified: sessions[0]?.modified ?? '',
      name: isRawHash ? `Gemini (${cwd.slice(0, 8)})` : segments.slice(-2).join('/'),
      sessionCount: sessions.length,
      sessions,
    });
  }

  return projects.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

// ---------------------------------------------------------------------------
// Session building helpers
// ---------------------------------------------------------------------------

function appendToMap<V>(map: Map<string, V[]>, key: string, value: V): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = [];
    map.set(key, bucket);
  }
  bucket.push(value);
}

/**
 * Build a SHA-256 projectHash → cwd map by reading ~/.gemini/projects.json.
 * Returns an empty map if the file is absent (old gemini-cli installs).
 */
function buildHashToCwdMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(GEMINI_PROJECTS_JSON, 'utf-8');
    const data = JSON.parse(raw) as GeminiProjectsJson;
    for (const [slugOrHash, absolutePath] of Object.entries(data)) {
      // projects.json may use either the slug or the full SHA-256 hash as key.
      map.set(slugOrHash, absolutePath);
      // Pre-compute SHA-256(absolutePath) → absolutePath as well so that
      // old hash-named directories match even when projects.json uses slugs.
      const computed = crypto.createHash('sha256').update(absolutePath).digest('hex');
      map.set(computed, absolutePath);
    }
  } catch {
    // File absent or malformed — that's fine for old gemini-cli installs.
  }
  return map;
}

// ---------------------------------------------------------------------------
// Conversation building helpers
// ---------------------------------------------------------------------------

function cleanTitle(text: string): string {
  const first = text.replace(/\s+/g, ' ').trim().split('\n')[0]?.trim() ?? '';
  if (!first) {
    return 'Untitled Session';
  }
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

/** Enumerate all chats/session-*.json files under a project hash dir. */
function collectChatFiles(hashDir: string): string[] {
  const chatsDir = path.join(hashDir, 'chats');
  try {
    return fs
      .readdirSync(chatsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.startsWith('session-') && e.name.endsWith('.json'))
      .map((e) => path.join(chatsDir, e.name));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// ConversationRecord → ConversationMessage mapping
// ---------------------------------------------------------------------------

/**
 * Build SessionInfo records for each distinct sessionId found in a
 * chats/session-*.json file under hashDir.
 */
function collectChatSessions(hashDir: string, cwd: string): SessionInfo[] {
  const chatFiles = collectChatFiles(hashDir);
  const sessions: SessionInfo[] = [];

  for (const chatFile of chatFiles) {
    try {
      const stat = fs.statSync(chatFile);
      const record = readChatFile(chatFile);
      if (!record) {
        continue;
      }

      const userMessages = record.messages.filter((m) => m.type === 'user');
      const firstUserMsg = userMessages[0];
      let title = 'Untitled Session';
      if (firstUserMsg) {
        title = cleanTitle(extractTextFromContent(firstUserMsg.content));
      }

      sessions.push({
        created: record.startTime,
        gitBranch: '',
        id: record.sessionId,
        messageCount: record.messages.length,
        modified: stat.mtime.toISOString(),
        projectPath: cwd,
        source: 'gemini' as const,
        summary: record.summary ?? '',
        title,
      });
    } catch {
      // skip unreadable chat files
    }
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

/** Enumerate all ~/.gemini/tmp/<hash>/ directories. */
function collectProjectHashDirs(): string[] {
  try {
    return fs
      .readdirSync(GEMINI_TMP, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(GEMINI_TMP, e.name));
  } catch {
    return [];
  }
}

function conversationFromChatFile(
  chatFile: string,
  offset: number,
  limit: number
): ConversationMessage[] {
  try {
    const record = readChatFile(chatFile);
    if (!record) {
      return [];
    }

    const messages = record.messages
      .filter((m) => m.type === 'user' || m.type === 'gemini')
      .map(messageRecordToMessage);

    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx]?.role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (err) {
    console.error('[gemini] Failed to read chat file:', err);
    return [];
  }
}

function conversationFromLogsJson(hashDir: string, sessionId: string): ConversationMessage[] {
  const logsPath = path.join(hashDir, 'logs.json');
  const entries = readLogsJson(logsPath);
  return entries
    .filter((e) => e.sessionId === sessionId)
    .map(
      (entry): ConversationMessage => ({
        id: `${entry.sessionId}-${String(entry.messageId)}`,
        parts: [{ content: entry.message, type: 'text' }],
        role: 'user',
        timestamp: entry.timestamp,
      })
    );
}

/** Extract plain-text from a GeminiMessageRecord content field. */
function extractTextFromContent(
  content: GeminiConversationRecord['messages'][0]['content']
): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((p): p is { text: string } => 'text' in p)
    .map((p) => p.text)
    .join(' ');
}

/**
 * Find the chats/session-*.json file for a specific sessionId.
 * The filename embeds the first 8 chars of the UUID; we fall back to reading
 * every file in the directory if necessary.
 */
function findChatFileForSession(hashDir: string, sessionId: string): null | string {
  const shortId = sessionId.slice(0, 8);
  const chatsDir = path.join(hashDir, 'chats');
  try {
    const entries = fs.readdirSync(chatsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('session-') || !entry.name.endsWith('.json')) {
        continue;
      }
      // Fast path: filename contains shortId.
      if (entry.name.includes(shortId)) {
        return path.join(chatsDir, entry.name);
      }
    }
    // Slow path: read each file and check the sessionId field.
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('session-') || !entry.name.endsWith('.json')) {
        continue;
      }
      const record = readChatFile(path.join(chatsDir, entry.name));
      if (record?.sessionId === sessionId) {
        return path.join(chatsDir, entry.name);
      }
    }
  } catch {
    // chats dir missing or unreadable
  }
  return null;
}

function isGeminiLogEntry(v: unknown): v is GeminiLogEntry {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.sessionId === 'string' &&
    typeof obj.messageId === 'number' &&
    typeof obj.message === 'string' &&
    typeof obj.timestamp === 'string'
  );
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function messageRecordToMessage(record: GeminiMessageRecord): ConversationMessage {
  const role: 'assistant' | 'user' = record.type === 'user' ? 'user' : 'assistant';
  const parts: MessagePart[] = [];

  // 1. Thought summaries (only on 'gemini'-type messages).
  if (record.type === 'gemini' && record.thoughts) {
    for (const thought of record.thoughts) {
      parts.push({ content: thought.summary ?? '', type: 'thinking' });
    }
  }

  // 2. Content parts.
  const rawContent = record.content;
  const contentParts = typeof rawContent === 'string' ? [{ text: rawContent }] : rawContent;
  for (const part of contentParts) {
    if ('functionCall' in part) {
      parts.push({
        id: part.functionCall.id ?? part.functionCall.name,
        input: part.functionCall.args,
        toolName: part.functionCall.name,
        type: 'tool_use',
      });
    } else if ('thought' in part && part.thought === true) {
      parts.push({ content: part.text, type: 'thinking' });
    } else if ('text' in part) {
      parts.push({ content: part.text, type: 'text' });
    }
  }

  // 3. Tool calls array (avoid duplicating entries already in content parts).
  if (record.type === 'gemini' && record.toolCalls) {
    for (const tc of record.toolCalls) {
      const alreadyInParts = parts.some((p) => p.type === 'tool_use' && p.id === tc.id);
      if (!alreadyInParts) {
        parts.push({
          id: tc.id,
          input: tc.args,
          toolName: tc.name,
          type: 'tool_use',
        });
      }
    }
  }

  return {
    id: record.id,
    parts,
    role,
    timestamp: record.timestamp,
  };
}

/** Read and parse a chats/session-*.json file (a single JSON object). */
function readChatFile(filePath: string): GeminiConversationRecord | null {
  try {
    if (fs.statSync(filePath).size > MAX_GEMINI_FILE_BYTES) {
      return null; // too large to parse safely as one JSON document
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeminiConversationRecord;
  } catch {
    return null;
  }
}

/** Read and parse ~/.gemini/tmp/<hash>/logs.json (a single JSON array). */
function readLogsJson(logsPath: string): GeminiLogEntry[] {
  try {
    if (fs.statSync(logsPath).size > MAX_GEMINI_FILE_BYTES) {
      return [];
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter(isGeminiLogEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Build SessionInfo records for each distinct sessionId found in logs.json.
 */
function sessionsFromLogsJson(hashDir: string, cwd: string): SessionInfo[] {
  const logsPath = path.join(hashDir, 'logs.json');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(logsPath);
  } catch {
    return [];
  }

  const entries = readLogsJson(logsPath);
  if (entries.length === 0) {
    return [];
  }

  // Group by sessionId; preserve insertion order (chronological).
  const bySession = new Map<string, GeminiLogEntry[]>();
  for (const entry of entries) {
    let bucket = bySession.get(entry.sessionId);
    if (!bucket) {
      bucket = [];
      bySession.set(entry.sessionId, bucket);
    }
    bucket.push(entry);
  }

  const sessions: SessionInfo[] = [];
  for (const [sessionId, sessionEntries] of bySession) {
    const first = sessionEntries[0];
    const last = sessionEntries[sessionEntries.length - 1];
    sessions.push({
      created: first?.timestamp ?? stat.birthtime.toISOString(),
      gitBranch: '',
      id: sessionId,
      messageCount: sessionEntries.length,
      modified: last?.timestamp ?? stat.mtime.toISOString(),
      projectPath: cwd,
      source: 'gemini' as const,
      summary: '',
      title: cleanTitle(first?.message ?? ''),
    });
  }

  return sessions;
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}
