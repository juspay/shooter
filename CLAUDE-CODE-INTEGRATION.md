# SHOOTER ↔ Claude Code Integration Guide

## Overview

This integration enables **automatic push notifications** to iOS devices when Claude Code performs various actions. Using Claude Code's lifecycle hooks system, SHOOTER sends real-time notifications for:

- 🛠️ **Tool Execution**: File edits, commands, searches
- 💬 **User Interactions**: New prompts and requests  
- 🎯 **Session Management**: Start/stop notifications
- ✅ **Completion Status**: Success/failure indicators

## Architecture

```
Claude Code Lifecycle Events → Python Hook Scripts → HTTP POST → SHOOTER API → iOS Push Notifications
```

### Components

1. **Claude Code Hooks** (`.claude/settings.json`)
   - Configured to trigger on 5 key lifecycle events
   - Filters specific tools (Edit, Write, Bash, etc.)
   - Executes Python scripts with JSON payload

2. **Python Hook Scripts** (`.claude/hooks/`)
   - Parse Claude Code event data
   - Format contextual notifications
   - Send HTTP POST requests to SHOOTER API

3. **SHOOTER API** (Existing SvelteKit + Vercel)
   - Receives HTTP POST with notification payload
   - Authenticates using Bearer token
   - Delivers push notifications via APNs

4. **iOS App** (Existing Swift app)
   - Receives and displays push notifications
   - Shows real-time Claude Code activity

## Setup Instructions

### 1. Configure API Credentials

Edit `/Users/sachinsharma/Developer/Personal/shooter/.claude/hooks/shooter_notifier.py`:

```python
# SHOOTER API Configuration
SHOOTER_API_URL = "https://shooter-rho.vercel.app/api/notify"
API_KEY = "YOUR_ACTUAL_API_KEY"  # Replace with your API key
DEVICE_TOKEN = "YOUR_DEVICE_TOKEN"  # Replace with your iPhone device token
```

### 2. Get Required Credentials

#### API Key
From your existing SHOOTER setup, use the same API key configured in Vercel environment variables.

#### Device Token  
From your iOS app, extract the device token (64-character hex string) that's registered with APNs.

### 3. Test the Integration

Test notification functionality:

```bash
cd /Users/sachinsharma/Developer/Personal/shooter
python3 .claude/hooks/shooter_notifier.py --test
```

Expected output:
```
🧪 Testing SHOOTER notification...
✅ SHOOTER notification sent: 🧪 SHOOTER Test
```

### 4. Verify Hook Configuration

Claude Code will automatically detect the `.claude/settings.json` file and activate hooks when:
- This directory is the working directory
- Claude Code session starts
- Any configured lifecycle events occur

## Hook Events & Notifications

### PreToolUse Hook (`notify_tool_start.py`)
**Triggers**: Before Edit, Write, MultiEdit, Bash, Read tools execute

**Notifications**:
- 📝 "SHOOTER: Editing filename.ext" 
- 📄 "SHOOTER: Writing filename.ext"
- ⚡ "SHOOTER: Running Command"

### PostToolUse Hook (`notify_tool_complete.py`) 
**Triggers**: After Edit, Write, MultiEdit, Bash tools complete

**Notifications**:
- ✅ "SHOOTER: Edit Complete" / ❌ "SHOOTER: Edit Failed"
- ✅ "SHOOTER: File Written" / ❌ "SHOOTER: Write Failed"  
- ✅ "SHOOTER: Command Complete" / ❌ "SHOOTER: Command Failed"

### UserPromptSubmit Hook (`notify_session_activity.py`)
**Triggers**: When user submits new prompts

**Notifications** (context-aware):
- 🐛 "SHOOTER: Debug Request" (for fix/error prompts)
- 🚀 "SHOOTER: New Feature" (for create/add prompts)
- 🧪 "SHOOTER: Testing" (for test/verify prompts)
- ❓ "SHOOTER: Learning" (for explain/understand prompts)
- 💭 "SHOOTER: New Request" (general prompts)

### SessionStart Hook (`notify_session_start.py`)
**Triggers**: When Claude Code session begins

**Notifications**:
- 🎯 "SHOOTER: Session Started"

### Stop Hook (`notify_session_end.py`)  
**Triggers**: When Claude Code session ends

**Notifications**:
- 👋 "SHOOTER: Session Ended"

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

For local testing, update `SHOOTER_API_URL` in `shooter_notifier.py`:

```python
SHOOTER_API_URL = "http://localhost:5173/api/notify"
```

### Debug Logging

Hook scripts print status messages:
- ✅ Success: "SHOOTER notification sent: [title]"
- ❌ Failure: "HTTP Error 401: Unauthorized" 
- ❌ Network: "URL Error: Connection refused"

### Test Individual Hooks

Test specific hooks manually:

```bash
# Test with sample JSON input
echo '{"tool": {"name": "Edit", "parameters": {"file_path": "/test.js"}}}' | \
python3 .claude/hooks/notify_tool_start.py
```

## Security Considerations

1. **API Key Protection**: Never commit actual API keys to git
2. **Device Token Privacy**: Device tokens are sensitive identifiers
3. **Network Security**: All HTTPS requests to SHOOTER API
4. **Error Handling**: Failed notifications don't interrupt Claude Code operation

## Troubleshooting

### Common Issues

1. **"Unauthorized" Error**
   - Verify API_KEY matches Vercel environment variable
   - Check Bearer token format in requests

2. **"Connection refused"**
   - Verify SHOOTER_API_URL is correct
   - Check if local server is running (for localhost)
   - Ensure network connectivity

3. **"Module not found"**  
   - Verify Python 3 is available
   - Check file permissions are executable
   - Ensure shooter_notifier.py is in correct location

4. **No notifications received**
   - Verify device token is correct (64 hex characters)
   - Check iOS app is properly registered for push notifications
   - Test with SHOOTER web interface first

### Debug Steps

1. **Test API directly**:
   ```bash
   curl -X POST https://shooter-rho.vercel.app/api/notify \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","body":"Direct API test","deviceToken":"YOUR_TOKEN"}'
   ```

2. **Test hook script**:
   ```bash
   python3 .claude/hooks/shooter_notifier.py --test
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

## Future Enhancements

### Planned Features
1. **Interactive Notifications**: Response buttons for common actions
2. **Smart Filtering**: User-configurable notification preferences  
3. **Progress Tracking**: Multi-step task progress indicators
4. **Error Recovery**: Automatic retry mechanisms for failed notifications

### Advanced Integrations
1. **Webhook Responses**: iOS app responses sent back to Claude Code
2. **State Synchronization**: Track notification history and responses
3. **Team Notifications**: Multiple device support
4. **Custom Triggers**: User-defined hook conditions

## Success Metrics

### Integration Health
- ✅ Hook scripts execute without errors
- ✅ API requests return 200/success responses  
- ✅ Notifications appear on iOS device within 5 seconds
- ✅ Contextual information accurately reflects Claude Code activity

### User Experience
- 📱 Immediate awareness of Claude Code activity
- 🎯 Relevant, non-spam notification content
- 🔄 Reliable delivery during development sessions
- 📊 Clear success/failure status indicators

---

**This integration transforms Claude Code from a desktop-only experience into a mobile-aware development companion, providing real-time visibility into your AI-assisted coding workflow.**