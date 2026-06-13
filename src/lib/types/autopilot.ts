// Hand-written autopilot types — union/record types not expressible in YAML.

/** A raw proposal from a single agent. */
export interface AgentProposal {
  confidence: number;
  text: string;
}

/** Autopilot module-level state (not a Svelte store — held in the autopilot module). */
export interface AutopilotState {
  enabled: boolean;
  status: Record<string, AutopilotStatus>;
}

/** Per-session autopilot lifecycle state. */
export type AutopilotStatus = 'error' | 'idle' | 'running';

/** Verdict from guardCommand() — whether a concrete command is safe to write to the PTY. */
export interface CommandVerdict {
  /** The trimmed command (echoed back for convenience). */
  command: string;
  /** Human-readable reason for the verdict. */
  reason: string;
  /** True when the command passed all guards and may be injected. */
  safe: boolean;
}

/** Result from mergeNextStepConsensus(). */
export interface ConsensusResult {
  /** Number of agent lists passed in. */
  agentCount: number;
  /** Quorum threshold used. */
  quorum: number;
  /** Consensus (or tentative) next-step list, sorted by votes desc then confidence desc. */
  steps: NextStep[];
}

/** A record of one autonomous-loop decision, surfaced in the dashboard panel. */
export interface DriverAction {
  /** ms timestamp of the action. */
  at: number;
  /** The command injected, or a short reason it was skipped / failed. */
  detail: string;
  /** What happened. */
  kind: DriverActionKind;
  /** The terminal acted on. */
  terminalId: string;
}

/** Outcome of one driver evaluation. */
export type DriverActionKind = 'error' | 'injected' | 'skipped';

/** Decision from decideInjection() — the gate deciding whether to auto-act. */
export interface GateDecision {
  /** True when all safety gates pass and the loop should produce + inject a command. */
  act: boolean;
  /** Human-readable reason (always set, for logging + the phone UI). */
  reason: string;
  /** The consensus step being acted on (present when act is true). */
  step?: NextStep;
}

/** Tunable thresholds for the auto-inject safety gate. */
export interface InjectionPolicy {
  /** Suppress injection within this many ms of observed human / output activity. */
  humanGraceMs: number;
  /** Minimum confidence of the top consensus step required to inject. */
  injectConfidence: number;
  /** Stop auto-injecting a terminal after this many consecutive actions without progress. */
  maxAutoActions: number;
  /** Minimum gap in ms between injections into the same terminal. */
  minIntervalMs: number;
}

/** Per-terminal snapshot the driver passes to decideInjection(). */
export interface InjectionState {
  /** Consecutive auto-injections without a human touch or successful tool completion. */
  autoActionCount: number;
  /** True only for terminals Shooter created (POST /api/terminals); external sessions are read-only. */
  isManaged: boolean;
  /** Normalized text of the last consensus step acted on (dedup guard). */
  lastActedStep: null | string;
  /** ms timestamp of the last observed human input / terminal output activity. */
  lastActivityAt: number;
  /** The most recent WireShooterEvent type seen for this terminal. */
  lastEventType: string;
  /** ms timestamp of the last command injection into this terminal. */
  lastInjectedAt: number;
  /** The terminal id. */
  terminalId: string;
}

/** Options for mergeNextStepConsensus(). */
export interface MergeOptions {
  /** Max steps taken from each agent list (default 3). */
  k?: number;
  /** Minimum vote count for a group to reach consensus (default 3). */
  quorum?: number;
}

/** A single proposed next step from one agent or the merged consensus. */
export interface NextStep {
  /** Confidence score in [0, 1]. For consensus steps this is the mean across proposers. */
  confidence: number;
  /** Present and true when no group reached quorum; indicates low-certainty result. */
  tentative?: boolean;
  /** The original (highest-confidence) phrasing of the step. */
  text: string;
  /** Number of distinct agents that proposed this step (consensus only). */
  votes?: number;
}

/**
 * Additional per-session fields added by the autopilot engine.
 * These are optional so that SessionState objects (which lack them by default)
 * remain assignable; the engine writes them via Svelte 5's reactive proxy.
 */
export interface SessionAutopilotFields {
  /** ISO 8601 timestamp of the last completed autopilot pipeline run. */
  autopilotLastRun?: null | string;
  /** Current autopilot pipeline status for this session. */
  autopilotStatus?: AutopilotStatus;
  /** Consensus next-step list from the last pipeline run. */
  nextSteps?: NextStep[];
}

/** A persisted summary record stored in session_summaries. */
export interface SessionSummaryRecord {
  createdAt: string;
  id: string;
  /** JSON-serialised NextStep[] */
  nextSteps: string;
  projectName: null | string;
  sessionId: null | string;
  summary: string;
  terminalId: null | string;
  trigger: string;
}
