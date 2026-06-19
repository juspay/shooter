# Live Multi-Client Terminal Sync — Master Execution Roadmap

**Branch:** `feat/terminal-sync-spine`  
**Research source:** `docs/superpowers/research/2026-06-13-terminal-sync-research.md`  
**Phase specs:** `phase-{0,2,3,7}-*.md` written; `phase-{1,4,5,6}-*.md` pending (P1 is captured by the foundation contract `00-foundation-architecture.md`).  
**Status:** **Spine — phases 0 → 1 → 2 — implemented, validated, and shipped (PR #90).** Wave 2 (P3 ∥ P5 ∥ P6) in progress.  
**Date authored:** 2026-06-14

---

## 1. Dependency DAG

```
Phase 0 (sequencing)
    │
    ▼
Phase 1 (server-side emulator + snapshot-on-join)
    │
    ▼
Phase 2 (reconnect resume + backpressure convergence)
    │         │           │          │          │
    ▼         ▼           ▼          ▼          ▼
Phase 3    Phase 4    Phase 5    Phase 6    Phase 7
(resize)  (control)  (presence) (restart)  (security)
```

### Edge rationale

| Edge      | Why it must hold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 → 1** | Phase 1's `sendSnapshot()` must stamp the snapshot's `endSeq` header from `terminal.seqCounter` (defined in Phase 0). Without `seq` on every output frame, the client cannot safely attach the live tail to the snapshot without a duplication race (G3). The headless emulator in Phase 1 also feeds on the same `broadcastOutput` call-site where Phase 0 inserts `appendSeqRing()`; Phase 1 must preserve that call or the ring diverges from the emulator.                                                                   |
| **1 → 2** | Phase 2's reconnect-resume path either (a) replays `getSeqRingFrom(id, lastSeq)` or (b) falls back to `sendSnapshot()`. Both methods are defined in Phase 1. Without the snapshot fallback, a gap too large for the ring results in a corrupted raw-ring replay — the exact G2 bug.                                                                                                                                                                                                                                              |
| **2 → 3** | Soft dependency only: Phase 3's level-triggered size push on attach is cleanly additive to Phase 2's `sendSnapshot()` path. However, if Phase 3 lands before Phase 2, the initial resize sent on attach might arrive before the snapshot acknowledgement, causing a client-side resize of the wrong buffer. Ordering avoids this race. Teams that need Phase 3 first may flip this edge with an explicit `cols/rows` field added to the snapshot payload.                                                                        |
| **2 → 4** | The driver token (Phase 4) gates `pty.write()` at `terminal-handler.ts:84`. The correctness argument for single-active-writer requires the emulator state to be trustworthy — Phase 2 ensures no client diverges from it. A driver handoff to a diverged client would produce incorrect input. In practice Phase 4 can be implemented before Phase 2 if the team accepts that edge case.                                                                                                                                         |
| **2 → 5** | Presence (Phase 5) broadcasts the driver identity and connected-client list over `/ws/events`. The driver identity comes from Phase 4; Phase 4 depends on Phase 2. Presence is otherwise independent of the broadcast path.                                                                                                                                                                                                                                                                                                      |
| **2 → 6** | Phase 6 persists a serialized snapshot to disk periodically for restart resilience. It reads the snapshot from the Phase 1 headless emulator (via `serialize()`). Phase 2's resnapshot path is the recovery mechanism Phase 6 tests against.                                                                                                                                                                                                                                                                                     |
| **2 → 7** | Phase 7 adds resize rate-limiting (`resize-limiter.ts`) at `terminal-handler.ts:87-97` and in-band re-auth (`reauth.ts`) wired at `terminal-handler.ts:55` and `119`. Phase 7's `validateDimensions()` replaces the existing inline guard at `terminal-handler.ts:169`. Phase 3 and 4 both edit the same `case 'resize'` block; Phase 7 must land after Phase 3 to add `allowResize()` inside Phase 3's driver-check block, not around it. The Phase 7 spec says explicitly: coordinate merge order Phase 3 → Phase 4 → Phase 7. |

### SPINE: phases 0 → 1 → 2 are a hard sequential chain

These three phases all edit the hot path `ptyManager.broadcastOutput()` (currently `pty-manager.ts:523`). Each successive phase assumes the previous one's additions are present in the same function body:

- Phase 0 inserts `appendSeqRing()` and stamps `seq` in the JSON frame.
- Phase 1 adds the headless-emulator feed inside the same function body and replaces `sendScrollback()` with `sendSnapshot()`.
- Phase 2 rewrites the per-client backpressure loop to drop + flag-for-resnapshot instead of silently losing bytes.

None of these can be developed in parallel worktrees without a 3-way merge of `broadcastOutput`. They must be implemented sequentially in a single worktree, one commit per phase.

---

## 2. File-Conflict Matrix

"X" = phase edits this file. "🔥" = high merge-risk if two phases develop simultaneously.

| File                               | P0  | P1                | P2                    | P3                    | P4                 | P5                   | P6                    | P7               |
| ---------------------------------- | --- | ----------------- | --------------------- | --------------------- | ------------------ | -------------------- | --------------------- | ---------------- |
| `pty-manager.ts`                   | X   | X                 | X                     | X (resize+persist)    | —                  | —                    | X (periodic snapshot) | —                |
| `terminal-handler.ts`              | —   | —                 | —                     | X 🔥                  | X 🔥               | —                    | —                     | X 🔥             |
| `ws/server.ts`                     | —   | —                 | —                     | —                     | —                  | X (presence routing) | —                     | X (comment-only) |
| `xterm-wrapper.ts`                 | X   | X (snapshot recv) | X (lastSeq reconnect) | X (render-to-fit)     | X (driver UI)      | X (presence overlay) | —                     | —                |
| `ws-protocol.yaml`                 | X   | X (snapshot msg)  | X (resume msg)        | —                     | X (control msgs)   | X (presence msgs)    | —                     | X (reauth msgs)  |
| `terminal-store.ts`                | —   | —                 | —                     | X (persist cols/rows) | —                  | —                    | X (snapshot blob col) | —                |
| `events-handler.ts`                | —   | —                 | —                     | —                     | X (control events) | X 🔥                 | —                     | —                |
| `src/lib/types/server.ts`          | X   | X                 | X                     | —                     | X                  | —                    | —                     | —                |
| `src/lib/types/ws.ts`              | X   | X                 | X                     | —                     | X                  | X                    | —                     | X                |
| `src/lib/types/terminal-client.ts` | X   | X                 | X                     | X                     | X                  | X                    | —                     | —                |

### Conclusion: what cannot be parallelized

- **P0, P1, P2** — all three edit `broadcastOutput()` in `pty-manager.ts`. Hard sequential. One worktree.
- **P3 + P4** — both edit `terminal-handler.ts:87-97` (the resize case). Cannot be in parallel worktrees; one must rebase on the other. The plan: P3 merges first, P4 adds the driver token alongside P3's driver-check logic.
- **P4 + P5** — both edit `events-handler.ts`. Phase 4 emits a `control-claimed` event; Phase 5 expands the presence schema. These overlap moderately; P4 should merge first to establish the event shape that P5 extends.
- **P3 + P7** — both edit `terminal-handler.ts` resize case (`lines 87-97`). Must merge in order: P3 → P7.
- **P4 + P7** — both edit the WS message switch in `terminal-handler.ts`. Same ordering constraint.

### What can be parallelized (after the spine)

- **P5 (presence) and P6 (restart resilience)** share no files. Fully parallel.
- **P6 and P7** share no files. Fully parallel.
- **P5 and P7** share no files. Fully parallel.

---

## 3. Recommended Execution Waves

### Wave 1 — The Spine (sequential, single worktree)

**Branch:** `feat/terminal-sync-spine`  
**Parallelism:** 1 worktree, sequential commits.  
**Phases:** 0 → 1 → 2

| Phase | Work                                                                                                                                                                                         | Est. time |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0     | Seq ring, `appendSeqRing()`, stamp `seq` in every `output` frame, client `lastSeq` tracking                                                                                                  | 41 min    |
| 1     | Install `@xterm/headless` + `@xterm/addon-serialize`, per-terminal headless emulator fed by `wireHolderCallbacks()`, replace `sendScrollback()` with `sendSnapshot()`, feature-flag fallback | ~4 h      |
| 2     | Reconnect upgrade sends `lastSeq`, server replays ring or snapshots, backpressure drop-and-resnapshot, jitter in client backoff                                                              | ~3 h      |

**Commit strategy:** one squashed commit per phase (CI requires one squash per branch; merge into `feat/terminal-sharing` incrementally).

**Wave 1 is the entire correctness foundation.** Gaps G1, G2, G3, G7, G9 are all closed here.

---

### Wave 2 — Controlled Parallel (3 worktrees, after Wave 1 merges)

After Wave 1 is merged into `feat/terminal-sharing`, open three git worktrees:

| Worktree        | Branch                          | Phases | Files touched (exclusive)                                                                                                                                              |
| --------------- | ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wt-resize`     | `feat/terminal-sync-resize`     | **P3** | `terminal-handler.ts:87-97`, `pty-manager.ts:resize()`, `terminal-store.ts`, `resize/+server.ts`, `xterm-wrapper.ts:readOnly render-to-fit`                            |
| `wt-presence`   | `feat/terminal-sync-presence`   | **P5** | `events-handler.ts`, presence client stores, terminal page UI overlay, `ws-protocol.yaml` (presence msgs), `ws.ts`                                                     |
| `wt-resilience` | `feat/terminal-sync-resilience` | **P6** | `pty-manager.ts` (periodic snapshot persist), `terminal-store.ts` (snapshot blob column), `pty-holder.cjs` (re-fork on orphan), `terminal-store.ts` (orphan detection) |

These three worktrees share **no files** with each other and only touch Wave-1-stabilized interfaces. They can land in any order once Wave 1 is merged.

Estimated parallelism gain: ~3x vs sequential (each is ~2–3 hours of work).

---

### Wave 3 — Dependent Pair (2 worktrees, after P3 merges)

P4 depends on P3 having established the driver concept in `terminal-handler.ts`. P7 depends on P3 (same resize block). Once P3 lands, open two worktrees:

| Worktree      | Branch                        | Phase  | Prerequisite merge                    |
| ------------- | ----------------------------- | ------ | ------------------------------------- |
| `wt-control`  | `feat/terminal-sync-control`  | **P4** | P3 must be in `feat/terminal-sharing` |
| `wt-security` | `feat/terminal-sync-security` | **P7** | P3 must be in `feat/terminal-sharing` |

P4 and P7 both touch `terminal-handler.ts` but in **different sub-blocks** of the message switch:

- P4 adds the driver-token gate inside `case 'input':` and `case 'resize':` (new logic added after P3's driver check).
- P7 adds `allowResize(ws)` at the top of `case 'resize':` and `startReauthTimer/clearReauthTimer` in the connect/close handlers.

If both land in the same PR window, do a coordinated merge: P3 → P4 → P7, each as a separate squash commit. The `pnpm check` type enforcement will catch any cross-contamination.

---

### Wave 4 — Cleanup and Integration

After all phase branches are merged:

- Run the full cross-cutting end-to-end test (section 5).
- Resolve any residual `TODO:RECORDING` stubs from Phase 7.
- Add the feature-flag env var for the SerializeAddon fallback (from Phase 1) to `.env.example`.
- Tag a `v2.0.0-beta` on `feat/terminal-sharing`.

---

### Worktree setup commands

```bash
# Wave 1 (spine) — already in the current worktree:
# git checkout -b feat/terminal-sync-spine
# ... implement P0, P1, P2 sequentially, squash each, merge to feat/terminal-sharing

# Wave 2 — after Wave 1 merged:
git worktree add ../terminal-sync-resize  -b feat/terminal-sync-resize  feat/terminal-sharing
git worktree add ../terminal-sync-presence -b feat/terminal-sync-presence feat/terminal-sharing
git worktree add ../terminal-sync-resilience -b feat/terminal-sync-resilience feat/terminal-sharing

# Wave 3 — after P3 merged into feat/terminal-sharing:
git worktree add ../terminal-sync-control  -b feat/terminal-sync-control  feat/terminal-sharing
git worktree add ../terminal-sync-security -b feat/terminal-sync-security feat/terminal-sharing
```

Total parallel worktrees at peak: **3** (Wave 2). Never more than 5 active (Wave 2 + Wave 3 start overlap is unlikely; Phase 3 is the bottleneck).

---

## 4. Risk Register

### R1 — SerializeAddon experimental / version pinning

**Description:** `@xterm/addon-serialize` is marked experimental. It reaches into `_core` internals for cursor position, scroll region, color palette, and modes. A minor version bump can silently break the snapshot. It does not serialize combined/composed characters (confirmed `TODO` in the source).

**Probability:** Medium (each xterm.js release may move `_core` internals).  
**Impact:** High (Phase 1 is the entire correctness foundation).

**Mitigation:**

1. Pin the exact version in `package.json`: `"@xterm/addon-serialize": "0.x.y"` and `"@xterm/headless": "5.x.y"` with `"@xterm/xterm": "5.x.y"`. All three must be the same major.
2. Phase 1 spec requires a **feature-flagged fallback**: env var `SHOOTER_SNAPSHOT_FALLBACK=raw` bypasses `serialize()` and falls back to the existing raw-ring `sendScrollback()`. This flag lets us ship Phase 1 while the spike validates `serialize()` against vim/htop/agent-TUI scenarios.
3. Run the spike (see §5 validation) before writing Phase 1 implementation code. Spike output: "does `serialize()` reconstruct a running vim session correctly after 5 minutes of editing?" If no, the combined-character TODO is a blocker and the fallback becomes the primary path.

**Validation gate:** Phase 1 is complete only when the spike passes for vim (modal TUI), htop (full-screen TUI with mouse), and a Claude Code agent session (heavy alt-screen use), tested with the feature flag both on and off.

---

### R2 — Backpressure resnapshot correctness (Phase 2)

**Description:** Phase 2's new policy drops a slow client and flags it for resnapshot on drain (`ws.once('drain', sendSnapshot)`). The risk: between the `output-dropped` notification and the `drain` snapshot, the client renders partial bytes. If the dropped bytes span a VT escape sequence, xterm.js may enter a corrupted render state before the snapshot arrives.

**Probability:** Low-medium (most VT sequences are < 50 bytes; `MAX_OUTPUT_BUFFER_BYTES = 1 MB` means a lot of chunks are dropped together before the flag fires).  
**Impact:** Medium (cosmetic corruption until resnapshot arrives; not data loss).

**Mitigation:**

1. On `output-dropped`, immediately send `{ type: 'output-dropped', bytes }` as today, **then immediately clear xterm.js** client-side: the `output-dropped` handler calls `term.reset()` to wipe the display before the snapshot arrives. This ensures the client sees a blank screen briefly rather than corruption.
2. Resnapshot on drain is gated: the `output-dropped` flag also clears the client's output buffer server-side (all buffered chunks are discarded) so the drain fires quickly.
3. Test: Phase 2 test harness uses a throttled WebSocket client (simulated 1 KB/s) against a 512 KB/s TUI and verifies the client recovers to a correct screen within 3 seconds.

---

### R3 — Control-token edge cases (Phase 4)

**Description:** Phase 4's single-active-writer model has several edge cases: (a) driver disconnects mid-input (partial VT sequence in flight), (b) owner claims control from a guest mid-command (next byte goes to the wrong command), (c) network partition causes the driver token to remain "held" by a zombie client.

**Probability:** Medium (all edge cases are reachable in normal multi-device usage).  
**Impact:** Medium to high (scrambled PTY input, which cannot be unsent).

**Mitigation:**

1. **(a)** On driver disconnect (`ws.on('close')`), the token reverts to the terminal owner automatically. Any partial VT sequence is the holder's problem; since node-pty buffers until a full sequence is parseable, this is safe in practice.
2. **(b)** The owner's claim-control is instant (preemptive, not request-based per D2). The claim takes effect at the next frame boundary server-side. Document this: "the owner may see one final keystroke from the outgoing driver before the claim takes effect."
3. **(c)** The token is stored in `PtyManagedTerminal` (server-side, not in the WebSocket state). On `ws.on('close')`, Phase 4's cleanup unconditionally clears the driver token if `ws === terminal.driverWs`. A keepalive ping timeout (existing keepalive module) detects zombie clients within 30 seconds, triggering the close event.
4. **Test:** Phase 4 test cases must include: driver disconnect while typing, owner preempt during guest typing, network drop causing both `ws.close` and keepalive timeout paths.

---

### R4 — Backward compatibility with old clients

**Description:** Phase 0 makes `seq: number` a **required** field on `WireTerminalServerMessage.output` (`ws.ts:150`). Old clients (iOS app, any cached browser tab on the old build) will receive frames with an extra `seq` field they do not know about. New clients connecting to an old server (without Phase 0) receive frames without `seq`.

**Probability:** Certain (the iOS Swift client is deployed separately; cached browser tabs live for hours).  
**Impact:** Low — JavaScript/JSON ignores unknown fields. Old clients that don't read `seq` simply ignore it; the `lastSeq` tracking in Phase 0's `xterm-wrapper.ts` uses `typeof msg.seq === 'number'` (optional check), so old-server frames are handled gracefully.

**Mitigation:**

1. The Phase 0 spec already uses `seq?: number` on the _client receive_ type (`WsTerminalInboundMessage`) — optional on the consumer side.
2. Required on the _server send_ type (`WireTerminalServerMessage`) — enforces the field at the TypeScript layer on the server.
3. The iOS Swift client must be updated to accept (and ignore, initially) the `seq` field. No protocol version negotiation is needed for Phase 0 since the field is additive.
4. For Phase 2 (client sends `lastSeq`), add it as a URL query param (`?ticket=X&lastSeq=N`) rather than a new message type to avoid a server-side message-parser version branch.
5. **Phase 1's new `snapshot` wire message type** is the first additive server→client type. Old clients that only handle `scrollback` will receive a `snapshot` frame they do not recognize and may fail silently. Mitigation: keep sending `scrollback` chunks as a fallback for clients that do not advertise `snapshot` capability (negotiated via a `?caps=snapshot` query param on the WebSocket URL). Old clients omit the param and receive legacy `scrollback`; new clients include it and receive `snapshot`.

---

### R5 — Headless emulator memory footprint at scale

**Description:** Each `@xterm/headless` terminal instance holds a full in-memory grid (default 80×24 cells with Unicode, plus scrollback ring). At 100 concurrent terminals, the emulator instances may add meaningful RSS overhead.

**Probability:** Low for a personal/team tool (< 20 simultaneous terminals is the realistic ceiling).  
**Impact:** Low (even at 100 terminals, `@xterm/headless` RAM per instance is ~5–15 MB = 500 MB–1.5 GB, which is acceptable for a dedicated server but may matter on a low-RAM device).

**Mitigation:**

1. Phase 1 instantiates the headless emulator only for `running` terminals. On terminal exit, `emulator.dispose()` is called.
2. If memory becomes an issue, add a config option `SHOOTER_EMULATOR_MAX=N` that falls back to raw-ring replay for terminal N+1 and above.

---

## 5. Validation Strategy — Cross-Cutting End-to-End Test

This test proves sync correctness end-to-end. It must pass before any phase is considered "done" for production. Run it manually (or automate via `tests/e2e-sync.manual.md`) after each phase that touches the broadcast path (Phases 0, 1, 2) and after Phase 4.

### Test scenario: "vim/htop mid-join, driver handoff, reconnect mid-output"

**Setup:**

```
Browser A  ──owns──▶  Terminal T  ──streams──▶  Holder PTY (id=abc)
Browser B  ──view-only guest──▶  same Terminal T
Browser C  ──control-mode guest──▶  same Terminal T (after Phase 4)
```

**Step 1 — Alt-screen TUI correctness (fixes G2)**

1. Browser A opens Terminal T. Run `vim ~/.zshrc` (a classic alt-screen TUI).
2. Make several edits in vim. Leave the file open with the cursor mid-document.
3. Open Browser B as a view-only guest (use `POST /api/share` to create a read-only share token, then open the terminal page with that token).
4. **Expected:** Browser B renders the _current vim screen_, including the exact line the cursor is on, the correct color scheme (statusline, line numbers), and the correct scroll position — NOT a raw-text replay that misses the `\x1b[?1049h` alt-screen switch.
5. Open a third browser window (Browser A-2) as another owner tab.
6. **Expected:** Browser A-2 also renders the current vim screen correctly on join. Not a blank screen, not duplicate init lines.

**Validation method:** Screenshot comparison between Browser A, Browser B, and Browser A-2. All three must show identical content.

**Step 2 — Scrollback race at join boundary (fixes G3)**

1. Run `yes | head -10000` in Terminal T to flood the PTY at ~1 MB/s.
2. While output is actively streaming, open Browser B as a new view-only guest.
3. **Expected:** Browser B displays coherent output from the snapshot point, then catches up via the seq-ordered live tail. No lines are duplicated; no lines have partial VT sequences.
4. **Anti-expected (what the old code does):** Browser B shows some lines twice (scrollback and live tail overlap) or shows `^[` characters (partial escape sequence in the scrollback boundary).

**Validation method:** After `yes` finishes, run `wc -l` in both Browser A and Browser B's terminals. Both should agree on the line count (within the scrollback cap).

**Step 3 — Backpressure divergence prevention (fixes G1)**

1. Open Terminal T with `htop` running.
2. Throttle Browser B's WebSocket to 10 KB/s using browser DevTools → Network throttle.
3. Produce rapid PTY output (run `find / -name "*.js" 2>/dev/null` in a separate pane, or just let htop refresh rapidly).
4. After 30 seconds, restore normal bandwidth.
5. **Expected:** Browser B automatically resyncs to the current screen within 2–3 seconds of bandwidth restoration (via the drain → resnapshot path). It does NOT permanently diverge from Browser A.
6. **Anti-expected (what the old code does):** Browser B silently falls behind and shows a stale screen indefinitely, or shows `[N bytes dropped]` warnings with no recovery.

**Validation method:** After bandwidth restoration, Browser A and Browser B must show identical `htop` screens within 5 seconds.

**Step 4 — Reconnect resume without full redraw (fixes G7)**

1. Browser A has been in Terminal T for 2 minutes. `lastSeq` is approximately 5,000 (assuming ~40 output chunks per second × 120 seconds).
2. Close and reopen Browser A's WebSocket (simulate with DevTools → Network → Offline for 3 seconds, then Online).
3. **Expected:** Browser A reconnects, sends `?lastSeq=4950` (approximate), and receives only the 50 chunks it missed — not a full snapshot replay.
4. Confirm by watching the Network tab: the reconnect frame count should be small (< 100 frames), not a large scrollback blob.
5. If the gap is too large (e.g., 30-second offline), a snapshot is sent instead. Verify both paths.

**Validation method:** Browser DevTools → Network → WS frames. Count the frames after reconnect.

**Step 5 — Driver handoff (Phase 4, after it lands)**

1. Browser A is the active driver/owner; cursor is in the terminal.
2. Browser C has a `control` share token (Phase 4: can request control).
3. Browser C requests control. Browser A sees a prompt: "Browser C (guest) is requesting control."
4. Browser A grants control. Browser C types `echo hello`. `hello\n` appears in the PTY.
5. Browser A reclaims control (owner preempt, instant). Browser C's next keystroke is silently dropped.
6. **Expected:** At no point do keystrokes from both Browser A and Browser C interleave in the PTY.

**Validation method:** PTY output must contain exactly one `echo hello` with no interleaved characters from Browser A's keystrokes during Browser C's control window.

**Step 6 — View-only guest receives correct initial size (fixes G8)**

1. Owner has resized Terminal T to 200×50 (wide/tall).
2. Browser B joins as a new view-only guest.
3. **Expected:** Browser B renders immediately at 200×50, not at the default 80×24. No resize event from the owner is needed to trigger this.

**Validation method:** Open Browser B DevTools console; `term.cols` and `term.rows` should read 200 and 50 respectively on the first frame after the snapshot is received.

---

### Automated regression test (CI-safe, no browser required)

Add `tests/e2e-sync.test.cjs` to the test suite. This test:

1. Spawns a real holder process (`pty-holder.cjs`) with a script that prints 10 000 lines of output.
2. Creates a `HolderClient` connection and feeds output through `PtyManager.broadcastOutput()` (unit-tested, no real WebSocket).
3. Verifies the seq ring grows to `SEQ_RING_MAX_ENTRIES = 2000` and wraps correctly.
4. Verifies `getSeqRingFrom(id, 1800)` returns exactly 200 entries.
5. Verifies `getSeqRingFrom(id, 0)` returns null when the ring has wrapped past seq 1.
6. After Phase 1: instantiates `@xterm/headless`, feeds all 10 000 lines, calls `serialize()`, verifies the output contains `\x1b[` (escape sequences present, not raw text), and has no duplicate lines.

This test is fast (< 5 seconds) and machine-verifiable.

---

## 6. DO THIS FIRST

**Implement Phase 0** on `feat/terminal-sync-spine`, branched from `feat/terminal-sharing`.

Phase 0 is the lowest-risk change in the entire roadmap (9 tasks, ~41 minutes, no behavior change visible to end users), and it is the prerequisite for everything else. Its specific deliverable is a `seq: number` field on every `output` wire frame and the `seqRing` on every terminal record — two facts that Phase 1 depends on for the snapshot attach-point and Phase 2 depends on for gap-fill.

**Do NOT start Phase 1** until Phase 0's five validation gates pass:

```bash
node tests/seq-ring.test.cjs   # 8 tests, all pass
pnpm check                     # zero type errors
pnpm lint                      # zero lint errors
pnpm test                      # full suite passes (includes seq-ring)
pnpm build                     # builds clean
```

The reason to resist skipping ahead to Phase 1: Phase 1 is the highest-risk work (SerializeAddon experimental, headless emulator lifecycle, snapshot protocol design). Doing it without the seq ring means Phase 1 also has to invent sequencing, and the resulting diff will be much harder to review and roll back if the SerializeAddon spike fails. Phase 0's clean separation makes Phase 1 a narrow, reviewable change.

**After Phase 0 merges:** run the SerializeAddon spike in isolation before writing Phase 1 implementation code:

```bash
# Spike: does serialize() reconstruct a running vim session correctly?
node scripts/spike-serialize.cjs  # to be written as part of Phase 1 task 0
```

The spike result determines whether Phase 1 uses `serialize()` as the primary snapshot path or the fallback-raw-ring path as primary. All subsequent phase timelines pivot on this outcome.

---

## Appendix A — Real constants anchoring this document

All constants are verified from the current `feat/terminal-sharing` branch:

| Constant                  | Value                   | File:Line                      |
| ------------------------- | ----------------------- | ------------------------------ |
| `MAX_SCROLLBACK_BYTES`    | `512 * 1024` (512 KB)   | `pty-manager.ts:31`            |
| `MAX_OUTPUT_BUFFER_BYTES` | `1024 * 1024` (1 MB)    | `pty-manager.ts:32`            |
| `SCROLLBACK_CHUNK_SIZE`   | `50 * 1024` (50 KB)     | `pty-manager.ts:33`            |
| `MAX_SCROLLBACK_LINES`    | `5000`                  | `pty-holder.cjs:32`            |
| `GRACE_PERIOD_MS`         | `60000` (60 s)          | `pty-holder.cjs`               |
| `HANDSHAKE_TIMEOUT_MS`    | `10000` (10 s)          | `holder-client.ts`             |
| `SEQ_RING_MAX_ENTRIES`    | `2000` (Phase 0)        | `pty-manager.ts` (to be added) |
| `RESIZE_BURST`            | `4`                     | `resize-limiter.ts` (Phase 7)  |
| `RESIZE_INTERVAL_MS`      | `500`                   | `resize-limiter.ts` (Phase 7)  |
| `REAUTH_INTERVAL_MS`      | `5 * 60 * 1000` (5 min) | `reauth.ts` (Phase 7)          |
| `REAUTH_GRACE_MS`         | `30 * 1000` (30 s)      | `reauth.ts` (Phase 7)          |
| Dimension cap (cols)      | `> 500 → rejected`      | `terminal-handler.ts:169`      |
| Dimension cap (rows)      | `> 200 → rejected`      | `terminal-handler.ts:169`      |
| WS close code for re-auth | `4003`                  | `reauth.ts` (Phase 7)          |
| WS close code for revoke  | `4001`                  | `guest-registry.ts:17`         |
| Client reconnect: initial | `1000` ms               | `xterm-wrapper.ts:139`         |
| Client reconnect: max     | `30_000` ms             | `xterm-wrapper.ts:208`         |

---

## Appendix B — Gap-to-Phase mapping

| Gap                             | Severity | Fixed in Phase                      |
| ------------------------------- | -------- | ----------------------------------- |
| G1 — backpressure divergence    | P0       | 2 (drop + resnapshot)               |
| G2 — alt-screen raw-ring replay | P0       | 1 (headless emulator + serialize()) |
| G3 — scrollback/live join race  | P0       | 0+1 (seq attach-point)              |
| G4 — resize last-writer-wins    | P1       | 3 (driver-authoritative)            |
| G5 — resize not persisted       | P1       | 3 (persist to SQLite)               |
| G6 — multi-writer input         | P1       | 4 (single-active-writer token)      |
| G7 — full replay on reconnect   | P2       | 2 (ring resume)                     |
| G8 — guest no initial size      | P2       | 3 (level-triggered on attach)       |
| G9 — holder ring vs server ring | P2       | 1 (one authoritative emulator)      |
| G10 — holder death = orphan     | P2       | 6 (re-fork on orphan)               |
