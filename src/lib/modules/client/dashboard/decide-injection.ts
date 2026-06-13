// Pure, deterministic auto-inject safety logic for the phone-resident autonomous loop.
// No I/O, no LLM. Fully unit-testable (tests/decide-injection.test.cjs).
// See docs/superpowers/specs/2026-06-01-phone-autonomous-agent-design.md
// §"Auto-inject safety model".

import type {
  CommandVerdict,
  ConsensusResult,
  GateDecision,
  InjectionPolicy,
  InjectionState,
} from '$lib/types';

/** Default thresholds. Conservative — auto-inject is dangerous, so err toward NOT acting. */
export const DEFAULT_INJECTION_POLICY: InjectionPolicy = {
  humanGraceMs: 5_000,
  injectConfidence: 0.7,
  maxAutoActions: 8,
  minIntervalMs: 30_000,
};

/** Max length of a single injected command. Longer → rejected (likely not one command). */
const MAX_COMMAND_LENGTH = 400;

/**
 * Coarse dangerous-payload patterns. This is a SEATBELT, not a security boundary:
 * auto-inject is the user's accepted risk. We only block the obviously catastrophic.
 */
const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\/\*|\$home)/i, // rm -rf /, rm -rf ~, rm -rf /*
  /\brm\s+-[a-z]*f[a-z]*r?\s+(\/|~|\/\*|\$home)/i, // rm -fr variants
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // classic fork bomb :(){ :|:& };:
  /\bdd\b[^\n]*\bof=\/dev\//i, // dd of=/dev/...
  />\s*\/dev\/(sd|nvme|disk|hd)/i, // redirect onto a raw disk
  /\bmkfs(\.[a-z0-9]+)?\b/i, // mkfs, mkfs.ext4, ...
  /\b(shutdown|reboot|halt|poweroff)\b/i, // power state
];

/**
 * The GATE: given a per-terminal snapshot + the current consensus, decide whether the
 * autonomous loop should act (produce + inject a command). Pure; `now` is passed in so
 * the function stays deterministic and testable.
 *
 * Order matters — the first failing guard short-circuits with a reason.
 */
export function decideInjection(
  state: InjectionState,
  consensus: ConsensusResult,
  now: number,
  policy: InjectionPolicy = DEFAULT_INJECTION_POLICY,
  opts: { allowTentative?: boolean } = {}
): GateDecision {
  const top = consensus.steps[0];
  if (!top) {
    return { act: false, reason: 'no consensus step' };
  }
  // `tentative` = the 5 distinct lenses didn't reach quorum on the exact next step. That is a
  // PRECISION filter, not a safety boundary (the real guards are the confidence floor, dedup,
  // circuit breaker, and guardCommand). For AGENT terminals the injection is a natural-language
  // PROMPT the agent re-grounds against its goal — not a raw command run verbatim — so a best-
  // ranked-but-tentative next step is fine and keeps the autonomous loop live instead of stalling
  // after step 1. Callers pass allowTentative only for agent terminals; shell terminals stay strict.
  if (top.tentative && !opts.allowTentative) {
    return { act: false, reason: 'consensus is tentative (no quorum)' };
  }
  if (!state.isManaged) {
    return { act: false, reason: 'terminal is external / read-only (cannot inject)' };
  }
  if (state.lastEventType !== 'agent-idle') {
    return { act: false, reason: `agent not idle (last event: ${state.lastEventType})` };
  }
  if (now - state.lastActivityAt < policy.humanGraceMs) {
    return { act: false, reason: 'recent activity — within human grace window' };
  }
  if (now - state.lastInjectedAt < policy.minIntervalMs) {
    return { act: false, reason: 'rate-limited (min inject interval)' };
  }
  if (state.autoActionCount >= policy.maxAutoActions) {
    return { act: false, reason: 'circuit breaker — max consecutive auto-actions reached' };
  }
  if (top.confidence < policy.injectConfidence) {
    return { act: false, reason: `confidence ${top.confidence.toFixed(2)} below floor` };
  }
  if (state.lastActedStep !== null && normalizeStep(top.text) === state.lastActedStep) {
    return { act: false, reason: 'already acted on this step' };
  }
  return { act: true, reason: 'idle + high-confidence consensus', step: top };
}

/**
 * Vet a CONCRETE command (produced by the decide step) before it is written to the PTY:
 * single-line, length-bounded, not obviously catastrophic, not a duplicate of the last one.
 */
export function guardCommand(command: string, lastInjectedCommand: null | string): CommandVerdict {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { command: trimmed, reason: 'empty command', safe: false };
  }
  if (/[\r\n]/.test(command)) {
    return {
      command: trimmed,
      reason: 'multi-line command rejected (single command only)',
      safe: false,
    };
  }
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    return { command: trimmed, reason: `command too long (> ${MAX_COMMAND_LENGTH})`, safe: false };
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { command: trimmed, reason: 'matches a dangerous-command pattern', safe: false };
    }
  }
  if (lastInjectedCommand !== null && trimmed === lastInjectedCommand.trim()) {
    return { command: trimmed, reason: 'duplicate of last injected command', safe: false };
  }
  return { command: trimmed, reason: 'ok', safe: true };
}

/** Normalize a step text for dedup comparison (mirror of the consensus normalizer). */
export function normalizeStep(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}
