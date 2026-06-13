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

/** Result from mergeNextStepConsensus(). */
export interface ConsensusResult {
  /** Number of agent lists passed in. */
  agentCount: number;
  /** Quorum threshold used. */
  quorum: number;
  /** Consensus (or tentative) next-step list, sorted by votes desc then confidence desc. */
  steps: NextStep[];
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
