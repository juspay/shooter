# Autonomous Summarization Engine — Design Spec

- **Date:** 2026-05-29
- **Status:** Approved (brainstorm) → implementation
- **Branch:** `feat/autonomous-summarization-engine`

## 1. Goal

A **browser-driven, autonomous** engine in the Shooter dashboard. Once the user
starts it ("Auto-pilot"), it continuously watches **all** running Claude Code /
OpenCode / terminal threads and, for each session, on every meaningful trigger:

1. produces a **single-pass LiteLLM summary** of the session's current state, then
2. runs **5 parallel LiteLLM "next-step" agents** that vote to a **consensus**
   next-step list,

then **persists** the result, renders it live in the dashboard, and **pushes** the
high-signal ones to the phone. It runs per-session until that session ends or the
user stops Auto-pilot.

## 2. Locked decisions

| Decision            | Choice                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime             | **Browser** (extends `client/dashboard` + `client/activity`). No server-side LLM.                                                                       |
| LLM base            | **LiteLLM** provider (`cors:'direct'`), model `LITELLM_MODEL` (`open-large`). Every call — summary + 5 agents — uses LiteLLM.                           |
| Verification agents | **Next-step consensus only**: summary is single-pass; the 5 agents focus solely on "what's next" and vote.                                              |
| Output              | **Persist (SQLite via new server route) + live dashboard panel + deduped phone push** (force-push so it reaches the phone while the dashboard is open). |

## 3. Components

**New files**

- `src/lib/modules/client/dashboard/next-step-consensus.ts` — **PURE** module.
  `mergeNextStepConsensus(lists, opts)` → `ConsensusResult`. Deterministic dedupe +
  quorum ranking. No I/O, no LLM. Unit-tested (TDD).
- `src/lib/modules/client/dashboard/autopilot.svelte.ts` — the autonomous engine:
  per-session trigger → summarize (1 LiteLLM call) → 5 parallel LiteLLM next-step
  calls → `mergeNextStepConsensus` → persist + push. Owns start/stop lifecycle,
  per-session debounce, and cleanup (no leaked intervals/subscriptions).
- `src/lib/modules/client/dashboard/AutopilotPanel.svelte` — UI: Start/Stop toggle +
  per-session card (latest summary, consensus next-steps with vote counts,
  last-updated, status). Reuse `client/common` components; dark theme.
- `src/routes/api/summaries/+server.ts` — `POST` (persist one) + `GET` (list recent,
  optional `?sessionId=`). **Must call `validateAuth`** like every other route.
- `src/lib/modules/server/sessions/summary-store.ts` — SQLite `session_summaries`
  table; singleton on `globalThis.__shooter_summary_store` (mirror `terminal-store.ts`).

**Modified files**

- `src/lib/modules/client/dashboard/store.svelte.ts` — integrate the engine + state;
  reuse existing trigger points (`tool-failed`, `agent-question`, `errorCount>=3`,
  every-20th-event around `store.svelte.ts:357-364`).
- `src/lib/modules/client/dashboard/DashboardView.svelte` — mount `AutopilotPanel`.
- `src/routes/api/notify/+server.ts` — add optional `forcePush` flag: when `true`,
  send the push even if connected WS clients > 0 (still deduped). Default `false`
  preserves current behavior.
- `src/lib/modules/client/neurolink/` — a small helper to run a structured LiteLLM
  prompt and parse JSON out (reuse the existing SDK + `litellm` provider config in
  `provider-config.ts`; `litellm` is `cors:'direct'` so no proxy needed).
- Types: add `NextStep`, `ConsensusResult`, `SessionSummaryRecord`, `AutopilotState`
  to the central types module (hand-written union types in `src/lib/types/<module>.ts`,
  re-exported from the barrel — per the type-system rules).

## 4. Next-step consensus algorithm (precise, pure, deterministic)

Each of the 5 agents returns up to `K=3` next-steps, each `{ text, confidence }`
(0–1). Merge:

1. **Normalize** each `text` for grouping: lowercase, trim, collapse whitespace,
   strip trailing punctuation.
2. **Group** near-duplicates: same normalized string, OR Jaccard token-overlap ≥
   `0.6`. Keep the highest-confidence original phrasing as the group label.
3. **Score** each group by **vote count** = number of distinct agents that proposed it.
4. **Consensus** = groups with `votes ≥ QUORUM` (default `3` of `5`), sorted by votes
   desc, then mean confidence desc.
5. If none reach quorum, return the single highest-vote group flagged `tentative:true`.
6. Output `ConsensusResult { steps: [{ text, votes, confidence, tentative? }],
agentCount, quorum }`.

No LLM in the merge — pure function, fully unit-testable.

## 5. Trigger & lifecycle

- **Start:** an Auto-pilot toggle in the dashboard (state persisted to `localStorage`).
- **Per-session triggers** (reuse existing dashboard logic): `agent-idle`,
  `agent-question`, `tool-failed`, `errorCount>=3`, or every `N=20` events.
  **Debounce** per session (min `15s` between pipeline runs) to bound LiteLLM cost.
- **Completion:** on `session-ended`, run one FINAL summary + consensus, mark the
  session done. Engine idles when no active sessions; on toggle-off it **tears down**
  all timers/subscriptions (verified no leaks).

## 6. Persistence

`session_summaries` columns: `id` TEXT PK, `terminal_id` TEXT, `session_id` TEXT,
`project_name` TEXT, `summary` TEXT, `next_steps` TEXT (JSON), `trigger` TEXT,
`created_at` TEXT. `POST /api/summaries` validates auth then inserts;
`GET /api/summaries?sessionId=` returns recent rows. The browser engine POSTs after
each run using the same auth the dashboard already uses.

## 7. Push

On a run whose trigger is high-signal (`agent-question` / `tool-failed` / `agent-idle`)
and that yields ≥1 consensus step, POST `/api/notify` with
`{ title, message: summary + top next-step, data:{ source:'autopilot', sessionId },
forcePush:true }`. Deduped by the existing window keyed on `sessionId`+top-step.

## 8. Testing strategy

- **TDD unit** (`tests/next-step-consensus.test.cjs`, via `tsx/cjs`): quorum,
  dedupe/grouping, ranking, no-quorum→tentative, empty input, K-cap.
- **TDD unit**: trigger/debounce decision (pure helper).
- **Integration** (node, mock LiteLLM + mock fetch): pipeline emits correct
  summarize→consensus→persist payload→push payload shapes.
- **Server route test** (`tests/summaries-route.test.cjs`, tmp sqlite, existing
  pattern): auth required; insert + list round-trip.
- Wire all into `pnpm test`. `pnpm check` / `lint` / `build` must be green.

## 9. Browser verification (proof: screenshots + video)

Driven live (chrome-devtools MCP, dev server up, authenticated). Use-cases:

1. Toggle Auto-pilot → panel activates.
2. Session activity → summary appears (real LiteLLM if reachable; deterministic stub otherwise).
3. `agent-question` / `tool-failed` / `agent-idle` → consensus next-steps render with vote counts.
4. Multiple concurrent sessions → independent cards update.
5. Reload → summaries rehydrate from `GET /api/summaries`.
6. High-signal run → phone push fires; confirm `sent:1` (authenticated via browser).

**Artifacts:** one screenshot per step in `.proof/screens/`, stitched to
`.proof/autopilot-demo.mp4` (ffmpeg). Each screenshot verified by opening it; video
verified via `ffprobe` + frame spot-check.

## 10. Out of scope

- Server-side always-on engine (no browser) — not this iteration.
- Embedding-based semantic dedupe — use the simple deterministic grouping above.
- Android panel parity.

## 11. Integration anchors (from codebase map)

- Dashboard triggers: `client/dashboard/store.svelte.ts:357-364`; `SessionSummarizer`
  per terminal in a `SvelteMap` at `store.svelte.ts:46`.
- LiteLLM provider: `client/neurolink/provider-config.ts` (`litellm` → `open-large`,
  `cors:'direct'`).
- WS all-sessions bus: `/ws/events` via `broadcastEvent` (`server/ws/server.ts:99`);
  per-session `/ws/session/:id`.
- Push entry: `POST /api/notify` (`src/routes/api/notify/+server.ts`); WS-active skip
  via `getConnectedClientCount()` (`ws/server.ts:39-41`).
- SQLite pattern: `server/terminal/terminal-store.ts` (singleton on `globalThis`).
