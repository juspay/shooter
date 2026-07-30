/**
 * Guardrails around terminal lifetime and footprint.
 *
 * Both exist because Shooter is meant to hold real work: a terminal that
 * outlives the directory it runs in, or an unbounded pile of holder processes,
 * turns "my work lives in Shooter" into a liability.
 *
 * Pure by design — the caller supplies the facts (does the directory exist, how
 * many are running) so the decisions can be tested without a filesystem or a
 * live PTY.
 */

import type { CapacityAssessment, ReconnectDecision } from '$lib/types';

/**
 * Hard ceiling on concurrently running terminals. Each one costs a detached
 * holder process plus cached scrollback and a bounded replay ring, so this is a
 * real resource bound rather than an arbitrary limit.
 */
export const MAX_RUNNING_TERMINALS = 40;

/** Point at which the footprint is worth mentioning but not worth blocking. */
export const TERMINAL_WARN_THRESHOLD = 24;

/**
 * Decide whether another terminal may be created. A non-finite count is treated
 * as "unknown" and allowed — a broken counter must never block real work.
 */
export function assessCapacity(runningCount: number): CapacityAssessment {
  if (!Number.isFinite(runningCount)) {
    return { allowed: true, warn: false };
  }

  if (runningCount >= MAX_RUNNING_TERMINALS) {
    return {
      allowed: false,
      reason:
        `${runningCount} terminals are already running (limit ${MAX_RUNNING_TERMINALS}). ` +
        `Close some before starting another.`,
      warn: true,
    };
  }

  if (runningCount >= TERMINAL_WARN_THRESHOLD) {
    return {
      allowed: true,
      reason:
        `${runningCount} terminals are running (limit ${MAX_RUNNING_TERMINALS}) — ` +
        `each holds a background process.`,
      warn: true,
    };
  }

  return { allowed: true, warn: false };
}

/**
 * Decide whether a persisted terminal should be reconnected on startup.
 *
 * `cwd` is validated when a terminal is created and never again, so a directory
 * that has since been deleted — a closed git worktree, most often — would
 * otherwise be restored as `running` forever, looking alive while unable to run
 * a single command.
 */
export function evaluateReconnect(
  record: { cwd?: null | string; id: string; socketPath?: null | string },
  directoryExists: boolean
): ReconnectDecision {
  if (!record.socketPath) {
    return { action: 'orphan', reason: 'no holder socket recorded' };
  }
  if (!record.cwd) {
    return { action: 'orphan', reason: 'no working directory recorded' };
  }
  if (!directoryExists) {
    return {
      action: 'orphan',
      reason: `working directory no longer exists: ${record.cwd}`,
    };
  }
  return { action: 'reconnect' };
}
