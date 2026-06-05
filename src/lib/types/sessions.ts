// Session and conversation types for Claude Code and OpenCode JSONL parsing.
// Local interfaces kept here because the generated MessagePart uses wrapper
// classes and `type: string` instead of the string-literal discriminated unions
// required at runtime.

import type { MessageRole, ProjectGroup, SessionSource } from './generated';

/** Internal structure from ~/.claude/sessions/<PID>.json */
export interface ClaudeSessionFile {
  cwd: string;
  entrypoint: string;
  kind: string;
  pid: number;
  sessionId: string;
  startedAt: number;
}

export interface ConversationMessage {
  id: string;
  parts: MessagePart[];
  role: MessageRole;
  timestamp: string;
}

export interface DetectedProcess {
  command: 'amp' | 'claude' | 'codex' | 'copilot' | 'cursor-agent' | 'gemini' | 'opencode' | 'qwen';
  cwd: string;
  kind: string;
  pid: number;
  projectPath: string;
  sessionId: string;
  startedAt: number;
}

export type MessagePart = TextPart | ThinkingPart | ToolResultPart | ToolUsePart;

/** A registered AI-agent provider (see server/sessions/registry.ts). */
export interface ProviderDef {
  command: string;
  getConversation: (sessionId: string, offset: number, limit: number) => ConversationMessage[];
  isAI: boolean;
  label: string;
  listProjects: () => ProjectGroup[];
  nameSuffix?: string;
  resumeArgs: (sessionId: string) => string[];
  source: SessionSource;
}

export interface TextPart {
  content: string;
  type: 'text';
}

export interface ThinkingPart {
  content: string;
  type: 'thinking';
}

export interface ToolResultPart {
  isError: boolean;
  output: string;
  toolUseId: string;
  type: 'tool_result';
}

export interface ToolUsePart {
  id: string;
  input: Record<string, unknown>;
  toolName: string;
  type: 'tool_use';
}
