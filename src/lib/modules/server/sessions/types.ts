export interface ConversationMessage {
  id: string;
  parts: MessagePart[];
  role: 'assistant' | 'system' | 'user';
  timestamp: string;
}

export type MessagePart = TextPart | ThinkingPart | ToolResultPart | ToolUsePart;

export interface ProjectGroup {
  fullPath: string;
  id: string;
  lastModified: string;
  name: string;
  sessionCount: number;
  sessions: SessionInfo[];
}

export interface SessionInfo {
  created: string;
  gitBranch: string;
  id: string;
  messageCount: number;
  modified: string;
  projectPath: string;
  source: 'claude-code' | 'opencode';
  summary: string;
  title: string;
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
