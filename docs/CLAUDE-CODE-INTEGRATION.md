# SHOOTER ↔ Claude Code Integration Guide

## Overview

This integration enables **automatic push notifications** to iOS devices when Claude Code performs various actions. Using Claude Code's lifecycle hooks system, SHOOTER sends real-time notifications for:

- 🛠️ **Tool Execution**: File edits, commands, searches
- 💬 **User Interactions**: New prompts and requests
- 🎯 **Session Management**: Start/stop notifications
- ✅ **Completion Status**: Success/failure indicators

## Architecture

```
Claude Code Lifecycle Events → notifier.cjs (Node.js) → Local Server (adapter-node) → APNs / WebSocket
```

### Components

1. **Claude Code Hooks** (`.claude/settings.json`)
   - Configured to trigger on 5 key lifecycle events
   - Filters specific tools (Edit, Write, Bash, etc.)
   - Executes `notifier.cjs` with JSON payload

2. **Unified Notifier** (`.claude/hooks/notifier.cjs`)
   - Single Node.js script handling all hook events
   - Parses Claude Code event data
   - Formats contextual notifications
   - Checks `/api/ws-status` to see if a WebSocket client is connected; skips push if so (push/WebSocket dedup)
   - Sends HTTP POST requests to SHOOTER API
   - Supports bidirectional permission flow with async polling

3. **SHOOTER Local Server** (SvelteKit + adapter-node)
   - Runs locally with Cloudflare Tunnel for external access
   - Receives HTTP POST with notification payload
   - Authenticates using Bearer token
   - Delivers push notifications via APNs
   - Serves WebSocket connections for real-time streaming to the mobile UI

4. **iOS App** (Existing Swift app)
   - Receives and displays push notifications
   - Shows real-time Claude Code activity

## Setup Instructions

### 1. Configure API Credentials

Environment variables are read by `notifier.cjs` from the shell environment or `.env`:

- `SHOOTER_API_URL` — Base URL of the SHOOTER server (local or tunnel)
- `SHOOTER_USE_LOCAL` — Set to `true` to target local server
- `SHOOTER_LOCAL_PORT` — Local server port (default: 3000)
- `API_KEY` — Bearer token for authentication
- `DEVICE_TOKEN` — Target iOS device token

### 2. Get Required Credentials

#### API Key

From your existing SHOOTER setup, use the same API key configured in your server environment variables.

#### Device Token

From your iOS app, extract the device token (64-character hex string) that's registered with APNs.

### 3. Test the Integration

Test notification functionality:

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
node .claude/hooks/notifier.cjs --test
```

### 4. Verify Hook Configuration

Claude Code will automatically detect the `.claude/settings.json` file and activate hooks when:

- This directory is the working directory
- Claude Code session starts
- Any configured lifecycle events occur

## Hook Events & Notifications

All hooks are handled by the unified `notifier.cjs` script, which inspects the event type and payload to determine the notification.

### PreToolUse

**Triggers**: Before Edit, Write, MultiEdit, Bash, Read tools execute

**Notifications**:

- 📝 "SHOOTER: Editing filename.ext"
- 📄 "SHOOTER: Writing filename.ext"
- ⚡ "SHOOTER: Running Command"

### PostToolUse

**Triggers**: After Edit, Write, MultiEdit, Bash tools complete

**Notifications**:

- ✅ "SHOOTER: Edit Complete" / ❌ "SHOOTER: Edit Failed"
- ✅ "SHOOTER: File Written" / ❌ "SHOOTER: Write Failed"
- ✅ "SHOOTER: Command Complete" / ❌ "SHOOTER: Command Failed"

### UserPromptSubmit

**Triggers**: When user submits new prompts

**Notifications** (context-aware):

- 🐛 "SHOOTER: Debug Request" (for fix/error prompts)
- 🚀 "SHOOTER: New Feature" (for create/add prompts)
- 🧪 "SHOOTER: Testing" (for test/verify prompts)
- ❓ "SHOOTER: Learning" (for explain/understand prompts)
- 💭 "SHOOTER: New Request" (general prompts)

### SessionStart

**Triggers**: When Claude Code session begins

**Notifications**:

- 🎯 "SHOOTER: Session Started"

### Stop

**Triggers**: When Claude Code session ends

**Notifications**:

- 👋 "SHOOTER: Session Ended"

### PermissionRequest

**Triggers**: When Claude Code requests user permission (e.g., running a tool)

**Behavior**:

- Sends an interactive iOS notification with Allow/Deny buttons
- Polls the server for the user's response
- Returns the decision to Claude Code before the hook timeout

## Push / WebSocket Deduplication

When a WebSocket client (e.g., the mobile terminal UI) is actively connected, `notifier.cjs` checks the `/api/ws-status` endpoint before sending a push notification. If a WebSocket session is live, the push is skipped to avoid duplicate alerts — the user is already seeing events in real time via the WebSocket stream.

## Notification Payload Structure

Each notification includes contextual data:

```json
{
  "title": "🔧 SHOOTER: Editing config.js",
  "body": "14:30:25 • Starting code edit in shooter",
  "deviceToken": "your-device-token",
  "data": {
    "event": "tool_start",
    "tool": "Edit",
    "project": "shooter",
    "timestamp": "14:30:25",
    "file": "/path/to/config.js"
  }
}
```

## Development & Debugging

### Local Development Mode

Set `SHOOTER_USE_LOCAL=true` and `SHOOTER_LOCAL_PORT=3000` to target the local server:

```bash
export SHOOTER_USE_LOCAL=true
export SHOOTER_LOCAL_PORT=3000
```

### Debug Logging

The notifier prints status messages to stderr:

- ✅ Success: "SHOOTER notification sent: [title]"
- ❌ Failure: "HTTP Error 401: Unauthorized"
- ❌ Network: "Connection refused"

### Test the Notifier

```bash
# Test with sample JSON input
echo '{"tool": {"name": "Edit", "parameters": {"file_path": "/test.js"}}}' | \
node .claude/hooks/notifier.cjs
```

## Security Considerations

1. **API Key Protection**: Never commit actual API keys to git
2. **Device Token Privacy**: Device tokens are sensitive identifiers
3. **Network Security**: All HTTPS requests to SHOOTER API (Cloudflare Tunnel provides TLS)
4. **Error Handling**: Failed notifications don't interrupt Claude Code operation

## Troubleshooting

### Common Issues

1. **"Unauthorized" Error**
   - Verify API_KEY matches the server environment variable
   - Check Bearer token format in requests

2. **"Connection refused"**
   - Verify the local server is running
   - Check `SHOOTER_USE_LOCAL` and `SHOOTER_LOCAL_PORT` settings
   - Ensure Cloudflare Tunnel is active (if using tunnel URL)

3. **No notifications received**
   - Verify device token is correct (64 hex characters)
   - Check iOS app is properly registered for push notifications
   - Check `/api/ws-status` — if a WebSocket client is connected, pushes are intentionally skipped
   - Test with SHOOTER web interface first

### Debug Steps

1. **Test API directly**:

   ```bash
   curl -X POST http://localhost:3000/api/notify \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","body":"Direct API test","deviceToken":"YOUR_TOKEN"}'
   ```

2. **Test notifier script**:

   ```bash
   node .claude/hooks/notifier.cjs --test
   ```

3. **Check hook execution**:
   - Look for hook output in Claude Code console
   - Verify `.claude/settings.json` is valid JSON
   - Ensure working directory contains `.claude` folder

## Integration Benefits

### Real-time Awareness

- Know exactly when Claude Code starts working
- Get notified about file changes immediately
- Monitor command execution status

### Context-rich Notifications

- See which files are being edited
- Understand what type of work is happening
- Track progress on complex tasks

### Seamless Development Flow

- No need to check Claude Code interface constantly
- Get alerted to important events while mobile
- Stay connected to development progress

---

**This integration transforms Claude Code from a desktop-only experience into a mobile-aware development companion, providing real-time visibility into your AI-assisted coding workflow.**
