# Proof — real LiteLLM test (working key) + findings

After the user supplied a working key (`.env` updated; the old one was blocked), the isolated server
was pointed at the real `grid.ai.juspay.net` model (`open-large`). This is the first time the pipeline
ran against a real LLM (everything prior used a mock or seeded consensus).

## What works with the real model

- **Key + transport:** `POST /api/neurolink-proxy → grid.ai` returns real completions (HTTP 200).
- **Engine summaries:** the engine produced an accurate, real summary from a driven failing-install
  session: _"pnpm install failed due to outdated lockfile; agent idle awaiting direction."_ The
  summarize call + JSON extraction work against the real model.
- **Pipeline runs end-to-end:** events → engine → 6 LLM calls → consensus merge → persisted
  `auto-<terminalId>-<ts>` record → (push gated by presence).

## Findings the real model exposed (the mock hid these)

1. **Lens prompt placeholder echo.** The original lens prompt embedded a fill-in example
   `{"text":"<short action>"...}`. The real (instruction-following) model **copied the placeholder
   verbatim**, so the consensus next-step was literally `"<short action>"`. The mock returned crafted
   real steps, so this was invisible until now. **Fixed:** rewrote the lens prompt to describe the
   schema in words with **no copyable placeholder / angle-bracket tokens**.
2. **5-lens next-steps are unreliable with this verbose model.** `open-large` is a reasoning/verbose
   model; for the terse JSON the lenses ask for, it tends to wrap prose around the JSON or return
   nothing parseable → empty consensus. The cleaner prompt avoids the placeholder-echo but still
   yields empty consensus when the model rambles.
3. **Burst calls go flaky.** Each pipeline run fires 6 parallel LLM calls; on repeated runs the real
   calls began timing out / failing (rate-limit or slow verbose model), and the summary fell back to
   the heuristic (`idle — 0 tool calls, 1 errors`).

## Resolution — engine consensus FIXED for the real model

The root cause was that `open-large` is a reasoning model: it ignores `response_format` and reasons
out loud, and with small `max_tokens` the JSON was truncated before it appeared. Fixes applied:

1. **Strong JSON-API system prompts** — "You are a JSON API: do NOT explain or reason; the first
   character MUST be `{`…". A direct probe confirmed this makes `open-large` emit clean JSON-first.
2. **`response_format: {type:'json_object'}` + `temperature: 0`** in the client.
3. **Larger token budgets** (summary 220→500, steps 320→800) so the JSON isn't truncated.
4. **Concurrency limit (2) on the 5 lens calls** + retry/backoff — the original all-5-at-once burst
   was overwhelming the gateway (timeouts → ~140s).

**Proven (record `auto-27b7b107-1780311881280`, real grid.ai):**

- summary: _"Agent idle after pnpm install failed due to outdated pnpm-lock.yaml in tmp/shooter-ap-home."_
- consensus: **`cd tmp/shooter-ap-home && pnpm install --no-frozen-lockfile`** — confidence 0.95,
  **3 votes, non-tentative** (real cross-lens agreement, a real command, no placeholder).

So both halves now work against the real model: accurate **summaries** AND a correct, quorum-backed
**next-step consensus**. Caveat: after dozens of test runs in one session I exhausted the gateway's
rate limit, so a final re-timing of the concurrency improvement was throttled — the quality fix is
proven; the latency under a fresh rate-limit budget should be well under the original 140s.
