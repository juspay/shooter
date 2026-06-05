# Multi-Provider AI-Agent Support

Shooter mirrors AI coding-agent sessions to your phone, provides remote terminals, and
sends push notifications. It started Claude-Code-only, then added OpenCode, and now
**Codex** and **Gemini**. This doc explains how providers plug in and how to add more.

> Sources for the provider formats below were reverse-engineered from real session data
> on a developer machine and cross-checked against `wesm/agentsview` (a Go tool that
> parses ~30 agent formats). See `plans/` for the full research corpus.

## The provider seams

Every provider normalizes to the same canonical shapes (`ConversationMessage`,
`SessionInfo`, `ProjectGroup`, `DetectedProcess`) so the UI and WebSocket layers stay
provider-agnostic. Adding a provider touches these layers:

| Layer              | File(s)                                                                                                 | What a provider supplies                            |
| ------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Type discriminator | `specs/types/sessions.yaml` (`SessionSource`), `src/lib/types/sessions.ts` (`DetectedProcess.command`)  | a `source` id + CLI command                         |
| Listing + history  | `src/lib/modules/server/sessions/<p>-reader.ts`                                                         | `list*Projects()`, `get*Conversation()`             |
| Live mirroring     | `src/lib/modules/server/terminal/<p>-watcher.ts` (or reuse)                                             | `getHistory()`, `subscribe()`                       |
| Detection          | `src/lib/modules/server/sessions/process-detector.ts`                                                   | "is a session live?"                                |
| Aggregation        | `src/routes/api/sessions/+server.ts`                                                                    | merge into the project list + conversation fallback |
| Terminal linking   | `src/lib/modules/server/terminal/pty-manager.ts` (`startSessionDiscovery`)                              | map a launched terminal → its session file          |
| WS dispatch        | `server.ts` (`sessionWatcherAdapter`), `ws/session-handler.ts`                                          | route a session key to the right watcher            |
| Launch / resume    | `LaunchSheet.svelte`, `/api/terminals` (allowlist), `/api/sessions/connect` (resume args)               | preset + resume convention                          |
| UI labels          | `client/common/provider.ts` (`sourceToCommand`/`sourceLabel`), project/session pages, `theme.css` pills | command map + label + pill                          |
| Notifications      | `.claude/hooks/notifier.cjs` (`adapt*Event`) + the CLI's hook config                                    | event adapter                                       |

`client/common/provider.ts` uses `Record<SessionSource, …>`, so adding a value to the
`SessionSource` enum forces a compile error until every mapping is handled.

### The registry (server)

`server/sessions/registry.ts` is the single source of truth for the listing/conversation
layer — a `PROVIDERS: ProviderDef[]` array (à la agentsview's `AgentDef`). The session API,
the `/api/sessions/connect` resume-args, and the `/api/terminals` allowlist all derive from
it (`listAllProviderProjects`, `getProviderConversation`, `resumeArgsForCommand`,
`PROVIDER_COMMANDS`). Adding a provider's listing/history is **one entry** here plus its
reader — no edits to the API routes. (Detection and live watching stay provider-specific.)

### Providers

| Source                   | Storage                                                          | Notes                                    |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| `claude-code`            | `~/.claude/projects/<cwd>/<id>.jsonl`                            | reference                                |
| `opencode`               | SQLite (`~/.local/share` **or** `~/Library/Application Support`) | path probed by existence                 |
| `codex`                  | `~/.codex/sessions/**/rollout-*.jsonl`                           | full parity + live watcher               |
| `gemini`                 | `~/.gemini/tmp/<hash>/{logs.json,chats/}`                        | best-effort                              |
| `qwen`                   | `~/.qwen/projects/<cwd>/chats/<id>.jsonl`                        | Claude envelope + Gemini `message.parts` |
| `cursor`,`copilot`,`amp` | per agentsview spec                                              | spec-based readers                       |

## Codex (full parity)

- **Sessions:** `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (+ `archived_sessions/`).
  JSONL records `{timestamp, type, payload}`; `response_item` records are the conversation
  source of truth (`event_msg`/`turn_context`/`compacted` are control/UI noise).
- **Parser** (`codex-parser.ts`): maps `message`/`reasoning`/`function_call`/`custom_tool_call`/
  `web_search_call` (+ `*_output`) to `MessagePart`s using **role-run grouping** (consecutive
  same-category parts merge into one bubble; flush on category change). `developer` messages and
  encrypted-only `reasoning` are skipped; injected `<environment_context>` wrappers are stripped
  from titles. `CodexStreamParser` provides incremental parsing for the live watcher.
- **Reader** (`codex-reader.ts`): bounded reads (session files can be **hundreds of MB**) — a
  256 KB prefix for metadata/title, size-estimated message counts, tail-bounded conversation reads.
- **Watcher** (`codex-watcher.ts`): chokidar tail + `CodexStreamParser`, with an idle-flush so the
  final turn isn't withheld (role-run grouping only flushes when the _next_ run begins).
- **Detection:** rollout files written in the last 3 min (robust against the WAL-locked `state_5.sqlite`).
- **Launch/resume:** `codex` / `codex resume <id>`. Linking finds the rollout file by cwd + birthtime.
- **Notifications:** Codex has a `~/.codex/hooks.json` system (SessionStart/UserPromptSubmit/
  PreToolUse/PostToolUse/PermissionRequest/Stop). `notifier.cjs` has a Codex adapter; copy
  `.claude/hooks/codex-hooks.example.json` to `~/.codex/hooks.json`.

## Gemini (best-effort)

- **Sessions:** `~/.gemini/tmp/<projectHash>/logs.json` (user prompts only, older format) and
  `~/.gemini/tmp/<projectHash>/chats/session-*.json` (full `ConversationRecord` with tool calls +
  thoughts, newer format). `projectHash = sha256(cwd)`; reverse-mapped via `~/.gemini/projects.json`.
- Live transcripts depend on the installed gemini-cli version persisting `chats/`. gemini-cli also
  has a rich hook system and injects `CLAUDE_PROJECT_DIR`, so `notifier.cjs` is reusable for it.
- **Wired:** listing + history (`/api/sessions`), detection (`process-detector`), launch (`LaunchSheet`/
  allowlist), and the source label/pill. Launching `gemini` gives a working raw terminal.
- **Not yet wired (deferred, best-effort):** a dedicated live _structured_ watcher + `pty-manager`
  session discovery for Gemini (no `chats/` data was available to verify against on the dev machine);
  see roadmap item 5. History still renders via the REST reader.

## Roadmap (mined from the knowledge base)

Implemented: Codex full parity; incremental byte-offset live parsing; `task_complete`-aware
detection signal; Gemini reader; **provider registry** (the listing/conversation layer is now
registry-driven); **Qwen Code** reader; **OpenCode XDG path fix** (recovered sessions that the
darwin-only path resolution was hiding); Cursor/Copilot/Amp readers (spec-based).

Recommended next (highest leverage first):

1. **Codex/Gemini bidirectional permissions** — wire the hook `PermissionRequest`/`Notification`
   events into the existing poll-for-decision flow so Allow/Deny works from the phone.
2. **Session status badges** (Working / Waiting / Errored / Finished) derived from the transcript
   (`task_complete`/`Stop`/`AfterAgent`), surfaced on the terminal + project lists.
3. **Token/cost tracking** — Codex `token_count` + Claude `usage` are already in the transcripts.
4. **OpenCode dual-backend** — also read the newer `~/.local/share/opencode/storage/` file backend
   (file-per-message), not just SQLite, for installs that use it.
5. **Gemini live structured mirroring** — a `gemini-watcher.ts` (chokidar on `chats/session-*.json`,
   atomic-rewrite diffing) + a `pty-manager` discovery branch + a `terminal-store` column, so a
   launched `gemini` terminal streams into the Chat view like Codex/Claude.
