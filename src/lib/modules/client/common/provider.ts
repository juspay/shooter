// Shared provider/source mappings used by the session + project UIs so every
// page agrees on which CLI binary and label corresponds to each SessionSource.
// Using Record<SessionSource, …> makes these exhaustive: adding a new provider
// to the SessionSource union forces a compile error here until it is handled.

import type { SessionSource } from '$lib/types';

const SOURCE_COMMAND: Record<SessionSource, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencode: 'opencode',
};

const SOURCE_LABEL: Record<SessionSource, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
};

/** Human-readable label for a session source. */
export function sourceLabel(source: SessionSource): string {
  return SOURCE_LABEL[source] ?? 'Claude Code';
}

/** Map a session source to the CLI binary used to launch/resume it. */
export function sourceToCommand(source: SessionSource): string {
  return SOURCE_COMMAND[source] ?? 'claude';
}
