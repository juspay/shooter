/**
 * Pure builders for the APNs Live Activity (ActivityKit) push shape.
 *
 * Separated from library-apns.ts so the exact `aps` envelope and topic — the
 * parts APNs is picky about — are deterministically unit-tested. ActivityKit
 * pushes go to a topic of `<bundleId>.push-type.liveactivity` with
 * `apns-push-type: liveactivity`, and the body carries `event`, a unix
 * `timestamp`, and the `content-state` mirroring the Swift struct.
 */

import type { LiveActivityPushInput } from '$lib/types';

/**
 * Build the `{ aps: {...} }` body for a Live Activity push. `nowSec` is the unix
 * timestamp (seconds) APNs requires on every ActivityKit push; it is injected
 * so the builder stays pure and testable.
 */
export function buildLiveActivityBody(
  input: LiveActivityPushInput,
  nowSec: number
): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    'content-state': input.contentState,
    event: input.event,
    timestamp: nowSec,
  };

  if (typeof input.staleDate === 'number') {
    aps['stale-date'] = input.staleDate;
  }
  if (input.event === 'end' && typeof input.dismissalDate === 'number') {
    aps['dismissal-date'] = input.dismissalDate;
  }
  if (typeof input.relevanceScore === 'number') {
    aps['relevance-score'] = input.relevanceScore;
  }
  if (input.alert) {
    aps.alert = { body: input.alert.body, title: input.alert.title };
  }

  return { aps };
}

/** The APNs topic ActivityKit pushes must target. */
export function liveActivityTopic(bundleId: string): string {
  return `${bundleId}.push-type.liveactivity`;
}
