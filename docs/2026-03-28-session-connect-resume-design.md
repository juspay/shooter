# Session Connect & Resume — Design Spec

**Date:** 2026-03-28
**Status:** Draft
**Author:** Claude + Sachin

## Problem

Shooter can spawn new terminals and view Claude Code sessions, but:
1. **Existing sessions are read-only** — no way to send messages from phone
2. **Session viewer shows raw tool noise** — tool_use, tool_result, thinking blocks clutter the conversation
3. **No way to "take over" a running session** — can't connect to Claude Code already running on the machine
4. **Two disconnected UIs** — session page (read-only) vs terminal chat (read-write) show the same data differently

## Solution

Unify the session experience with Connect/Resume and clean conversation rendering.

### Core Concepts

- **Connect** — A Claude Code process is actively running for this session. Launch `claude --resume <session-id>` in a Shooter terminal alongside it. Both instances see the same conversation.
- **Resume** — Session exists but no active process. Launch `claude --resume <session-id>` to restart where it left off.
- **Clean ChatView** — Collapse tool calls into summary lines, show only conversation text by default, with expandable details.

## Architecture

### 1. Process Detection

Detect running Claude Code / OpenCode processes and match to sessions.

**Key discovery:** Claude Code maintains a live process registry at `~/.claude/sessions/<PID>.json`. Each file contains:
```json
{
  "pid": 56171,
  "sessionId": "7a40bcd8-b9a8-435b-b1a8-54bb533be5e6",
  "cwd": "/Users/sachinsharma/Developer/Personal/shooter",
  "startedAt": 1774615939741,
  "kind": "interactive",
  "entrypoint": "cli"
}
```

**Server-side detection endpoint:** `GET /api/sessions/detect`

```
Detection flow:
1. readdir ~/.claude/sessions/ → get all <PID>.json files
2. Parse each JSON → get pid, sessionId, cwd, startedAt
3. Verify PID is alive: process.kill(pid, 0)
4. Match sessionId to JSONL file in ~/.claude/projects/<encoded-cwd>/
5. Return list of running processes with their sessions
```

No `ps aux | grep | lsof` hacks needed. Just filesystem reads.

**Response shape:**
```typescript
interface DetectedProcess {
  pid: number;
  command: 'claude' | 'opencode';
  cwd: string;
  sessionId: string;            // from ~/.claude/sessions/<PID>.json
  projectPath: string;          // encoded project dir path
  startedAt: number;            // epoch ms
  kind: string;                 // 'interactive' | 'cli'
}
```

### 2. Connect/Resume API

**`POST /api/sessions/connect`**

```typescript
// Request
{
  command: string;         // e.g. 'claude' or 'opencode'
  cwd: string;             // working directory for the terminal
  sessionId: string;       // JSONL filename (without .jsonl)
}

// Server logic:
// 1. Create Shooter terminal:
//    - command: 'claude'
//    - args: ['--resume', sessionId]
//    - cwd: provided cwd
// 2. Return terminal ID

// Response
{
  terminalId: string;
  ws: string;              // /ws/terminal/:id
  sessionWs: string;       // /ws/session/:id
}
```

**OpenCode equivalent:** `opencode --resume <session-id>` (if supported), else launch `opencode` in same cwd.

### 3. Session List Enhancement

The existing `GET /api/sessions` response gets augmented with process detection:

```typescript
interface SessionInfo {
  // ... existing fields ...

  // NEW: process status
  detectedProcess: DetectedProcess | null;  // non-null if live process found
  shooterTerminalId: string | null;         // non-null if already connected via Shooter
}
```

**UI states per session:**

| State | Indicator | Button |
|-------|-----------|--------|
| Running + Shooter-connected | Green "Live" badge | "Open" → `/terminals/<id>` |
| Running + NOT connected | Yellow "Running" badge | **"Connect"** → calls POST /api/sessions/connect |
| Recently active (< 5 min) | Amber "Active" dot | **"Resume"** → calls POST /api/sessions/connect |
| Inactive | Gray | **"Resume"** → calls POST /api/sessions/connect |

### 4. ChatView Cleanup

**Current:** Every tool_use shows as an expanded card with full JSON input. Tool_result shows full output. This creates noise.

**New default rendering:**

```
┌─────────────────────────────────────────┐
│ 🧑 User                                │
│ Fix the login bug in auth.ts            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🤖 Assistant                            │
│ I'll fix the login bug. Let me read     │
│ the file first.                         │
│                                         │
│ ▸ Used 3 tools: Read, Edit, Bash  ← collapsed summary
│                                         │
│ The login bug was caused by a missing   │
│ null check on line 42. I've added the   │
│ validation and the tests pass.          │
└─────────────────────────────────────────┘
```

**Implementation:**

1. Group consecutive tool_use + tool_result parts into a "tool group"
2. Render tool groups as a single collapsed summary line: "Used N tools: ToolA, ToolB, ToolC"
3. Clicking the summary expands to show individual tool cards (existing UI)
4. Thinking blocks remain collapsed by default (already are)
5. Add a "Show all details" toggle in the header that expands everything
6. Store preference in localStorage: `shooter:chatview:showDetails`

**Message part rendering rules:**

| Part type | Default | Expanded |
|-----------|---------|----------|
| `text` | Shown (markdown) | Same |
| `thinking` | Collapsed accordion | Expanded |
| `tool_use` | Grouped into summary line | Individual cards with JSON input |
| `tool_result` | Hidden (part of tool group) | Card with output text |

### 5. Unified Session → Terminal Flow

After "Connect" or "Resume":

1. `POST /api/sessions/connect` creates terminal, returns `terminalId`
2. UI navigates to `/terminals/<terminalId>`
3. Terminal page auto-selects "Chat" tab (already does this for AI commands on mobile)
4. ChatView shows with `showInput={true}` — user can send messages
5. Input goes via `{type: 'send-input', text}` → session WebSocket → terminal PTY stdin
6. Claude Code receives the input and responds
7. Response appears in JSONL → session watcher → ChatView updates

### 6. Session Page Changes

The `/session/[id]` page currently fetches history and optionally streams live updates. Changes:

1. **Check if session has an associated Shooter terminal** — query `GET /api/terminals` filtered by sessionFile matching this session ID
2. **If terminal exists:** enable `showInput={true}`, wire `onSendInput` to session WebSocket `send-input`
3. **If no terminal but session active:** show "Connect" / "Resume" button
4. **After connect:** reload page or redirect to `/terminals/<id>` chat view

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `src/routes/api/sessions/detect/+server.ts` | Process detection endpoint |
| `src/routes/api/sessions/connect/+server.ts` | Connect/resume endpoint |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/modules/client/terminal/ChatView.svelte` | Tool grouping, collapse by default, summary line |
| `src/routes/session/[id]/+page.svelte` | Add Connect/Resume button, enable input when terminal exists |
| `src/routes/+page.svelte` or `src/routes/project/+page.svelte` | Add "Connect"/"Resume" buttons to session list |
| `src/routes/api/terminals/+server.ts` | Add 'claude' resume args support, ensure --resume is allowed |
| `src/lib/modules/server/sessions/jsonl-reader.ts` | Return process detection info alongside sessions |

### Unchanged
| File | Why |
|------|-----|
| `ChatView.svelte` input mechanism | Already exists, just needs `showInput={true}` |
| `session-handler.ts` send-input | Already routes input to terminal PTY |
| `terminal-handler.ts` | No changes needed |
| `pty-manager.ts` | Terminal creation already handles arbitrary commands |

## Process Detection Implementation

```typescript
// src/lib/modules/server/sessions/process-detector.ts
// Uses Claude Code's built-in process registry — no shell hacks needed

import { readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface ClaudeSessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
}

function detectRunningAISessions(): DetectedProcess[] {
  const sessionsDir = join(homedir(), '.claude', 'sessions');
  const processes: DetectedProcess[] = [];

  try {
    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const data: ClaudeSessionFile = JSON.parse(
          readFileSync(join(sessionsDir, file), 'utf8')
        );

        // Verify PID is still alive
        try { process.kill(data.pid, 0); } catch { continue; }

        // Encode cwd to match ~/.claude/projects/ directory naming
        const encodedCwd = data.cwd.replace(/\//g, '-');
        const projectPath = join(homedir(), '.claude', 'projects', encodedCwd);

        processes.push({
          pid: data.pid,
          command: 'claude',
          cwd: data.cwd,
          sessionId: data.sessionId,
          projectPath,
          startedAt: data.startedAt,
          kind: data.kind,
        });
      } catch {
        // Invalid JSON or dead process — skip
      }
    }
  } catch {
    // No matching processes
  }

  return processes;
}
```

## Connect Endpoint Implementation

```typescript
// src/routes/api/sessions/connect/+server.ts

export async function POST({ request }) {
  const { command, cwd, sessionId } = await request.json();

  // Build resume command
  const args = command === 'claude'
    ? ['--resume', sessionId]
    : ['--session', sessionId]; // OpenCode uses --session <id>

  // Create terminal via ptyManager
  const terminal = await ptyManager.create(command, args, cwd, 120, 40);

  return json({
    terminalId: terminal.id,
    ws: `/ws/terminal/${terminal.id}`,
    sessionWs: `/ws/session/${terminal.id}`,
  }, { status: 201 });
}
```

## ChatView Tool Grouping Logic

```typescript
// In ChatView.svelte — group consecutive tool parts

function groupMessageParts(parts: MessagePart[]): DisplayPart[] {
  const groups: DisplayPart[] = [];
  let currentToolGroup: ToolUsePart[] = [];

  for (const part of parts) {
    if (part.type === 'tool_use') {
      currentToolGroup.push(part);
    } else {
      if (currentToolGroup.length > 0) {
        groups.push({
          type: 'tool_group',
          tools: currentToolGroup,
          summary: `Used ${currentToolGroup.length} tool${currentToolGroup.length > 1 ? 's' : ''}: ${currentToolGroup.map(t => t.toolName || t.name).join(', ')}`
        });
        currentToolGroup = [];
      }
      groups.push(part);
    }
  }

  // Flush remaining
  if (currentToolGroup.length > 0) {
    groups.push({
      type: 'tool_group',
      tools: currentToolGroup,
      summary: `Used ${currentToolGroup.length} tool${currentToolGroup.length > 1 ? 's' : ''}: ${currentToolGroup.map(t => t.toolName || t.name).join(', ')}`
    });
  }

  return groups;
}
```

## Edge Cases

1. **Two Shooter instances resume same session** — Claude Code handles this; both see the same JSONL. Last writer wins for API context.
2. **Original process exits while Shooter is connected** — No impact. Shooter's terminal is independent.
3. **Session file doesn't exist** — `claude --resume` with invalid ID falls back to new session. Validate ID exists before calling connect.
4. **Process detection misidentifies PID** — Use `ps -p <pid> -o command=` to verify it's actually claude/opencode, not a grep artifact.
5. **Encoded cwd mismatch** — Claude Code uses a specific encoding for project paths. Must match exactly. Read `sessions-index.json` for canonical path mapping.

## Success Criteria

1. User opens Shooter on phone, sees all Claude Code sessions with Connect/Resume buttons
2. Tapping "Connect" on a running session gives full chat control in < 3 seconds
3. Tapping "Resume" on an idle session restarts it with full history
4. ChatView shows clean conversation — no tool noise by default
5. Input works: user types message, Claude Code responds, response appears live
