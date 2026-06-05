import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Resolve the path to the OpenCode SQLite database.
 *
 * Probes candidate locations and returns the first that EXISTS (the previous
 * version returned the macOS path unconditionally on darwin, which hid the DB
 * for installs that use the XDG ~/.local/share path — observed in the wild).
 * Candidate order:
 * 1. XDG_DATA_HOME/opencode/opencode.db (honours XDG override)
 * 2. ~/.local/share/opencode/opencode.db (XDG default — common even on macOS)
 * 3. ~/Library/Application Support/opencode/opencode.db (legacy macOS path)
 */
export function resolveOpenCodeDbPath(): string {
  const home = process.env.HOME || '';
  const candidates: string[] = [];

  if (process.env.XDG_DATA_HOME) {
    candidates.push(path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db'));
  }
  candidates.push(path.join(home, '.local', 'share', 'opencode', 'opencode.db'));
  if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // None exist yet — return the preferred default; callers tolerate a missing file.
  return candidates[0] ?? path.join(home, '.local', 'share', 'opencode', 'opencode.db');
}
