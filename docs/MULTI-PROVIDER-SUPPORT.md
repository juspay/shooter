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
  see roadmap item 6. History still renders via the REST reader.

## Roadmap (mined from the knowledge base)

Implemented: Codex full parity; incremental byte-offset live parsing; `task_complete`-aware
detection signal; Gemini reader.

Recommended next (highest leverage first):

1. **Registry-pattern abstraction** — collapse the per-provider branches across ~14 files into a
   single `AgentDef` registry entry per provider (pattern proven in `agentsview`). Biggest
   maintainability win; do it before adding a 5th provider.
2. **Codex/Gemini bidirectional permissions** — wire the hook `PermissionRequest`/`Notification`
   events into the existing poll-for-decision flow so Allow/Deny works from the phone.
3. **Session status badges** (Working / Waiting / Errored / Finished) derived from the transcript
   (`task_complete`/`Stop`/`AfterAgent`), surfaced on the terminal + project lists.
4. **Token/cost tracking** — Codex `token_count` + Claude `usage` are already in the transcripts.
5. **OpenCode dual-backend** — also read the newer `~/.local/share/opencode/storage/` file backend,
   not just SQLite (correctness fix for upgraded OpenCode installs).
6. **Gemini live structured mirroring** — a `gemini-watcher.ts` (chokidar on `chats/session-*.json`,
   atomic-rewrite diffing) + a `pty-manager` discovery branch + a `terminal-store` column, so a
   launched `gemini` terminal streams into the Chat view like Codex/Claude.
