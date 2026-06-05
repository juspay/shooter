/**
 * Provider registry — the single place that knows every AI-agent provider.
 *
 * Inspired by wesm/agentsview's AgentDef registry: instead of branching on
 * `command === 'claude'` across ~14 call sites, the session API, the connect
 * route, and the terminal allowlist all derive from this list. Adding a
 * provider is one entry here (+ its reader) rather than edits everywhere.
 *
 * Detection (process-detector) and live watching (server.ts adapter) stay
 * provider-specific because their mechanisms differ too much to unify cheaply.
 */

import type { ConversationMessage, ProjectGroup, ProviderDef } from '$lib/types';

import { getAmpConversation, listAmpProjects } from './amp-reader';
import { getCodexConversation, listCodexProjects } from './codex-reader';
import { getCopilotConversation, listCopilotProjects } from './copilot-reader';
import { getCursorConversation, listCursorProjects } from './cursor-reader';
import { getGeminiConversation, listGeminiProjects } from './gemini-reader';
import { getSessionConversation, listProjectsWithSessions } from './jsonl-reader';
import { getOpenCodeConversation, listOpenCodeProjects } from './opencode-reader';
import { getQwenConversation, listQwenProjects } from './qwen-reader';

/**
 * Every AI-agent provider, in merge order. `claude-code` MUST stay first: its
 * projects seed the merge map so the canonical (decoded) project path/name wins
 * over other providers' guesses.
 */
export const PROVIDERS: ProviderDef[] = [
  {
    command: 'claude',
    getConversation: (id, offset, limit) => getSessionConversation(id, offset, limit),
    isAI: true,
    label: 'Claude Code',
    listProjects: listProjectsWithSessions,
    resumeArgs: (id) => ['--resume', id],
    source: 'claude-code',
  },
  {
    command: 'opencode',
    getConversation: getOpenCodeConversation,
    isAI: true,
    label: 'OpenCode',
    listProjects: listOpenCodeProjects,
    nameSuffix: ' (OpenCode)',
    resumeArgs: (id) => ['--session', id],
    source: 'opencode',
  },
  {
    command: 'codex',
    getConversation: getCodexConversation,
    isAI: true,
    label: 'Codex',
    listProjects: listCodexProjects,
    resumeArgs: (id) => ['resume', id],
    source: 'codex',
  },
  {
    command: 'gemini',
    getConversation: getGeminiConversation,
    isAI: true,
    label: 'Gemini',
    listProjects: listGeminiProjects,
    resumeArgs: () => [], // Gemini CLI has no session-resume flag
    source: 'gemini',
  },
  {
    command: 'qwen',
    getConversation: getQwenConversation,
    isAI: true,
    label: 'Qwen',
    listProjects: listQwenProjects,
    resumeArgs: () => [],
    source: 'qwen',
  },
  {
    command: 'cursor-agent',
    getConversation: getCursorConversation,
    isAI: true,
    label: 'Cursor',
    listProjects: listCursorProjects,
    resumeArgs: () => [],
    source: 'cursor',
  },
  {
    command: 'copilot',
    getConversation: getCopilotConversation,
    isAI: true,
    label: 'Copilot',
    listProjects: listCopilotProjects,
    resumeArgs: () => [],
    source: 'copilot',
  },
  {
    command: 'amp',
    getConversation: getAmpConversation,
    isAI: true,
    label: 'Amp',
    listProjects: listAmpProjects,
    resumeArgs: () => [],
    source: 'amp',
  },
];

/** AI-agent binary names (for AI_COMMANDS-style checks). */
export const AI_COMMANDS: string[] = PROVIDERS.filter((p) => p.isAI).map((p) => p.command);

/** All provider binary names (for the terminal allowlist + connect validation). */
export const PROVIDER_COMMANDS: string[] = PROVIDERS.map((p) => p.command);

/** Resolve a session's conversation across providers (Claude first, with its project dir). */
export function getProviderConversation(
  sessionId: string,
  offset: number,
  limit: number,
  claudeProjectDir?: string
): ConversationMessage[] {
  const claude = getSessionConversation(sessionId, offset, limit, claudeProjectDir);
  if (claude.length > 0) {
    return claude;
  }
  for (const provider of PROVIDERS) {
    if (provider.source === 'claude-code') {
      continue;
    }
    try {
      const messages = provider.getConversation(sessionId, offset, limit);
      if (messages.length > 0) {
        return messages;
      }
    } catch {
      // a failing provider reader must not break resolution — try the next
    }
  }
  return [];
}

/** Merge every provider's projects, deduplicating by absolute path. */
export function listAllProviderProjects(): ProjectGroup[] {
  const byPath = new Map<string, ProjectGroup>();
  for (const provider of PROVIDERS) {
    let groups: ProjectGroup[];
    try {
      groups = provider.listProjects();
    } catch {
      continue; // a broken provider must not take down the whole listing
    }
    for (const group of groups) {
      try {
        const name =
          provider.nameSuffix && typeof group.name === 'string'
            ? group.name.replace(provider.nameSuffix, '')
            : group.name;
        const existing = byPath.get(group.fullPath);
        if (existing) {
          existing.sessions.push(...group.sessions);
          existing.sessions.sort(
            (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
          existing.sessionCount = existing.sessions.length;
          existing.lastModified = existing.sessions[0]?.modified || existing.lastModified;
        } else {
          byPath.set(group.fullPath, { ...group, name });
        }
      } catch {
        // skip a malformed group rather than dropping the rest of the provider
      }
    }
  }
  return [...byPath.values()].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

/** Resume args for a launched command (e.g. `codex resume <id>`). */
export function resumeArgsForCommand(command: string, sessionId: string): string[] {
  return PROVIDERS.find((p) => p.command === command)?.resumeArgs(sessionId) ?? [];
}
