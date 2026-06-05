/**
 * Codex CLI session reader — listing + conversation retrieval.
 *
 * Mirrors jsonl-reader.ts (Claude) and opencode-reader.ts (OpenCode): produces
 * the same SessionInfo / ProjectGroup / ConversationMessage shapes so the rest
 * of the app is provider-agnostic.
 *
 * Codex sessions live at ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
 * (and ~/.codex/archived_sessions/). These files can be very large (hundreds of
 * MB), so listing only reads a bounded prefix of each file for metadata/title
 * and estimates the message count from file size; the conversation reader bounds
 * its read for oversized files.
 */

import type { ConversationMessage, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

import { parseCodexMeta, parseCodexRollout } from './codex-parser';

/** Bytes read from the head of a rollout file when listing (enough for meta + first prompts). */
const LIST_PREFIX_BYTES = 256 * 1024;
/** Above this size, the conversation reader reads only the tail to bound memory. */
const MAX_FULL_READ_BYTES = 16 * 1024 * 1024;
/** Rough average bytes per Codex message line, used to estimate message counts cheaply. */
const APPROX_BYTES_PER_MESSAGE = 3000;

/** User-message wrappers that Codex injects automatically — not real prompts. */
const SYNTHETIC_PROMPT_PREFIXES = ['<environment_context>', '<user_instructions>', '<permissions'];

/**
 * Find Codex sessions whose rollout file was written within `thresholdMs` —
 * i.e. sessions that are currently (or very recently) active. Uses filesystem
 * mtime rather than ~/.codex/state_5.sqlite, which is WAL-locked while Codex runs.
 */
export function detectActiveCodexSessions(
  thresholdMs: number
): { cwd: string; id: string; startedAt: number }[] {
  const cutoff = Date.now() - thresholdMs;
  const out: { cwd: string; id: string; startedAt: number }[] = [];
  for (const filePath of collectRolloutFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        continue;
      }
      const meta = parseCodexMeta(readPrefix(filePath).split('\n')[0] ?? '');
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
 * Find the rollout file for a Codex session launched in `cwd` after `sinceMs`
 * (used by pty-manager to link a freshly-launched `codex` terminal to its file).
 * Picks the newest matching file by creation time.
 */
export function findCodexRolloutForCwd(cwd: string, sinceMs: number): null | string {
  let best: null | { birthtime: number; path: string } = null;
  for (const filePath of collectRolloutFiles()) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.birthtimeMs <= sinceMs) {
        continue;
      }
      const meta = parseCodexMeta(readPrefix(filePath).split('\n')[0] ?? '');
      if (meta?.cwd === cwd && (!best || stat.birthtimeMs > best.birthtime)) {
        best = { birthtime: stat.birthtimeMs, path: filePath };
      }
    } catch {
      // skip unreadable files
    }
  }
  return best?.path ?? null;
}

/**
 * Return a page of a Codex session's conversation. With `offset` 0 the most
 * recent `limit` messages are returned, backed up to a user-message boundary so
 * turns aren't clipped; otherwise the `offset`..`offset + limit` slice is returned.
 */
export function getCodexConversation(
  sessionId: string,
  offset = 0,
  limit = 200
): ConversationMessage[] {
  const filePath = findRolloutPath(sessionId);
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  try {
    const { messages } = parseCodexRollout(readRolloutText(filePath));

    // Match the Claude reader: with no explicit offset, return the most recent
    // `limit` messages, backing up to a user-message boundary so turns aren't clipped.
    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      while (startIdx > 0 && messages[startIdx].role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (error) {
    console.error('[codex] Failed to read conversation:', error);
    return [];
  }
}

/** List all Codex sessions grouped by working directory, most-recently-modified first. */
export function listCodexProjects(): ProjectGroup[] {
  const files = collectRolloutFiles();
  const byCwd = new Map<string, SessionInfo[]>();

  for (const filePath of files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    let prefix: string;
    try {
      prefix = readPrefix(filePath);
    } catch {
      continue;
    }

    const firstLine = prefix.slice(0, Math.max(0, prefix.indexOf('\n')) || prefix.length);
    const meta = parseCodexMeta(firstLine);
    if (!meta) {
      continue;
    }

    const session: SessionInfo = {
      created: meta.startedAt || stat.birthtime.toISOString(),
      gitBranch: '',
      id: meta.id,
      messageCount: Math.max(1, Math.round(stat.size / APPROX_BYTES_PER_MESSAGE)),
      modified: stat.mtime.toISOString(),
      projectPath: meta.cwd,
      source: 'codex' as const,
      summary: '',
      title: cleanTitle(firstUserPrompt(prefix)),
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

function cleanTitle(prompt: string): string {
  const firstLine = prompt.replace(/\s+/g, ' ').trim().split('\n')[0]?.trim() ?? '';
  if (!firstLine) {
    return 'Untitled Session';
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function codexSessionsDirs(): string[] {
  const home = homedir();
  return [path.join(home, '.codex', 'sessions'), path.join(home, '.codex', 'archived_sessions')];
}

/** Recursively collect all rollout-*.jsonl file paths under the Codex session roots. */
function collectRolloutFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  };
  for (const root of codexSessionsDirs()) {
    walk(root);
  }
  return out;
}

/** Locate a rollout file by its session UUID (embedded in the filename and session_meta.id). */
function findRolloutPath(sessionId: string): null | string {
  if (!/^[0-9a-f-]+$/i.test(sessionId)) {
    return null;
  }
  const suffix = `-${sessionId}.jsonl`;
  return collectRolloutFiles().find((p) => path.basename(p).endsWith(suffix)) ?? null;
}

/** Pull the first genuine user prompt (skipping Codex's auto-injected wrappers) for a title. */
function firstUserPrompt(prefixText: string): string {
  for (const line of prefixText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('"type":"message"') || !trimmed.includes('"role":"user"')) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as {
        payload?: { content?: { text?: string; type?: string }[] };
      };
      const text = (entry.payload?.content ?? [])
        .filter((c) => c.type === 'input_text' && typeof c.text === 'string')
        .map((c) => c.text ?? '')
        .join('\n')
        .trim();
      if (text && !SYNTHETIC_PROMPT_PREFIXES.some((p) => text.startsWith(p))) {
        return text;
      }
    } catch {
      continue;
    }
  }
  return '';
}

/** Read the first `LIST_PREFIX_BYTES` of a file as UTF-8 (complete lines only). */
function readPrefix(filePath: string): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(LIST_PREFIX_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, LIST_PREFIX_BYTES, 0);
    const text = buf.toString('utf-8', 0, bytesRead);
    const lastNl = text.lastIndexOf('\n');
    return lastNl === -1 ? text : text.slice(0, lastNl);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read a rollout file's text, bounded to the tail for oversized files. */
function readRolloutText(filePath: string): string {
  const stat = fs.statSync(filePath);
  if (stat.size <= MAX_FULL_READ_BYTES) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  // Oversized: keep session_meta (first line) + the tail (most recent messages).
  const head = readPrefix(filePath).split('\n')[0] ?? '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const start = stat.size - MAX_FULL_READ_BYTES;
    const buf = Buffer.alloc(MAX_FULL_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, MAX_FULL_READ_BYTES, start);
    const tail = buf.toString('utf-8', 0, bytesRead);
    // Drop the first (likely partial) line of the tail.
    return `${head}\n${tail.slice(tail.indexOf('\n') + 1)}`;
  } finally {
    fs.closeSync(fd);
  }
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}
