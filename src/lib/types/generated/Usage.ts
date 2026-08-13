import {
  isJSON,
  decodeNumber,
  _decodeNumber,
  decodeString,
  _decodeString,
  decodeBoolean,
  _decodeBoolean,
  decodeArray,
  _decodeArray,
} from 'type-decoder';

/**
 * @type { ModelRate }
 * @description Billing rate for one model, in USD per MILLION tokens. Supplied by the operator via SHOOTER_MODEL_PRICING or ~/.shooter/pricing.json; rates are never inferred, because a guessed rate produces confident wrong spend.
 */
export type ModelRate = {
  /**
   * @description USD per million fresh (uncached) input tokens
   * @type { number }
   * @memberof ModelRate
   */
  input: number;
  /**
   * @description USD per million generated output tokens
   * @type { number }
   * @memberof ModelRate
   */
  output: number;
  /**
   * @description USD per million tokens written to the prompt cache
   * @type { number }
   * @memberof ModelRate
   */
  cacheWrite: number;
  /**
   * @description USD per million tokens served from the prompt cache
   * @type { number }
   * @memberof ModelRate
   */
  cacheRead: number;
};

export function decodeModelRate(rawInput: unknown): ModelRate | null {
  if (isJSON(rawInput)) {
    const decodedInput = decodeNumber(rawInput['input']);
    const decodedOutput = decodeNumber(rawInput['output']);
    const decodedCacheWrite = decodeNumber(rawInput['cacheWrite']);
    const decodedCacheRead = decodeNumber(rawInput['cacheRead']);

    if (
      decodedInput === null ||
      decodedOutput === null ||
      decodedCacheWrite === null ||
      decodedCacheRead === null
    ) {
      return null;
    }

    return {
      input: decodedInput,
      output: decodedOutput,
      cacheWrite: decodedCacheWrite,
      cacheRead: decodedCacheRead,
    };
  }
  return null;
}

/**
 * @type { TokenCounts }
 * @description The four token classes Anthropic bills separately. Cache reads are an order of magnitude cheaper than fresh input and cache writes are dearer, so collapsing these into one "input" number makes cost unrecoverable.
 */
export type TokenCounts = {
  /**
   * @description Fresh (uncached) prompt tokens
   * @type { number }
   * @memberof TokenCounts
   */
  inputTokens: number;
  /**
   * @description Generated completion tokens
   * @type { number }
   * @memberof TokenCounts
   */
  outputTokens: number;
  /**
   * @description Tokens written into the prompt cache
   * @type { number }
   * @memberof TokenCounts
   */
  cacheCreationTokens: number;
  /**
   * @description Tokens served from the prompt cache
   * @type { number }
   * @memberof TokenCounts
   */
  cacheReadTokens: number;
  /**
   * @description Sum of all four classes
   * @type { number }
   * @memberof TokenCounts
   */
  totalTokens: number;
};

export function decodeTokenCounts(rawInput: unknown): TokenCounts | null {
  if (isJSON(rawInput)) {
    const decodedInputTokens = decodeNumber(rawInput['inputTokens']);
    const decodedOutputTokens = decodeNumber(rawInput['outputTokens']);
    const decodedCacheCreationTokens = decodeNumber(rawInput['cacheCreationTokens']);
    const decodedCacheReadTokens = decodeNumber(rawInput['cacheReadTokens']);
    const decodedTotalTokens = decodeNumber(rawInput['totalTokens']);

    if (
      decodedInputTokens === null ||
      decodedOutputTokens === null ||
      decodedCacheCreationTokens === null ||
      decodedCacheReadTokens === null ||
      decodedTotalTokens === null
    ) {
      return null;
    }

    return {
      inputTokens: decodedInputTokens,
      outputTokens: decodedOutputTokens,
      cacheCreationTokens: decodedCacheCreationTokens,
      cacheReadTokens: decodedCacheReadTokens,
      totalTokens: decodedTotalTokens,
    };
  }
  return null;
}

/**
 * @type { ModelUsage }
 * @description Token totals and cost for a single model id
 */
export type ModelUsage = {
  /**
   * @description Model identifier exactly as written in the transcript
   * @type { string }
   * @memberof ModelUsage
   */
  modelId: string;
  /**
   * @type { TokenCounts }
   * @memberof ModelUsage
   */
  tokens: TokenCounts;
  /**
   * @description Computed spend. Always 0 when `priced` is false — read `priced` first
   * @type { number }
   * @memberof ModelUsage
   */
  costUsd: number;
  /**
   * @description Whether a rate was configured for this model. False means the cost is UNKNOWN, not zero; callers must render it as unpriced rather than $0.
   * @type { boolean }
   * @memberof ModelUsage
   */
  priced: boolean;
  /**
   * @description Number of distinct assistant responses counted
   * @type { number }
   * @memberof ModelUsage
   */
  requests: number;
};

export function decodeModelUsage(rawInput: unknown): ModelUsage | null {
  if (isJSON(rawInput)) {
    const decodedModelId = decodeString(rawInput['modelId']);
    const decodedTokens = decodeTokenCounts(rawInput['tokens']);
    const decodedCostUsd = decodeNumber(rawInput['costUsd']);
    const decodedPriced = decodeBoolean(rawInput['priced']);
    const decodedRequests = decodeNumber(rawInput['requests']);

    if (
      decodedModelId === null ||
      decodedTokens === null ||
      decodedCostUsd === null ||
      decodedPriced === null ||
      decodedRequests === null
    ) {
      return null;
    }

    return {
      modelId: decodedModelId,
      tokens: decodedTokens,
      costUsd: decodedCostUsd,
      priced: decodedPriced,
      requests: decodedRequests,
    };
  }
  return null;
}

/**
 * @type { SessionUsage }
 * @description Token totals for one Claude Code session file
 */
export type SessionUsage = {
  /**
   * @description Session identifier (JSONL filename without extension)
   * @type { string }
   * @memberof SessionUsage
   */
  sessionId: string;
  /**
   * @description Human-readable project name (last two path segments)
   * @type { string }
   * @memberof SessionUsage
   */
  projectName: string;
  /**
   * @description Encoded project directory name under ~/.claude/projects
   * @type { string }
   * @memberof SessionUsage
   */
  projectPath: string;
  /**
   * @description Every model id that appeared in this session
   * @type { string[] }
   * @memberof SessionUsage
   */
  modelIds: string[];
  /**
   * @type { TokenCounts }
   * @memberof SessionUsage
   */
  tokens: TokenCounts;
  /**
   * @description Computed spend across all priced models in this session
   * @type { number }
   * @memberof SessionUsage
   */
  costUsd: number;
  /**
   * @description False when any model in the session lacks a configured rate
   * @type { boolean }
   * @memberof SessionUsage
   */
  priced: boolean;
  /**
   * @description Number of distinct assistant responses in this session
   * @type { number }
   * @memberof SessionUsage
   */
  requests: number;
  /**
   * @description ISO 8601 timestamp of the most recent usage-bearing record
   * @type { string }
   * @memberof SessionUsage
   */
  lastActivityAt: string;
};

export function decodeSessionUsage(rawInput: unknown): SessionUsage | null {
  if (isJSON(rawInput)) {
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);
    const decodedModelIds = decodeArray(rawInput['modelIds'], decodeString);
    const decodedTokens = decodeTokenCounts(rawInput['tokens']);
    const decodedCostUsd = decodeNumber(rawInput['costUsd']);
    const decodedPriced = decodeBoolean(rawInput['priced']);
    const decodedRequests = decodeNumber(rawInput['requests']);
    const decodedLastActivityAt = decodeString(rawInput['lastActivityAt']);

    if (
      decodedSessionId === null ||
      decodedProjectName === null ||
      decodedProjectPath === null ||
      decodedModelIds === null ||
      decodedTokens === null ||
      decodedCostUsd === null ||
      decodedPriced === null ||
      decodedRequests === null ||
      decodedLastActivityAt === null
    ) {
      return null;
    }

    return {
      sessionId: decodedSessionId,
      projectName: decodedProjectName,
      projectPath: decodedProjectPath,
      modelIds: decodedModelIds,
      tokens: decodedTokens,
      costUsd: decodedCostUsd,
      priced: decodedPriced,
      requests: decodedRequests,
      lastActivityAt: decodedLastActivityAt,
    };
  }
  return null;
}

/**
 * @type { BurnRate }
 * @description Consumption over the trailing window, for the top-style readout
 */
export type BurnRate = {
  /**
   * @description Width of the trailing window this rate was computed over
   * @type { number }
   * @memberof BurnRate
   */
  windowMinutes: number;
  /**
   * @description Total tokens consumed in the window divided by its width
   * @type { number }
   * @memberof BurnRate
   */
  tokensPerMinute: number;
  /**
   * @description Extrapolated hourly spend. 0 when `priced` is false
   * @type { number }
   * @memberof BurnRate
   */
  costPerHour: number;
  /**
   * @description False when any model active in the window lacks a rate
   * @type { boolean }
   * @memberof BurnRate
   */
  priced: boolean;
  /**
   * @type { TokenCounts }
   * @memberof BurnRate
   */
  tokens: TokenCounts;
};

export function decodeBurnRate(rawInput: unknown): BurnRate | null {
  if (isJSON(rawInput)) {
    const decodedWindowMinutes = decodeNumber(rawInput['windowMinutes']);
    const decodedTokensPerMinute = decodeNumber(rawInput['tokensPerMinute']);
    const decodedCostPerHour = decodeNumber(rawInput['costPerHour']);
    const decodedPriced = decodeBoolean(rawInput['priced']);
    const decodedTokens = decodeTokenCounts(rawInput['tokens']);

    if (
      decodedWindowMinutes === null ||
      decodedTokensPerMinute === null ||
      decodedCostPerHour === null ||
      decodedPriced === null ||
      decodedTokens === null
    ) {
      return null;
    }

    return {
      windowMinutes: decodedWindowMinutes,
      tokensPerMinute: decodedTokensPerMinute,
      costPerHour: decodedCostPerHour,
      priced: decodedPriced,
      tokens: decodedTokens,
    };
  }
  return null;
}

/**
 * @type { UsageSnapshot }
 * @description Everything GET /api/usage returns. Every figure describes the trailing window only — this is a live monitor, not a lifetime ledger. Whole-history totals are deliberately not offered: the transcript corpus runs to gigabytes and reading it would take tens of seconds per request.
 */
export type UsageSnapshot = {
  /**
   * @description ISO 8601 timestamp this snapshot was built
   * @type { string }
   * @memberof UsageSnapshot
   */
  generatedAt: string;
  /**
   * @description Trailing window every figure in this payload covers
   * @type { number }
   * @memberof UsageSnapshot
   */
  windowMinutes: number;
  /**
   * @description Transcripts whose mtime put them inside the window
   * @type { number }
   * @memberof UsageSnapshot
   */
  filesScanned: number;
  /**
   * @description Transcripts whose in-window records exceeded the per-file tail budget. Non-zero means the figures are a lower bound — some records were not read. Surfaced rather than silently dropped.
   * @type { number }
   * @memberof UsageSnapshot
   */
  truncatedFiles: number;
  /**
   * @type { TokenCounts }
   * @memberof UsageSnapshot
   */
  tokens: TokenCounts;
  /**
   * @description Total spend across every priced model
   * @type { number }
   * @memberof UsageSnapshot
   */
  costUsd: number;
  /**
   * @description False when any observed model lacks a configured rate
   * @type { boolean }
   * @memberof UsageSnapshot
   */
  priced: boolean;
  /**
   * @description Total distinct assistant responses counted
   * @type { number }
   * @memberof UsageSnapshot
   */
  requests: number;
  /**
   * @description Per-session rollups, heaviest first by total tokens. This is a "what is burning my budget" panel, so consumption orders the list, not recency; the UI sizes its bars against the first row.
   * @type { SessionUsage[] }
   * @memberof UsageSnapshot
   */
  sessions: SessionUsage[];
  /**
   * @description Per-model rollups, largest token count first
   * @type { ModelUsage[] }
   * @memberof UsageSnapshot
   */
  models: ModelUsage[];
  /**
   * @description Model ids seen in the transcripts with no configured rate. Non-empty means the cost figures are a lower bound, not a total.
   * @type { string[] }
   * @memberof UsageSnapshot
   */
  unpricedModels: string[];
  /**
   * @type { BurnRate }
   * @memberof UsageSnapshot
   */
  burn: BurnRate;
};

export function decodeUsageSnapshot(rawInput: unknown): UsageSnapshot | null {
  if (isJSON(rawInput)) {
    const decodedGeneratedAt = decodeString(rawInput['generatedAt']);
    const decodedWindowMinutes = decodeNumber(rawInput['windowMinutes']);
    const decodedFilesScanned = decodeNumber(rawInput['filesScanned']);
    const decodedTruncatedFiles = decodeNumber(rawInput['truncatedFiles']);
    const decodedTokens = decodeTokenCounts(rawInput['tokens']);
    const decodedCostUsd = decodeNumber(rawInput['costUsd']);
    const decodedPriced = decodeBoolean(rawInput['priced']);
    const decodedRequests = decodeNumber(rawInput['requests']);
    const decodedSessions = decodeArray(rawInput['sessions'], decodeSessionUsage);
    const decodedModels = decodeArray(rawInput['models'], decodeModelUsage);
    const decodedUnpricedModels = decodeArray(rawInput['unpricedModels'], decodeString);
    const decodedBurn = decodeBurnRate(rawInput['burn']);

    if (
      decodedGeneratedAt === null ||
      decodedWindowMinutes === null ||
      decodedFilesScanned === null ||
      decodedTruncatedFiles === null ||
      decodedTokens === null ||
      decodedCostUsd === null ||
      decodedPriced === null ||
      decodedRequests === null ||
      decodedSessions === null ||
      decodedModels === null ||
      decodedUnpricedModels === null ||
      decodedBurn === null
    ) {
      return null;
    }

    return {
      generatedAt: decodedGeneratedAt,
      windowMinutes: decodedWindowMinutes,
      filesScanned: decodedFilesScanned,
      truncatedFiles: decodedTruncatedFiles,
      tokens: decodedTokens,
      costUsd: decodedCostUsd,
      priced: decodedPriced,
      requests: decodedRequests,
      sessions: decodedSessions,
      models: decodedModels,
      unpricedModels: decodedUnpricedModels,
      burn: decodedBurn,
    };
  }
  return null;
}
