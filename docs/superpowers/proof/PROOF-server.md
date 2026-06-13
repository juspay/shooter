# Autopilot — Server-Side Rearchitecture Proof

The engine now runs inside the always-on server (spec:
`2026-05-31-autopilot-server-side-rearchitecture.md`). Verified live with **no browser
engine** — the dashboard was never opened during the engine run.

## Verified (server-side, no browser)

- Engine boots with the server: `[autopilot] engine started (enabled=false, litellm=configured)`.
- Enabled via `POST /api/autopilot {enabled:true}` (just a curl — no browser).
- Drove `tool-failed` + `agent-question` onto the event bus; the engine's server-side
  listener received them and ran the pipeline.
- Mock log shows the summary call + **all 5 DISTINCT lenses** — `blocker`, `next-command`,
  `risk`, `validation`, `progress`. Votes are now real cross-perspective agreement.
- Persisted consensus (server, no browser): **"Verify package.json exists…" (4 votes)**,
  **"Run pnpm install with a clean lockfile" (3 votes)**; `sessionId` populated (was `null`).
- `connectedClients: 0` → the engine **pushed to the phone** (no WS client ⇒ normal skip logic
  sends; APNs sandbox, no `BadDeviceToken`).
- Read-only dashboard (`05-server-side-readonly.png`) renders the server-produced summaries and
  reflects the server's enabled flag — visible even with no live terminals.

## First-principles review findings fixed by this rearchitecture

| Finding                                       | Status                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| Browser-death (engine dies when tab closes)   | Fixed — runs in the always-on server                           |
| Multi-tab duplicate pipelines/pushes          | Fixed — single server engine                                   |
| `forcePush` backwards (pushed while watching) | Fixed — normal skip logic; pushes only when nobody's connected |
| `LITELLM_BASE_URL`/key exposure paths         | Server calls LiteLLM directly; key never near the browser      |
| Panel hidden behind `cards.length > 0`        | Fixed — panel always visible (reads `/api/summaries`)          |
| 5 identical-prompt agents = sampling noise    | Fixed — 5 distinct lenses                                      |
| Engine summary never displayed                | Fixed — panel shows it                                         |
| `GET /api/summaries` write-only dead weight   | Fixed — panel consumes it                                      |
| `sessionId: null` breaks per-session query    | Fixed — populated                                              |
| Resetting debounce delays critical push       | Fixed — high-signal fires on a short fixed grace               |
| Greedy `{[\s\S]*}` JSON regex                 | Fixed — balanced-brace scan                                    |

Artifact: `05-server-side-readonly.png`.
