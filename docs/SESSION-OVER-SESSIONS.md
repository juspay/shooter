# Session Over Sessions (SoS) — Concrete Build Design for Shooter

**Date:** 2026-05-29  
**Target repo:** `juspay/shooter`  
**Status:** Design only — no code written yet

---

## 1. What We Are Building

A **SessionOverSessions coordinator** is a server-side meta-layer that:

1. Subscribes to N concurrently-running agent sessions (any of the 9 providers in `registry.ts`) by reusing existing watchers.
2. Merges their event streams into one unified, source-tagged transcript.
3. Relays tagged messages between member sessions by injecting text into target PTY stdin via `pty-manager`'s `pty.write`, or by writing to a shared SQLite relay log that target sessions poll.
4. Surfaces the merged super-session over a new WebSocket channel (`/ws/super-session/:id`) modelled on `session-handler.ts`.
5. Lets the human approve or veto relays from the phone via APNs, extending the existing `notifier.cjs` HITL flow.

This is not a monolithic orchestrator that replaces parallel sessions. It is a coordination membrane — The Mayor (Gas Town T1) — sitting between autonomous agents.

---

## 2. Data Model

### 2.1 Tagged ConversationMessage

`ConversationMessage` (in `src/lib/types/sessions.ts`) gains one optional field:

```ts
export interface ConversationMessage {
  id: string;
  parts: MessagePart[];
  role: MessageRole;
  timestamp: string;
  // SoS extension — only present on messages inside a SuperSession transcript
  sos?: {
    memberId: string; // opaque member ID from sos_sessions
    provider: SessionSource; // 'claude-code' | 'opencode' | 'codex' | …
    sessionKey: string; // JSONL path or OpenCode session UUID
    relayed?: boolean; // true if this message was injected by the coordinator
  };
}
```

The field is optional so that every existing consumer of `ConversationMessage` continues to work unchanged.

### 2.2 SuperSession

New hand-written type in `src/lib/types/sos.ts` (re-exported from `src/lib/types/index.ts`):

```ts
export type SosMemberStatus = 'Working' | 'Idle' | 'Waiting' | 'Compacting' | 'Finished';

export interface SosMember {
  id: string; // random hex (PK in sos_sessions)
  sessionKey: string; // JSONL path for JSONL-based; OpenCode session UUID for SQLite-based
  terminalId: string | null; // PtyManager terminal ID if launched via Shooter; null for external sessions
  provider: SessionSource;
  capability: string; // free-text tag: 'frontend' | 'backend' | 'docs' | '' etc.
  status: SosMemberStatus;
  lastContextSummary: string | null;
  registeredAt: string; // ISO timestamp
}

export interface SosRoutingRule {
  id: string;
  superSessionId: string;
  fromMemberId: string | 'ANY';
  toMemberId: string | 'ANY';
  matchPattern: string; // substring or regex string; empty = match all
  action: 'relay' | 'block' | 'escalate';
  priority: number; // lower = checked first
}

export interface SuperSession {
  id: string; // random hex (URL-safe)
  label: string; // human-readable name, e.g. "breeze-refactor"
  members: SosMember[];
  routingRules: SosRoutingRule[];
  mergedTranscript: ConversationMessage[]; // source-tagged; in-memory ring buffer, max 500 entries
  createdAt: string;
  status: 'active' | 'paused' | 'archived';
}
```

### 2.3 SQLite Tables (added to `~/.shooter/shooter.db`)

```sql
-- Registered sessions in a super-session
CREATE TABLE IF NOT EXISTS sos_sessions (
  id TEXT PRIMARY KEY,                 -- SosMember.id
  super_session_id TEXT NOT NULL,
  session_key TEXT NOT NULL,           -- JSONL path OR opencode UUID
  terminal_id TEXT,                    -- ptyManager terminal ID or NULL
  provider TEXT NOT NULL,
  capability TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Idle', -- Working|Idle|Waiting|Compacting|Finished
  last_context_summary TEXT,
  registered_at TEXT NOT NULL
);

-- The Beads ledger (T1 — Gas Town)
-- Append-only. The coordinator writes beads; members poll for unconsumed ones.
CREATE TABLE IF NOT EXISTS sos_relay_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  super_session_id TEXT NOT NULL,
  from_member_id TEXT NOT NULL,        -- 'COORDINATOR' is valid
  to_member_id TEXT NOT NULL,          -- 'ALL' broadcasts to every member
  message_type TEXT NOT NULL,          -- 'relay' | 'precompact_snapshot' | 'context_prefix' | 'human_forward'
  payload TEXT NOT NULL,               -- JSON-encoded
  ts TEXT NOT NULL,                    -- ISO timestamp
  consumed_at TEXT,                    -- NULL = unprocessed
  relay_id TEXT                        -- echo-guard: original relay bead ID being re-emitted (NULL if origin)
);

-- Audit log for every routing decision (T8 — CrabTrap)
CREATE TABLE IF NOT EXISTS relay_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  super_session_id TEXT NOT NULL,
  from_member_id TEXT NOT NULL,
  to_member_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  tier1_result TEXT,                   -- 'allow'|'block'|'escalate'|NULL (no matching static rule)
  tier2_result TEXT,                   -- LLM judge outcome or NULL (not consulted)
  final_decision TEXT NOT NULL,        -- 'allow'|'block'|'escalate'|'human_approved'|'human_denied'
  reason TEXT,
  human_response TEXT,
  ts TEXT NOT NULL
);

-- Ambient knowledge plane (T6 — Hivemind, T7 — jcode)
CREATE TABLE IF NOT EXISTS sos_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  super_session_id TEXT NOT NULL,
  member_id TEXT,                      -- NULL = cross-session summary
  summary_text TEXT NOT NULL,
  relevance_score REAL DEFAULT 0.0,
  created_at TEXT NOT NULL
);

-- Super-session metadata table
CREATE TABLE IF NOT EXISTS super_sessions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  routing_rules TEXT NOT NULL DEFAULT '[]', -- JSON array of SosRoutingRule
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
```

WAL mode must be enabled (`PRAGMA journal_mode=WAL`) so the coordinator and session-handler can read concurrently without blocking.

---

## 3. New Server Modules

All under `src/lib/modules/server/sos/`:

```text
src/lib/modules/server/sos/
  coordinator.ts       — SuperSession lifecycle, member subscription, relay dispatch
  relay-store.ts       — SQLite CRUD for the four new tables (thin data-access layer)
  policy-gate.ts       — Two-tier routing decision engine + audit logging (T8)
  memory-gardener.ts   — Background summarizer; runs at Stop hook and on 30s idle cycles (T6, T7)
  context-injector.ts  — Reads sos_memory, prepends context prefix to new-session stdin (T5)
  super-session-handler.ts — WebSocket handler for /ws/super-session/:id (mirrors session-handler.ts)
  sos-store.ts         — In-memory Map<string, SuperSession> with read/write access (singleton)
```

New API routes under `src/routes/api/sos/`:

```text
POST   /api/sos                        — create a new SuperSession
GET    /api/sos                        — list super-sessions
GET    /api/sos/[id]                   — fetch a SuperSession by ID
POST   /api/sos/[id]/members           — add a member session
DELETE /api/sos/[id]/members/[mid]     — remove a member
POST   /api/sos/[id]/inject            — human/phone-initiated relay: forward a message to a member
POST   /api/sos/[id]/relay             — coordinator-initiated relay (internal, auth-gated)
GET    /api/sos/[id]/transcript        — full merged transcript (paginated)
PATCH  /api/sos/[id]/rules             — update routing rules
```

---

## 4. Integration Points (Exact Touch Points in Existing Code)

### 4.1 `session-watcher.ts` + `opencode-watcher.ts` — subscribe, no changes needed

`coordinator.ts` calls the existing `subscribe(sessionKey, callback)` / `watch(sessionId, callback)` APIs directly. No modifications to the watchers. The coordinator is just another subscriber, identical to the session-handler.

For JSONL-backed providers (claude-code, codex, gemini, qwen, cursor, copilot, amp, iflow), it uses `sessionWatcher.subscribe(jsonlPath, onNewMessages)`.

For OpenCode, it uses `openCodeWatcher.watch(opencodeSessionId, onNewMessages)`.

The callback receives `ConversationMessage[]` and the coordinator immediately tags each message with `sos: { memberId, provider, sessionKey }` before appending to `mergedTranscript`.

### 4.2 `registry.ts` — no changes needed

`PROVIDERS` is already the single source of truth for provider resolution. The coordinator resolves a member's provider by iterating `PROVIDERS` to match on `source`. `getProviderConversation` is used to replay history for a newly joined member.

### 4.3 `pty-manager.ts` — PTY injection (the write-side relay, T2 — Claudraband)

`coordinator.ts` imports `ptyManager` and calls:

```ts
const terminal = ptyManager.get(member.terminalId);
if (!terminal || terminal.status === 'exited') {
  throw new Error('Target terminal not available for relay');
}
terminal.pty.write(`${injectText}\n`);
```

This is the Claudraband `cband continue <session-id> '<prompt>'` equivalent — HTTP daemon → `tmux send-keys` maps exactly to `POST /api/sos/[id]/inject` → `terminal.pty.write(text + '\n')`.

**When PTY injection is used:** Any relay where the target session is a Shooter-managed terminal (i.e., `member.terminalId` is non-null and the terminal is running). This gives the lowest latency path for interactive relays.

**When the relay log is used instead:** When the target session has no Shooter-managed terminal (external session not launched via Shooter), or when the target terminal is `Idle` and the relay is not time-critical. The coordinator writes a bead to `sos_relay_log`. A polling hook inside `context-injector.ts` detects unconsumed beads for a session and injects them as a context prefix on the next time the session's JSONL shows a new user-turn (approximated by watching for `role: 'user'` entries). This is the Gas Town Beads ledger pattern (T1).

### 4.4 `session-handler.ts` — model for `super-session-handler.ts`

`super-session-handler.ts` follows the exact same shape:

- `handleSuperSessionConnection(ws, id)` — accepts `/ws/super-session/:id`
- Sends `{ type: 'history', messages: mergedTranscript }` on connect (converted via `conversationToHistory`, extended to include the `sos` tag in each message)
- Streams new tagged messages live as they arrive via the coordinator's `onMessage` event emitter
- Accepts client messages: `relay-forward` (human approves forwarding a transcript message to a member), `relay-block` (human blocks a pending relay), `member-add`, `member-remove`

### 4.5 `server.ts` — WebSocket upgrade routing

Add one case to the existing URL-pattern switch that routes WS upgrades:

```ts
if (pathname.startsWith('/ws/super-session/')) {
  const id = pathname.slice('/ws/super-session/'.length);
  handleSuperSessionConnection(ws, id);
  return;
}
```

### 4.6 `.claude/settings.json` + `notifier.cjs` — HITL relay (T9 — Claude Control / Paseo)

The `PreCompact` hook is extended: when `notifier.cjs` fires for `PreCompact`, it POSTs the snapshot to `POST /api/sos/precompact` which writes a `precompact_snapshot` bead to `sos_relay_log`. The coordinator picks this up and fans it out to all members as a context checkpoint.

The existing `PermissionRequest` HITL flow is already centralized in `notifier.cjs`. The SoS coordinator registers all member sessions' PermissionRequests through the same APNs queue — no new hook code required, just the coordinator listening for `sos_permission_request` WS events from the member session's terminal.

---

## 5. The Three Mined Techniques (Concrete Application)

### T1 — Beads Ledger / Named Mailboxes (Gas Town, `githubprojects_3899619286326340159`)

**What it gives SoS:** The `sos_relay_log` SQLite table is the Beads ledger. Each row is a bead: `(from_member_id, to_member_id, message_type, payload, consumed_at)`. The coordinator is The Mayor; member sessions are Polecats. The ledger decouples the coordinator from session lifecycle — a session that restarts will find unconsumed beads waiting for it. This survives server restarts (SQLite, WAL mode), requires no IPC between sessions, and is trivially auditable.

**Concretely:** When the coordinator decides to relay message M from member A to member B, it writes one bead to `sos_relay_log`. The context-injector polls every 5 seconds for beads where `to_member_id = B` and `consumed_at IS NULL`. On finding one, it calls `terminal.pty.write(payload + '\n')` (if terminal available) or prepends the payload to B's next-prompt prefix (if external session). It then marks `consumed_at = NOW()`. The `relay_id` column on the bead records the original bead ID so a re-emitted relay cannot create a second bead loop (echo guard — see Section 6).

### T2 — ACP Injection / PTY stdin write (Claudraband, `githubsignals_3874535135337291122`)

**What it gives SoS:** The write-side relay mechanism. Claudraband's `cband continue <session-id> '<prompt>'` → HTTP POST → daemon → `tmux send-keys` maps directly to Shooter's `POST /api/sos/[id]/inject` → `coordinator.relay(fromId, toId, text)` → `ptyManager.get(terminalId).pty.write(text + '\n')`. This is synchronous and low-latency for Shooter-managed terminals.

**Concretely:** The `POST /api/sos/[id]/inject` API route is the HTTP daemon equivalent. It validates: (1) the super-session exists, (2) the target member ID is valid and belongs to this super-session, (3) the caller is authenticated (Bearer `API_KEY`), (4) the target terminal is owned by Shooter (not an externally-launched session). Then it calls `terminal.pty.write`. The `/handover` + `/pickup` VibeAround pattern maps to two WS events: `relay_handover` (serialize member A's last-N transcript to a bead) and `relay_pickup` (inject that bead as context into member B's PTY on next interaction).

### T5 — PreCompact Hook Interception (Claude Harness, `githubsignals_3888917703615132104`)

**What it gives SoS:** Context-boundary survival across compaction and server restarts. When Claude Code fires `PreCompact` for a member session, `notifier.cjs` intercepts it, serializes the last 20 `ConversationMessage` entries from that member's merged transcript slice into a `precompact_snapshot` bead in `sos_relay_log`, then returns `{"action":"continue"}` to allow compaction. On the member's next session start (detected by a new JSONL file appearing in the project dir), `context-injector.ts` reads the most recent unconsumed `precompact_snapshot` bead for that session key and injects it as a context prefix via `pty.write` — effectively the `harness-mem` re-injection behavior.

**Concretely:** The `.claude/settings.json` hook definition:

```json
{
  "PreCompact": [
    {
      "matcher": "",
      "hooks": [{ "type": "command", "command": ".claude/hooks/notifier.cjs", "timeout": 30000 }]
    }
  ]
}
```

`notifier.cjs` already dispatches on `CLAUDE_HOOK_EVENT`. Add a `PreCompact` case: POST to `/api/sos/precompact` with the session ID. The server route writes the snapshot bead and returns 200. `notifier.cjs` exits 0 so Claude Code continues. This is zero-latency from Claude's perspective and survives both compaction and server restart because the bead is persisted in SQLite.

---

## 6. Message Routing Algorithm

### 6.1 Routing Decision Flow (Two-Tier Policy Gate, T8 — CrabTrap)

Every new `ConversationMessage` arriving from a member goes through the coordinator:

```text
NEW MESSAGE from member A
        │
        ▼
[Tier 1: Static Rules]
  Scan SosRoutingRule[] ordered by priority.
  Match: fromMemberId == A.id (or 'ANY'), matchPattern in message text.
  → action = 'relay'     → proceed to relay dispatch
  → action = 'block'     → log to relay_decisions, discard
  → action = 'escalate'  → proceed to HITL queue
  → no match             → proceed to Tier 2
        │
        ▼
[Tier 2: LLM Judge] (only for ambiguous messages without a static rule)
  Call Neurolink/Claude Haiku via POST /api/neurolink (internal, cached)
  Prompt: "Given this message from {provider} session: {text}, should it be relayed
           to {target}? Respond: allow | block | escalate. Reason: ..."
  → 'allow'     → relay dispatch
  → 'block'     → log, discard
  → 'escalate'  → HITL queue
  Log result to relay_decisions.
        │
        ▼
[HITL Queue] (for 'escalate')
  Send APNs notification: "Session A wants to relay to B: {preview}"
  Block for up to PERMISSION_TIMEOUT (default 120s).
  Human approves → relay dispatch, log 'human_approved'.
  Human denies   → log 'human_denied', discard.
        │
        ▼
[Relay Dispatch]
  If target terminal running: ptyManager.get(terminalId).pty.write(text + '\n')
  Else: write bead to sos_relay_log (context-injector picks it up)
  Write bead's relay_id = null (origin relay).
  Log to relay_decisions: final_decision = 'allow'.
```

MVP (Phase 1) skips Tier 2 LLM judge entirely. Only Tier 1 static rules + explicit human forward via WS `relay-forward` event.

### 6.2 Loop / Echo Prevention

Without guards, a relay from A→B could cause B to generate a response that the coordinator then relays back to A, creating an infinite loop.

**Guard 1 — `relayed` flag:** Every message injected by the coordinator has `sos.relayed = true` in the tagged transcript. The routing algorithm skips Tier 1+2 for any message where `sos.relayed === true` (read-only append to merged transcript; no further relay). This is the primary loop-breaker.

**Guard 2 — `relay_id` column:** Each bead written to `sos_relay_log` carries `relay_id = null` for origin relays. If a coordinator ever needs to re-emit a relay (e.g., target was offline, retry once), it sets `relay_id = original_bead_id`. The context-injector refuses to relay a bead whose `relay_id` is non-null a second time (checked by looking for a consumed bead with the same `relay_id`).

**Guard 3 — Self-relay block:** The coordinator always blocks routing rules where `fromMemberId === toMemberId`. This is a hard invariant validated at rule-creation time in `POST /api/sos/[id]/rules`.

**Guard 4 — Cooldown window:** After relaying any message from A to B, the coordinator suppresses further relays from A to B for a configurable window (default 5 seconds). This limits the blast radius of a misconfigured routing rule.

---

## 7. WebSocket Channel (`/ws/super-session/:id`)

Follows `session-handler.ts` patterns exactly. New file: `super-session-handler.ts`.

### Server → Client messages (extends existing WireSessionServerMessage union)

```ts
// Initial transcript replay
{ type: 'sos-history'; messages: TaggedHistoryMessage[] }

// Live merged message from any member
{ type: 'sos-message'; memberId: string; provider: SessionSource; message: HistoryMessage; relayed: boolean }

// Pending relay awaiting human approval
{ type: 'sos-relay-pending'; relayId: string; fromMemberId: string; toMemberId: string; preview: string; expiresAt: string }

// Relay was approved/denied (by human or policy)
{ type: 'sos-relay-resolved'; relayId: string; decision: 'approved' | 'denied' | 'expired' }

// Member status change
{ type: 'sos-member-status'; memberId: string; status: SosMemberStatus }

// Error
{ type: 'sos-error'; message: string }
```

### Client → Server messages

```ts
// Human approves pending relay
{ type: 'relay-approve'; relayId: string }

// Human denies pending relay
{ type: 'relay-deny'; relayId: string }

// Human directly injects text into a member's terminal
{ type: 'relay-forward'; toMemberId: string; text: string }

// Add/remove member at runtime
{ type: 'member-add'; sessionKey: string; provider: SessionSource; terminalId?: string; capability?: string }
{ type: 'member-remove'; memberId: string }
```

Authentication: same ticket-store pattern as existing WS channels. Client calls `POST /api/ws-ticket` → receives short-lived ticket → connects to `/ws/super-session/:id?ticket=<token>`.

---

## 8. Security Model

1. **Authentication:** All SoS API routes require `Authorization: Bearer <API_KEY>`. The WS channel uses the existing ticket store. No unauthenticated access.

2. **Ownership validation:** Before any PTY inject (`pty.write`), the coordinator checks that `terminalId` is present in `ptyManager.list()`. This prevents injecting into a terminal that was not created by this Shooter instance.

3. **Session ID validation:** All session keys (JSONL paths and OpenCode UUIDs) are validated with the same pattern as `findJsonlFileForSession`: JSONL paths must resolve within `~/.claude/projects/`, `~/.codex/sessions/`, or known provider directories. OpenCode UUIDs must match `/^[A-Za-z0-9_-]+$/`. No path traversal is possible because the coordinator never interpolates raw user input into filesystem paths — it looks up the `session_key` from the `sos_sessions` table (which was validated at insertion time).

4. **Relay text cap:** Injected text is capped at 10 KB (same limit as `session-handler.ts` `send-input`). Longer payloads are rejected with a 413 error.

5. **LLM judge for ambiguous relays:** The Tier 2 judge is called via the local Neurolink proxy — not directly via Anthropic API — so the relay text never leaves the local machine unintentionally.

6. **Human approval for unknown routes:** Any relay where Tier 1 returns no matching rule is escalated to the human (HITL) rather than silently allowed. This is the safe default.

---

## 9. Phased Build Plan

### Phase 1 — MVP: Observe + Merge + Manual Relay (2–3 days)

**Goal:** A working super-session that passively aggregates N sessions into one unified transcript, with human-controlled forwarding from the phone.

**Files to create:**

- `src/lib/types/sos.ts` — `SosMember`, `SuperSession`, `SosRoutingRule`, `SosMemberStatus`; re-export from `src/lib/types/index.ts`
- `src/lib/modules/server/sos/relay-store.ts` — SQLite CRUD for all four new tables; runs `CREATE TABLE IF NOT EXISTS` on module load using the existing `better-sqlite3` instance from `terminal-store.ts`
- `src/lib/modules/server/sos/sos-store.ts` — singleton `Map<string, SuperSession>`; `get`, `create`, `addMember`, `removeMember`
- `src/lib/modules/server/sos/coordinator.ts` — `SuperSessionCoordinator` class; `subscribe(member)` calls the right watcher; merges tagged messages into `mergedTranscript`; emits events; no auto-relay in Phase 1
- `src/lib/modules/server/sos/super-session-handler.ts` — WS handler for `/ws/super-session/:id`; sends history + live stream; handles `relay-forward` by calling `terminal.pty.write` directly
- `src/routes/api/sos/+server.ts` — `POST /api/sos` (create), `GET /api/sos` (list)
- `src/routes/api/sos/[id]/+server.ts` — `GET`, `PATCH`, `DELETE`
- `src/routes/api/sos/[id]/members/+server.ts` — `POST` (add member), `DELETE /[mid]`
- `src/routes/api/sos/[id]/inject/+server.ts` — `POST` (human relay inject)
- `server.ts` — add `/ws/super-session/` upgrade route

**Integration tests:** Create a super-session with 2 Claude sessions, verify merged transcript on WS, verify `relay-forward` injects into target PTY.

---

### Phase 2 — Rule-Based Auto-Relay (3–4 days)

**Goal:** Static routing rules automatically relay messages between members without human approval for trusted patterns.

**Files to create:**

- `src/lib/modules/server/sos/policy-gate.ts` — Tier 1 static rule evaluator; writes to `relay_decisions`; `escalate` action sends APNs notification via existing `sendNotification` path
- `src/routes/api/sos/[id]/rules/+server.ts` — `GET`, `PATCH` routing rules
- Extend `coordinator.ts` — on each new tagged message, run `policyGate.evaluate(message, rules)` and dispatch accordingly
- Extend `super-session-handler.ts` — send `sos-relay-pending` / `sos-relay-resolved` messages; accept `relay-approve` / `relay-deny` from client
- Loop / echo guards (Section 6) fully implemented

---

### Phase 3 — Ambient Memory + Context Survival (2–3 days)

**Goal:** Sessions share knowledge across restarts via the PreCompact snapshot and memory summarizer.

**Files to create:**

- `src/lib/modules/server/sos/memory-gardener.ts` — background coroutine; `setInterval(30_000)`; reads JSONL via `sessionWatcher.getHistory`, writes summaries to `sos_memory`; calls Neurolink Haiku for consolidation
- `src/lib/modules/server/sos/context-injector.ts` — reads top-3 `sos_memory` entries by `relevance_score`; writes context prefix bead to `sos_relay_log`; injects on session start detection
- `notifier.cjs` — add `PreCompact` hook case: POST `/api/sos/precompact`
- `src/routes/api/sos/precompact/+server.ts` — serialize last-20 messages into `precompact_snapshot` bead

---

### Phase 4 — Capacity-Aware Dispatch + Worktree Isolation (stretch)

**Goal:** Coordinator dispatches new tasks to the member session with the most available capacity, and each dispatched task gets a WorkForge git worktree.

**Files to create:**

- `src/lib/modules/server/sos/capacity-monitor.ts` — polls `sos_sessions.status` and optional rate-limit headers to score each member's current capacity
- `src/routes/api/sos/[id]/dispatch/+server.ts` — `POST`: accepts `{ task: string; capability?: string }`, selects best member, injects task via PTY, optionally creates worktree via WorkForge CLI
- `ANTHROPIC_BASE_URL` injection in `pty-holder.cjs` environment when a local CLIProxyAPI instance is available (env-var controlled, disabled by default)

---

## 10. File Map Summary

| New file                                              | Phase | Purpose                                   |
| ----------------------------------------------------- | ----- | ----------------------------------------- |
| `src/lib/types/sos.ts`                                | 1     | SoS type definitions                      |
| `src/lib/modules/server/sos/relay-store.ts`           | 1     | SQLite CRUD for all SoS tables            |
| `src/lib/modules/server/sos/sos-store.ts`             | 1     | In-memory SuperSession registry           |
| `src/lib/modules/server/sos/coordinator.ts`           | 1     | Subscriber, merger, relay dispatch        |
| `src/lib/modules/server/sos/super-session-handler.ts` | 1     | WS handler for /ws/super-session/:id      |
| `src/routes/api/sos/+server.ts`                       | 1     | Create + list super-sessions              |
| `src/routes/api/sos/[id]/+server.ts`                  | 1     | Get/update/delete super-session           |
| `src/routes/api/sos/[id]/members/+server.ts`          | 1     | Add/remove members                        |
| `src/routes/api/sos/[id]/inject/+server.ts`           | 1     | Human-initiated relay inject              |
| `src/lib/modules/server/sos/policy-gate.ts`           | 2     | Tier 1 static rule evaluator + audit log  |
| `src/routes/api/sos/[id]/rules/+server.ts`            | 2     | CRUD for routing rules                    |
| `src/lib/modules/server/sos/memory-gardener.ts`       | 3     | Background knowledge summarizer           |
| `src/lib/modules/server/sos/context-injector.ts`      | 3     | Context prefix injection on session start |
| `src/routes/api/sos/precompact/+server.ts`            | 3     | PreCompact snapshot endpoint              |
| `src/lib/modules/server/sos/capacity-monitor.ts`      | 4     | Member capacity scoring                   |
| `src/routes/api/sos/[id]/dispatch/+server.ts`         | 4     | Task dispatch to best-capacity member     |

**Modified files:**

| File                         | Change                                            |
| ---------------------------- | ------------------------------------------------- |
| `src/lib/types/sessions.ts`  | Add optional `sos` field to `ConversationMessage` |
| `src/lib/types/index.ts`     | Re-export from `sos.ts`                           |
| `server.ts`                  | Add `/ws/super-session/` upgrade routing          |
| `.claude/settings.json`      | Add `PreCompact` hook (Phase 3)                   |
| `.claude/hooks/notifier.cjs` | Handle `PreCompact` event (Phase 3)               |

---

## 11. Thin Areas and Open Questions

1. **Non-Claude session hooks (T4 observation):** Codex and OpenCode have no hook system equivalent to Claude Code's `PreCompact`. For those providers, the context-survival mechanism relies on polling `sos_relay_log` for precompact snapshots generated by the coordinator watching the JSONL/SQLite stream for `compaction` part types (OpenCode emits a `compaction` part type — `opencode-watcher.ts` currently skips it; that skip should be changed to emit a coordinator event).

2. **LLM judge latency (Phase 2 Tier 2):** Calling Neurolink Haiku synchronously on each message would add 200–500ms to the relay path. Mitigation: run the judge asynchronously. Messages routed via Tier 2 are queued; delivery is delayed, not blocking. This is acceptable for non-time-critical relays.

3. **External session relay (no terminal):** For sessions not launched via Shooter's PTY manager (e.g., a Cursor session Shooter is only observing), PTY inject is impossible. The relay log bead approach is the only path, and delivery depends on the human or the agent periodically checking a "pending context" endpoint. This limitation should be surfaced clearly in the UI.

4. **MCP as meta-session interface:** The coordinator could expose a local MCP server so child Claude sessions can call `sos_relay(target, text)` as a native tool. This is a Phase 4+ idea; it requires verifying that Claude Code can call an MCP tool that targets a sibling session without creating a circular tool-call loop.
