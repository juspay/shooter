import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from '$lib/types';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { parseJsonlText } from './jsonl-parser';

const SYSTEM_TAG_PREFIXES = [
  '<local-command',
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<system-reminder>',
  '<task-notification>',
];

/** Extract plain text from message content (string or array of content blocks). */
function extractContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    for (const b of content) {
      if (typeof b === 'string' && b.trim()) {
        return b.trim();
      }
      if (typeof b === 'object' && b !== null) {
        const block = b as Record<string, unknown>;
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          return block.text.trim();
        }
      }
    }
  }
  return '';
}

/** Find the first real user prompt from raw JSONL content. */
function findFirstUserPrompt(content: string): string {
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type !== 'user') {
        continue;
      }
      const msg = entry.message as Record<string, unknown> | undefined;
      if (!msg?.content) {
        continue;
      }
      const text = extractContentText(msg.content as unknown);
      if (!text || SYSTEM_TAG_PREFIXES.some((p) => text.startsWith(p))) {
        continue;
      }
      return text;
    } catch {
      continue;
    }
  }
  return '';
}

// Short hash for project IDs (8 chars from SHA-256)
function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

// Path to Claude Code's project session data
const CLAUDE_PROJECTS_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

export function getSessionConversation(
  sessionId: string,
  offset = 0,
  limit = 100,
  projectId?: string
): ConversationMessage[] {
  const projectDir = projectId ? path.join(CLAUDE_PROJECTS_DIR, projectId) : getProjectDir();
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

  if (!fs.existsSync(jsonlPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(jsonlPath, 'utf-8');
    const assistantTurns = new Map<string, { parts: MessagePart[]; timestamp: string }>();
    const messages = parseJsonlText(raw, assistantTurns, 0);

    // Flush any remaining assistant turns
    for (const [msgId, turn] of assistantTurns) {
      if (turn.parts.length > 0) {
        messages.push({
          id: msgId,
          parts: turn.parts,
          role: 'assistant',
          timestamp: turn.timestamp,
        });
      }
    }

    // If no explicit offset, return the LAST `limit` messages (most recent conversation)
    if (offset === 0 && messages.length > limit) {
      let startIdx = messages.length - limit;
      // Adjust to start at a 'user' message boundary so we don't clip mid-turn
      while (startIdx > 0 && startIdx < messages.length && messages[startIdx].role !== 'user') {
        startIdx--;
      }
      return messages.slice(startIdx);
    }
    return messages.slice(offset, offset + limit);
  } catch (error) {
    console.error('[sessions] Failed to parse session JSONL:', error);
    return [];
  }
}

export function listProjectsWithSessions(): ProjectGroup[] {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    return [];
  }

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR).filter((d) => {
      const fullPath = path.join(CLAUDE_PROJECTS_DIR, d);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }

  const projects: ProjectGroup[] = [];

  for (const dir of projectDirs) {
    const projectDir = path.join(CLAUDE_PROJECTS_DIR, dir);

    // Get sessions for this project
    const sessions = listSessionsForProject(projectDir);
    if (sessions.length === 0) {
      continue;
    }

    // Sort sessions by modified desc
    sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    // Prefer projectPath from session index, then cwd from JSONL, then decoded dir name
    const realPath =
      sessions.find((s) => s.projectPath && !s.projectPath.includes('.claude/projects'))
        ?.projectPath ||
      readCwdFromProjectDir(projectDir, sessions) ||
      (dir.startsWith('-') ? dir.replace(/-/g, '/') : `/${dir.replace(/-/g, '/')}`);
    const pathSegments = realPath.split('/').filter(Boolean);
    const projectName = pathSegments.slice(-2).join('/');

    projects.push({
      fullPath: realPath,
      id: shortHash(realPath),
      lastModified: sessions[0]?.modified || '',
      name: projectName,
      sessionCount: sessions.length,
      sessions,
    });
  }

  return projects.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

export function listSessions(): SessionInfo[] {
  const projectDir = getProjectDir();
  return listSessionsForProject(projectDir);
}

function cleanTitle(prompt: string): string {
  // Strip internal Claude Code XML markup tags, then remove ALL angle-bracket content.
  // Use a loop to handle nested/reconstructed tags (satisfies CodeQL multi-char sanitization).
  let cleaned = prompt
    .replace(/<command-message>.*?<\/command-message>/gs, '')
    .replace(/<command-name>.*?<\/command-name>/gs, '')
    .replace(/<command-args>.*?<\/command-args>/gs, '')
    .replace(/<local-command-caveat>.*?<\/local-command-caveat>/gs, '')
    .replace(/<local-command-stdout>.*?<\/local-command-stdout>/gs, '')
    .replace(/<system-reminder>.*?<\/system-reminder>/gs, '')
    .replace(/<task-notification>.*?<\/task-notification>/gs, '');

  // Iteratively strip tags until none remain (prevents reconstructed tags like "<scr" + "ipt>")
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/<[^>]*>/g, '').replace(/</g, '');
  }
  cleaned = cleaned.trim();

  if (!cleaned) {
    return 'Untitled Session';
  }

  // Take first line, trim, cap at 80 chars
  const firstLine = cleaned.split('\n')[0].trim();
  if (!firstLine) {
    return 'Untitled Session';
  }
  if (firstLine.length > 80) {
    return `${firstLine.slice(0, 77)}...`;
  }
  return firstLine;
}

function getProjectDir(): string {
  // Encode project path: /Users/sachinsharma/Developer/Personal/shooter -> -Users-sachinsharma-Developer-Personal-shooter
  const projectPath = process.cwd();
  const encoded = projectPath.replace(/\//g, '-');
  return path.join(CLAUDE_PROJECTS_DIR, encoded);
}

function listSessionsForProject(projectDir: string): SessionInfo[] {
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(raw) as {
      entries: {
        created?: string;
        firstPrompt?: string;
        gitBranch?: string;
        isSidechain?: boolean;
        messageCount?: number;
        modified?: string;
        projectPath?: string;
        sessionId: string;
        summary?: string;
      }[];
    };

    const indexedIds = new Set<string>();
    const sessions: SessionInfo[] = index.entries
      .filter((e) => !e.isSidechain)
      .filter((e) => {
        const jsonlFile = path.join(projectDir, `${e.sessionId}.jsonl`);
        return fs.existsSync(jsonlFile);
      })
      .map((entry) => {
        indexedIds.add(entry.sessionId);
        return {
          created: entry.created || '',
          gitBranch: entry.gitBranch || '',
          id: entry.sessionId,
          messageCount: entry.messageCount || 0,
          modified: entry.modified || '',
          projectPath: entry.projectPath || '',
          source: 'claude-code' as const,
          summary: entry.summary || '',
          title: cleanTitle(entry.firstPrompt || entry.summary || 'Untitled Session'),
        };
      });

    // Also scan for JSONL files not in the index (e.g., active sessions)
    try {
      const files = fs.readdirSync(projectDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }
        const sessionId = file.replace('.jsonl', '');
        if (indexedIds.has(sessionId)) {
          continue;
        }
        // Read first user message as title
        const filePath = path.join(projectDir, file);
        const stat = fs.statSync(filePath);
        let firstPrompt = 'Active Session';
        let messageCount = 0;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Count user + assistant messages by searching each line for the type field.
          // The type field may appear anywhere on the line (after parentUuid, isSidechain, etc.)
          // so a prefix-only check is not reliable with the current JSONL format.
          let countPos = 0;
          while (countPos < content.length) {
            const nl = content.indexOf('\n', countPos);
            const lineEnd = nl === -1 ? content.length : nl;
            const line = content.substring(countPos, lineEnd);
            if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
              messageCount++;
            }
            if (nl === -1) {
              break;
            }
            countPos = nl + 1;
          }
          const prompt = findFirstUserPrompt(content);
          if (prompt) {
            firstPrompt = prompt;
          }
        } catch {
          // ignore read errors
        }

        sessions.push({
          created: stat.birthtime.toISOString(),
          gitBranch: '',
          id: sessionId,
          messageCount,
          modified: stat.mtime.toISOString(),
          projectPath: '',
          source: 'claude-code' as const,
          summary: '',
          title: cleanTitle(firstPrompt),
        });
      }
    } catch {
      // ignore scan errors
    }

    return sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  } catch (error) {
    console.error('[sessions] Failed to read sessions index:', error);
    return [];
  }
}

function readCwdFromProjectDir(projectDir: string, sessions: SessionInfo[]): string {
  for (const session of sessions) {
    try {
      const filePath = path.join(projectDir, `${session.id}.jsonl`);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      // Only read the first 4KB — cwd appears on line 1
      const fd = fs.openSync(filePath, 'r');
      let firstChunk: string;
      try {
        const buf = Buffer.alloc(4096);
        const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
        firstChunk = buf.toString('utf-8', 0, bytesRead);
      } finally {
        fs.closeSync(fd);
      }
      const firstLine = firstChunk.split('\n')[0];
      if (!firstLine.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(firstLine) as Record<string, unknown>;
        if (typeof entry.cwd === 'string' && entry.cwd) {
          return entry.cwd;
        }
      } catch {
        // skip malformed first line
      }
    } catch {
      // skip unreadable files
    }
  }
  return '';
}
