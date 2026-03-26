# Terminal Access

Shooter provides remote terminal access through its web UI, letting you launch shells and AI coding sessions from any browser and monitor them in real time.

## Overview

Terminal access spawns real PTY (pseudo-terminal) processes on the Shooter server and streams their I/O over WebSockets. You get a full interactive terminal in your browser, with support for shell sessions (zsh, bash) and AI assistants (Claude Code, OpenCode). AI sessions also offer a structured Chat view that presents the conversation as messages, tool calls, and thinking blocks instead of raw terminal output.

## Launching Terminals

### From the Web UI

1. Navigate to the **Terminals** section in the sidebar.
2. Click **+ New Terminal**.
3. Select a preset (Shell, Claude Code, or OpenCode).
4. Click **Launch**.

The terminal opens immediately. You will see the process output streaming in the Raw view.

### Via API

Send a POST request to create a terminal programmatically:

```bash
curl -X POST https://your-host/api/terminals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "zsh",
    "args": [],
    "cwd": "/Users/you/project",
    "cols": 120,
    "rows": 40
  }'
```

The response includes the terminal `id` and WebSocket paths for connecting:

```json
{
  "id": "a1b2c3d4",
  "pid": 12345,
  "command": "zsh",
  "cwd": "/Users/you/project",
  "createdAt": "2026-03-19T10:00:00.000Z",
  "ws": "/ws/terminal/a1b2c3d4",
  "sessionWs": "/ws/session/a1b2c3d4"
}
```

## Terminal Types

### Shell (zsh / bash)

A standard interactive shell session. Use it for running commands, scripts, git operations, or anything you would do in a local terminal. Only the Raw view is available since there is no structured conversation to display.

Allowed commands: `zsh`, `bash`, `sh`, `fish`.

### Claude Code

Launches Claude Code as an interactive AI coding assistant. The terminal detects when Claude Code creates its JSONL session file and begins parsing it for the Chat view. Both Raw and Chat views are available.

### OpenCode

Launches the OpenCode AI assistant. Currently only the Raw view is supported. Chat view parsing for OpenCode sessions is not yet implemented.

## Raw vs Chat View

Each terminal supports up to two viewing modes, toggled with the **Raw / Chat** button in the terminal header.

### Raw View

A full xterm.js terminal rendered in the browser. You see exactly what the underlying process outputs, including ANSI colors, cursor movement, and control sequences. This is the default view for shell sessions and the only view for OpenCode.

- Full keyboard input (type directly into the terminal).
- Supports copy/paste, scrollback, and mouse events.
- Works for any command, not just AI sessions.

### Chat View

A structured conversation view designed for AI coding sessions (Claude Code). Instead of raw terminal escape sequences, you see:

- **User messages** displayed as chat bubbles.
- **Assistant messages** with formatted text.
- **Tool calls** shown as collapsible cards with the tool name, input parameters, and output.
- **Thinking blocks** displayed as expandable sections.

The Chat view parses the session's JSONL file in real time, so new messages stream in as the AI works.

**Toggling**: Click the **Raw** or **Chat** button to switch between views at any time. Both views are always connected to the same underlying terminal process.

**Mobile**: On mobile devices, AI sessions default to the Chat view because the structured layout is easier to read on small screens. You can still switch to Raw if needed.

## Quick Keys

When the Raw view has focus, standard terminal keyboard shortcuts work:

| Keys                 | Action                                      |
| -------------------- | ------------------------------------------- |
| **Ctrl+C**           | Send SIGINT (interrupt the running process) |
| **Tab**              | Trigger shell tab completion                |
| **Up / Down arrows** | Navigate command history                    |
| **Ctrl+L**           | Clear the terminal screen                   |
| **Ctrl+D**           | Send EOF (exit the shell if empty prompt)   |
| **Ctrl+Z**           | Suspend the foreground process (SIGTSTP)    |
| **Ctrl+A / Ctrl+E**  | Jump to beginning / end of line             |
| **Ctrl+R**           | Reverse history search                      |

## Managing Terminals

### Kill a Running Terminal

Click the **Kill** button on a running terminal's detail view. This sends SIGTERM to the process. If the process does not exit within 5 seconds, SIGKILL is sent automatically.

Via API:

```bash
curl -X DELETE https://your-host/api/terminals/a1b2c3d4 \
  -H "Authorization: Bearer $API_KEY"
```

### Remove an Exited Terminal

Once a terminal has exited, remove it from the list by:

- Clicking the **x** button next to the terminal in the sidebar list, or
- Clicking the **Remove** button on the terminal's detail view.

Via API (same DELETE endpoint; for exited terminals it removes rather than kills):

```bash
curl -X DELETE https://your-host/api/terminals/a1b2c3d4 \
  -H "Authorization: Bearer $API_KEY"
```

### Auto-Cleanup

Exited terminals are automatically cleaned up by the server:

- Terminals that exited more than **1 hour** ago are evicted.
- If more than **10 exited** terminals accumulate, the oldest are evicted first.
- The cleanup cycle runs every 5 minutes.

Running terminals are never automatically killed.

## Live Session Monitoring

Shooter can detect and display existing Claude Code sessions that are already running on the server, not just terminals launched through the UI.

- Sessions discovered on disk get a **LIVE** badge in the sessions list.
- New messages stream in real time as the AI writes to its JSONL session file.
- The session watcher uses filesystem change notifications (chokidar) and reads only the bytes appended since the last check, keeping overhead minimal.

This means you can start a Claude Code session in a regular terminal, then open Shooter's web UI and follow along in the Chat view without interrupting the session.

## Limitations

- **Only Shooter-launched terminals are interactive.** You can monitor existing Claude Code sessions in read-only Chat view, but you cannot type into them. Full interactive control (keyboard input, signals) is only available for terminals created through Shooter's UI or API.

- **OpenCode Chat view is not yet supported.** OpenCode terminals only show the Raw view. Structured conversation parsing for OpenCode's session format has not been implemented yet.

- **Claude Code Chat view appears after the first message.** When you launch a Claude Code terminal, the Chat view is empty until Claude Code creates its JSONL session file and writes the first entry. This typically happens within a few seconds of sending the first prompt. Until then, use the Raw view to interact with the process.

- **Working directory must be under the home directory.** For security, the server rejects terminal creation requests where the `cwd` resolves to a path outside the user's home directory.

- **Command allowlist.** Only `zsh`, `bash`, `sh`, `fish`, `claude`, and `opencode` are allowed as terminal commands. Arbitrary command execution is blocked.
