// Pure, deterministic next-step consensus algorithm.
// No I/O, no LLM. Fully unit-testable.
// See spec docs/superpowers/specs/2026-05-29-autonomous-summarization-engine-design.md §4

import type { AgentProposal, ConsensusResult, MergeOptions, NextStep } from '$lib/types';

const DEFAULT_K = 3;
const DEFAULT_QUORUM = 3;
const JACCARD_THRESHOLD = 0.6;

/** A grouped cluster of proposals that all map to the same semantic step. @internal */
// eslint-disable-next-line no-restricted-syntax
interface Cluster {
  /** Distinct agent indices that proposed a member of this cluster. */
  agentIndices: Set<number>;
  /** All individual proposals that map into this cluster (for label + confidence). */
  members: { confidence: number; text: string }[];
  /** Normalized representative text (first normalized form in cluster). */
  normalized: string;
}

/**
 * Merge up to 5 agent next-step lists into a consensus result.
 *
 * Algorithm (per spec §4):
 * 1. Cap each agent list at K items.
 * 2. Normalize each text (lowercase, trim, collapse whitespace, strip trailing punct).
 * 3. Group near-duplicates: same normalized string OR Jaccard token-overlap ≥ 0.6.
 *    Track distinct agent indices per group for vote counting.
 * 4. Score each group by vote count = |distinct agent indices|.
 * 5. Consensus = groups with votes ≥ quorum, sorted by votes desc then mean confidence desc.
 * 6. If no group meets quorum, return the single highest-vote group flagged tentative:true.
 * 7. Label each output step with the highest-confidence original phrasing in the group.
 */
export function mergeNextStepConsensus(
  lists: readonly (readonly AgentProposal[])[],
  opts?: MergeOptions
): ConsensusResult {
  const k = opts?.k ?? DEFAULT_K;
  const quorum = opts?.quorum ?? DEFAULT_QUORUM;
  const agentCount = lists.length;

  if (agentCount === 0) {
    return { agentCount: 0, quorum, steps: [] };
  }

  // Step 1 + 2: cap each agent list and normalize proposals.
  const clusters: Cluster[] = [];

  for (let agentIndex = 0; agentIndex < lists.length; agentIndex++) {
    const list = lists[agentIndex];
    const capped = list.slice(0, k);

    for (const proposal of capped) {
      const norm = normalize(proposal.text);
      if (norm.length === 0) {
        continue;
      }

      // Step 3: find an existing cluster to join.
      const targetCluster = findOrCreateCluster(clusters, norm);
      targetCluster.agentIndices.add(agentIndex);
      // Sanitise confidence at ingestion: the type says `number` but the value comes from raw LLM
      // JSON, so a missing/NaN/Infinity/out-of-range confidence must NOT leak into meanConf (it
      // would poison the mean and could spuriously clear the downstream 0.7 inject floor). Invalid
      // → 0 (correctly fails the floor); valid → clamped to [0,1].
      targetCluster.members.push({
        confidence: safeConfidence(proposal.confidence),
        text: proposal.text,
      });
    }
  }

  if (clusters.length === 0) {
    return { agentCount, quorum, steps: [] };
  }

  // Step 4: compute vote count and mean confidence per cluster.
  const scored = clusters.map((cluster) => {
    const votes = cluster.agentIndices.size;
    const meanConf =
      cluster.members.reduce((sum, m) => sum + m.confidence, 0) / cluster.members.length;

    // Label = original phrasing from the highest-confidence member.
    const bestMember = cluster.members.reduce((best, m) =>
      m.confidence > best.confidence ? m : best
    );

    return { cluster, meanConf, text: bestMember.text, votes };
  });

  // Step 5: separate consensus groups from sub-quorum groups.
  const consensusGroups = scored
    .filter((s) => s.votes >= quorum)
    .sort((a, b) => b.votes - a.votes || b.meanConf - a.meanConf);

  if (consensusGroups.length > 0) {
    const steps: NextStep[] = consensusGroups.map((s) => ({
      confidence: s.meanConf,
      text: s.text,
      votes: s.votes,
    }));
    return { agentCount, quorum, steps };
  }

  // Step 6: no group reached quorum — tentative fallback (single highest-vote group).
  const best = scored.reduce((prev, curr) => {
    if (curr.votes > prev.votes) {
      return curr;
    }
    if (curr.votes === prev.votes && curr.meanConf > prev.meanConf) {
      return curr;
    }
    return prev;
  });

  const steps: NextStep[] = [
    {
      confidence: best.meanConf,
      tentative: true,
      text: best.text,
      votes: best.votes,
    },
  ];
  return { agentCount, quorum, steps };
}

/**
 * Find a cluster whose normalized key matches `norm` exactly or has Jaccard ≥ threshold,
 * or create and register a new one.
 */
function findOrCreateCluster(clusters: Cluster[], norm: string): Cluster {
  for (const cluster of clusters) {
    if (cluster.normalized === norm) {
      return cluster;
    }
    if (jaccard(cluster.normalized, norm) >= JACCARD_THRESHOLD) {
      return cluster;
    }
  }
  const newCluster: Cluster = {
    agentIndices: new Set(),
    members: [],
    normalized: norm,
  };
  clusters.push(newCluster);
  return newCluster;
}

/**
 * Compute the Jaccard token-overlap coefficient between two normalized strings.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
function jaccard(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Normalize a step text for grouping:
 * lowercase, trim, collapse internal whitespace, strip trailing punctuation.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}

/** Coerce a raw (untrusted) confidence into a finite number in [0,1]; invalid → 0. */
function safeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

// ── Private helper ──────────────────────────────────────────────────────────

/**
 * Tokenize a normalized string into a set of tokens.
 */
function tokenSet(normalized: string): Set<string> {
  // Strip wrapping punctuation from each token so code-bearing proposals cluster: the lenses phrase
  // the same action differently and wrap code in backticks/quotes (`return a - b`, "calc.js"), which
  // otherwise fragments the tokens ("`return" ≠ "return") and makes the Jaccard overlap undercount
  // real agreement. Pure-punctuation tokens (operators like - / +) drop out, which is fine — we are
  // grouping intent, not preserving exact syntax.
  return new Set(
    normalized
      .split(/\s+/)
      .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((t) => t.length > 0)
  );
}
