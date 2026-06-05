/**
 * Cursor agent session reader — listing + conversation retrieval.
 *
 * Cursor stores agent transcripts at:
 *   ~/.cursor/projects/<encoded-project>/agent-transcripts/<uuid>.jsonl  (preferred)
 *   ~/.cursor/projects/<encoded-project>/agent-transcripts/<uuid>.txt    (fallback)
 *
 * The <encoded-project> directory name is the project path with '/' replaced by
 * a separator. We reverse-decode it to recover the original cwd.
 *
 * JSONL format (preferred): one JSON object per line. Real format:
 *   { role: 'user'|'assistant', message: { content: string | Block[] } }
 *
 *   Block shapes:
 *     { type: 'text', text: string }
 *     { type: 'thinking', thinking: string }
 *     { type: 'tool_use', id: string, name: string, input: object }
 *     { type: 'tool_result', tool_use_id: string, content: string|Block[], is_error?: boolean }
 *
 * TXT format (fallback): plain text with 'user:' and 'assistant:' line markers.
 * Lines between markers are collected into a single message.
 */

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURSOR_PROJECTS = path.join(homedir(), '.cursor', 'projects');
const PREFIX_BYTES = 64 * 1024;
const MAX_FULL_READ_BYTES = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return sessions whose transcript file was written within `thresholdMs` of
 * now — i.e. sessions that are currently (or very recently) active.
 */
export function detectActiveCursorSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const out: { cwd: string; id: string; startedAt: number }[] = [];

  for (const { encodedDir, filePath } of collectTranscriptFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      const id = transcriptId(filePath);
      if (!id) {
        continue;
      }
      out.push({
        cwd: decodeCursorProjectDir(encodedDir),
        id,
        startedAt: stat.birthtimeMs,
      });
    } catch {
      // skip unreadable files
    }
  }

  return out;
}

/**
 * Return the conversation messages for a given Cursor session ID.
 * Prefers .jsonl; falls back to .txt.
 */
export function getCursorConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  if (!/^[A-Za-z0-9_.-]+$/.test(sessionId)) {
    return [];
  }

  const found = collectTranscriptFiles().find((e) => transcriptId(e.filePath) === sessionId);
  if (!found) {
    return [];
  }

  try {
    const messages = parseTranscriptFile(found.filePath);

    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx]?.role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (error) {
    console.error('[cursor] Failed to read conversation:', error);
    return [];
  }
}

/**
 * List all Cursor agent sessions grouped by project, sorted by most-recently-
 * modified first.
 */
export function listCursorProjects(): ProjectGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();

  for (const { encodedDir, filePath } of collectTranscriptFiles()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    const id = transcriptId(filePath);
    if (!id) {
      continue;
    }

    const cwd = decodeCursorProjectDir(encodedDir);
    const title = extractTitle(filePath);

    const session: SessionInfo = {
      created: stat.birthtime.toISOString(),
      gitBranch: '',
      id,
      messageCount: estimateMessageCount(filePath, stat),
      modified: stat.mtime.toISOString(),
      projectPath: cwd,
      source: 'cursor' as const,
      summary: '',
      title,
    };

    const bucket = byCwd.get(cwd);
    if (bucket) {
      bucket.push(session);
    } else {
      byCwd.set(cwd, [session]);
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
 * Parse the full conversation from a single transcript file path.
 * No pagination — returns all messages. Returns [] on any error.
 */
export function parseCursorSessionFile(filePath: string): ConversationMessage[] {
  try {
    return parseTranscriptFile(filePath);
  } catch {
    return [];
  }
}

/**
 * Return the absolute transcript file path backing a given sessionId, or null
 * if no matching file exists. Returns null immediately when sessionId fails the
 * same character-safety check used by getCursorConversation.
 */
export function resolveCursorSessionFile(sessionId: string): null | string {
  if (!/^[A-Za-z0-9_.-]+$/.test(sessionId)) {
    return null;
  }
  const found = collectTranscriptFiles().find((e) => transcriptId(e.filePath) === sessionId);
  return found ? found.filePath : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Collect all agent-transcript files, preferring .jsonl over .txt per stem. */
function collectTranscriptFiles(): { encodedDir: string; filePath: string }[] {
  const out: { encodedDir: string; filePath: string }[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(CURSOR_PROJECTS, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) {
      continue;
    }
    const transcriptsDir = path.join(CURSOR_PROJECTS, dir.name, 'agent-transcripts');
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    // Prefer .jsonl; track which stems already have a .jsonl entry.
    const jsonlStems = new Set<string>();
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith('.jsonl')) {
        jsonlStems.add(entry.name.slice(0, -6));
        out.push({ encodedDir: dir.name, filePath: path.join(transcriptsDir, entry.name) });
      }
    }
    // Add .txt files only when no .jsonl with the same stem exists.
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.txt')) {
        continue;
      }
      const stem = entry.name.slice(0, -4);
      if (!jsonlStems.has(stem)) {
        out.push({ encodedDir: dir.name, filePath: path.join(transcriptsDir, entry.name) });
      }
    }
  }

  return out;
}

/**
 * Decode a Cursor <encoded-project> dir name back to the original cwd.
 * Cursor replaces '/' with a separator — common candidates are '-' and '%2F'.
 * We try percent-decoding first, then fall back to replacing leading '-' with '/'.
 */
function decodeCursorProjectDir(encoded: string): string {
  // Attempt percent-decoding for URL-encoded paths.
  if (encoded.includes('%2F') || encoded.includes('%2f')) {
    try {
      const decoded = decodeURIComponent(encoded.replace(/%2f/gi, '/'));
      if (decoded.startsWith('/')) {
        return decoded;
      }
    } catch {
      // fall through
    }
  }

  // Heuristic: if the name starts with a hyphen, the path started with '/'.
  // Replace hyphens with slashes — but only where a likely directory boundary is.
  // This is best-effort; when uncertain we surface the encoded name.
  if (encoded.startsWith('-')) {
    const candidate = encoded.replace(/-/g, '/');
    return candidate;
  }

  return encoded;
}

/** Rough line-count estimate (avoids reading the full file during listing). */
function estimateMessageCount(filePath: string, stat: fs.Stats): number {
  const ext = path.extname(filePath);
  const avgBytesPerLine = ext === '.txt' ? 200 : 500;
  return Math.max(1, Math.round(stat.size / avgBytesPerLine));
}

/**
 * Extract a title from the first user message in a transcript file.
 * Uses bounded read (PREFIX_BYTES) to avoid loading large files.
 */
function extractTitle(filePath: string): string {
  try {
    const prefix = readPrefix(filePath);
    const ext = path.extname(filePath);
    if (ext === '.jsonl') {
      return titleFromJsonl(prefix);
    }
    return titleFromTxt(prefix);
  } catch {
    return 'Untitled Session';
  }
}

/** Narrow an unknown value to a plain object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Convert one JSONL line to a ConversationMessage, or null to skip.
 *
 * Real Cursor JSONL format:
 *   { role: 'user'|'assistant', message: { content: string | Block[] } }
 *
 * Content can be:
 *   - a plain string (user or assistant)
 *   - an array of blocks: { type:'text', text } | { type:'thinking', thinking }
 *       | { type:'tool_use', id, name, input } | { type:'tool_result', tool_use_id, content, is_error }
 */
function jsonlLineToMessage(
  entry: Record<string, unknown>,
  idx: number
): ConversationMessage | null {
  // Role is always at entry.role (fallback entry.type for older formats).
  const role = resolveRole(entry);
  if (!role) {
    return null;
  }

  // Content is nested at entry.message.content — entry.message must be an object.
  const messageField = entry.message;
  if (!isRecord(messageField)) {
    return null;
  }
  const rawContent = messageField.content;
  if (rawContent === undefined || rawContent === null) {
    return null;
  }

  const parts: MessagePart[] = [];

  if (typeof rawContent === 'string') {
    if (!rawContent) {
      return null;
    }
    parts.push({ content: rawContent, type: 'text' });
  } else if (Array.isArray(rawContent)) {
    for (const block of rawContent as unknown[]) {
      if (!isRecord(block)) {
        continue;
      }
      const blockType = strOf(block, 'type');
      if (blockType === 'text') {
        const text = strOf(block, 'text');
        if (text) {
          parts.push({ content: text, type: 'text' });
        }
      } else if (blockType === 'thinking') {
        const thinking = strOf(block, 'thinking');
        if (thinking) {
          parts.push({ content: thinking, type: 'thinking' });
        }
      } else if (blockType === 'tool_use') {
        const input = block.input;
        parts.push({
          id: strOf(block, 'id'),
          input: isRecord(input) ? input : {},
          toolName: strOf(block, 'name') || 'Unknown',
          type: 'tool_use',
        });
      } else if (blockType === 'tool_result') {
        const resultContent = block.content;
        let output = '';
        if (typeof resultContent === 'string') {
          output = resultContent;
        } else if (Array.isArray(resultContent)) {
          output = (resultContent as unknown[])
            .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text')
            .map((c) => {
              const t = c.text;
              return typeof t === 'string' ? t : '';
            })
            .join('\n');
        }
        const isErr = block.is_error;
        parts.push({
          isError: typeof isErr === 'boolean' ? isErr : false,
          output: output.slice(0, 2000),
          toolUseId: strOf(block, 'tool_use_id'),
          type: 'tool_result',
        });
      }
    }
  } else {
    // Unexpected content shape — skip.
    return null;
  }

  if (parts.length === 0) {
    return null;
  }

  const id = strOf(entry, 'id') || strOf(entry, 'uuid') || `cursor-${role}-${String(idx)}`;
  const timestamp = strOf(entry, 'timestamp') || strOf(entry, 'createdAt') || '';

  return { id, parts, role, timestamp };
}

/**
 * Parse a Cursor JSONL transcript into ConversationMessage[].
 * Each line: { role: 'user'|'assistant', message: { content: string | Block[] } }
 */
function jsonlToMessages(text: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let idx = 0;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as unknown;
      if (!isRecord(entry)) {
        continue;
      }
      const msg = jsonlLineToMessage(entry, idx);
      if (msg) {
        messages.push(msg);
        idx++;
      }
    } catch {
      // skip malformed line
    }
  }
  return messages;
}

/** Parse a transcript file (JSONL or TXT) into ConversationMessage[]. */
function parseTranscriptFile(filePath: string): ConversationMessage[] {
  const ext = path.extname(filePath);
  const text = readBounded(filePath);
  if (ext === '.jsonl') {
    return jsonlToMessages(text);
  }
  return parseTxtTranscript(text);
}

/** Parse a .txt transcript (user:/assistant: markers) into ConversationMessage[]. */
function parseTxtTranscript(text: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let currentRole: 'assistant' | 'user' | null = null;
  const currentLines: string[] = [];
  let idx = 0;

  const flush = (): void => {
    if (!currentRole || currentLines.length === 0) {
      return;
    }
    const content = currentLines.join('\n').trim();
    if (content) {
      messages.push({
        id: `cursor-${currentRole}-${String(idx)}`,
        parts: [{ content, type: 'text' }],
        role: currentRole,
        timestamp: '',
      });
      idx++;
    }
    currentLines.length = 0;
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('user:')) {
      flush();
      currentRole = 'user';
      const rest = line.slice(5).trim();
      if (rest) {
        currentLines.push(rest);
      }
    } else if (line.startsWith('assistant:')) {
      flush();
      currentRole = 'assistant';
      const rest = line.slice(10).trim();
      if (rest) {
        currentLines.push(rest);
      }
    } else if (currentRole) {
      currentLines.push(line);
    }
  }
  flush();
  return messages;
}

/** Read a file bounded to MAX_FULL_READ_BYTES (tail for oversized files). */
function readBounded(filePath: string): string {
  const stat = fs.statSync(filePath);
  if (stat.size <= MAX_FULL_READ_BYTES) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const start = stat.size - MAX_FULL_READ_BYTES;
    const buf = Buffer.alloc(MAX_FULL_READ_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_FULL_READ_BYTES, start);
    const tail = buf.toString('utf-8', 0, n);
    // Drop the first (likely partial) line of the tail.
    return tail.slice(tail.indexOf('\n') + 1);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read the head of a file (complete lines only), bounded to PREFIX_BYTES. */
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

/**
 * Resolve the role from a JSONL entry.
 * Accepts `role` or `type` field with values 'user'/'assistant'/'human'/'model'/'bot'.
 */
function resolveRole(entry: Record<string, unknown>): 'assistant' | 'user' | null {
  const raw = strOf(entry, 'role') || strOf(entry, 'type');
  switch (raw.toLowerCase()) {
    case 'assistant':
    case 'bot':
    case 'model':
      return 'assistant';
    case 'human':
    case 'user':
      return 'user';
    default:
      return null;
  }
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/** Safely read a string property from a record (returns '' on miss). */
function strOf(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/** Extract a title from the prefix of a JSONL transcript. */
function titleFromJsonl(prefix: string): string {
  for (const raw of prefix.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as unknown;
      if (!isRecord(entry) || resolveRole(entry) !== 'user') {
        continue;
      }
      // Real format: entry.message.content (string or array of blocks).
      const messageField = entry.message;
      if (!isRecord(messageField)) {
        continue;
      }
      const rawContent = messageField.content;
      let text = '';
      if (typeof rawContent === 'string') {
        text = rawContent;
      } else if (Array.isArray(rawContent)) {
        for (const block of rawContent as unknown[]) {
          if (isRecord(block) && block.type === 'text') {
            const t = block.text;
            if (typeof t === 'string' && t) {
              text = t;
              break;
            }
          }
        }
      }
      if (text) {
        return truncateTitle(text);
      }
    } catch {
      // skip
    }
  }
  return 'Untitled Session';
}

/** Extract a title from the prefix of a TXT transcript. */
function titleFromTxt(prefix: string): string {
  for (const line of prefix.split('\n')) {
    if (line.startsWith('user:')) {
      const text = line.slice(5).trim();
      if (text) {
        return truncateTitle(text);
      }
    }
  }
  return 'Untitled Session';
}

/**
 * Return the session ID (filename stem) for a transcript path.
 * Validates against /^[A-Za-z0-9_.-]+$/ to prevent traversal.
 */
function transcriptId(filePath: string): null | string {
  const base = path.basename(filePath);
  const stem = base.endsWith('.jsonl')
    ? base.slice(0, -6)
    : base.endsWith('.txt')
      ? base.slice(0, -4)
      : null;
  if (!stem || !/^[A-Za-z0-9_.-]+$/.test(stem)) {
    return null;
  }
  return stem;
}

function truncateTitle(text: string): string {
  const first = text.replace(/\s+/g, ' ').trim().split('\n')[0]?.trim() ?? '';
  if (!first) {
    return 'Untitled Session';
  }
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}
