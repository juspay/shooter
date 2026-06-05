import type { ClaudeSessionFile, DetectedProcess } from '$lib/types';

import { detectActiveAmpSessions } from '$lib/modules/server/sessions/amp-reader';
import { detectActiveCodexSessions } from '$lib/modules/server/sessions/codex-reader';
import { detectActiveCopilotSessions } from '$lib/modules/server/sessions/copilot-reader';
import { detectActiveCursorSessions } from '$lib/modules/server/sessions/cursor-reader';
import { detectActiveGeminiSessions } from '$lib/modules/server/sessions/gemini-reader';
import { resolveOpenCodeDbPath } from '$lib/modules/server/sessions/opencode-db-path';
import { detectActiveQwenSessions } from '$lib/modules/server/sessions/qwen-reader';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a cwd path to the Claude Code project directory format. */
function cwdToProjectPath(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/** Check if any `opencode` process is currently running. */
function isOpenCodeRunning(): boolean {
  try {
    execSync('pgrep -x opencode', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Check if a process with the given PID is alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

const CLAUDE_SESSIONS_DIR = join(homedir(), '.claude', 'sessions');

// OpenCode sessions updated within this window are considered "live"
const OPENCODE_ACTIVE_THRESHOLD_MS = 3 * 60_000; // 3 minutes

// File-based providers: a session file written within this window = "live".
const FILE_PROVIDER_ACTIVE_THRESHOLD_MS = 3 * 60_000; // 3 minutes

// File-based providers (no PID file) share one detection shape:
// detectActive<P>Sessions(thresholdMs) -> { cwd, id, startedAt }[].
const FILE_PROVIDER_DETECTORS: {
  command: DetectedProcess['command'];
  detect: (thresholdMs: number) => { cwd: string; id: string; startedAt: number }[];
}[] = [
  { command: 'codex', detect: detectActiveCodexSessions },
  { command: 'gemini', detect: detectActiveGeminiSessions },
  { command: 'qwen', detect: detectActiveQwenSessions },
  { command: 'cursor-agent', detect: detectActiveCursorSessions },
  { command: 'copilot', detect: detectActiveCopilotSessions },
  { command: 'amp', detect: detectActiveAmpSessions },
];

/**
 * Scan ~/.claude/sessions/*.json to find running Claude Code processes,
 * and query the OpenCode SQLite DB for recently active sessions.
 */
export function detectRunningAISessions(): DetectedProcess[] {
  const results: DetectedProcess[] = [];

  // --- Claude Code sessions ---
  try {
    const files = readdirSync(CLAUDE_SESSIONS_DIR).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(CLAUDE_SESSIONS_DIR, file), 'utf-8');
        const data = JSON.parse(raw) as ClaudeSessionFile;

        if (!data.pid || !data.sessionId || !data.cwd) {
          continue;
        }

        if (!isProcessAlive(data.pid)) {
          continue;
        }

        results.push({
          command: 'claude',
          cwd: data.cwd,
          kind: data.kind || 'interactive',
          pid: data.pid,
          projectPath: cwdToProjectPath(data.cwd),
          sessionId: data.sessionId,
          startedAt: data.startedAt || 0,
        });
      } catch {
        // Skip malformed or unreadable files
      }
    }
  } catch {
    // ~/.claude/sessions/ may not exist — that's fine
  }

  // --- OpenCode sessions ---
  // Only query the DB if an opencode process is actually running.
  if (isOpenCodeRunning()) {
    try {
      const dbPath = resolveOpenCodeDbPath();
      if (existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: true });
        try {
          const cutoff = Date.now() - OPENCODE_ACTIVE_THRESHOLD_MS;
          const cutoffSec = Math.floor(cutoff / 1000);

          const rows = db
            .prepare(
              `SELECT id, directory, time_created, time_updated
               FROM session
               WHERE (time_archived IS NULL OR time_archived = 0)
                 AND (
                   (time_updated >= 1e12 AND time_updated > ?)
                   OR (time_updated < 1e12 AND time_updated > ?)
                 )
               ORDER BY time_updated DESC
               LIMIT 20`
            )
            .all(cutoff, cutoffSec) as {
            directory: string;
            id: string;
            time_created: number;
            time_updated: number;
          }[];

          for (const row of rows) {
            const startMs = row.time_created >= 1e12 ? row.time_created : row.time_created * 1000;
            results.push({
              command: 'opencode',
              cwd: row.directory || '',
              kind: 'interactive',
              pid: 0, // OpenCode doesn't expose per-session PIDs
              projectPath: cwdToProjectPath(row.directory || ''),
              sessionId: row.id,
              startedAt: startMs,
            });
          }
        } finally {
          db.close();
        }
      }
    } catch {
      // OpenCode DB missing or unreadable — skip silently
    }
  }

  // --- File-based providers (Codex/Gemini/Qwen/Cursor/Copilot/Amp) ---
  // None expose a PID; a recently-written session file means "live". cwd/id come
  // from each provider's reader. One loop instead of a block per provider.
  for (const { command, detect } of FILE_PROVIDER_DETECTORS) {
    try {
      for (const s of detect(FILE_PROVIDER_ACTIVE_THRESHOLD_MS)) {
        results.push({
          command,
          cwd: s.cwd,
          kind: 'interactive',
          pid: 0,
          projectPath: cwdToProjectPath(s.cwd),
          sessionId: s.id,
          startedAt: s.startedAt,
        });
      }
    } catch {
      // provider session dir missing/unreadable — skip silently
    }
  }

  // Sort by startedAt descending (most recent first)
  results.sort((a, b) => b.startedAt - a.startedAt);

  return results;
}
