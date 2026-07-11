// iOS Live Activity (ActivityKit) push types.
//
// Hand-written (nested content-state shape + used by a pure builder that is
// unit-tested). Deliberately free of Node built-ins so the barrel stays
// client-safe. The iOS ActivityKit extension that consumes these lives under
// ios/ (see the Live Activity integration guide) and is added in Xcode.

/**
 * The dynamic content ActivityKit renders on the Lock Screen / Dynamic Island.
 * Must stay in sync with the Swift `ContentState` struct in the widget extension.
 */
export interface LiveActivityContentState {
  detail?: string; // secondary line, e.g. the last tool or message
  progress?: number; // 0..1, optional determinate progress
  status: string; // e.g. "Running", "Awaiting input", "Done"
  title: string; // e.g. the session / terminal name
  updatedAt: string; // ISO timestamp of this update
}

/** ActivityKit push event: start a new activity, update it, or end it. */
export type LiveActivityEvent = 'end' | 'start' | 'update';

/** Everything needed to push one Live Activity update to APNs. */
export interface LiveActivityPushInput {
  alert?: { body: string; title: string }; // optional breakthrough alert
  contentState: LiveActivityContentState;
  dismissalDate?: number; // unix seconds; only meaningful for event='end'
  event: LiveActivityEvent;
  relevanceScore?: number; // ranking among the user's activities
  staleDate?: number; // unix seconds after which the UI is considered stale
}

/** One stored session → activity push-token mapping. */
export interface LiveActivityRecord {
  activityPushToken: string;
  registeredAt: string;
  sessionId: string;
}
