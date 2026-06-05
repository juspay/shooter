/**
 * Tier-1 static routing policy for the SoS coordinator (Phase 2).
 *
 * Pure, side-effect-free evaluation: given a super-session's routing rules and a
 * new message from a member, return the first matching rule (lowest `priority`
 * wins) or null. The coordinator decides what to do with the result
 * (relay / block / escalate). The Tier-2 LLM judge from the design is a later
 * phase and is intentionally absent here.
 */

import type { SosRoutingRule } from '$lib/types';

/**
 * First matching rule for a message, or null when none match (default: no
 * relay — rules are opt-in). Rules are evaluated in ascending `priority`.
 */
export function evaluateRelayRule(
  rules: SosRoutingRule[],
  fromMemberId: string,
  text: string
): null | SosRoutingRule {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (rule.fromMemberId !== 'ANY' && rule.fromMemberId !== fromMemberId) {
      continue;
    }
    // An ANY-source rule must never relay a member's own message back to itself
    // (explicit from === to rules are already rejected at rule-creation time).
    if (rule.toMemberId === fromMemberId) {
      continue;
    }
    if (!matchesPattern(text, rule.matchPattern)) {
      continue;
    }
    return rule;
  }
  return null;
}

/**
 * A rule is valid when it does not self-relay (from === to would loop) and it
 * targets a concrete member (broadcast 'ANY' as a destination is not supported
 * in Phase 2). ANY-source rules are additionally guarded at evaluation time so
 * they never match a message originating from their own target.
 */
export function isValidRoutingRule(rule: SosRoutingRule): boolean {
  return rule.toMemberId !== 'ANY' && rule.fromMemberId !== rule.toMemberId;
}

/** Empty pattern matches everything; otherwise a case-insensitive substring test. */
function matchesPattern(text: string, pattern: string): boolean {
  if (!pattern) {
    return true;
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}
