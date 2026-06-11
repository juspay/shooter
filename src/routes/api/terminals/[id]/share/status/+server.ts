// GET /api/terminals/[id]/share/status — public probe used by the page to
// decide whether to show the password gate. Reveals only a boolean.

import { shareStore } from '$lib/modules/server/terminal/share-store';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
  return json({ shared: shareStore.getShare(params.id) !== null });
};
