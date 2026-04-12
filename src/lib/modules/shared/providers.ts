import type { ProviderId } from '$lib/types';

/** Env key names required for each provider to be considered configured. */
export const PROVIDER_ENV_KEYS: Record<ProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  'google-ai': ['GOOGLE_AI_API_KEY'],
  litellm: ['LITELLM_API_KEY', 'LITELLM_BASE_URL'],
  mistral: ['MISTRAL_API_KEY'],
  openai: ['OPENAI_API_KEY'],
};

/** Check which providers have credentials configured. */
export function getProviderAvailability(
  env: Record<string, string | undefined>
): Record<ProviderId, boolean> {
  const result = {} as Record<ProviderId, boolean>;
  for (const [id, keys] of Object.entries(PROVIDER_ENV_KEYS)) {
    result[id as ProviderId] = keys.every((k) => Boolean(env[k]?.trim()));
  }
  return result;
}
