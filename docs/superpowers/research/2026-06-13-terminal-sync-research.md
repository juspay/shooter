# Live Multi-Client Terminal Sync — Research & Implementation Workflow

**Date:** 2026-06-13
**Status:** Research (pre-design). Next step: turn the recommended architecture into a spec → plan.
**Question being answered:** When the same terminal is open in more than one place — the owner on their desktop, a guest it's been shared with, or several browser tabs/devices — how do we guarantee every view stays **shared, live, and consistent**? And how do we support that **locally**, **across browsers**, and **between terminal clients**?

---

## 0. TL;DR

Shooter's foundation is already correct: **one holder-owned PTY, many WebSocket clients, output broadcast to all of them.** Sharing _works_ at the byte level today. What's missing is **consistency guarantees** — every client should see the same, correct, current screen, and recover cleanly after lag or reconnect.

The single highest-leverage change is to stop treating the raw byte ring as the source of truth and instead run a **server-side authoritative terminal emulator** (`@xterm/headless`) per terminal, fed by the holder's output. New/late/reconnecting clients then receive a **serialized current-screen snapshot** (`@xterm/addon-serialize`) plus a **sequence-numbered live tail** — exactly how tmux (server grid + redraw), mosh (server emulator + diff), and asciinema (avt + InitData) all do it. This one move fixes the three correctness-breaking bugs at once (alt-screen corruption on join, silent per-client divergence under backpressure, and the scrollback/live duplication race).

Everything else — resize arbitration, a one-writer-at-a-time control model, and a presence channel — layers cleanly on top.

---

## 1. Framing: what "sync" actually means here

The user's three scenarios are all the **same problem** wearing different hats:

| Scenario                         | What it really is                                                                |
| -------------------------------- | -------------------------------------------------------------------------------- |
| "Working on it on the desktop"   | The owner's primary browser is **client A** of the holder PTY                    |
| "Shared it with somebody"        | The guest's browser is **client B** of the same PTY (scoped, possibly view-only) |
| "Open in multiple browsers/tabs" | **Clients A, B, C…** of the same PTY                                             |

There is exactly **one** PTY (the holder process). Every "place" you view it is just another WebSocket client attached to that one PTY. So the goal isn't "replicate a terminal across machines" — it's "**fan one terminal out to N clients and keep all N views identical, live, and self-healing.**"

"Sync" therefore decomposes into five sub-guarantees:

1. **Liveness** — output reaches every client in near-real-time. _(Mostly solved today.)_
2. **Late-join correctness** — a client that joins mid-session sees the _current screen_, not a corrupted replay. _(Broken today for TUIs.)_
3. **Convergence** — no two clients permanently diverge; a client that fell behind can catch up or resnapshot. _(Broken today under backpressure.)_
4. **Resize coherence** — clients of different sizes don't fight over the one PTY size; viewers render correctly. _(Partially solved; no arbitration.)_
5. **Write coherence** — when more than one client can type, input doesn't interleave into garbage. _(Unsolved; free-for-all.)_

---

## 2. How Shooter syncs today (grounded in the code)

> Source: full codebase trace in the appendix. File:line and constants are exact.

**One PTY, many clients.** `pty-manager.attach(id, ws)` adds each client `ws` to a per-terminal `terminal.clients: Set<WebSocket>` and gives it its own `outputBuffers` entry (`pty-manager.ts:63-76`). `broadcastOutput()` fans every PTY chunk to all clients (`pty-manager.ts:523-568`). Input from any client → `terminal.pty.write()` → the single holder PTY (`terminal-handler.ts:82-85`). This is the right shape.

**Two scrollback stores, both raw bytes, independently trimmed.** The holder keeps a line-counted ring (`MAX_SCROLLBACK_LINES = 5000`, no byte cap; trims whole PTY chunks off the front — `pty-holder.cjs:32-82`). The server keeps a separate byte-capped string (`MAX_SCROLLBACK_BYTES = 512 * 1024`, trimmed at the nearest newline past the midpoint — `pty-manager.ts:502-516`). Late-joiners get the **server** copy, chunked at `SCROLLBACK_CHUNK_SIZE = 50 KB` (`pty-manager.ts:804-848`).

**Per-client backpressure that can silently diverge.** Each client has its own 1 MB buffer (`MAX_OUTPUT_BUFFER_BYTES = 1024*1024`). When client A overflows, A's _oldest_ bytes are dropped and A gets an informational `{type:'output-dropped', bytes}` — B is unaffected (`pty-manager.ts:523-568`). So **different clients can miss different byte ranges, permanently, with no resync path.**

**Resize: last-writer-wins, no arbitration.** A client resize calls `pty.resize()` and broadcasts `{type:'resize',cols,rows}` to the _other_ clients (`terminal-handler.ts:87-97`); the REST path broadcasts to _all_ including the caller (`pty-manager.ts:476-496`). View-only guests apply it (`xterm-wrapper.ts:193-199`); interactive clients ignore it and follow their own `fitAddon`. There is **no** owner-authoritative / smallest-wins policy — the last interactive client to resize sets the size for everyone. Resized dims are also **not persisted** to SQLite, so a server restart reverts to creation-time size.

**Reconnect: full replay, no resume.** Client reconnect (`xterm-wrapper.ts`) is exponential backoff (1 s → 30 s, no jitter), re-fetch ticket, re-attach, full scrollback replay. There are **no sequence numbers / offsets** anywhere, so a reconnecting client can't resume from where it left off, and output flowing _during_ the async scrollback send can be written to xterm twice (the scrollback/live duplication race).

**Input: free-for-all.** No lock, no turn-taking, no driver. View-only guests are dropped at `if (scope?.readOnly) return;` (`terminal-handler.ts:71-73`), but two _interactive_ clients (two owner tabs, or owner + a control-mode guest) both `pty.write()` concurrently with event-loop-order interleaving.

**Two sync planes.** The **raw byte plane** (`/ws/terminal/:id`, xterm) is real-time. The **structured session plane** (`/ws/session/:id`, JSONL file-watched conversation) lags by the agent's write cadence + chokidar debounce (`stabilityThreshold: 200ms`) + up to a 2 s discovery poll. They can disagree about "current state."

**Sharing rides on top.** Guests are just additional `terminal.clients` with a scoped ticket (`TicketScope {terminalId, readOnly}`); view-only guests rely entirely on the (edge-triggered) resize broadcast to size correctly, and there's **no level-triggered size push on join.**

---

## 3. The consistency gaps (prioritized)

| #       | Gap                                                                                                                                | Severity | Symptom the user would see                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| **G1**  | Per-client backpressure drops diverge silently and permanently (no offset, no resync)                                              | **P0**   | Two viewers of a busy terminal slowly drift apart; one shows corrupted/older output |
| **G2**  | Raw-ring replay can't reconstruct an alt-screen TUI (vim/htop/agent TUI) once the ring trims past the `\x1b[?1049h` enter sequence | **P0**   | A guest who joins while an AI agent's full-screen UI is running sees garbage        |
| **G3**  | Async scrollback send races live output → bytes written to xterm twice at the join/reconnect boundary                              | **P0**   | Flicker / duplicated lines right after connecting                                   |
| **G4**  | No resize arbitration for multiple interactive clients                                                                             | **P1**   | Desktop + phone open at once → the terminal keeps resizing under both               |
| **G5**  | Resized cols/rows not persisted; revert on server restart                                                                          | **P1**   | After a restart the terminal is the wrong size                                      |
| **G6**  | Multi-writer input interleaves with no ordering                                                                                    | **P1**   | Owner and a control-guest typing at once → scrambled commands                       |
| **G7**  | No byte-offset resume on reconnect (always full replay)                                                                            | **P2**   | Brief network blip → full redraw instead of a seamless catch-up                     |
| **G8**  | View-only guests get no size on attach (edge-triggered only)                                                                       | **P2**   | Guest renders at the wrong size until the owner next resizes                        |
| **G9**  | Holder ring (lines) vs server cache (bytes) trim independently                                                                     | **P2**   | Inconsistent scrollback depth between fresh joins and the live stream               |
| **G10** | Holder death outside the 60 s grace = permanently orphaned (no re-fork)                                                            | **P2**   | A crashed holder kills the terminal with no recovery                                |

---

## 4. Prior art → the technique that fixes each gap

The shared-terminal problem is well-trodden. Four reference designs converge on the **same core idea**: keep an _authoritative emulator/screen model on the server_ and hand new clients a _rendered snapshot_, not a byte log.

### 4.1 The server-side authoritative emulator (the keystone)

- **tmux / GNU screen.** The server holds an in-memory screen _grid_ per pane (`struct grid`/`struct screen`). On attach it **synthesizes a full redraw** from the grid (`screen_redraw_screen`), never replays raw history → a vim session running for hours reconstructs perfectly for a new client. ([tmux grid.c](https://github.com/tmux/tmux/blob/master/grid.c), [screen-redraw.c](https://github.com/tmux/tmux/blob/master/screen-redraw.c))
- **mosh — State Synchronization Protocol.** Server runs a terminal emulator, keeps the _current screen_ as a synced object, and sends **idempotent diffs** toward the latest state (skipping stale intermediate frames), sequence-numbered, with client prediction for local echo. Tolerates loss and IP roaming because sessions bind to keys+seqs, not a TCP 4-tuple. ([mosh paper](https://mosh.org/mosh-paper.pdf))
- **asciinema ALiS.** Server runs its own VT emulator (`avt`); a late joiner gets an **Init event** with `Cols/Rows/LastId` + `InitData` (the serialized current screen), then sequence-numbered live `Output` events. ([ALiS spec](https://docs.asciinema.org/manual/server/streaming/))
- **xterm.js gives us this off the shelf.** `@xterm/headless` is a DOM-free xterm.js (full VT parser + buffers, no renderer) built **for exactly this** ("keep track of a terminal's state… using the serialize addon so it can get all state restored upon reconnection" — xterm.js README). `@xterm/addon-serialize`'s `serialize()` emits a VT-escape string that reconstructs the current screen **including the alternate buffer** (`ESC[?1049h` + content) and **modes** (app-cursor, bracketed paste, mouse, cursor visibility, scroll region) and cursor position. Options: `scrollback`, `excludeModes`, `excludeAltBuffer`. ([SerializeAddon source](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-serialize/src/SerializeAddon.ts), [npm](https://www.npmjs.com/package/@xterm/addon-serialize))

> Caveats to respect: SerializeAddon is marked **experimental** (pin the version), reaches into `_core` internals for cursor/scroll-region/colors, does **not** serialize combined/composed characters (a `TODO`), and you must `serialize()` _inside a `write()` callback_ so all PTY bytes are parsed first, and restore into a terminal of the **same dimensions**.

**Fixes:** G2 (alt-screen — snapshot captures the alt buffer), G3 (snapshot is a single coherent payload, no race with live tail if sequenced), G9 (one authoritative store replaces two ad-hoc ones).

### 4.2 Sequence numbers + snapshot-on-gap (convergence & reconnect)

The canonical Node/WebSocket hybrid (asciinema, Cloudflare Sandbox):

- Tag **every** output chunk with a monotonic `seq` before broadcasting and before feeding the headless emulator.
- Keep a bounded ring of `{seq, data}` (≈0.5–2 MB).
- On reconnect the client sends `lastSeq`; server **replays from the ring if present, else sends a fresh `serialize()` snapshot**. Never replay a partial gap — one missing byte in a VT sequence corrupts everything downstream; a snapshot is always safe.
- Under backpressure, **drop the slow client and resnapshot on its next drain**, instead of silently losing bytes forever.

**Fixes:** G1 (divergence → bounded, self-healing via resnapshot), G7 (true resume), G3 (ordering via seq).

### 4.3 Resize policy (coherence)

tmux's `window-size` is the reference: `smallest` (default — shrink to smallest client, pad the bigger ones), `largest`, `latest`, or `manual`; `aggressive-resize` ties size to actively-viewing clients. tmate uses **smallest-common-denominator** so no one overflows. The rule everyone follows: **a read-only viewer must never resize the PTY** — it resizes its own xterm to match instead. ([tmux window-size](https://tmuxai.dev/tmux-window-size/))

**Fixes:** G4 (pick a policy — recommend **owner-authoritative**, else smallest-wins among interactive clients), G8 (push current size on attach — make it level-triggered), G5 (persist on resize).

### 4.4 Write coherence (input arbitration)

Surveyed models, in order of safety:

| Model                                                                       | Who uses it                                                                    | Fit for Shooter                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Free-for-all** (all writers → one PTY)                                    | GoTTY `-w`, ttyd `-W`, tmate full link, sshx default, Warp concurrent edit     | What Shooter does now; fine when _one_ person types by convention; scrambles under genuine concurrency         |
| **Driver/observer + explicit handoff** (one writer; others request control) | VS Code Live Share (host intervenes), Warp `CMD+I` agent↔human handoff         | **Recommended target** for "control" mode                                                                      |
| **Per-client read-only default + explicit grant**                           | VS Code Live Share, sshx `--enable-readers`, tmate ro/rw links, Warp view/edit | **Shooter is already here** (view vs control password) — next step is _dynamic_ grant/revoke without reconnect |
| Turn-taking/locking queue                                                   | (academic only)                                                                | Too rigid; skip                                                                                                |

**Recommendation:** keep read-only-by-default, and for control make it **one active writer at a time** with the owner able to _claim_ control instantly (Warp's `CMD+I` model) — eliminates G6 while keeping collaboration fluid.

### 4.5 Presence & awareness (the "feels live" layer)

sshx and Warp set the bar: connected-user list, **live per-participant cursors**, typing/activity indicators, avatars. The clean architecture (Cloudflare Sandbox) is a **separate presence channel** rather than mixing presence into the PTY byte stream — which maps directly onto Shooter's existing `/ws/events` channel. Who-has-control, who's-viewing, and "owner is here" all ride there.

### 4.6 Security deltas for interactive sharing

From the survey: write access to a shell = remote code execution, so read-only default is correct (Shooter ✓). Gaps to close: **in-band re-auth on long-lived sockets** (HTTP auth happens pre-upgrade, so a revoked token doesn't kill an open WS — Shooter's `closeGuests()` already covers revoke, keep it), **resize rate-limiting + max-dimensions** (TIOCSWINSZ is unauthenticated; a malicious client can oversize to corrupt output), and optionally **session recording** for audit (no surveyed web tool does this natively — a differentiator if wanted).

---

## 5. Target architecture for Shooter

```
                     ┌─────────────────────────── holder process (one per terminal) ───┐
   node-pty  ──data──▶  raw bytes  ──ndjson──▶  Unix socket                              │
                     └──────────────────────────────────────────────────────────────────┘
                                              │
                                     HolderClient.onOutput
                                              │
              ┌───────────────────────────────▼─────────────────────────────────────────┐
              │  PtyManager (server, one record per terminal)                            │
              │                                                                          │
              │   ┌── @xterm/headless emulator  ◀── feed every chunk  (authoritative)    │
              │   │      └─ serialize() → snapshot on join / reconnect / gap             │
              │   ├── seq counter + bounded {seq,data} ring  (replay / resume)           │
              │   ├── size policy (owner-authoritative; viewers follow; persist dims)    │
              │   └── active-writer token (control handoff)                              │
              └───────┬───────────────────────────────────────────────┬─────────────────┘
                      │ broadcast: {seq, data} live tail               │ presence (/ws/events)
            ┌─────────▼─────────┐   ┌─────────▼─────────┐    ┌─────────▼─────────┐
            │ Browser tab A      │   │ Guest browser B   │    │ iOS / native attach│
            │ (owner, desktop)   │   │ (view or control) │    │ (optional)         │
            │  xterm + lastSeq   │   │  xterm + lastSeq  │    │                    │
            └────────────────────┘   └───────────────────┘    └────────────────────┘
```

**Per dimension the user named:**

- **Locally (single machine).** Already unified — the holder PTY is the one source, and the headless emulator + ring live beside it in the server. Add: **persist the serialized snapshot to disk periodically** so a holder/server restart restores the _screen_, not just a byte ring (improves G10). Optional: a native **`shooter attach <id>`** CLI (tmux-style) so a real local terminal is just another client of the same authoritative session.
- **Across browsers (tabs/devices).** Snapshot-on-join + seq'd live tail makes every tab/device identical and correct; `lastSeq` resume + drop-and-resnapshot keeps them converged; resize policy + size-on-join keep them coherent; presence channel makes it feel multiplayer.
- **Between terminal clients (cross-client consistency).** Because every client renders from the _same_ `serialize()` snapshot and the _same_ sequence-numbered stream, browser ↔ iOS ↔ native attach all show an identical screen by construction. Define the **raw plane as authoritative** for the live screen and the **session plane as eventually-consistent structured history**; reduce session-plane lag (debounce/discovery) but don't try to make the two planes byte-identical — they answer different questions.

---

## 6. Implementation workflow (phased)

Each phase is independently shippable and ordered by correctness-leverage. Files are the touch-points from the codebase audit.

**Phase 0 — Sequencing foundation.** Add a monotonic `seq` to every broadcast chunk; client tracks/ACKs `lastSeq`. Bounded `{seq,data}` ring in the terminal record. _Files:_ `pty-manager.ts` (broadcast), `ws.ts`/`ws-protocol.yaml` (frame type), `xterm-wrapper.ts` (track lastSeq). _No behavior change yet — pure groundwork._

**Phase 1 — Server-side authoritative emulator (biggest win).** Add `@xterm/headless` + `@xterm/addon-serialize` per terminal, fed by `HolderClient.onOutput`. Replace raw-ring late-join replay with a `serialize()` snapshot (computed inside a `write()` callback) followed by the live tail. _Fixes G2, G3, G9._ _Files:_ `pty-manager.ts` (emulator lifecycle + `sendScrollback` → `sendSnapshot`), new `terminal-emulator.ts`. _Risk:_ SerializeAddon is experimental — pin version, add a fallback to raw replay behind a flag, test with vim/htop/an agent TUI.

**Phase 2 — Reconnect resume + backpressure convergence.** On reconnect, client sends `lastSeq`; server replays ring or sends snapshot if the gap is too large. On backpressure overflow, drop + flag for resnapshot on drain instead of silent byte loss. Add jitter to client backoff. _Fixes G1, G7._ _Files:_ `pty-manager.ts` (broadcast/backpressure), `server.ts`/handler (reconnect param), `xterm-wrapper.ts`.

**Phase 3 — Resize arbitration & coherence.** Adopt owner-authoritative sizing (fallback smallest-wins among interactive clients); viewers always follow and never resize the PTY; push current size on attach (level-triggered); persist cols/rows on resize. _Fixes G4, G5, G8._ _Files:_ `terminal-handler.ts`, `pty-manager.ts` (`resize`, attach), `terminal-store.ts` (persist dims), `resize/+server.ts`.

**Phase 4 — Write coherence / control handoff.** Single active-writer token per terminal; owner can claim instantly; control-guests request control. Gate `pty.write()` on the token (in addition to the existing read-only scope check). _Fixes G6._ _Files:_ `terminal-handler.ts`, share/guest layer, a new control-state holder; UI affordance in `terminals/[id]/+page.svelte`.

**Phase 5 — Presence & awareness.** A presence channel (extend `/ws/events`): who's connected, per-participant cursors, typing/viewing indicators, who-holds-control, "owner is here." _Files:_ `events-handler.ts`, client stores, terminal page UI.

**Phase 6 — Restart resilience.** Periodic serialized-snapshot persistence; holder re-fork for orphaned-but-wanted terminals. _Fixes G10._ _Files:_ `pty-manager.ts`, `pty-holder.cjs`, `terminal-store.ts`.

**Phase 7 — Security hardening.** Resize rate-limit + max-dims; in-band WS re-auth heartbeat; optional opt-in session recording for audit. _Files:_ `terminal-handler.ts`, `ticket-store.ts`/auth, new recorder.

**Cross-cutting (optional, anytime after Phase 1):** native `shooter attach <id>` CLI; session-plane lag reduction.

---

## 7. Open decisions (for the design phase)

1. **Resize policy:** owner-authoritative (simplest mental model, recommended) vs smallest-wins (no client ever overflows) vs per-client independent with a "fit to my window" that doesn't touch the PTY (most flexible, most work).
2. **Control model for "control" shares:** one-writer-at-a-time with explicit handoff (recommended) vs keep free-for-all and rely on social convention (zero work, scrambles under real concurrency).
3. **How far to take presence:** connected-list only (cheap) → typing indicators → full live cursors/avatars (sshx/Warp-grade).
4. **Snapshot fidelity vs cost:** how much scrollback to include in `serialize()` (`scrollback: N`), and accept the combined-character `TODO` limitation or pre-empt it.
5. **Native attach:** is a tmux-style `shooter attach <id>` in scope, or browsers/iOS only?
6. **Recording/audit:** wanted as a differentiator, or out of scope?

---

## 8. Recommended first move

Phases 0–1 deliver ~80% of the felt improvement (correct late-join for everyone, including mid-TUI joins, and an end to silent divergence) and are self-contained. Recommend scoping a spec for **Phase 0 + Phase 1** first, validating with vim/htop/an agent TUI across two simultaneous browsers + a view-only guest, then iterating into Phases 2–3.

---

## Appendix A — Current-state file map

- `src/lib/modules/server/terminal/pty-manager.ts` — attach/broadcast/scrollback/resize/reconnect; constants `MAX_OUTPUT_BUFFER_BYTES=1MB`, `MAX_SCROLLBACK_BYTES=512KB`, `SCROLLBACK_CHUNK_SIZE=50KB`.
- `src/lib/modules/server/terminal/pty-holder.cjs` — holder PTY owner; ring `MAX_SCROLLBACK_LINES=5000`; exit sidecar; `GRACE_PERIOD_MS=60000`.
- `src/lib/modules/server/terminal/holder-client.ts` — Unix-socket ndjson client; `HANDSHAKE_TIMEOUT_MS=10000`.
- `src/lib/modules/server/ws/terminal-handler.ts` — raw plane: attach, input, resize broadcast, read-only gate.
- `src/lib/modules/server/ws/session-handler.ts` — structured plane (JSONL), subscribe/unsubscribe.
- `src/lib/modules/client/terminal/xterm-wrapper.ts` — client reconnect backoff, render, resize observer.
- `src/lib/modules/server/ws/{server.ts,ticket-store.ts,guest-registry.ts,events-handler.ts}` — routing, scoped tickets, guest revocation, events bus.
- `src/lib/modules/server/terminal/{share-store.ts,share-auth.ts}` — share config + access resolution.

## Appendix B — Sources

**Multiplexers / state-sync algorithms:** [tmux grid.c](https://github.com/tmux/tmux/blob/master/grid.c) · [tmux screen-redraw.c](https://github.com/tmux/tmux/blob/master/screen-redraw.c) · [tmux window-size](https://tmuxai.dev/tmux-window-size/) · [GNU Screen manual](https://web.mit.edu/gnu/doc/html/screen_10.html) · [mosh paper (USENIX ATC 2012)](https://mosh.org/mosh-paper.pdf) · [mosh.org](https://mosh.org/) · [mosh diff algorithm (#817)](https://github.com/mobile-shell/mosh/issues/817)

**xterm.js server-side state:** [xterm.js README (headless+serialize use case)](https://github.com/xtermjs/xterm.js/blob/master/README.md) · [@xterm/headless](https://www.npmjs.com/package/@xterm/headless) · [@xterm/addon-serialize](https://www.npmjs.com/package/@xterm/addon-serialize) · [SerializeAddon source](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-serialize/src/SerializeAddon.ts) · [asciinema ALiS protocol](https://docs.asciinema.org/manual/server/streaming/) · [Cloudflare Sandbox terminal](https://developers.cloudflare.com/sandbox/concepts/terminal)

**Collaborative / web terminals & UX:** [sshx (ekzhang/sshx)](https://github.com/ekzhang/sshx) · [sshx --enable-readers](https://containerlab.dev/manual/share-access/) · [GoTTY](https://github.com/sorenisanerd/gotty) · [ttyd](https://tsl0922.github.io/ttyd/) · [Wetty](https://github.com/butlerx/wetty) · [VS Code Live Share — share terminal](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/share-server-visual-studio-code) · [Live Share security](https://learn.microsoft.com/en-us/visualstudio/liveshare/reference/security) · [tmate](https://tmate.io/) · [upterm](https://upterm.dev/) · [Warp session sharing](https://docs.warp.dev/knowledge-and-collaboration/session-sharing/) · [Cloudflare collaborative terminal example](https://cloudflare-sandbox-sdk.mintlify.app/examples/collaborative-terminal)
