// Shared in-memory store for pending permission requests.
// Used by /api/notify (creates entries) and /api/response (reads/updates).

import type { PendingRequest } from '$generated/types';

export type { PendingRequest };

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const pendingRequests = new Map<string, PendingRequest>();

export function cleanup(maxAgeMs: number = MAX_AGE_MS): void {
  const now = Date.now();
  for (const [id, entry] of pendingRequests.entries()) {
    if (now - entry.createdAt > maxAgeMs) {
      pendingRequests.delete(id);
    }
  }
}

export function createPendingRequest(
  requestId: string,
  data: { sessionId: string; toolInput: Record<string, unknown>; toolName: string }
): void {
  cleanup();
  pendingRequests.set(requestId, {
    createdAt: Date.now(),
    decidedAt: null,
    decision: null,
    sessionId: data.sessionId,
    toolInput: data.toolInput,
    toolName: data.toolName,
  });
}

export function getDecision(requestId: string): {
  decision?: 'allow' | 'deny';
  status: 'decided' | 'not_found' | 'pending';
} {
  const entry = pendingRequests.get(requestId);
  if (!entry) {
    return { status: 'not_found' };
  }
  if (entry.decision) {
    // Clean up after reading a decided response
    pendingRequests.delete(requestId);
    return { decision: entry.decision, status: 'decided' };
  }
  return { status: 'pending' };
}

export function setDecision(requestId: string, decision: 'allow' | 'deny'): boolean {
  const entry = pendingRequests.get(requestId);
  if (!entry) {
    return false;
  }
  entry.decision = decision;
  entry.decidedAt = Date.now();
  return true;
}
