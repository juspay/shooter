import { env } from '$env/dynamic/private';
import { getProviderAvailability } from '$lib/modules/shared/providers';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
  aiProviders: getProviderAvailability(env),
  litellmBaseUrl: env.LITELLM_BASE_URL ?? '',
  litellmModel: env.LITELLM_MODEL ?? 'open-large',
  neurolinkProvider: env.NEUROLINK_PROVIDER ?? '',
});
