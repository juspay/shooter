# Phase 2 — Reconnect Resume & Backpressure Convergence

**Phase:** 2 of 7 (completes the spine: P0 → P1 → **P2**)
**Foundation contract:** `docs/superpowers/specs/terminal-sync/00-foundation-architecture.md` §1 (wire protocol), §2.2 (the ring), §3 flow C (reconnect)
**Research anchor:** §3 gaps in `docs/superpowers/research/2026-06-13-terminal-sync-research.md`
**Gaps addressed:** **G1** (silent backpressure divergence) and **G7** (no reconnect resume) — and fixes a latent **post-restart desync** bug found while building.
**Design decisions in scope:** D4 (snapshot with bounded ring + raw fallback). No control/presence (D1/D2/D3) yet.
**Backward compatible.** Legacy/iOS clients (no `?caps=snapshot`, never send `?lastSeq`) take the unchanged scrollback path.

---

## 1. What and Why

After Phase 0 (`seq` on every `output` frame + a bounded `{seq,data}` replay ring) and Phase 1
(server-side `@xterm/headless` emulator + `{snapshot}` on join), the spine had two remaining
holes:

- **G7 — reconnect is a full reset.** A client that briefly dropped its socket re-attached as a
  brand-new client and got a full snapshot (a screen flash), even though it was only a few frames
  behind. There was no "I have up to seq N, give me N+1…".
- **G1 — a slow client silently desyncs forever.** `broadcastOutput` dropped bytes for a client
  whose socket/buffer overflowed and only sent an `output-dropped` notice. The client's screen was
  then permanently wrong with no path back to truth.

Phase 2 closes both using the Phase 0 primitives:

1. **Reconnect resume.** The client reconnects with `?lastSeq=N`. The server replays exactly the
   ring frames with `seq > N` as ordinary `{output}` frames, then goes live — a seamless catch-up
   with no flash. If the gap is no longer in the ring (aged out, or the counter reset on a server
   restart) it falls back to a `{snapshot}` (flow B).
2. **Backpressure convergence.** Instead of dropping bytes, a slow client is _converged_: it is
   marked, its queue is discarded, and once its socket drains it receives a fresh `{snapshot}` of
   the current screen. A throttled client can lag but can never diverge permanently.

**Invariant after Phase 2:** a client that reconnects or falls behind always re-reaches the
authoritative current screen — via gap-replay when cheap, via snapshot when necessary — and never
silently shows stale or torn content.

---

## 2. Files Touched

| File                                               | Role                      | Touch                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/modules/server/ws/server.ts`              | WS upgrade routing        | Parse `?lastSeq=N` (finite, >0, floored), pass to handler                                                                                                                                 |
| `src/lib/modules/server/ws/terminal-handler.ts`    | Terminal channel handler  | Thread `lastSeq` into `attach({lastSeq, snapshot})`                                                                                                                                       |
| `src/lib/modules/server/terminal/pty-manager.ts`   | Broadcast + attach + ring | Reconnect-resume branch in `attach`; harden `getSeqRingFrom`; `beginResnapshot` + convergence in `broadcastOutput`; `broadcastOutputLegacy` for fallback; seed emulator in `reconnectOne` |
| `src/lib/modules/client/terminal/xterm-wrapper.ts` | Client WS handler         | `&lastSeq` on reconnect; backoff **jitter**; dedup `seq<=lastSeq`; `resyncing…` cosmetic                                                                                                  |
| `server.ts`                                        | Root adapter              | Widen `ptyManagerAdapter.attach` opts                                                                                                                                                     |
| `src/lib/types/ws.ts`                              | Hand-written WS types     | `TerminalPtyManagerLike.attach` opts → `{lastSeq?, snapshot?}`                                                                                                                            |
| `tests/seq-ring.test.cjs`                          | Unit tests                | Mirror hardened `getSeqRingFrom`; +4 Phase 2 edge cases                                                                                                                                   |

---

## 3. Mechanics

### 3.1 Reconnect resume (`attach`, flow C)

```
attach(id, ws, {snapshot, lastSeq}):
  if snapshot && lastSeq > 0:
    gap = getSeqRingFrom(id, lastSeq)
    if gap !== null:                    # resolvable from the ring
      for e of gap: send {output, seq:e.seq, data:e.data}
      clients.add(ws); return          # ← fully synchronous: no live frame interleaves
  # else fall through to fresh snapshot (snapshot mode) or scrollback (legacy/fallback)
```

The replay branch is **synchronous end-to-end** — `getSeqRingFrom` → send loop → `clients.add` —
so no `onOutput` macrotask (socket-data driven) can slip a frame in between computing the gap and
registering the client. No missed frames, no duplicates.

### 3.2 `getSeqRingFrom` hardening (fixes post-restart desync)

`getSeqRingFrom(id, afterSeq)` returns the frames after `afterSeq`, `[]` if caught up, or `null`
when the gap is unresolvable (caller must snapshot). Phase 2 adds the guard:

```
if afterSeq > seqCounter: return null   # counter reset on restart, or client ahead of us
```

Without it, a client holding `lastSeq=500` from before a server restart (which resets the
per-terminal `seqCounter` to 0) would be told "you're caught up" and would then **drop every new
frame** via its `seq<=lastSeq` dedup — a permanent black-hole. Now it correctly snapshots and
resets `lastSeq`.

### 3.3 Backpressure convergence (`beginResnapshot`)

On socket- or buffer-overflow for a client (emulator mode), `broadcastOutput` calls
`beginResnapshot` instead of dropping bytes:

1. Add `ws` to `resnapshotPending` (a `WeakSet`); `broadcastOutput` then **skips** it (no more
   buffering → the socket can only drain).
2. Discard its stale queue; send `{output-dropped, bytes:0}` so the client shows "resyncing…".
3. A 100 ms **timer poll** waits until `bufferedAmount ≤ RESNAPSHOT_LOW_WATER_BYTES` (256 KB) or a
   10 s timeout, then calls `snapshotAndSend` and clears pending in `.finally`.

Because it is timer-driven (not broadcast-driven) it converges even if output stops. The poll
self-terminates on client/terminal teardown (`readyState`, `clients.has`, emulator checks), so no
leak. The legacy drop-oldest path is retained as `broadcastOutputLegacy`, used only when the
emulator is disabled (`SHOOTER_SNAPSHOT_FALLBACK=raw`).

### 3.4 Emulator seed on `reconnectOne`

After a server restart the per-terminal emulator is freshly constructed (blank). `reconnectOne`
now feeds it the holder's retained scrollback (`emulator.write(connectResult.scrollback)`) so the
first post-restart snapshot reflects the real screen, not an empty buffer. The seed bypasses the
seq ring (historical bytes, not new `seq`s), so resume after restart correctly snapshots.

### 3.5 Client (`xterm-wrapper.ts`)

- `lastSeq` is **closure-scoped** (survives reconnects); the reconnect URL gains `&lastSeq=N` when
  `N>0`.
- `scheduleReconnect()` adds full **jitter** (`delay + rand·0.5·delay`) on top of the exponential
  backoff so a fleet doesn't reconnect in lockstep after a restart.
- Output frames with `seq <= lastSeq` are **dropped** (contract §1.1: the snapshot/replay seq is
  the high-water mark) — a defensive backstop against any join-race duplicate.
- `output-dropped` renders a transient `resyncing…` notice; the following snapshot resets the
  screen and clears it.

---

## 4. Validation

| Layer                                         | Result                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` / `pnpm lint` / `pnpm build`     | clean                                                                                                                                              |
| `tests/seq-ring.test.cjs`                     | 13 pass (incl. restart-reset, trimmed-ring boundary, empty-ring)                                                                                   |
| **e2e — reconnect resume** (9 checks)         | in-ring `lastSeq` replays only the gap (no snapshot/scrollback); unresolvable `lastSeq` → snapshot of current screen; fresh client still snapshots |
| **e2e — backpressure convergence** (5 checks) | paused-socket client overflows → `output-dropped` → converges via snapshot on drain → resumes live updates                                         |

Cross-cutting scenarios proven: **G7** (offline client replays only the gap) and **G1** (throttled
client resnapshots to current rather than staying stale).

---

## 5. What Phase 2 deliberately does NOT do

- No control/driver token or write-arbitration (P4), no presence (P5), no resize arbitration (P3).
- No snapshot-to-disk persistence across a full machine reboot (P6) — only in-process restart
  resilience via the emulator seed.
- Resume is gated on `?caps=snapshot`; the raw-scrollback fallback (legacy clients, or
  `SHOOTER_SNAPSHOT_FALLBACK=raw`) is unchanged.
