import { homedir } from 'os';
import { join } from 'path';

/**
 * The Shooter data directory — the SQLite DB and engine/permission state live here.
 *
 * Honors `SHOOTER_HOME` so an isolated instance (a test server, or a second server run alongside
 * the user's daemon) keeps its DB/state separate from the default `~/.shooter` instead of sharing
 * it (which would let one server's `reconnectAll()` adopt the other's live terminals). This matches
 * the CLI (`bin/shooter.cjs`) and the env loader (`env.ts`), which already treat `SHOOTER_HOME` as
 * the data dir. When unset, falls back to `~/.shooter`.
 */
export function shooterDataDir(): string {
  const override = process.env.SHOOTER_HOME?.trim();
  return override && override.length > 0 ? override : join(homedir(), '.shooter');
}
