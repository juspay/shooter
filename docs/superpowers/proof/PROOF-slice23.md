# Slice 2 + 3 Proof

Verified against the live isolated server (`:54012`, isolated `HOME`) and the real browser.

## Slice 2 — "Away" presence signal + push correctness

`POST /api/presence` round-trip (curl):

| Step                    | Result                                   |
| ----------------------- | ---------------------------------------- |
| initial (no report)     | `{"everReported":false,"present":false}` |
| POST `foreground` → GET | `{"everReported":true,"present":true}`   |
| POST `background` → GET | `{"everReported":true,"present":false}`  |
| POST `{state:"bogus"}`  | `400`                                    |
| GET with no auth        | `401`                                    |

- **Browser auto-reports:** after a dashboard reload, `GET /api/presence` returned
  `{"everReported":true,"present":true}` — the panel's `startPresenceReporting()` posted a
  `foreground` heartbeat on mount, with no manual step.
- **Engine gate:** `autopilot-engine.ts push()` now returns early when `isViewerPresent()` —
  the same function unit-tested in `tests/presence-store.test.cjs` (6 passing) and verified via the
  endpoint above. So the engine pushes only when the viewer is **away**, instead of always pushing
  (the prior behavior — the engine never set `skipPush`). Backward-compatible: with no presence ever
  reported, `isViewerPresent()` is false → push proceeds as before.

## Slice 3 — LiteLLM client fetch-proxy routing

Browser (`/neurolink`, fetch proxy installed), after fix:

```js
{ base: "http://grid.ai.juspay.net/v1",
  anthropicViaProxy: true,            // static prefix still routes
  litellmViaProxy: true,             // ← litellm now routes through the proxy
  litellmRoutedTo: "http://localhost:54012/api/neurolink-proxy",
  unrelatedNotProxied: true }        // example.com passes through untouched
```

### Bug found _by_ the browser test (and fixed)

First attempt: `litellmViaProxy: false`. The minified bundle showed
`function m(){const t=u; ... t.LITELLM_BASE_URL ...}` — Vite/Rollup had **constant-folded
`globalThis.process.env` to the build-time Node env** (`u`), so it never saw the runtime
`window.process.env` the root layout injects. Fix: read via `window['process']` (bracket access),
which the bundler cannot fold — the minified accessor became
`window.process?.env?.LITELLM_BASE_URL` (a runtime read). A unit test would not have caught this;
the live browser check did.

Net effect: browser-side NeuroLink calls using `provider:'litellm'` now route through
`/api/neurolink-proxy` (server injects `LITELLM_API_KEY`) instead of hitting the LiteLLM origin
directly — so the in-WebView decide step can use LiteLLM without exposing the key or hitting CORS.
