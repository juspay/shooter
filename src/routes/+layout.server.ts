import { env } from '$env/dynamic/private';
import { getProviderAvailability } from '$lib/modules/shared/providers';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
  aiProviders: getProviderAvailability(env),
  neurolinkProvider: env.NEUROLINK_PROVIDER ?? '',
});
