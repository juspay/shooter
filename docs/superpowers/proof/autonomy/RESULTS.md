# Autonomy end-to-end proof — RESULTS

Run date: 2026-06-03. Target: **workforge** (owned TS CLI, isolated disposable clone, no remote).
Feature the autopilot built **autonomously**: a `--dry-run` flag for `workforge create`.

The video + screenshots are **not committed** (they show the machine's real Claude session list).
They live locally at `~/shooter-autonomy-proof/`:

- `autonomy-drive.mp4` (241s) — the live drive on the dashboard (autonomy ON, the INJECTED action log filling, the summary updating)
- `01-drive-injected-log.jpg`, `02-task-complete.png`, `03-autonomy-off-killswitch.png`, `04-agent-terminal.png`
- `feature.diff`, `acceptance-dryrun.txt`

## What happened

One human action: the kickoff prompt (the goal). After that, **zero human keystrokes** — the
loop drove the rest: on every `agent-idle`, the server engine produced a goal-anchored
summary + 5-lens consensus next-step, and the browser driver auto-injected it into the agent's
PTY. The agent implemented the feature across the cycles, the loop nudged it through build +
lint + the dry-run verification, then autonomy was flipped **off** on the dashboard (kill switch).

## Expected vs actual

| #   | Expected (written before the run)                    | Actual                                                                                       |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| E2  | Engine derives a goal-anchored consensus each idle   | **8 cycles** for this terminal, goal-anchored                                                |
| E3  | Driver auto-injects each step, zero human keystrokes | **7 injections**, 0 human keystrokes after kickoff                                           |
| E4  | ≥4 autonomous cycles drive the feature to completion | 7 injections / 28 agent tool calls — completed                                               |
| E5  | Only the 3 expected files change                     | `src/index.ts`, `src/types/index.ts`, `src/commands/create.ts` (+61 lines) — exactly those   |
| E6  | `pnpm build` exits 0                                 | **OK**                                                                                       |
| E7  | `pnpm lint` exits 0                                  | **OK**                                                                                       |
| E8  | `create --dry-run` previews and creates nothing      | **Verified** — worktrees + branches identical before/after; no `recdemo` branch/worktree/dir |
| E9  | Recorded in the browser                              | `autonomy-drive.mp4` (241s, 2400×1426)                                                       |

**Pass.** The autonomous loop built a real, correct, mergeable feature, verified end-to-end.

## The feature it built (real artifact)

`create.ts` got an early dry-run banner, a skip of the confirm prompt, and a guard on each
mutating method that prints what it _would_ do and returns. Verified output:

```
[dry-run] Would create worktree 'feat/recdemo' at …/feat/recdemo from base 'autopilot/dry-run-demo'
[dry-run]   -> git worktree add -B feat/recdemo …
[dry-run] Would copy environment files (none found to copy)
[dry-run] Would install dependencies with pnpm: pnpm install
[dry-run] Preview complete — no branch, worktree, or files were created.
```

## The load-bearing finding (and fix)

The first pass **stalled after step 1**. Root cause: `decideInjection` hard-blocked any
`tentative` consensus step (the 5 _distinct_ lenses rarely reach 2-vote quorum on the exact
next micro-step mid-implementation), so the driver never injected and the agent sat idle.

`tentative` is a **precision filter, not a safety boundary** — the real guards are the deny-list,
the no-remote clone, `guardCommand`, the confidence floor, the circuit breaker, and dedup. For
**agent** terminals the injection is a natural-language _prompt_ the agent re-grounds against its
goal (not a raw command run verbatim), so relaxing `tentative` there keeps the loop live without
widening blast radius. Fix: `decideInjection` gains `opts.allowTentative`; the driver sets it true
only for agent terminals; shell terminals stay strict (regression-tested). **This is what
unblocked end-to-end autonomy.**

A second change — pinning a per-session **goal** the engine prepends to every context — keeps the
nudges anchored once they flow. It is good insurance but was **not** the thing that unblocked the
stall.

## Honest limitations

- The engine reasons from **events, not code state**, so it cannot itself tell "build passes" from
  "feature complete" — it occasionally over-nudged "run build" while `create.ts` was still
  unimplemented. The agent's own goal-anchored judgment carried that gap (it kept implementing).
- The loop is **non-deterministic**: one earlier pass took a single early-return guard; this one
  guarded each method individually. Both correct; the path varies.
- Safety rests on `dontAsk` + allow-list + deny-list **plus** the disposable no-remote clone and
  active supervision. Per Claude Code docs, deny-lists are not airtight against an adversarial
  agent (flag permutations, full paths, exec-runners); the no-remote clone is the hard guarantee
  that nothing could be pushed.
