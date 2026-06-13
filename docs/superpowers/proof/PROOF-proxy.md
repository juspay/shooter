# LiteLLM via Server Proxy — Verification Proof (key stays server-side)

Follow-up to `PROOF.md`. The autonomous engine now reaches LiteLLM through the existing
server proxy (`/api/neurolink-proxy`) instead of calling the endpoint directly, so the
**API key never reaches the browser**. Verified live (dev server on :54010 with
`LITELLM_BASE_URL` pointed at the local mock **server-side**, browser driven via chrome-devtools).

## Security invariant — verified in the browser

`evaluate_script` on the dashboard returned:

```json
{
  "litellmBase": "http://127.0.0.1:54020/v1",
  "litellmModel": "open-large",
  "litellmKeyPresent": false,
  "anyKeyLeaked": []
}
```

- The base URL + model are injected by the server layout (safe to expose).
- **`litellmKeyPresent: false`** — the LiteLLM API key is NOT in `window.process.env`.
- No API key / secret / token of any kind leaked to the browser.

## Proxy routing — verified in the Network tab

A single pipeline run produced **6 `POST /api/neurolink-proxy` requests** (1 summary + 5
next-step agents) — and **zero** direct browser calls to the LiteLLM endpoint:

```
POST /api/neurolink-proxy  [200]   x6   (summary + 5 agents)
POST /api/summaries        [201]         (consensus persisted)
POST /api/notify           [200]         (force-push)
```

The server proxy injects `Authorization: Bearer <LITELLM_API_KEY>` and forwards only to the
configured `LITELLM_BASE_URL` (SSRF-safe prefix check).

## Result (unchanged behaviour, now key-safe)

Consensus rendered in the UI with vote badges — **4** "Run pnpm install with a clean lockfile",
**3** "Verify package.json exists in the working directory" — and persisted to `/api/summaries`.

Artifact: `04-consensus-via-proxy.png`.

## What changed (this follow-up)

- `neurolink-proxy/+server.ts` — `litellm` is now a supported proxy provider (server injects the
  key; validates the request URL against the configured base; empty-key/whitespace-base guarded).
- `litellm-json.ts` — posts to `/api/neurolink-proxy` (Shooter Bearer auth); requires only the base
  in the browser; returns `DIRECT_UNSUPPORTED` on proxy 401/403 so the SDK fallback still applies.
- `provider-config.ts` — `litellm` reclassified `cors:'proxy'` (was `'direct'`); key removed from
  client `envKeys`; dead direct-branch removed from `detectActiveProvider`.
- `+layout.server.ts` / `+layout.svelte` — inject `LITELLM_BASE_URL` + `LITELLM_MODEL` only (never the key).

`pnpm test` / `check` / `lint` / `build` all green.
