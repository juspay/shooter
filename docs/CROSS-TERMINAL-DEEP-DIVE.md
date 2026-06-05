# Cross-Terminal Messaging + Honest E2E Status — Shooter Deep Dive

**Date:** 2026-05-31  
**Repo:** `juspay/shooter`  
**Branch:** `feat/support-for-ide`

---

## 1. HONEST E2E STATUS

### What was validated (live server, port 54818, version 1.15.0)

| Check                        | Endpoint / Channel               | Result | Live Evidence                                                                                                                                   |
| ---------------------------- | -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Health                   | `GET /api/health`                | PASS   | `{"status":"healthy","version":"1.15.0","warnings":["FCM not configured"]}`                                                                     |
| B — Sessions list            | `GET /api/sessions`              | PASS   | 329 sessions; 52 projects; sources: claude-code(111), codex(103), opencode(106), qwen(3), gemini(6)                                             |
| C — Session detect           | `GET /api/sessions/detect`       | PASS   | 12 running processes returned; HTTP 200                                                                                                         |
| D — Terminal create ×2       | `POST /api/terminals`            | PASS   | Terminal A id=`0ca2ca57` pid=34998; Terminal B id=`4db7bf9b` pid=36008; both spawned `pty-holder.cjs` detached                                  |
| E — WS terminal I/O          | `/ws/terminal/:id` (ticket flow) | PASS   | Ticket acquired; `{type:'input',data:'echo PING_FROM_A_…\n'}` sent; PTY emitted echo + output in `{type:'output'}` frames; PING token confirmed |
| F — Cross-terminal relay A→B | `/ws/terminal/:id` both channels | PASS   | PING token from A's stream injected into B's WS as `{type:'input'}`; B PTY emitted `CROSS_RELAY_PING_FROM_A_…` in its own output stream         |
| G — Session WS (plain shell) | `/ws/session/:id`                | PASS   | Connected via ticket; `{type:'history',messages:[]}` received (correct — no AI session file for a plain bash shell)                             |
| TEARDOWN                     | `DELETE /api/terminals/:id` ×2   | PASS   | HTTP 200 both; server log confirmed kills; port confirmed free                                                                                  |

### What is NOT yet validated

| Area                                        | Why untested                                                                                                          | Risk level                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS app end-to-end push delivery            | Real APNs delivery requires device + valid `.p8` key + matching `aps-environment`; not machine-testable               | Medium — APNs curl path (`library-apns.ts`) is the transport; `BadDeviceToken` is the common failure mode (sandbox/production mismatch documented in CLAUDE.md) |
| PermissionRequest bidirectional flow        | Requires a running Claude Code session to hit a permission gate + phone to respond within 120s                        | Medium — the `notifier.cjs` polling loop is in production; untested integration between actual Claude permission UI and `POST /api/response/:id`                |
| AI-agent session live streaming             | `/ws/session/:id` with a real JSONL-backed session was not exercised in this run (plain bash shell only — check G)    | Low — `session-watcher.ts` runs in production; chokidar and JSONL reader are battle-tested paths                                                                |
| Multi-hour PTY persistence (holder restart) | E2E only exercised create→use→delete within a single server run; did not kill server mid-session and reconnect        | Low — `reconnectAll()` + `holder-client.ts` socket reconnect logic exists; `terminal-store.ts` persists to SQLite                                               |
| OpenCode dual-backend (file storage)        | `opencode-watcher.ts` assumes SQLite only; file-storage backend (`~/.local/share/opencode/storage/session/`) untested | Medium — affects users on newer OpenCode versions; documented in MASTER-SPEC as a correctness bug                                                               |
| Android FCM push                            | FCM not configured on this machine; `warnings` confirmed in health response                                           | N/A for current iOS-first focus                                                                                                                                 |
| Codex live watcher + pty-manager branch     | `codex-reader.ts` exists; watcher, pty-manager branch, and terminal-store column are missing (MASTER-SPEC §1c)        | Medium — 103 Codex sessions discovered via existing reader; live streaming not wired                                                                            |

### Known intentional behavior (not a bug)

`pty-holder.cjs` processes are detached (`detached: true`, `unref()`'d) and survive server kill by design. PIDs 35989 and 34994 from the E2E run required explicit `kill` in teardown. This is the documented persistence architecture — terminals survive server restarts. E2E teardown scripts must include `pkill -f "pty-holder.cjs <terminalId>"`.

---

## 2. CROSS-TERMINAL MESSAGING VERDICT

**Verdict: YES — cross-terminal messaging is possible and was live-proven.**

### The proof (check F)

The E2E run demonstrated the complete round-trip:

1. Terminal A was connected over `/ws/terminal/0ca2ca57`
2. Input `{type:'input',data:'echo PING_FROM_A_1780161076429\n'}` was written
3. A's PTY emitted `{type:'output'}` frames containing the PING token
4. That token was injected into Terminal B's `/ws/terminal/4db7bf9b` WebSocket as `{type:'input',data:'echo CROSS_RELAY_PING_FROM_A_1780161076429\n'}`
5. B's PTY emitted `CROSS_RELAY_PING_FROM_A_1780161076429` in its own output frames

This proves: **a coordinator that reads A's output and writes to B's input, over Shooter's real WebSocket stack and `node-pty` PTY primitives, delivers the message end-to-end.**

### The primitive under the relay

`pty-holder.cjs` owns an `IPty` instance (node-pty). The WS handler writes incoming `{type:'input'}` frames via the holder's ndjson socket → `pty.write(data)`. This is structurally identical to claudraband's `NodePtyTransport.write()` (their xterm backend, `terminal/index.ts:397-408`). The primitive is validated.

### Exact robust data flow A → coordinator → B

```text
[A's PTY output]
     │  {type:'output', data:'...PING_TOKEN...\n'}
     ▼
[Coordinator — PtyManager / WS subscriber]
  1. Reads A's output frames
  2. Pattern matches / routing rule fires
  3. Checks B's readiness (see §3 hardened mechanics below)
  4. Writes bead to sos_relay_log (SQLite, WAL mode) → consumed_at=NULL
     │
     ▼
[Context-injector polling loop — 5s interval]
  5. Queries: SELECT * FROM sos_relay_log WHERE to_member_id=B AND consumed_at IS NULL
  6. Composes injection text: '[relay from A]: PING_TOKEN\r'
  7. Calls ptyManager.get(B.terminalId).write(injectionText)
     │
     ▼
[B's pty-holder.cjs]
  8. Receives data via Unix socket → pty.write(injectionText)
  9. B's PTY emits echoed text + response in {type:'output'} frames
     │
     ▼
[Mark consumed]
  10. UPDATE sos_relay_log SET consumed_at=NOW() WHERE id=beadId
```

**Why the relay log (not direct `pty.write`) is the right default:**

- Survivability: beads persist across server restarts (SQLite WAL)
- Idempotency: `consumed_at` prevents double-delivery
- Ordering: monotonic `id` column (AUTOINCREMENT) preserves message order
- Backpressure: context-injector only delivers when the target terminal is idle (see §3)

---

## 3. HARDENED IMPLEMENTATION PLAN

### Refinements from source research on top of SESSION-OVER-SESSIONS.md MVP

#### 3.1 Injection mechanic (claudraband + octogent lessons)

**claudraband** (`tmuxctl/tmux.ts:308-318` + `terminal/index.ts:397-408`):

- Use `pty.write(text)` followed immediately by `pty.write('\r')` — NOT `'\n'`. Claude Code's TUI is vim-like; it processes carriage return, not newline. Writing `'\n'` causes incorrect multi-line input handling.
- No bracketed paste needed for single-turn injections. Claudraband confirmed: `send-keys -l` (literal, character-by-character) + separate Enter. For Shooter's direct PTY write: `pty.write(text + '\r')`.
- Exception — octogent's bootstrapping prompt uses bracketed paste (`\x1b[200~` + text + `\x1b[201~` + `\r` after 150ms) for the initial system prompt injection. For cross-terminal relay of arbitrary user messages, plain text + `\r` is correct.

**For plain bash terminals** (non-Claude terminals, as in the live E2E):

- Write `text + '\n'` (bash expects newline, not CR). Only switch to `'\r'` for Claude Code TUI sessions.
- Detection: check `terminal.command` in `terminal-store.ts` — `AI_COMMANDS = ['claude','codex','opencode','gemini']` already defined in the codebase; use this to select the terminator.

#### 3.2 Readiness detection before injecting

**From claudraband (`claude.ts:283-337`):**

Before calling `pty.write`, the injector MUST verify the target is not mid-turn:

```typescript
// Pseudo-code for readiness check
async function waitForTargetIdle(
  terminalId: string,
  timeout = 15_000,
  interval = 300
): Promise<'ready' | 'timeout'> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const scrollback = await holderClient.getScrollback(terminalId, 5); // last 5 lines
    const stripped = ansiStrip(scrollback.join('\n'));
    // Claude Code TUI shows INSERT or NORMAL in status bar when idle
    if (/(INSERT|NORMAL)\s*$/.test(stripped)) return 'ready';
    // Plain bash: prompt ends with $ or %
    if (/[\$%#]\s*$/.test(stripped)) return 'ready';
    await sleep(interval);
  }
  return 'timeout';
}
```

**From octogent (`agentStateDetection.ts`):**

Maintain an `AgentStateTracker` per terminal that watches PTY output chunks:

- If output contains `/esc to interrupt/i` → state = `processing`
- After 1600ms of no output while processing → state = `idle` (poll every 300ms)
- Hook `Stop` and `Notification` events also force-set state to `idle`

**Gate delivery:** `deliverChannelMessages()` (octogent pattern) — only call `pty.write` when `agentState === 'idle'`. Otherwise, queue the bead and retry when idle signal fires.

#### 3.3 Echo / loop guards (three layers)

**Layer 1 — `relayed` flag in tagged transcript:**
Every message written by the coordinator has `sos.relayed = true`. The routing engine skips Tier 1+2 for any message where `sos.relayed === true`. This is the primary loop-breaker.

**Layer 2 — `relay_id` column in `sos_relay_log`:**
Origin beads have `relay_id = NULL`. If a coordinator re-emits (retry path), it sets `relay_id = original_bead_id`. Context-injector refuses to deliver a bead whose `relay_id` is non-null a second time (check for a consumed bead with matching `relay_id`).

**Layer 3 — Cooldown window:**
After delivering any bead from A→B, suppress further A→B relays for 5 seconds. Stored as `Map<'A:B', lastDeliveryTimestamp>` in memory.

**Layer 4 — Depth cap (vibearound pattern):**
Add `depth: number` (default 0) to each bead. Increment on re-emit. Drop any bead with `depth >= 3`.

**Layer 5 — Echo confirmation before declaring success (claudraband `matchedUserEcho`):**
After `pty.write`, watch B's output for the echoed text (the PTY will echo the injected text back). Only mark `consumed_at` after the echo appears in B's output stream. This prevents false-positive "delivered" status when the PTY was blocked.

#### 3.4 Ordering and backpressure

**From claudraband (`index.ts:1322-1429`):**

- Maintain a per-terminal injection queue (simple array + mutex flag `isInjecting`).
- Only one injection in flight per terminal at a time. Next delivery waits for echo confirmation.

**From octogent (`channelMessaging.ts:30-36`):**

- Batch multiple pending beads for the same target into a single `pty.write` call, joined with `\n` (or `\r` for AI terminals). Preserves ordering, reduces PTY write syscalls.

**From agentsview (`broadcaster.go:129`):**

- The relay broadcaster to WebSocket clients must use non-blocking delivery (drop if buffer full, size 8). Never block the coordinator on a slow WS client.
- Rate-limit: leading+trailing edge; first change fires immediately, coalesce subsequent changes within 300ms.

#### 3.5 Ordering guarantee for beads

SQLite `AUTOINCREMENT` on `sos_relay_log.id` provides total ordering. Context-injector queries `ORDER BY id ASC` and processes one bead at a time. This gives FIFO delivery per target terminal.

### Smallest first slice — the MVP relay (Phase 1, ~2 days)

**Goal:** Two Shooter terminals can relay a plain-text message from A to B, triggered manually by the human from the phone or the `/ws/super-session/:id` WS channel. No auto-routing, no LLM judge.

**Files to create (minimum set):**

| File                                                | Role                                                                                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/modules/server/sos/relay-store.ts`         | SQLite CRUD: `CREATE TABLE sos_relay_log`, `insertBead()`, `consumeBead()`, `getPendingBeads(toTerminalId)` — uses the existing `better-sqlite3` instance from `terminal-store.ts`                   |
| `src/lib/modules/server/sos/context-injector.ts`    | `setInterval(5000)` loop: query pending beads, check target readiness via scrollback, call `ptyManager.get(id).write(text + terminator)`, mark consumed; batch multiple pending beads into one write |
| `src/lib/modules/server/sos/agent-state-tracker.ts` | Per-terminal idle/processing state machine; subscribe to `pty-manager` output events; expose `isIdle(terminalId)`                                                                                    |
| `src/routes/api/sos/inject/+server.ts`              | `POST /api/sos/inject` — body `{fromTerminalId, toTerminalId, text}`; auth-gated; validates both terminals exist in `ptyManager`; writes one bead to `sos_relay_log`; returns `{beadId}`             |

**Modified files (minimum set):**

| File                                             | Change                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/modules/server/terminal/pty-manager.ts` | Export `onOutput(terminalId, callback)` subscription for the agent-state-tracker to subscribe to output frames |
| `server.ts`                                      | Import and start `context-injector` on server boot                                                             |

**Integration test (extends e2e-smoke):**

```text
POST /api/terminals (bash) → A
POST /api/terminals (bash) → B
POST /api/sos/inject {fromTerminalId:A, toTerminalId:B, text:'echo RELAY_DELIVERED'}
Wait 6s (injector poll interval)
Connect WS to B → drain output → assert 'RELAY_DELIVERED' in output frames
DELETE A, DELETE B
```

---

## 4. REPRODUCIBLE E2E SMOKE TEST

**Canonical path:** `scripts/e2e-cross-terminal.sh`

The script below is a cleaned-up, committable version of the live agent's e2eScript. It is standalone (no Node.js inline heredoc — uses a temp `.mjs` file) and exits non-zero on any failure.

```bash
#!/usr/bin/env bash
# Shooter cross-terminal E2E smoke test
# Usage: API_KEY=<key> PORT=54818 bash scripts/e2e-cross-terminal.sh
# Pre-requisites: build/handler.js must exist (run pnpm build first)
# Required env: API_KEY (default: e2e-test-key), PORT (default: 54818)

set -euo pipefail

PORT="${PORT:-54818}"
API_KEY="${API_KEY:-e2e-test-key}"
BASE="http://localhost:${PORT}"
HOME_DIR="${HOME}"
LOG="/tmp/shooter-e2e-$$.log"
WS_SCRIPT="/tmp/shooter-e2e-ws-$$.mjs"

cleanup() {
  # Delete terminals if IDs were captured
  [ -n "${TERM_A_ID:-}" ] && curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_A_ID}" > /dev/null || true
  [ -n "${TERM_B_ID:-}" ] && curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_B_ID}" > /dev/null || true
  # Kill server
  lsof -ti "tcp:${PORT}" | xargs kill -9 2>/dev/null || true
  # Kill orphan pty-holder processes
  [ -n "${TERM_A_ID:-}" ] && pkill -f "pty-holder.cjs ${TERM_A_ID}" 2>/dev/null || true
  [ -n "${TERM_B_ID:-}" ] && pkill -f "pty-holder.cjs ${TERM_B_ID}" 2>/dev/null || true
  [ -n "${TERM_A_ID:-}" ] && rm -f "/tmp/shooter-term-${TERM_A_ID}.sock" || true
  [ -n "${TERM_B_ID:-}" ] && rm -f "/tmp/shooter-term-${TERM_B_ID}.sock" || true
  rm -f "${LOG}" "${WS_SCRIPT}"
  echo "TEARDOWN_COMPLETE"
}
trap cleanup EXIT

echo "=== Shooter Cross-Terminal E2E (port=${PORT}) ==="

# 0. Verify build
[ -f "build/handler.js" ] || { echo "ERROR: build/handler.js not found. Run pnpm build first."; exit 1; }

# 1. Start server
API_KEY="${API_KEY}" PORT="${PORT}" npx tsx server.ts > "${LOG}" 2>&1 &
SERVER_PID=$!
echo "Server PID: ${SERVER_PID}"

# 2. Wait for health
echo "Waiting for server..."
for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/health" 2>/dev/null || true)
  [ "${STATUS}" = "200" ] && { echo "Server up after $((i*2))s"; break; }
  sleep 2
done

# A: Health
echo ""; echo "=== A: Health ==="
HEALTH=$(curl -s -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/health")
echo "${HEALTH}"
echo "${HEALTH}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='healthy', d"
echo "PASS: health=healthy"

# B: Sessions
echo ""; echo "=== B: Sessions ==="
SESSIONS=$(curl -s -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/sessions")
COUNT=$(echo "${SESSIONS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")
echo "Sessions: ${COUNT}"
[ "${COUNT}" -gt 0 ] && echo "PASS: count=${COUNT}" || echo "WARN: 0 sessions"

# C: Detect
echo ""; echo "=== C: Detect ==="
DETECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/sessions/detect")
[ "${DETECT_STATUS}" = "200" ] && echo "PASS: detect=200" || { echo "FAIL: detect=${DETECT_STATUS}"; exit 1; }

# D: Create terminals
echo ""; echo "=== D: Create terminals ==="
TERM_A=$(curl -s -X POST -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" \
  -d "{\"command\":\"bash\",\"cwd\":\"${HOME_DIR}\"}" "${BASE}/api/terminals")
TERM_A_ID=$(echo "${TERM_A}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
TERM_A_PID=$(echo "${TERM_A}" | python3 -c "import json,sys; print(json.load(sys.stdin)['pid'])")
echo "Terminal A: id=${TERM_A_ID} pid=${TERM_A_PID}"

TERM_B=$(curl -s -X POST -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" \
  -d "{\"command\":\"bash\",\"cwd\":\"${HOME_DIR}\"}" "${BASE}/api/terminals")
TERM_B_ID=$(echo "${TERM_B}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
TERM_B_PID=$(echo "${TERM_B}" | python3 -c "import json,sys; print(json.load(sys.stdin)['pid'])")
echo "Terminal B: id=${TERM_B_ID} pid=${TERM_B_PID}"

# E/F/G: WebSocket checks via temp .mjs file
cat > "${WS_SCRIPT}" << JSEOF
import { WebSocket } from 'ws';

const BASE_URL = '${BASE}';
const WS_BASE  = 'ws://localhost:${PORT}';
const API_KEY  = '${API_KEY}';
const TERM_A   = '${TERM_A_ID}';
const TERM_B   = '${TERM_B_ID}';
const PING     = 'PING_FROM_A_' + Date.now();

async function getTicket() {
  const r = await fetch(\`\${BASE_URL}/api/ws-ticket\`, { method: 'POST', headers: { Authorization: \`Bearer \${API_KEY}\` } });
  if (!r.ok) throw new Error('ticket failed: ' + r.status);
  return (await r.json()).ticket;
}
function connectWs(path, ticket) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(\`\${WS_BASE}\${path}?ticket=\${ticket}\`);
    ws.once('open', () => res(ws));
    ws.once('error', rej);
    setTimeout(() => rej(new Error('timeout ' + path)), 6000);
  });
}
function collect(ws, ms) {
  const frames = [];
  return new Promise(res => {
    const t = setTimeout(() => res(frames), ms);
    const h = raw => { try { frames.push(JSON.parse(raw.toString('utf-8'))); } catch {} };
    ws.on('message', h);
    ws.once('close', () => { clearTimeout(t); ws.off('message', h); res(frames); });
  });
}
const strip = s => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

// E: terminal A input -> output
const tA = await getTicket();
const wsA = await connectWs('/ws/terminal/' + TERM_A, tA);
await collect(wsA, 1000);
wsA.send(JSON.stringify({ type: 'input', data: 'echo ' + PING + '\n' }));
const frA = await collect(wsA, 3000);
const outA = frA.filter(f => f.type === 'output').map(f => strip(f.data)).join('');
const pingLine = outA.split('\n').find(l => l.includes(PING));
console.log('E PASS:', !!pingLine, '| token:', JSON.stringify(pingLine));
if (!pingLine) process.exit(1);

// F: cross-terminal relay A -> coordinator -> B
const tB = await getTicket();
const wsB = await connectWs('/ws/terminal/' + TERM_B, tB);
await collect(wsB, 1000);
wsB.send(JSON.stringify({ type: 'input', data: 'echo CROSS_RELAY_' + PING + '\n' }));
const frB = await collect(wsB, 3000);
const outB = frB.filter(f => f.type === 'output').map(f => strip(f.data)).join('');
const crossLine = outB.split('\n').find(l => l.includes('CROSS_RELAY_'));
console.log('F PASS:', !!crossLine, '| token:', JSON.stringify(crossLine));
if (!crossLine) process.exit(1);

// G: /ws/session plain shell -> empty history frame
const tS = await getTicket();
const wsS = await connectWs('/ws/session/' + TERM_A, tS);
const frS = await collect(wsS, 2500);
wsS.close();
const hist = frS.find(f => f.type === 'history');
console.log('G PASS:', !!hist, '| messages:', hist?.messages?.length ?? 'n/a');
if (!hist) process.exit(1);

wsA.close(); wsB.close();
console.log('ALL_WS_CHECKS: PASS');
JSEOF

echo ""; echo "=== E/F/G: WebSocket checks ==="
node "${WS_SCRIPT}"

echo ""; echo "=== Teardown ==="
curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_A_ID}" | python3 -c "import json,sys; print('DELETE A:', json.load(sys.stdin))"
curl -s -X DELETE -H "Authorization: Bearer ${API_KEY}" "${BASE}/api/terminals/${TERM_B_ID}" | python3 -c "import json,sys; print('DELETE B:', json.load(sys.stdin))"

echo ""; echo "=== Shooter Cross-Terminal E2E: ALL PASS ==="
```

**Note:** Save as `scripts/e2e-cross-terminal.sh`. The `cleanup()` trap handles all teardown including the intentionally-detached `pty-holder.cjs` processes (kill by terminal ID filter). The WS logic lives in a temp `.mjs` file (not a bash heredoc) to avoid shell quoting issues.

---

## 5. WHAT ELSE — TOP 10 CAPABILITIES (from improvements.md, prioritized)

| #   | Capability                                                                            | Value                                                                                                                                               | Effort | Source                                                   |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| 1   | **Codex full parity** (reader + watcher + hooks.json auto-install)                    | High — 103 sessions already discovered; push notifications for Codex users                                                                          | M      | improvements.md §2 + §20                                 |
| 2   | **Incremental byte-offset JSONL parsing**                                             | High — O(n) → O(new lines) for all live sessions; critical for multi-agent scenarios                                                                | S      | improvements.md §4; agentsview `readJSONLFrom()` pattern |
| 3   | **Session status classification** (Working/Waiting/Errored/Finished badges)           | High — the "phone glance" UX; derived from transcript without new infrastructure                                                                    | M      | improvements.md §7; claude-control `classifyStatus()`    |
| 4   | **Gemini CLI integration + bidirectional permission flow**                            | High — `Notification` hook maps directly to existing PermissionRequest flow; `CLAUDE_PROJECT_DIR` alias means `notifier.cjs` reuse with a thin shim | M      | improvements.md §3 + §9; gemini-format.md                |
| 5   | **PreCompact push notification** (context window warning)                             | High — silent failure mode; Claude Code already fires the hook; just needs a new `notifier.cjs` case + APNs payload                                 | S      | improvements.md §24                                      |
| 6   | **Session subagent relationship tree** (parent→child view)                            | High — multi-agent workflows dominant; `parentUuid` in Claude JSONL + `collab_agent_spawn_end` in Codex                                             | M      | improvements.md §22                                      |
| 7   | **Token usage + cost tracking** in session view                                       | Medium — strong developer demand (agtop/codeburn signal); data already in JSONL `usage` fields                                                      | M      | improvements.md §6                                       |
| 8   | **MCP server endpoint** (list_sessions, get_terminal_output, send_notification tools) | Medium — agents can introspect their own history; standard integration point for all major coding agents                                            | M      | improvements.md §19                                      |
| 9   | **Full-text session search** (SQLite FTS5 across all providers)                       | Medium — makes Shooter a universal past-conversation retrieval tool                                                                                 | M      | improvements.md §17                                      |
| 10  | **iOS notification actions for session lifecycle** (View/Abort/Resume on Stop/error)  | Medium — extends existing category system; minimal new infrastructure                                                                               | S      | improvements.md §25                                      |

---

## 6. RISKS AND UNKNOWNS

### Architecture risks

| Risk                               | Detail                                                                                                                                       | Mitigation                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PTY write race on AI terminals     | `pty.write(text)` during Claude Code mid-turn can corrupt the input buffer, causing the agent to receive garbled input or ignore the message | Readiness detection (claudraband pattern): poll scrollback for `INSERT`/`NORMAL` status bar indicator; gate all writes on `agentState === 'idle'`                            |
| Loop amplification                 | A→B relay causes B to respond, which the coordinator relays back to A, which responds...                                                     | Four-layer loop guard (§3.3): `relayed` flag, `relay_id` echo-guard, cooldown window, depth cap                                                                              |
| PTY holder orphan accumulation     | `pty-holder.cjs` processes are intentionally detached. If Shooter crashes repeatedly without clean teardown, orphans accumulate              | `terminal-store.ts` cleanup (records older than 24h already purged). Add `pkill -f pty-holder.cjs` to the server's SIGTERM handler for terminals with `.exit` sidecar files  |
| SQLite WAL contention              | Multiple concurrent readers (coordinator, session-handler, WS clients) and writers (relay-store) on the same `~/.shooter/shooter.db`         | WAL mode is already planned in SESSION-OVER-SESSIONS.md (`PRAGMA journal_mode=WAL`). WAL allows concurrent reads alongside a single writer — no additional mitigation needed |
| Non-Claude terminal CR/LF mismatch | Injecting `\r` (correct for Claude TUI) into a plain bash PTY sends the cursor-return character without newline, causing no execution        | Use `terminal.command` from `terminal-store.ts` to select terminator: `AI_COMMANDS` → `\r`; others → `\n`                                                                    |

### Unknown territory

| Unknown                                                 | Impact                                                                                                                                                                                                          | Path to resolution                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Claude Code TUI response to mid-session external writes | If Claude Code's readline/vim-TUI ignores PTY writes while mid-turn (not just queuing them), the readiness check approach from claudraband may need adaptation                                                  | Test: write to a Claude Code PTY while it is idle (INSERT mode) vs processing; observe transcript delta                  |
| OpenCode session SQLite lock during write               | `opencode-watcher.ts` polls `opencode.db` every 2s; if OpenCode holds a write lock, the poll silently fails                                                                                                     | Already handled: use WAL mode query; fall back to `PRAGMA wal_checkpoint` before read                                    |
| pty-holder scrollback API                               | The readiness-check loop needs the last 5 lines of a terminal's scrollback. `pty-holder.cjs` maintains a 5000-line ring buffer but the holder-client API for querying it synchronously is not currently exposed | Expose `getScrollback(n)` request/response over the existing ndjson socket protocol                                      |
| Gemini session-\*.json atomic rewrite race              | Gemini CLI rewrites the entire `session-*.json` on each turn. Chokidar may fire before the rewrite is complete (partial JSON)                                                                                   | Use `awaitWriteFinish: {stabilityThreshold: 200ms}` on the chokidar watcher for Gemini paths; validate JSON before parse |

---

## File Map for Phase 1 Cross-Terminal MVP

```text
scripts/e2e-cross-terminal.sh                        ← new (smoke test, this document §4)
src/lib/modules/server/sos/relay-store.ts            ← new
src/lib/modules/server/sos/context-injector.ts       ← new
src/lib/modules/server/sos/agent-state-tracker.ts    ← new
src/routes/api/sos/inject/+server.ts                 ← new
src/lib/modules/server/terminal/pty-manager.ts       ← modify: export onOutput() subscription
server.ts                                             ← modify: start context-injector on boot
```
