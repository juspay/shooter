#!/usr/bin/env node
// Interactive setup wizard for Shooter.
// CommonJS so it runs without a build step: `node scripts/setup.cjs`

'use strict';

const readline = require('readline');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ── ANSI helpers ─────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function bold(s) {
  return `${C.bold}${s}${C.reset}`;
}
function green(s) {
  return `${C.green}${s}${C.reset}`;
}
function red(s) {
  return `${C.red}${s}${C.reset}`;
}
function yellow(s) {
  return `${C.yellow}${s}${C.reset}`;
}
function cyan(s) {
  return `${C.cyan}${s}${C.reset}`;
}
function dim(s) {
  return `${C.dim}${s}${C.reset}`;
}
function mask(secret) {
  return secret.slice(0, 4) + '****';
}

// Escapes characters that have special meaning inside double-quoted
// shell strings: backslash, double-quote, dollar sign, and backtick.
function escapeForDoubleQuotedShell(s) {
  return s.replace(/[\\"$`]/g, '\\$&');
}

// ── Globals ──────────────────────────────────────────────────────────
const ROOT = process.env.SHOOTER_PKG_ROOT || path.resolve(__dirname, '..');
const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(require('os').homedir(), '.shooter');
const DOT_ENV_PATH = path.join(SHOOTER_HOME, '.env');
const AUTO_MODE = process.argv.includes('--auto');

let rl; // readline interface — created in main()

// ── Readline helpers ─────────────────────────────────────────────────

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function confirm(question) {
  const answer = await ask(`${question} ${dim('(y/n)')} `);
  return /^y(es)?$/i.test(answer);
}

async function askRequired(question, validator) {
  while (true) {
    const answer = await ask(question);
    if (!answer) {
      console.log(red('  This field is required.'));
      continue;
    }
    if (validator) {
      const err = validator(answer);
      if (err) {
        console.log(red(`  ${err}`));
        continue;
      }
    }
    return answer;
  }
}

async function askMultiline(prompt) {
  console.log(cyan(prompt));
  console.log(dim('  Paste the content, then press Enter on an empty line to finish:'));
  const lines = [];
  while (true) {
    const line = await ask('');
    if (line === '') break;
    lines.push(line);
  }
  return lines.join('\n');
}

// ── Banner ───────────────────────────────────────────────────────────

function printBanner() {
  console.log('');
  console.log(`${C.cyan}${C.bold}  ____  _                 _            `);
  console.log(`${C.cyan}${C.bold} / ___|| |__   ___   ___ | |_ ___ _ __ `);
  console.log(`${C.cyan}${C.bold} \\___ \\| '_ \\ / _ \\ / _ \\| __/ _ \\ '__|`);
  console.log(`${C.cyan}${C.bold}  ___) | | | | (_) | (_) | ||  __/ |   `);
  console.log(`${C.cyan}${C.bold} |____/|_| |_|\\___/ \\___/ \\__\\___|_|   ${C.reset}`);
  console.log('');
  console.log(bold('  Interactive Setup Wizard'));
  console.log(dim('  Push notifications for your coding sessions'));
  console.log('');
  console.log(dim('  ─────────────────────────────────────────'));
  console.log('');
}

// ── Prerequisite checks ─────────────────────────────────────────────

function checkPrerequisites() {
  console.log(bold('1. Checking prerequisites...\n'));

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major < 20) {
    console.log(red(`  Node.js >= 20 required, found v${nodeVersion}`));
    process.exit(1);
  }
  console.log(green(`  Node.js v${nodeVersion}`));

  // pnpm check — soft (installer or CLI handle pnpm resolution)
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
    console.log(green(`  pnpm v${pnpmVersion}`));
  } catch {
    console.log(yellow('  pnpm not found globally (will use local or corepack)'));
  }

  // dependencies installed?
  const nodeModules = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.log(yellow('  node_modules not found — running pnpm install...'));
    try {
      execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' });
      console.log(green('  Dependencies installed.'));
    } catch {
      console.log(red('  pnpm install failed. Please run it manually.'));
      process.exit(1);
    }
  } else {
    console.log(green('  Dependencies installed'));
  }

  console.log('');
}

// ── Validators ───────────────────────────────────────────────────────

function validateDeviceToken(token) {
  if (!/^[0-9a-fA-F]{64}$/.test(token)) {
    return 'Device token must be exactly 64 hexadecimal characters.';
  }
  return null;
}

function validateAPNsKeyId(id) {
  if (!/^[A-Z0-9]{10}$/.test(id)) {
    return 'APNs Key ID must be exactly 10 alphanumeric characters.';
  }
  return null;
}

function validateTeamId(id) {
  if (!/^[A-Z0-9]{10}$/.test(id)) {
    return 'Team ID must be exactly 10 alphanumeric characters.';
  }
  return null;
}

function validateBundleId(id) {
  if (!/^[a-zA-Z][a-zA-Z0-9.-]*$/.test(id)) {
    return 'Bundle ID should follow reverse-domain format (e.g. com.example.app).';
  }
  return null;
}

function validateEmail(email) {
  if (!email.includes('@')) {
    return 'Must be a valid email address.';
  }
  return null;
}

// ── Collect configuration ────────────────────────────────────────────

async function collectConfig() {
  const config = {
    apiKey: '',
    // iOS APNs
    wantIos: false,
    apnsKey: '',
    apnsKeyId: '',
    apnsTeamId: '',
    apnsBundleId: '',
    apnsProduction: false,
    deviceToken: '',
    // Android FCM
    wantAndroid: false,
    fcmProjectId: '',
    fcmClientEmail: '',
    fcmPrivateKey: '',
    androidDeviceToken: '',
  };

  // ── Auto mode: reuse existing key or generate new, skip push config ──
  if (AUTO_MODE) {
    console.log(bold('2. Auto-configuring...\n'));

    // Preserve existing API_KEY if .env already exists
    if (fs.existsSync(DOT_ENV_PATH)) {
      const existing = fs.readFileSync(DOT_ENV_PATH, 'utf-8');
      const match = existing.match(/^API_KEY=(.+)$/m);
      if (match && match[1]) {
        config.apiKey = match[1];
        const masked = mask(config.apiKey);
        console.log(green(`  Existing API key preserved: ${masked}`));
        console.log(dim('  Push notifications skipped (run "shooter setup" to configure later)'));
        console.log('');
        return config;
      }
    }

    config.apiKey = crypto.randomBytes(32).toString('hex');
    const maskedKey = mask(config.apiKey);
    console.log(green(`  API key generated: ${maskedKey}`));
    console.log(dim('  Push notifications skipped (run "shooter setup" to configure later)'));
    console.log('');
    return config;
  }

  // ── API Key ──────────────────────────────────────────────────────
  console.log(bold('2. Server authentication\n'));
  const apiKeyAnswer = await ask(`  API_KEY ${dim('(press Enter to auto-generate)')}: `);
  if (apiKeyAnswer) {
    config.apiKey = apiKeyAnswer;
  } else {
    config.apiKey = crypto.randomBytes(32).toString('hex');
    const maskedGenerated = mask(config.apiKey);
    console.log(green(`  Generated: ${maskedGenerated} (saved to .env)`));
  }
  console.log('');

  // ── iOS Push Notifications ───────────────────────────────────────
  console.log(bold('3. iOS Push Notifications\n'));
  config.wantIos = await confirm('  Do you want iOS push notifications?');

  if (config.wantIos) {
    console.log('');

    // APNs key (.p8)
    config.apnsKey = await askMultiline('  APNS_KEY (.p8 private key contents):');
    if (!config.apnsKey.includes('BEGIN PRIVATE KEY')) {
      console.log(yellow('  Warning: Key does not look like a .p8 file. Continuing anyway.'));
    }
    console.log('');

    config.apnsKeyId = await askRequired(
      '  APNS_KEY_ID (10-char key identifier): ',
      validateAPNsKeyId
    );
    config.apnsTeamId = await askRequired(
      '  APNS_TEAM_ID (10-char team identifier): ',
      validateTeamId
    );
    config.apnsBundleId = await askRequired(
      '  APNS_BUNDLE_ID (e.g. com.example.shooter): ',
      validateBundleId
    );
    config.deviceToken = await askRequired(
      '  DEVICE_TOKEN (64-char hex from iOS device): ',
      validateDeviceToken
    );

    console.log('');
    config.apnsProduction = await confirm(
      '  Use production APNs gateway? (use "yes" for TestFlight/App Store)'
    );
  }
  console.log('');

  // ── Android Push Notifications ───────────────────────────────────
  console.log(bold('4. Android Push Notifications\n'));
  config.wantAndroid = await confirm('  Do you want Android push notifications?');

  if (config.wantAndroid) {
    console.log('');
    config.fcmProjectId = await askRequired('  FCM_PROJECT_ID: ');
    config.fcmClientEmail = await askRequired('  FCM_CLIENT_EMAIL: ', validateEmail);

    config.fcmPrivateKey = await askMultiline('  FCM_PRIVATE_KEY (service account private key):');
    if (!config.fcmPrivateKey.includes('BEGIN')) {
      console.log(
        yellow('  Warning: Key does not look like a PEM private key. Continuing anyway.')
      );
    }
    console.log('');

    const androidTokenAnswer = await ask(
      `  ANDROID_DEVICE_TOKEN ${dim('(optional, press Enter to skip)')}: `
    );
    if (androidTokenAnswer) {
      config.androidDeviceToken = androidTokenAnswer;
    }
  }
  console.log('');

  return config;
}

// ── Write .env ───────────────────────────────────────────────────────

function buildEnvContent(config) {
  const lines = [
    '# Generated by Shooter setup wizard',
    `# ${new Date().toISOString()}`,
    '',
    '# Authentication',
    `API_KEY="${escapeForDoubleQuotedShell(config.apiKey)}"`,
    '',
  ];

  // iOS / APNs
  lines.push('# Apple Push Notification Service');
  if (config.wantIos) {
    // Escape the key for .env — newlines become literal \n inside double quotes
    const escapedKey = config.apnsKey.replace(/\n/g, '\\n');
    lines.push(`APNS_KEY="${escapedKey}"`);
    lines.push(`APNS_KEY_ID=${config.apnsKeyId}`);
    lines.push(`APNS_TEAM_ID=${config.apnsTeamId}`);
    lines.push(`APNS_BUNDLE_ID=${config.apnsBundleId}`);
    lines.push(`APNS_PRODUCTION=${config.apnsProduction}`);
    lines.push('');
    lines.push('# iOS Device');
    lines.push(`DEVICE_TOKEN=${config.deviceToken}`);
  } else {
    lines.push('# (not configured — run setup again to enable)');
    lines.push('# APNS_KEY=');
    lines.push('# APNS_KEY_ID=');
    lines.push('# APNS_TEAM_ID=');
    lines.push('# APNS_BUNDLE_ID=');
    lines.push('# APNS_PRODUCTION=false');
    lines.push('# DEVICE_TOKEN=');
  }
  lines.push('');

  // Platform preference
  if (config.wantIos && config.wantAndroid) {
    lines.push('# Device platform (ios or android)');
    lines.push('DEVICE_PLATFORM=ios');
  } else if (config.wantAndroid) {
    lines.push('DEVICE_PLATFORM=android');
  } else {
    lines.push('DEVICE_PLATFORM=ios');
  }
  lines.push('');

  // Android / FCM
  lines.push('# Firebase Cloud Messaging (Android)');
  if (config.wantAndroid) {
    lines.push(`FCM_PROJECT_ID=${config.fcmProjectId}`);
    lines.push(`FCM_CLIENT_EMAIL=${config.fcmClientEmail}`);
    const escapedFcmKey = config.fcmPrivateKey.replace(/\n/g, '\\n');
    lines.push(`FCM_PRIVATE_KEY="${escapedFcmKey}"`);
    if (config.androidDeviceToken) {
      lines.push(`ANDROID_DEVICE_TOKEN=${config.androidDeviceToken}`);
    } else {
      lines.push('# ANDROID_DEVICE_TOKEN=');
    }
  } else {
    lines.push('# (not configured — run setup again to enable)');
    lines.push('# FCM_PROJECT_ID=');
    lines.push('# FCM_CLIENT_EMAIL=');
    lines.push('# FCM_PRIVATE_KEY=');
    lines.push('# ANDROID_DEVICE_TOKEN=');
  }
  lines.push('');

  // Server
  lines.push('# Server');
  lines.push('# PORT=54007');
  lines.push('');

  return lines.join('\n') + '\n';
}

async function writeEnv(config) {
  console.log(bold('5. Writing .env file\n'));

  if (fs.existsSync(DOT_ENV_PATH) && !AUTO_MODE) {
    const overwrite = await confirm('  .env already exists. Overwrite it?');
    if (!overwrite) {
      console.log(yellow('  Skipped .env — keeping existing file.'));
      console.log('');
      return false;
    }
  }

  const content = buildEnvContent(config);

  // Ensure ~/.shooter/ directory exists
  const envDir = path.dirname(DOT_ENV_PATH);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(DOT_ENV_PATH, content, { mode: 0o600 });
  console.log(green('  .env written successfully.'));
  console.log('');
  return true;
}

// ── Shell profile export ─────────────────────────────────────────────

function detectShellProfile() {
  const home = require('os').homedir();
  const shell = process.env.SHELL || '';

  if (shell.endsWith('/zsh')) {
    return path.join(home, '.zshrc');
  }
  if (shell.endsWith('/bash')) {
    // macOS uses .bash_profile for login shells; Linux uses .bashrc
    const bashProfile = path.join(home, '.bash_profile');
    if (fs.existsSync(bashProfile)) return bashProfile;
    return path.join(home, '.bashrc');
  }
  // Fallback for other shells
  return path.join(home, '.profile');
}

async function offerShellExport(apiKey) {
  console.log(bold('6. Shell environment\n'));

  const profilePath = detectShellProfile();
  const profileName = path.basename(profilePath);

  // Check if export already exists
  if (fs.existsSync(profilePath)) {
    const contents = fs.readFileSync(profilePath, 'utf-8');
    if (contents.includes('export API_KEY=')) {
      console.log(green(`  export API_KEY is already in ~/${profileName}`));
      console.log('');
      return;
    }
  }

  console.log(dim('  The Claude Code hooks need API_KEY in your shell environment.'));
  const shouldAdd = AUTO_MODE || await confirm(`  Add 'export API_KEY=...' to ~/${profileName}?`);

  if (shouldAdd) {
    const exportLine = `\nexport API_KEY="${escapeForDoubleQuotedShell(apiKey)}"\n`;
    fs.appendFileSync(profilePath, exportLine, 'utf-8');
    console.log(green(`  Added to ~/${profileName}`));
    console.log(
      yellow(`  Run ${cyan(`source ~/${profileName}`)} or open a new terminal for hooks to work.`)
    );
  } else {
    console.log(
      yellow('  Skipped. You will need to set API_KEY manually for hooks to authenticate.')
    );
    console.log(dim(`  Add this to your shell profile:  export API_KEY="<your key from .env>"`));
  }
  console.log('');
}

// ── Build ────────────────────────────────────────────────────────────

function runBuild() {
  console.log(bold('7. Building the project...\n'));
  try {
    execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' });
    console.log('');
    console.log(green('  Build succeeded.'));
    console.log('');
    return true;
  } catch {
    console.log('');
    console.log(red('  Build failed. Check the errors above.'));
    console.log(dim('  You can retry with: pnpm build'));
    console.log('');
    return false;
  }
}

// ── Health check ─────────────────────────────────────────────────────

function testHealth() {
  return new Promise((resolve) => {
    console.log(bold('9. Testing server health...\n'));

    const port = process.env.PORT || 54007;
    let serverProcess;
    let resolved = false;

    function finish(ok, msg) {
      if (resolved) return;
      resolved = true;
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
      if (ok) {
        console.log(green(`  ${msg}`));
      } else {
        console.log(yellow(`  ${msg}`));
      }
      console.log('');
      resolve(ok);
    }

    // Start the server
    serverProcess = spawn('node', ['--import', 'tsx', 'server.ts'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, PORT: port.toString(), SHOOTER_HOME, SHOOTER_PKG_ROOT: ROOT },
    });

    serverProcess.on('error', (err) => {
      finish(false, `Could not start server: ${err.message}`);
    });

    serverProcess.on('exit', (code) => {
      if (!resolved) {
        finish(false, `Server exited unexpectedly (code ${code}).`);
      }
    });

    // Capture stderr/stdout for "listening" signal; try health after delay
    let output = '';
    const collectOutput = (data) => {
      output += data.toString();
    };
    serverProcess.stdout.on('data', collectOutput);
    serverProcess.stderr.on('data', collectOutput);

    // Give the server up to 15 seconds to start, polling every second
    let attempts = 0;
    const maxAttempts = 15;

    const poll = setInterval(() => {
      attempts++;
      if (resolved) {
        clearInterval(poll);
        return;
      }
      if (attempts > maxAttempts) {
        clearInterval(poll);
        finish(
          false,
          'Server did not respond within 15 seconds. You can test manually with: curl http://localhost:' +
            port +
            '/api/health'
        );
        return;
      }

      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          clearInterval(poll);
          try {
            const data = JSON.parse(body);
            if (data.status === 'healthy') {
              finish(true, `Health check passed: status=${data.status}`);
            } else {
              finish(
                true,
                `Server running (status=${data.status}). Some optional features may need configuration.`
              );
            }
          } catch {
            finish(true, 'Server responded but health response was not JSON.');
          }
        });
      });
      req.on('error', () => {
        // Server not ready yet — will retry
      });
      req.setTimeout(2000, () => req.destroy());
    }, 1000);
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Graceful Ctrl+C
  rl.on('close', () => {
    console.log('\n');
    console.log(yellow('Setup cancelled.'));
    process.exit(0);
  });

  process.on('SIGINT', () => {
    rl.close();
  });

  printBanner();
  checkPrerequisites();

  const config = await collectConfig();
  await writeEnv(config);
  await offerShellExport(config.apiKey);

  const buildOk = runBuild();

  // ── Remote access info ───────────────────────────────────────────────
  console.log(bold('8. Remote access (optional)\n'));
  console.log(dim('  To access Shooter from your phone outside your local network,'));
  console.log(dim('  you\'ll need a Cloudflare Tunnel (or similar):\n'));
  console.log(cyan('    cloudflared tunnel --url http://localhost:54007\n'));
  console.log(dim('  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n'));
  console.log(dim('  Without a tunnel, Shooter is only accessible on your local network.'));
  console.log('');

  if (buildOk) {
    await testHealth();
  }

  // ── Done ───────────────────────────────────────────────────────────
  console.log(dim('  ─────────────────────────────────────────'));
  console.log('');
  const port = process.env.PORT || 54007;
  console.log(green(bold('  Setup complete!')));
  console.log('');
  console.log(`  Start the server:  ${cyan('shooter start')}`);
  console.log(`  Open in browser:   ${cyan(`http://localhost:${port}`)}`);
  console.log(`  Health check:      ${cyan(`curl http://localhost:${port}/api/health`)}`);
  console.log('');
  if (!config.wantIos && !config.wantAndroid) {
    console.log(yellow('  Note: No push notification platform was configured.'));
    console.log(dim('  Run shooter setup again to add iOS or Android push notifications.'));
    console.log('');
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\nSetup failed: ${err.message}`));
  if (rl) rl.close();
  process.exit(1);
});
