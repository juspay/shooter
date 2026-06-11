# Terminal Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Password-protected sharing of a single terminal at its existing `/terminals/[id]` route, with per-share view-only/full-control mode, active until revoked.

**Architecture:** A `terminal_shares` + `share_sessions` SQLite pair (scrypt password, sha256-hashed guest tokens) feeds a `resolveAccess()` helper that lets four endpoints accept guest bearers; WS tickets gain a `{terminalId, readOnly}` scope enforced centrally at upgrade routing and per-message in the terminal/session handlers. The page detects guest mode, gates with a password prompt, and disables input affordances in view-only mode (server drops them anyway).

**Tech Stack:** SvelteKit (Svelte 5 runes), better-sqlite3, node:crypto (scrypt/sha256/timingSafeEqual), ws, type-crafter YAML types.

**Spec:** `docs/superpowers/specs/2026-06-11-terminal-sharing-design.md`

**Conventions that bind every task:**

- Types only in `src/lib/types/` (ESLint-enforced); import only from `$lib/types`.
- Strict TS, no `any`, named exports, `import type` for type-only imports.
- Tests are plain `.cjs` Node scripts in `tests/` that replicate schema/logic (no TS imports), added to the `test` script in `package.json`.
- Validate with `pnpm gen:types` (after YAML edits), `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm test`.
- Commit per task; **final step squashes the branch to one semantic commit** (CI enforces 1 commit/branch).

---

### Task 1: Types (YAML specs + hand-written)

**Files:**

- Create: `specs/types/share.yaml`
- Modify: `specs/types/index.yaml` (add Share group)
- Modify: `specs/types/ws-protocol.yaml` (Ticket scope fields, TicketScope, server resize broadcast)
- Modify: `specs/types/client.yaml` (TerminalDetailView: cols/rows/shareMode)
- Modify: `src/lib/types/ws.ts` (WireTerminalServerMessage resize variant)
- Modify: `src/lib/types/terminal-client.ts` (TerminalOptions readOnly/initialCols/initialRows, WsTerminalInboundMessage cols/rows, ShareGateProps, ShareSheetProps)

- [ ] **Step 1: Create `specs/types/share.yaml`**

```yaml
# Terminal Sharing Type Definitions
# Non-top file - referenced from index.yaml
# Types for password-protected single-terminal sharing: share records,
# guest sessions, and the share API request/response shapes.

Share:
  ShareMode:
    type: string
    enum:
      - view
      - control
    description: What a share guest may do — watch only, or full input control

  AccessLevel:
    type: string
    enum:
      - owner
      - guest
    description: Authorization level resolved for a terminal-scoped request

  AccessContext:
    type: object
    description: Resolved authorization for a terminal-scoped API request
    required:
      - level
    properties:
      level:
        $ref: './specs/types/share.yaml#/Share/AccessLevel'
        description: owner (API key) or guest (share session token)
      mode:
        $ref: './specs/types/share.yaml#/Share/ShareMode'
        description: Guest access mode (present only when level is guest)

  TerminalShareRecord:
    type: object
    description: Persisted share configuration for one terminal (terminal_shares table)
    required:
      - terminalId
      - passwordHash
      - mode
      - createdAt
      - updatedAt
    properties:
      terminalId:
        type: string
        description: Terminal this share belongs to (primary key)
      passwordHash:
        type: string
        description: 'scrypt:<salt-hex>:<hash-hex> password hash'
      mode:
        $ref: './specs/types/share.yaml#/Share/ShareMode'
        description: Access mode granted to guests
      createdAt:
        type: number
        description: Unix timestamp (ms) when the share was created
      updatedAt:
        type: number
        description: Unix timestamp (ms) when the share was last updated

  ShareSessionRecord:
    type: object
    description: Persisted guest session (share_sessions table); token stored as sha256 hash
    required:
      - tokenHash
      - terminalId
      - createdAt
      - expiresAt
    properties:
      tokenHash:
        type: string
        description: sha256 hex of the guest bearer token (primary key)
      terminalId:
        type: string
        description: Terminal the session grants access to
      createdAt:
        type: number
        description: Unix timestamp (ms) when the session was created
      expiresAt:
        type: number
        description: Unix timestamp (ms) when the session expires (created + 7 days)

  ShareInfoResponse:
    type: object
    description: Owner view of a terminal's share state (GET /api/terminals/[id]/share)
    required:
      - active
    properties:
      active:
        type: boolean
        description: Whether sharing is currently enabled for this terminal
      mode:
        $ref: './specs/types/share.yaml#/Share/ShareMode'
        description: Current access mode (present when active)
      createdAt:
        type: number
        description: Unix timestamp (ms) when the share was created (present when active)
      updatedAt:
        type: number
        description: Unix timestamp (ms) when the share was last updated (present when active)

  ShareStatusResponse:
    type: object
    description: Public probe response (GET /api/terminals/[id]/share/status)
    required:
      - shared
    properties:
      shared:
        type: boolean
        description: Whether a share exists for this terminal

  ShareAuthRequest:
    type: object
    description: Guest password exchange request (POST /api/terminals/[id]/share/auth)
    required:
      - password
    properties:
      password:
        type: string
        description: The share password

  ShareAuthResponse:
    type: object
    description: Guest session issued after successful password exchange
    required:
      - token
      - mode
      - expiresAt
    properties:
      token:
        type: string
        description: Guest bearer token (64-char hex, shown once)
      mode:
        $ref: './specs/types/share.yaml#/Share/ShareMode'
        description: Access mode granted by this session
      expiresAt:
        type: number
        description: Unix timestamp (ms) when this session expires

  ShareConfigRequest:
    type: object
    description: Owner create/update share request (PUT /api/terminals/[id]/share)
    required:
      - mode
    properties:
      password:
        type: string
        description: New share password (min 6 chars; required on create, optional on update)
      mode:
        $ref: './specs/types/share.yaml#/Share/ShareMode'
        description: Access mode to grant guests
```

- [ ] **Step 2: Register the group in `specs/types/index.yaml`**

Append under `groupedTypes:` (after the `Config` entry):

```yaml
# Terminal sharing types: share records, guest sessions, share API shapes
Share:
  $ref: './specs/types/share.yaml#/Share'
```

- [ ] **Step 3: Extend `specs/types/ws-protocol.yaml`**

(a) Replace the `Ticket` type (bottom of file) with:

```yaml
Ticket:
  type: object
  description: Short-lived single-use ticket for authenticating WebSocket upgrade requests
  required:
    - createdAt
    - used
  properties:
    createdAt:
      type: number
      description: Unix timestamp (ms) when the ticket was created
    used:
      type: boolean
      description: Whether the ticket has been consumed (single-use)
    terminalId:
      type: string
      description: When set, the ticket may only open WS channels for this terminal
    readOnly:
      type: boolean
      description: When true, input/resize/signal/send-input/cancel frames are dropped

TicketScope:
  type: object
  description: Scope restriction carried by a guest WebSocket ticket
  required:
    - terminalId
    - readOnly
  properties:
    terminalId:
      type: string
      description: Only WS channels for this terminal may be opened
    readOnly:
      type: boolean
      description: Whether the connection is view-only (input frames dropped)
```

(b) Add the resize broadcast to the server union — in `TerminalServerMessage.oneOf`, add:

```yaml
- $ref: './specs/types/ws-protocol.yaml#/WsProtocol/TerminalResizeMessage'
```

(shape `{type:'resize', cols, rows}` is reused for the server→client PTY-resized broadcast).

- [ ] **Step 4: Extend `TerminalDetailView` in `specs/types/client.yaml`**

Add to its `properties` (all optional — not in `required`):

```yaml
cols:
  type: number
  description: Current PTY width in columns (for fixed-size guest rendering)
rows:
  type: number
  description: Current PTY height in rows (for fixed-size guest rendering)
shareMode:
  $ref: './specs/types/share.yaml#/Share/ShareMode'
  description: Present when fetched with a guest share token — the guest's access mode
```

- [ ] **Step 5: Regenerate** — Run: `pnpm gen:types`. Expected: `src/lib/types/generated/Share.ts` created, `WsProtocol.ts`/`Client.ts` updated, no errors.

- [ ] **Step 6: Hand-written type updates**

In `src/lib/types/ws.ts`, add the resize variant to `WireTerminalServerMessage`:

```ts
export type WireTerminalServerMessage =
  | { bytes: number; type: 'output-dropped' }
  | { chunk: number; data: string; total: number; type: 'scrollback' }
  | { code: null | number; signal: null | string; type: 'exit' }
  | { cols: number; rows: number; type: 'resize' }
  | { data: string; type: 'output' }
  | { message: string; type: 'error' };
```

In `src/lib/types/terminal-client.ts`:

```ts
// TerminalOptions — add three optional fields:
export interface TerminalOptions {
  apiKey?: string;
  container: HTMLElement;
  fontSize?: number;
  getTicket: () => Promise<string>;
  initialCols?: number;
  initialRows?: number;
  onActivity?: (active: boolean) => void;
  onCwd?: (path: string) => void;
  onDisconnect?: () => void;
  onExit?: (code: number) => void;
  onReconnect?: () => void;
  readOnly?: boolean;
  terminalId?: string;
  wsUrl: string;
}

// WsTerminalInboundMessage — add cols/rows:
export interface WsTerminalInboundMessage {
  active?: boolean;
  bytes?: number;
  code?: number;
  cols?: number;
  data?: string;
  path?: string;
  rows?: number;
  type: string;
}

// New component prop types (place alphabetically near ShortcutsHelpProps):
export interface ShareGateProps {
  /** Returns an error message to display, or null on success. */
  onSubmit: (password: string) => Promise<null | string>;
}

export interface ShareSheetProps {
  onClose: () => void;
  open?: boolean;
  shareUrl: string;
  terminalId: string;
}
```

- [ ] **Step 7: Validate & commit**

Run: `pnpm check && pnpm lint`. Expected: PASS.

```bash
git add specs/types/ src/lib/types/
git commit -m "feat(types): share, ticket-scope, and resize-broadcast types"
```

---

### Task 2: Share store (SQLite) + unit test

**Files:**

- Create: `src/lib/modules/server/terminal/share-store.ts`
- Create: `tests/share-store.test.cjs`
- Modify: `package.json` (append test to `test` script)

- [ ] **Step 1: Create `src/lib/modules/server/terminal/share-store.ts`**

```ts
/**
 * Share Store — SQLite persistence for terminal sharing.
 *
 * terminal_shares: one share per terminal (scrypt password hash + mode).
 * share_sessions:  guest sessions keyed by sha256(token), 7-day TTL.
 *
 * Database location: ~/.shooter/shooter.db (same file as terminal-store).
 */

import type { ShareMode, ShareSessionRecord, TerminalShareRecord } from '$lib/types';

import Database from 'better-sqlite3';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DB_DIR = path.join(process.env.HOME || '', '.shooter');
const DB_PATH = path.join(DB_DIR, 'shooter.db');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Password hashing (scrypt, per-share random salt) ─────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, parts[1], 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Row mapping ──────────────────────────────────────────────────────

function rowToShare(row: Record<string, unknown>): TerminalShareRecord {
  return {
    createdAt: row.created_at as number,
    mode: row.mode as ShareMode,
    passwordHash: row.password_hash as string,
    terminalId: row.terminal_id as string,
    updatedAt: row.updated_at as number,
  };
}

export class ShareStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
			CREATE TABLE IF NOT EXISTS terminal_shares (
				terminal_id   TEXT PRIMARY KEY,
				password_hash TEXT NOT NULL,
				mode          TEXT NOT NULL,
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS share_sessions (
				token_hash  TEXT PRIMARY KEY,
				terminal_id TEXT NOT NULL,
				created_at  INTEGER NOT NULL,
				expires_at  INTEGER NOT NULL
			)
		`);

    this.cleanup();
  }

  /** Purge expired sessions and shares whose terminal no longer exists. */
  cleanup(): void {
    this.db.prepare('DELETE FROM share_sessions WHERE expires_at < ?').run(Date.now());
    try {
      this.db
        .prepare('DELETE FROM terminal_shares WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
      this.db
        .prepare('DELETE FROM share_sessions WHERE terminal_id NOT IN (SELECT id FROM terminals)')
        .run();
    } catch {
      // terminals table may not exist yet on a fresh database — skip orphan cleanup.
    }
  }

  /** Issue a new guest session for a shared terminal. Returns the raw token (stored hashed). */
  createSession(terminalId: string): { expiresAt: number; token: string } {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .prepare(
        'INSERT INTO share_sessions (token_hash, terminal_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(hashToken(token), terminalId, now, expiresAt);
    return { expiresAt, token };
  }

  /** Revoke a share: delete the share row and every guest session for it. */
  deleteShare(terminalId: string): void {
    this.db.prepare('DELETE FROM terminal_shares WHERE terminal_id = ?').run(terminalId);
    this.deleteSessions(terminalId);
  }

  /** Delete all guest sessions for a terminal (password change / revoke). */
  deleteSessions(terminalId: string): void {
    this.db.prepare('DELETE FROM share_sessions WHERE terminal_id = ?').run(terminalId);
  }

  getShare(terminalId: string): null | TerminalShareRecord {
    const row = this.db
      .prepare('SELECT * FROM terminal_shares WHERE terminal_id = ?')
      .get(terminalId) as Record<string, unknown> | undefined;
    return row ? rowToShare(row) : null;
  }

  /**
   * Resolve a guest bearer token to its terminal + mode.
   * Returns null if unknown, expired, or the share was revoked.
   */
  resolveToken(token: string): null | { mode: ShareMode; terminalId: string } {
    if (!token) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT s.terminal_id, s.expires_at, sh.mode
				 FROM share_sessions s
				 JOIN terminal_shares sh ON sh.terminal_id = s.terminal_id
				 WHERE s.token_hash = ?`
      )
      .get(hashToken(token)) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if ((row.expires_at as number) < Date.now()) {
      this.db.prepare('DELETE FROM share_sessions WHERE token_hash = ?').run(hashToken(token));
      return null;
    }
    return { mode: row.mode as ShareMode, terminalId: row.terminal_id as string };
  }

  /** Create or replace the share for a terminal. */
  setShare(record: TerminalShareRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO terminal_shares
				 (terminal_id, password_hash, mode, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.terminalId, record.passwordHash, record.mode, record.createdAt, record.updatedAt);
  }
}

// ── Singleton (globalThis bridges tsx server.ts + SvelteKit handler) ─

const SS_GLOBAL_KEY = '__shooter_share_store';
export const shareStore: ShareStore =
  ((globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] as ShareStore) || new ShareStore();
(globalThis as Record<string, unknown>)[SS_GLOBAL_KEY] = shareStore;
```

Note: `ShareSessionRecord` is exported from the barrel for the test/docs symmetry even though the store returns a narrowed shape; do not remove it from share.yaml.

- [ ] **Step 2: Create `tests/share-store.test.cjs`**

Mirror the conventions of `tests/terminal-store.test.cjs` (plain `.cjs`, better-sqlite3 against `/tmp`, replicated schema + logic, `assert`-style checks, summary line, `process.exit(1)` on failure). Test cases (replicate `hashPassword`/`verifyPassword`/`hashToken` inline with `node:crypto`):

1. Schema: both tables create; share INSERT OR REPLACE upsert keeps PK unique.
2. `hashPassword` produces `scrypt:<32-hex-salt>:<128-hex-hash>`; `verifyPassword` true for correct, false for wrong password, false for malformed stored string.
3. Session insert + join-resolve returns mode/terminal; unknown token → null.
4. Expired session (expires_at in past) resolves to null and is purged.
5. Revoke cascade: deleting share + sessions for terminal A leaves terminal B's intact.
6. Orphan cleanup: with a `terminals` table containing only `t1`, shares/sessions for `t2` are deleted, `t1`'s survive.

- [ ] **Step 3: Run the test**

Run: `node tests/share-store.test.cjs`. Expected: all cases PASS.

- [ ] **Step 4: Register in `package.json`** — append `&& node tests/share-store.test.cjs` to the `test` script.

- [ ] **Step 5: Validate & commit**

Run: `pnpm check && pnpm lint && pnpm test`. Expected: PASS.

```bash
git add src/lib/modules/server/terminal/share-store.ts tests/share-store.test.cjs package.json
git commit -m "feat(sharing): share store with scrypt passwords and guest sessions"
```

---

### Task 3: Access resolution helper + guest WS registry

**Files:**

- Create: `src/lib/modules/server/terminal/share-auth.ts`
- Create: `src/lib/modules/server/ws/guest-registry.ts`

- [ ] **Step 1: Create `src/lib/modules/server/terminal/share-auth.ts`**

```ts
// Resolves a terminal-scoped request to owner (API key) or guest (share token).
// Kept separate from auth.ts so routes without share semantics don't pull in SQLite.

import type { AccessContext } from '$lib/types';

import { validateAuth } from '../auth';
import { shareStore } from './share-store';

/** Extract the Bearer token from a request, or null. */
export function bearerToken(request: Request): null | string {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7).trim();
}

/**
 * Resolve access for a request targeting one terminal.
 * Owner (valid API key) → { level: 'owner' }.
 * Guest (valid share session for THIS terminal) → { level: 'guest', mode }.
 * Anything else → null.
 */
export function resolveAccess(request: Request, terminalId: string): AccessContext | null {
  if (validateAuth(request) === null) {
    return { level: 'owner' };
  }
  const token = bearerToken(request);
  if (!token) {
    return null;
  }
  const session = shareStore.resolveToken(token);
  if (!session || session.terminalId !== terminalId) {
    return null;
  }
  return { level: 'guest', mode: session.mode };
}
```

- [ ] **Step 2: Create `src/lib/modules/server/ws/guest-registry.ts`**

```ts
// Tracks WebSocket connections opened with a guest (scoped) ticket, per terminal,
// so revoke / mode-change / password-change can force-close them immediately.
// globalThis bridges the tsx server.ts and SvelteKit handler module scopes.

import type { WebSocket } from 'ws';

const GUESTS_KEY = '__shooter_ws_guest_conns';
const guests: Map<string, Set<WebSocket>> = ((globalThis as Record<string, unknown>)[
  GUESTS_KEY
] as Map<string, Set<WebSocket>>) || new Map<string, Set<WebSocket>>();
(globalThis as Record<string, unknown>)[GUESTS_KEY] = guests;

/** Force-close every guest connection for a terminal. Returns the number closed. */
export function closeGuests(terminalId: string): number {
  const set = guests.get(terminalId);
  if (!set) {
    return 0;
  }
  let closed = 0;
  for (const ws of set) {
    try {
      ws.close(4001, 'Share revoked');
      closed++;
    } catch {
      // Already closing/closed.
    }
  }
  guests.delete(terminalId);
  return closed;
}

/** Register a guest connection; auto-removes itself on close. */
export function registerGuest(terminalId: string, ws: WebSocket): void {
  let set = guests.get(terminalId);
  if (!set) {
    set = new Set<WebSocket>();
    guests.set(terminalId, set);
  }
  set.add(ws);
  ws.on('close', () => {
    const current = guests.get(terminalId);
    if (current) {
      current.delete(ws);
      if (current.size === 0) {
        guests.delete(terminalId);
      }
    }
  });
}
```

- [ ] **Step 3: Validate & commit**

Run: `pnpm check && pnpm lint`. Expected: PASS.

```bash
git add src/lib/modules/server/terminal/share-auth.ts src/lib/modules/server/ws/guest-registry.ts
git commit -m "feat(sharing): access resolver and guest connection registry"
```

---

### Task 4: Scoped WS tickets — ticket-store, upgrade handler, routing gate

**Files:**

- Modify: `src/lib/modules/server/ws/ticket-store.ts`
- Modify: `server.ts:164-184` (upgrade handler)
- Modify: `src/lib/modules/server/ws/server.ts` (routing gate + scope pass-down + guest registration)

- [ ] **Step 1: `ticket-store.ts` — scope-aware generate, Ticket-returning validate**

Replace `generateTicket` and `validateTicket`:

```ts
import type { Ticket, TicketScope } from '$lib/types';

/**
 * Generate a new single-use ticket (32-byte hex string).
 * Valid 30 seconds, single consumption. An optional scope restricts the
 * ticket to one terminal's channels (and optionally read-only).
 */
export function generateTicket(scope?: TicketScope): string {
  const ticket = randomBytes(32).toString('hex');
  tickets.set(ticket, {
    createdAt: Date.now(),
    used: false,
    ...(scope ? { readOnly: scope.readOnly, terminalId: scope.terminalId } : {}),
  });
  return ticket;
}

/**
 * Validate and consume a ticket.
 * Returns the consumed Ticket (including any scope) if valid, else null.
 */
export function validateTicket(ticket: null | string): null | Ticket {
  if (!ticket) {
    return null;
  }
  const entry = tickets.get(ticket);
  if (!entry || entry.used) {
    return null;
  }
  if (Date.now() - entry.createdAt > 30_000) {
    tickets.delete(ticket);
    return null;
  }
  entry.used = true;
  return entry;
}
```

- [ ] **Step 2: `server.ts` upgrade handler — pass scope down**

Replace lines 173–183 with:

```ts
const ticket = url.searchParams.get('ticket');

const ticketEntry = validateTicket(ticket);
if (!ticketEntry) {
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
  return;
}

// Delegate routing to the WS server module which inspects the pathname
// and dispatches to terminal, session, or events handlers. Guest tickets
// carry a scope that restricts which channels may be opened.
const scope = ticketEntry.terminalId
  ? { readOnly: ticketEntry.readOnly ?? false, terminalId: ticketEntry.terminalId }
  : undefined;
setupWebSocketHandlers(wss, request, socket, head, scope);
```

- [ ] **Step 3: `ws/server.ts` — central scope gate + guest registration**

Add imports:

```ts
import type { TicketScope } from '$lib/types';

import { registerGuest } from './guest-registry.js';
```

Change the signature and body of `setupWebSocketHandlers`:

```ts
export function setupWebSocketHandlers(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  scope?: TicketScope
): void {
```

After the route matching block (after the `if (!terminalMatch && ...)` early return), insert:

```ts
// Scoped (guest) tickets may only open the terminal/session channels of
// their own terminal. Events and super-session channels broadcast global
// data, so they are denied outright.
if (scope) {
  const target = terminalMatch?.[1] ?? sessionMatch?.[1];
  if (!target || superSessionMatch || target !== scope.terminalId) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
}
```

Inside `wss.handleUpgrade`, after `allConnections.add(ws);` add:

```ts
if (scope) {
  registerGuest(scope.terminalId, ws);
}
```

and pass scope into the two handlers:

```ts
if (terminalMatch) {
  const terminalId = terminalMatch[1];
  handleTerminalConnection(ws, terminalId, scope);
} else if (superSessionMatch) {
  const superSessionId = superSessionMatch[1];
  handleSuperSessionConnection(ws, superSessionId);
} else if (sessionMatch) {
  const sessionId = sessionMatch[1];
  handleSessionConnection(ws, sessionId, scope);
} else if (isEvents) {
  handleEventsConnection(ws);
}
```

(Compile will fail until Task 5 adds the `scope` parameters — Tasks 4+5 commit together if needed, or add the params in this task as a no-op third argument. Preferred: do Step 1–3 here, then Task 5 immediately; run `pnpm check` only at Task 5's end. Single commit covering both is acceptable.)

---

### Task 5: Handler enforcement — read-only drops, subscribe lock, resize broadcast

**Files:**

- Modify: `src/lib/modules/server/ws/terminal-handler.ts`
- Modify: `src/lib/modules/server/ws/session-handler.ts`
- Modify: `src/lib/modules/server/terminal/pty-manager.ts:476-490` (resize broadcast for REST path)

- [ ] **Step 1: `terminal-handler.ts`**

(a) Add `TicketScope` to the type import from `$lib/types`.

(b) Signature: `export function handleTerminalConnection(ws: WebSocket, terminalId: string, scope?: TicketScope): void`.

(c) In the `ws.on('message', ...)` handler, right after the `if (!msg) return;` guard, insert:

```ts
// View-only guests: every inbound frame type mutates the PTY — drop them all.
if (scope?.readOnly) {
  return;
}
```

(d) In the `case 'resize':` branch, after `terminal.pty.resize(msg.cols, msg.rows);` add a broadcast to the other attached clients so view-only guests can follow the PTY size:

```ts
        case 'resize': {
          terminal.pty.resize(msg.cols, msg.rows);
          const resizeMsg: ServerMessage = { cols: msg.cols, rows: msg.rows, type: 'resize' };
          for (const client of terminal.clients) {
            if (client !== ws) {
              safeSend(client, resizeMsg);
            }
          }
          break;
        }
```

- [ ] **Step 2: `session-handler.ts`**

(a) Add `TicketScope` to the type import from `$lib/types`.

(b) Signature: `export function handleSessionConnection(ws: WebSocket, id: string, scope?: TicketScope): void` — and pass `scope` through both `wireClientMessages(ws, state, scope)` call sites.

(c) `function wireClientMessages(ws: WebSocket, state: ConnectionState, scope?: TicketScope): void` — inside the message switch:

- `case 'cancel':` and `case 'send-input':` — first line of each:

```ts
if (scope?.readOnly) {
  safeSend(ws, { message: 'This shared terminal is view-only.', type: 'error' });
  return;
}
```

- `case 'subscribe':` — first line:

```ts
if (scope && msg.sessionId !== scope.terminalId) {
  safeSend(ws, { message: 'Not authorized for this session.', type: 'error' });
  return;
}
```

- [ ] **Step 3: `pty-manager.ts` resize broadcast (REST path)**

In `resize(id, cols, rows)` (line ~476), after `terminal.rows = rows;` add:

```ts
const msg = JSON.stringify({ cols, rows, type: 'resize' });
for (const ws of terminal.clients) {
  this.safeSend(ws, msg);
}
```

(match `safeSend`'s actual signature in that file — it takes the ws and a pre-serialized string).

- [ ] **Step 4: Validate & commit (covers Task 4 too)**

Run: `pnpm check && pnpm lint`. Expected: PASS.

```bash
git add src/lib/modules/server/ws/ server.ts src/lib/modules/server/terminal/pty-manager.ts
git commit -m "feat(sharing): scoped WS tickets with server-side enforcement"
```

---

### Task 6: API endpoints

**Files:**

- Create: `src/routes/api/terminals/[id]/share/+server.ts` (GET/PUT/DELETE, owner)
- Create: `src/routes/api/terminals/[id]/share/status/+server.ts` (GET, public)
- Create: `src/routes/api/terminals/[id]/share/auth/+server.ts` (POST, public + rate-limited)
- Modify: `src/routes/api/ws-ticket/+server.ts` (accept share tokens → scoped tickets)
- Modify: `src/routes/api/terminals/[id]/+server.ts` (GET dual-auth + cols/rows/shareMode; DELETE revokes share)
- Modify: `src/routes/api/terminals/[id]/resize/+server.ts` (control-mode guests)
- Modify: `src/routes/api/terminals/[id]/paste-image/+server.ts` (control-mode guests)

- [ ] **Step 1: Owner share management — `share/+server.ts`**

```ts
// /api/terminals/[id]/share — owner management of a terminal's share.
// GET: current state. PUT: create/update. DELETE: revoke.
// All methods require the API key (owners only).

import type { ShareConfigRequest, ShareInfoResponse, ShareMode } from '$lib/types';

import { validateAuth } from '$lib/modules/server/auth';
import { ptyManager } from '$lib/modules/server/terminal/pty-manager.js';
import { hashPassword, shareStore } from '$lib/modules/server/terminal/share-store';
import { closeGuests } from '$lib/modules/server/ws/guest-registry';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const MIN_PASSWORD_LENGTH = 6;
const MODES: ShareMode[] = ['view', 'control'];

function toInfo(terminalId: string): ShareInfoResponse {
  const share = shareStore.getShare(terminalId);
  if (!share) {
    return { active: false };
  }
  return { active: true, createdAt: share.createdAt, mode: share.mode, updatedAt: share.updatedAt };
}

export const GET: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  return json(toInfo(params.id));
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  if (!ptyManager.get(params.id)) {
    return json({ error: 'Terminal not found' }, { status: 404 });
  }

  let body: ShareConfigRequest;
  try {
    body = (await request.json()) as ShareConfigRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!MODES.includes(body.mode)) {
    return json({ error: "mode must be 'view' or 'control'" }, { status: 400 });
  }

  const existing = shareStore.getShare(params.id);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!existing && password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `password is required (min ${String(MIN_PASSWORD_LENGTH)} chars)` },
      { status: 400 }
    );
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `password must be at least ${String(MIN_PASSWORD_LENGTH)} chars` },
      { status: 400 }
    );
  }

  const now = Date.now();
  shareStore.setShare({
    createdAt: existing?.createdAt ?? now,
    mode: body.mode,
    passwordHash: password
      ? hashPassword(password)
      : (existing as NonNullable<typeof existing>).passwordHash,
    terminalId: params.id,
    updatedAt: now,
  });

  // New password invalidates existing guest sessions; any change to the share
  // forces connected guests to reconnect under the new scope.
  if (password) {
    shareStore.deleteSessions(params.id);
  }
  if (password || existing?.mode !== body.mode) {
    closeGuests(params.id);
  }

  return json(toInfo(params.id));
};

export const DELETE: RequestHandler = ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }
  shareStore.deleteShare(params.id);
  const closed = closeGuests(params.id);
  return json({ closedConnections: closed, success: true });
};
```

- [ ] **Step 2: Public probe — `share/status/+server.ts`**

```ts
// GET /api/terminals/[id]/share/status — public probe used by the page to
// decide whether to show the password gate. Reveals only a boolean.

import { shareStore } from '$lib/modules/server/terminal/share-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
  return json({ shared: shareStore.getShare(params.id) !== null });
};
```

- [ ] **Step 3: Guest password exchange — `share/auth/+server.ts`**

```ts
// POST /api/terminals/[id]/share/auth — exchange the share password for a
// guest session token. Public endpoint; brute-force-limited per IP+terminal.

import type { ShareAuthRequest } from '$lib/types';

import { shareStore, verifyPassword } from '$lib/modules/server/terminal/share-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const attempts = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  attempts.set(key, recent);
  if (recent.length >= RATE_LIMIT_MAX) {
    return false;
  }
  recent.push(now);
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      attempts.delete(key);
    } else {
      attempts.set(key, recent);
    }
  }
}, 300_000).unref();

export const POST: RequestHandler = async (event) => {
  const { params, request } = event;

  const share = shareStore.getShare(params.id);
  if (!share) {
    return json({ error: 'Not shared' }, { status: 404 });
  }

  let ip = 'unknown';
  const cfIp = request.headers.get('cf-connecting-ip');
  const fwd = request.headers.get('x-forwarded-for');
  if (cfIp) {
    ip = cfIp;
  } else if (fwd) {
    ip = fwd.split(',')[0].trim();
  } else {
    try {
      ip = event.getClientAddress();
    } catch {
      // Keep 'unknown' — rate limit still applies per terminal.
    }
  }

  if (!checkRateLimit(`${ip}:${params.id}`)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  let body: ShareAuthRequest;
  try {
    body = (await request.json()) as ShareAuthRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || !verifyPassword(body.password, share.passwordHash)) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  const { expiresAt, token } = shareStore.createSession(params.id);
  return json({ expiresAt, mode: share.mode, token });
};
```

- [ ] **Step 4: `ws-ticket/+server.ts` — guest tokens get scoped tickets**

Replace the `POST` handler body's auth section:

```ts
export const POST: RequestHandler = ({ request }) => {
  const bearer = (
    request.headers.get('authorization') ??
    request.headers.get('Authorization') ??
    ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();

  const authError = validateAuth(request);
  if (authError) {
    // Not the API key — maybe a guest share token (scoped ticket).
    const session = bearer ? shareStore.resolveToken(bearer) : null;
    if (!session) {
      return authError;
    }
    if (!checkRateLimit(bearer)) {
      return json(
        { error: 'Rate limit exceeded. Maximum 30 ticket requests per minute.' },
        { status: 429 }
      );
    }
    const ticket = generateTicket({
      readOnly: session.mode === 'view',
      terminalId: session.terminalId,
    });
    return json({ expiresIn: 30, ticket });
  }

  if (!checkRateLimit(bearer)) {
    return json(
      { error: 'Rate limit exceeded. Maximum 30 ticket requests per minute.' },
      { status: 429 }
    );
  }

  const ticket = generateTicket();
  return json({ expiresIn: 30, ticket });
};
```

Add import: `import { shareStore } from '$lib/modules/server/terminal/share-store';`.

- [ ] **Step 5: `terminals/[id]/+server.ts` — dual-auth GET, share-revoking DELETE**

GET: replace the `validateAuth` block with:

```ts
const access = resolveAccess(request, params.id);
if (!access) {
  return json({ error: 'Unauthorized' }, { status: 401 });
}
```

and extend the response object with:

```ts
      cols: terminal.cols,
      rows: terminal.rows,
      ...(access.level === 'guest' ? { shareMode: access.mode } : {}),
```

DELETE: keep `validateAuth`; in both the exited-removal branch and the kill branch, before returning success add:

```ts
shareStore.deleteShare(params.id);
closeGuests(params.id);
```

Imports: `resolveAccess` from `$lib/modules/server/terminal/share-auth`, `shareStore` from `.../share-store`, `closeGuests` from `$lib/modules/server/ws/guest-registry`.

- [ ] **Step 6: `resize/+server.ts` and `paste-image/+server.ts` — control-mode guests**

In both, replace the `validateAuth` block with:

```ts
const access = resolveAccess(request, params.id);
if (!access) {
  return json({ error: 'Unauthorized' }, { status: 401 });
}
if (access.level === 'guest' && access.mode !== 'control') {
  return json({ error: 'View-only access' }, { status: 403 });
}
```

- [ ] **Step 7: Validate & commit**

Run: `pnpm check && pnpm lint && pnpm build`. Expected: PASS.

```bash
git add src/routes/api/
git commit -m "feat(sharing): share management, auth, and dual-auth endpoints"
```

---

### Task 7: Frontend — xterm read-only mode, ShareGate, ShareSheet, page wiring

**Files:**

- Modify: `src/lib/modules/client/terminal/xterm-wrapper.ts`
- Create: `src/lib/modules/client/terminal/ShareGate.svelte`
- Create: `src/lib/modules/client/terminal/ShareSheet.svelte`
- Modify: `src/routes/terminals/[id]/+page.svelte`

- [ ] **Step 1: `xterm-wrapper.ts` read-only support**

(a) Initial sizing — after `term.open(options.container);` replace `fitAddon.fit();` with:

```ts
if (options.readOnly && options.initialCols && options.initialRows) {
  // View-only: render at the PTY's size (we may not resize the shared PTY).
  term.resize(options.initialCols, options.initialRows);
} else {
  fitAddon.fit();
}
```

(b) Paste interception — change the gate to `if (options.terminalId && options.apiKey && !options.readOnly) {`.

(c) Inbound messages — add to the `onmessage` chain:

```ts
      } else if (msg.type === 'resize') {
        if (options.readOnly && msg.cols && msg.rows) {
          term.resize(msg.cols, msg.rows);
        }
      }
```

(d) Outbound input — `term.onData` handler first line: `if (options.readOnly) { return; }`.

(e) ResizeObserver — first line of callback: `if (options.readOnly) { return; }`.

- [ ] **Step 2: `ShareGate.svelte`** — minimal centered password form

```svelte
<script lang="ts">
  import type { ShareGateProps } from '$lib/types';

  import { Button, Input } from '@juspay/svelte-ui-components';

  const { onSubmit }: ShareGateProps = $props();

  let password = $state('');
  let errorMsg = $state<null | string>(null);
  let submitting = $state(false);

  async function submit(): Promise<void> {
    if (!password || submitting) {
      return;
    }
    submitting = true;
    errorMsg = null;
    errorMsg = await onSubmit(password);
    submitting = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div class="share-gate">
  <div class="share-gate-card">
    <h2 class="share-gate-title">Shared terminal</h2>
    <p class="share-gate-sub">
      This terminal is password protected. Enter the password to view it.
    </p>
    <Input
      bind:value={password}
      dataType="password"
      placeholder="Password"
      classes="share-gate-input"
      onKeyDown={onKeydown}
    />
    {#if errorMsg}
      <p class="share-gate-error">{errorMsg}</p>
    {/if}
    <Button
      classes="btn-primary share-gate-btn"
      onclick={(): void => void submit()}
      disabled={!password || submitting}
      showLoader={submitting}
      text="Unlock"
    />
  </div>
</div>

<style>
  .share-gate {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-4);
  }
  .share-gate-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 360px;
    padding: var(--space-5);
    background: var(--ds-background-100);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .share-gate-title {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-primary);
  }
  .share-gate-sub {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }
  .share-gate-error {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ds-red-700, #ef4444);
  }
</style>
```

- [ ] **Step 3: `ShareSheet.svelte`** — owner share management overlay

Props per `ShareSheetProps` (`onClose`, `open`, `shareUrl`, `terminalId`). Behavior:

- On `open` becoming true: `GET /api/terminals/{terminalId}/share` with `Authorization: Bearer ${getApiKey()}` (import `getApiKey` from `$lib/modules/client/common/config-guard`); populate `active`, `mode`.
- Form state: `mode` (`'view' | 'control'`, default `'view'`), `password` (text input), Generate button → `password = crypto-random 16-char base64url-ish string` (`Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 57]).join('')`).
- Enable/Update button → `PUT` with `{ mode, ...(password ? { password } : {}) }`; on create, password required (disable button if `!active && password.length < 6`).
- When active: show `shareUrl` in a readonly row with a Copy button (`navigator.clipboard.writeText`), the current mode, and a Revoke button → `DELETE`, then reset to inactive state.
- Render nothing when `!open`. Backdrop click + Close button call `onClose`. Reuse `Button`, `Input` from `@juspay/svelte-ui-components`; simple fixed-position overlay styling consistent with the app (dark theme variables as in ShareGate).

- [ ] **Step 4: Page wiring — `src/routes/terminals/[id]/+page.svelte`**

(a) **Imports/types:** add `ShareAuthResponse`, `ShareMode`, `ShareStatusResponse` to the `$lib/types` import; import `ShareGate` and `ShareSheet` components.

(b) **State** (after existing state declarations):

```ts
let authMode = $state<'guest' | 'owner' | null>(null);
let guestMode = $state<null | ShareMode>(null);
let shareGateVisible = $state(false);
let shareSheetOpen = $state(false);
```

Derived:

```ts
const isOwner = $derived(authMode === 'owner');
const viewOnly = $derived(authMode === 'guest' && guestMode === 'view');
const shareUrl = $derived(
  typeof window !== 'undefined' ? `${window.location.origin}/terminals/${terminalId}` : ''
);
```

(c) **Token helpers** (next to `getConfig()`):

```ts
const SHARE_TOKENS_KEY = 'shooter_share_tokens';

function getShareToken(): null | string {
  try {
    const raw = localStorage.getItem(SHARE_TOKENS_KEY);
    if (!raw) {
      return null;
    }
    const map = JSON.parse(raw) as Record<string, string>;
    return typeof map[terminalId] === 'string' ? map[terminalId] : null;
  } catch {
    return null;
  }
}

function storeShareToken(token: string): void {
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(localStorage.getItem(SHARE_TOKENS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    // Corrupt entry — start fresh.
  }
  map[terminalId] = token;
  localStorage.setItem(SHARE_TOKENS_KEY, JSON.stringify(map));
}

function getBearer(): null | string {
  return getConfig()?.apiKey ?? getShareToken();
}
```

(d) **Rework `fetchTerminal()`** to the guest-aware version:

```ts
async function fetchTerminal(): Promise<void> {
  if (!browser) {
    return;
  }

  const config = getConfig();
  const bearer = config?.apiKey ?? getShareToken();
  if (!bearer) {
    await checkShareAccess();
    return;
  }

  try {
    const res = await fetch(`/api/terminals/${terminalId}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (res.status === 401 && !config) {
      // Stale/revoked guest token — fall back to the password gate.
      await checkShareAccess();
      return;
    }
    if (!res.ok) {
      error = res.status === 404 ? 'Terminal not found' : 'Failed to load terminal';
      loading = false;
      return;
    }
    terminal = (await res.json()) as TerminalDetailView;
    if (config) {
      authMode = 'owner';
    } else {
      authMode = 'guest';
      guestMode = terminal.shareMode ?? 'view';
    }
  } catch {
    error = 'Failed to connect to server';
  }
  loading = false;
}

async function checkShareAccess(): Promise<void> {
  try {
    const res = await fetch(`/api/terminals/${terminalId}/share/status`);
    if (res.ok) {
      const data = (await res.json()) as ShareStatusResponse;
      if (data.shared) {
        shareGateVisible = true;
        loading = false;
        return;
      }
    }
  } catch {
    // Fall through to the configuration error.
  }
  error = 'No configuration found. Please configure settings first.';
  loading = false;
}

async function submitSharePassword(password: string): Promise<null | string> {
  try {
    const res = await fetch(`/api/terminals/${terminalId}/share/auth`, {
      body: JSON.stringify({ password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (res.status === 429) {
      return 'Too many attempts — try again in a minute.';
    }
    if (!res.ok) {
      return 'Incorrect password.';
    }
    const data = (await res.json()) as ShareAuthResponse;
    storeShareToken(data.token);
    shareGateVisible = false;
    loading = true;
    await fetchTerminal();
    if (terminal && !error) {
      initViews();
    }
    return null;
  } catch {
    return 'Failed to reach the server.';
  }
}
```

(e) **Extract the view-init tail of `onMount` into `initViews()`** so the gate path can reuse it:

```ts
function initViews(): void {
  if (isAI && window.innerWidth < 768) {
    viewMode = 'chat';
  } else {
    viewMode = 'raw';
  }

  if (viewMode === 'raw') {
    requestAnimationFrame(() => {
      void initRawTerminal();
    });
    rawInitialized = true;
  } else {
    void connectSessionWs();
    chatInitialized = true;
  }
}
```

and `onMount` becomes: `await fetchTerminal();` → disposed guard → shortcut manager → `if (!terminal || error) return;` → `initViews();`.

(f) **`getWsTicket()`** — replace `getConfig()` usage with `getBearer()`:

```ts
  async function getWsTicket(): Promise<null | string> {
    const bearer = getBearer();
    if (!bearer) {
      return null;
    }
    try {
      const res = await fetch('/api/ws-ticket', {
        headers: { Authorization: `Bearer ${bearer}` },
        method: 'POST',
      });
      ...
```

(g) **`initRawTerminal()`** — pass the new options:

```ts
      const instance = await createTerminal({
        apiKey: getBearer() ?? undefined,
        container: termContainer,
        fontSize: window.innerWidth < 768 ? 12 : 14,
        getTicket,
        initialCols: terminal.cols,
        initialRows: terminal.rows,
        readOnly: viewOnly,
        ...
```

(h) **Template gating:**

- New branch order: `{#if loading}` → `{:else if shareGateVisible}` render `<ShareGate onSubmit={submitSharePassword} />` inside a `term-page` wrapper → `{:else if error}` → `{:else if terminal}`.
- Back link `<a href="/terminals" class="term-back">`: wrap in `{#if isOwner}`.
- Session link condition: `{#if isOwner && isAI && ...}` (guests cannot open `/session/[id]`).
- Kill/Remove buttons block: wrap the whole `{#if isRunning}` button pair in `{#if isOwner}`.
- Add a Share button (owner only) next to the shortcuts button: `{#if isOwner}<Button classes="btn-secondary btn-sm" onclick={() => { shareSheetOpen = true; }} text="Share" />{/if}` and render `<ShareSheet open={shareSheetOpen} {terminalId} {shareUrl} onClose={() => { shareSheetOpen = false; }} />` next to ShortcutsHelp at the bottom.
- Raw input area: `{#if isRunning && viewMode === 'raw' && !viewOnly}`.
- ChatView: `showInput={isRunning && !viewOnly}`.
- `paletteCommands`: gate the Kill entry with `if (isRunning && isOwner)`.

- [ ] **Step 5: Validate & commit**

Run: `pnpm check && pnpm lint && pnpm build`. Expected: PASS.

```bash
git add src/lib/modules/client/terminal/ src/routes/terminals/
git commit -m "feat(sharing): guest password gate, view-only mode, owner share sheet"
```

---

### Task 8: Full quality pass

- [ ] Run: `pnpm gen:types` — expect no diff (`git status` clean for `src/lib/types/generated/`).
- [ ] Run: `pnpm quality:all` (lint + format:check + check). Expected: PASS. Fix `pnpm format` if format:check fails.
- [ ] Run: `pnpm test`. Expected: all suites incl. `share-store.test.cjs` PASS.
- [ ] Run: `pnpm build`. Expected: success.
- [ ] Commit any fixes: `git commit -am "chore(sharing): quality pass fixes"`.

---

### Task 9: Live end-to-end verification

Sandboxed server (isolated HOME so the real `~/.shooter/shooter.db` is untouched):

```bash
mkdir -p /tmp/shooter-e2e
HOME=/tmp/shooter-e2e API_KEY=e2e-test-key PORT=54012 npx tsx server.ts
```

- [ ] **REST sequence (curl):**
  1. `POST /api/terminals` (owner) `{"command":"bash"}` → capture `id`.
  2. `GET /api/terminals/<id>/share/status` (no auth) → `{"shared":false}`.
  3. `PUT /api/terminals/<id>/share` (owner) `{"password":"secret123","mode":"view"}` → `{active:true, mode:"view"}`.
  4. `GET .../share/status` → `{"shared":true}`.
  5. `POST .../share/auth` wrong password → 401. 11× wrong → 429.
  6. `POST .../share/auth` `{"password":"secret123"}` → `{token, mode:"view", expiresAt}`.
  7. `GET /api/terminals/<id>` with guest token → 200 incl. `shareMode:"view"`, `cols`, `rows`.
  8. `GET /api/terminals` (list) with guest token → 401 (scope works).
  9. `POST /api/terminals/<id>/resize` with guest token → 403 (view mode).
  10. `POST /api/ws-ticket` with guest token → ticket.
- [ ] **WS scope checks** (node script with the `ws` package):
  - scoped ticket on `/ws/events` → upgrade rejected (403).
  - scoped ticket on `/ws/terminal/<other-id>` → 403.
  - scoped ticket on `/ws/terminal/<id>` → connects, receives scrollback; send `{"type":"input","data":"echo HACKED\r"}`; owner `GET /api/terminals/<id>` `lastOutput` must NOT contain `HACKED`.
  - flip share to `control` (PUT) → guest socket force-closed (code 4001); re-ticket + reconnect; input now executes.
  - `DELETE .../share` → socket closes 4001; guest token now 401 on `GET /api/terminals/<id>`.
- [ ] **Browser pass** (debug Chrome / agent-browser against `http://localhost:54012/terminals/<id>` with cleared localStorage): password gate renders → wrong password shows error → correct password loads live terminal → typing does nothing in view mode → owner tab (configured apiKey) shows Share button and can revoke, kicking the guest.
- [ ] Stop the sandbox server.

---

### Task 10: Squash to a single semantic commit

CI (`single-commit-enforcement.yml`) requires exactly one commit on the branch.

```bash
git log --oneline release..HEAD   # review
git reset --soft $(git merge-base HEAD release)
git commit -m "feat(sharing): password-protected single-terminal sharing

Share one terminal at its existing /terminals/[id] route. Per-share
password (scrypt) and mode (view-only or full control), active until
revoked. Guest sessions are scoped bearer tokens; WS tickets carry a
terminal scope enforced server-side (input dropped in view mode, events
and foreign channels denied). Owner manages shares from a Share sheet
on the terminal page; guests get a password gate."
```

Do **not** push without explicit approval.

---

## Self-review notes

- Spec coverage: data model (T2), owner/guest/dual-auth endpoints (T6), WS scope + read-only + subscribe lock + resize broadcast (T4/T5), guest registry force-close (T3/T6), frontend gate/view-only/share-sheet (T7), types (T1), tests+e2e (T2/T8/T9), single commit (T10). `DELETE /api/terminals/[id]` revokes share — T6 Step 5. Orphan cleanup — T2 `cleanup()`.
- Type names consistent: `ShareMode`, `AccessContext`, `TicketScope`, `ShareAuthResponse`, `ShareStatusResponse`, `ShareInfoResponse`, `ShareConfigRequest`, `TerminalShareRecord`; store API `getShare/setShare/deleteShare/createSession/resolveToken/deleteSessions/cleanup`; helpers `resolveAccess/bearerToken`, registry `registerGuest/closeGuests`.
- Known judgment calls: reuse of `TerminalResizeMessage` shape for the server broadcast; guests keep sessions on mode change (only sockets closed); page HTML remains public (pre-existing posture).
