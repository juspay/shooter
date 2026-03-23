# Terminal Persistence via PTY Holder Processes + SQLite

> **Date:** 2026-03-21
> **Status:** Approved
> **Scope:** Server-side terminal management — persistence across server restarts

---

## Problem

`PtyManager` is 100% in-memory. All terminal state lives in a `Map<string, ManagedTerminal>`. When the server restarts:

1. **PTY processes die** — they're child processes of the Node.js server (spawned via `node-pty`). Parent dies → children get SIGHUP → they terminate.
2. **All metadata is lost** — the mapping of terminal ID → session file path / OpenCode session ID, scrollback, command, cwd — gone. Even though underlying session data persists on disk (JSONL files for Claude Code, SQLite for OpenCode), the server no longer knows which sessions it was tracking.

This means every server restart kills all running terminals and loses their context.

## Solution

Two complementary pieces:

1. **PTY Holder Processes** — Move PTY ownership out of the server into small detached child processes. Each holder owns one PTY master fd and communicates with the server over a Unix domain socket. The holder survives server restarts because it is a detached, unreferenced process.

2. **SQLite Terminal Store** — Persist terminal metadata (id, command, cwd, socket path, session file, holder PID, status) to a local SQLite database. On startup, the server reads this table and reconnects to any holders that are still alive.

### Reference Pattern

This follows the same principle as OpenCode's session management: **the database is the source of truth, not memory.** Runtime state is always reconstructable from persisted state + live process discovery.

---

## Architecture

```
Server (restartable)                     Holder (long-lived, detached)
┌──────────────────────┐                 ┌─────────────────────────────┐
│  PtyManager          │                 │  pty-holder.cjs             │
│   ├─ HolderClient ◄──── Unix Socket ───►  node-pty (master fd)     │
│   ├─ TerminalStore   │                 │  Scrollback buffer         │
│   │   (SQLite)       │                 │  /tmp/shooter-term-{id}.sock│
│   └─ WS Clients      │                 └──────────┬──────────────────┘
│                      │                              │ PTY
│  terminal-handler.ts │                 ┌────────────▼──────────────────┐
│  session-handler.ts  │                 │  claude / opencode / shell    │
│  (minor updates)     │                 └───────────────────────────────┘
└──────────────────────┘
```

### Data Flow: Normal Operation

1. `POST /api/terminals` → `PtyManager.create()`
2. PtyManager forks `pty-holder.cjs` as a detached process
3. Holder spawns PTY, listens on Unix socket, signals ready
4. PtyManager connects via `HolderClient`, inserts record into SQLite
5. Holder forwards PTY output → HolderClient → PtyManager → WS clients
6. WS client input → PtyManager → HolderClient → Holder → PTY

### Data Flow: Server Restart

1. Server starts, calls `ptyManager.reconnectAll()`
2. Reads SQLite: all terminals with `status = 'running'`
3. For each, attempts to connect to its Unix socket path
4. **Connected:** Holder sends `info` + scrollback replay → terminal re-added to in-memory Map → session watchers re-attached
5. **Connection failed:** Check if holder PID is alive (`process.kill(holder_pid, 0)`)
6. **PID dead:** Mark terminal as `orphaned` in SQLite. Session data (JSONL/SQLite) is still on disk and browsable.

### Data Flow: Server Graceful Shutdown

1. `SIGTERM` / `SIGINT` received
2. PtyManager disconnects from all holder sockets (does NOT kill holders)
3. Holders continue running independently
4. WS server and HTTP server close normally

---

## Type System Changes

Following the type-crafter workflow (GUIDANCE.md): define in YAML → `pnpm run types:validate` → `pnpm run types:generate` → import from `$lib/types`.

### Updates to `specs/types/terminal.yaml`

**1. Update `ManagedTerminalInfo.status` enum** — add `orphaned`:
```yaml
status:
  type: string
  enum:
    - running
    - exited
    - orphaned
  description: Current lifecycle status of the terminal
```

**2. Add `holderPid` and `socketPath` fields** to `ManagedTerminalInfo` (nullable, for API responses):
```yaml
holderPid:
  type: number
  nullable: true
  description: PID of the PTY holder process, or null if not using holder architecture
socketPath:
  type: string
  nullable: true
  description: Unix domain socket path for the holder process, or null if not applicable
```

**3. Add `TerminalRecord`** — the SQLite row type used by `terminal-store.ts`:
```yaml
TerminalRecord:
  type: object
  description: Persisted terminal metadata stored in SQLite for recovery across server restarts
  required:
    - id
    - command
    - args
    - cwd
    - cols
    - rows
    - status
    - createdAt
  properties:
    id:
      type: string
      description: Unique terminal identifier
    command:
      type: string
    args:
      type: string
      description: JSON-encoded array of command arguments
    cwd:
      type: string
    cols:
      type: number
    rows:
      type: number
    pid:
      type: number
      nullable: true
      description: PTY child process ID
    holderPid:
      type: number
      nullable: true
      description: Holder process ID
    socketPath:
      type: string
      nullable: true
    sessionFile:
      type: string
      nullable: true
      description: Claude Code JSONL session file path
    opencodeSessionId:
      type: string
      nullable: true
      description: OpenCode SQLite session ID
    status:
      type: string
      enum:
        - running
        - exited
        - orphaned
    exitCode:
      type: number
      nullable: true
    createdAt:
      type: string
      description: ISO 8601 timestamp
    exitedAt:
      type: string
      nullable: true
      description: ISO 8601 timestamp
```

**4. Add holder protocol types** — for `pty-holder.cjs` ↔ `holder-client.ts` communication:
```yaml
# ── Holder Protocol Types ────────────────────────────────────────

HolderServerMessage:
  description: Messages sent from server to PTY holder over Unix socket (ndjson)
  oneOf:
    - type: object
      description: Write data to PTY stdin
      required:
        - type
        - data
      properties:
        type:
          type: string
          const: input
        data:
          type: string
    - type: object
      description: Resize the PTY
      required:
        - type
        - cols
        - rows
      properties:
        type:
          type: string
          const: resize
        cols:
          type: number
        rows:
          type: number
    - type: object
      description: Send a signal to the PTY process
      required:
        - type
      properties:
        type:
          type: string
          const: kill
        signal:
          type: string
          description: Signal name (default SIGTERM)

HolderClientMessage:
  description: Messages sent from PTY holder to server over Unix socket (ndjson)
  oneOf:
    - type: object
      description: Current holder state (sent on connect)
      required:
        - type
        - pid
        - exited
      properties:
        type:
          type: string
          const: info
        pid:
          type: number
        exited:
          type: boolean
        exitCode:
          type: number
          nullable: true
    - type: object
      description: Full scrollback replay (sent on connect)
      required:
        - type
        - data
      properties:
        type:
          type: string
          const: scrollback
        data:
          type: string
    - type: object
      description: PTY output chunk
      required:
        - type
        - data
      properties:
        type:
          type: string
          const: output
        data:
          type: string
    - type: object
      description: PTY process exited
      required:
        - type
        - code
      properties:
        type:
          type: string
          const: exit
        code:
          type: number
          nullable: true
        signal:
          type: string
          nullable: true
```

### Import Patterns

All new modules import generated types via `$lib/types` (per GUIDANCE.md):
```typescript
// terminal-store.ts
import type { TerminalRecord } from '$lib/types';

// holder-client.ts
import type { HolderClientMessage, HolderServerMessage } from '$lib/types';

// pty-manager.ts (updated)
import type { TerminalRecord, ManagedTerminalInfo } from '$lib/types';
```

### Generation Step

After editing `specs/types/terminal.yaml`, run:
```bash
pnpm run types:validate
pnpm run types:generate
```

This must be the **first implementation step** — all new modules depend on the generated types.

---

## New Components

### 1. `src/lib/modules/server/terminal/pty-holder.cjs`

A standalone ~100-line Node.js script. Spawned as a detached child process via `child_process.fork()`.

**Build/distribution:** This file is CommonJS (`.cjs`) and must be available at runtime outside the SvelteKit bundle. It is NOT processed by Vite. A `postbuild` script in `package.json` copies it to `build/pty-holder.cjs`. At runtime, PtyManager resolves it using `import.meta.url` (the project uses ESM — `__dirname` is not available):
```typescript
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const holderScript = path.join(__dirname, 'pty-holder.cjs');
// In dev: src/lib/modules/server/terminal/pty-holder.cjs
// In prod: build/pty-holder.cjs (copied by postbuild)
```
A `SHOOTER_HOLDER_PATH` env var override is supported for custom deployments.

**Lifecycle:**
- Receives config via argv: `id`, `socketPath`, `cwd`, `cols`, `rows`, `command`, `args...`
- Spawns PTY via `node-pty`
- Listens on Unix domain socket at the given path
- Accepts multiple connections (server reconnects)
- On PTY exit: notifies connected clients, writes `.exit` sidecar file, stays alive for 60 seconds (grace period for server reconnect), then cleans up socket and exits

**Protocol (ndjson — newline-delimited JSON over Unix socket):**

Server → Holder:
| Message | Fields | Description |
|---------|--------|-------------|
| `input` | `data: string` | Write to PTY stdin |
| `resize` | `cols: number, rows: number` | Resize PTY |
| `kill` | `signal?: string` | Send signal to PTY process (default: SIGTERM) |

Holder → Server:
| Message | Fields | Description |
|---------|--------|-------------|
| `info` | `pid: number, exited: boolean, exitCode: number\|null` | Sent on connect — current state |
| `scrollback` | `data: string` | Sent on connect — full scrollback replay |
| `output` | `data: string` | PTY output chunk |
| `exit` | `code: number\|null, signal: string\|null` | PTY process exited |

**Scrollback management:**
- Ring buffer capped at 5000 lines (same as current PtyManager constant)
- Full scrollback sent on each new connection for replay
- Scrollback lives in the holder's memory — survives server restart but not holder crash

**Sidecar exit file:**
When the PTY exits and no server is connected, the holder writes `{socketPath}.exit`:
```json
{ "code": 0, "timestamp": 1711036800000 }
```
The server reads this during `reconnectAll()` to detect exits that happened while disconnected. **Cleanup:** The server deletes the `.exit` file immediately after reading it. The holder also deletes the `.exit` file if a server connects before the 60-second grace period expires (the server gets the exit info via the `exit` protocol message instead).

### 2. `src/lib/modules/server/terminal/terminal-store.ts`

SQLite persistence layer using `better-sqlite3` (already a project dependency). Uses the auto-generated `TerminalRecord` type from `$lib/types` (defined in `specs/types/terminal.yaml`).

```typescript
import type { TerminalRecord } from '$lib/types';
```

**Database location:** `~/.shooter/shooter.db`

**Schema:** Maps directly to the `TerminalRecord` type (column names use snake_case, TypeScript uses camelCase):
```sql
CREATE TABLE IF NOT EXISTS terminals (
  id                    TEXT PRIMARY KEY,
  command               TEXT NOT NULL,
  args                  TEXT NOT NULL DEFAULT '[]',
  cwd                   TEXT NOT NULL,
  cols                  INTEGER NOT NULL DEFAULT 80,
  rows                  INTEGER NOT NULL DEFAULT 24,
  pid                   INTEGER,
  holder_pid            INTEGER,
  socket_path           TEXT,
  session_file          TEXT,
  opencode_session_id   TEXT,
  status                TEXT NOT NULL DEFAULT 'running',
  exit_code             INTEGER,
  created_at            TEXT NOT NULL,
  exited_at             TEXT
);
```

**Status values:** `running`, `exited`, `orphaned` (matches `TerminalRecord.status` enum)
- `running` — holder process alive, PTY active
- `exited` — PTY exited normally, holder shut down
- `orphaned` — holder process died (crash or system reboot), session data may still exist on disk

**Public API** (all methods use `TerminalRecord` type):
- `insert(terminal: TerminalRecord): void`
- `update(id: string, fields: Partial<TerminalRecord>): void`
- `get(id: string): TerminalRecord | null`
- `listAll(): TerminalRecord[]`
- `listRunning(): TerminalRecord[]`
- `markOrphaned(id: string): void`
- `markExited(id: string, exitCode: number | null): void`
- `deleteOlderThan(ms: number): number` — cleanup old exited/orphaned records

**Singleton pattern:** Same `globalThis` pattern used by PtyManager, SessionWatcher, and OpenCodeWatcher.

### 3. `src/lib/modules/server/terminal/holder-client.ts`

Client for communicating with a PTY holder process over its Unix domain socket. Uses the auto-generated protocol types:

```typescript
import type { HolderClientMessage, HolderServerMessage } from '$lib/types';
```

**Key design constraint:** Must expose the same duck-typed interface that `terminal-handler.ts` and `session-handler.ts` already expect:

```typescript
// terminal-handler.ts expects:
interface ManagedTerminal {
  pty: {
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    pid: number;
  };
}

// session-handler.ts expects:
interface ManagedTerminal {
  pty: {
    write: (data: string) => void;
    pid: number;
  };
}
```

`HolderClient` satisfies both by exposing `write()`, `resize()`, and `pid` as top-level members. PtyManager wraps it into the `ManagedTerminal.pty` field.

**Public API:**
```typescript
class HolderClient {
  pid: number;
  connected: boolean;

  connect(socketPath: string): Promise<{ pid: number; exited: boolean; exitCode: number | null; scrollback: string }>;
  disconnect(): void;

  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;

  onOutput(cb: (data: string) => void): void;
  onExit(cb: (code: number | null) => void): void;
  onDisconnect(cb: () => void): void;
}
```

**Connection handling:**
- Uses `net.createConnection()` to connect to the Unix socket
- Parses ndjson from the socket (line-buffered)
- On connect: receives `info` message (sets `pid`, checks `exited` state) and `scrollback` message (replay data)
- On unexpected disconnect: invokes `onDisconnect` callback so PtyManager can handle (e.g., mark orphaned)

---

## Modified Components

### 4. `src/lib/modules/server/terminal/pty-manager.ts`

**`ManagedTerminal` type changes:**
```typescript
// Before:
interface ManagedTerminal {
  pty: IPty;
  scrollback: string[];
  scrollbackSize: number;
  // ...
}

// After:
interface ManagedTerminal {
  pty: HolderClient;       // Same interface shape: write(), resize(), pid
  pid: number;             // PTY child PID (kept as top-level field, set from HolderClient.pid on connect)
  holderPid: number;       // PID of the holder process
  socketPath: string;      // Unix socket path
  scrollback: string;      // Cached scrollback string (received from holder on connect)
  // scrollbackSize removed — no ring buffer management in server
  // pollTimer stays — session file discovery still happens server-side
  // Everything else stays the same
}
```

**Scrollback caching:** When `HolderClient.connect()` resolves, it returns the full scrollback string. PtyManager stores this as `terminal.scrollback` (a single string, not an array). On each `onOutput` callback, PtyManager appends to this cached string, capped at `MAX_SCROLLBACK_BYTES` (512 KB). When the cap is exceeded, the oldest half of the string is trimmed (slice from midpoint). This prevents unbounded growth for long-running sessions while keeping a useful replay buffer. The holder remains the authoritative source with its own 5000-line ring buffer; the server cache is rebuilt on each reconnect.

**`create()` changes — now async:**
```
Before: pty.spawn() → store in Map (synchronous)
After:  fork pty-holder.cjs (detached) → wait for ready signal →
        connect via HolderClient → insert into SQLite → store in Map (async)
```

The return type changes from `ManagedTerminal` to `Promise<ManagedTerminal>`. All callers must be updated (see Modified Components below).

Holder is forked with:
```typescript
const holderPath = process.env.SHOOTER_HOLDER_PATH
  || path.join(__dirname, 'pty-holder.cjs');
const holder = fork(holderPath, argv, {
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore', 'ipc']
});
holder.unref();

// Sequencing: wait for ready, THEN disconnect IPC. This must be
// inside the 'message' handler — not a setTimeout or separate await.
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    holder.kill();
    reject(new Error('Holder ready timeout'));
  }, 5000);

  holder.on('message', (msg: { type: string }) => {
    if (msg.type === 'ready') {
      clearTimeout(timeout);
      holder.disconnect(); // Release IPC — holder is now fully detached
      resolve();
    }
  });
});
```

The `holder.disconnect()` is called **inside** the `message` handler after `ready` is received — never before. Without it, the IPC channel keeps the holder referenced despite `detached: true`.

**New: `reconnectAll()` method:**
Called once on server startup, **before the HTTP server starts listening**. This ensures no `POST /api/terminals` requests can arrive during reconnection, avoiding race conditions with ID generation or Map insertion. Loads `status = 'running'` terminals from SQLite, attempts to reconnect to each holder socket. Re-attaches session watchers for recovered terminals.

**Orphaned terminal handling:** When reconnection fails (socket dead, PID dead), the terminal is marked `orphaned` in SQLite but is **not added to the in-memory Map**. Orphaned terminals appear only in `GET /api/terminals` responses (read from SQLite), not as live terminals. They are not actionable (no WS connection, no input). The in-memory `ManagedTerminal.status` type stays `'running' | 'exited'` — the `'orphaned'` status exists only in SQLite.

**New: `disconnectAll()` method:**
Called on graceful shutdown. Disconnects HolderClients but does not kill holder processes. Replaces current `destroy()` behavior for the normal shutdown path.

**`kill()` changes:**
From `process.kill(terminal.pid, 'SIGTERM')` to `terminal.pty.kill('SIGTERM')` which sends the kill message through the holder client to the holder process.

**`attach()` changes:**
Scrollback is cached in `terminal.scrollback` (a string, received from holder on connect and appended to on each output). On attach, PtyManager sends this cached string to the WS client in chunks, same as current behavior. No re-request to the holder is needed — the server cache is always current for the server's lifetime.

**Output broadcasting:**
`HolderClient.onOutput()` replaces `ptyProcess.onData()`. PtyManager receives output from the holder client and broadcasts to WS clients using the same logic.

**Session file discovery:**
The polling logic for detecting Claude Code JSONL files and OpenCode session IDs stays in PtyManager. It runs server-side because it depends on SessionWatcher and OpenCodeWatcher. When a session file is discovered, PtyManager also persists it to SQLite via `terminalStore.update()`.

**Cleanup:**
The periodic cleanup timer stays but now also cleans up SQLite records. Old `exited`/`orphaned` terminals are deleted from the DB after 24 hours (configurable).

### 5. `server.ts`

**Startup — insert between wiring adapters (line ~72) and `startKeepalive()` (line ~100). Must complete before `server.listen()`:**
```typescript
// After wiring adapters (line ~72):
setTerminalHandlerPtyManager(ptyManagerAdapter);
setSessionHandlerPtyManager(ptyManagerAdapter);
setSessionWatcher(sessionWatcherAdapter);

// NEW — recover persisted terminals before accepting connections:
await ptyManager.reconnectAll();

// Then existing code:
startKeepalive();
server.listen(port, ...);
```
This ordering ensures: (1) no HTTP requests arrive during reconnection, (2) keepalive doesn't ping stale connections, (3) all recovered terminals are in the Map before any WS handler runs.

**Shutdown — change `destroy()` to `disconnectAll()`:**
```typescript
// Before:
ptyManager.destroy();

// After:
ptyManager.disconnectAll();
```

Also add `openCodeWatcher.stopAll()` in shutdown (fixes bug M5 from PATTERN-ANALYSIS.md).

### 6. `src/lib/modules/server/ws/terminal-handler.ts` — Minor updates

Two changes required:

1. **Remove `scrollback: string[]` from local `ManagedTerminal` duck type** (line 43). Scrollback replay is now handled by PtyManager's `attach()` method (which sends the cached scrollback string), not by the handler reading the field directly.

2. **Route `SIGTERM` signal through `pty.kill()` instead of `process.kill()`** (line 176). Currently calls `process.kill(terminal.pty.pid, 'SIGTERM')` — this bypasses the holder protocol. Change to `terminal.pty.kill('SIGTERM')` which sends the kill message through the holder client. `SIGINT` and `SIGTSTP` are fine — they're sent as escape sequences via `pty.write()`, not `process.kill()`.

### 7. `src/lib/modules/server/ws/session-handler.ts` — Minor update

**Route `SIGINT` through `pty.kill()` instead of `process.kill()`** (line 284). Currently calls `process.kill(currentTerminal.pty.pid, 'SIGINT')`. Change to `currentTerminal.pty.kill('SIGINT')` which routes through the holder. Alternatively, since the cancel action is for the chat view (sending Ctrl+C), `pty.write('\x03')` would also work — consistent with how `terminal-handler.ts` handles `SIGINT`.

### 8. `src/routes/api/terminals/+server.ts` — Minor updates

Two changes required:

1. **`create()` is now async** — add `await` to `ptyManager.create(...)` call (the route handler is already `async`).

2. **`lastOutput` field** — currently reads `t.scrollback[t.scrollback.length - 1]` (line 29). Since scrollback is now a single cached string (not an array), change to read the last N characters of the cached string, or remove the field. Recommendation: remove `lastOutput` from the response — it's not used by any client.

---

## Unchanged Components

These require **zero modifications**:

- **`ws/server.ts`** — Routes by terminal ID, no awareness of PTY ownership
- **`session-watcher.ts`** — Watches JSONL files, independent of how PTY is managed
- **`opencode-watcher.ts`** — Polls SQLite, independent of PTY ownership

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Server crashes | Holders keep running. Next startup reconnects via SQLite + sockets. |
| Holder crashes | Master fd closes → PTY child gets SIGHUP → dies. Server detects broken socket → marks `orphaned` in SQLite. |
| PTY exits while server is down | Holder writes `.exit` sidecar, stays alive 60s. Server reads sidecar on reconnect attempt. If 60s elapsed, holder is gone — server reads sidecar file to get exit code, marks `exited`. |
| Stale socket file from previous crash | On create: if socket file exists at target path, try connecting. If it responds, that terminal is still alive (unexpected — generate different ID). If no response, delete stale file and proceed. |
| System reboot | All holders die. Server starts, reads SQLite, fails to connect to all sockets, checks PIDs (all dead), marks all as `orphaned`. Session data on disk still browsable. |
| Holder ready timeout | If holder doesn't send `ready` IPC within 5 seconds, kill it and return error to API caller. |
| Socket path too long | Unix socket paths are limited to ~104 chars. `/tmp/shooter-term-{8-hex-chars}.sock` is ~35 chars — well within limits. |
| Concurrent create during reconnect | Not possible — `reconnectAll()` completes before `server.listen()`, so no HTTP requests can arrive during recovery. |

---

## Testing Strategy

1. **Unit: TerminalStore** — Insert, update, get, list, markOrphaned, markExited, cleanup. Pure SQLite, no processes.
2. **Unit: HolderClient** — Mock Unix socket server, verify protocol parsing, connect/disconnect, write/resize/kill messages.
3. **Integration: Holder ↔ Client** — Spawn real holder, connect client, send input, verify output, resize, kill, exit detection.
4. **Integration: PtyManager.create()** — Create terminal, verify SQLite record, verify holder process running, verify socket exists.
5. **Integration: PtyManager.reconnectAll()** — Create terminal, disconnect (simulate restart), reconnect, verify scrollback replay and output forwarding.
6. **E2E: Server restart** — Start server, create terminal via API, stop server (SIGTERM), verify holder still running, start server again, verify terminal reappears in `GET /api/terminals`, verify WS connection works.

---

## Migration Path

No data migration needed — this is a new SQLite database (`~/.shooter/shooter.db`). Existing terminals created before this change will not survive the upgrade restart (they were in-memory anyway). After the upgrade, all new terminals are persistent.

## File Summary

| File | Action | Description |
|------|--------|-------------|
| **Type System (Step 1)** | | |
| `specs/types/terminal.yaml` | **Modify** | Add `TerminalRecord`, `HolderServerMessage`, `HolderClientMessage`; update `ManagedTerminalInfo` status enum + fields |
| `src/generated/types/Terminal.ts` | **Auto-generated** | `pnpm run types:generate` — do not edit |
| **New Modules (Step 2-3)** | | |
| `src/lib/modules/server/terminal/pty-holder.cjs` | **New** | ~120 lines — standalone holder process |
| `src/lib/modules/server/terminal/terminal-store.ts` | **New** | ~100 lines — SQLite persistence, imports `TerminalRecord` from `$lib/types` |
| `src/lib/modules/server/terminal/holder-client.ts` | **New** | ~130 lines — Unix socket client, imports `HolderClientMessage`/`HolderServerMessage` from `$lib/types` |
| **Refactored Modules (Step 4)** | | |
| `src/lib/modules/server/terminal/pty-manager.ts` | **Modify** | Major refactor — imports `TerminalRecord` from `$lib/types` |
| **Minor Updates (Step 5)** | | |
| `server.ts` | **Modify** | ~5 lines — startup recovery + shutdown |
| `src/lib/modules/server/ws/terminal-handler.ts` | **Modify** | ~5 lines — remove `scrollback` duck type, route SIGTERM |
| `src/lib/modules/server/ws/session-handler.ts` | **Modify** | ~2 lines — route SIGINT |
| `src/routes/api/terminals/+server.ts` | **Modify** | ~3 lines — await async `create()`, fix `lastOutput` |
| `package.json` | **Modify** | Add `postbuild` script to copy `pty-holder.cjs` to `build/` |
| **Unchanged** | | |
| WS server, session-watcher, opencode-watcher | **Unchanged** | — |
