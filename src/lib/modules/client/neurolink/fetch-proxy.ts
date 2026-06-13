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

    const provider = resolveProvider(url);

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

/**
 * The runtime LiteLLM base URL injected by the root layout into window.process.env, or ''.
 * Read via window['process'] (bracket access) so the bundler does NOT constant-fold it: a
 * direct `globalThis.process.env` gets frozen to Node's build-time env by Vite/Rollup, which
 * never contains the runtime-injected value.
 */
function litellmBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  // eslint-disable-next-line @typescript-eslint/dot-notation -- bracket access is deliberate: it stops the bundler constant-folding process.env to the build-time value
  const proc = (window as unknown as Record<string, unknown>)['process'] as
    | undefined
    | { env?: Record<string, string | undefined> };
  const base = proc?.env?.LITELLM_BASE_URL;
  return typeof base === 'string' ? base : '';
}

/**
 * Resolve which proxy provider (if any) a URL routes through. Static cloud prefixes plus the
 * runtime LiteLLM base URL — LiteLLM is self-hosted at a configurable origin, so its prefix
 * is not known at build time and must be read from the injected env.
 */
function resolveProvider(url: string): string | undefined {
  const staticMatch = Object.entries(PROXY_PREFIXES).find(([prefix]) =>
    url.startsWith(prefix)
  )?.[1];
  if (staticMatch) {
    return staticMatch;
  }
  const base = litellmBaseUrl();
  if (base && url.startsWith(base)) {
    return 'litellm';
  }
  return undefined;
}
