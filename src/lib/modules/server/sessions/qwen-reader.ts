/**
 * Qwen Code session reader.
 *
 * Qwen Code (a Gemini-CLI fork) writes a HYBRID format: a Claude-style JSONL
 * envelope (uuid/parentUuid/type per line) carrying a Gemini-style message body
 * (`message: { role, parts: [{text}|{thought}|{functionCall}|{functionResponse}] }`).
 * Stored at ~/.qwen/projects/<encoded-cwd>/chats/<id>.jsonl. So we parse the
 * envelope ourselves and map the Gemini-style parts (NOT the Claude parser,
 * which expects message.content).
 */

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

const QWEN_PROJECTS = path.join(homedir(), '.qwen', 'projects');
const PREFIX_BYTES = 64 * 1024;
/** Cap conversation reads at 16 MB; oversized files are tail-read (matches the Codex reader). */
const MAX_QWEN_FILE_BYTES = 16 * 1024 * 1024;
const SYSTEM_TAG_PREFIXES = [
  '<command-name>',
  '<local-command',
  '<system-reminder>',
  '<task-notification>',
];

/** Find Qwen sessions whose file changed within `thresholdMs` — i.e. currently or recently active. */
export function detectActiveQwenSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const out: { cwd: string; id: string; startedAt: number }[] = [];
  for (const filePath of collectQwenFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      const meta = readMeta(readPrefix(filePath));
      if (meta) {
        out.push({ cwd: meta.cwd, id: meta.id, startedAt: stat.birthtimeMs });
      }
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * Return a page of a Qwen session's conversation. With `offset` 0 the most recent
 * `limit` messages are returned, backed up to a user-message boundary so turns
 * aren't clipped; otherwise the `offset`..`offset + limit` slice is returned.
 */
export function getQwenConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return [];
  }
  const filePath = collectQwenFiles().find((p) => path.basename(p) === `${sessionId}.jsonl`);
  if (!filePath) {
    return [];
  }
  try {
    const messages = readQwenMessages(filePath);
    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx].role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (error) {
    console.error('[qwen] Failed to read conversation:', error);
    return [];
  }
}

/** List all Qwen sessions grouped by working directory, most-recently-modified first. */
export function listQwenProjects(): ProjectGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();
  for (const filePath of collectQwenFiles()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    const meta = readMeta(readPrefix(filePath));
    if (!meta) {
      continue;
    }
    const session: SessionInfo = {
      created: meta.started || stat.birthtime.toISOString(),
      gitBranch: meta.gitBranch,
      id: meta.id,
      messageCount: 0,
      modified: stat.mtime.toISOString(),
      projectPath: meta.cwd,
      source: 'qwen' as const,
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

/** Parse a Qwen session file into messages (used by the generic read-only watcher); [] on error. */
export function parseQwenSessionFile(filePath: string): ConversationMessage[] {
  try {
    return readQwenMessages(filePath);
  } catch {
    return [];
  }
}

/** Resolve a Qwen session id to its `chats/*.jsonl` path, or null if not found. */
export function resolveQwenSessionFile(sessionId: string): null | string {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return null;
  }
  return collectQwenFiles().find((p) => path.basename(p) === `${sessionId}.jsonl`) ?? null;
}

/** All chats/*.jsonl files under ~/.qwen/projects/<encoded-cwd>/chats/. */
function collectQwenFiles(): string[] {
  const out: string[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(QWEN_PROJECTS, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) {
      continue;
    }
    const chatsDir = path.join(QWEN_PROJECTS, dir.name, 'chats');
    try {
      for (const f of fs.readdirSync(chatsDir)) {
        if (f.endsWith('.jsonl')) {
          out.push(path.join(chatsDir, f));
        }
      }
    } catch {
      // no chats dir
    }
  }
  return out;
}

/** Map a Qwen JSONL line (Claude envelope + Gemini message.parts) to a ConversationMessage. */
function qwenLineToMessage(entry: Record<string, unknown>): ConversationMessage | null {
  const type = entry.type;
  if (type !== 'user' && type !== 'assistant') {
    return null; // skip system/control records
  }
  const message = (entry.message ?? {}) as { content?: unknown; parts?: unknown };
  const rawParts = Array.isArray(message.parts) ? message.parts : [];
  const parts: MessagePart[] = [];
  for (const raw of rawParts) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const p = raw as Record<string, unknown>;
    if (p.functionCall && typeof p.functionCall === 'object') {
      const fc = p.functionCall as Record<string, unknown>;
      const toolName = typeof fc.name === 'string' ? fc.name : 'tool';
      parts.push({
        id: typeof fc.id === 'string' ? fc.id : toolName,
        input: (fc.args as Record<string, unknown>) ?? {},
        toolName,
        type: 'tool_use',
      });
    } else if (p.thought === true && typeof p.text === 'string') {
      parts.push({ content: p.text, type: 'thinking' });
    } else if (typeof p.text === 'string') {
      parts.push({ content: p.text, type: 'text' });
    }
  }
  // Fallback for any Claude-style string content.
  if (parts.length === 0 && typeof message.content === 'string' && message.content) {
    parts.push({ content: message.content, type: 'text' });
  }
  if (parts.length === 0) {
    return null;
  }
  return {
    id: typeof entry.uuid === 'string' ? entry.uuid : `qwen-${type}`,
    parts,
    role: type === 'user' ? 'user' : 'assistant',
    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
  };
}

/** Extract {cwd, sessionId, gitBranch, started} + first real user prompt from a Qwen session prefix. */
function readMeta(
  prefix: string
): null | { cwd: string; gitBranch: string; id: string; started: string; title: string } {
  let cwd = '';
  let id = '';
  let gitBranch = '';
  let started = '';
  let title = '';
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
    if (!cwd && typeof entry.cwd === 'string') {
      cwd = entry.cwd;
    }
    if (!id && typeof entry.sessionId === 'string') {
      id = entry.sessionId;
    }
    if (!gitBranch && typeof entry.gitBranch === 'string') {
      gitBranch = entry.gitBranch;
    }
    if (!started && typeof entry.timestamp === 'string') {
      started = entry.timestamp;
    }
    if (!title && entry.type === 'user') {
      const msg = entry.message as undefined | { content?: unknown; parts?: unknown };
      let text = typeof msg?.content === 'string' ? msg.content : '';
      if (!text && Array.isArray(msg?.parts)) {
        text = msg.parts
          .map((p) =>
            p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string'
              ? (p as { text: string }).text
              : ''
          )
          .join(' ')
          .trim();
      }
      if (text && !SYSTEM_TAG_PREFIXES.some((p) => text.startsWith(p))) {
        title = text.split('\n')[0]?.slice(0, 80) ?? '';
      }
    }
  }
  return id && cwd ? { cwd, gitBranch, id, started, title } : null;
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

/**
 * Read all ConversationMessages from a Qwen JSONL file without pagination.
 * Oversized files are tail-bounded (see readQwenTextBounded) to cap memory.
 */
function readQwenMessages(filePath: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const line of readQwenTextBounded(filePath).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const msg = qwenLineToMessage(JSON.parse(trimmed) as Record<string, unknown>);
      if (msg) {
        messages.push(msg);
      }
    } catch {
      // skip malformed line
    }
  }
  return messages;
}

/** Read a Qwen session file, bounded to the tail for oversized files to cap memory. */
function readQwenTextBounded(filePath: string): string {
  const size = fs.statSync(filePath).size;
  if (size <= MAX_QWEN_FILE_BYTES) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  // Oversized: read only the trailing window (most recent messages), dropping the
  // first (likely partial) line so JSON.parse never sees a fragment.
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(MAX_QWEN_FILE_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_QWEN_FILE_BYTES, size - MAX_QWEN_FILE_BYTES);
    const tail = buf.toString('utf-8', 0, n);
    return tail.slice(tail.indexOf('\n') + 1);
  } finally {
    fs.closeSync(fd);
  }
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}
