import { readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedProcess {
  command: 'claude' | 'opencode';
  cwd: string;
  kind: string;
  pid: number;
  projectPath: string;
  sessionId: string;
  startedAt: number;
}

interface ClaudeSessionFile {
  cwd: string;
  entrypoint: string;
  kind: string;
  pid: number;
  sessionId: string;
  startedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a cwd path to the Claude Code project directory format. */
function cwdToProjectPath(cwd: string): string {
  return cwd.replace(/\//g, '-');
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

/**
 * Scan ~/.claude/sessions/*.json to find running Claude Code processes.
 * Each file is named <PID>.json and contains:
 *   { pid, sessionId, cwd, startedAt, kind, entrypoint }
 *
 * For each file we verify the PID is still alive via process.kill(pid, 0).
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

  // Sort by startedAt descending (most recent first)
  results.sort((a, b) => b.startedAt - a.startedAt);

  // TODO: Add OpenCode process detection (check running opencode processes or query SQLite DB)

  return results;
}
