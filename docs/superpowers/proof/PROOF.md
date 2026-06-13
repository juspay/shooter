# Autonomous Summarization Engine — Verification Proof

Live browser verification on a Shooter dev server (port 54010), driven via chrome-devtools-mcp.

The real LiteLLM endpoint (`grid.ai.juspay.net`) is VPN-gated / unreachable from this machine, so the
pipeline was exercised against a **deterministic OpenAI-compatible LiteLLM mock** — crafted so the
5-agent next-step consensus produces a **4-vote** and a **3-vote** step (both clearing `quorum=3`)
plus 2-vote and 1-vote steps that are correctly filtered out. The engine code path is identical; only
the LiteLLM endpoint was swapped for the mock.

## Verified end-to-end (live)

| #   | Check                                                                                                                                             | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Auto-pilot panel renders for active sessions                                                                                                      | ✅     |
| 2   | Start → Stop toggle; "Watching for activity…"                                                                                                     | ✅     |
| 3   | Pipeline fires on high-signal trigger (`agent-question`), debounced                                                                               | ✅     |
| 4   | Summary + **5 parallel** next-step agents hit LiteLLM (mock saw summary + agents 1–5)                                                             | ✅     |
| 5   | Consensus rendered with vote badges — **4** "Run pnpm install with a clean lockfile", **3** "Verify package.json exists in the working directory" | ✅     |
| 6   | Persistence: `POST`/`GET /api/summaries` (consensus row persisted)                                                                                | ✅     |
| 7   | `GET /api/summaries` without auth → **401**                                                                                                       | ✅     |
| 8   | Push: `forcePush:true` → `result.sent: 1` (reaches phone while dashboard WS connected)                                                            | ✅     |
| 9   | Lifecycle: Auto-pilot state restored from `localStorage` after reload                                                                             | ✅     |

## Artifacts

- `01-panel-start.png` — Auto-pilot panel, **Start** button, empty state.
- `02-autopilot-on.png` — Auto-pilot **ON**, "Watching for activity…".
- `03-consensus-nextsteps.png` — consensus **NEXT STEPS** with 4/3 vote badges (the headline).
- `autopilot-demo.mp4` — 11 s walkthrough of the above (h264, 500×844, 330 frames).

Every screenshot and the video were opened and confirmed to show the expected state.

## Notes / follow-ups surfaced by verification

1. **Direct-fetch LiteLLM path added** (`litellm-json.ts`): LiteLLM is OpenAI-compatible + `cors:'direct'`,
   so the engine now calls it with a plain `fetch` and no longer depends on the heavy CDN NeuroLink SDK,
   which failed to evaluate in this browser runtime (it also breaks the existing `SessionSummarizer`).
2. **Card summary line** currently shows the existing `SessionSummarizer` output (which fell back here
   because of the SDK issue above); the engine's own summary is persisted to `/api/summaries`. Wiring the
   panel card to show the engine's summary is a small follow-up.
3. **LiteLLM creds on the dashboard**: to use litellm in production the dashboard must inject
   `LITELLM_BASE_URL`/key (or route via the server proxy). Decision flagged in the PR.
