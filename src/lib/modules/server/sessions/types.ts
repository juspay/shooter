// Re-export generated types that match 1:1
export type { MessageRole, ProjectGroup, SessionInfo } from '$generated/types';
import type { MessageRole } from '$generated/types';

// ── Local interfaces ─────────────────────────────────────────────────
// These remain local because the generated versions differ structurally:
// generated MessagePart uses wrapper classes (CMessagePartTextPart, etc.)
// and part types use `type: string` instead of string literals needed
// for discriminated unions. Declared as interfaces per ESLint rules.

export interface ConversationMessage {
  id: string;
  parts: MessagePart[];
  role: MessageRole;
  timestamp: string;
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
