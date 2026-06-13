# Proof — the whole orchestration, end-to-end, with a real agent (on video)

**Artifact:** `autopilot-loop.mp4` (≈70 s) — a continuous CDP screencast of the **real dashboard**
in a **real browser** (chrome-devtools, port 9222) driving a **real `claude` agent** on a live,
isolated Node server (`PORT=54012`, isolated `HOME=/private/tmp/ap-home` so the user's `~/.shooter`
DB and `:54006` daemon were never touched).

This run uses **no synthetic triggers and no seeded consensus** — every step the video shows was
produced by the live components: a real Claude turn, the real always-on engine calling the real
LLM, and the shipped browser driver injecting over the real PTY transport.

## What the video shows (the full loop)

1. **Dashboard**, Autonomy **On**, the amber auto-inject banner. A Shooter-managed `claude` terminal
   runs in `ap-home/agentdemo` (a tiny Node project with a bug: `add()` does `a - b`).
2. A human gives the **initial task** ("the test is failing — run it and give the one-line root
   cause, don't fix it"). Claude runs `node calc.test.js`, sees the failure, and goes **idle** with
   its diagnosis.
3. The **engine** (server-side, always-on) summarizes the _real event stream + the agent's own last
   message_, runs 5 distinct-lens next-step agents through the real LLM, and reaches a
   **non-tentative consensus**: _"Fix calc.js:3 — change `return a - b` to `return a + b`"_. This
   appears live on the dashboard.
4. **RECENT ACTIONS → INJECTED** — the phone-resident **driver** (running in the WebView/browser)
   picks up the consensus and injects it as the next **prompt** into the live `claude` PTY (the same
   transport a human keystroke uses).
5. Claude **acts on the injected prompt** — `Edit` calc.js (`a - b` → `a + b`), re-runs the test —
   and goes idle: _"the test now passes (PASS, exit 0)."_
6. The engine recomputes and the dashboard updates to **"Fixed add function in calc.js to use +
   instead of -; tests now pass"** with a sensible follow-up step.

The phone/dashboard autonomously drove a real coding agent to diagnose and fix a real bug, and the
test went green — exactly the orchestration the feature promises.

Supporting stills: `frame-injected.jpg` (INJECTED in RECENT ACTIONS), `frame-resolution.jpg` (tests
now pass), `dry-01-paired.png` (paired dashboard, autonomy on), `finale-fixed.png`.

## The material finding (why this took real code changes)

Before this work, **the autopilot had never actually orchestrated a real agent** — every prior
proof injected a hand-crafted `terminalId`-bearing POST to `/api/notify`. Tracing it live revealed
the real (non-synthetic) path was broken end-to-end:

- **The engine + driver key on `terminalId`, but nothing produced it.** The only source of
  `WireShooterEvent`s is the notifier hook (`/api/notify`), and it never tagged a `terminalId`. Both
  the engine (`handleEvent`) and the driver drop events without one — so a real managed agent's
  activity reached neither.
- **Claude idle was never even forwarded.** The notifier mapped the `Stop` hook to `session.idle`
  and then _dropped_ it (default case — "not actionable remotely"). So a real agent going idle —
  the engine's and driver's primary trigger — produced **nothing** on the wire. Confirmed live:
  `/ws/events` and `/api/notify` were silent after a real Claude idle.

## What was fixed (verified live, not just compiled)

| #   | Fix                                                                                                                                                                                                                                                    | File                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | PTY injects `SHOOTER_TERMINAL_ID`; notifier tags every event's `terminalId` from it                                                                                                                                                                    | `pty-holder.cjs`, `notifier.cjs`                |
| 2   | Notifier **forwards managed-terminal activity** (`session.idle`, `tool.before/after`, `error`) as skip-push broadcasts — only when `SHOOTER_TERMINAL_ID` is set, so normal sessions are unchanged                                                      | `notifier.cjs`                                  |
| 3   | Idle events are **enriched with the agent's last message** (the outcome — "test failed because…"), with a short flush-delay so the Stop hook reads the _final_ message, not an early one                                                               | `notifier.cjs`                                  |
| 4   | Engine uses a **dedicated non-reasoning model** (`open-fast`, via `AUTOPILOT_MODEL`) for structured extraction — `open-large` reasons out loud and never emits parseable JSON                                                                          | `autopilot-engine.ts`, `litellm-client.ts`      |
| 5   | **Placeholder-free, JSON-first** summary + lens prompts (the old schema example text leaked verbatim into real consensus)                                                                                                                              | `autopilot-engine.ts`                           |
| 6   | Consensus **clustering tokenizer strips wrapping punctuation** so code-bearing steps (`` `return a - b` ``) group instead of fragmenting; quorum tuned to 2-of-5 (the distinct lenses phrase the same action differently, which undercounts agreement) | `next-step-consensus.ts`, `autopilot-engine.ts` |
| 7   | Driver **two-step submit** for agent TUIs: an agent treats a single `text\r` chunk as a _paste_ (the CR becomes a newline, not a submit), so the prompt text and the Enter are sent as separate writes, with newlines collapsed                        | `autopilot-driver.svelte.ts`                    |

All 6 source files pass `pnpm check` / `lint` / `test` (incl. the 20 consensus tests) / `build`.

## Verification boundary (held honestly)

- **Proven live here:** real `claude` authenticates + runs in a managed PTY; its idle + tool events
  reach the engine tagged with `terminalId`; the engine produces a real, non-tentative, _grounded_
  consensus via the real LLM; the browser driver injects it and the agent acts; the loop repeats to
  a passing test — captured continuously on video.
- **Still device-only (unchanged):** the native iOS background-wake + on-device decide path remain
  compile-checked; the phone here is the browser/WebView, which is the same driver code that ships
  in the app.
- **Engine model:** the pipeline now defaults to `open-fast` (non-reasoning) via `AUTOPILOT_MODEL`,
  independent of the user's chat `LITELLM_MODEL`. `open-large` is a reasoning model and is unsuitable
  for the engine's JSON extraction (it ignores `response_format`).
