// Provider registry — single source of truth for all NeuroLink providers.
// Used by summarizers, settings page, setup wizard, and playground.

import type { ProviderId } from '$lib/types';

export const PROVIDERS = [
  {
    cors: 'proxy' as const,
    envKeys: ['GOOGLE_AI_API_KEY'],
    id: 'google-ai' as const,
    label: 'Google AI',
    model: 'gemini-3.1-flash-lite-preview',
  },
  {
    cors: 'proxy' as const,
    envKeys: ['ANTHROPIC_API_KEY'],
    id: 'anthropic' as const,
    label: 'Anthropic',
    model: 'claude-haiku-4-5-20251001',
  },
  {
    cors: 'proxy' as const,
    envKeys: ['OPENAI_API_KEY'],
    id: 'openai' as const,
    label: 'OpenAI',
    model: 'gpt-4o-mini',
  },
  {
    cors: 'proxy' as const,
    envKeys: ['MISTRAL_API_KEY'],
    id: 'mistral' as const,
    label: 'Mistral',
    model: 'mistral-small-2506',
  },
  {
    cors: 'direct' as const,
    envKeys: ['LITELLM_API_KEY', 'LITELLM_BASE_URL'],
    extraEnvKeys: ['LITELLM_MODEL'],
    id: 'litellm' as const,
    label: 'LiteLLM',
    model: 'open-large',
  },
] as const;

// ProviderId imported from $lib/types — canonical definition lives there.

/**
 * Detect which provider to use based on available env vars.
 * Checks window.process.env for browser-side keys (litellm)
 * and trusts server-passed flags for proxy providers (google-ai, anthropic, openai, mistral).
 *
 * @param serverFlags - Per-provider availability from +page.server.ts
 * @param preferredProvider - Optional override (from NEUROLINK_PROVIDER env var)
 */
export function detectActiveProvider(
  serverFlags?: Record<string, boolean>,
  preferredProvider?: string
): null | { model: string; provider: ProviderId } {
  // If user explicitly set a preferred provider, try it first — but only if
  // credentials are actually available (serverFlags for proxy providers,
  // browser env for direct providers). Without this gate a misconfigured
  // NEUROLINK_PROVIDER would bypass the fallback loop and silently fail.
  if (preferredProvider) {
    const prov = PROVIDERS.find((p) => p.id === preferredProvider);
    if (prov) {
      if (prov.cors === 'direct') {
        const env =
          typeof window !== 'undefined'
            ? ((window as unknown as { process?: { env?: Record<string, string> } }).process?.env ??
              {})
            : {};
        if (prov.envKeys.every((k) => Boolean(env[k]))) {
          return { model: prov.model, provider: prov.id };
        }
      } else if (serverFlags?.[prov.id]) {
        return { model: prov.model, provider: prov.id };
      }
    }
  }

  const env =
    typeof window !== 'undefined'
      ? ((window as unknown as { process?: { env?: Record<string, string> } }).process?.env ?? {})
      : {};

  for (const prov of PROVIDERS) {
    if (prov.cors === 'direct') {
      // Check browser env vars
      const hasKey = prov.envKeys.every((k) => Boolean(env[k]));
      if (hasKey) {
        return { model: prov.model, provider: prov.id };
      }
    } else {
      // Check server-passed flags
      if (serverFlags?.[prov.id]) {
        return { model: prov.model, provider: prov.id };
      }
    }
  }

  return null;
}

/** Get the provider entry by ID. */
export function getProvider(id: ProviderId): (typeof PROVIDERS)[number] {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}
