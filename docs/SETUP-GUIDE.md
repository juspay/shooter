# Setup and Deployment Guide

This guide covers every way to install, configure, and run the Shooter server -- from a five-minute quick start to a production-ready deployment behind a Cloudflare Tunnel.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Setup Methods Compared](#2-setup-methods-compared)
3. [Interactive Setup Wizard (`pnpm setup`)](#3-interactive-setup-wizard-pnpm-setup)
4. [One-Line Install (`curl | sh`)](#4-one-line-install-curl--sh)
5. [Docker Setup](#5-docker-setup)
6. [npm Global Install](#6-npm-global-install)
7. [Manual Setup](#7-manual-setup)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Claude Code Hooks Setup](#9-claude-code-hooks-setup)
10. [Cloudflare Tunnel](#10-cloudflare-tunnel)
11. [Auto-Start (macOS)](#11-auto-start-macos)
12. [Production Deployment](#12-production-deployment)
13. [Upgrading](#13-upgrading)
14. [Verification Checklist](#14-verification-checklist)

---

## 1. Quick Start

Five steps, five minutes. This gets a working Shooter server on your local machine.

**Prerequisites:** Node.js 20+ and pnpm.

```bash
# 1. Clone the repository
git clone https://github.com/juspay/shooter.git
cd shooter

# 2. Install dependencies
pnpm install

# 3. Run the interactive setup wizard (creates .env, builds, health-checks)
pnpm setup

# 4. Start the server
pnpm start

# 5. Verify it works
curl http://localhost:3000/api/health
```

The wizard generates your `.env` file, offers to export `API_KEY` into your shell profile, builds the project, and runs a health check against the server. When it finishes, you are ready to go.

---

## 2. Setup Methods Compared

| Method                                      | Best For                               | Installs To           | Requires               | Push-notification config  |
| ------------------------------------------- | -------------------------------------- | --------------------- | ---------------------- | ------------------------- |
| **Wizard** (`pnpm setup`)                   | First-time setup, guided experience    | Current clone         | Node 20+, pnpm         | Prompted interactively    |
| **curl installer** (`curl \| sh`)           | Fresh machines, one command            | `~/.shooter/`         | Node 20+, git          | Runs wizard after clone   |
| **Docker** (`docker compose up`)            | Isolated, reproducible environments    | Container             | Docker, Docker Compose | Via `.env` file           |
| **npm global** (`npm i -g @juspay/shooter`) | Using `shooter` as a CLI from anywhere | Global `node_modules` | Node 20+, npm          | Via `.env` in working dir |
| **Manual**                                  | Power users, custom layouts            | Wherever you choose   | Node 20+, pnpm         | Edit `.env` by hand       |

All methods produce the same running server. Choose whichever fits your workflow.

---

## 3. Interactive Setup Wizard (`pnpm setup`)

The wizard is a CommonJS Node.js script at `scripts/setup.cjs`. Run it with:

```bash
pnpm setup
# or directly:
node scripts/setup.cjs
```

### What it does, step by step

| Step                              | What happens                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Check prerequisites**        | Verifies Node.js >= 20, pnpm is installed, and `node_modules` exist (runs `pnpm install` if missing).                                                                                                       |
| **2. Server authentication**      | Asks for an `API_KEY`. Press Enter to auto-generate a 64-character hex key.                                                                                                                                 |
| **3. iOS push notifications**     | Asks whether you want iOS push. If yes, prompts for APNs `.p8` key contents, Key ID (10 chars), Team ID (10 chars), Bundle ID, Device Token (64 hex chars), and whether to use the production APNs gateway. |
| **4. Android push notifications** | Asks whether you want Android push. If yes, prompts for FCM Project ID, Client Email, service-account private key, and optionally an Android device token.                                                  |
| **5. Write `.env`**               | Generates a `.env` file from your answers. If `.env` already exists, asks before overwriting. Commented-out stubs are written for any platform you did not configure.                                       |
| **6. Shell environment**          | Detects your shell profile (`~/.zshrc`, `~/.bash_profile`, etc.) and offers to append `export API_KEY="..."`. This is required for Claude Code hooks to authenticate with the server.                       |
| **7. Build**                      | Runs `pnpm build` (SvelteKit with adapter-node).                                                                                                                                                            |
| **8. Health check**               | Starts the server temporarily, polls `http://localhost:3000/api/health` for up to 15 seconds, reports the result, then stops the server.                                                                    |

After all steps complete, the wizard prints the commands to start the server (`pnpm start`) and run in dev mode (`pnpm dev`).

### Validation

The wizard validates all inputs:

- Device tokens must be exactly 64 hex characters.
- APNs Key ID and Team ID must be exactly 10 alphanumeric characters.
- Bundle ID must follow reverse-domain format.
- FCM Client Email must contain an `@`.

If any required field is left blank, it re-prompts until a valid value is provided.

---

## 4. One-Line Install (`curl | sh`)

```bash
curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh | sh
```

### What it does

The installer is a POSIX shell script (`scripts/install.sh`) that works on macOS and Linux. It performs these steps in order:

1. **Checks prerequisites** -- git, Node.js 20+, and pnpm (offers to install pnpm via `npm install -g pnpm` if missing).
2. **Handles existing installs** -- if `~/.shooter/` already exists, offers three choices: update (git pull), fresh (delete and re-clone), or abort.
3. **Clones the repository** -- clones the `release` branch to `~/.shooter/`. If the clone fails partway through, a cleanup trap removes the partial directory.
4. **Installs dependencies** -- runs `pnpm install` inside `~/.shooter/`.
5. **Runs the setup wizard** -- executes `node scripts/setup.cjs` for guided `.env` configuration and build.
6. **Offers global command** -- asks whether to run `npm link` so you can use `shooter` from any terminal.
7. **Offers auto-start (macOS only)** -- creates a `launchd` plist so the server starts on login (see [Section 11](#11-auto-start-macos)).

### Where it installs

Everything goes into `~/.shooter/`. The `.env` file, build output, and `node_modules` all live inside this directory.

### Interactive prompts over pipe

When run via `curl | sh`, stdin is the pipe, not your terminal. The installer reads interactive answers from `/dev/tty` as a fallback, so prompts still work.

---

## 5. Docker Setup

### Start with Docker Compose

```bash
# 1. Create your .env file (copy and edit the example)
cp .env.example .env
# Edit .env with your credentials

# 2. Start the container
docker compose up -d

# 3. Verify
curl http://localhost:3000/api/health
```

### What the Dockerfile does

The Docker build uses a two-stage approach:

| Stage                           | Purpose                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **builder** (`node:20-slim`)    | Installs build tools (`python3`, `make`, `g++`) for native addons (`node-pty`, `better-sqlite3`), runs `pnpm install`, `pnpm build`, then prunes to production dependencies. |
| **production** (`node:20-slim`) | Copies built output, production `node_modules`, `server.ts`, and server-side source modules. Exposes port 3000 and runs `node --import tsx server.ts`.                       |

### docker-compose.yml details

```yaml
services:
  shooter:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env
    volumes:
      - shooter-data:/root/.shooter
    restart: unless-stopped

volumes:
  shooter-data:
```

**Key points:**

- `env_file: .env` -- all environment variables are loaded from your `.env` file.
- `shooter-data` volume -- persists SQLite database and session data across container restarts. Mounted at `/root/.shooter` inside the container.
- `restart: unless-stopped` -- the container restarts automatically if it crashes or the host reboots (unless you explicitly stop it).

### Rebuilding after changes

```bash
# Rebuild the image (e.g., after pulling new code)
docker compose build

# Rebuild and restart
docker compose up -d --build

# View logs
docker compose logs -f shooter

# Stop
docker compose down

# Stop and remove the data volume (destructive)
docker compose down -v
```

### Passing extra environment variables

You can override or add variables on the command line:

```bash
docker compose run -e PORT=4000 -e APNS_PRODUCTION=true shooter
```

---

## 6. npm Global Install

The package is published as `@juspay/shooter` with a `bin` entry pointing to `bin/shooter.cjs`.

### Install globally

```bash
npm install -g @juspay/shooter
```

### Commands available

```
shooter              Start the server (default)
shooter start        Start the server (explicit)
shooter setup        Run the interactive setup wizard
shooter version      Show version number
shooter help         Show usage information
```

### How `shooter start` works

The CLI entry point (`bin/shooter.cjs`) resolves the package root, then spawns:

```
node --import tsx server.ts
```

It inherits your stdio so you see logs directly, sets `SHOOTER_PKG_ROOT` so the server knows where its assets live, and forwards signals (`SIGTERM`, `SIGINT`, `SIGHUP`) to the child process for graceful shutdown.

### Using npx (without global install)

```bash
npx @juspay/shooter start
npx @juspay/shooter setup
```

---

## 7. Manual Setup

For power users who want full control over every step.

### 1. Clone and install

```bash
git clone https://github.com/juspay/shooter.git
cd shooter
pnpm install
```

### 2. Create the environment file

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in the required values. See [Section 8](#8-environment-variables-reference) for the full reference.

At minimum, set:

```
API_KEY=<generate with: openssl rand -hex 32>
```

For iOS push notifications, also set `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, and `DEVICE_TOKEN`.

### 3. Export API_KEY in your shell

Claude Code hooks need `API_KEY` available in your shell environment:

```bash
# Add to ~/.zshrc or ~/.bash_profile
export API_KEY="your-api-key-here"
```

Reload your shell: `source ~/.zshrc`

### 4. Build

```bash
pnpm build
```

This runs SvelteKit with `adapter-node`, outputting to `build/`. The `postbuild` script copies `pty-holder.cjs` into the build directory.

### 5. Start the server

```bash
# Production mode (uses built output)
pnpm start

# Development mode (live reload, opens browser)
pnpm dev
```

### 6. Verify

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"healthy","timestamp":"..."}
```

---

## 8. Environment Variables Reference

### Server variables (set in `.env`)

| Variable               | Required    | Default | Description                                                                                                                                                 | Example                                                             |
| ---------------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `API_KEY`              | **Yes**     | --      | Bearer token for authenticating all API requests. Used by hooks, the iOS app, and the web UI.                                                               | `a1b2c3d4e5f6...` (64 hex chars)                                    |
| `PORT`                 | No          | `3000`  | Port the server listens on.                                                                                                                                 | `3000`                                                              |
| `APNS_KEY`             | For iOS     | --      | Full contents of the APNs `.p8` private key file, including `BEGIN`/`END` markers. Newlines escaped as `\n` when stored in `.env`.                          | `"-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"` |
| `APNS_KEY_ID`          | For iOS     | --      | 10-character Key ID from the Apple Developer portal (Certificates, Identifiers & Profiles > Keys).                                                          | `ABC123DEF4`                                                        |
| `APNS_TEAM_ID`         | For iOS     | --      | 10-character Apple Developer Team ID (Membership page).                                                                                                     | `9ABCDEF012`                                                        |
| `APNS_BUNDLE_ID`       | For iOS     | --      | iOS app bundle identifier. Must match the Xcode project.                                                                                                    | `com.example.shooter`                                               |
| `APNS_PRODUCTION`      | No          | `false` | Set `true` to use the production APNs gateway (`api.push.apple.com`). Required for TestFlight and App Store builds. When `false`, uses the sandbox gateway. | `true`                                                              |
| `DEVICE_TOKEN`         | For iOS     | --      | 64-character hex token from the iOS device after push-notification registration. Tokens can rotate; always use the latest.                                  | `a1b2c3d4...` (64 hex chars)                                        |
| `DEVICE_PLATFORM`      | No          | `ios`   | Which platform to send push notifications to.                                                                                                               | `ios` or `android`                                                  |
| `FCM_PROJECT_ID`       | For Android | --      | Firebase project ID from the Firebase Console.                                                                                                              | `my-project-12345`                                                  |
| `FCM_CLIENT_EMAIL`     | For Android | --      | Service account email from the Firebase Admin SDK JSON key file.                                                                                            | `firebase-adminsdk-xxxxx@my-project.iam.gserviceaccount.com`        |
| `FCM_PRIVATE_KEY`      | For Android | --      | Service account private key (PEM format) from the Firebase Admin SDK JSON key file.                                                                         | `"-----BEGIN RSA PRIVATE KEY-----\n..."`                            |
| `ANDROID_DEVICE_TOKEN` | For Android | --      | FCM registration token from the Android device.                                                                                                             | `dGhpcyBpcyBh...`                                                   |

### Hook variables (set inline in `.claude/settings.json` or exported in shell)

| Variable                     | Required    | Default | Description                                                                                                                                                  | Example                          |
| ---------------------------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `API_KEY`                    | **Yes**     | --      | Same value as the server's `API_KEY`. Hooks expand `$API_KEY` from the shell environment.                                                                    | `a1b2c3d4e5f6...`                |
| `SHOOTER_USE_LOCAL`          | No          | `false` | When `true`, hooks send requests to `localhost` instead of a remote URL.                                                                                     | `true`                           |
| `SHOOTER_LOCAL_PORT`         | No          | `3000`  | Port to use when `SHOOTER_USE_LOCAL=true`.                                                                                                                   | `3000`                           |
| `SHOOTER_API_URL`            | Conditional | --      | Remote server URL. Required when `SHOOTER_USE_LOCAL` is not `true`. Typically the Cloudflare Tunnel URL.                                                     | `https://shooter.yourdomain.com` |
| `SHOOTER_PERMISSION_TIMEOUT` | No          | `120`   | Seconds the PermissionRequest hook polls the server before timing out. The hook timeout in `.claude/settings.json` (180s) should be higher to allow cleanup. | `120`                            |
| `SHOOTER_DEVICE_TOKEN`       | No          | --      | Override the device token for this hook invocation. If unset, the server uses `DEVICE_TOKEN` from its own `.env`.                                            | `a1b2c3d4...`                    |
| `SHOOTER_DEBUG`              | No          | `false` | When `true`, writes debug logs to `/tmp/shooter-debug.log`.                                                                                                  | `true`                           |

### How variables are loaded

**Server:** `server.ts` imports `dotenv/config` before anything else, which reads `.env` into `process.env`. SvelteKit's `$env/dynamic/private` then accesses these values.

**Hooks:** Each hook command in `.claude/settings.json` sets variables inline:

```
SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY node .claude/hooks/notifier.cjs PreToolUse
```

The `$API_KEY` reference expands from your shell environment, which is why the setup wizard offers to add `export API_KEY="..."` to your shell profile.

---

## 9. Claude Code Hooks Setup

Shooter integrates with Claude Code through lifecycle hooks. When Claude Code performs actions (tool use, permission requests, session events), it invokes the hook notifier, which sends a request to the Shooter server, which then pushes a notification to your phone.

### How hooks work

1. **Claude Code** fires a lifecycle event (e.g., `PreToolUse`, `PermissionRequest`, `Stop`).
2. The hook command in `.claude/settings.json` runs `node .claude/hooks/notifier.cjs <EventType>`.
3. Claude Code passes event data as JSON on stdin (tool name, tool input, session ID, etc.).
4. The notifier reads stdin, normalizes the event, and POSTs it to the Shooter server's `/api/notify` endpoint.
5. The server sends a push notification to your iOS or Android device.
6. For `PermissionRequest`, the notifier polls `/api/response` for up to 120 seconds waiting for an Allow/Deny response from the mobile app.

### Hook configuration file

The hooks are configured in `.claude/settings.json`. Every hook follows the same pattern:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=3000 API_KEY=$API_KEY node .claude/hooks/notifier.cjs PreToolUse"
          }
        ]
      }
    ]
  }
}
```

The `matcher` is empty (`""`), meaning all events of that type trigger the hook.

### Registered hook events

| Hook Event           | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `PreToolUse`         | Tool is about to execute (activity tracking)                                |
| `PostToolUse`        | Tool finished executing                                                     |
| `PostToolUseFailure` | Tool execution failed                                                       |
| `PermissionRequest`  | Agent needs user permission (blocks, polls for response, 180s timeout)      |
| `Notification`       | Various notification subtypes (permission prompts, idle prompts, questions) |
| `Stop`               | Agent finished responding                                                   |
| `SessionStart`       | New session started                                                         |
| `SessionEnd`         | Session terminated                                                          |
| `SubagentStart`      | Subagent spawned                                                            |
| `SubagentStop`       | Subagent finished                                                           |
| `UserPromptSubmit`   | User submitted a prompt                                                     |
| `TeammateIdle`       | Teammate is idle                                                            |
| `TaskCompleted`      | Task completed                                                              |
| `PreCompact`         | Before context compaction                                                   |

### API_KEY: the critical piece

The `API_KEY` must be available as a shell environment variable so the `$API_KEY` reference in the hook command expands correctly. Without it, every hook invocation fails with:

```
API_KEY environment variable is required
```

Verify it is set:

```bash
echo $API_KEY
# Should print your key, not be blank
```

If the setup wizard added it to your profile, open a new terminal or run `source ~/.zshrc`.

### Verify hooks are working

1. **Start the server** in one terminal:

   ```bash
   pnpm start
   ```

2. **Start Claude Code** in another terminal in a project with `.claude/settings.json` configured.

3. **Trigger a tool use** -- ask Claude Code to read a file or run a command.

4. **Check the server logs** -- you should see incoming POST requests to `/api/notify`.

5. **Check your phone** -- you should receive a push notification (if APNs/FCM is configured).

6. **Debug mode** -- if notifications are not arriving, enable debug logging:
   ```bash
   export SHOOTER_DEBUG=true
   ```
   Then check `/tmp/shooter-debug.log` after triggering a hook.

---

## 10. Cloudflare Tunnel

### Why it is needed

The Shooter server runs on your local machine. For push notifications to work when you are away from home, and for the iOS app to reach the server, the server needs a public HTTPS URL. A Cloudflare Tunnel provides this without opening ports on your router, with automatic TLS and DDoS protection.

### Install cloudflared

```bash
# macOS
brew install cloudflared

# Linux (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### Authenticate

```bash
cloudflared tunnel login
# Opens a browser to authenticate with your Cloudflare account
```

### Create a tunnel

```bash
cloudflared tunnel create shooter
# Note the tunnel ID printed (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)
```

### Configure the tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: shooter.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Replace `<your-tunnel-id>` with the ID from the create step, and `shooter.yourdomain.com` with your desired subdomain.

### Create DNS record

```bash
cloudflared tunnel route dns shooter shooter.yourdomain.com
```

This creates a CNAME record in your Cloudflare DNS pointing to the tunnel.

### Run the tunnel

```bash
# Foreground (for testing)
cloudflared tunnel run shooter

# As a macOS service (persistent)
sudo cloudflared service install
```

### Verify

```bash
curl https://shooter.yourdomain.com/api/health
# Should return: {"status":"healthy","timestamp":"..."}
```

### Using the tunnel URL with hooks

If hooks should reach the server through the tunnel (e.g., when working on a remote machine), set the remote URL:

```bash
export SHOOTER_API_URL="https://shooter.yourdomain.com"
```

And in `.claude/settings.json`, remove `SHOOTER_USE_LOCAL=true` or set it to `false`.

---

## 11. Auto-Start (macOS)

The `curl` installer offers to set this up for you. To do it manually, create a `launchd` plist.

### Create the plist

Create `~/Library/LaunchAgents/com.shooter.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.shooter.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/path/to/tsx</string>
        <string>/path/to/shooter/server.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/path/to/shooter</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/you/Library/Logs/Shooter/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/you/Library/Logs/Shooter/stderr.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

Replace the paths:

- `/path/to/tsx` -- run `which tsx` to find it (or use `~/.shooter/node_modules/.bin/tsx`).
- `/path/to/shooter` -- e.g., `/Users/you/.shooter` or wherever you cloned.
- `/Users/you/Library/Logs/Shooter/` -- create this directory: `mkdir -p ~/Library/Logs/Shooter`.

### Load the agent

```bash
# Load and start
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shooter.server.plist

# Verify it is running
launchctl print gui/$(id -u)/com.shooter.server
curl http://localhost:3000/api/health
```

### Manage the agent

```bash
# Stop
launchctl bootout gui/$(id -u)/com.shooter.server

# Restart
launchctl kickstart -k gui/$(id -u)/com.shooter.server

# View logs
tail -f ~/Library/Logs/Shooter/stdout.log
tail -f ~/Library/Logs/Shooter/stderr.log
```

### Configuration notes

- `RunAtLoad: true` -- starts the server when you log in.
- `KeepAlive > SuccessfulExit: false` -- restarts the server if it crashes (exits with a non-zero code). Does not restart if it exits cleanly (e.g., after `SIGTERM`).
- `ThrottleInterval: 10` -- waits at least 10 seconds between restart attempts to avoid a crash loop.

---

## 12. Production Deployment

### Build for production

```bash
pnpm build
```

This runs SvelteKit with `adapter-node`, which outputs a standalone Node.js server to `build/`. The `postbuild` script copies the PTY holder script into the build directory.

### Start the production server

```bash
# Using the pnpm script (recommended)
pnpm start

# Or directly with tsx
npx tsx server.ts

# Or with node (requires tsx as an import)
node --import tsx server.ts
```

### What `server.ts` does

The production entry point:

1. Loads `.env` via `dotenv/config`.
2. Creates an HTTP server wrapping the SvelteKit request handler (`build/handler.js`).
3. Creates a WebSocket server in `noServer` mode and handles HTTP upgrade requests with ticket-based authentication.
4. Wires up the PTY manager (terminal sessions), session watcher (JSONL file monitoring), and OpenCode watcher.
5. Starts keepalive pings (30-second interval, keeps Cloudflare Tunnel connections alive).
6. Listens on the configured `PORT` (default 3000).
7. Handles graceful shutdown on `SIGTERM`/`SIGINT`: stops keepalive, disconnects terminals, stops watchers, closes WebSocket and HTTP servers.

### Environment for production

Set these in your `.env` or system environment:

```bash
NODE_ENV=production
PORT=3000
API_KEY=<your-key>
# Plus APNs/FCM variables as needed
```

### Running behind a reverse proxy

The server is designed to run behind a Cloudflare Tunnel (see [Section 10](#10-cloudflare-tunnel)). If using another reverse proxy (nginx, Caddy), ensure:

- WebSocket upgrade headers are forwarded (`Connection: Upgrade`, `Upgrade: websocket`).
- The proxy timeout is at least 120 seconds (for the PermissionRequest polling flow).
- The `X-Forwarded-For` and `X-Forwarded-Proto` headers are passed through.

---

## 13. Upgrading

### From a git clone

```bash
cd /path/to/shooter

# Pull latest changes
git pull origin release

# Install any new or changed dependencies
pnpm install

# Rebuild
pnpm build

# Restart the server
pnpm start
```

If you use the launchd auto-start:

```bash
launchctl kickstart -k gui/$(id -u)/com.shooter.server
```

### From the curl installer

If Shooter is installed to `~/.shooter/`, re-run the installer and choose option 1 (Update):

```bash
curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh | sh
# Choose: 1) Update
```

This runs `git pull --rebase`, reinstalls dependencies, and rebuilds.

### From npm global

```bash
npm update -g @juspay/shooter
```

### Docker

```bash
cd /path/to/shooter

# Pull latest code
git pull origin release

# Rebuild and restart the container
docker compose up -d --build
```

### Breaking changes

Check the release notes before upgrading. If environment variables have changed:

1. Compare your `.env` against the latest `.env.example`.
2. Run `pnpm setup` to re-run the wizard (it will ask before overwriting `.env`).
3. Restart the server after any `.env` changes.

---

## 14. Verification Checklist

After setup, walk through each check to confirm everything is working end to end.

### Server health

```bash
curl http://localhost:3000/api/health
```

**Expected:** `{"status":"healthy","timestamp":"..."}` if push notifications are configured, or `{"status":"degraded","timestamp":"..."}` if APNs/FCM credentials are missing. Both mean the server is running.

For detailed diagnostics (requires authentication):

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/health?details=true"
```

This returns which checks pass (`hasApiKey`, `hasAPNsConfig`, `hasBundleId`, `hasDeviceToken`, `hasFCMConfig`) and the current configuration summary.

### Web UI

Open your browser to:

```
http://localhost:3000
```

You should see the Shooter dashboard. Navigate to `/config` to review the server's current configuration state.

### Hooks (Claude Code integration)

1. Start the Shooter server (`pnpm start`).
2. Open a terminal in a project that has `.claude/settings.json` configured with Shooter hooks.
3. Start Claude Code and ask it to perform an action that uses a tool (e.g., "read the file package.json").
4. Watch the server logs -- you should see `POST /api/notify` requests arriving.
5. If push notifications are configured, check your phone for the notification.

If nothing happens, verify:

- `echo $API_KEY` prints your key (not blank).
- The server is running on the port specified in `SHOOTER_LOCAL_PORT`.
- `SHOOTER_USE_LOCAL=true` is set in the hook command.

### Push notifications

Send a test notification directly:

```bash
curl -X POST http://localhost:3000/api/notify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "body": "If you see this on your phone, push is working.",
    "category": "test"
  }'
```

**Expected:** HTTP 200 and a notification appears on your iOS/Android device.

If the notification does not arrive:

- Check `curl http://localhost:3000/api/health?details=true` (with auth) to verify APNs/FCM configuration.
- Confirm `APNS_PRODUCTION` matches your iOS build (sandbox for Xcode, `true` for TestFlight/App Store).
- Verify `DEVICE_TOKEN` is current (tokens can rotate).

### Terminal (remote shell)

1. Open the web UI at `http://localhost:3000/terminals`.
2. Create a new terminal session.
3. You should see a live terminal emulator in the browser.
4. Type a command (e.g., `ls`) and confirm output appears.

### Session viewer

1. Ensure you have at least one Claude Code or OpenCode session in progress or completed.
2. Open `http://localhost:3000` and navigate to a session.
3. The session viewer should display the conversation history with messages rendered.
4. For live sessions, new messages should appear in real time via WebSocket streaming.

---

## Further Reading

- `docs/GUIDANCE.md` -- Development guide, code organization, type system
- `docs/CLAUDE-CODE-INTEGRATION.md` -- Detailed hook integration documentation
- `docs/ENVIRONMENT.md` -- Additional environment variable context
- `docs/TERMINAL-ACCESS.md` -- Terminal subsystem architecture
- `docs/API-REFERENCE.md` -- API endpoint documentation
