# Terminal Sharing — Design Spec

**Date:** 2026-06-11
**Branch:** `feat/terminal-sharing`
**Status:** Approved (design approved by Sachin on 2026-06-11)

## Goal

Let the owner share a single terminal (e.g. `https://shooter.breezehq.dev/terminals/947cf980`) with someone who has no Shooter API key. The visitor opens the **existing route**, enters a per-share password, and gets access to **that one terminal only** — view-only or full control, chosen per share. The share stays active until revoked. Everything else in the app (other terminals, sessions, SOS, events, settings, all other API routes) remains inaccessible to the visitor.

## Decisions (user-confirmed)

| Decision    | Choice                                                          |
| ----------- | --------------------------------------------------------------- |
| Access mode | Chosen per share: `view` (watch only) or `control` (full input) |
| Lifetime    | Until revoked (manual revoke from the terminal page)            |
| Password    | Per-share, set (or generated) in the UI when enabling sharing   |
| URL         | The existing `/terminals/[id]` route — no separate share URL    |

## Approach

Scoped share tokens layered onto the existing auth patterns (Bearer headers + short-lived WS tickets). No new dependencies; all crypto via `node:crypto`. Enforcement is server-side at every surface (REST + WebSocket), never UI-only.

## Data model

Two new tables in `~/.shooter/shooter.db`, managed by a new `src/lib/modules/server/terminal/share-store.ts` following the exact patterns of `terminal-store.ts` (WAL pragma, `CREATE TABLE IF NOT EXISTS`, snake_case columns, `globalThis` singleton).

```sql
CREATE TABLE IF NOT EXISTS terminal_shares (
  terminal_id   TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,        -- scrypt:<salt-hex>:<hash-hex>
  mode          TEXT NOT NULL,        -- 'view' | 'control'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS share_sessions (
  token_hash  TEXT PRIMARY KEY,       -- sha256 hex of the guest bearer token
  terminal_id TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL        -- created_at + 7 days
);
```

- **Password hashing:** `crypto.scryptSync(password, salt, 64)` with a 16-byte random salt per share; stored as `scrypt:<salt>:<hash>`. Verified with `timingSafeEqual`.
- **Guest tokens:** `randomBytes(32).toString('hex')` returned to the client once; only the sha256 hash is stored. Sessions expire after 7 days (guest re-enters the password); revoke deletes them immediately.
- **Cleanup:** expired sessions purged on access/startup; shares whose `terminal_id` no longer exists in `terminals` are purged on startup (same cadence as terminal-store's 24 h cleanup).

## API

### Owner endpoints (Bearer `API_KEY`, via existing `validateAuth`)

| Endpoint                           | Behavior                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/terminals/[id]/share`    | `{ active, mode, createdAt, updatedAt }` or `{ active: false }`                                                                                                                                                                                                                                                    |
| `PUT /api/terminals/[id]/share`    | Body `{ password?, mode }`. Creates or updates. Password required on create (min 6 chars); omitting it on update keeps the existing one. New password ⇒ delete all guest sessions + force-close guest sockets. Mode change ⇒ force-close guest sockets (sessions stay valid; guests reconnect with the new scope). |
| `DELETE /api/terminals/[id]/share` | Revoke: delete share + sessions, force-close guest sockets.                                                                                                                                                                                                                                                        |

`DELETE /api/terminals/[id]` (kill/remove terminal) also revokes any share for that terminal.

### Guest endpoints (no API key)

| Endpoint                               | Behavior                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/terminals/[id]/share/status` | Public probe: `{ shared: boolean }`. Never reveals mode or anything else.                                                                                                               |
| `POST /api/terminals/[id]/share/auth`  | Body `{ password }`. Rate-limited (10 attempts/min per client-IP+terminal, in-memory; 429 on exceed). On success: `{ token, mode, expiresAt }`. 404 if no share; 401 on wrong password. |

### Endpoints that additionally accept a guest token (scoped to its terminal only)

A shared helper `resolveAccess(request, terminalId)` returns `{ level: 'owner' } | { level: 'guest', mode } | null`: it first runs the existing timing-safe API-key check, then looks up the presented bearer token's sha256 in `share_sessions` (matching `terminal_id`, unexpired).

| Endpoint                               | Guest access                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/terminals/[id]`              | Both modes. Response gains optional `shareMode` field when accessed by a guest (authoritative per-request, so mode changes propagate on refresh/reconnect). |
| `POST /api/ws-ticket`                  | Both modes — but issues a **scoped** ticket (below). Rate limit keyed by token hash.                                                                        |
| `POST /api/terminals/[id]/resize`      | `control` only.                                                                                                                                             |
| `POST /api/terminals/[id]/paste-image` | `control` only.                                                                                                                                             |

Every other route is untouched and stays API-key-only.

## WebSocket enforcement

The in-memory `Ticket` gains optional scope fields: `terminalId?: string`, `readOnly?: boolean` (in `specs/types/ws-protocol.yaml`).

- `generateTicket(scope?)` stores the scope; `validateTicket(ticket)` now returns the consumed `Ticket | null` instead of boolean (the `server.ts` upgrade handler passes the scope down to `setupWebSocketHandlers`).
- **Routing gate** (central, in `setupWebSocketHandlers`): a scoped ticket may only open `/ws/terminal/<scopedId>` or `/ws/session/<scopedId>`. Everything else — other ids, `/ws/events`, `/ws/super-session/*` — is destroyed. (`/ws/events` broadcasts every terminal's activity, so it is denied outright.)
- **Terminal channel**, scoped + read-only: inbound `input`, `resize`, `signal` frames are dropped.
- **Session channel**, scoped: `subscribe.sessionId` must equal the scoped terminal id (no pivoting to other sessions); `send-input` and `cancel` are dropped when read-only.
- **Guest connection registry:** scoped connections are tracked per terminal (globalThis map, like the events-client set) so revoke/mode-change/password-change can force-close them.
- **New server→client frame `{ type: 'resize', cols, rows }`** broadcast to all attached terminal-channel clients when the PTY is resized. View-only guests apply it to their xterm (they cannot resize the PTY and otherwise render garbled output after an owner resize). Existing clients ignore unknown frame types.

## Frontend (`/terminals/[id]`)

**Guest flow:** on mount, if no API key is configured → `GET .../share/status`. If shared, check `localStorage` (`shooter_share_tokens`: `{ [terminalId]: token }`) and try the terminal fetch with it; on 401/missing, show a password gate (ShareGate component). Successful auth stores the token and the page proceeds through the normal flow (terminal fetch → ws-ticket → WS connect) using the share token as the bearer. If not shared and no API key → existing "no configuration" error.

**View-only rendering:** xterm wrapper gets a `readOnly` option — keystrokes not forwarded, no resize messages (xterm fixed to the PTY's `cols`/`rows` from the terminal record, updated by `resize` frames), paste disabled. QuickKeys hidden; ChatView input/cancel hidden; kill/delete actions hidden. `control` mode behaves like the owner view minus owner-only actions (kill, share management).

**Owner share UI:** a Share button on the terminal detail page opens a ShareSheet: enable sharing (password input + "generate" button producing a 16-char random password, mode picker view/control), shows the shareable URL (the current page URL) with copy button, shows active state, allows mode change and revoke.

## Types

- `specs/types/share.yaml` (new group `Share` in `specs/types/index.yaml`): `ShareMode` enum, `TerminalShareRecord`, `ShareSessionRecord`, `ShareInfoResponse`, `ShareStatusResponse`, `ShareAuthRequest`, `ShareAuthResponse`, `ShareConfigRequest`, `AccessContext` (`{ level: 'owner' | 'guest', mode?: ShareMode }`).
- `ws-protocol.yaml`: `Ticket` scope fields; terminal server message union gains `resize` frame (hand-written `Wire*` union in `src/lib/types/ws.ts` updated accordingly).
- All imports via the `$lib/types` barrel; `pnpm gen:types` after YAML edits.

## Security notes

- Passwords never stored or logged in plaintext; scrypt + per-share salt; `timingSafeEqual` everywhere secrets are compared.
- Guest tokens stored hashed at rest; transmitted only over HTTPS (Cloudflare Tunnel) as Bearer headers; WS still uses single-use 30 s tickets so tokens never appear in URLs.
- Brute-force: per-IP+terminal rate limit on `/share/auth` (uses `cf-connecting-ip` → `x-forwarded-for` → `getClientAddress()`).
- Page HTML was already publicly served (no SSR auth exists today); data access is what is gated — unchanged posture.
- The public `share/status` probe leaks only the boolean existence of a share for an 8-hex-char terminal id; acceptable.

## Testing & verification

1. `tests/share-store.test.cjs` — mirrors repo convention (plain `.cjs`, replicated schema against `/tmp`): share CRUD, scrypt hash/verify roundtrip incl. wrong password, session create/lookup/expiry, revoke cascade, orphan cleanup. Added to the `test` script in `package.json`.
2. `pnpm quality:all` (lint, format, svelte-check, tsc strict) + `pnpm build` + `pnpm test` all pass.
3. **Live end-to-end:** build & run the server, create a terminal, enable a share via API, then verify with curl: status probe, wrong-password 401, rate-limit 429, auth success, guest terminal fetch, scoped ws-ticket, scoped-WS rejection of `/ws/events` and foreign terminal ids, read-only input drop, revoke force-close. Then a browser pass on the real page (password gate → live terminal; view-only typing blocked).

## Done criteria

An incognito browser can open `/terminals/<id>`, enter the password, and watch (or control, per share mode) that terminal live. Typing in view-only mode does nothing (server-side drop). Revoking from the owner page disconnects the guest within seconds. No other terminal, session, event stream, or API endpoint is reachable with the guest's credentials. CI quality gates pass; single squashed semantic commit.
