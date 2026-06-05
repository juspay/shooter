/**
 * Amp session reader — listing + conversation retrieval.
 *
 * Amp stores one JSON document per thread at:
 *   ~/.local/share/amp/threads/T-<id>.json
 *
 * Document shape:
 *   { id, title, created, messages: [{role, content}],
 *     meta: { traces: [{endTime}] },
 *     env: { initial: { trees: [{displayName}] } } }
 *
 * `content` is either a plain string or an array of Anthropic-style blocks
 * (text / thinking / tool_use / tool_result), so we handle both paths.
 * The file is a single JSON document — skip files larger than 64 MB.
 */

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AMP_THREADS = path.join(homedir(), '.local', 'share', 'amp', 'threads');

/** Single JSON document — skip (do not truncate) if larger than this. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Pattern for valid thread file names: T-<id>.json */
const THREAD_FILE_RE = /^T-(.+)\.json$/;

/** Only allow these chars in a sessionId used to build a path. */
const SESSION_ID_RE = /^[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return sessions whose thread file mtime is within `thresholdMs` of now —
 * i.e. sessions that are currently (or very recently) active.
 */
export function detectActiveAmpSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const out: { cwd: string; id: string; startedAt: number }[] = [];
  for (const filePath of collectThreadFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      const doc = readThreadDoc(filePath);
      if (!doc) {
        continue;
      }
      const id = threadId(filePath, doc);
      const cwd = projectCwd(doc);
      if (id && cwd) {
        out.push({ cwd, id, startedAt: stat.birthtimeMs });
      }
    } catch {
      // skip unreadable files
    }
  }
  return out;
}

/**
 * Return the conversation messages for a given Amp thread ID.
 * Mirrors the pagination pattern from codex-reader / qwen-reader.
 */
export function getAmpConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  if (!SESSION_ID_RE.test(sessionId)) {
    return [];
  }
  const filePath = path.join(AMP_THREADS, `T-${sessionId}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const doc = readThreadDoc(filePath);
    if (!doc) {
      return [];
    }
    const rawMessages = Array.isArray(doc.messages) ? (doc.messages as unknown[]) : [];
    const messages: ConversationMessage[] = [];
    let idx = 0;
    for (const raw of rawMessages) {
      const msg = ampMessageToConversationMessage(raw, idx);
      if (msg) {
        messages.push(msg);
        idx++;
      }
    }
    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx]?.role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (err) {
    console.error('[amp] Failed to read conversation:', err);
    return [];
  }
}

/**
 * List all Amp threads grouped by project (env.initial.trees[0].displayName),
 * sorted by most-recently-modified first.
 */
export function listAmpProjects(): ProjectGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();
  for (const filePath of collectThreadFiles()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    const doc = readThreadDoc(filePath);
    if (!doc) {
      continue;
    }
    const id = threadId(filePath, doc);
    if (!id) {
      continue;
    }
    const cwd = projectCwd(doc) || id;
    const modified = lastModified(doc, stat);
    const created =
      typeof doc.created === 'string' && doc.created ? doc.created : stat.birthtime.toISOString();
    const rawMessages = Array.isArray(doc.messages) ? (doc.messages as unknown[]) : [];
    const session: SessionInfo = {
      created,
      gitBranch: '',
      id,
      messageCount: rawMessages.length,
      modified,
      projectPath: cwd,
      source: 'amp' as const,
      summary: '',
      title: cleanTitle(typeof doc.title === 'string' ? doc.title : ''),
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
      name: segments.slice(-2).join('/') || cwd,
      sessionCount: sessions.length,
      sessions,
    });
  }
  return projects.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

/**
 * Parse the Amp thread JSON file at `filePath` and return the full list of
 * ConversationMessage — no pagination or tail-limit applied.
 * Returns `[]` on any error (missing file, malformed JSON, oversized file).
 */
export function parseAmpSessionFile(filePath: string): ConversationMessage[] {
  try {
    const doc = readThreadDoc(filePath);
    if (!doc) {
      return [];
    }
    const rawMessages = Array.isArray(doc.messages) ? (doc.messages as unknown[]) : [];
    const messages: ConversationMessage[] = [];
    let idx = 0;
    for (const raw of rawMessages) {
      const msg = ampMessageToConversationMessage(raw, idx);
      if (msg) {
        messages.push(msg);
        idx++;
      }
    }
    return messages;
  } catch {
    return [];
  }
}

/**
 * Return the absolute path of the Amp thread file for `sessionId`, or `null`
 * if the session ID is invalid or the file does not exist.
 */
export function resolveAmpSessionFile(sessionId: string): null | string {
  if (!SESSION_ID_RE.test(sessionId)) {
    return null;
  }
  const filePath = path.join(AMP_THREADS, `T-${sessionId}.json`);
  return fs.existsSync(filePath) ? filePath : null;
}

// ---------------------------------------------------------------------------
// Block → MessagePart mapping (Anthropic-style blocks)
// ---------------------------------------------------------------------------

/** Map one Anthropic-style content block to a MessagePart, or null to skip. */
function ampBlockToPart(block: Record<string, unknown>): MessagePart | null {
  switch (block.type) {
    case 'text':
      return { content: typeof block.text === 'string' ? block.text : '', type: 'text' };
    case 'thinking':
      return {
        content: typeof block.thinking === 'string' ? block.thinking : '',
        type: 'thinking',
      };
    case 'tool_result': {
      const output = extractToolResultText(block.content);
      return {
        isError: typeof block.is_error === 'boolean' ? block.is_error : false,
        output: output.slice(0, 2000),
        toolUseId: typeof block.tool_use_id === 'string' ? block.tool_use_id : '',
        type: 'tool_result',
      };
    }
    case 'tool_use':
      return {
        id: typeof block.id === 'string' ? block.id : '',
        input: isRecord(block.input) ? block.input : {},
        toolName: typeof block.name === 'string' ? block.name : 'tool',
        type: 'tool_use',
      };
    default:
      return null;
  }
}

/** Map one raw Amp message object to a ConversationMessage, or null to skip. */
function ampMessageToConversationMessage(raw: unknown, index: number): ConversationMessage | null {
  if (!isRecord(raw)) {
    return null;
  }
  const role = raw.role;
  if (role !== 'user' && role !== 'assistant') {
    return null;
  }
  const parts = contentToParts(raw.content);
  if (parts.length === 0) {
    return null;
  }
  const msgRole: 'assistant' | 'user' = role === 'user' ? 'user' : 'assistant';
  return {
    id: `amp-${msgRole}-${index}`,
    parts,
    role: msgRole,
    timestamp: '',
  };
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function cleanTitle(raw: string): string {
  const first = raw.replace(/\s+/g, ' ').trim().split('\n')[0]?.trim() ?? '';
  if (!first) {
    return 'Untitled Session';
  }
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

/** Collect all T-*.json files under the Amp threads directory, sorted by mtime desc. */
function collectThreadFiles(): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(AMP_THREADS, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: { mtime: number; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !THREAD_FILE_RE.test(entry.name)) {
      continue;
    }
    const full = path.join(AMP_THREADS, entry.name);
    try {
      const stat = fs.statSync(full);
      files.push({ mtime: stat.mtimeMs, path: full });
    } catch {
      // skip
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map((f) => f.path);
}

/** Map a `content` field (string or block array) to MessagePart[]. */
function contentToParts(content: unknown): MessagePart[] {
  if (typeof content === 'string' && content) {
    return [{ content, type: 'text' }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const parts: MessagePart[] = [];
  for (const item of content as unknown[]) {
    if (!isRecord(item)) {
      continue;
    }
    const part = ampBlockToPart(item);
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/** Extract plain text from a tool_result content field (string or text-block array). */
function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return (content as unknown[])
    .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text')
    .map((c) => (typeof c.text === 'string' ? c.text : ''))
    .join('\n');
}

/** Narrow an unknown value to a plain object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Derive the modified timestamp: last trace endTime or file mtime.
 * Amp records execution traces in meta.traces[].endTime (ISO string or ms number).
 */
function lastModified(doc: Record<string, unknown>, stat: fs.Stats): string {
  if (isRecord(doc.meta)) {
    const traces = doc.meta.traces;
    if (Array.isArray(traces) && traces.length > 0) {
      const last: unknown = traces[traces.length - 1];
      if (isRecord(last)) {
        const et = last.endTime;
        if (typeof et === 'string' && et) {
          return et;
        }
        if (typeof et === 'number' && et > 0) {
          return new Date(et).toISOString();
        }
      }
    }
  }
  return stat.mtime.toISOString();
}

/**
 * Extract the project cwd/name from env.initial.trees[0].displayName.
 * May be an absolute path or just a display name — surface it as-is.
 */
function projectCwd(doc: Record<string, unknown>): string {
  if (isRecord(doc.env) && isRecord(doc.env.initial)) {
    const trees = doc.env.initial.trees;
    if (Array.isArray(trees) && trees.length > 0 && isRecord(trees[0])) {
      const dn = trees[0].displayName;
      if (typeof dn === 'string' && dn) {
        return dn;
      }
    }
  }
  return '';
}

/**
 * Read and parse a thread JSON file.
 * Returns null if the file is too large or malformed.
 */
function readThreadDoc(filePath: string): null | Record<string, unknown> {
  try {
    if (fs.statSync(filePath).size > MAX_FILE_BYTES) {
      return null;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Derive the canonical session id from the filename stem (the part after
 * "T-" in "T-<id>.json").  This must agree with what getAmpConversation
 * expects: it reconstructs the file path as `T-${sessionId}.json`, so the
 * id returned here must NOT include the leading "T-".
 *
 * The doc's `.id` field is accepted only as a last-resort fallback when the
 * filename doesn't match the expected pattern — using doc.id first was the
 * original bug (doc.id may contain or omit the "T-" prefix differently from
 * the filename, causing a mismatch that produced zero messages on retrieval).
 */
function threadId(filePath: string, doc: Record<string, unknown>): string {
  const m = THREAD_FILE_RE.exec(path.basename(filePath));
  if (m?.[1]) {
    return m[1];
  }
  if (typeof doc.id === 'string' && doc.id) {
    return doc.id;
  }
  return '';
}
