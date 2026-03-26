// Side-effect module: loads .env before any other imports.
// Must be imported first in server.ts.
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const shooterHome = process.env.SHOOTER_HOME || '';
const envPath = shooterHome ? join(shooterHome, '.env') : undefined;

if (envPath && existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}
