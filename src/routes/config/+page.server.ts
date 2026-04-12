import { env } from '$env/dynamic/private';
import { getProviderAvailability } from '$lib/modules/shared/providers';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  activeProvider: env.NEUROLINK_PROVIDER ?? '',
  aiProviders: getProviderAvailability(env),
});
