// Codex CLI session types (hand-written: the rollout record shapes are
// provider-specific and not worth round-tripping through the YAML codegen).
// Codex stores sessions as JSONL "rollout" files under
// ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl.

import type { ConversationMessage } from './sessions';

/** Result of parsing a Codex rollout file into the canonical message model. */
export interface CodexParseResult {
  messages: ConversationMessage[];
  meta: CodexSessionMeta | null;
}

/** First-line `session_meta` payload of a Codex rollout file. */
export interface CodexSessionMeta {
  cliVersion: string;
  cwd: string;
  id: string;
  model: string;
  startedAt: string;
}
