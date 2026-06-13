// Pure context-building + goal store for the autopilot engine.
//
// Kept free of server imports (no pty-manager, no SQLite) so it is unit-testable in isolation,
// the same way next-step-consensus.ts and decide-injection.ts are.
//
// WHY a goal store: the engine builds its LLM context from the last ~12 session events, with no
// memory of what the session is trying to achieve. After a few autonomous cycles the original
// goal scrolls out of that window and consensus drifts toward "what the agent just did". Pinning
// a per-terminal goal and prepending it to every context keeps the lenses (and thus the injected
// next-steps) anchored. It is also the literal "set it as a goal" the autonomous loop needs.

// Per-terminal goal store. Lives in the engine's module graph; the /api/autopilot/goal route
// reaches setEngineGoal via the globalThis control object (it never imports the engine directly).
const goals = new Map<string, string>();

/**
 * Build the LLM context string for one pipeline run. When a goal is present it leads the string
 * so the summary + every lens see it first; otherwise the format is unchanged from before.
 */
export function buildEngineContext(input: {
  errorCount: number;
  events: string[];
  goal?: string;
  projectName: string;
  status: string;
  toolCallCount: number;
  trigger: string;
}): string {
  const goalLine = input.goal && input.goal.trim().length > 0 ? `Goal: ${input.goal.trim()}\n` : '';
  return (
    `${goalLine}Project: ${input.projectName}\nStatus: ${input.status}\n` +
    `Errors: ${input.errorCount}\nTool calls: ${input.toolCallCount}\n` +
    `Recent events: ${input.events.slice(-12).join('; ')}\nTrigger: ${input.trigger}`
  );
}

/** Drop a terminal's goal (called when the terminal exits). */
export function clearEngineGoal(terminalId: string): void {
  goals.delete(terminalId);
}

/** The pinned goal for a terminal, or undefined if none is set. */
export function getEngineGoal(terminalId: string): string | undefined {
  return goals.get(terminalId);
}

/** Set (or, with a blank value, clear) the goal that anchors a terminal's autopilot context. */
export function setEngineGoal(terminalId: string, goal: string): void {
  const trimmed = goal.trim();
  if (trimmed.length > 0) {
    // Cap defensively: the goal is prepended to EVERY engine LLM context, so an unbounded string
    // would permanently bloat the prompt. The /api/autopilot/goal route also rejects > 500.
    goals.set(terminalId, trimmed.slice(0, 500));
  } else {
    goals.delete(terminalId);
  }
}
