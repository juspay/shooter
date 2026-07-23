# AskUserQuestion permission dedup — design

- **Date:** 2026-07-23
- **Status:** Implemented.
- **Branch:** `fix/dedup-askquestion-permission` (off `release` @ v1.33.0)

## Problem (from the live telemetry)

The v1.33.0 notification telemetry (142 events / 4.5h) proved the remaining volume
is **decision-tier**, and that **each AskUserQuestion moment triple-fires** — a
perfect 1:1:1 ratio across all 13 active projects (36 questions : 36 with-session
permissions : 36 blank-session permissions). Two of the three are redundant:

| #   | Push                                                              | Source                                                            | Verdict       |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| 1   | `question` (rich, with answer buttons)                            | `handleAskUserQuestion` (PreToolUse)                              | keep          |
| 2   | `permission` "Permission needed", `toolName=AskUserQuestion`, +0s | `handlePermission` (PermissionRequest)                            | **duplicate** |
| 3   | `permission` (no toolName), +6s                                   | `handlePermissionNotification` (`permission_prompt` Notification) | **duplicate** |

Why no genuine tool-permission noise: the environment runs `defaultMode: "dontAsk"`

- `skipAutoPermissionPrompt: true`, so Bash/Edit/etc. are auto-approved and silent.
  The only thing firing permissions is AskUserQuestion.

Root cause of #3 leaking: `handlePermissionNotification` sends its push with
`category: 'permission'`, so the tier gate's `permission_notification → drop` rule
never fired — the +6s "a dialog is open" heads-up went out as a full decision push.

## Fix (notifier-only, both safe)

**Part A — drop the heads-up (#3).** `handlePermissionNotification` now sends
`category: 'permission_notification'`, which the existing server tier gate drops
(and records as `dropped`). It is fire-and-forget (no poll), so nothing else
changes.

**Part B — suppress the AskUserQuestion self-permission (#2).** A new pure guard
`isAskUserQuestionTool(d)` makes `handlePermission` return early for
AskUserQuestion — outputting nothing, which defers to Claude Code's native
question UI (identical to the existing no-response fallthrough at line 1029).

### Why Part B is safe (no hang, no lost answer)

- `handleAskUserQuestion` is explicitly **info-only** — the answer is chosen at the
  laptop; the phone cannot route an AskUserQuestion answer back (PTY routing is a
  documented follow-up). So push #2 never carried the answer.
- `handlePermission` already falls through to Claude Code's native dialog when no
  response arrives. Returning early for AskUserQuestion just reaches that state
  immediately — Claude Code shows the question UI and waits for the user natively.
- The guard is scoped to AskUserQuestion only. **Real tool permissions (Bash/Edit)
  and plan-mode approvals (ExitPlanMode) still push + poll unchanged.**

## Impact

Each "Claude needs you" moment: **3 pushes → 1** (the question). Projected on the
telemetry sample: decision pushes **108 → 36 (−67%)**, zero lost signal.

## Verification

- **Unit** (`tests/permission-dedup.test.cjs`): `isAskUserQuestionTool` true for
  tool/toolName=AskUserQuestion, false for Bash / ExitPlanMode / empty / undefined.
  Existing notifier tests (idle-gate, plan-mode-routing, dynamic-options) still pass.
- **Live e2e** (isolated temp server): fired all 3 real hook events for one
  AskUserQuestion interaction → telemetry showed `question:1`,
  `permission_notification:1 (dropped)`, and **no `permission`**; event #2 exited
  immediately (no 120s poll → no hang).

## Deployment note

The live global hook uses `~/.shooter/notifier.cjs`, a symlink to the **dev repo's**
`.claude/hooks/notifier.cjs`. After merge, deploy by pulling `release` in the dev
repo main worktree (`shooter update` only refreshes `~/.shooter/repo`, which the
symlink does not point at).
