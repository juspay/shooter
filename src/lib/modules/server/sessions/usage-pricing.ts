/**
 * Model rates for turning token counts into money.
 *
 * Claude Code transcripts record tokens but never cost, so spend has to be
 * computed. That makes the rate table a correctness hazard: a missing model
 * silently contributes 0, and a dashboard that under-reports spend is worse
 * than one that reports none, because it still looks authoritative.
 *
 * So rates are never guessed. `rateFor` returns null for anything unconfigured
 * and every caller carries a `priced` flag down to the UI, which renders an
 * unpriced model as "—" rather than "$0.00". The built-in table covers only
 * models whose public list pricing is long-settled; newer ones are deliberately
 * absent and must be supplied by the operator, who knows what they actually pay
 * (list price, an enterprise rate, or a subscription where marginal cost is 0).
 *
 * Configure via either:
 *   SHOOTER_MODEL_PRICING='{"claude-opus-5":{"input":15,"output":75,...}}'
 *   ~/.shooter/pricing.json   (same shape)
 * All figures are USD per MILLION tokens. Operator entries win over built-ins.
 */

import type { ModelRate } from '$lib/types';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Models whose public per-million pricing has been stable long enough to hard-
 * code. Deliberately conservative — see the module note on why absence beats a
 * guess. Keys are matched by exact id first, then longest prefix, so dated
 * variants like `claude-3-5-sonnet-20241022` resolve without their own entry.
 */
const BUILTIN_RATES: Record<string, ModelRate> = {
  'claude-3-5-haiku': { cacheRead: 0.08, cacheWrite: 1, input: 0.8, output: 4 },
  'claude-3-5-sonnet': { cacheRead: 0.3, cacheWrite: 3.75, input: 3, output: 15 },
  'claude-3-haiku': { cacheRead: 0.03, cacheWrite: 0.3, input: 0.25, output: 1.25 },
  'claude-3-opus': { cacheRead: 1.5, cacheWrite: 18.75, input: 15, output: 75 },
};

/** Models that appear in transcripts but are never billed. */
const NON_BILLED_MODELS = new Set(['<synthetic>']);

let cachedRates: null | Record<string, ModelRate> = null;

/** The merged rate table. Operator entries override built-ins. */
export function allRates(): Record<string, ModelRate> {
  cachedRates ??= { ...BUILTIN_RATES, ...operatorRates() };
  return cachedRates;
}

/**
 * Spend for one model's token counts, or null when the model has no rate.
 *
 * Null is the whole point: it forces callers to distinguish "cost nothing" from
 * "we do not know what this cost".
 */
export function costOf(
  modelId: string,
  tokens: {
    cacheCreationTokens: number;
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
  }
): null | number {
  if (!isBilledModel(modelId)) {
    return 0;
  }
  const rate = rateFor(modelId);
  if (rate === null) {
    return null;
  }
  const perToken = (millions: number, usdPerMillion: number): number =>
    (millions / 1_000_000) * usdPerMillion;
  return (
    perToken(tokens.inputTokens, rate.input) +
    perToken(tokens.outputTokens, rate.output) +
    perToken(tokens.cacheCreationTokens, rate.cacheWrite) +
    perToken(tokens.cacheReadTokens, rate.cacheRead)
  );
}

/** True for transcript models that are never charged for. */
export function isBilledModel(modelId: string): boolean {
  return !NON_BILLED_MODELS.has(modelId);
}

/**
 * Resolve a model id to its rate, or null when nothing is configured.
 *
 * Exact id wins; otherwise the LONGEST matching prefix, so a specific entry
 * (`claude-3-5-sonnet`) beats a broad one (`claude-3`) regardless of key order.
 */
export function rateFor(modelId: string): ModelRate | null {
  const rates = allRates();
  if (rates[modelId]) {
    return rates[modelId];
  }
  let best: null | string = null;
  for (const key of Object.keys(rates)) {
    if (modelId.startsWith(key) && (best === null || key.length > best.length)) {
      best = key;
    }
  }
  return best === null ? null : rates[best];
}

/** Drop the memoised table so a changed env/file is picked up (tests, reload). */
export function resetRateCache(): void {
  cachedRates = null;
}

/** Operator-supplied rates, env first then file. Read once per process. */
function operatorRates(): Record<string, ModelRate> {
  const fromEnv = process.env.SHOOTER_MODEL_PRICING?.trim();
  if (fromEnv) {
    return parseRateTable(fromEnv, 'SHOOTER_MODEL_PRICING');
  }
  const file = path.join(os.homedir(), '.shooter', 'pricing.json');
  try {
    if (fs.existsSync(file)) {
      return parseRateTable(fs.readFileSync(file, 'utf8'), file);
    }
  } catch {
    // Unreadable pricing file is not fatal — usage still reports tokens.
  }
  return {};
}

/** Parse a rate table from JSON text, dropping entries that are not numeric. */
function parseRateTable(text: string, source: string): Record<string, ModelRate> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    console.warn(`[usage] ignoring ${source}: not valid JSON`);
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.warn(`[usage] ignoring ${source}: expected an object of model -> rate`);
    return {};
  }

  const out: Record<string, ModelRate> = {};
  for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
    // An empty key would prefix-match EVERY model id, silently pricing the
    // whole corpus at one arbitrary rate.
    if (!model.trim()) {
      console.warn(`[usage] ignoring a blank model id in ${source}`);
      continue;
    }
    if (typeof value !== 'object' || value === null) {
      console.warn(`[usage] ignoring rate for "${model}" in ${source}: not an object`);
      continue;
    }
    const v = value as Record<string, unknown>;
    const num = (key: string): number => (typeof v[key] === 'number' ? v[key] : NaN);
    const input = num('input');
    const output = num('output');
    // A rate missing input/output cannot price anything; cache rates may
    // legitimately be absent (older models had no prompt cache) and fall back
    // to the uncached rates rather than to zero, which would under-report.
    if (!Number.isFinite(input) || !Number.isFinite(output)) {
      console.warn(
        `[usage] ignoring rate for "${model}" in ${source}: input/output must be numbers`
      );
      continue;
    }
    // A negative rate would produce negative spend and drag a total below the
    // truth — worse than having no rate at all, which at least reads as unknown.
    if (input < 0 || output < 0) {
      console.warn(`[usage] ignoring rate for "${model}" in ${source}: rates cannot be negative`);
      continue;
    }
    const cacheWrite = num('cacheWrite');
    const cacheRead = num('cacheRead');
    const usable = (rate: number, fallback: number): number =>
      Number.isFinite(rate) && rate >= 0 ? rate : fallback;
    out[model] = {
      cacheRead: usable(cacheRead, input),
      cacheWrite: usable(cacheWrite, input),
      input,
      output,
    };
  }
  return out;
}
