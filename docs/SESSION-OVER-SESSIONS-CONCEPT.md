# Session Over Sessions (SoS) — Synthesis Concept Document

**Synthesized from:** 6 multi-lens mining passes, 375 + 92 knowledge-base entries  
**Date:** 2026-05-29  
**Author:** Synthesis agent, cross-referencing sos-agent-to-agent.md, sos-orchestration.md, sos-shared-context.md, sos-message-relay.md, sos-concurrent-sessions.md, sos-protocols-hitl.md

---

## 1. Crisp Definition

> **Session Over Sessions** is a meta-layer that (a) subscribes to N concurrently-running agent sessions (Claude Code, Codex, OpenCode, etc.), (b) reads each session's live event stream, and (c) routes, relays, and injects messages between sessions and into new sessions — presenting a single unified "super-session" to the human operator.

The user's verbatim intent: _"if one [agent session] is running, another is running; they both talk to each other in one session — a concept of session over sessions, which reads from both of these and passes to other ones."_

The coordinator is not passive. It is an active broker: it (1) observes child sessions' state machines, (2) decides which information crosses session boundaries, (3) injects that information into target sessions, and (4) escalates decisions to the human when policy requires it.

**What it is not**: a monolithic agent that replaces parallel sessions. SoS is the coordination membrane between autonomous agents, not a replacement for them.

**Grounding in the corpus**: The clearest name for this pattern already exists — Gas Town calls it "The Mayor AI Coordinator" (`githubprojects_3899619286326340159`); Octogent calls it "Octoboss" (`parasmadan.in_3877305782659851702`); Rob Hallam describes it as the Claude session that "has full context … writing prompts for Codex … managing like all these ten agents" (`robhallam__3851764032377748268`).

---

## 2. Technique Catalog

Each technique is labeled with the lens it came from and the source video(s).

---

### T1 — Beads Ledger / Named Mailboxes (Append-Only Shared State)

**Source videos**: Gas Town (`githubprojects_3899619286326340159`)  
**Lens**: agent-to-agent, orchestration, shared-context, message-relay, concurrent-sessions, protocols-HITL

**Mechanism**: Every work event (task assignment, tool result, context checkpoint) is appended as a "bead" to a git-backed or SQLite-backed append-only log. Each agent has a named identity and a mailbox. The coordinator writes to mailboxes; agents poll them. No IPC required — disk is the bus.

> "Built-in mailboxes, identities, and handoffs" / "Work state stored in Beads ledger" / "Scale comfortably to 20-30 agents"

**Maps to SoS**: The coordinator (meta-session) is "The Mayor." Worker sessions (Claude, Codex, OpenCode terminals) are "Polecats." The Beads ledger maps to a `sos_relay_log` SQLite table in `~/.shooter/shooter.db`. Each bead row: `(id, from_session, to_session, message_type, payload, ts, consumed_at)`.

**Architecture tier**: Persistence / message bus

---

### T2 — ACP Injection (`cband continue`) / HTTP Daemon

**Source videos**: Claudraband (`githubsignals_3874535135337291122`), VibeAround (`githubsignals_3890103852199156424`)  
**Lens**: agent-to-agent, message-relay, concurrent-sessions, protocols-HITL

**Mechanism**: Claudraband wraps Claude Code TUI in a controlled tmux pane and exposes a three-layer injection API: `cband continue <session-id> '<prompt>'` → HTTP POST → daemon → `tmux send-keys`. VibeAround adds `/handover`, `/pickup`, and `/switch <agent>` commands using the ACP Rust SDK to serialise and migrate session context across surfaces or across agent processes.

> "cband continue <session-id> 'what was the result of the research?'" / "Move a live coding session between terminal and IM with /handover / /pickup — full context preserved." / "Run /switch claude, /switch codex, or /switch cursor from any channel to switch agents on the fly"

**Maps to SoS**: Shooter's `pty-manager.ts` already owns PTYs via Unix-socket holder processes. The ACP injection layer sits on top: `POST /api/sessions/:id/inject` is the Claudraband equivalent. `/handover`+`/pickup` becomes two WebSocket events (`relay_handover`, `relay_pickup`) in `ws-protocol.yaml`. `/switch` becomes a `pty-manager.ts` attach/detach + context prefix injection.

**Architecture tier**: Write-side relay / control plane

---

### T3 — Coordinator + Worker Topology (Hub-and-Spoke)

**Source videos**: Octogent (`parasmadan.in_3877305782659851702`), Rob Hallam (`robhallam__3851764032377748268`), Ruflo (`aiadventureryt_3869407061121786825`)  
**Lens**: orchestration, concurrent-sessions, agent-to-agent

**Mechanism**: One coordinator session holds the plan and context map; N worker sessions execute specialized subtasks. Octogent's Octoboss dispatches to domain-specialist swarms (Frontend UI / API Backend / Docs & Knowledge). Rob Hallam's Claude acts as "taste guy" — reads all Codex outputs, synthesizes decisions, and generates the next Codex prompts. Octogent names the coordinator's terminal ID pattern: `docs-knowledge-swarm-1`.

> "Claude has full context of my code base and everything and it's writing prompts for Codex. Codex outputs something, I give it to Claude." / "Your terminal ID is `docs-knowledge-swarm-1`"

**Maps to SoS**: Shooter's SoS meta-session IS the Octoboss. Its `sos_sessions` SQLite table stores `(session_id, capability, status, coordinator_id)`. Routing rule: capability-first (route auth tasks to the "backend" Claude session, UI tasks to the "frontend" Codex session). A `PERMISSION` node in the graph routes all PermissionRequests through a single APNs notification queue.

**Architecture tier**: Routing / dispatch

---

### T4 — Process-Table Auto-Discovery + Hook Event PID Mapping

**Source videos**: Claude Control (`githubsignals_3877154328675116231`), agtop (`githubsignals_3876376987761906329`)  
**Lens**: concurrent-sessions, message-relay, protocols-HITL

**Mechanism**: Claude Control scans the OS process table for `claude` PIDs. Hook events (`SubagentStart`, `PreToolUse`, etc.) carry the authoritative PID-to-JSONL-path mapping. mtime on `~/.claude/` JSONL files is the fallback for sessions started before the monitor. This gives zero-config discovery of all running sessions. agtop adds `context_pressure` as a real-time metric — the trigger for compaction-triggered relay.

> "Detects all running claude CLI processes via the process table, uses hook events for authoritative PID-to-JSONL mapping with mtime-based fallback." / "Classifies each session as Working, Idle, Waiting (needs input), Errored, or Finished"

**Maps to SoS**: Shooter's `session-watcher.ts` already tails JSONL via chokidar. Add: (1) `pgrep -la claude` on a 5-second poll, (2) a 5-state session status machine (`Working | Idle | Waiting | Compacting | Finished`) in `terminal-store.ts`. Context pressure >70% triggers the PreCompact snapshot relay.

**Architecture tier**: Discovery / observation

---

### T5 — PreCompact Hook Interception (Context Boundary Survival)

**Source videos**: Claude Harness (`githubsignals_3888917703615132104`)  
**Lens**: shared-context, orchestration, message-relay, concurrent-sessions

**Mechanism**: Claude Code v2.1.105+ fires a `PreCompact` lifecycle hook before silently compacting a long context window. The harness intercepts this, writes the full pre-compaction state to `Plans.md` (a git-tracked, session-surviving artifact), and optionally blocks compaction until state is saved. `harness-mem` re-injects this summary into the next session's initial context.

> "Long-running tasks no longer get cut off mid-flight by automatic compaction." / "harness-mem integration: sessions remember what you worked on last time."

**Maps to SoS**: Register a `PreCompact` hook in `.claude/settings.json` → `notifier.cjs`. On fire: (1) serialize last-N JSONL events to `sos_relay_log` with `message_type='precompact_snapshot'`, (2) send a push notification "session compacting", (3) return `{"action":"continue"}`. On next session start, the coordinator reads the snapshot and injects it as a context prefix. This closes the restart-context-loss gap.

**Architecture tier**: Context lifecycle / persistence

---

### T6 — Structured Trace Capture + Skill Propagation (Knowledge Plane)

**Source videos**: Hivemind (`githubsignals_3896549067676034823`)  
**Lens**: shared-context, orchestration, agent-to-agent

**Mechanism**: Hivemind intercepts file operations on `~/.deeplake/memory/` via a virtual filesystem backed by SQL. Every agent session's prompts, tool calls, and results are captured as structured traces. Patterns are codified into reusable skills and propagated in real-time to all connected agents via the shared mount point. A background worker at session-end generates AI-produced wiki summaries.

> "One engineer's agent figures out a tricky migration on Monday. Tuesday, every agent on the team can execute the pattern." / "Intercepts file operations on ~/.deeplake/memory/ through a virtual filesystem backed by SQL" / "Summarizes sessions into AI-generated wiki pages via a background worker at session end"

**Maps to SoS**: Shooter's `session-watcher.ts` already reads JSONL — this is the trace capture. Add: (1) a `sos_memory` SQLite table `(session_id, summary_text, relevance_score, created_at)`, (2) a background summarizer that runs at `Stop` hook time, (3) a context injector that reads the top-3 relevant summaries and prepends them to a new session's initial prompt. No Deeplake needed; SQLite FTS5 replaces the vector store for keyword retrieval.

**Architecture tier**: Knowledge plane / ambient memory

---

### T7 — Ambient Memory Gardener Daemon

**Source videos**: jcode (`wassimyounes__3886731891801439107`), Mercury (`githubprojects_3883123658403563467`)  
**Lens**: shared-context, orchestration, concurrent-sessions

**Mechanism**: jcode ships an "Ambient agent" — a background process with no user interaction that continuously reads all session outputs, prunes stale memory entries, consolidates related items, and updates a shared store. It runs during idle windows of the primary agents, never blocking their forward progress.

> "Ambient agent that gardens your memory while you sleep."

**Maps to SoS**: A `SosMemoryGardener` background coroutine in `server.ts` runs every 30 seconds when all sessions are Idle simultaneously. It reads from `sos_memory`, calls a lightweight LLM (Neurolink / Claude Haiku) to consolidate, and writes a single `context_summary` row. On session start, this summary is the injection payload.

**Architecture tier**: Background maintenance

---

### T8 — Two-Tier Policy Gate + Audit Log

**Source videos**: CrabTrap (`githubsignals_3881292748473284075`)  
**Lens**: protocols-HITL

**Mechanism**: HTTP proxy sits between agent and the outside world. Tier 1: static URL/pattern rules (deterministic, O(1)). Tier 2 on no-match: LLM policy judge. Outcome: ALLOW, DENY (403), or (extended) ESCALATE-TO-HUMAN. Every decision logged to a PostgreSQL audit table.

> "AI Agent (HTTP_PROXY set) → TLS Decrypt → Static Rules → LLM Judge → DENY-403 / ALLOW → External API. AUDIT LOG — every request and decision logged."

**Maps to SoS**: The SoS coordinator's inter-session message router implements the same two tiers: (1) allowlist check (trusted session pairs + allowed message types), (2) LLM classify for ambiguous relay decisions. ESCALATE → APNs push. A `relay_decisions` SQLite table audits every routing choice. Set `HTTP_PROXY` in `pty-holder.cjs` environment to route outbound agent calls through a local CrabTrap instance.

**Architecture tier**: Policy / guardrails

---

### T9 — HITL Permission Relay (Centralized Approval Queue)

**Source videos**: Claude Control, Paseo (`github.awesome_3874757184274547172`), Claudraband  
**Lens**: protocols-HITL, concurrent-sessions, message-relay

**Mechanism**: All PermissionRequest hook events from all running sessions are routed to a single centralized approval interface (dashboard or mobile app) rather than each session handling its own. Claudraband's HTTP daemon answers pending prompts via `POST /sessions/<id>/answer`. Paseo routes terminal-command approvals to the phone with real-time streaming.

> "Approve or reject tool-use permission prompts directly from the dashboard without switching to the terminal." / "Approve terminal commands [from phone]." / "answer pending prompts, expose them through a daemon, or drive them through ACP"

**Maps to SoS**: Shooter already implements this for its own Claude sessions (`notifier.cjs` → APNs → `/api/response`). Generalize: any session registered with the SoS coordinator has its `PermissionRequest` routed through Shooter's mobile notification flow, not independently. Batch multiple simultaneous requests within a 2-second window and send a single grouped notification.

**Architecture tier**: HITL / approval loop

---

### T10 — Round-Robin CLI Proxy (Capacity-Aware Routing)

**Source videos**: Rob Hallam (`robhallam__3851764032377748268`), CodexBar (`githubsignals_3901965695855070705`)  
**Lens**: concurrent-sessions, message-relay

**Mechanism**: `github.com/liltspater/CLIProxyAPI` replaces Claude Code's `base_url` via an environment variable, routing API calls to a local proxy that round-robins across multiple accounts/tokens. CodexBar polls provider rate-limit endpoints to expose per-provider capacity, enabling capacity-aware routing.

> "you can essentially like go beneath Claude code and you just like change the URL that it's making API calls to and everything gets uh routed through this proxy, so it automatically does like a Round Robin"

**Maps to SoS**: Set `ANTHROPIC_BASE_URL` in each child session's `pty-holder.cjs` environment to point at a local CLIProxyAPI instance. The coordinator uses CodexBar-style capacity metrics to route new tasks to the session with the most available quota.

**Architecture tier**: Resource management / rate-limit avoidance

---

### T11 — Git Worktree Isolation per Agent

**Source videos**: 1Code (`github.awesome_3813895435787141916`), Gas Town, Capy (`olaconleyy_3855946079321848360`)  
**Lens**: concurrent-sessions, orchestration

**Mechanism**: Each parallel agent session works in its own isolated Git worktree (separate branch + working directory). This eliminates merge conflicts between concurrent writers. The coordinator merges outputs via PR/diff review after each session completes. 1Code calls this "Branch Safety — Never accidentally commit to main branch."

> "1Code fixes this by wrapping the agent in a visual dashboard that lets you run multiple tasks at once. You can have one agent fixing a bug and another writing docs simultaneously, each running in its own isolated Git."

**Maps to SoS**: WorkForge (Sachin's own worktree management tool) already provides the primitive. When the coordinator dispatches a task to a worker session, it calls WorkForge to create a worktree, sets it as the session's working directory in `pty-holder.cjs`, and later surfaces a diff-review notification when the session reaches `Finished` state.

**Architecture tier**: Isolation / conflict prevention

---

## 3. Reference Patterns and Trade-offs

### Pattern A — Blackboard (Shared Persistent Store)

**What it is**: All sessions read from and write to a single shared store (SQLite `sos_relay_log` + `sos_memory` + `sos_sessions`). The coordinator mediates reads/writes. No direct session-to-session IPC.

**Fits**: Gas Town (Beads ledger), Hivemind (virtual-fs + SQL), agentsview (SQLite + SSE), Mercury (SQLite Second Brain), harness-mem (Plans.md).

**Trade-offs**:

- Pro: survives process restarts; no coupling between sessions; append-only = trivially auditable; matches Shooter's existing `terminal-store.ts` design
- Pro: SQLite handles concurrent reads with WAL mode at zero operational cost
- Con: eventual consistency — a session reading the blackboard sees a state that is slightly stale; not suitable for sub-100ms synchronous coordination
- Con: requires the coordinator to poll or watch the store; adds a polling loop

**Best fit for SoS**: Yes. This is the primary persistence and relay mechanism for Shooter.

---

### Pattern B — Message Bus / SSE Fan-Out

**What it is**: The coordinator exposes an SSE endpoint (`GET /api/sos/events`). All sessions subscribe. The coordinator writes events; subscribers filter by `session_id`. Agentsview implements this pattern exactly.

**Fits**: agentsview (SQLite + SSE), Capy (Slack as message bus), Claude Control (native notifications as push events).

**Trade-offs**:

- Pro: real-time delivery without polling; fits Shooter's existing WebSocket architecture (add a `channel: 'sos'` type to the WS multiplexer)
- Pro: clients can subscribe/unsubscribe without coordinator changes
- Con: stateless — a session that reconnects misses events not replayed from the SQLite store
- Con: relies on an open connection; sessions that restart lose their subscription

**Best fit for SoS**: Yes, for the delivery layer on top of the blackboard. SSE/WebSocket delivers; SQLite stores.

---

### Pattern C — Supervisor-Orchestrator (Plan + Dispatch Loop)

**What it is**: The coordinator generates a structured plan (like Harness's `Plans.md`) before dispatching. Each step is assigned to a worker session by capability. The coordinator blocks on the current step until it completes, then dispatches the next. Ruflo and Octogent implement this.

**Fits**: Claude Harness (Plan→Work→Review→Commit lifecycle), Octogent (Octoboss step-by-step instructions), Ruflo (graph-structured specialization), Verdant AI (write/debug/test parallelization).

**Trade-offs**:

- Pro: deterministic execution order; coordinator knows when to relay (step N output → step N+1 input)
- Pro: each step is a discrete artifact reviewable by the human
- Con: sequential steps cannot be parallelized; coordination overhead for each step
- Con: requires the coordinator to be an LLM agent itself, adding latency and cost per dispatch cycle

**Best fit for SoS**: For planned, multi-step tasks (e.g., "design + implement + test an API endpoint"). Not suitable for reactive/event-driven relay.

---

### Pattern D — Direct Agent-to-Agent (ACP / tmux injection)

**What it is**: Session A sends a message directly to Session B via ACP or PTY stdin injection, without routing through the coordinator. VibeAround's `/handover`+`/pickup` and Claudraband's `cband continue` both fit here.

**Fits**: VibeAround (ACP Rust SDK, `/switch`), Claudraband (cband continue, ACP server), jcode (swarm bridge node).

**Trade-offs**:

- Pro: lowest latency; no coordinator overhead per message
- Pro: VibeAround + Claudraband are off-the-shelf solutions usable today
- Con: no central audit trail unless the coordinator is copied on each relay
- Con: tight coupling between sessions — Session A must know Session B's address
- Con: ACP is an emerging standard with evolving spec; may require updates as protocol matures

**Best fit for SoS**: For real-time interactive relays (user typing `/switch codex` from the phone) and for the HITL relay path (coordinator receives approval → `cband continue` → session unblocks).

---

### Pattern E — Round-Robin / Capacity-Aware Router

**What it is**: The coordinator dispatches tasks not by capability but by available capacity, selecting the session with the most remaining token/rate quota. CLIProxyAPI and CodexBar implement the primitives.

**Fits**: Rob Hallam (CLI proxy round-robin), CodexBar (capacity monitoring for 40+ providers).

**Trade-offs**:

- Pro: maximizes throughput; prevents stalls from rate limits
- Pro: zero changes to agent code (env-var base_url override)
- Con: ignores specialization — a frontend task may be routed to a backend-capable session purely because it has more quota
- Con: CLIProxyAPI is a community tool with no SLA; needs validation

**Best fit for SoS**: As a secondary routing layer after capability-based dispatch. Route within a capability-matched set using round-robin.

---

## 4. Implementation Mapping to Shooter (Existing Infrastructure)

| SoS concern       | Existing Shooter primitive                               | Gap to close                                                            |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Session discovery | `session-watcher.ts` (chokidar on JSONL)                 | Add process-table scan (T4); add Codex/OpenCode session paths           |
| State machine     | `terminal-store.ts` (`status: active/exited`)            | Add 5-state model: `Working/Idle/Waiting/Compacting/Finished`           |
| Message bus       | `WebSocket server` (channels: terminal/session/events)   | Add `sos` channel; add `sos_relay_log` SQLite table                     |
| Write-side relay  | `pty-manager.ts` → `holder-client.ts` → Unix socket      | Add `POST /api/sessions/:id/inject`; optionally integrate Claudraband   |
| Context survival  | `pty-holder.cjs` (5000-line scrollback, `.exit` sidecar) | Add `PreCompact` hook → SQLite snapshot → re-injection on session start |
| Knowledge plane   | `session-watcher.ts` reads JSONL                         | Add `sos_memory` table; background summarizer at `Stop` hook            |
| HITL approval     | `notifier.cjs` → APNs → `/api/response`                  | Generalize to multi-session queue; batch concurrent requests            |
| Isolation         | PTY per session (separate processes)                     | Add git worktree assignment via WorkForge per dispatched task           |
| Policy            | None                                                     | Add two-tier static-rules + LLM judge; `relay_decisions` audit table    |

**New SQLite tables** (all in `~/.shooter/shooter.db`):

1. `sos_sessions(session_id, capability, coordinator_id, status, last_context_summary, registered_at)`
2. `sos_relay_log(id, from_session, to_session, message_type, payload, ts, consumed_at)` — the Beads ledger
3. `sos_memory(id, session_id, summary_text, relevance_score, created_at)` — ambient knowledge plane
4. `relay_decisions(id, from_session, to_session, message_type, tier1_result, tier2_result, final_decision, reason, human_response, ts)` — audit log

**New WebSocket event types** (extends `ws-protocol.yaml`):

1. `relay_handover` — session A → coordinator: serialize context snapshot
2. `relay_pickup` — coordinator → session B: inject context
3. `relay_switch` — reroute channel to different holder
4. `relay_status` — session broadcasts Working/Idle/Waiting/Compacting/Finished
5. `sos_permission_request` — centralized permission queue event

**New server modules** (under `src/lib/modules/server/sos/`):

1. `coordinator.ts` — The Mayor: reads relay_log, routes messages, tracks session status
2. `memory-gardener.ts` — ambient background process: reads JSONL, writes sos_memory
3. `context-injector.ts` — reads sos_memory on session start, prepends to first prompt
4. `policy-gate.ts` — two-tier relay decision engine + audit logging

---

## 5. Completeness Check — Thin Themes and Verification Needs

### Thin in corpus

| Theme                                         | Thinness                                                                                                                                                                  | What to verify                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **ACP protocol spec**                         | ACP appears in Claudraband and VibeAround but the actual spec document is not in the corpus. Both reference it as "emerging standard."                                    | Check `github.com/halfwhey/claudraband` and `github.com/jazzenchen/vibearound` for ACP spec links; verify current message schema   |
| **OpenCode session format**                   | `opencode-watcher.ts` exists in Shooter but the corpus has very few entries on OpenCode's internal session format. Codex JSONL format is also unverified.                 | Consult `codex-format.md` and `gemini-format.md` already in `/tmp/provider-research/`; verify against agentsview's 13-agent schema |
| **Two-way coordinator ↔ session messaging**   | All corpus entries show the coordinator WRITING to sessions; none clearly show a session proactively WRITING to the coordinator without a hook event trigger.             | Verify whether JSONL contains arbitrary agent-initiated "signal" events, or whether the only cross-session signals are hook events |
| **Conflict resolution for concurrent writes** | The Rob Hallam case shows merge conflicts are a real problem at 10 agents without worktrees. The corpus has no detailed treatment of merge resolution strategies.         | Verify 1Code's built-in git client handles merge resolution; check if WorkForge has merge-conflict tooling                         |
| **Non-Claude agent hooks**                    | All hook-event-based discovery and relay mechanisms assume Claude Code's hook system. Codex and OpenCode have different or no hook systems.                               | Verify Codex CLI's lifecycle events; check if agtop or agentsview expose an event API for non-Claude agents                        |
| **MCP as inter-agent protocol**               | CrabTrap (Cua Driver, Semble) suggest exposing the SoS meta-session as an MCP server. This is mentioned in the protocols-HITL lens but no implementation detail is given. | Check if Claude Code can call an MCP tool that belongs to a sibling session; verify MCP tool-call event shape in JSONL             |
| **Distributed / multi-machine SoS**           | Paseo mentions multiple hosts but the corpus does not detail how session state is synchronized across machines.                                                           | Paseo's GitHub repo (`getpaseo/paseo`) may have the multi-host sync protocol; verify                                               |

### Verification priorities (ordered by implementation impact)

1. ACP spec — needed before building the write-side relay (T2)
2. Codex + OpenCode session formats — needed before extending `session-watcher.ts` (T4)
3. Non-Claude hook equivalents — determines whether auto-discovery works for Codex/OpenCode or requires polling only
4. MCP as meta-session interface — determines whether coordinator tools can be natively callable from child sessions

---

## 6. Quick-Reference Source Map

| Video (entry ID)                     | Tool           | Technique(s)                                        |
| ------------------------------------ | -------------- | --------------------------------------------------- |
| `githubprojects_3899619286326340159` | Gas Town       | T1 (Beads ledger, mailboxes), T11 (worktrees)       |
| `githubsignals_3874535135337291122`  | Claudraband    | T2 (ACP injection, HTTP daemon), T9 (HITL relay)    |
| `githubsignals_3890103852199156424`  | VibeAround     | T2 (/handover /pickup /switch), T9                  |
| `robhallam__3851764032377748268`     | Rob Hallam     | T3 (Claude-as-coordinator), T10 (round-robin proxy) |
| `parasmadan.in_3877305782659851702`  | Octogent       | T3 (Octoboss + worker topology)                     |
| `githubsignals_3877154328675116231`  | Claude Control | T4 (process-table discovery, 5-state machine), T9   |
| `githubsignals_3876376987761906329`  | agtop          | T4 (context pressure metric)                        |
| `githubsignals_3888917703615132104`  | Claude Harness | T5 (PreCompact hook, harness-mem)                   |
| `githubsignals_3896549067676034823`  | Hivemind       | T6 (trace capture, skill propagation)               |
| `wassimyounes__3886731891801439107`  | jcode          | T7 (ambient memory gardener)                        |
| `githubprojects_3883123658403563467` | Mercury        | T7 (SQLite Second Brain)                            |
| `githubsignals_3881292748473284075`  | CrabTrap       | T8 (policy gate, audit log)                         |
| `github.awesome_3874757184274547172` | Paseo          | T9 (mobile HITL), T10                               |
| `github.awesome_3813895435787141916` | 1Code          | T11 (git worktree isolation)                        |
| `githubsignals_3873681943942715245`  | agentsview     | Pattern B (SQLite + SSE multi-agent index)          |
| `githubsignals_3901965695855070705`  | CodexBar       | T10 (capacity-aware routing)                        |
| `aiadventureryt_3869407061121786825` | Ruflo          | T3 (graph-structured specialization)                |
| `aiadventureryt_3854116214570574574` | Verdant AI     | T3 (write/debug/test parallelization)               |
| `olaconleyy_3855946079321848360`     | Capy           | T11, Pattern B (Slack as notification bus)          |
