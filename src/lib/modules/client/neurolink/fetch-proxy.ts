// Intercept fetch calls to CORS-restricted AI provider endpoints and route
// them through the SvelteKit server proxy at /api/neurolink-proxy.
// This is a browser-only workaround — in Node/Electron there's no CORS.

import { getApiKey } from '$lib/modules/client/common';

const PROXY_PREFIXES: Record<string, string> = {
  'https://api.anthropic.com/': 'anthropic',
  'https://api.mistral.ai/': 'mistral',
  'https://api.openai.com/': 'openai',
  'https://generativelanguage.googleapis.com/': 'google-ai',
};

let installed = false;

/** Install the fetch proxy. Safe to call multiple times — only installs once. */
export function installFetchProxy(): void {
  if (installed || typeof globalThis === 'undefined') {
    return;
  }
  installed = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    const provider = Object.entries(PROXY_PREFIXES).find(([prefix]) => url.startsWith(prefix))?.[1];

    if (!provider) {
      return originalFetch(input, init);
    }

    // Strip provider auth headers — server re-injects from env
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : {});
    const iterable =
      rawHeaders instanceof Headers
        ? rawHeaders
        : Object.entries(rawHeaders as Record<string, string>);
    for (const [k, v] of iterable) {
      const lk = k.toLowerCase();
      if (lk !== 'x-api-key' && lk !== 'authorization') {
        headers[k] = v;
      }
    }

    let body: unknown;
    try {
      body = JSON.parse(
        (init?.body as string) ?? (input instanceof Request ? await input.text() : '{}')
      );
    } catch {
      body = {};
    }

    // Authenticate with our own server using the Shooter API key
    const apiKey = getApiKey();
    const proxyHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      proxyHeaders.Authorization = `Bearer ${apiKey}`;
    }

    return originalFetch('/api/neurolink-proxy', {
      body: JSON.stringify({ body, headers, provider, url }),
      headers: proxyHeaders,
      method: 'POST',
    });
  };
}
