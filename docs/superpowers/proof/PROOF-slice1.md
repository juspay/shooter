# Slice 1 Proof — Autonomous orchestration driver (the loop)

Verified live in a **real browser** (chrome-devtools) against a **live, isolated Node server**
(`PORT=54012`, isolated `HOME` so the user's `~/.shooter` DB and `:54006` daemon were untouched).
The driver under test is the **shipped module** (`autopilot-driver.svelte.ts`), mounted by the real
`AutopilotPanel` — not an injected-JS prototype.

## Setup

- Created a Shooter-managed `bash` terminal via `POST /api/terminals` → id `27b7b107`.
- Seeded consensus via `POST /api/summaries` with a command next-step:
  `[{"text":"echo SHOOTER_AUTOPILOT_OK","confidence":0.9,"votes":4}]`.
- Opened the dashboard, paired (`localStorage.shooter_config`), reloaded → the panel mounted and
  `autopilotDriver.start()` ran (connects `/ws/events`, polls `/api/terminals` + `/api/summaries`).
- Clicked the **Autonomy → On** toggle (the real UI control) → persisted `{"enabled":true}`.

## Result — the loop closed

1. Emitted a real `agent-idle` event for the terminal via `POST /api/notify`
   (`data.eventType:"session.idle"`), which the server broadcasts on `/ws/events`.
2. The driver received it, ran the safety gate (`decideInjection`), produced the command, vetted it
   (`guardCommand`), and injected over `/ws/terminal/27b7b107`.
3. **PTY scrollback proved it ran:** `MARKER_IN_PTY: true`
   - `bash-3.2$ echo SHOOTER_AUTOPILOT_OK` ← the driver injected this
   - `SHOOTER_AUTOPILOT_OK` ← bash's output
4. **UI proof** (`p1-injected.png`): panel shows Autonomy **On**, the amber auto-inject warning, and
   **RECENT ACTIONS → `INJECTED echo SHOOTER_AUTOPILOT_OK` (just now)**.

## Result — the guards held live

- Re-emitting `agent-idle` within the 30s min-interval produced **no second injection**
  (still exactly 1 injected command, 1 output line). Live rate-limit / dedup match the 17 unit tests
  in `tests/decide-injection.test.cjs`.
- `POST /api/notify` returned `"Push skipped (WebSocket clients connected)"` — the current behavior
  that **Slice 2** (the away/presence signal) corrects.

## Final-build re-verification (all 5 slices assembled)

The above was done incrementally. After slices 4–5 landed (which changed the driver — adding the
wake listener and the on-device-decide path), the server was restarted on the **final** build and the
loop was re-run in the same Chrome MCP browser:

- Dashboard loaded on the final bundle (`version 1780303219238`); **console: 0 errors** (only a
  pre-existing benign `apple-mobile-web-app-capable` meta-tag deprecation warning).
- Seeded a fresh consensus `echo FINAL_BUILD_VERIFY_OK`; emitted `agent-idle`.
- PTY: `NEW-MARKER in PTY: true`, exactly **1** injected command + 1 output line (no dup).
- UI: RECENT ACTIONS → `INJECTED echo FINAL_BUILD_VERIFY_OK` (`p1-final-injected.png`).
- The driver's `tryNativeDecide` (which reads `window.ShooterBridge.agentDecide`) gracefully no-ops
  in a plain browser — no console error — so the heuristic produced the command, as designed.

## Scope of what this proves (and does NOT)

- **Proven:** the real shipped driver, in a real browser, on the final build, auto-injects into a
  real managed PTY on idle, with guards holding, UI reflecting it, console clean.
- **NOT proven here:** a real Claude session going idle (the trigger was a synthetic `agent-idle`),
  a real LLM / on-device decide step (the command came from the heuristic on a seeded next-step),
  delivery against the user's live `:54006` daemon (an isolated test server was used), and all native
  iOS runtime behavior (compile-only).

## Artifacts

- `p1-dashboard.png` / `p1-injected.png` — slice-1 incremental run (Autonomy Off → On → INJECTED).
- `p1-final-dashboard.png` / `p1-final-injected.png` — final-build re-verification (all 5 slices).
- Unit tests: `tests/decide-injection.test.cjs` (17 passing).
