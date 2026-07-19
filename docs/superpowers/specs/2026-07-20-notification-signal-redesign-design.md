# Notification Signal Redesign — from firehose to signal

**Status:** ✅ Implemented (2026-07-24) — shipped across three merged PRs; see _Implementation status_ below. Originally approved 2026-07-20.
**Author:** Sachin Sharma (with Claude)
**Scope tier:** Core fix + observability (per-project mute, quiet-hours, and daily digest are deferred)

---

## Implementation status (2026-07-24)

This is the origin design for Shooter's notification overhaul. It was implemented (with minor
naming/scoping differences) across three merged PRs and is live on `release` (v1.33.1):

| Design element                                                     | Shipped                                                                                         | Where                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| §4.2 Server-side policy engine / signal model (decision vs status) | ✅                                                                                              | `classifyNotificationTier` — [#125](https://github.com/juspay/shooter/pull/125)                                   |
| §4.3–4.4 Session settle debounce + collapse                        | ✅ (implemented **per-project**)                                                                | status coalescer + `apns-collapse-id`/`thread-id` — #125                                                          |
| §4.1/§4.9 Notifier changes + double-fire hygiene                   | ✅                                                                                              | smart-idle gate + AskUserQuestion dedup (3 pushes → 1) — #125, [#128](https://github.com/juspay/shooter/pull/128) |
| §4.7 Kill the 413 at the root                                      | ✅                                                                                              | `toolInput` strip + `fitApnsPayload` cap — #125                                                                   |
| §4.5/§4.8 Durable notification log + stats view + CLI              | ✅ (`notification_events`, `/api/notify/stats`, `shooter notifications`, `/notifications` page) | [#126](https://github.com/juspay/shooter/pull/126)                                                                |
| §4.7 Token circuit-breaker                                         | ◑ partial                                                                                       | first-strike prune retained; `failure_count` threshold evaluated & deliberately descoped (clean registry) — #125  |
| §4.6 Per-category toggle (no-code silence)                         | ❌ not built                                                                                    | tiers live in code; a user-facing toggle remains a follow-up                                                      |

Deferred as planned (still out of scope): per-project mute, quiet-hours, daily digest.

Verified live: notification telemetry over 142 real events confirmed the redesign and surfaced
the AskUserQuestion triple-fire that #128 then removed — decision-tier push volume is down ~67%
per ask. See the focused specs that landed alongside the code:
`2026-07-20-notification-coalescing-design.md`, `2026-07-23-notification-telemetry-design.md`,
`2026-07-23-askquestion-permission-dedup-design.md`.

---

## 1. Problem

Shooter sends far too many notifications, and the ones it sends are dominated by the
_least_ actionable categories. An audit of the notifier (`notifier.cjs`, 2259 lines),
the server notify path (`src/routes/api/notify/+server.ts`), and the server log
(`~/.shooter/logs/shooter.log`, 47k lines) established the following.

### 1.1 What actually pushes today

Per-tool events are **not** the problem — `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `SessionStart`, `SessionEnd`, `SubagentStart/Stop`,
`UserPromptSubmit` are all **silent** in the notifier (telemetry/`debugLog` only). The
pushes the user feels come from five handlers:

| Category                           | Handler                                             | Share\* | Suppressed when viewing?               | Actionable? |
| ---------------------------------- | --------------------------------------------------- | ------- | -------------------------------------- | ----------- |
| `idle_input` ("Waiting for input") | `handleIdleInput`                                   | ~41%    | **No gate at all**                     | Rarely      |
| `permission` ("Permission needed") | `handlePermission` / `handlePermissionNotification` | ~24%    | Yes (viewer-present)                   | **Yes**     |
| `question` ("Claude is asking")    | `handleQuestion` / `handleAskUserQuestion`          | ~22%    | **No** (`handleQuestion` never checks) | Yes         |
| `intervention` ("Needs attention") | `handleIntervention`                                | ~9%     | **No** (catch-all, always sends)       | Sometimes   |
| `task_completed`                   | task path                                           | ~4%     | —                                      | Sometimes   |

<sub>\*Share is from the only measurable sample (see §1.4) — directional, not exact.</sub>

The three highest-volume conversational handlers (`handleIdleInput`,
`handleIntervention`, `handleQuestion`) do **not** call the one suppression gate that
exists (`hasWebSocketClients()`), so they push even while the phone app is open.

### 1.2 Structural amplifiers

1. **Global fan-in.** The notifier is wired in the _global_ `~/.claude/settings.json`, so
   every Claude Code session in every repo (11+ projects: lighthouse, clairvoyance,
   nimble, …) routes notifications to this one server. Unrelated repos interleave onto the
   phone.
2. **No throttle / cooldown / cross-event dedup** in the notifier — each hook is a fresh,
   stateless process. The only server-side control is a 10-second content-dedup cache, and
   **bidirectional (permission/question) requests bypass it entirely**.
3. **No `apns-collapse-id` on the one-way stream.** collapse-id is set _only_ for
   `waitForResponse` requests. `idle_input` / `question` / `intervention` / completion
   notifications all send `collapse-id = undefined`, so they **stack** on the lock screen
   instead of replacing the previous one. This is the single biggest unused lever.
4. **Double-fire in the Shooter repo.** Global (`:54006`) and the repo's checked-in
   `.claude/settings.json` (`:54007`) both wire all 14 events. **Verified:** only `:54006`
   has a listening server; `:54007` is dead, so the second invocation is **wasted CPU, not
   doubled delivery**. Hygiene, not a volume cause.
5. **Multi-agent chatter.** Parallel subagents each emit their own idle/teammate events
   (e.g. the observed `"Task 3 implementer idle after delivery"` spam).

### 1.3 Reliability is quietly broken

Of the failures visible in the log: 171 `BadDeviceToken`, 206 `status=0`, 16
`PayloadTooLarge` (413), 101 legacy node-apn timeouts, 54 curl transport errors.

- **`BadDeviceToken` (171):** historical — the device store now holds 2 clean active
  devices (iPhone + iPad, both sandbox, `failure_count = 0`), so those were rotated tokens
  that pruning already removed. Pruning basically works; it can be _hardened_.
- **`PayloadTooLarge` (413, 16):** the **real current code bug**. `fitApnsPayload()` trims
  only `aps.alert.body`/`subtitle` down to 3900 bytes, but the custom `data` object merged
  into the same push body carries `data.toolInput` — the raw, unbounded Claude Code
  `tool_input` (e.g. a Write/Edit's full file content, or an `AskUserQuestion`'s full
  `questions` array) — **uncapped**. When it's large the serialized body still exceeds 4096
  bytes and Apple returns 413.
- **`status=0` / transport / legacy (361):** the documented Node-24 curl/http2 transport
  issues, already mitigated by the curl migration; not addressed here beyond the
  circuit-breaker.

### 1.4 We cannot measure the problem

Successful sends (HTTP 200) log **nothing** (`deliverPreSerialized()` only logs non-200 and
exceptions), and there is no durable store — the in-memory `notification-history.ts` ring
buffer is capped at 100 and resets on restart. So today the _only_ countable signal is
failures, and notification volume is fundamentally unmeasurable. **This is itself a thing to
fix** — the "we can't make sense of it" complaint is literally an observability gap.

---

## 2. Goals & non-goals

### Goals

- **Signal model "Blocked-on-you + done":** push only for `permission`, `question`, and a
  single collapsed _session-settled_ ("come back") notification per idle stretch. Everything
  else is silent (visible in-app only).
- **Collapse** every category by session so the lock screen holds ~one live entry per
  session, never a stack.
- **Debounce** the session-settled ping so a user actively working at the laptop is not
  pinged between turns — only a genuine walk-away triggers it.
- **Kill the 413** at the root and harden dead-token handling.
- **Make it measurable:** a durable notification log + a stats view + CLI, recording every
  decision (sent _and_ suppressed _and_ failed).
- **Per-category toggle** so the user can silence any category without code.
- Fire the notifier **once** per event (double-fire hygiene).

### Non-goals (deferred — explicitly out of scope for this change)

- Per-project mute / allow-list.
- Quiet-hours / Do-Not-Disturb window.
- Daily digest of silenced events.

The signal model already tames cross-repo volume: `permission`/`question` are _wanted_ from
any repo (that is the app's purpose), and session-settled is now one-per-session. These can
be added later if the result is still noisy.

### Success criteria

1. On device: a `permission` pushes and is suppressed when the app is open; repeated
   `question`s in a session collapse to one lock-screen entry; a long idle produces **exactly
   one** "waiting" ping that a later idle _replaces_; per-idle-tick and catch-all events are
   silent but appear in the in-app feed.
2. No `AskUserQuestion`/large-`toolInput` notification exceeds 4096 bytes (no 413).
3. The stats view shows before/after volume by category and decision, demonstrating a
   material drop in push count with `permission`/`question` intact.
4. Working inside the Shooter repo spawns the notifier once per event.

---

## 3. Architecture — move volume policy server-side

**Key decision.** The notifier is a stateless, per-event process; it can never answer "have I
already pinged for this session?" or "has the session been quiet for 45s?" The one
long-lived, stateful component is the server. Therefore:

- **Notifier (client) shrinks** to: classify the event → assign a category → forward it to
  the server with a viewer-presence hint and lifecycle role (`activity` | `settle` |
  `blocking`). It keeps the blocking permission poll (it must, to return the decision to the
  hook). It **stops** unconditionally pushing `idle_input` / `intervention`.
- **Server (`/api/notify`) becomes the single policy engine:** the signal-model gate,
  per-category toggle lookup, per-session settle debounce (an in-memory idle timer),
  `collapse-id` assignment for all categories, payload capping, durable logging, and the
  actual fan-out to APNs / FCM / Web Push.

Rejected alternatives: (a) making the notifier smart — impossible, no cross-process state;
(b) pure client-side debounce — the Stop hook is not long-lived enough to poll reliably and
Claude Code may kill it.

```
Claude Code hook ──► notifier.cjs (classify + forward, skipPush for non-blocking)
                          │  POST /api/notify { category, role, sessionId, project, viewerHint, ... }
                          ▼
                 ┌─────────────────────────────────────────────────┐
                 │  /api/notify  POLICY ENGINE (server, stateful)   │
                 │  1. record inbound → session state (activity)    │
                 │  2. signal-model gate + per-category toggle      │
                 │  3. role=settle → arm/cancel idle timer          │
                 │  4. role=blocking/immediate → decideAndDispatch  │
                 │  5. assign collapse-id (by session/request)      │
                 │  6. cap payload, fan out, prune/breaker tokens   │
                 │  7. write notification_log (every decision)      │
                 └─────────────────────────────────────────────────┘
                          │ idle timer fires (T s quiet, no viewer, armed)
                          ▼  dispatchNotification(session_settled)  ── same path as (4)–(7)
```

---

## 4. Component design

### 4.1 Notifier changes (`.claude/hooks/notifier.cjs`)

- `handleIdleInput`: **stop** calling `sendNotification`. Instead POST the event with
  `role: "settle"` and `skipPush: true` (so it feeds the activity feed + arms the server's
  idle timer, but never pushes directly).
- `handleIntervention`: same — forward with `role: "settle"` (attention signal), default
  silent. If the event is genuinely blocking (`waitForResponse`), forward `role: "blocking"`.
- `handleQuestion` / `handleAskUserQuestion`: keep pushing, but always include `sessionId`
  and let the server assign `collapse-id` (§4.4). Add the missing viewer-presence hint so the
  server can suppress when the app is open (parity with `handlePermission`).
- `handlePermission` / `handlePermissionNotification`: unchanged behavior (blocking poll,
  viewer-suppress), but pass `sessionId` for session-scoped collapse.
- New: forward `UserPromptSubmit` and `Stop` as lightweight lifecycle signals
  (`skipPush: true`): `UserPromptSubmit → role:"activity"` (server cancels timer + re-arms),
  `Stop → role:"settle"` (server arms timer). `SessionEnd → role:"session_end"` (server
  clears session state, no push).
- No new cross-process state in the notifier — it stays stateless.

### 4.2 Policy engine (`src/routes/api/notify/+server.ts`)

Factor the existing "build payload → fan out → prune → log" tail into a reusable
`dispatchNotification(decision)` so both the HTTP route and the idle timer can send.

Signal-model disposition (defaults; each overridable by toggle in §4.6):

| Category               | Default disposition                                                       |
| ---------------------- | ------------------------------------------------------------------------- |
| `permission`           | PUSH, viewer-suppress, collapse by request                                |
| `question`             | PUSH, viewer-suppress, collapse by session                                |
| `session_settled`      | PUSH via idle timer only (debounced, 1/idle-stretch), collapse by session |
| `idle_input`           | SILENT (feed only)                                                        |
| `intervention`         | SILENT unless `role:"blocking"`                                           |
| tool / session / error | SILENT (unchanged)                                                        |

Every inbound event is recorded to session state (§4.3) and to `notification_log` (§4.5)
with its final decision, including suppressions.

### 4.3 Session settle state machine (in-memory, server)

Per-`sessionId` state: `{ lastActivityAt, viewerPresent, armed: boolean, idleTimer }`.
`IDLE_DELAY` default **45s** (configurable constant).

- **`role:"activity"`** (UserPromptSubmit, or any push-worthy immediate event): cancel any
  pending `idleTimer`, set `armed = true`, update `lastActivityAt`.
- **`role:"settle"`** (Stop, idle_prompt, non-blocking intervention): if `armed`, cancel and
  (re)arm `idleTimer` for `IDLE_DELAY`. If not `armed` (already pinged this idle stretch),
  log `suppressed_debounce` and do nothing.
- **`idleTimer` fires:** if `viewerPresent` → log `suppressed_viewer`. Else →
  `dispatchNotification({ category: "session_settled", collapseId: "settle:"+sessionId, … })`,
  then set `armed = false`.
- **`role:"session_end"`:** clear the session's state (delete timer + entry). No push.
- Timers live in memory; a server restart at worst drops one pending "waiting" ping
  (acceptable). No persistence required for the state machine.

This is what distinguishes "actively working at the laptop" (constant activity/Stop cycles
that keep cancelling+rearming, and the user answers within 45s → `UserPromptSubmit` cancels)
from "walked away" (45s of quiet after a settle → one ping).

### 4.4 Collapse strategy

- `permission`: `collapse-id = requestId` (unchanged — a re-notify of the same pending
  request replaces its banner).
- `question`: `collapse-id = "q:" + sessionId` — a newer question in the same session
  replaces the older lock-screen entry.
- `session_settled`: `collapse-id = "settle:" + sessionId`.
- Web Push mirrors the same value into `tag` (already wired).
- All collapse-ids are sanitized + truncated to 64 bytes by `library-apns.ts` (already
  implemented).

### 4.5 Durable notification log (`notification-log.ts` + migration)

New SQLite table `notification_log` in `~/.shooter/shooter.db`:

| Column         | Type    | Notes                                                                                                                               |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | TEXT PK | uuid                                                                                                                                |
| `ts`           | TEXT    | ISO timestamp                                                                                                                       |
| `category`     | TEXT    | permission / question / session_settled / idle_input / intervention / …                                                             |
| `project`      | TEXT    | source project name                                                                                                                 |
| `session_id`   | TEXT    | nullable                                                                                                                            |
| `decision`     | TEXT    | `sent` \| `suppressed_viewer` \| `suppressed_signal_model` \| `suppressed_toggle` \| `suppressed_debounce` \| `deduped` \| `failed` |
| `reason`       | TEXT    | free text (e.g. failure reason)                                                                                                     |
| `device_count` | INTEGER | fan-out target count                                                                                                                |
| `error`        | TEXT    | nullable, on `failed`                                                                                                               |

- Written for **every** policy decision, including successful sends (which log nothing
  today) and every suppression.
- Retention: prune rows older than 30 days on write (consistent with existing 24h terminal
  cleanup pattern, but longer to allow week-over-week comparison).
- Keep the existing in-memory ring buffer for the live debug view; the SQLite table is the
  durable source of truth for stats.

### 4.6 Per-category toggle

- Store in `shooter.db` (`notification_settings` key/value or a small typed table), defaults
  = the §4.2 dispositions.
- Surfaced on `/config` as a list of category switches.
- Policy engine reads a cached copy (invalidated on write) so it does not hit SQLite on every
  event.

### 4.7 Reliability

- **413 cap:** in the payload builder, replace the full custom `data` merge with a **strict
  whitelist** — `{ requestId, source, timestamp, waitForResponse, category }` only. Never
  ship `toolInput` (the app fetches full context from `/api/decide/[id]`). Add an assertion /
  final guard in `fitApnsPayload()` that the _entire serialized body_ is ≤ `APNS_MAX_BYTES`,
  trimming remaining whitelisted string fields if somehow still over.
- **Token circuit-breaker:** on a definitive-stale APNs/FCM reason, keep the existing prune;
  additionally increment `failure_count`, and after `MAX_TOKEN_FAILURES` (default 5)
  consecutive hard failures set `is_active = 0` so we stop sending to it. Reset
  `failure_count = 0` on any success. Confirm `BadDeviceToken ∈ UNCONDITIONAL_STALE_REASONS`;
  ensure 413 does **not** prune (it's a payload bug, not a token problem — the whitelist fix
  removes it).

### 4.8 Observability surface

- `GET /api/notifications?window=24h|7d|30d` → aggregates from `notification_log`: totals,
  by category, by project, by decision, and a simple time bucket series.
- `/notifications` page (or a dashboard card reusing `client/dashboard`): push vs suppressed
  vs failed over time; category breakdown; "notifications you were saved from" (suppressed
  count) as the headline metric.
- `shooter notifications` CLI subcommand: prints the 24h/7d summary from the same endpoint.

### 4.9 Double-fire hygiene

- Add **server idempotency**: within a short window (e.g. 10s), collapse inbound events with
  the same `(sessionId, category, contentHash)` so even if two notifier invocations arrive
  they resolve to one decision (generalizes beyond the specific double-fire; note the current
  10s dedup cache exempts bidirectional requests — idempotency here must cover them by
  `requestId`).
- Reconcile config: the repo's checked-in `.claude/settings.json` (and worktree copies)
  should not duplicate the global wiring for the local machine. Because `:54007` is dead the
  duplicate is already a no-op here; the idempotency guard is the robust fix, and the config
  note is documented so a future `:54007` server can't silently double-send.

---

## 5. Files touched (blueprint)

| File                                                                       | Change                                                                                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/hooks/notifier.cjs`                                               | Stop unconditional idle/intervention pushes; forward lifecycle roles + viewer hint + sessionId; stay stateless                                                  |
| `src/routes/api/notify/+server.ts`                                         | Policy engine: signal-model gate, toggle lookup, settle debounce, collapse-id for all categories, idempotency, durable logging; factor `dispatchNotification()` |
| `src/lib/modules/server/apn/apns-payload.ts`                               | Whitelist/cap the `data` object; assert full body ≤ `APNS_MAX_BYTES`                                                                                            |
| `src/lib/modules/server/apn/library-apns.ts`                               | Consume whitelisted `data`; thread collapse-id (already partly wired)                                                                                           |
| `src/lib/modules/server/apn/notification-log.ts` (new)                     | Durable SQLite log + query helpers                                                                                                                              |
| `src/lib/modules/server/terminal/terminal-store.ts` (or a migrations file) | `notification_log` + `notification_settings` schema                                                                                                             |
| device-token store                                                         | `failure_count` circuit-breaker                                                                                                                                 |
| `src/routes/api/notifications/+server.ts` (new)                            | Stats aggregates endpoint                                                                                                                                       |
| `src/routes/notifications/+page.svelte` (new) or dashboard card            | Stats view                                                                                                                                                      |
| `src/routes/config/+page.svelte`                                           | Per-category toggles                                                                                                                                            |
| `bin/shooter.cjs`                                                          | `shooter notifications` subcommand                                                                                                                              |
| `.claude/settings.json` (repo + worktrees)                                 | Double-fire reconciliation note/alignment                                                                                                                       |
| `src/lib/types/` (+ `specs/types/*.yaml`)                                  | Types for log records, decision enum, settings, stats response                                                                                                  |

Types follow the repo's type-crafter workflow: express in `specs/types/*.yaml` where possible
(`pnpm gen:types`), hand-write unions (the `decision` enum) in `src/lib/types/<module>.ts`.

---

## 6. Testing & verification

- **Unit — policy engine:** table-driven over `category × viewerPresent × toggle × role`,
  asserting the expected disposition and the logged `decision`.
- **Unit — settle state machine:** simulate `settle → 45s quiet → one push`; `settle →
activity before 45s → no push`; `settle → push → second settle → suppressed_debounce`;
  `viewerPresent → suppressed_viewer`.
- **Unit — payload:** build a push with a multi-KB `toolInput` and assert the serialized body
  is ≤ 4096 bytes and contains no `toolInput`.
- **Unit — circuit-breaker:** N consecutive hard failures flips `is_active = 0`; a success
  resets `failure_count`.
- **Integration — logging:** every decision path writes exactly one `notification_log` row
  with the right `decision`.
- **On-device E2E** (per success criteria §2): permission push + viewer-suppress; question
  collapse; single debounced "waiting" ping that a later idle replaces; idle-tick silent but
  in feed. Capture before/after volume from the new stats view as proof.

---

## 7. Rollout

1. Land behind the existing local-dev flow; validate on the simulator + physical iPhone/iPad.
2. Ship via the normal `release` → semantic-release path; `shooter update` to the live server.
3. Watch the new stats view for a few days; if any wanted signal was over-suppressed, adjust
   the category toggle (no code change) or the `IDLE_DELAY`.
4. Revisit the deferred items (per-project mute, quiet-hours, digest) only if the stats show
   residual noise.
