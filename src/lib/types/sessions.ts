// Session and conversation types for Claude Code and OpenCode JSONL parsing.
// Local interfaces kept here because the generated MessagePart uses wrapper
// classes and `type: string` instead of the string-literal discriminated unions
// required at runtime.

import type { MessageRole } from './generated';

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
  command: 'claude' | 'codex' | 'gemini' | 'opencode';
  cwd: string;
  kind: string;
  pid: number;
  projectPath: string;
  sessionId: string;
  startedAt: number;
}

export type MessagePart = TextPart | ThinkingPart | ToolResultPart | ToolUsePart;

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
