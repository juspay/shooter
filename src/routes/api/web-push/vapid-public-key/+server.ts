import { getWebPushPublicKey } from '$lib/modules/server/webpush/web-push-service';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// The VAPID public key is, by design, public — a client needs it to subscribe.
// No auth so the subscription flow can bootstrap before anything else.
export const GET: RequestHandler = () => {
  return json({ publicKey: getWebPushPublicKey() });
};
