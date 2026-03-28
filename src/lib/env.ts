// Side-effect module: loads .env before any other imports.
// Must be imported first in server.ts.
//
// Resolution order:
// 1. $SHOOTER_HOME/.env  (if SHOOTER_HOME is set and file exists)
// 2. .env in cwd         (dotenv default)
// 3. ~/.shooter/.env     (final fallback — setup.cjs writes here)
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const shooterHome = process.env.SHOOTER_HOME || '';
const envPath = shooterHome ? join(shooterHome, '.env') : undefined;

if (envPath && existsSync(envPath)) {
  // 1. SHOOTER_HOME/.env
  config({ path: envPath });
} else {
  // 2. .env in cwd (dotenv default — only populates vars not already set)
  config();

  // 3. ~/.shooter/.env as final fallback
  const fallbackPath = join(homedir(), '.shooter', '.env');
  if (existsSync(fallbackPath)) {
    // override: false ensures cwd .env values take precedence
    config({ override: false, path: fallbackPath });
  }
}
