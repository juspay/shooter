// Resolves a terminal-scoped request to owner (API key) or guest (share token).
// Kept separate from auth.ts so routes without share semantics don't pull in SQLite.

import type { AccessContext } from '$lib/types';

import { validateAuth } from '../auth';
import { shareStore } from './share-store';

/** Extract the Bearer token from a request, or null. */
export function bearerToken(request: Request): null | string {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7).trim();
}

/**
 * Resolve access for a request targeting one terminal.
 * Owner (valid API key) → { level: 'owner' }.
 * Guest (valid share session for THIS terminal) → { level: 'guest', mode }.
 * Anything else → null.
 */
export function resolveAccess(request: Request, terminalId: string): AccessContext | null {
  if (validateAuth(request) === null) {
    return { level: 'owner', mode: null };
  }
  const token = bearerToken(request);
  if (!token) {
    return null;
  }
  const session = shareStore.resolveToken(token);
  if (session?.terminalId !== terminalId) {
    return null;
  }
  return { level: 'guest', mode: session.mode };
}
