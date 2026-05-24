// Dynamic-options decision types. Hand-written because the value sets are
// unions that vary by event kind (permission allow/deny, plan-mode
// approval modes, generic numbered choices) and YAML can express each
// enum but not the discriminated union over the response routing kind.
//
// These extend the binary PermissionDecision enum generated from
// specs/types/notification.yaml. PermissionDecision (`allow | deny`)
// remains the legacy type for callers that only ever needed binary;
// DecisionKind is the new umbrella accepted by /api/response.

/**
 * Every decision value /api/response accepts.
 *
 * - `allow` / `deny` — binary PermissionRequest answer.
 * - `plan_auto` / `plan_accept` / `plan_review` / `plan_keep` — ExitPlanMode
 *   approval modes mirroring Claude Code's plan-mode menu.
 * - `option_1`..`option_4` — generic numbered choices used by MCP
 *   elicitation forms and AskUserQuestion. The actual label for each
 *   option lives in the persisted `options[]` array; the index here is
 *   1-based to match the body-text rendering.
 */
export type DecisionKind =
  | 'allow'
  | 'deny'
  | 'option_1'
  | 'option_2'
  | 'option_3'
  | 'option_4'
  | 'plan_accept'
  | 'plan_auto'
  | 'plan_keep'
  | 'plan_review';

/**
 * How the server should route a user's decision back to Claude Code.
 *
 * - `hook` — Claude Code's notifier.cjs is blocked in a poll loop on
 *   /api/response and will read the decision from there, then write it
 *   to stdout as the hook's response (allow/deny + optional extras).
 * - `pty`  — the active session lives inside a Shooter-managed PTY;
 *   server writes the chosen option's keystrokes to the PTY's stdin so
 *   Claude Code reads it as if the user typed at the laptop.
 * - `info` — informational only; no answer routes back to Claude Code.
 *   The push exists to nudge the user to the laptop.
 */
export type ResponseKind = 'hook' | 'info' | 'pty';

/** All valid DecisionKind values. Exported so /api/response can validate. */
export const DECISION_KINDS: readonly DecisionKind[] = [
  'allow',
  'deny',
  'option_1',
  'option_2',
  'option_3',
  'option_4',
  'plan_accept',
  'plan_auto',
  'plan_keep',
  'plan_review',
] as const;

/**
 * Full payload returned by GET /api/decide/[requestId] for the iOS
 * Decide screen to render. Includes everything the screen needs without
 * a second round-trip.
 */
export interface DecidePayload {
  options: OptionChoice[];
  question: string;
  requestId: string;
  responseKind: ResponseKind;
  toolInput?: Record<string, unknown>;
  /** Snapshot of the tool input that triggered the prompt (for context). */
  toolName?: string;
}

/**
 * One choice rendered to the user. Persisted as JSON in
 * pending_requests.options and returned from /api/decide/[id] to the
 * iOS Decide screen.
 */
export interface OptionChoice {
  /** Optional secondary text shown beneath the label in the Decide screen. */
  hint?: string;
  /** Decision value the iOS app POSTs to /api/response when this is tapped. */
  id: DecisionKind;
  /** Human-readable label ("Use frontend", "Auto mode", etc.). */
  label: string;
}

/**
 * Richer view of a pending_requests row that includes the
 * dynamic-options columns (question, options, responseKind). The
 * legacy `PendingRequest` type (binary `decision`, no question/options)
 * remains the public surface for callers that don't care about dynamic
 * options. Used by PendingRequestsStore and /api/decide/[id].
 */
export interface PendingRequestRich {
  createdAt: number;
  decidedAt: null | number;
  decision: DecisionKind | null;
  options: OptionChoice[];
  question: null | string;
  requestId: string;
  responseKind: ResponseKind;
  sessionId: string;
  toolInput: Record<string, unknown>;
  toolName: string;
}

/** Type guard for incoming strings from HTTP requests. */
export function isDecisionKind(value: unknown): value is DecisionKind {
  return typeof value === 'string' && (DECISION_KINDS as readonly string[]).includes(value);
}
