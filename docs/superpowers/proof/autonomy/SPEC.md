# Autonomy end-to-end proof — build a real feature, recorded + verified

**Goal of this exercise (set by the user):** prove the Shooter autopilot's _autonomy_ works
end-to-end on something **valuable** — it autonomously builds a real improvement in a real,
used repository, recorded in the browser, and we then **verify that the things that were
supposed to happen actually happened** (expected-vs-actual orchestration trace).

This document is written **before** the run. It is the falsifiable contract: if the actual
trace does not match the expected trace below, the demo failed and we say so.

---

## The target (discovered by going through the system)

The autopilot's own session/terminal records show the repos actually worked in on this machine:
`lighthouse`, `curator`, `neurolink` (Juspay production — not mine to autonomously mutate),
and `workforge`, `shooter` (owned).

**Chosen: `workforge`** (`~/Developer/temp/workforge`) — a real, owned TypeScript CLI for git
worktree management (v1.2.2, published as `workforge`/`wf`). Owned → autonomous mutation is
authorized and fully reversible. Not `shooter` itself (autopilot-improves-its-own-host is
circular and reads as picking the easy thing).

**Why a real feature and not a toy:** the user rejected a toy `calc.js` demo and a derive-only
demo. This builds a feature a maintainer would actually merge.

## The feature (the autonomous agent's goal)

**Add a `--dry-run` flag to `workforge create`.**

This is a genuine consistency gap: `close`, `sync-env`, and `cleanup` all already support
`--dry-run` (verified in `src/index.ts` + `README.md`); `create` — the most destructive
command (it makes a branch, a worktree, copies env files, installs deps) — does not. Adding it
improves safety (preview before mutating) and is the kind of small, real, mergeable change a
human would make.

### Acceptance criteria (unambiguous, so verification is objective)

1. `wf create -t feat -n NAME --dry-run` prints a clear preview of what _would_ happen
   (branch name, worktree path, base branch, env files to copy, package-manager install) and
   makes **no** changes — no branch, no worktree, no install.
2. `--dry-run` is a documented yargs boolean (default `false`) on the `create` command, threaded
   into the create flow via the `WorkspaceConfig` type (`dryRun`).
3. `pnpm build` (tsc) passes; `pnpm lint` (eslint) passes.
4. Without `--dry-run`, behaviour is unchanged.

### Files expected to change

- `src/index.ts` — add the `--dry-run` option to the `create` command + thread into the config.
- `src/types/index.ts` — add `dryRun?: boolean` to `WorkspaceConfig`.
- `src/commands/create.ts` — guard the mutating steps; print the preview when `dryRun`.

---

## How autonomy actually works here (so we record/verify the right thing)

Two independent switches, both must be ON:

- **Engine** (server-side, `autopilot-engine.ts`): subscribes to the Shooter event stream; on a
  managed terminal going **idle**, runs 1 summary + 5 distinct-lens next-step agents → consensus
  → persists a `SessionSummaryRecord` (visible via `GET /api/summaries`).
- **Driver / autonomy** (client-side, `autopilot-driver.svelte.ts`, runs **in the browser**):
  watches `/ws/events`; on `agent-idle` with a high-confidence consensus, injects the next step
  into the agent's PTY over `/ws/terminal/:id` — the same transport a human types through. This
  is why the loop only runs while the dashboard is open in the browser (which is also what we record).

So **one autonomous cycle** = `agent-idle` → engine writes a new summary+consensus row →
driver logs an `injected` action → agent performs ≥1 tool action. Zero human keystrokes during
the loop; the driver supplies every nudge a human otherwise would.

### Goal-persistence fix (required before recording)

The engine builds its context from `session.events.slice(-12)` — there is **no stored goal**.
After a few cycles the original goal scrolls out of that window and consensus drifts toward
"what the agent just did." Fix (TDD'd, shipped in shooter before the run): the engine learns a
per-session **goal**, set via `POST /api/autopilot/goal`, and prepends `Goal: <goal>` to the
context every cycle — keeping consensus (and thus the injected prompts) anchored. This is also
the literal "set it as a goal" the user asked for.

---

## Safety posture (autonomy ON, on real code)

- Agent runs in an **isolated git worktree** of workforge on a throwaway branch
  (`autopilot/dry-run-demo`). Never `release`. **Never pushed.** Fully reversible (`worktree remove`).
- Claude launched with a **hard deny-list** that holds regardless of permission mode:
  `git push`, `git push --force`, `git reset --hard`, `git clean`, `rm -rf`/`rm -fr`, `sudo`.
- Autonomy ON via `bypassPermissions` so the agent can edit + build without per-tool human
  prompts (that is the whole point of autonomy) — bounded by the deny-list + disposable worktree.
- **Isolated Shooter server**: `SHOOTER_HOME=<tmp>` + `PORT=54013`, so it never shares the
  user's `:54006` daemon DB/state. The `:54006` daemon is left untouched (verified before + after).
- Kill switch in reach: the autonomy toggle + killing the terminal both stop the loop instantly.

> **Revised during execution (see RESULTS.md) — stronger, not weaker, than the plan above:**
> `bypassPermissions` was replaced with `dontAsk` after confirming via the Claude Code docs that
> `bypassPermissions` SKIPS the permission layer entirely — it does **not** honor `deny` rules.
> And the isolated worktree was replaced with a **local clone whose remote was removed**, so
> `git push` has nowhere to go regardless of any deny-rule evasion.

---

## EXPECTED orchestration trace (the contract)

| #   | What should happen                                                               | How we capture the ACTUAL                                                                 |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E1  | Managed `claude` terminal launches in the workforge worktree with the goal set   | `/api/terminals`, `/api/autopilot/goal` 200                                               |
| E2  | Engine produces a goal-anchored summary + consensus on each idle                 | rows in `GET /api/summaries` (one per cycle), each referencing the dry-run goal           |
| E3  | Driver autonomously injects the next step each cycle — **zero human keystrokes** | driver action log (`injected` entries); only input source on the PTY is the inject socket |
| E4  | ≥4 autonomous cycles drive the feature to completion                             | count of `injected` actions / summary rows                                                |
| E5  | The three expected files change, and only those                                  | `git -C <worktree> diff --stat`                                                           |
| E6  | `pnpm build` (tsc) exits 0                                                       | run after the loop; capture exit code + output                                            |
| E7  | `pnpm lint` (eslint) exits 0                                                     | run after the loop; capture exit code + output                                            |
| E8  | `wf create -t feat -n autopilot-demo --dry-run` previews and creates **nothing** | run it; `git worktree list` + `git branch --list` unchanged vs. before                    |
| E9  | The whole loop is on video, recorded in the browser                              | screen recording (CDP screencast → mp4)                                                   |

**Pass = E1–E9 all hold.** We report the real numbers either way, including: actual cycle
count, any stalls/retries/discarded takes, whether the goal-pin held, and a confirmation that
no human input entered the PTY during the loop window.

## Method notes

- **First recorded take is disposable.** Do a full pass first; only keep a take where the loop
  actually drove the feature to completion. A video that stalls mid-way is worse than none.
- The agent is told to work in **small increments and pause** after each — the intended
  phone-driven interaction model — so the _loop_ (not a human) supplies each "continue".
