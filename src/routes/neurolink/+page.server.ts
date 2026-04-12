import { env } from '$env/dynamic/private';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  // LiteLLM base URL and model name are safe to pass (not secrets)
  litellmBaseUrl: env.LITELLM_BASE_URL ?? '',
  litellmModel: env.LITELLM_MODEL ?? 'open-large',
  // All API keys stay server-side — injected by /api/neurolink-proxy
});
