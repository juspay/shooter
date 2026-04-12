// Server-side proxy for AI providers that block direct browser requests (CORS).
// The browser NeuroLink bundle POSTs here; this endpoint forwards to the real API.
// Currently supports: anthropic (api.anthropic.com blocks browser fetch).

import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// Per-provider allowlist of client-supplied headers that may be forwarded
// upstream. Everything else (including host, x-forwarded-*, content-type) is
// dropped so the browser can't influence provider behavior beyond what we
// explicitly permit.
const ALLOWED_CLIENT_HEADERS: Record<string, Set<string>> = {
  anthropic: new Set(['anthropic-beta', 'anthropic-version']),
  'google-ai': new Set<string>([]),
  mistral: new Set([]),
  openai: new Set(['openai-organization', 'openai-project']),
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { provider?: unknown }).provider !== 'string' ||
    typeof (payload as { url?: unknown }).url !== 'string' ||
    !(payload as { headers?: unknown }).headers ||
    typeof (payload as { headers?: unknown }).headers !== 'object'
  ) {
    return json({ error: 'Invalid proxy payload' }, { status: 400 });
  }

  const {
    body,
    headers: reqHeaders,
    provider,
    url,
  } = payload as {
    body: unknown;
    headers: Record<string, string>;
    provider: string;
    url: string;
  };

  // Only proxy known safe providers — never forward arbitrary URLs
  const ALLOWED_PREFIXES: Record<string, string> = {
    anthropic: 'https://api.anthropic.com/',
    'google-ai': 'https://generativelanguage.googleapis.com/',
    mistral: 'https://api.mistral.ai/',
    openai: 'https://api.openai.com/',
  };

  const allowedPrefix = ALLOWED_PREFIXES[provider];
  if (!allowedPrefix || !url.startsWith(allowedPrefix)) {
    return json({ error: `Provider "${provider}" or URL not allowed` }, { status: 403 });
  }

  // Inject the server-side API key so the browser never sees it
  const apiKeyEnv: Record<string, string> = {
    anthropic: env.ANTHROPIC_API_KEY ?? '',
    'google-ai': env.GOOGLE_AI_API_KEY ?? '',
    mistral: env.MISTRAL_API_KEY ?? '',
    openai: env.OPENAI_API_KEY ?? '',
  };

  // Copy only explicitly-allowed headers per provider. Everything else is
  // dropped so the browser can't influence upstream behavior via host,
  // x-forwarded-*, organization selectors, provider feature toggles, etc.
  const allowedForProvider = ALLOWED_CLIENT_HEADERS[provider] ?? new Set<string>();
  const normalizedReqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeaders)) {
    const key = k.toLowerCase();
    if (allowedForProvider.has(key)) {
      normalizedReqHeaders[key] = v;
    }
  }

  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...normalizedReqHeaders,
  };

  // Override / set auth header with server-side key
  if (provider === 'anthropic') {
    forwardHeaders['x-api-key'] = apiKeyEnv.anthropic;
    forwardHeaders['anthropic-version'] = forwardHeaders['anthropic-version'] ?? '2023-06-01';
  } else if (provider === 'google-ai') {
    forwardHeaders['x-goog-api-key'] = apiKeyEnv['google-ai'];
  } else if (provider === 'openai') {
    forwardHeaders.Authorization = `Bearer ${apiKeyEnv.openai}`;
  } else if (provider === 'mistral') {
    forwardHeaders.Authorization = `Bearer ${apiKeyEnv.mistral}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 30_000);

  let resp: Response;
  try {
    resp = await fetch(url, {
      body: JSON.stringify(body),
      headers: forwardHeaders,
      method: 'POST',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    return json({ error: message }, { status: 502 });
  }
  clearTimeout(timeout);

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return json({ error: 'Upstream returned non-JSON response' }, { status: 502 });
  }

  return json(data, { status: resp.status });
};
