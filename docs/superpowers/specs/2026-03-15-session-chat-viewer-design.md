# Session Chat Viewer — Design Spec

## Goal

Replace notification-based session grouping with a full conversation viewer that reads Claude Code's local JSONL session files and renders them as a chat interface with inline tool call visualization.

## Data Source

- **Index**: `~/.claude/projects/-Users-sachinsharma-Developer-Personal-shooter/sessions-index.json`
- **Sessions**: `<session-id>.jsonl` files — one JSON object per line
- **Subagents**: `<session-id>/subagents/agent-<id>.jsonl`

## Session Naming

Each session card shows:

- **Title**: `firstPrompt` from sessions-index.json (first thing user asked)
- **Subtitle**: Project path + git branch
- **Timestamp**: Created/modified dates
- **Summary**: Auto-generated summary field

## Architecture

### Server-Side

**New file: `src/lib/modules/server/sessions/jsonl-reader.ts`**

- Reads `sessions-index.json` to list all sessions
- Parses individual JSONL files into structured conversation data
- Extracts: user messages, assistant text, tool calls with results, thinking blocks
- Groups assistant entries by `message.id` (multiple JSONL entries = one assistant turn)
- Links tool_use → tool_result via `tool_use_id`

**New file: `src/lib/modules/server/sessions/types.ts`**

```typescript
interface SessionInfo {
  id: string;
  title: string; // firstPrompt (cleaned)
  summary: string;
  projectPath: string;
  gitBranch: string;
  created: string;
  modified: string;
  messageCount: number;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  parts: MessagePart[];
}

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown>; id: string }
  | { type: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | { type: 'thinking'; content: string }
  | { type: 'turn_duration'; duration: number };
```

**Updated: `src/routes/api/sessions/+server.ts`**

- `GET /api/sessions` — returns session list from sessions-index.json (no auth needed for local files)
- `GET /api/sessions?id=<session-id>` — returns full conversation for one session
- `GET /api/sessions?id=<session-id>&offset=0&limit=50` — paginated for large sessions

### Frontend

**Updated: `src/routes/+page.svelte` (Sessions list)**

- Session cards show: title (firstPrompt), summary, branch, timestamps, message count
- Cards sorted by modified date (newest first)
- Click navigates to `/session/[id]`

**Updated: `src/routes/session/[id]/+page.svelte` (Chat view)**

- Chat bubble layout:
  - User messages: right-aligned bubbles with user icon
  - Assistant text: left-aligned bubbles with Claude icon
  - Tool calls: inline collapsible cards between bubbles
  - Thinking: collapsible "reasoning" blocks (dimmed)
- Tool call cards show:
  - Tool name pill (Bash, Edit, Read, Write, etc.)
  - Input (command, file path, etc.)
  - Output (collapsible, syntax highlighted for code)
  - Duration if available
- Auto-scroll to bottom on load
- Back button returns to session list

### CSS

- Chat bubbles using existing dark theme
- User bubbles: slightly different background (#1e293b)
- Assistant bubbles: existing card background (#141414)
- Tool cards: bordered, collapsible, tool-colored left border
- Mobile: full-width bubbles, no alignment shift

## Files to Create/Modify

- CREATE: `src/lib/modules/server/sessions/jsonl-reader.ts`
- CREATE: `src/lib/modules/server/sessions/types.ts`
- MODIFY: `src/routes/api/sessions/+server.ts` — read from JSONL instead of notification history
- MODIFY: `src/routes/+page.svelte` — use sessions-index.json data for cards
- MODIFY: `src/routes/session/[id]/+page.svelte` — chat bubble layout
- MODIFY: `src/app.css` — chat bubble styles
- MODIFY: `src/routes/+layout.svelte` — nav updates if needed

## Non-Goals

- No writing/sending messages (read-only viewer)
- No WebSocket real-time updates (polling is fine)
- No subagent conversation rendering (phase 2)
