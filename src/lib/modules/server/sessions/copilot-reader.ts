/**
 * GitHub Copilot CLI session reader — listing + conversation retrieval.
 *
 * Mirrors qwen-reader.ts for structure/conventions: produces the same
 * SessionInfo / ProjectGroup / ConversationMessage shapes so the rest of
 * the app is provider-agnostic.
 *
 * Copilot sessions are stored at:
 *   - ~/.copilot/session-state/<uuid>.jsonl  (flat file form)
 *   - ~/.copilot/session-state/<uuid>/events.jsonl  (directory form)
 *
 * Each file is a sequence of typed event lines. Every event wraps its
 * payload under a top-level `data` field:
 *   session.start       { data: { sessionId, context: { cwd, branch } } }
 *   user.message        { data: { content } }
 *   assistant.message   { data: { content, toolRequests?, reasoningText? } }
 *   assistant.reasoning { data: { text? } }  → thinking part
 *   tool.execution_complete { data: { toolCallId, result } } → tool_result part
 *   session.model_change                    (skipped)
 */

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bytes read from the head of a session file when listing. */
const PREFIX_BYTES = 64 * 1024;

/** Max bytes read for a full conversation parse. */
const MAX_FULL_READ_BYTES = 16 * 1024 * 1024;

/** Root directory where Copilot stores session state. */
const COPILOT_SESSION_STATE = path.join(homedir(), '.copilot', 'session-state');

/** Regex to validate session IDs used in path construction (UUIDs). */
const SESSION_ID_RE = /^[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return sessions whose JSONL file was written within `thresholdMs` of now —
 * i.e. sessions that are currently (or very recently) active.
 */
export function detectActiveCopilotSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const out: { cwd: string; id: string; startedAt: number }[] = [];

  for (const filePath of collectCopilotFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      const meta = readMeta(readPrefix(filePath), filePath);
      if (meta) {
        out.push({ cwd: meta.cwd, id: meta.id, startedAt: stat.birthtimeMs });
      }
    } catch {
      // skip unreadable files
    }
  }

  return out;
}

/**
 * Return the conversation messages for a given Copilot session ID.
 * Mirrors the pagination behaviour of getQwenConversation().
 */
export function getCopilotConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  if (!SESSION_ID_RE.test(sessionId)) {
    return [];
  }

  const filePath = resolveCopilotSessionFile(sessionId);
  if (!filePath) {
    return [];
  }

  try {
    const text = readBounded(filePath);
    const messages = parseCopilotText(text);

    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx]?.role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (error) {
    console.error('[copilot] Failed to read conversation:', error);
    return [];
  }
}

/**
 * List all Copilot sessions grouped by project (cwd), sorted by most-recently-
 * modified first. Mirrors listQwenProjects().
 *
 * The session id exposed to callers is the filename stem (not data.sessionId)
 * so that list and get agree — resolveCopilotSessionFile uses the filename stem.
 */
export function listCopilotProjects(): ProjectGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();

  for (const filePath of collectCopilotFiles()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    const prefix = safeReadPrefix(filePath);
    if (!prefix) {
      continue;
    }

    const meta = readMeta(prefix, filePath);
    if (!meta) {
      continue;
    }

    const session: SessionInfo = {
      created: stat.birthtime.toISOString(),
      gitBranch: meta.gitBranch,
      id: meta.id,
      messageCount: 0,
      modified: stat.mtime.toISOString(),
      projectPath: meta.cwd,
      source: 'copilot' as const,
      summary: '',
      title: meta.title || 'Untitled Session',
    };

    const bucket = byCwd.get(meta.cwd);
    if (bucket) {
      bucket.push(session);
    } else {
      byCwd.set(meta.cwd, [session]);
    }
  }

  const projects: ProjectGroup[] = [];
  for (const [cwd, sessions] of byCwd) {
    sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const segments = cwd.split('/').filter(Boolean);
    projects.push({
      fullPath: cwd,
      id: shortHash(cwd),
      lastModified: sessions[0]?.modified ?? '',
      name: segments.slice(-2).join('/'),
      sessionCount: sessions.length,
      sessions,
    });
  }

  return projects.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

/**
 * Parse the single Copilot JSONL file at `filePath` into the full list of
 * ConversationMessage with no pagination or tail-limit applied.
 * Returns `[]` on any read or parse error.
 */
export function parseCopilotSessionFile(filePath: string): ConversationMessage[] {
  try {
    return parseCopilotText(readBounded(filePath));
  } catch (error) {
    console.error('[copilot] Failed to parse session file:', error);
    return [];
  }
}

/**
 * Return the absolute path of the JSONL file backing `sessionId`, or `null`.
 * Validates `sessionId` the same way `getCopilotConversation` does and
 * enumerates via `collectCopilotFiles` so both flat and directory forms are
 * handled identically to how the rest of the reader discovers them.
 */
export function resolveCopilotSessionFile(sessionId: string): null | string {
  if (!SESSION_ID_RE.test(sessionId)) {
    return null;
  }
  for (const filePath of collectCopilotFiles()) {
    if (sessionIdFromFilePath(filePath) === sessionId) {
      return filePath;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// File collection helpers
// ---------------------------------------------------------------------------

/**
 * Collect all Copilot JSONL file paths from ~/.copilot/session-state/.
 * Supports both the flat <uuid>.jsonl and the directory <uuid>/events.jsonl forms.
 */
function collectCopilotFiles(): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(COPILOT_SESSION_STATE, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(COPILOT_SESSION_STATE, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      // Flat form: <uuid>.jsonl
      out.push(full);
    } else if (entry.isDirectory()) {
      // Directory form: <uuid>/events.jsonl
      const eventsPath = path.join(full, 'events.jsonl');
      try {
        fs.statSync(eventsPath);
        out.push(eventsPath);
      } catch {
        // no events.jsonl in this directory
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Map a single parsed Copilot event line to a ConversationMessage.
 * Returns null for events that don't map to conversation turns.
 * `pendingToolUseId` is a mutable box used to thread the most recent
 * tool_use id through to the following tool.execution_complete event.
 *
 * Real format: every event wraps its payload under entry.data:
 *   {"type":"user.message","data":{"content":"..."},...}
 * We fall back to reading from entry directly for forward-compat.
 */
function copilotEventToMessage(
  entry: Record<string, unknown>,
  pendingToolUseId: { value: string }
): ConversationMessage | null {
  const type = typeof entry.type === 'string' ? entry.type : '';
  const ts = typeof entry.timestamp === 'string' ? entry.timestamp : '';

  // All payloads are nested under entry.data; fall back to entry for compat.
  const data = isRecord(entry.data) ? entry.data : entry;

  if (type === 'user.message') {
    const content = typeof data.content === 'string' ? data.content : '';
    if (!content) {
      return null;
    }
    const id = typeof data.id === 'string' ? data.id : `copilot-user-${ts}`;
    return {
      id,
      parts: [{ content, type: 'text' }],
      role: 'user',
      timestamp: ts,
    };
  }

  if (type === 'assistant.reasoning') {
    const text = typeof data.text === 'string' ? data.text : '';
    if (!text) {
      return null;
    }
    const id = typeof data.id === 'string' ? data.id : `copilot-reasoning-${ts}`;
    return {
      id,
      parts: [{ content: text, type: 'thinking' }],
      role: 'assistant',
      timestamp: ts,
    };
  }

  if (type === 'assistant.message') {
    const content = typeof data.content === 'string' ? data.content : '';
    const parts: MessagePart[] = [];

    // Copilot can attach reasoning inline on the message (reasoningText) rather
    // than as a separate assistant.reasoning event. Emit it as a thinking part
    // that precedes the visible content.
    const reasoningText = typeof data.reasoningText === 'string' ? data.reasoningText : '';
    if (reasoningText) {
      parts.push({ content: reasoningText, type: 'thinking' });
    }

    if (content) {
      parts.push({ content, type: 'text' });
    }

    // toolRequests is an array of tool-call objects in the real format.
    if (Array.isArray(data.toolRequests)) {
      for (const req of data.toolRequests) {
        if (!isRecord(req)) {
          continue;
        }
        const toolId = typeof req.toolCallId === 'string' ? req.toolCallId : `copilot-tool-${ts}`;
        pendingToolUseId.value = toolId;

        // arguments may be a JSON string or a plain object.
        let input: Record<string, unknown> = {};
        if (isRecord(req.arguments)) {
          input = req.arguments;
        } else if (typeof req.arguments === 'string') {
          try {
            const parsed = JSON.parse(req.arguments) as unknown;
            if (isRecord(parsed)) {
              input = parsed;
            }
          } catch {
            // leave input as {}
          }
        }

        parts.push({
          id: toolId,
          input,
          toolName: typeof req.name === 'string' ? req.name : 'tool',
          type: 'tool_use',
        });
      }
    }

    if (parts.length === 0) {
      return null;
    }

    const id = typeof data.id === 'string' ? data.id : `copilot-assistant-${ts}`;
    return {
      id,
      parts,
      role: 'assistant',
      timestamp: ts,
    };
  }

  if (type === 'tool.execution_complete') {
    const rawResult = data.result;
    const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? '');
    // Copilot signals failure via `success: false`; older shapes used `isError`.
    const isError = data.isError === true || data.success === false;
    const toolCallId =
      typeof data.toolCallId === 'string' ? data.toolCallId : pendingToolUseId.value;
    const toolUseId = toolCallId || pendingToolUseId.value || 'unknown';
    const id = typeof data.id === 'string' ? data.id : `copilot-tool-result-${ts}`;
    return {
      id,
      parts: [
        {
          isError,
          output: result.slice(0, 2000),
          toolUseId,
          type: 'tool_result',
        },
      ],
      role: 'system',
      timestamp: ts,
    };
  }

  return null;
}

/** Narrow an unknown value to a plain object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse raw Copilot JSONL text into ConversationMessage entries.
 */
function parseCopilotText(text: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  // Mutable box to track the most recent tool_use id for matching tool_result events.
  const pendingToolUseId = { value: '' };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = copilotEventToMessage(entry, pendingToolUseId);
      if (msg) {
        messages.push(msg);
        // Reset pending tool use id once we've emitted a tool_result
        if (msg.parts[0]?.type === 'tool_result') {
          pendingToolUseId.value = '';
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return messages;
}

/**
 * Read a Copilot JSONL file bounded to MAX_FULL_READ_BYTES.
 * For oversized files, keeps the first line (session.start) + the tail.
 */
function readBounded(filePath: string): string {
  const stat = fs.statSync(filePath);
  if (stat.size <= MAX_FULL_READ_BYTES) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  // Oversized: keep first line (session.start) + tail.
  const head = readPrefix(filePath).split('\n')[0] ?? '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const start = stat.size - MAX_FULL_READ_BYTES;
    const buf = Buffer.alloc(MAX_FULL_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, MAX_FULL_READ_BYTES, start);
    const tail = buf.toString('utf-8', 0, bytesRead);
    return `${head}\n${tail.slice(tail.indexOf('\n') + 1)}`;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Extract metadata (id, cwd, gitBranch, title) from a session file prefix.
 * Uses the filename stem as the session id (not data.sessionId) so that the
 * id exposed in listCopilotProjects matches what resolveCopilotSessionFile expects.
 */
function readMeta(
  prefix: string,
  filePath: string
): null | { cwd: string; gitBranch: string; id: string; title: string } {
  let cwd = '';
  let gitBranch = '';
  let title = '';

  // Session id is always the filename stem — never data.sessionId — so that
  // getCopilotConversation can resolve the file by id.
  const id = sessionIdFromFilePath(filePath);

  for (const line of prefix.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = typeof entry.type === 'string' ? entry.type : '';
    const data = isRecord(entry.data) ? entry.data : entry;

    if (type === 'session.start') {
      // cwd and branch are under data.context in the real format.
      const context = isRecord(data.context) ? data.context : data;
      if (!cwd && typeof context.cwd === 'string') {
        cwd = context.cwd;
      }
      if (!gitBranch && typeof context.branch === 'string') {
        gitBranch = context.branch;
      }
    }

    if (!title && type === 'user.message' && typeof data.content === 'string') {
      title = data.content.split('\n')[0]?.slice(0, 80) ?? '';
    }

    if (cwd && title) {
      break;
    }
  }

  return cwd ? { cwd, gitBranch, id, title } : null;
}

/** Read the head of a file (complete lines only). */
function readPrefix(filePath: string): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(PREFIX_BYTES);
    const n = fs.readSync(fd, buf, 0, PREFIX_BYTES, 0);
    const text = buf.toString('utf-8', 0, n);
    const lastNl = text.lastIndexOf('\n');
    return lastNl === -1 ? text : text.slice(0, lastNl);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read prefix, returning empty string on any I/O error. */
function safeReadPrefix(filePath: string): string {
  try {
    return readPrefix(filePath);
  } catch {
    return '';
  }
}

/**
 * Derive the session id from a file path — filename stem for flat files,
 * parent directory name for directory-form events.jsonl.
 * This must match resolveCopilotSessionFile so that list and get agree.
 */
function sessionIdFromFilePath(filePath: string): string {
  const base = path.basename(filePath);
  if (base === 'events.jsonl') {
    return path.basename(path.dirname(filePath));
  }
  return base.replace(/\.jsonl$/, '');
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}
