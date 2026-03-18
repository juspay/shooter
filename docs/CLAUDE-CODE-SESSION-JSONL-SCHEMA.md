# Claude Code Session JSONL Schema

A comprehensive reference for parsing Claude Code session JSONL files to build a chat UI.

## File Layout

```
~/.claude/projects/<encoded-project-path>/
  sessions-index.json              # Session index
  <session-id>.jsonl               # Main conversation log (one JSON object per line)
  <session-id>/                    # Session data directory
    subagents/                     # Subagent conversation logs
      agent-<agentId>.jsonl        # Each subagent's own JSONL (same format)
      agent-<agentId>.meta.json    # Subagent metadata
    tool-results/                  # Large tool outputs saved to disk
      toolu_<id>.txt               # File contents (Read tool overflow)
      b<hash>.txt                  # Other large outputs
```

The `<encoded-project-path>` is the project's absolute path with `/` replaced by `-` (e.g., `/Users/joe/myproject` becomes `-Users-joe-myproject`).

---

## sessions-index.json

```json
{
  "version": 1,
  "originalPath": "/Users/sachinsharma/Developer/Personal/shooter",
  "entries": [
    {
      "sessionId": "ea1bebc9-0938-4d99-ac41-d29683cb331d",
      "fullPath": "/Users/.../<session-id>.jsonl",
      "fileMtime": 1770134070546,
      "firstPrompt": "check this repo",
      "summary": "Claude Code iOS Push Notification System Phase 1",
      "messageCount": 14,
      "created": "2026-02-01T20:13:48.889Z",
      "modified": "2026-02-02T13:18:39.910Z",
      "gitBranch": "release",
      "projectPath": "/Users/sachinsharma/Developer/Personal/shooter",
      "isSidechain": false
    }
  ]
}
```

| Field                    | Type      | Description                          |
| ------------------------ | --------- | ------------------------------------ |
| `version`                | `number`  | Schema version (currently `1`)       |
| `originalPath`           | `string`  | Absolute path to the project         |
| `entries[].sessionId`    | `string`  | UUID of the session                  |
| `entries[].fullPath`     | `string`  | Absolute path to the JSONL file      |
| `entries[].fileMtime`    | `number`  | File modification time (Unix ms)     |
| `entries[].firstPrompt`  | `string`  | First user prompt text (truncated)   |
| `entries[].summary`      | `string`  | AI-generated session summary         |
| `entries[].messageCount` | `number`  | Total message count                  |
| `entries[].created`      | `string`  | ISO 8601 creation timestamp          |
| `entries[].modified`     | `string`  | ISO 8601 last modification timestamp |
| `entries[].gitBranch`    | `string`  | Git branch active during the session |
| `entries[].projectPath`  | `string`  | Absolute path to the project         |
| `entries[].isSidechain`  | `boolean` | Whether this is a sidechain session  |

---

## JSONL Entry Types

Each line in the JSONL is a JSON object with a `type` field. There are 8 types:

| Type                    | Frequency | Description                                                 |
| ----------------------- | --------- | ----------------------------------------------------------- |
| `progress`              | Very high | Hook events, bash progress, agent progress, search progress |
| `assistant`             | High      | Claude's responses: text, tool calls, thinking              |
| `user`                  | High      | User prompts and tool results                               |
| `system`                | Medium    | Turn boundaries, hook summaries, compaction markers         |
| `file-history-snapshot` | Medium    | File backup snapshots for undo capability                   |
| `queue-operation`       | Medium    | Task queue enqueue/dequeue events                           |
| `pr-link`               | Low       | GitHub PR links created during session                      |
| `last-prompt`           | Low       | Last user prompt (for session resumption)                   |

---

## Common Fields (on most entry types)

These fields appear on `user`, `assistant`, `progress`, and `system` entries:

| Field         | Type           | Always? | Description                                                       |
| ------------- | -------------- | ------- | ----------------------------------------------------------------- |
| `type`        | `string`       | Yes     | Entry type discriminator                                          |
| `uuid`        | `string`       | Yes     | Unique ID for this entry                                          |
| `parentUuid`  | `string\|null` | Yes     | UUID of the previous entry in the conversation chain              |
| `timestamp`   | `string`       | Yes     | ISO 8601 timestamp                                                |
| `sessionId`   | `string`       | Yes     | Session UUID                                                      |
| `isSidechain` | `boolean`      | Yes     | `false` in main session, `true` in subagent files                 |
| `userType`    | `string`       | Yes     | Always `"external"`                                               |
| `cwd`         | `string`       | Yes     | Working directory                                                 |
| `gitBranch`   | `string`       | Yes     | Active git branch                                                 |
| `version`     | `string`       | Yes     | Claude Code version (e.g., `"2.1.76"`)                            |
| `slug`        | `string`       | No      | Human-readable session name (e.g., `"recursive-moseying-kitten"`) |

---

## Type 1: `user`

User messages carry either human prompts or tool results.

### Common user fields

| Field                     | Type      | Always? | Description                                                  |
| ------------------------- | --------- | ------- | ------------------------------------------------------------ |
| `message`                 | `object`  | Yes     | The message payload (see below)                              |
| `isMeta`                  | `boolean` | No      | `true` for system-injected prompts (e.g., `/init` follow-up) |
| `promptId`                | `string`  | No      | UUID grouping related prompt entries                         |
| `permissionMode`          | `string`  | No      | `"bypassPermissions"` when auto-approved                     |
| `sourceToolAssistantUUID` | `string`  | No      | UUID of the assistant entry that triggered this tool result  |
| `sourceToolUseID`         | `string`  | No      | The `tool_use_id` this result answers (if present)           |
| `toolUseResult`           | `object`  | No      | Structured result metadata (see Tool Result Metadata below)  |

### message.content variants

#### Variant A: String content (human prompt or slash command)

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "<command-message>init</command-message>\n<command-name>/init</command-name>"
  },
  "uuid": "bf9c6c98-...",
  "parentUuid": "1a2f088f-...",
  "timestamp": "2026-03-13T18:09:01.300Z",
  "sessionId": "ea1bebc9-...",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/sachinsharma/Developer/Personal/shooter",
  "version": "2.1.75",
  "gitBranch": "release"
}
```

#### Variant B: Text block array (human prompt with rich content)

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "Please analyze this codebase and create a CLAUDE.md file..."
      }
    ]
  },
  "isMeta": true,
  "uuid": "b0ac9473-...",
  "parentUuid": "bf9c6c98-..."
}
```

#### Variant C: Tool result (response to assistant's tool_use)

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_01Jnmvv1g7p97fiiYaCUyBX6",
        "type": "tool_result",
        "content": "     1\u2192# CLAUDE.md\n     2\u2192..."
      }
    ]
  },
  "uuid": "dd82c8a2-...",
  "parentUuid": "eff62533-...",
  "sourceToolAssistantUUID": "eff62533-...",
  "toolUseResult": { "...see below..." }
}
```

The `tool_result.content` can be either:

- A `string` (plain text output)
- An `array` of `{ "type": "text", "text": "..." }` blocks

### Identifying real human prompts

A "real human prompt" is a `user` entry where:

1. `message.content` is a string or contains only `text` blocks (no `tool_result`)
2. `isMeta` is absent or `false`
3. Content does not start with `<task-notification>` (which are background task completion notifications)

---

## Type 2: `assistant`

Claude's responses. **Each JSONL entry contains exactly one content block**, even though the API returns multiple blocks in a single response. Claude Code splits a single API response into multiple JSONL entries sharing the same `message.id`.

### Streaming reassembly

Multiple entries with the **same `message.id`** represent a single API response. To reconstruct the full response:

1. Group entries by `message.id`
2. Order by JSONL line number (append order)
3. Concatenate the content blocks
4. The **last entry** in the group has a non-null `stop_reason`

```
message.id = "msg_011DeEsdcoziycWxwoptqzYx" (5 entries):
  [0] thinking block     stop_reason=null
  [1] text block         stop_reason=null
  [2] tool_use (Read)    stop_reason=null
  [3] tool_use (Read)    stop_reason=null
  [4] tool_use (Read)    stop_reason="tool_use"  <-- final
```

### Content block types

#### Text

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_011DeEsdcoziycWxwoptqzYx",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "Let me analyze the codebase to improve the existing CLAUDE.md."
      }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": { "...see Usage below..." }
  },
  "requestId": "req_011CZ1XXnByaxZHg447FyBDN",
  "uuid": "20c3bc22-...",
  "parentUuid": "648b2df6-..."
}
```

#### Tool use

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_011DeEsdcoziycWxwoptqzYx",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01Jnmvv1g7p97fiiYaCUyBX6",
        "name": "Read",
        "input": {
          "file_path": "/Users/sachinsharma/Developer/Personal/shooter/CLAUDE.md"
        },
        "caller": {
          "type": "direct"
        }
      }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": { "..." }
  },
  "uuid": "eff62533-...",
  "parentUuid": "20c3bc22-..."
}
```

#### Thinking (extended thinking / chain-of-thought)

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_011DeEsdcoziycWxwoptqzYx",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "thinking",
        "thinking": "",
        "signature": "Ev4CCkYICxgCKkCk8pY3/Jfl2+YYUMZTfvLtP3..."
      }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": { "..." }
  },
  "uuid": "648b2df6-...",
  "parentUuid": "b0ac9473-..."
}
```

Note: The `thinking` field is typically empty in stored JSONL (redacted). The `signature` field is a cryptographic signature for thinking block verification.

### Assistant-specific fields

| Field                 | Type           | Always? | Description                                              |
| --------------------- | -------------- | ------- | -------------------------------------------------------- |
| `message`             | `object`       | Yes     | API message object                                       |
| `message.model`       | `string`       | Yes     | Model name (e.g., `"claude-opus-4-6"`)                   |
| `message.id`          | `string`       | Yes     | API message ID -- shared across streamed blocks          |
| `message.role`        | `string`       | Yes     | Always `"assistant"`                                     |
| `message.content`     | `array`        | Yes     | Always exactly 1 content block per entry                 |
| `message.stop_reason` | `string\|null` | Yes     | `null`, `"tool_use"`, `"end_turn"`, or `"stop_sequence"` |
| `message.usage`       | `object`       | Yes     | Token usage (see below)                                  |
| `requestId`           | `string`       | No      | API request ID                                           |
| `isApiErrorMessage`   | `boolean`      | No      | `true` if this is an API error response                  |

### stop_reason values

| Value             | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `null`            | Intermediate block in a multi-block response      |
| `"tool_use"`      | Response ended to execute tool calls              |
| `"end_turn"`      | Claude finished its response (no more tool calls) |
| `"stop_sequence"` | Hit a stop sequence                               |

### Usage object

```json
{
  "input_tokens": 3,
  "cache_creation_input_tokens": 25130,
  "cache_read_input_tokens": 0,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 25130
  },
  "output_tokens": 258,
  "service_tier": "standard",
  "inference_geo": "not_available",
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  }
}
```

Note: Usage may differ between entries with the same `message.id`. The **last entry** (with non-null `stop_reason`) has the final/accurate usage.

---

## Type 3: `progress`

Progress events for hooks, bash commands, agents, and searches. These are informational -- they do not carry conversation content.

### Common progress fields

| Field             | Type     | Always? | Description                              |
| ----------------- | -------- | ------- | ---------------------------------------- |
| `data`            | `object` | Yes     | Progress payload (varies by `data.type`) |
| `toolUseID`       | `string` | Yes     | Tool use ID this progress relates to     |
| `parentToolUseID` | `string` | Yes     | Parent tool use ID                       |

### data.type = "hook_progress"

Lifecycle hook execution events.

```json
{
  "type": "progress",
  "data": {
    "type": "hook_progress",
    "hookEvent": "PreToolUse",
    "hookName": "PreToolUse:Read",
    "command": "node ~/.claude/hooks/notifier.cjs PreToolUse"
  },
  "toolUseID": "toolu_01Jnmvv1g7p97fiiYaCUyBX6",
  "parentToolUseID": "toolu_01Jnmvv1g7p97fiiYaCUyBX6"
}
```

Hook events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`

### data.type = "agent_progress"

Subagent activity updates streamed into the main session. Contains the subagent's `user` or `assistant` message.

```json
{
  "type": "progress",
  "data": {
    "type": "agent_progress",
    "agentId": "ac6ef75512c6ebcd3",
    "message": {
      "type": "user",
      "message": { "role": "user", "content": [...] },
      "uuid": "48ae9b55-...",
      "timestamp": "2026-03-14T04:21:19.068Z"
    },
    "prompt": "You are implementing Task 1-3 of a comprehensive fixes plan..."
  }
}
```

### data.type = "bash_progress"

Live output from long-running Bash commands.

```json
{
  "type": "progress",
  "data": {
    "type": "bash_progress",
    "output": "",
    "fullOutput": "",
    "elapsedTimeSeconds": 3,
    "totalLines": 0,
    "totalBytes": 0,
    "taskId": "byxentx6f",
    "timeoutMs": 30000
  },
  "toolUseID": "bash-progress-0",
  "parentToolUseID": "toolu_0115dvYWPumND4qthh6fZTz6"
}
```

### data.type = "query_update"

Search query started.

```json
{
  "type": "progress",
  "data": {
    "type": "query_update",
    "query": "Vercel KV pricing 2026 free tier limits"
  }
}
```

### data.type = "search_results_received"

Search results returned.

```json
{
  "type": "progress",
  "data": {
    "type": "search_results_received",
    "resultCount": 10,
    "query": "Vercel KV pricing 2026 free tier limits"
  }
}
```

### data.type = "waiting_for_task"

Waiting for a background task to complete.

```json
{
  "type": "progress",
  "data": {
    "type": "waiting_for_task",
    "taskDescription": "Run TypeScript type checking",
    "taskType": "local_bash"
  }
}
```

---

## Type 4: `system`

System-level events and boundaries.

### Common system fields

| Field     | Type      | Always? | Description                           |
| --------- | --------- | ------- | ------------------------------------- |
| `subtype` | `string`  | Yes     | Discriminator for system message kind |
| `level`   | `string`  | No      | `"info"`, `"suggestion"`              |
| `isMeta`  | `boolean` | No      | Whether this is metadata              |

### subtype = "turn_duration"

Marks the end of a turn with its duration.

```json
{
  "type": "system",
  "subtype": "turn_duration",
  "durationMs": 126267,
  "isMeta": false
}
```

### subtype = "stop_hook_summary"

Summary of stop hooks that ran at the end of a turn.

```json
{
  "type": "system",
  "subtype": "stop_hook_summary",
  "hookCount": 3,
  "hookInfos": [
    {
      "command": "node ~/.claude/hooks/smart_completion_notifier.cjs Stop",
      "durationMs": 46894
    }
  ],
  "hookErrors": [],
  "preventedContinuation": false,
  "stopReason": "",
  "hasOutput": true,
  "level": "suggestion",
  "toolUseID": "1cef9425-..."
}
```

### subtype = "compact_boundary"

Conversation compaction marker. When the context gets too long, Claude Code compacts the conversation. This entry marks the boundary.

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "content": "Conversation compacted",
  "isMeta": false,
  "level": "info",
  "parentUuid": null,
  "logicalParentUuid": "694bbe70-...",
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 174366
  }
}
```

Note: After compaction, `parentUuid` is `null` (new chain start) but `logicalParentUuid` links back to the pre-compaction chain.

### subtype = "local_command"

Result of a local slash command (e.g., `/clear`).

```json
{
  "type": "system",
  "subtype": "local_command",
  "content": "<local-command-stdout></local-command-stdout>",
  "level": "info",
  "isMeta": false
}
```

---

## Type 5: `file-history-snapshot`

Tracks file backups for undo capability. **Does not have `uuid` or common fields.**

```json
{
  "type": "file-history-snapshot",
  "messageId": "44ccc8fe-...",
  "snapshot": {
    "messageId": "44ccc8fe-...",
    "trackedFileBackups": {
      "CLAUDE.md": {
        "backupFileName": "06a757158800f9ab@v1",
        "version": 1,
        "backupTime": "2026-03-13T18:10:09.753Z"
      }
    },
    "timestamp": "2026-03-13T18:10:09.789Z"
  },
  "isSnapshotUpdate": true
}
```

| Field                         | Type      | Description                                               |
| ----------------------------- | --------- | --------------------------------------------------------- |
| `messageId`                   | `string`  | UUID of the assistant message that caused the file change |
| `snapshot.trackedFileBackups` | `object`  | Map of filename to backup metadata                        |
| `isSnapshotUpdate`            | `boolean` | `false` = initial snapshot, `true` = incremental update   |

---

## Type 6: `queue-operation`

Task queue events for background agents.

```json
// Enqueue
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-03-13T19:34:35.855Z",
  "sessionId": "ea1bebc9-...",
  "content": "<task-notification>\n<task-id>aabe7f5c239d4df3e</task-id>\n..."
}

// Dequeue
{
  "type": "queue-operation",
  "operation": "dequeue",
  "timestamp": "2026-03-13T19:35:19.246Z",
  "sessionId": "ea1bebc9-..."
}
```

Operations are always paired: `enqueue` + `dequeue`. The `content` field (on `enqueue` only) contains an XML-like task notification with the agent's completion output.

---

## Type 7: `pr-link`

GitHub pull request references.

```json
{
  "type": "pr-link",
  "sessionId": "ea1bebc9-...",
  "prNumber": 22,
  "prUrl": "https://github.com/juspay/shooter/pull/22",
  "prRepository": "juspay/shooter",
  "timestamp": "2026-03-14T04:49:49.319Z"
}
```

---

## Type 8: `last-prompt`

Stores the last user prompt for session resumption.

```json
{
  "type": "last-prompt",
  "lastPrompt": "Okay, let's commit the changes...",
  "sessionId": "ea1bebc9-..."
}
```

---

## Tool Use / Tool Result Pairing

This is the core mechanism for understanding tool interactions.

### Linking pattern

1. **Assistant emits `tool_use`** in a content block with `id` field (e.g., `"toolu_01Jnmvv1g7p97fiiYaCUyBX6"`)
2. **User entry carries `tool_result`** with matching `tool_use_id`
3. The `user` entry's `parentUuid` equals the `assistant` entry's `uuid`
4. The `user` entry's `sourceToolAssistantUUID` also points to the same assistant `uuid`

```
assistant (uuid: "eff62533-...")
  content[0].type = "tool_use"
  content[0].id = "toolu_01Jnmvv1g7p97fiiYaCUyBX6"
  content[0].name = "Read"
       |
       v (parentUuid = "eff62533-...")
user (uuid: "dd82c8a2-...")
  content[0].type = "tool_result"
  content[0].tool_use_id = "toolu_01Jnmvv1g7p97fiiYaCUyBX6"
  sourceToolAssistantUUID = "eff62533-..."
```

### Tool result metadata (`toolUseResult`)

The `toolUseResult` field on `user` entries provides structured metadata about the tool execution, separate from the content sent back to the model. Its shape varies by tool:

#### Read tool

```json
{
  "type": "text",
  "file": {
    "filePath": "/path/to/file.md",
    "content": "file contents...",
    "numLines": 143,
    "startLine": 1,
    "totalLines": 143
  }
}
```

#### Glob tool

```json
{
  "filenames": ["/path/to/file.js"],
  "durationMs": 618,
  "numFiles": 1,
  "truncated": false
}
```

#### Bash tool

```json
{
  "stdout": "command output...",
  "stderr": "",
  "interrupted": false,
  "isImage": false,
  "noOutputExpected": false,
  "backgroundTaskId": "bodbwljpx" // optional, for background tasks
}
```

#### Edit tool

```json
{
  "filePath": "/path/to/file.ts",
  "oldString": "original text",
  "newString": "replacement text",
  "originalFile": "full original file content...",
  "structuredPatch": [
    {
      "oldStart": 9,
      "oldLines": 6,
      "newStart": 9,
      "newLines": 7,
      "lines": [" context", "-removed", "+added", " context"]
    }
  ],
  "userModified": false,
  "replaceAll": false
}
```

#### Write tool

```json
{
  "type": "create",
  "filePath": "/path/to/new-file.md",
  "content": "new file contents...",
  "structuredPatch": [],
  "originalFile": null
}
```

For updates: `"type": "update"` with `originalFile` populated and `structuredPatch` filled.

#### Grep tool

```json
{
  "mode": "content",
  "numFiles": 2,
  "filenames": ["file1.ts", "file2.ts"],
  "content": "matching lines...",
  "numLines": 5
}
```

#### Agent tool (async)

```json
{
  "isAsync": true,
  "status": "async_launched",
  "agentId": "aabe7f5c239d4df3e",
  "description": "Build and typecheck project",
  "prompt": "task instructions...",
  "outputFile": "/private/tmp/claude-501/.../tasks/aabe7f5c239d4df3e.output",
  "canReadOutputFile": true
}
```

#### Agent tool (completed, returned inline)

```json
{
  "status": "completed",
  "agentId": "ac6ef75512c6ebcd3",
  "prompt": "task instructions...",
  "content": [{ "type": "text", "text": "Agent results..." }],
  "totalDurationMs": 157519,
  "totalTokens": 23322,
  "totalToolUseCount": 17,
  "usage": { "input_tokens": 1, "..." }
}
```

#### Skill tool

```json
{
  "success": true,
  "commandName": "superpowers:brainstorming",
  "allowedTools": ["Bash(npx agent-browser:*)"] // optional
}
```

#### ToolSearch tool

```json
{
  "matches": ["WebSearch"],
  "query": "web search",
  "total_deferred_tools": 139
}
```

#### WebSearch tool

```json
{
  "query": "Vercel KV pricing 2026",
  "durationSeconds": 1.2,
  "results": [
    {
      "tool_use_id": "srvtoolu_01WmzyMxb2LYNLkf5e4V97mB",
      "content": [{ "title": "Vercel Pricing", "url": "https://vercel.com/pricing" }]
    }
  ]
}
```

#### TaskCreate tool

```json
{
  "task": {
    "id": "1",
    "subject": "Task 1-3: Build & Type System Fixes"
  }
}
```

#### TaskUpdate tool

```json
{
  "success": true,
  "taskId": "1",
  "updatedFields": ["status"],
  "statusChange": { "from": "pending", "to": "in_progress" },
  "verificationNudgeNeeded": false
}
```

#### Image result (screenshot tool)

```json
{
  "type": "image",
  "file": {
    "base64": "iVBORw0KGgoAAAANSUhEUgAAB14AAAZYCAIAAAC5Aved..."
  }
}
```

---

## Subagent Storage

### Directory structure

Each subagent gets its own JSONL file at:

```
<session-id>/subagents/agent-<agentId>.jsonl
<session-id>/subagents/agent-<agentId>.meta.json
```

### meta.json

```json
{
  "agentType": "general-purpose"
}
```

Known `agentType` values: `"general-purpose"`, `"feature-dev:code-explorer"`, `"Explore"`, and others.

### Subagent JSONL format

Subagent JSONL files use the **same format** as the main session, with these differences:

- All entries have `isSidechain: true`
- Entries include `agentId: "<agentId>"`
- The first entry is a `user` message containing the agent's prompt (with `promptId`)
- Entries share the parent session's `sessionId`

```json
{
  "type": "user",
  "isSidechain": true,
  "agentId": "a90094749833ad7cc",
  "promptId": "cd56e0d1-...",
  "message": {
    "role": "user",
    "content": "Search specifically for OpenCode UI wrappers..."
  },
  "uuid": "6812ce66-...",
  "parentUuid": null,
  "sessionId": "ea1bebc9-..."
}
```

### How subagents connect to the main session

1. Main session has `assistant` entry with `Agent` tool_use containing `run_in_background: true`
2. The `user` tool_result entry returns `agentId` in `toolUseResult`
3. The `agentId` maps to the filename `agent-<agentId>.jsonl`
4. While the agent runs, `progress` entries with `data.type: "agent_progress"` appear in the main JSONL, echoing the subagent's messages
5. When the agent completes, a `queue-operation` `enqueue` entry appears with the results, followed by a `dequeue` when the main conversation processes it

---

## Conversation Reconstruction Algorithm

To build a chat UI from a session JSONL:

### Step 1: Parse and index

```
entries = parse each line as JSON
uuid_index = map(uuid -> entry)
```

### Step 2: Build the conversation chain

The `parentUuid` field forms a linked list (with branching). The root has `parentUuid: null`.

```
root = entry where parentUuid is null
chain = follow parentUuid links forward (via children map)
```

Note: Branching occurs at `assistant` entries with tool_use. Both the `progress` (hook) entry and the `user` (tool_result) entry will have the same `parentUuid` pointing to the assistant entry.

### Step 3: Group assistant blocks into turns

Multiple `assistant` entries with the same `message.id` form a single API response:

```
api_responses = group assistant entries by message.id
for each group, ordered by line number:
  full_content = concat all content blocks
  final_stop_reason = last entry's stop_reason
```

### Step 4: Identify conversation turns

A "turn" consists of:

1. **User prompt** (type=`user`, no tool_result, no isMeta, no task-notification)
2. **Assistant response** (one or more API response groups)
3. **Tool interactions** (tool_use -> tool_result pairs, possibly multiple rounds)
4. **Final assistant text** (stop_reason=`"end_turn"`)
5. **System markers** (turn_duration, stop_hook_summary)

### Step 5: Filter for display

For a clean chat UI, skip:

- `progress` entries (background activity, hooks)
- `system` entries (metadata)
- `file-history-snapshot` entries (undo data)
- `queue-operation` entries (task queue internals)
- `user` entries with `isMeta: true` (system-injected prompts)
- `user` entries with `tool_result` content (tool responses -- show these inline with the tool call instead)
- `assistant` entries with only `thinking` blocks (redacted anyway)

Show:

- Real human prompts (user entries with text content)
- Assistant text blocks
- Assistant tool_use blocks (with their paired tool_result for context)
- Task-notification user messages (background agent completions)

### Step 6: Handle compaction

When you encounter `system` with `subtype: "compact_boundary"`:

- The conversation chain restarts (`parentUuid: null`)
- Use `logicalParentUuid` to reconnect to the pre-compaction chain
- Everything before compaction was summarized and is no longer in the active context

---

## Tool Names Reference

Tools observed in session data:

| Tool         | Description                                 |
| ------------ | ------------------------------------------- |
| `Read`       | Read file contents                          |
| `Write`      | Write/create files                          |
| `Edit`       | Edit files with string replacement          |
| `Bash`       | Execute shell commands                      |
| `Glob`       | File pattern matching                       |
| `Grep`       | Content search (ripgrep-based)              |
| `Agent`      | Launch subagents (foreground or background) |
| `Skill`      | Invoke skills/slash commands                |
| `WebSearch`  | Web search                                  |
| `ToolSearch` | Search for deferred tools                   |
| `TaskCreate` | Create a task tracking item                 |
| `TaskUpdate` | Update task status                          |

---

## tool-results Directory

Large tool outputs (especially `Read` results for big files) are saved to disk instead of being stored inline in the JSONL. Files are named either:

- `toolu_<id>.txt` -- keyed by tool_use_id
- `b<hash>.txt` -- keyed by an internal hash

These contain the raw output text (often with line-number prefixed format from the Read tool).

---

## Key Observations for Parser Implementers

1. **One content block per assistant entry.** Always. Group by `message.id` to reconstruct full responses.

2. **parentUuid forms a DAG, not a simple list.** Branching happens when a tool_use triggers both a progress event and a tool_result.

3. **Usage on assistant entries is unreliable except on the final block** (the one with non-null `stop_reason`).

4. **Subagent conversations are fully self-contained** in their own JSONL files but share the parent `sessionId`.

5. **`toolUseResult` is the richest source** of structured tool output data. The `tool_result.content` in the message is what was sent to the model (may be truncated), while `toolUseResult` has the full structured data.

6. **No entries have `isSidechain: true` in the main JSONL.** Sidechain entries only appear in subagent files.

7. **The `slug`** is a human-readable session identifier that persists across the session (e.g., `"recursive-moseying-kitten"`). It appears once the session is established (not on the very first entries).

8. **`file-history-snapshot`, `queue-operation`, `pr-link`, and `last-prompt` entries lack the common fields** (`uuid`, `parentUuid`, `isSidechain`, etc.) -- they are metadata entries, not conversation entries.
