# Deployment Guide

This document covers local development, production builds, Cloudflare Tunnel setup, auto-start with launchd, and troubleshooting.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Production Build and Run](#production-build-and-run)
- [Environment Variables](#environment-variables)
- [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup)
- [launchd Auto-Start (macOS)](#launchd-auto-start-macos)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0 (npm and yarn are blocked)
- **Apple Developer Account** with Push Notifications capability
- **Cloudflare account** (for public HTTPS/WSS access)
- **Xcode** (for building the iOS app)

Install dependencies:

```bash
pnpm install
```

---

## Local Development

The dev server runs via Vite with hot module replacement:

```bash
pnpm run dev
```

This starts the SvelteKit development server on **port 5173** (default Vite port) and opens a browser window automatically.

In development mode:

- API endpoints are available at `http://localhost:5173/api/*`
- UI pages are available at `http://localhost:5173/`
- Changes to `.svelte`, `.ts`, and `.css` files trigger hot reload
- The WebSocket server from `server.ts` is **not** active in dev mode (Vite uses its own dev server)

To run type checks while developing:

```bash
pnpm run check
```

To run all validation (format, lint, typecheck):

```bash
pnpm run validate
```

---

## Production Build and Run

### Build

```bash
pnpm run build
```

This compiles the SvelteKit application using `adapter-node`, producing output in the `build/` directory.

### Run

```bash
pnpm start
```

This executes `tsx server.ts`, which:

1. Loads `.env` via `dotenv/config`
2. Creates an HTTP server wrapping the SvelteKit handler
3. Attaches a WebSocket server for terminal I/O, session streaming, and events
4. Starts keepalive pings (30-second interval for Cloudflare Tunnel)
5. Listens on the configured port (default **3000**)

The production server runs as a single long-lived Node.js process. Terminal sessions, WebSocket connections, and pending requests are held in memory.

### Verify

```bash
curl http://localhost:3000/api/health
```

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

See [`docs/ENVIRONMENT.md`](./ENVIRONMENT.md) for the complete reference table of all environment variables.

### Minimum Required for Production

| Variable         | Purpose                       |
| ---------------- | ----------------------------- |
| `API_KEY`        | Bearer token for all API auth |
| `APNS_KEY`       | APNs .p8 private key contents |
| `APNS_KEY_ID`    | APNs key identifier           |
| `APNS_TEAM_ID`   | Apple Developer Team ID       |
| `APNS_BUNDLE_ID` | iOS app bundle identifier     |
| `DEVICE_TOKEN`   | Target iOS device push token  |

### Hook Environment

The Claude Code hooks (`notifier.cjs`) use their own set of environment variables, configured inline in `.claude/settings.json`:

| Variable                     | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `API_KEY`                    | Auth token for hook-to-server calls      |
| `SHOOTER_USE_LOCAL`          | Route hooks to local server (`true`)     |
| `SHOOTER_LOCAL_PORT`         | Local server port (default `3000`)       |
| `SHOOTER_API_URL`            | Remote server URL (when not using local) |
| `SHOOTER_PERMISSION_TIMEOUT` | Permission poll timeout in seconds       |

---

## Cloudflare Tunnel Setup

Cloudflare Tunnel provides public HTTPS and WSS access to the local server without exposing ports or managing TLS certificates.

### 1. Install cloudflared

```bash
brew install cloudflared
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser to authorize your Cloudflare account and stores credentials at `~/.cloudflared/cert.pem`.

### 3. Create a Tunnel

```bash
cloudflared tunnel create shooter
```

Note the tunnel UUID printed in the output. A credentials file is created at `~/.cloudflared/<TUNNEL_UUID>.json`.

### 4. Configure DNS

```bash
cloudflared tunnel route dns shooter shooter.yourdomain.com
```

Replace `shooter.yourdomain.com` with your desired subdomain. This creates a CNAME record pointing to your tunnel.

### 5. Create Configuration File

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: shooter.yourdomain.com
    service: http://localhost:3000
    originRequest:
      # WebSocket support is enabled by default in cloudflared.
      # These settings tune connection behavior:
      connectTimeout: 30s
      noTLSVerify: false
  - service: http_status:404
```

Key points:

- The `service` URL must point to the port your production server listens on (default **3000**)
- WebSocket connections (`/ws/*`) are proxied automatically
- The catch-all `http_status:404` rule is required by cloudflared

### 6. Run the Tunnel

```bash
cloudflared tunnel run shooter
```

### 7. Verify

```bash
curl https://shooter.yourdomain.com/api/health
```

---

## launchd Auto-Start (macOS)

Use launchd to start the Shooter server automatically on login.

### 1. Generate the plist

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
        <string>/opt/homebrew/bin/node</string>
        <string>/opt/homebrew/bin/tsx</string>
        <string>server.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/sachinsharma/Developer/Personal/shooter</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/shooter-server.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/shooter-server.err</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

Adjust the `ProgramArguments` paths to match your system. Find them with:

```bash
which node
which tsx
```

Note: The `.env` file is loaded by `dotenv/config` in `server.ts`, so environment variables defined in `.env` do not need to be duplicated in the plist.

### 2. Load the Service

```bash
launchctl load ~/Library/LaunchAgents/com.shooter.server.plist
```

### 3. Check Status

```bash
launchctl list | grep com.shooter.server
```

A running service shows a PID in the first column. A `-` indicates it is not running.

### 4. View Logs

```bash
# stdout
tail -f /tmp/shooter-server.log

# stderr
tail -f /tmp/shooter-server.err
```

### 5. Stop / Unload

```bash
launchctl unload ~/Library/LaunchAgents/com.shooter.server.plist
```

### 6. Auto-Start Cloudflare Tunnel (Optional)

You can also create a launchd plist for cloudflared. Alternatively, use the built-in service installer:

```bash
cloudflared service install
```

This creates and loads a launchd plist for the tunnel automatically.

---

## Troubleshooting

### node-pty Build Failures

The `node-pty` native module must be compiled for your Node.js version. If you see build errors after a Node.js upgrade:

```bash
pnpm rebuild node-pty
```

If that fails, try a clean reinstall:

```bash
rm -rf node_modules
pnpm install
```

Ensure you have Xcode Command Line Tools installed:

```bash
xcode-select --install
```

### Port Already in Use

If port 3000 is occupied when starting the production server:

```bash
lsof -ti:3000 | xargs kill
```

Then start the server again:

```bash
pnpm start
```

To use a different port, set the `PORT` environment variable:

```bash
PORT=3001 pnpm start
```

### WebSocket 401 Unauthorized Errors

WebSocket connections require a valid auth ticket. A 401 on upgrade means the ticket is missing or invalid.

Common causes:

1. **`API_KEY` not set in shell** -- The hooks and API clients need this variable to obtain tickets. Verify it is exported:

   ```bash
   echo $API_KEY
   ```

   If empty, set it in your shell profile (`~/.zshrc`):

   ```bash
   export API_KEY="your-api-key-here"
   ```

2. **`API_KEY` mismatch** -- The server validates tickets against `API_KEY` from `.env`. Make sure the hook `API_KEY` and server `API_KEY` contain the same value.

3. **Ticket expired** -- Tickets are single-use and short-lived. If the connection was delayed, request a new ticket via `POST /api/ws-ticket`.

### Cloudflare Tunnel Timeout / Connection Refused

If the tunnel is running but requests fail or time out:

1. **Verify the server is running on the correct port:**

   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Check the tunnel config points to port 3000** (or your configured `PORT`):

   ```bash
   cat ~/.cloudflared/config.yml
   ```

   The `service` field under your hostname must be `http://localhost:3000`.

3. **Check tunnel status:**

   ```bash
   cloudflared tunnel info shooter
   ```

4. **Restart the tunnel:**

   ```bash
   cloudflared tunnel run shooter
   ```

### iOS Push Notifications Not Arriving

1. **Check `APNS_PRODUCTION` matches your build type:**

   | Build Type              | `APNS_PRODUCTION` | APNs Gateway |
   | ----------------------- | ----------------- | ------------ |
   | Xcode debug (simulator) | `false` (default) | Sandbox      |
   | Xcode debug (device)    | `false` (default) | Sandbox      |
   | TestFlight / App Store  | `true`            | Production   |

   The iOS app entitlements declare `aps-environment = production`. For TestFlight builds, the server **must** use `APNS_PRODUCTION=true`.

2. **Verify the device token is current.** Device tokens can change. Check the iOS app logs for the latest token and update `DEVICE_TOKEN` in `.env`.

3. **Validate APNs credentials:**
   - `APNS_KEY` must contain the full `.p8` private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - `APNS_KEY_ID` must match the Key ID shown in the Apple Developer portal
   - `APNS_TEAM_ID` must match your Apple Developer Team ID
   - `APNS_BUNDLE_ID` must match the iOS app's bundle identifier

4. **Check server logs** for APNs error responses:

   ```bash
   tail -f /tmp/shooter-server.err
   ```

   Common APNs errors:
   - `BadDeviceToken` -- Token is invalid or for the wrong environment
   - `DeviceTokenNotForTopic` -- Bundle ID mismatch
   - `ExpiredProviderToken` -- JWT rotation issue (restart the server)

### Hook Notifications Not Sending

1. **Verify the hook is configured** in `.claude/settings.json` and the notifier path is correct.

2. **Test the notifier directly:**

   ```bash
   echo '{"tool_name":"test"}' | \
     SHOOTER_USE_LOCAL=true \
     SHOOTER_LOCAL_PORT=3000 \
     API_KEY=your-key \
     node .claude/hooks/notifier.cjs PreToolUse
   ```

3. **Check that the server is reachable** from the hook's perspective (local vs. remote, correct port).
