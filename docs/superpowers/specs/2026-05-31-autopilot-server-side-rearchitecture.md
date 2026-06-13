# Autopilot — Server-Side Rearchitecture

- **Date:** 2026-05-31
- **Supersedes** the browser-driven runtime in `2026-05-29-autonomous-summarization-engine-design.md`.
- **Branch:** `feat/autonomous-summarization-engine` (updates PR #80)

## Why (first-principles review)

The browser-driven engine only runs while a dashboard tab is open — i.e. while you're at the
laptop. But phone-push matters precisely when you've **walked away** (tab closed, laptop asleep),
so the engine was dead exactly when it was needed. The Shooter server is already always-on
(tunnel, hooks, session watchers, push), and a server-side LLM path now exists. Move the engine
there.

This also dissolves: multi-tab duplicate pipelines, `forcePush` being backwards, `LITELLM_BASE_URL`
browser exposure, and the panel-gating UX problem.

## Architecture

- **Engine** — `src/lib/modules/server/sessions/autopilot-engine.ts`: an always-on worker started
  from `server.ts`. Subscribes to the server-side `WireShooterEvent` stream (the same events
  `pty-manager` and the `/api/notify` hook bridge already broadcast) to track per-session state
  across ALL threads. No browser required.
- **LLM** — `src/lib/modules/server/sessions/litellm-client.ts`: direct OpenAI-compatible call to
  `LITELLM_BASE_URL` with `LITELLM_API_KEY` from server env. No proxy, no browser exposure.
- **Pipeline** — summarize (1 call) + **5 distinct-lens next-step agents**
  (blocker / next-command / risk / validation / progress) → `mergeNextStepConsensus`. Votes are now
  meaningful: a step proposed by ≥3 _different lenses_ is real cross-perspective agreement, not
  sampling noise.
- **Persistence** — engine writes `summaryStore` directly (in-process; no HTTP hot path).
- **Push** — engine POSTs `localhost/api/notify` with the **normal skip logic** (push only when no
  dashboard WS client is connected = when you're away). `forcePush` is no longer used.
- **Control** — `POST /api/autopilot {enabled}` toggles + persists; `GET /api/autopilot` reports
  state. The engine reads the persisted flag.
- **Dashboard (read-only)** — `AutopilotPanel` fetches `GET /api/summaries` (short poll) to show
  server-produced summaries + consensus; the toggle hits `/api/autopilot`. The client engine
  (`autopilot.svelte.ts`) and the dashboard LiteLLM injection are **removed**.

## Review findings folded in

- 5-agent consensus → 5 distinct lenses (real diversity).
- Engine summary is now displayed (panel reads `/api/summaries`).
- `GET /api/summaries` is now consumed (no longer write-only).
- High-signal triggers fire fast (short grace); resetting debounce only for the periodic trigger.
- `forcePush` dropped server-side (normal skip is correct).
- Proxy SSRF — harden to parse origin + pathname-prefix (proxy stays for the `/neurolink` playground).
- Bugs: `parseInt` radix, sync-I/O guard at store load, `sessionId` populated, non-greedy JSON extract.

## Testing

- TDD: `litellm-client` response parse; `next-step-consensus` (existing 20 tests).
- Live (proof): enable autopilot, drive session activity, confirm summaries persist + the dashboard
  renders them **with no browser engine running**; push fires only when no WS client is connected.
  Screenshots + video.

## Out of scope

- Removing the now-unused `forcePush` flag from `/api/notify` (leave it; harmless).
- Embedding-based dedupe.
