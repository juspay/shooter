# Foundation Architecture & Shared Contract — Live Multi-Client Terminal Sync

**Status:** Contract (authored to unblock Phases 1–7 after the workflow's foundation agent was lost to an infra stream-termination). Consistent with the already-written `phase-0-sequencing.md` and `ROADMAP.md`.
**Research anchor:** `docs/superpowers/research/2026-06-13-terminal-sync-research.md` (§2 current state, §3 gaps G1–G10, §5 target architecture).
**Empirical anchor:** the keystone spike (below) — `@xterm/headless` + `@xterm/addon-serialize` validated on Node v24.14.1.

This document is the **single shared contract** every phase plan binds to. Phases reference the symbols, message shapes, and flows defined here rather than each other's plans, so they can be authored and (where safe) built in parallel.

---

## 0. Keystone spike result (decisions baked from empirical findings)

| Fact                                                 | Value / consequence                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned versions                                      | **`@xterm/headless@6.0.0`**, **`@xterm/addon-serialize@0.14.0`** — pin exactly (SerializeAddon reaches into `_core`; minor bumps can break)                             |
| Module system                                        | Both ship CJS mains → plain `require()` works; no ESM interop shim needed                                                                                               |
| Alt-screen capture (`?1049h`)                        | **PASS** — alt buffer + content + SGR fully reproduced ⇒ G2 (TUI late-join) is solvable                                                                                 |
| Modes `?2004h` (bracketed paste), `?1h` (app cursor) | **PASS** — serialized at snapshot tail                                                                                                                                  |
| Mode `?25l` (hide cursor)                            | **NOT captured** — `serialize()` omits cursor-visibility. Phase 1 must re-emit it manually from the emulator's cursor-hidden state, or accept a cursor-visible artifact |
| Cursor position                                      | functional but **not byte-exact** — restore lands correctly; do not assert byte-equality in tests                                                                       |
| Combined/composed chars                              | not serialized (upstream TODO) — accept for now (D4)                                                                                                                    |
| API rule                                             | **call `serialize()` inside a `term.write('', cb)` callback** (or after awaiting a write) so all PTY bytes are parsed before capture                                    |

**Verdict:** the server-side-emulator + snapshot approach is viable as the primary mechanism, with a `SHOOTER_SNAPSHOT_FALLBACK=raw` escape hatch and two minor caveats to code around (hide-cursor re-emit, no byte-exact cursor assertions).

---

## 1. Wire protocol — the complete additive contract

All additions are **backward-compatible**: existing fields are unchanged; new frames/fields are additive; old clients that ignore unknown frames keep working via capability negotiation (§1.3). Types live in `specs/types/ws-protocol.yaml` (generated) + the hand-written `Wire*` unions in `src/lib/types/ws.ts`. Edit YAML → `pnpm gen:types`.

### 1.1 Server → client, terminal channel (`/ws/terminal/:id`)

| Frame            | Shape                                                                                   | Introduced | Notes                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output`         | `{type:'output', seq:number, data:string}`                                              | **P0**     | `seq` monotonic per terminal, from `appendSeqRing`                                                                                                                                                                     |
| `snapshot`       | `{type:'snapshot', seq:number, cols:number, rows:number, data:string}`                  | **P1**     | `data` = `serialize()` payload; `seq` = `seqCounter` at capture; client `reset()`+`write(data)`, sets `lastSeq=seq`, then applies live `output` with `seq>lastSeq`. Replaces `scrollback` for snapshot-capable clients |
| `output-dropped` | `{type:'output-dropped', bytes:number}`                                                 | existing   | **P2:** client reacts by `term.reset()` and awaiting a fresh `snapshot` (no silent holes)                                                                                                                              |
| `resize`         | `{type:'resize', cols:number, rows:number}`                                             | existing   | **P3:** driver-authoritative; pushed level-triggered on attach                                                                                                                                                         |
| `scrollback`     | `{type:'scrollback', chunk, total, data}`                                               | existing   | **fallback only** (non-snapshot-capable clients / `SHOOTER_SNAPSHOT_FALLBACK=raw`)                                                                                                                                     |
| `exit` / `error` | existing                                                                                | unchanged  |                                                                                                                                                                                                                        |
| `control-state`  | `{type:'control-state', driver:string\|null, youAreDriver:boolean, canRequest:boolean}` | **P4**     | terminal-channel (it gates this client's input UI)                                                                                                                                                                     |

### 1.2 Client → server, terminal channel

| Frame / param                         | Shape                                                   | Introduced | Notes                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `input` / `signal`                    | existing                                                | unchanged  | **P4:** `input` additionally gated on holding the driver token                                                                  |
| `resize`                              | `{type:'resize', cols, rows}`                           | existing   | **P3:** only the **driver's** resize calls `pty.resize()`; non-driver resize is ignored for the PTY (client fits its own xterm) |
| `?lastSeq=N` (URL)                    | connect-time query param on the WS URL                  | **P2**     | server decides replay-vs-snapshot at attach. Absent / `0` ⇒ fresh join ⇒ snapshot                                               |
| `?caps=snapshot` (URL)                | capability advertisement                                | **P1**     | client states it understands `snapshot`; without it server uses legacy `scrollback`                                             |
| `control-request` / `control-release` | `{type:'control-request'}` / `{type:'control-release'}` | **P4**     | request/yield the driver token                                                                                                  |

### 1.3 Backward-compatibility & feature flags

- **Capability negotiation:** the new `xterm-wrapper` always connects with `?caps=snapshot`. Clients without it (old web, iOS Swift) get the legacy `scrollback` replay path unchanged. So `snapshot` never breaks an old client.
- **`seq` is additive:** old clients ignore the field; iOS must accept-and-ignore it. The `seq:number` requirement in `WireTerminalServerMessage` (P0) makes the type system enforce that no phase drops the field.
- **Server flag `SHOOTER_SNAPSHOT_FALLBACK=raw`:** disables the emulator/snapshot path entirely (revert to raw-ring replay) without code changes — the P1 kill-switch for the experimental SerializeAddon.

### 1.4 Events channel (`/ws/events`) — presence plane (P5)

Presence is carried **separately from PTY bytes** (Cloudflare two-channel pattern): `presence-list` (who's connected to a terminal), `presence-join`/`presence-leave`, `typing`/`activity`, and a mirror of `control-state` for display. Live per-participant **cursors/avatars are deferred** (post-P5). Shapes defined in the Phase 5 plan.

---

## 2. Server-side model

### 2.1 The authoritative emulator

- New module **`src/lib/modules/server/terminal/terminal-emulator.ts`**: a thin wrapper owning one `@xterm/headless` `Terminal` + a `SerializeAddon`, exposing `write(data)`, `resize(cols,rows)`, `snapshot(): Promise<{data,cols,rows}>` (serialize inside a `write('',cb)` callback, with the hide-cursor re-emit fix), and `dispose()`.
- **One emulator per `PtyManagedTerminal`**, created in `pty-manager.create()` and `reconnectOne()` when snapshot mode is enabled; `dispose()` on terminal exit/evict. (~5–15 MB each — acceptable for a personal tool; `SHOOTER_EMULATOR_MAX` guard optional.)
- **Fed in the output path:** at the existing `broadcastOutput` call site (`pty-manager.ts` ~1085, inside `wireHolderCallbacks` `onOutput`), every chunk goes to: `appendSeqRing` (P0) → `emulator.write(data)` (P1) → `broadcastOutput` (P0/P2). `appendScrollback`/`terminal.scrollback` is kept only for the fallback path.

### 2.2 The sequence ring (from P0, already specified)

`PtyManagedTerminal.seqCounter:number` + `seqRing:SeqRingEntry[]` (cap `SEQ_RING_MAX_ENTRIES=2000`); helpers `appendSeqRing()`, `getSeqRing(id)`, `getSeqRingFrom(id, afterSeq)` (returns entries with `seq>afterSeq`, or `null` when the gap predates the ring ⇒ caller must snapshot).

### 2.3 Driver / control token (P4) and driver-authoritative resize (P1/D1+D2)

- Per-terminal **`driver`**: the connection id currently allowed to write (or `null`). View-only never eligible. Owner can **claim/preempt** instantly; control-clients `control-request` → granted by driver/owner; `control-release` yields.
- Each WS connection gets a **`connectionId`** (random, assigned in `setupWebSocketHandlers`). A **control registry** (sibling to `guest-registry.ts`) maps `terminalId → {driver, members}`. On driver disconnect (`ws.on('close')`) the token reverts to the owner (or `null`).
- **`pty.write()` gating:** in `terminal-handler.ts` the `input` case requires `!scope.readOnly` **and** `connectionId === driver` (owner is implicitly always eligible to claim). This is _in addition to_ the existing readOnly drop.
- **Resize (D1):** only the driver's `resize` reaches `pty.resize()`; everyone else fits their own xterm. The driver's viewport size is the PTY size. On driver change, the new driver's size applies and is pushed (level-triggered) to all.

---

## 3. The three core flows (pseudocode against real functions)

```
(A) LIVE BROADCAST  — onOutput(terminal, data):           [P0 seq, P1 emulator, P2 backpressure]
      seq = this.appendSeqRing(terminal, data)            // P0
      terminal.emulator?.write(data)                      // P1 (snapshot mode)
      if (fallbackMode) this.appendScrollback(terminal, data)
      this.broadcastOutput(terminal, data, seq)           // sends {output, seq, data}; P2 drop→resnapshot

(B) NEW CLIENT JOIN — attach(id, ws, {caps, lastSeq=0}):  [P1]
      if (snapshotMode && caps.snapshot):
        snap = await terminal.emulator.snapshot()         // serialize() inside write() cb
        send(ws, {type:'snapshot', seq: terminal.seqCounter, cols: snap.cols, rows: snap.rows, data: snap.data})
        // client: term.reset(); term.write(data); lastSeq = seq; then live output (seq>lastSeq) flows
      else:
        this.sendScrollback(terminal, ws)                 // legacy fallback unchanged

(C) RECONNECT      — attach with ?lastSeq=N:              [P2]
      gap = this.getSeqRingFrom(id, N)                    // P0 helper
      if (gap !== null):  for (e of gap) send(ws, {type:'output', seq:e.seq, data:e.data})  // seamless catch-up
      else:               // gap predates ring → fresh snapshot (flow B)
                          sendSnapshot(ws)
      // BACKPRESSURE (P2): on overflow, instead of dropping bytes silently → mark client,
      //   send {output-dropped}; on drain → sendSnapshot(ws); client reset()s on output-dropped.
```

---

## 4. Phase dependency ordering & shared-symbol ownership

```
P0 ─▶ P1 ─▶ P2 ─▶ ┬─ P3 ─▶ P4 ─▶ P7      (P3/P4/P7 share terminal-handler.ts resize/input block — serialize merges)
                  ├─ P5                   (events-handler.ts; P4 also touches it — order P4 before/with P5)
                  └─ P6                   (snapshot persistence depends on P1)
```

| Symbol / artifact                                                                                                           | Owner phase | Consumers                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------- |
| `seq` on `output`; `SeqRingEntry`; `seqCounter`/`seqRing`; `appendSeqRing`/`getSeqRing`/`getSeqRingFrom`; `getLastSeq()`    | **P0**      | P1 (snapshot seq header), P2 (gap replay)       |
| `terminal-emulator.ts`; `emulator` field; `snapshot` frame; `sendSnapshot()`; `?caps=snapshot`; `SHOOTER_SNAPSHOT_FALLBACK` | **P1**      | P2 (resnapshot fallback), P6 (persist snapshot) |
| `?lastSeq=N` reconnect; drop→resnapshot; backoff jitter                                                                     | **P2**      | —                                               |
| driver-authoritative resize; persist cols/rows; level-triggered size-on-attach                                              | **P3**      | P4 (driver size)                                |
| `connectionId`; control registry; driver token; `control-request/release/state`; write-gating                               | **P4**      | P5 (display), P7                                |
| presence frames on `/ws/events`                                                                                             | **P5**      | —                                               |
| snapshot-to-disk; holder re-fork                                                                                            | **P6**      | —                                               |
| resize rate-limit/max; in-band WS re-auth                                                                                   | **P7**      | —                                               |

**Critical coordination rule (from P0):** any phase editing `broadcastOutput` MUST preserve the `appendSeqRing` call and the `seq` field; the `seq:number` type requirement makes `pnpm check` catch regressions.

---

## 5. Conflict map (drives the parallel-build waves — see ROADMAP)

High-churn files: `pty-manager.ts` (P0,P1,P2,P3,P6), `terminal-handler.ts` (P3,P4,P7 — same resize/input block 🔥), `xterm-wrapper.ts` (P0–P5), `ws-protocol.yaml` + `ws.ts` (P0,P1,P2,P4,P5,P7), `terminal-store.ts` (P3,P6), `events-handler.ts` (P4,P5 🔥).

- **Hard-sequential:** P0→P1→P2 (all edit `broadcastOutput`).
- **Safely parallel after the spine:** P3 ∥ P5 ∥ P6 (no shared files).
- **Serialize:** P3→P4→P7 (share `terminal-handler.ts`); P4 with P5 (share `events-handler.ts`).

---

## 6. Cross-cutting validation (the proof sync works)

A single end-to-end scenario, run with two browsers + a view-only guest:

1. **G2:** start an alt-screen TUI (vim / htop / an agent TUI); a 2nd browser + a view-only guest join **mid-TUI** → both must render the _current screen_, not escape-garbage.
2. **G3:** `yes | head -10000` while a client joins → no duplicated lines, no `^[` artifacts.
3. **G1:** throttle one client to 10 KB/s, then restore → it resnapshots to current within seconds (not permanently stale).
4. **G7:** take a client offline 3 s → on reconnect only the gap replays (few frames), or a clean snapshot if the gap is large.
5. **P4/G6:** guest requests control, owner grants, guest types, owner reclaims (preempt) → no interleaved characters.
6. **P3/G8:** owner at 200×50, guest joins → guest renders 200×50 on the first frame.
