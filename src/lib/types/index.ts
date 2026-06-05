// Type barrel — the ONLY import source for types in this project.
// All source files must use: import type { Foo } from '$lib/types';

export type * from './activity';
export type * from './apn';
export type * from './cli';
export type * from './codex';
export type * from './common';
export type * from './dashboard';
export * from './decision';
export type * from './gemini';
export * from './generated';
export type * from './neurolink';
export type * from './server';
export type * from './sessions';

// Explicit re-exports to resolve conflicts between generated types and the
// hand-written sessions.ts versions. The generated Sessions module exports
// wrapper-class variants (CMessagePartTextPart, etc.) with `type: string`
// instead of string-literal discriminated unions. The sessions.ts versions
// are the ones callers actually need.
export type {
  ConversationMessage,
  MessagePart,
  TextPart,
  ThinkingPart,
  ToolResultPart,
  ToolUsePart,
} from './sessions';
export type * from './sos';
export type * from './terminal-client';
export type * from './ws';
