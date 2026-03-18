import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ConversationMessage, MessagePart, ProjectGroup, SessionInfo } from './types';

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
    const lines = raw.split('\n').filter((line) => line.trim());

    const messages: ConversationMessage[] = [];
    // Map to group assistant entries by message.id
    const assistantTurns = new Map<string, { parts: MessagePart[]; timestamp: string }>();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type;

        if (entryType === 'user') {
          const msg = entry.message;
          if (!msg?.content) {
            continue;
          }

          const parts: MessagePart[] = [];
          const content = Array.isArray(msg.content) ? msg.content : [msg.content];

          for (const block of content) {
            if (typeof block === 'string') {
              parts.push({ content: block, type: 'text' });
            } else if (block.type === 'text') {
              parts.push({ content: block.text || '', type: 'text' });
            } else if (block.type === 'tool_result') {
              // Tool result — extract output
              let output = '';
              if (typeof block.content === 'string') {
                output = block.content;
              } else if (Array.isArray(block.content)) {
                output = block.content
                  .filter((c: { type: string }) => c.type === 'text')
                  .map((c: { text: string }) => c.text)
                  .join('\n');
              }
              // Check toolUseResult for richer data
              if (entry.toolUseResult?.content) {
                const trc = entry.toolUseResult.content;
                if (typeof trc === 'string') {
                  output = trc;
                } else if (Array.isArray(trc)) {
                  output = trc
                    .filter((c: { type: string }) => c.type === 'text')
                    .map((c: { text: string }) => c.text)
                    .join('\n');
                }
              }
              parts.push({
                isError: block.is_error || false,
                output: output.slice(0, 2000), // Truncate large outputs
                toolUseId: block.tool_use_id || '',
                type: 'tool_result',
              });
            }
          }

          if (parts.length > 0 && parts.some((p) => p.type === 'text')) {
            messages.push({
              id: entry.uuid || `user-${messages.length}`,
              parts: parts.filter((p) => p.type === 'text'), // Only text parts for user messages
              role: 'user',
              timestamp: entry.timestamp || '',
            });
          }

          // Add tool results as separate entries
          const toolResults = parts.filter((p) => p.type === 'tool_result');
          if (toolResults.length > 0) {
            // Attach to the previous assistant's tool_use
            // These get rendered inline with tool cards
            messages.push({
              id: `tool-result-${entry.uuid || messages.length}`,
              parts: toolResults,
              role: 'system',
              timestamp: entry.timestamp || '',
            });
          }
        } else if (entryType === 'assistant') {
          const msg = entry.message;
          if (!msg?.content) {
            continue;
          }

          const content = Array.isArray(msg.content) ? msg.content : [msg.content];
          const msgId = msg.id || entry.uuid;

          for (const block of content) {
            const part = parseAssistantBlock(block);
            if (!part) {
              continue;
            }

            if (!assistantTurns.has(msgId)) {
              assistantTurns.set(msgId, { parts: [], timestamp: entry.timestamp || '' });
            }
            assistantTurns.get(msgId)!.parts.push(part);
          }

          // If this entry has stop_reason, the turn is complete
          if (msg.stop_reason) {
            const turn = assistantTurns.get(msgId);
            if (turn && turn.parts.length > 0) {
              messages.push({
                id: msgId,
                parts: turn.parts,
                role: 'assistant',
                timestamp: turn.timestamp,
              });
              assistantTurns.delete(msgId);
            }
          }
        }
        // Skip progress, system, file-history-snapshot, queue-operation etc.
      } catch {
        // Skip malformed lines
      }
    }

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
    // Decode project path (fallback, prefer session's projectPath)
    const decodedPath = dir.startsWith('-') ? dir.replace(/-/g, '/') : `/${dir.replace(/-/g, '/')}`;

    // Get sessions for this project
    const sessions = listSessionsForProject(projectDir);
    if (sessions.length === 0) {
      continue;
    }

    // Sort sessions by modified desc
    sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    // Get real project path from session data instead of decoding directory name
    const realPath =
      sessions.find((s) => s.projectPath && !s.projectPath.includes('.claude/projects'))
        ?.projectPath || decodedPath;
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
    .replace(/<system-reminder>.*?<\/system-reminder>/gs, '');

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
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const firstUserLine = content.split('\n').find((line) => {
            try {
              const entry = JSON.parse(line);
              if (entry.type !== 'user') {
                return false;
              }
              const msg = entry.message;
              if (!msg?.content) {
                return false;
              }
              const blocks = Array.isArray(msg.content) ? msg.content : [msg.content];
              return blocks.some((b: unknown) => {
                if (typeof b === 'string') {
                  return b.trim().length > 0;
                }
                if (typeof b === 'object' && b !== null && 'type' in b && 'text' in b) {
                  const tb = b as { text?: string; type: string };
                  return tb.type === 'text' && tb.text?.trim();
                }
                return false;
              });
            } catch {
              return false;
            }
          });
          if (firstUserLine) {
            const entry = JSON.parse(firstUserLine);
            const blocks = Array.isArray(entry.message.content)
              ? entry.message.content
              : [entry.message.content];
            for (const b of blocks) {
              if (typeof b === 'string' && b.trim()) {
                firstPrompt = b.trim();
                break;
              }
              if (b.type === 'text' && b.text?.trim()) {
                firstPrompt = b.text.trim();
                break;
              }
            }
          }
        } catch {
          // ignore read errors
        }

        sessions.push({
          created: stat.birthtime.toISOString(),
          gitBranch: '',
          id: sessionId,
          messageCount: 0,
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

function parseAssistantBlock(block: Record<string, unknown>): MessagePart | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  switch (block.type) {
    case 'text':
      return { content: (block.text as string) || '', type: 'text' };
    case 'thinking':
      return { content: (block.thinking as string) || '', type: 'thinking' };
    case 'tool_use':
      return {
        id: (block.id as string) || '',
        input: (block.input as Record<string, unknown>) || {},
        toolName: (block.name as string) || 'Unknown',
        type: 'tool_use',
      };
    default:
      return null;
  }
}
