# Moving real work into Shooter

Status: design · 2026-07-30

Shooter can already _see_ every coding session on the machine. It drives almost
none of them. This plan covers closing that gap deliberately, because the naive
version — "start everything in Shooter" — has two failure modes that only show
up once you look at which sessions actually exist.

## Where things stand

Three tiers of "in Shooter", measured against a real snapshot of 16 running
Claude Code sessions:

| Tier          | What it buys                                                           | Before this work |
| ------------- | ---------------------------------------------------------------------- | ---------------- |
| **Observe**   | every session visible, push notifications, transcripts, SoS, telemetry | ✅ 16 of 16      |
| **Drive**     | type and answer from the phone, survives server restarts               | ❌ 0 of 16       |
| **Originate** | new work is born in Shooter                                            | ❌ manual        |

Only the middle tier was ever the problem, and it was blocked on something
structural rather than missing features.

## What was blocking it

**A Shooter session used to be browser-only.** Shooter owns the PTY through its
holder process, and the only clients were the web UI and the phone. Moving work
in therefore meant giving up the local terminal and doing everything in a web
xterm — an unattractive trade that applied equally to starting new sessions and
to resuming existing ones, so it gated the entire idea.

`shooter attach` removes it. Shooter becomes the multiplexer; the shell and the
phone are both just clients:

```
        Shooter owns the PTY (survives server restarts)
                    ↑                    ↑
            shooter attach          phone / browser
             (your laptop)
```

## Constraints the design has to respect

These were verified against the running system, not assumed.

1. **Resume is not attach.** A running process's PTY belongs to its terminal
   emulator and cannot be adopted. Migrating a live session means quitting it
   locally and resuming from the transcript, which loses anything in flight — so
   it has to happen at a natural pause, never mid-tool-call.

2. **Only 3 of 8 agents can resume at all.** `claude`, `codex` and `opencode`
   have resume flags; `gemini`, `qwen`, `cursor-agent`, `copilot` and `amp` do
   not. Connecting to one of those used to silently start a _new_ session and
   orphan the transcript. That now refuses explicitly rather than lying.

3. **`cwd` is validated when a terminal is created and never again.** Nothing
   re-checks it on reconnect, so a terminal whose directory has been deleted
   keeps its `running` status and is restored on every server restart.

4. **Nothing caps running terminals.** Each one costs a detached holder process
   plus roughly 512 KB of cached scrollback and a 2000-entry replay ring on the
   server. Sixteen is a real footprint; forty would be a problem.

## The sessions are not one population

The 16 live sessions split three ways, and the split drives everything else:

| Class                   | Count | Examples                                                                           | Treatment                                                                    |
| ----------------------- | ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Durable repos**       | 8     | shooter, dopamine, director, clairvoyance, curator, neurolink, lighthouse, harbour | Move in. Stable `cwd`, long-lived, worth driving from the phone.             |
| **Ephemeral worktrees** | 7     | `lighthouse-fork/{feat,fix}/*`, `harbour/fix/*`, `neurolink-fork/marketing`        | Originate in, but only once terminal lifetime is bound to worktree lifetime. |
| **Scratch**             | 1     | the `~` session                                                                    | Leave local. Nothing worth driving remotely.                                 |

Constraint 3 is harmless for durable repos and dangerous for ephemeral ones:
`workforge close` removes a worktree directory, and any Shooter terminal living
there becomes a process running in nothing — persisted, and faithfully restored
on the next restart.

## Guardrails

Build these before the ephemeral half moves.

- **G1 — validate `cwd` on reconnect.** If the directory is gone, mark the
  terminal `orphaned` instead of restoring it as `running`. Failing honestly
  beats a terminal that looks alive and cannot run a command.
- **G2 — bound the terminal count.** A cap or a warning, so the footprint stays
  deliberate rather than accumulating.
- **G3 — bind worktree lifetime to terminal lifetime.** Closing a worktree
  should stop its terminal first, whether that is enforced in `workforge` or
  detected by Shooter.

## Sequence

1. `shooter attach` — done.
2. **G1 + G2** — cheap, and the backfill depends on them.
3. **Backfill the 8 durable repos**, one at a time at natural pauses. These have
   no worktree hazard, so they exercise the flow at low risk.
4. **G3** — lifecycle binding.
5. **Originate** (`shooter run <agent>`), and only then move the ephemeral 7.

Ordering by risk rather than by convenience is the point: the durable half
proves the workflow before the half that can strand processes goes anywhere.

## Migrating one session

1. Reach a natural pause — no tool call in flight.
2. Quit the session in the local terminal.
3. Connect it in Shooter (project page → Connect), which resumes it in a
   Shooter-owned PTY.
4. `shooter attach <id>` to carry on in the shell, or drive it from the phone.

Detaching with `Ctrl-]` leaves the session running; it can be reattached from
the shell, the phone, or both at once.

## Deliberately not doing

- **No shell alias shadowing `claude`.** It would catch everything with no habit
  change, but shadowing a real binary surprises scripts, CI and non-interactive
  shells. `shooter run` stays explicit and opt-in.
- **Not migrating all 16 at once.** Constraint 1 makes every migration slightly
  disruptive and constraint 4 makes the aggregate cost real.
- **Not moving the scratch session.** Remote-driving a `~` shell buys nothing.
