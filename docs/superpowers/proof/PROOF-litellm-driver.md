# Proof — LiteLLM wired into the driver's decide step

The browser driver's `produceCommand` now tries: on-device (iOS) → **LiteLLM via the server proxy** →
heuristic. This makes the in-browser decide step a _real_ LLM call (key stays server-side), so PROSE
next-steps become concrete commands instead of being skipped.

## Honest finding: the real LiteLLM key is blocked

`POST /api/neurolink-proxy → grid.ai.juspay.net` returns **HTTP 401
`{"message":"Authentication Error, Key is blocked..."}`**. So the wiring is correct (it reaches the
upstream), but the configured `LITELLM_API_KEY` is disabled on the gateway — a credential issue to fix
on your side (`/key/unblock`), not a code bug. A real completion can't flow through grid.ai here.

## Verified with a deterministic mock LLM (proves my code)

To verify the producer code independent of the blocked key, pointed `LITELLM_BASE_URL` at a local
mock returning `ls -la`, then in the live browser:

- Seeded a **prose** next-step: _"List all files in the working directory with details"_ (the
  heuristic returns null for prose).
- Emitted `agent-idle`. The driver called LiteLLM (via the proxy) → mock returned `ls -la` →
  `guardCommand` passed → injected into the managed bash PTY.
- PTY: `ls -la\r\ntotal 0\r\ndrwxr-xr-x@ 4 sachinsharma wheel … .\r\ndrwxrwxrwt 353 root wheel … ..` —
  bash ran the LLM-produced command and listed the directory.

So: browser → proxy → LLM → parse → guard → inject → execute is verified end-to-end. The real grid.ai
path is verified up to the upstream (reaches it; key blocked). Unblock the key and the same path runs
against the real model.
