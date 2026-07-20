# Notification coalescing & decision-first delivery — design

- **Date:** 2026-07-20
- **Status:** Implemented (2026-07-21). See `docs/superpowers/plans/2026-07-21-notification-coalescing.md`.
  Two refinements during build: (1) the real 413 root cause was that `fitApnsPayload`
  never trimmed custom `data` (the heavy `toolInput`), so the fix both strips
  `toolInput` from the push payload and extends `fitApnsPayload` to shed `data`;
  (2) the low-priority `failure_count` threshold was deliberately NOT wired — the
  registry is clean and the existing first-strike prune is correct, so a threshold
  would only loosen it (the misleading doc comment was corrected instead).
- **Branch:** `feat/notification-coalescing`
- **Owner:** Sachin

## Problem

Push notifications from Shooter have become unreadable noise. Evidence from the
live server log (`~/.shooter/logs/shooter.log`, spanning 2026-05 → 2026-07):

- The global `~/.claude/settings.json` wires the notifier to **13 Claude Code
  lifecycle hooks**, and because it is _global_ it runs in **every repo** — 17+
  distinct projects were observed pushing to the one device concurrently.
- Of the parseable pushes in the current log, the mix is: `idle_input` 22,
  `permission` 13, `question` 12, `intervention` 5, `task_completed` 2. **Idle is
  the single largest bucket**, and it is dominated by multi-agent-team
  choreography (e.g. _"Task 3 implementer idle after delivery — expected. Review
  in progress. `<teammate-message …>`"_). Each teammate session fires its own
  `idle_prompt` notification.
- There is **no filtering of any kind**: no per-category tiering, no
  coalescing, no grouping, no mute. Every push-eligible event from every project
  hits the device independently.
- Delivery is also unreliable: many `413 PayloadTooLarge` (AskUserQuestion
  payloads with long option descriptions exceed the APNs 4 KB limit), plus
  historical `400 BadDeviceToken` and `status=0` transport errors.

**Reframe:** only **two** categories are genuine _decisions the user must make_
(`permission`, `question`). Everything else is status competing for the same
attention.

### Ground-truth: what actually pushes today

Despite 13 hooks being wired, `processEvent()` in `.claude/hooks/notifier.cjs`
(switch at lines 634–700) only routes **five** event types to a handler that
sends a push. Everything else falls through to `default` and is already silently
ignored (no push):

| `data.category`                                                                                  | Handler                                          | Pushes today?              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------- |
| `permission`                                                                                     | `handlePermission` (blocking Allow/Deny)         | yes                        |
| `question`                                                                                       | `handleQuestion` (AskUserQuestion / elicitation) | yes                        |
| `idle_input`                                                                                     | `handleIdleInput`                                | yes (every one)            |
| `intervention`                                                                                   | `handleIntervention` (unknown/fallback)          | yes                        |
| `permission_notification`                                                                        | `handlePermissionNotification`                   | yes                        |
| `session.*`, `subagent.*`, `tool.*`, `task.completed`, `error`, `context.compact`, `user.prompt` | —                                                | **no** (fall to `default`) |

## Goals

1. Only genuine decisions (`permission`, `question`) buzz the phone immediately.
2. Status events coalesce **per project** into one rolled-up push, so N teammate
   idles in one project = one notification, not N.
3. Idle is **smart-gated**: internal agent-team/subagent choreography is dropped
   at the source; only a genuine "the session you are driving is waiting on you"
   idle survives (then coalesces).
4. Fix the real, current delivery failure: `413 PayloadTooLarge`.
5. Zero new UI. Sane in-code defaults, one tweakable constant for the window.

## Non-goals (YAGNI)

- No quiet hours / time-based muting (explicitly declined).
- No per-project mute UI, no notification-preferences screen, no priority sliders.
- No change to the WebSocket "viewer present → skipPush" behavior.
- No new hooks; no change to which hooks are wired.

## Policy: tiers

`classifyNotificationTier(category)` is the single source of truth.

| Category                  | Tier                      | Delivery                                                                                                               |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `permission`              | **decision**              | Push immediately, `apns-priority: 10`. Unchanged. Bypasses the coalescer (may create a `pending_requests` row / poll). |
| `question`                | **decision**              | Push immediately, high priority. Bypasses the coalescer.                                                               |
| `idle_input`              | **status** (+ smart-gate) | Dropped if internal choreography; otherwise buffered and coalesced per project.                                        |
| `intervention`            | **status**                | Buffered and coalesced per project.                                                                                    |
| `permission_notification` | **drop**                  | Redundant — the blocking `permission` already covers it.                                                               |
| anything else             | **drop**                  | Already not pushed; classifier makes it explicit.                                                                      |

## Architecture

Three isolated additions. Two are server-side (the long-lived `server.ts`
process, where module-level state persists across requests, as the existing
`notificationCache` Map already relies on). One is the client notifier hook.

### 1. Tier classifier — `src/lib/modules/server/apn/apns-classify.ts`

- Add a pure function `classifyNotificationTier(category: string): 'decision' | 'status' | 'drop'`.
- This file already owns the _delivery-outcome_ classification
  (`classifyApnsReason` 31–57, `summarizeApnsFanOut` 60–103); adding the
  _notification-category_ classification keeps all classification policy in one
  testable module.

### 2. Status coalescer — new `src/lib/modules/server/apn/status-coalescer.ts`

- Module-level `Map<projectKey, { events: BufferedEvent[]; timer: Timeout }>`,
  modeled on `notificationCache` (`src/routes/api/notify/+server.ts:114`).
- `enqueue(project, event)`: append to the project's buffer; start a
  `setTimeout(flush, COALESCE_WINDOW_MS)` if none is pending.
- `flush(project)`: tally the buffered events into a summary
  (e.g. `"3 agents idle"`, `"2 idle · 1 needs attention"`), build **one**
  rollup payload, call `apnsClient.sendToMany(iosDevices, payload, collapseId)`
  once with `collapseId = "status-" + project`, record a single history entry via
  `addNotification`, then clear the buffer + timer.
- In-memory only. A pending buffer is lost on server restart — acceptable: at
  most one batch of _status_ is dropped; decisions are never buffered.

### 3. Notify route wiring — `src/routes/api/notify/+server.ts`

- Insert a tier gate **after** the existing dedup / `intelligentNotificationFilter`
  and the `skipPush` short-circuit, and **before** payload build (around lines
  442–474):
  - `decision` → fall through to today's immediate send path, unchanged.
  - `status` → `statusCoalescer.enqueue(project, …)` and return early (HTTP 200,
    `{ coalesced: true }`).
  - `drop` → return early (HTTP 200, `{ dropped: true }`), no send.
- `skipPush` (viewer present) must be evaluated **before** the tier gate so a
  status event with an active viewer is not buffered.
- **Collapse-id policy:** decisions keep a **unique** collapse-id (today's
  per-`requestId` value, `+server.ts:543`) — two distinct pending permissions
  must remain two separate rows, never overwrite each other. Only the coalescer
  uses a shared `collapseId = "status-<project>"` so successive status rollups
  for a project replace the prior one. Visual grouping across both comes from
  `thread-id = project`, not from collapse-id.

### 4. APNs grouping + reliability — `library-apns.ts`, `apns-payload.ts`

- **Threading:** add `aps['thread-id'] = project` in `buildAlertBody`
  (`library-apns.ts:216–239`) so all notifications for a project thread together
  in Notification Center.
- **413 fix (primary):**
  - Trim `data.toolInput` before it is spread into `payload.data`
    (`+server.ts:496–516`) — this is the field that carries the full
    AskUserQuestion option descriptions and blows the 4 KB budget.
  - Extend `fitApnsPayload` (`apns-payload.ts:15–45`) to trim `body.data` fields
    as a final fallback and hard-cap the serialized payload < 4000 bytes,
    preserving `title`/`subtitle` and truncating `message`/`data` first.
- **transport `status=0`:** one retry-with-backoff around the curl call
  (`library-apns.ts:347–355`).
- **400 BadDeviceToken (low priority — already handled):** the registry is
  currently clean (2 active iOS tokens, `failure_count = 0`); the existing
  first-strike prune (`apns-classify.ts:46–52` → `pruneByTokens`) works, and the
  historical 400s were from now-pruned sim tokens. Wire the dormant
  `failure_count` column for robustness: add
  `deviceTokenStore.incrementFailure(token)` and reset `failure_count = 0` in
  `touchLastSeen` on success (`device-token-store.ts:150–159`); update the stale
  "Deferred to PR 3" doc comment (`device-token-store.ts:16–18`). Must preserve
  the env-mismatch exemption and the `!override` guard.

## Smart-idle heuristic — `.claude/hooks/notifier.cjs`

The gate lives in `handleIdleInput()` (lines 1116–1148), evaluated **before**
`sendNotification`. An idle event carries the session's last assistant text via
`getSessionContext()` (1407) — which is exactly where the choreography markers
appear.

Drop the idle (do **not** push; still forwarded to the in-app feed) when **any**
of:

1. The idle message / `ctx.lastAssistantText` matches an internal-choreography
   marker in the named list `INTERNAL_IDLE_MARKERS`:
   - contains `<teammate-message`
   - `/idle after delivery/i`
   - `/\bexpected\b/i` co-occurring with `/\bidle\b/i`
   - `/another claude session sent a message/i`
   - `/review in progress/i`
2. The JSONL tail entry for this session is a subagent turn (`isSidechain: true`).
   _(Availability of `isSidechain` on the tail entry to be confirmed during
   implementation; if absent, rely on marker matching alone.)_

Otherwise the idle survives → server coalesces it.

This is a heuristic, not exact teammate detection (teammates are independent
Claude processes with no hard "I am a teammate" flag on the idle event). To make
it tunable and observable:

- `INTERNAL_IDLE_MARKERS` is a single named constant.
- Every drop is `debugLog`'d with the matched marker so the list can be tuned
  against real traffic.

## Data flow (after)

```
hook → notifier.cjs
  ├─ permission / question ─────────────► POST /api/notify ─► [decision] ─► send now (priority 10, thread-id=project)
  ├─ idle_input ─► smart-idle gate
  │       ├─ internal choreography ─────► POST /api/notify ─► (in-app feed only)   [dropped, no push]
  │       └─ genuine idle ──────────────► POST /api/notify ─► [status] ─► coalescer.enqueue(project)
  │                                                                          └─(45s)─► one rollup push (collapse-id=status-project)
  ├─ intervention ─────────────────────► POST /api/notify ─► [status] ─► coalescer.enqueue(project)
  └─ permission_notification ──────────► POST /api/notify ─► [drop]
```

## Change points (implementable list)

| #   | File                               | Location                    | Change                                                                                 |
| --- | ---------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `apns-classify.ts`                 | new fn                      | `classifyNotificationTier(category)` → `decision`/`status`/`drop`                      |
| 2   | `src/routes/api/notify/+server.ts` | ~442–474                    | tier gate after dedup+skipPush, before payload build                                   |
| 3   | `src/routes/api/notify/+server.ts` | ~496–516                    | trim `data.toolInput` before spreading into `payload.data`                             |
| 4   | `src/routes/api/notify/+server.ts` | 543                         | keep decision `collapseId` unique (per `requestId`); coalescer uses `status-<project>` |
| 5   | `apn/status-coalescer.ts`          | new file                    | per-project buffer + `setTimeout` flush → one rollup `sendToMany`                      |
| 6   | `apn/apns-payload.ts`              | 15–45                       | `fitApnsPayload` trims `body.data`, caps < 4000 bytes                                  |
| 7   | `apn/library-apns.ts`              | 216–239                     | add `aps['thread-id'] = project` in `buildAlertBody`                                   |
| 8   | `apn/library-apns.ts`              | 347–355                     | retry-with-backoff on `httpStatus === 0`                                               |
| 9   | `push/device-token-store.ts`       | 150–159, 16–18              | `incrementFailure` + reset `failure_count` on success; fix doc comment                 |
| 10  | `.claude/hooks/notifier.cjs`       | `handleIdleInput` 1116–1148 | smart-idle gate + `INTERNAL_IDLE_MARKERS`                                              |

## Edge cases & gotchas

- **Decisions never buffer:** `permission`/`question` may set `waitForResponse`
  (creating a `pending_requests` row) and/or poll. They must bypass the
  coalescer entirely.
- **`skipPush` precedence:** evaluate the viewer-present `skipPush` before the
  tier gate; a status event with an active viewer should not enter the buffer.
- **`!override` guard:** the token `failure_count` increment must respect the
  existing `!override` guard (`+server.ts:585–591`) so an ad-hoc test token
  cannot poison a real registry row.
- **env-mismatch exemption:** `classifyApnsReason` treats a stored/server
  `app_env` mismatch as `transient_error` (kept, not pruned). The new
  `failure_count` path must preserve this or it will wrongly deactivate live
  sandbox devices when `APNS_PRODUCTION` flips.
- **Coalescer flush after restart:** a buffer + timer live only in the process;
  on restart a pending status batch is dropped (acceptable).
- **Two notifier wirings in this repo:** the repo `.claude/settings.json` posts
  to `:54007` (dead) while the global posts to `:54006` (live). The `:54007`
  posts fail silently. Out of scope here; noted for a later cleanup.

## Config constants

- `COALESCE_WINDOW_MS = 45_000` (status coalescing window).
- `APNS_MAX_PAYLOAD_BYTES = 4000` (headroom under the 4096 hard limit).
- `INTERNAL_IDLE_MARKERS` (the smart-idle drop list above).
- `BAD_TOKEN_FAILURE_THRESHOLD = 3` (only used by the low-priority `failure_count`
  wiring; the first-strike prune remains for unambiguous dead-token signals).

## Testing & verification

**Unit:**

- `classifyNotificationTier` maps every category to the correct tier.
- coalescer batches multiple events for one project within the window, flushes
  exactly once, and resets buffer + timer; two projects flush independently.
- `fitApnsPayload` caps an oversized payload < 4000 bytes while preserving
  `title`/`subtitle`.

**Live end-to-end (against the running server):**

- Fire a burst of genuine idle events for one project → exactly **one**
  coalesced push arrives.
- Fire an internal-choreography idle → **no** push (present in in-app feed).
- Fire a `permission` → buzzes **immediately**.
- Fire an oversized AskUserQuestion → APNs returns **200, not 413**, and the push
  lands on the physical device.

## Risks

- The smart-idle heuristic may over- or under-drop until the marker list is tuned
  — mitigated by logging every drop.
- Coalescing adds up to `COALESCE_WINDOW_MS` latency to status pushes — acceptable
  by design (status is not time-critical; decisions are never delayed).
