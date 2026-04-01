import * as path from 'path';

/**
 * Resolve the path to the OpenCode SQLite database.
 *
 * Checks in this order:
 * 1. XDG_DATA_HOME/opencode/opencode.db (honours XDG override)
 * 2. ~/Library/Application Support/opencode/opencode.db (legacy macOS path)
 * 3. ~/.local/share/opencode/opencode.db (XDG default)
 */
export function resolveOpenCodeDbPath(): string {
  const home = process.env.HOME || '';

  // 1. If XDG_DATA_HOME is explicitly set, use it
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db');
  }

  // 2. Legacy macOS path (~/Library/Application Support/opencode/)
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'opencode', 'opencode.db');
  }

  // 3. XDG default (~/.local/share/opencode/)
  return path.join(home, '.local', 'share', 'opencode', 'opencode.db');
}
