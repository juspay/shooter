#!/usr/bin/env node
// Interactive setup wizard for Shooter.
// CommonJS so it runs without a build step: `node scripts/setup.cjs`

'use strict';

const readline = require('readline');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');


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

// ── Secure key generator ─────────────────────────────────────────────
// Produces a 256-bit random hex key (64 characters).
function generateSecureKey() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Globals ──────────────────────────────────────────────────────────
const ROOT = process.env.SHOOTER_PKG_ROOT || path.resolve(__dirname, '..');
const SHOOTER_HOME = process.env.SHOOTER_HOME || path.join(require('os').homedir(), '.shooter');
const DOT_ENV_PATH = path.join(SHOOTER_HOME, '.env');
const AUTO_MODE = process.argv.includes('--auto');
const PUSH_MODE = process.argv.includes('--push');

let rl; // readline interface — created in main()

// ── Auto-incrementing step counter ──────────────────────────────────
let _stepNum = 0;
let _totalSteps = 5;
function step(label) {
  _stepNum++;
  console.log(`\n${C.blue}[${_stepNum}/${_totalSteps}] ${label}${C.reset}\n`);
}

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
  console.log(dim('  Remote terminals, session viewer & push notifications'));
  console.log('');
  console.log(dim('  ─────────────────────────────────────────'));
  console.log('');
}

// ── Prerequisite checks ─────────────────────────────────────────────

function checkPrerequisites() {
  step('Checking prerequisites...');

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

// ── Collect push notification config (separate flow) ────────────────

async function collectPushConfig(config) {
  // ── iOS Push Notifications ───────────────────────────────────────
  console.log(bold('  iOS Push Notifications\n'));
  config.wantIos = await confirm('  Configure iOS push notifications?');

  if (config.wantIos) {
    console.log('');

    // APNs key (.p8) — accept file path or pasted content, with retry on invalid input
    async function askForP8Key() {
      const apnsKeyInput = await askRequired(
        `  APNS_KEY (.p8 file path or paste key): `,
        (val) => {
          if (!val) return 'APNs key is required.';
          return null;
        }
      );

      let key;

      // Check if input is a file path
      if (fs.existsSync(apnsKeyInput)) {
        try {
          key = fs.readFileSync(apnsKeyInput, 'utf-8').trim();
          console.log(green(`  Read key from ${apnsKeyInput}`));
        } catch (err) {
          console.log(red(`  Could not read file: ${err.message}`));
          process.exit(1);
        }
      } else if (apnsKeyInput.includes('BEGIN PRIVATE KEY')) {
        // User pasted inline content
        key = apnsKeyInput;
      } else {
        // Might be a partial path or multiline paste — try multiline
        console.log(yellow('  Input does not look like a file path or key.'));
        console.log(dim('  Paste the full .p8 key contents (press Enter on empty line to finish):'));
        const lines = [apnsKeyInput];
        while (true) {
          const line = await ask('');
          if (line === '') break;
          lines.push(line);
        }
        key = lines.join('\n');
      }

      if (!key.includes('BEGIN PRIVATE KEY')) {
        console.log(yellow('  Warning: File does not appear to be a valid .p8 private key.'));
        const retry = await ask(cyan('  Re-enter path? [Y/n]: '));
        if (retry.toLowerCase() !== 'n') {
          return askForP8Key(); // Recursive retry
        }
        console.log(yellow('  Skipping APNs configuration.'));
        return null;
      }

      return key;
    }

    config.apnsKey = await askForP8Key();
    if (!config.apnsKey) {
      config.wantIos = false;
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
  console.log(bold('  Android Push Notifications\n'));
  config.wantAndroid = await confirm('  Configure Android push notifications?');

  if (config.wantAndroid) {
    console.log('');
    config.fcmProjectId = await askRequired('  FCM_PROJECT_ID: ');
    config.fcmClientEmail = await askRequired('  FCM_CLIENT_EMAIL: ', validateEmail);

    const fcmKeyInput = await askRequired('  FCM_PRIVATE_KEY (file path or paste key): ');

    if (fs.existsSync(fcmKeyInput)) {
      try {
        config.fcmPrivateKey = fs.readFileSync(fcmKeyInput, 'utf-8').trim();
        console.log(green(`  Read key from ${fcmKeyInput}`));
      } catch (err) {
        console.log(red(`  Could not read file: ${err.message}`));
        process.exit(1);
      }
    } else if (fcmKeyInput.includes('BEGIN')) {
      config.fcmPrivateKey = fcmKeyInput;
    } else {
      console.log(dim('  Paste the full private key (press Enter on empty line to finish):'));
      const lines = [fcmKeyInput];
      while (true) {
        const line = await ask('');
        if (line === '') break;
        lines.push(line);
      }
      config.fcmPrivateKey = lines.join('\n');
    }

    if (!config.fcmPrivateKey.includes('BEGIN')) {
      console.log(yellow('  Warning: Key does not look like a PEM private key. Continuing anyway.'));
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
}

// ── Load existing push config from .env (preserve during non-push setup) ──

function loadExistingPushConfig(config) {
  if (!fs.existsSync(DOT_ENV_PATH)) return;
  const existing = fs.readFileSync(DOT_ENV_PATH, 'utf-8');

  const get = (key) => {
    const m = existing.match(new RegExp(`^${key}=["']?(.+?)["']?$`, 'm'));
    return m ? m[1] : '';
  };

  // Preserve iOS config if it was previously set
  const apnsKeyId = get('APNS_KEY_ID');
  if (apnsKeyId) {
    config.wantIos = true;
    // Read the raw APNS_KEY (may have escaped newlines)
    const rawApnsKey = get('APNS_KEY');
    config.apnsKey = rawApnsKey ? rawApnsKey.replace(/\\n/g, '\n') : '';
    config.apnsKeyId = apnsKeyId;
    config.apnsTeamId = get('APNS_TEAM_ID');
    config.apnsBundleId = get('APNS_BUNDLE_ID');
    config.apnsProduction = get('APNS_PRODUCTION') === 'true';
    config.deviceToken = get('DEVICE_TOKEN');
  }

  // Preserve Android config if it was previously set
  const fcmProjectId = get('FCM_PROJECT_ID');
  if (fcmProjectId) {
    config.wantAndroid = true;
    config.fcmProjectId = fcmProjectId;
    config.fcmClientEmail = get('FCM_CLIENT_EMAIL');
    const rawFcmKey = get('FCM_PRIVATE_KEY');
    config.fcmPrivateKey = rawFcmKey ? rawFcmKey.replace(/\\n/g, '\n') : '';
    config.androidDeviceToken = get('ANDROID_DEVICE_TOKEN');
  }
}

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
    step('Auto-configuring...');

    // Preserve existing API_KEY if .env already exists
    if (fs.existsSync(DOT_ENV_PATH)) {
      const existing = fs.readFileSync(DOT_ENV_PATH, 'utf-8');
      const match = existing.match(/^API_KEY=["']?(.+?)["']?$/m);
      if (match && match[1]) {
        config.apiKey = match[1];
        const maskedKey = mask(config.apiKey);
        console.log(green(`  Existing API key preserved: ${maskedKey}`));
        loadExistingPushConfig(config);
        if (config.wantIos || config.wantAndroid) {
          console.log(green('  Existing push config preserved.'));
        } else {
          console.log(dim('  Push notifications not configured (add later with "shooter setup --push")'));
        }
        console.log('');
        return config;
      }
    }

    config.apiKey = generateSecureKey();
    const maskedKey = mask(config.apiKey);
    console.log(green(`  API key generated: ${maskedKey}`));
    console.log(dim('  Push notifications not configured (add later with "shooter setup --push")'));
    console.log('');
    return config;
  }

  // ── API Key ──────────────────────────────────────────────────────
  step('Server authentication');
  const apiKeyAnswer = await ask(`  API_KEY ${dim('(press Enter to auto-generate)')}: `);
  if (apiKeyAnswer) {
    config.apiKey = apiKeyAnswer;
  } else {
    config.apiKey = generateSecureKey();
    const maskedKey = mask(config.apiKey);
    console.log(green(`  Generated API key: ${maskedKey}`));
    console.log(dim('  (Saved to ~/.shooter/.env)'));
  }
  console.log('');

  // ── Push notifications: only if --push flag or user opts in ──────
  if (PUSH_MODE) {
    // Direct push config mode — user explicitly asked for it
    step('Push notification setup');
    await collectPushConfig(config);
  } else {
    // Default: skip push, show how to add later
    // Preserve any existing push config from a previous setup
    loadExistingPushConfig(config);

    if (config.wantIos || config.wantAndroid) {
      console.log(dim('  Existing push notification config preserved.'));
      console.log(dim('  To reconfigure: shooter setup --push'));
    } else {
      console.log(dim('  Push notifications are optional and not required for the server.'));
      console.log(dim('  Terminals, sessions, and the web UI work without push config.'));
      console.log(dim(`  Add push later: ${cyan('shooter setup --push')}`));
    }
    console.log('');
  }

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
  step('Writing .env file');

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
  // Enforce secure permissions even if file already existed
  fs.chmodSync(DOT_ENV_PATH, 0o600);
  console.log(green('  .env written successfully.'));
  console.log('');
  return true;
}

// ── Build ────────────────────────────────────────────────────────────

function runBuild() {
  step('Building the project...');
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

  // Reset step counter; push mode adds one extra step
  _stepNum = 0;
  _totalSteps = (PUSH_MODE && !AUTO_MODE) ? 6 : 5;

  printBanner();

  if (PUSH_MODE) {
    console.log(bold('  Adding push notification support...\n'));
  }

  checkPrerequisites();

  const config = await collectConfig();
  await writeEnv(config);

  // API_KEY is stored in ~/.shooter/.env — hooks read it automatically
  console.log(dim('  API_KEY is stored in ~/.shooter/.env'));
  console.log(dim('  Claude Code hooks read it automatically from there.'));
  console.log('');

  const buildOk = runBuild();

  // ── Remote access info ───────────────────────────────────────────────
  step('Remote access (optional)');

  let cloudflaredAvailable = false;
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
    cloudflaredAvailable = true;
  } catch {
    // not installed
  }

  if (!cloudflaredAvailable) {
    console.log(yellow('  cloudflared not found.'));
    console.log(dim('  Install it to get a public URL for your phone:'));
    console.log(dim('  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
    console.log('');
    console.log(dim('  Once installed, run:'));
    console.log(cyan('    cloudflared tunnel --url http://localhost:54007'));
    console.log('');
  } else {
    const port = process.env.PORT || 54007;
    const startTunnel = AUTO_MODE || await confirm('  Start a Cloudflare Tunnel now to get your public URL?');
    if (startTunnel) {
      console.log(dim('\n  Starting tunnel... (this may take a few seconds)\n'));
      await new Promise((resolve) => {
        const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let urlFound = false;
        const onData = (data) => {
          const text = data.toString();
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (match && !urlFound) {
            urlFound = true;
            console.log(green('  Tunnel URL (use this on your phone):'));
            console.log(`\n  ${C.bold}${C.cyan}${match[0]}${C.reset}\n`);
            console.log(dim('  Keep this terminal session open to maintain the tunnel.'));
            console.log(dim('  For a persistent tunnel, see: https://developers.cloudflare.com/cloudflare-one/'));
            console.log('');
            resolve();
          }
        };

        cf.stdout.on('data', onData);
        cf.stderr.on('data', onData);

        cf.on('error', (err) => {
          console.log(yellow(`  Could not start tunnel: ${err.message}`));
          console.log('');
          resolve();
        });

        // Timeout after 20 seconds
        setTimeout(() => {
          if (!urlFound) {
            console.log(yellow('  Tunnel URL not received within 20 seconds.'));
            console.log(dim(`  Run manually: cloudflared tunnel --url http://localhost:${port}`));
            console.log('');
            resolve();
          }
        }, 20000);
      });
    } else {
      console.log(dim('  Run this when you need remote access:'));
      console.log(cyan(`    cloudflared tunnel --url http://localhost:${port}`));
      console.log('');
    }
  }

  // Close readline after all interactive prompts are done — otherwise stdin EOF
  // (in auto/non-interactive mode) triggers the "Setup cancelled" exit handler.
  rl.removeAllListeners('close');
  rl.close();

  if (buildOk) {
    console.log(green('  Ready to start! Run: shooter start'));
    console.log('');
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
  console.log(bold('  Your API key (enter this in the app on your phone):'));
  console.log(`\n  ${C.bold}${C.cyan}${mask(config.apiKey)}${C.reset}\n`);
  if (!config.wantIos && !config.wantAndroid) {
    console.log(bold('  Optional add-ons:'));
    console.log(`  ${dim('Push notifications:')}  ${cyan('shooter setup --push')}`);
    console.log(`  ${dim('Cloudflare Tunnel:')}   ${cyan('shooter start')} ${dim('(auto-starts tunnel)')}`);
    console.log('');
  } else {
    const platforms = [];
    if (config.wantIos) platforms.push('iOS');
    if (config.wantAndroid) platforms.push('Android');
    console.log(green(`  Push notifications: ${platforms.join(' + ')} configured`));
    console.log('');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\nSetup failed: ${err.message}`));
  if (rl) rl.close();
  process.exit(1);
});
