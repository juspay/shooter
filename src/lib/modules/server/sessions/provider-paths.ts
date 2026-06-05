/**
 * Path-based dispatch for the five read-only providers (cursor, copilot,
 * qwen, gemini, amp). These have no incremental byte watcher of their own;
 * the generic-session-watcher re-reads the whole file on change and parses it
 * through here. Keeping all path↔provider knowledge in one module means the
 * watcher, the WS session handler, and the SoS coordinator share one source of
 * truth and never branch on provider directories themselves.
 */

import type { ConversationMessage, SessionSource } from '$lib/types';

import { detectActiveAmpSessions, parseAmpSessionFile, resolveAmpSessionFile } from './amp-reader';
import {
  detectActiveCopilotSessions,
  parseCopilotSessionFile,
  resolveCopilotSessionFile,
} from './copilot-reader';
import {
  detectActiveCursorSessions,
  parseCursorSessionFile,
  resolveCursorSessionFile,
} from './cursor-reader';
import {
  detectActiveGeminiSessions,
  parseGeminiSessionFile,
  resolveGeminiSessionFile,
} from './gemini-reader';
import {
  detectActiveQwenSessions,
  parseQwenSessionFile,
  resolveQwenSessionFile,
} from './qwen-reader';

/** True when the path belongs to one of the five read-only providers. */
export function isReadOnlyProviderPath(filePath: string): boolean {
  return readOnlyProviderForPath(filePath) !== null;
}

/**
 * Parse a single read-only-provider session file (by path) into the full
 * conversation. Returns [] for unknown paths or on any read/parse error.
 */
export function parseReadOnlyProviderFile(filePath: string): ConversationMessage[] {
  switch (readOnlyProviderForPath(filePath)) {
    case 'amp':
      return parseAmpSessionFile(filePath);
    case 'copilot':
      return parseCopilotSessionFile(filePath);
    case 'cursor':
      return parseCursorSessionFile(filePath);
    case 'gemini':
      return parseGeminiSessionFile(filePath);
    case 'qwen':
      return parseQwenSessionFile(filePath);
    default:
      return [];
  }
}

/**
 * Identify which read-only provider backs a given session-file path, or null
 * for claude/codex/opencode (which have their own watchers) and unknown paths.
 * Detection is by the provider's root directory, which is unique per provider.
 */
export function readOnlyProviderForPath(filePath: string): null | SessionSource {
  if (filePath.includes('/.cursor/')) {
    return 'cursor';
  }
  if (filePath.includes('/.copilot/')) {
    return 'copilot';
  }
  if (filePath.includes('/.qwen/')) {
    return 'qwen';
  }
  if (filePath.includes('/.gemini/')) {
    return 'gemini';
  }
  if (filePath.includes('/amp/threads/')) {
    return 'amp';
  }
  return null;
}

/** Map a launchable CLI command to its read-only provider source, or null. */
export function readOnlySourceForCommand(command: string): null | SessionSource {
  switch (command) {
    case 'amp':
      return 'amp';
    case 'copilot':
      return 'copilot';
    case 'cursor-agent':
      return 'cursor';
    case 'gemini':
      return 'gemini';
    case 'qwen':
      return 'qwen';
    default:
      return null;
  }
}

/**
 * Resolve a read-only provider's session ID to its backing file path, or null
 * if the provider has no single-file backing for that session (e.g. a Gemini
 * session present only in logs.json) or the ID is not found.
 */
export function resolveReadOnlyProviderFile(
  source: SessionSource,
  sessionId: string
): null | string {
  switch (source) {
    case 'amp':
      return resolveAmpSessionFile(sessionId);
    case 'copilot':
      return resolveCopilotSessionFile(sessionId);
    case 'cursor':
      return resolveCursorSessionFile(sessionId);
    case 'gemini':
      return resolveGeminiSessionFile(sessionId);
    case 'qwen':
      return resolveQwenSessionFile(sessionId);
    default:
      return null;
  }
}

const READ_ONLY_DETECTORS: Partial<
  Record<SessionSource, (thresholdMs: number) => { cwd: string; id: string; startedAt: number }[]>
> = {
  amp: detectActiveAmpSessions,
  copilot: detectActiveCopilotSessions,
  cursor: detectActiveCursorSessions,
  gemini: detectActiveGeminiSessions,
  qwen: detectActiveQwenSessions,
};

/**
 * After Shooter launches a read-only-provider CLI, find the session file it
 * just created so the terminal can be live-tailed. Picks the most recent
 * session started at/after launch, preferring an exact cwd match (cwd decoding
 * is heuristic for some providers, so a same-provider, started-after-launch
 * session is the fallback). Returns null until the CLI has written a session.
 */
export function discoverReadOnlyProviderSessionFile(
  source: SessionSource,
  cwd: string,
  launchTimeMs: number,
  nowMs: number
): null | string {
  const detect = READ_ONLY_DETECTORS[source];
  if (!detect) {
    return null;
  }
  // Detector scan window: reach back to ~60s before launch so the just-created
  // session is still inside the mtime window however long ago we launched.
  const thresholdMs = Math.max(nowMs - launchTimeMs + 60_000, 60_000);
  let active: { cwd: string; id: string; startedAt: number }[];
  try {
    active = detect(thresholdMs);
  } catch {
    return null;
  }
  // Start-time tolerance (distinct from the scan window above): keep only
  // sessions that started at/after launch, with 2s of clock-skew slack.
  const afterLaunch = active
    .filter((s) => s.startedAt >= launchTimeMs - 2000)
    .sort((a, b) => b.startedAt - a.startedAt);
  const match = afterLaunch.find((s) => s.cwd === cwd) ?? afterLaunch[0];
  if (!match) {
    return null;
  }
  return resolveReadOnlyProviderFile(source, match.id);
}
