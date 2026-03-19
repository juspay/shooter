# Environment Variable Reference

Complete reference for all environment variables used by the Shooter server and hook system.

---

## Server Environment Variables

These variables are read by the production server (`server.ts`) and the SvelteKit application. Define them in a `.env` file at the project root.

| Variable | Required | Default | Description | Example |
| --- | --- | --- | --- | --- |
| `API_KEY` | Yes | -- | Bearer token for authenticating all API requests. Used by hooks, the iOS app, and the admin UI to authenticate against the server. | `sk-a1b2c3d4e5f6` |
| `APNS_KEY` | Yes | -- | Apple Push Notification service private key. The full contents of the `.p8` file downloaded from the Apple Developer portal, including the BEGIN/END markers. | `"-----BEGIN PRIVATE KEY-----\nMIGT...base64...\n-----END PRIVATE KEY-----"` |
| `APNS_KEY_ID` | Yes | -- | The 10-character Key ID for the APNs authentication key, shown in the Apple Developer portal under Keys. | `ABC123DEF4` |
| `APNS_TEAM_ID` | Yes | -- | Your Apple Developer Team ID. Found in the Apple Developer portal under Membership. | `9ABCDEF012` |
| `APNS_BUNDLE_ID` | Yes | -- | The bundle identifier of the iOS app. Must match the value in the Xcode project and Apple Developer portal. | `com.example.shooter` |
| `APNS_PRODUCTION` | No | `false` | When `true`, the server sends push notifications through the production APNs gateway (`api.push.apple.com`). When `false`, it uses the sandbox gateway (`api.sandbox.push.apple.com`). Set to `true` for TestFlight and App Store builds. | `true` |
| `DEVICE_TOKEN` | Yes | -- | The 64-character hexadecimal push token for the target iOS device. Obtained from the iOS app after registering for remote notifications. Tokens can change; always use the latest value from the device. | `a1b2c3d4e5f6...64chars` |
| `PORT` | No | `3000` | The port the production server listens on. Also the port Cloudflare Tunnel should be configured to reach. | `3000` |

---

## Hook Environment Variables

These variables are used by the Claude Code hook notifier (`.claude/hooks/notifier.cjs`). They are typically set inline in the hook command strings within `.claude/settings.json`, not in the `.env` file.

| Variable | Required | Default | Description | Example |
| --- | --- | --- | --- | --- |
| `SHOOTER_API_KEY` | Yes | -- | Bearer token the hooks use to authenticate with the Shooter server. Should contain the same value as `API_KEY` on the server. | `sk-a1b2c3d4e5f6` |
| `SHOOTER_USE_LOCAL` | No | `false` | When `true`, hooks send requests to `http://localhost:<SHOOTER_LOCAL_PORT>` instead of the remote `SHOOTER_API_URL`. Use this during local development. | `true` |
| `SHOOTER_LOCAL_PORT` | No | `5173` | The local port to send hook requests to when `SHOOTER_USE_LOCAL=true`. Set to `5173` for the Vite dev server or `3000` (or your configured `PORT`) for the production server. | `5175` |
| `SHOOTER_API_URL` | Conditional | -- | The remote base URL for the Shooter server. Required when `SHOOTER_USE_LOCAL` is not `true`. This is the public URL provided by Cloudflare Tunnel. | `https://shooter.yourdomain.com` |
| `SHOOTER_PERMISSION_TIMEOUT` | No | `120` | How long (in seconds) the `PermissionRequest` hook polls the server for a response before timing out. The Claude Code hook timeout in `.claude/settings.json` should be set higher (e.g., 180s) to give the notifier time to clean up. | `120` |
| `SHOOTER_DEVICE_TOKEN` | No | -- | Override the device token for hook notifications. When set, the notifier sends this token in the request body. If not set, the server uses the `DEVICE_TOKEN` from its own environment. | `a1b2c3d4e5f6...64chars` |

---

## How Variables Are Loaded

### Server (`.env` file)

The production server entry point (`server.ts`) loads variables from `.env` via `dotenv/config` before any other imports. SvelteKit also reads `.env` during development (`pnpm run dev`).

```
server.ts
  -> import 'dotenv/config'   // loads .env into process.env
  -> import { handler } ...   // SvelteKit handler reads process.env
```

### Hooks (inline in `.claude/settings.json`)

Each hook command in `.claude/settings.json` sets its variables inline:

```
SHOOTER_USE_LOCAL=true SHOOTER_LOCAL_PORT=5175 SHOOTER_API_KEY=$SHOOTER_API_KEY node notifier.cjs PreToolUse
```

The `$SHOOTER_API_KEY` reference expands from your shell environment. Export it in your shell profile:

```bash
# ~/.zshrc
export SHOOTER_API_KEY="sk-a1b2c3d4e5f6"
```

---

## Quick Setup Checklist

1. Copy `.env.example` to `.env` and fill in all required values
2. Export `SHOOTER_API_KEY` in your shell profile (same value as `API_KEY`)
3. Obtain your iOS device token from the app and set `DEVICE_TOKEN`
4. Download your APNs key (`.p8` file) and paste its contents into `APNS_KEY`
5. Set `APNS_PRODUCTION=true` if your iOS build is distributed via TestFlight or App Store
6. For local development with hooks, set `SHOOTER_USE_LOCAL=true` and `SHOOTER_LOCAL_PORT` to match your server port
