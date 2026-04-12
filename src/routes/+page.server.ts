import { env } from '$env/dynamic/private';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  googleAiConfigured: Boolean(env.GOOGLE_AI_API_KEY?.trim()),
});
