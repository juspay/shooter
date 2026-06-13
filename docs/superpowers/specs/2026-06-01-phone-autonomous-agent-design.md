# Phone-Resident Autonomous Agent — Design

- **Date:** 2026-06-01
- **Branch:** `feat/phone-autonomous-agent` (stacked on `feat/autonomous-summarization-engine` / PR #80)
- **Builds on:** the always-on server-side autopilot engine (`autopilot-engine.ts`, `/api/summaries`, `/ws/events`).

## Goal

Turn the phone from a passive notification target into the **brain** of an autonomous loop:
the Mac streams session state → the phone decides the next step → the phone injects the command
into the running terminal → the Mac's PTY runs it → streams the result back → repeat. Control and
a live view live on the phone; the Mac stays the always-on data source + executor.

## Locked decisions (from the user)

1. **Autonomy mode = AUTO-INJECT (no confirm).** The phone runs proposed commands automatically.
   The risk (a hallucinated/destructive command, or collision with a human typing) is accepted —
   but mitigated by the safety guards below. Auto-inject is the headline behavior, not a hidden
   opt-in.
2. **Scope = everything, including native Swift now.** Slices 1–3 (browser/server) are built AND
   verified here. Slices 4–5 (native Swift) are written and **compile-checked only** — real-device
   behavior (background wake, on-device LLM) is validated by the user on hardware. We never claim a
   device behavior was verified when it was only compiled.

## Architecture

```text
 Mac (always-on server)                         Phone (WebView over the dashboard)
 ┌───────────────────────────┐                  ┌────────────────────────────────────┐
 │ autopilot-engine          │   /ws/events     │ autopilot-driver (NEW)             │
 │  → summary + 5 lenses      │ ───────────────▶ │  watches events + GET /api/summaries│
 │  → consensus → /summaries  │   GET /summaries │  picks high-confidence next step    │
 │                           │                  │  ── safety gate ──▶ inject          │
 │ PTY (terminal-handler)     │ ◀─────────────── │  POST /ws-ticket → /ws/terminal/:id │
 │  pty.write(cmd)            │  {type:'input'}  │  sendInput(cmd + '\r')              │
 │  → output frames ──────────│ ───────────────▶ │  reads output, re-evaluates         │
 └───────────────────────────┘                  └────────────────────────────────────┘
```

The phone is an independent **agent** (own loop, own decisions, own on-device memory once the
bridge persistence lands) but not an independent **sensor** — the session data is generated on the
Mac and streamed over the existing channels. That is the honest ceiling and it is fine.

### Reuse (already exists — confirmed by the map)

- Auth: `POST /api/ws-ticket` (Bearer API_KEY) → 30s single-use ticket. Same flow for phone + script.
- Inject transport: `/ws/terminal/:id` `{type:'input',data}` → `pty.write` (`terminal-handler.ts:72`,
  `pty-holder.cjs:418`). `xterm-wrapper.ts:238 sendInput()` proves it's callable without a keystroke.
- Decisions: the server engine already computes next-steps → `GET /api/summaries`.
- Events: `/ws/events` broadcasts all `WireShooterEvent` variants; the dashboard store already
  subscribes.

## Auto-inject safety model (the load-bearing part)

Auto-inject is only safe with guards. ALL of these are mandatory:

1. **Idle-only injection.** Inject a command into a terminal ONLY when the latest signal for that
   terminal is `agent-idle` (the agent is waiting) — never while a tool is running, and never within
   `HUMAN_GRACE_MS` of observed human input/output activity on that terminal. This prevents byte
   interleaving with a human and prevents firing mid-operation.
2. **Managed-terminal-only.** Inject only into terminals Shooter created (`POST /api/terminals`).
   External Claude sessions (read-only) are summarize/push-only — the server rejects their input
   (`session-handler.ts:522`). The driver must filter on this.
3. **Dedup.** Never inject the same command (normalized) twice in a row for the same terminal; track
   `lastInjected[terminalId]`.
4. **Rate-limit + backoff.** At most one auto-inject per terminal per `MIN_INJECT_INTERVAL_MS`
   (≥ the engine's 30s). Exponential backoff if consecutive injections produce no new progress
   signal.
5. **Max-actions circuit breaker.** Stop auto-injecting for a terminal after `MAX_AUTO_ACTIONS`
   consecutive injections without a human touch or a `tool-completed success` — surfaces a "needs
   you" push instead of looping forever.
6. **Confidence + consensus floor.** Only inject `consensus.steps[0]` when it is non-tentative and
   `confidence ≥ INJECT_CONFIDENCE` AND `votes ≥ quorum`. Tentative/low-confidence → push only.
7. **Hard kill switch.** A single toggle (`autonomy.enabled`, persisted + reachable from the phone)
   halts ALL injection immediately, independent of the summarize/push engine. Off by default.
8. **Command guard (allow shape, not allowlist).** Reject obviously dangerous payloads before
   injection (multi-line scripts, `rm -rf /`, fork bombs, `:(){`, output redirection to device
   files). This is a coarse seatbelt, not a security boundary — auto mode is still the user's risk.

The driver is pure-logic-first: a `decideInjection(state, consensus): InjectionDecision` function
that takes the accumulated per-terminal state + consensus and returns
`{ inject: boolean, command?: string, reason: string }`. This is unit-tested (TDD) with no I/O.

## The "away" signal (push correctness)

Problem: once the phone holds a persistent `/ws/events` connection to run the loop, "a WS client is
connected" no longer means "the user is watching" — so the existing skip-push heuristic would
suppress every push. Setting `forcePush:true` blindly is the opposite error (you'd get pushed while
staring at your laptop).

Design: a **presence heartbeat** distinct from raw WS connection count.

- New `POST /api/presence {state:'foreground'|'background', surface?}` (Bearer auth) with a short TTL
  (e.g. 45s). The phone (native app lifecycle) reports foreground/background; the dashboard reports
  "visible" via the Page Visibility API as a fallback.
- `isViewerPresent()` = any presence heartbeat with `state:'foreground'` within TTL.
- Push rule: the autopilot engine pushes (real APNs) when **NOT** `isViewerPresent()`; otherwise it
  relies on the in-WebView live view. This replaces the connection-count proxy.
- Backward-compatible: if no presence has ever been reported (old clients), fall back to the current
  WS-connection heuristic so nothing regresses.

## Slices

| #   | Slice                              | Files (primary)                                                                                                                         | Verify                                              |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Orchestration driver (the loop)    | `client/dashboard/autopilot-driver.svelte.ts` (NEW), pure `decide-injection.ts` (NEW) + test, types                                     | browser (chrome-devtools, live server) + unit tests |
| 2   | Away-signal + push fix             | `routes/api/presence/+server.ts` (NEW), `server/sessions/autopilot-engine.ts`, presence store                                           | server (curl + logs) + unit test                    |
| 3   | LiteLLM client proxy               | `client/neurolink/fetch-proxy.ts`, `provider-config.ts`                                                                                 | browser (network panel)                             |
| 4   | Native background-wake             | `library-apns.ts` (content-available path, server-verifiable), `ios/.../AppDelegate.swift`, xcodeproj `INFOPLIST_KEY_UIBackgroundModes` | server part verified here; Swift compile-only       |
| 5   | On-device LLM + bridge persistence | `ios/.../ContentView.swift` (bridge: `agentDecide`, `writeFile`/`readFile`), FoundationModels decide fn                                 | Swift compile-only                                  |

Native bridge **file persistence** (the user's "extend the J bridge to write/read files" ask) lands
in slice 5: new `WKScriptMessageHandler` methods `fileWrite`/`fileRead`/`fileList` backed by the
app's Application Support sandbox, returned via the existing `sendNativeResponse` callback channel
(`ContentView.swift:570`). The WebView driver uses it for durable agent memory when on iOS, falling
back to `localStorage` in a plain browser.

## Verification boundary (held under "end-to-end" pressure)

- **Verifiable here (must prove):** the inject loop running as real dashboard module code exercised
  in chrome-devtools against the live Node server (NOT an injected-JS prototype); presence/away push
  behavior via curl + server logs; LiteLLM proxy routing in the network panel; the content-available
  APNs payload shape; all unit tests + `pnpm check`/`lint`/`build`.
- **Compile-only (cannot device-verify here):** iOS background wake actually firing, the
  FoundationModels on-device decide step, the bridge file I/O on a real device. These are written,
  `xcodebuild`-compiled if the toolchain is present, and handed to the user to validate on hardware.

## Out of scope / later

- Auto-run-safe / confirm-risky hybrid mode (needs a real command-risk classifier).
- Embedding-based dedupe of next-steps.
- Driving external (non-Shooter-managed) Claude sessions (server-side read-only limit).
- Multi-phone presence reconciliation.

## Risks

- Auto-inject into a live PTY is inherently dangerous; the guards reduce but do not eliminate this.
  The kill switch + idle-only + command guard are the primary seatbelts.
- iOS background wake is ~30s bursts, rate-limited — NOT a continuous on-phone loop. The Mac engine
  remains the always-on floor; the phone loop is "while foregrounded + background-wake bursts."
- `xcodebuild` may not be available/headless here; if so, native slices are delivered as
  code-complete + a manual build checklist, explicitly unverified.
