# LaunchAgent restart resilience — design

**Date:** 2026-06-27
**Status:** Approved
**Area:** `bin/shooter.cjs` (service lifecycle), `docs`

## Problem

Shooter ran as a macOS LaunchAgent (`com.juspay.shooter`) but silently died at
02:30 and never came back, producing ~17h of zero push notifications. Root cause,
traced through the code:

1. The LaunchAgent's `ExecStart` runs `shooter.cjs start` in the **foreground**.
   That parent process spawns the real server (`server.ts`) as a child and
   forwards termination signals to it (`bin/shooter.cjs` signal forwarding).
2. On any SIGTERM to the job, the parent forwards it; the server runs its
   graceful shutdown and calls `process.exit(0)` (`server.ts`).
3. The parent then propagates the child's clean exit: `process.exit(0)`.
4. The plist used `KeepAlive = { SuccessfulExit: false }`, i.e. _restart only on
   a non-zero (crash) exit_. A clean exit-0 is therefore **deliberately not
   restarted**. With no reboot (RunAtLoad never re-fires), the daemon stays dead
   until the next login.

So **any clean SIGTERM permanently kills the daemon.** The specific 02:30 trigger
was external (a manual stop, a `launchctl` kill, or a system event) and could not
be attributed, but the failure mechanism above is independent of the trigger.

**Ruled out:** the auto-updater. `~/.shooter/update-state.json` is frozen at
2026-05-29 because the running instance is the npm-global install (no `.git`),
so the guard's `release`-branch check no-ops every cycle. It never touched the
server.

## Goal

A clean SIGTERM (accidental kill, system event, crash) must **recover
automatically**, while a deliberate `shooter stop` must **stay stopped**.

## Approach — service-manager-owned lifecycle (idiomatic)

Let launchd/systemd own restart decisions instead of encoding intent in the
process exit code.

- `KeepAlive = true` → launchd restarts on **any** exit (crash, kill, accidental
  SIGTERM all recover).
- A deliberate stop is expressed by **removing the job from the manager**
  (`launchctl bootout` / `systemctl stop`), not by exit code. The plist file
  remains on disk, so the service returns on next login or `shooter start`.

### The recursion guard

The plist's `ExecStart` is `shooter start`. A manual `shooter start` will delegate
to launchd; the launchd-spawned `shooter start` must **not** delegate again. The
plist tags its own instance with env `SHOOTER_MANAGED=1`. Only an **unmarked**
(real CLI) invocation delegates; the marked instance runs the server directly.

## Changes (all in `bin/shooter.cjs` + tests)

1. **`enableLaunchAgent`** — `KeepAlive` dict → `<true/>`; add `SHOOTER_MANAGED=1`
   to `EnvironmentVariables`.
2. **`startServer`** — early branch:
   - unmarked **and** a manager owns the service → delegate
     (`launchctl bootstrap` if not loaded, else `kickstart -k`; or
     `systemctl --user start`) and exit.
   - otherwise (marked launchd instance, or no agent = dev) → run the server
     directly (unchanged path).
3. **`stopServer`** — if a manager owns the service:
   - macOS: `launchctl bootout gui/$uid/com.juspay.shooter`.
   - Linux: `systemctl --user stop shooter.service`.
   - still run `stopTunnel()` + `stopGuard()` (both are detached, outside the
     job's process tree).
   - no agent (dev) → unchanged PID-kill path.
4. **`enableSystemdUnit`** — `Restart=on-failure` → `Restart=always`; add
   `Environment="SHOOTER_MANAGED=1"`. Add `isSystemdManaging()` mirroring
   `isLaunchdManaging()`.

### Testability

Extract two **pure deciders** and unit-test them (no launchctl side effects):

- `resolveStartAction({ managed, agentInstalled, platform })`
  → `'run-server' | 'delegate-launchd' | 'delegate-systemd'`
- `resolveStopAction({ agentManaging, platform })`
  → `'bootout' | 'systemctl-stop' | 'pid-kill'`

Plus a generation test asserting the plist contains `<key>KeepAlive</key>` →
`<true/>` and `SHOOTER_MANAGED`. Matches the existing `tests/` (vitest) setup.

## Out of scope (YAGNI)

Auto-updater, guard, APNs transport, tunnel — none are the bug.

## Deployment

Lands in repo → publishes `@juspay/shooter`. Live on a machine only after
republish → `npm i -g @juspay/shooter@latest` → **`shooter autostart on`**
(regenerates the plist with the new `KeepAlive` + marker). The auto-updater will
not carry it (no-ops on npm-global installs). An immediate stopgap — regenerating
the currently-installed plist — is tracked separately from this change.

## Risks

- `launchctl bootout` is session-scoped: after `shooter stop`, the service
  returns on next login (plist remains). This matches existing "stop until start"
  semantics.
- Transition: until a machine re-runs `shooter autostart on`, its old plist lacks
  the marker. The delegation branch only triggers for _manual_ `shooter start`
  with an agent loaded; the old launchd instance has no marker, so to avoid a
  delegate-recursion during the transition the start path also treats a missing
  `server.ts`-child / re-entrancy as run-direct. Re-running `autostart on` (part
  of the upgrade) installs the marker and resolves it cleanly.
