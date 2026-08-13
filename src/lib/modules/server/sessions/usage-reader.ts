/**
 * Live token-usage rollups read from Claude Code JSONL transcripts.
 *
 * Claude Code records `message.usage` on every assistant record but never a
 * cost, so spend is computed here from the rate table in usage-pricing.ts.
 *
 * THREE THINGS HERE ARE LOAD-BEARING.
 *
 * 1. DEDUP, KEEPING THE LAST ENTRY. Claude Code splits one API response across
 *    several JSONL entries sharing a `message.id`, and each carries a usage
 *    block. Summing them all over-counts badly: on a real 11.5k-line session
 *    output tokens came out 124.6% too high — more than double. But keeping the
 *    FIRST entry under-counts, because usage accumulates as the response
 *    streams: on that same corpus 575 of 6681 responses disagreed across their
 *    entries, and in 575 of 575 the last entry was the larger one, costing 4.3%
 *    of output tokens. So the last write wins, matching
 *    docs/CLAUDE-CODE-SESSION-JSONL-SCHEMA.md ("the last entry has the
 *    final/accurate usage"). `requestId` is NOT a usable key — it was present
 *    on 1 of 4144 records.
 *
 * 2. TAIL READS. The transcript corpus is not small — 9.3 GB across 15k files
 *    on the machine this was built against, with 1.5 GB touched in a single
 *    day, and most of that is subagent transcripts nested under
 *    `<session>/subagents/`. Reading files whole took 21s for a fraction of the
 *    corpus, which is useless for an endpoint a phone polls. Transcripts are
 *    append-only and chronological, so every record inside a trailing window
 *    lives at the END of the file: only the last TAIL_BUDGET_BYTES are read,
 *    and only from files whose mtime falls inside the window.
 *
 * 3. ASYNC I/O, ALWAYS. This server's main job is streaming live terminals over
 *    WebSockets. Every read here is on `fs/promises` and bounded by a small
 *    concurrency pool, because the synchronous version of this module blocked
 *    the event loop for ~3s on a cold scan — which would stall every terminal
 *    session on the box, not just the dashboard asking for numbers. Concurrent
 *    callers share one in-flight computation rather than each starting a scan.
 *
 * The consequence of (2) is that this reports a WINDOW, not all time. That is
 * the honest shape for a live monitor, and `truncatedFiles` reports when even
 * the tail budget was not enough so the numbers are never quietly incomplete.
 */

import type {
  BurnRate,
  ModelBucket,
  ModelUsage,
  SessionUsage,
  TokenCounts,
  Transcript,
  TranscriptUsage,
  UsageSnapshot,
} from '$lib/types';
import type { Dirent } from 'fs';

import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { costOf, isBilledModel } from './usage-pricing';

/**
 * Per-file read budget. Generous enough that an hour of even a very busy
 * session fits, small enough that a thousand of them stay responsive.
 */
const TAIL_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * Cap on how many in-window transcripts are actually read. Applied AFTER the
 * mtime filter and a newest-first sort — capping during the directory walk
 * instead silently discards the recent files (readdir order is arbitrary, and
 * with 15k transcripts a walk-time cap returned a window with nothing in it).
 */
const MAX_FILES = 2_000;

/**
 * How long the directory listing is reused.
 *
 * Walking and statting the corpus measured 2.5s of a 3.0s snapshot — it is the
 * whole cost, not the file reads. The listing only decides WHICH files to open;
 * each candidate is re-statted at read time, so a stale entry can delay a
 * brand-new session appearing by up to this TTL but can never produce a wrong
 * number for a session already being tracked.
 */
const LIST_TTL_MS = 10_000;

/** Open file handles / stats in flight at once. Keeps the pool from thrashing. */
const IO_CONCURRENCY = 16;

let cachedList: null | Transcript[] = null;
let cachedListAt = 0;

/** Deduplicates concurrent scans — see note 3 in the module header. */
const inFlight = new Map<string, Promise<UsageSnapshot>>();

/** Drop the memoised directory listing (tests, and after a corpus move). */
export function resetTranscriptCache(): void {
  cachedList = null;
  cachedListAt = 0;
  inFlight.clear();
}

/**
 * Aggregate recent Claude Code activity into one snapshot.
 *
 * Every figure covers the trailing `windowMinutes` only. `sessionLimit` bounds
 * how many per-session rows are RETURNED; totals, per-model rollups and the
 * burn rate always cover every scanned transcript, so the headline figures
 * never silently describe a subset of the window.
 *
 * Concurrent callers with the same arguments share one computation: the panel
 * polls, and a cold scan takes seconds, so without this a burst of requests
 * would each start their own walk over the same corpus.
 */
export async function usageSnapshot(
  options: { sessionLimit?: number; windowMinutes?: number } = {}
): Promise<UsageSnapshot> {
  const windowMinutes = options.windowMinutes ?? 60;
  const sessionLimit = options.sessionLimit ?? 20;
  const key = `${windowMinutes}:${sessionLimit}`;

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const run = buildSnapshot(windowMinutes, sessionLimit).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}

/**
 * Sum two costs where null means "unknown".
 *
 * Unknown is contagious: once any component is unpriced the total is a lower
 * bound, and returning a number would present it as complete.
 */
function addCost(a: null | number, b: null | number): null | number {
  return a === null || b === null ? null : a + b;
}

function addTokens(into: TokenCounts, from: TokenCounts): void {
  into.inputTokens += from.inputTokens;
  into.outputTokens += from.outputTokens;
  into.cacheCreationTokens += from.cacheCreationTokens;
  into.cacheReadTokens += from.cacheReadTokens;
  into.totalTokens += from.totalTokens;
}

/** The actual scan. Wrapped by `usageSnapshot` for single-flight. */
async function buildSnapshot(windowMinutes: number, sessionLimit: number): Promise<UsageSnapshot> {
  const cutoffMs = Date.now() - windowMinutes * 60 * 1000;

  // A file untouched since before the window cannot contain a record inside it,
  // so mtime alone eliminates almost the entire corpus without opening a byte.
  const listed = await listTranscripts();
  const shortlist = listed
    .filter((t) => t.mtimeMs >= cutoffMs && t.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_FILES);

  const refreshed = await mapPool(shortlist, refresh);
  const candidates = refreshed.filter(
    (t): t is Transcript => t !== null && t.mtimeMs >= cutoffMs && t.size > 0
  );

  const parsed = await mapPool(candidates, (t) => parseTranscript(t, cutoffMs));

  const totals = emptyTokens();
  let totalCost: null | number = 0;
  let totalRequests = 0;
  let truncatedFiles = 0;
  const models = new Map<string, ModelBucket>();
  const sessions: SessionUsage[] = [];

  for (const [index, file] of parsed.entries()) {
    const transcript = candidates[index];
    if (file.truncated) {
      truncatedFiles += 1;
    }
    if (file.requests === 0) {
      continue;
    }

    addTokens(totals, file.tokens);
    totalRequests += file.requests;

    let sessionCost: null | number = 0;
    for (const [modelId, bucket] of file.byModel) {
      const agg: ModelBucket = models.get(modelId) ?? {
        cost: 0,
        requests: 0,
        tokens: emptyTokens(),
      };
      addTokens(agg.tokens, bucket.tokens);
      agg.requests += bucket.requests;
      agg.cost = addCost(agg.cost, bucket.cost);
      models.set(modelId, agg);
      sessionCost = addCost(sessionCost, bucket.cost);
    }
    totalCost = addCost(totalCost, sessionCost);

    sessions.push({
      costUsd: sessionCost ?? 0,
      lastActivityAt: new Date(file.lastActivityMs).toISOString(),
      modelIds: [...file.byModel.keys()].sort(),
      priced: sessionCost !== null,
      projectName: displayName(file.cwd, transcript.encodedDir),
      projectPath: file.cwd || transcript.encodedDir,
      requests: file.requests,
      sessionId: transcript.sessionId,
      tokens: file.tokens,
    });
  }

  // Heaviest first — this is a "what is burning my budget" panel, and the UI
  // sizes its bars against the busiest row. The type description says the same.
  sessions.sort((a, b) => b.tokens.totalTokens - a.tokens.totalTokens);

  const modelRows: ModelUsage[] = [...models.entries()]
    .map(([modelId, agg]) => ({
      costUsd: agg.cost ?? 0,
      modelId,
      priced: agg.cost !== null,
      requests: agg.requests,
      tokens: agg.tokens,
    }))
    .sort((a, b) => b.tokens.totalTokens - a.tokens.totalTokens);

  const burn: BurnRate = {
    costPerHour: totalCost === null ? 0 : (totalCost / windowMinutes) * 60,
    priced: totalCost !== null,
    tokens: totals,
    tokensPerMinute: totals.totalTokens / windowMinutes,
    windowMinutes,
  };

  return {
    burn,
    costUsd: totalCost ?? 0,
    filesScanned: candidates.length,
    generatedAt: new Date().toISOString(),
    models: modelRows,
    priced: totalCost !== null,
    requests: totalRequests,
    sessions: sessions.slice(0, sessionLimit),
    tokens: totals,
    truncatedFiles,
    unpricedModels: modelRows.filter((m) => !m.priced).map((m) => m.modelId),
    windowMinutes,
  };
}

/** Last two segments of a project path — "temp/dopamine" reads better than the full path. */
function displayName(projectPath: string, encodedDir: string): string {
  const source = projectPath || encodedDir.replace(/^-/, '').replace(/-/g, '/');
  const segments = source.split('/').filter(Boolean);
  return segments.slice(-2).join('/') || encodedDir;
}

function emptyTokens(): TokenCounts {
  return {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Every transcript under ~/.claude/projects, walked recursively.
 *
 * Recursion is required, not tidiness: subagent transcripts live at
 * `<encodedDir>/<sessionId>/subagents/*.jsonl` and account for the large
 * majority of files. A flat readdir silently omits nearly all agent spend.
 */
async function listTranscripts(): Promise<Transcript[]> {
  if (cachedList && Date.now() - cachedListAt < LIST_TTL_MS) {
    return cachedList;
  }

  const root = projectsDir();
  let dirs: string[];
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const found: { encodedDir: string; filePath: string; name: string }[] = [];
  const walk = async (dir: string, encodedDir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        subdirs.push(full);
      } else if (entry.name.endsWith('.jsonl')) {
        found.push({ encodedDir, filePath: full, name: entry.name });
      }
    }
    await mapPool(subdirs, (sub) => walk(sub, encodedDir));
  };

  await mapPool(dirs, (name) => walk(path.join(root, name), name));

  const stats = await mapPool(found, async (entry) => {
    try {
      const stat = await fsp.stat(entry.filePath);
      return {
        encodedDir: entry.encodedDir,
        filePath: entry.filePath,
        mtimeMs: stat.mtimeMs,
        sessionId: entry.name.replace(/\.jsonl$/, ''),
        size: stat.size,
      };
    } catch {
      // A file that vanished between readdir and stat is simply skipped.
      return null;
    }
  });

  const out = stats.filter((t): t is Transcript => t !== null);
  cachedList = out;
  cachedListAt = Date.now();
  return out;
}

/**
 * Run `fn` over `items` with at most IO_CONCURRENCY outstanding at a time.
 *
 * Results stay positionally aligned with the input, which the snapshot relies
 * on to pair a parse result back to the transcript it came from.
 */
async function mapPool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) {
        return;
      }
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IO_CONCURRENCY, items.length) }, () => worker()));
  return out;
}

/** Read a numeric field, treating anything non-numeric as absent. */
function num(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Parse one transcript's tail, counting only records at or after `cutoffMs`. */
async function parseTranscript(file: Transcript, cutoffMs: number): Promise<TranscriptUsage> {
  const result: TranscriptUsage = {
    byModel: new Map(),
    cwd: '',
    lastActivityMs: 0,
    requests: 0,
    tokens: emptyTokens(),
    truncated: false,
  };

  const { complete, text } = await readTail(file.filePath, file.size);

  // Keyed by message.id, holding the LAST entry seen for that response — not
  // the first. See the dedup note at the top of the file.
  const responses = new Map<string, { modelId: string; tokens: TokenCounts; ts: number }>();
  let oldestSeenMs = Number.POSITIVE_INFINITY;

  for (const line of text.split('\n')) {
    // Cheap reject before JSON.parse — most records carry no usage at all and
    // transcripts run to five figures of lines.
    if (!line?.includes('"usage"')) {
      continue;
    }

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const ts = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    if (!Number.isFinite(ts)) {
      continue;
    }
    if (ts < oldestSeenMs) {
      oldestSeenMs = ts;
    }
    if (ts < cutoffMs) {
      continue;
    }

    const message = entry.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!message || !usage) {
      continue;
    }

    const modelId = typeof message.model === 'string' ? message.model : '';
    if (!modelId || !isBilledModel(modelId)) {
      continue;
    }

    const key =
      typeof message.id === 'string'
        ? message.id
        : typeof entry.uuid === 'string'
          ? entry.uuid
          : '';
    if (!key) {
      continue;
    }

    if (!result.cwd && typeof entry.cwd === 'string') {
      result.cwd = entry.cwd;
    }

    const tokens: TokenCounts = {
      cacheCreationTokens: num(usage, 'cache_creation_input_tokens'),
      cacheReadTokens: num(usage, 'cache_read_input_tokens'),
      inputTokens: num(usage, 'input_tokens'),
      outputTokens: num(usage, 'output_tokens'),
      totalTokens: 0,
    };
    tokens.totalTokens =
      tokens.inputTokens +
      tokens.outputTokens +
      tokens.cacheCreationTokens +
      tokens.cacheReadTokens;

    // Last write wins — a later entry supersedes an earlier one for the same
    // response, it does not add to it.
    responses.set(key, { modelId, tokens, ts });
  }

  for (const { modelId, tokens, ts } of responses.values()) {
    addTokens(result.tokens, tokens);
    result.requests += 1;
    if (ts > result.lastActivityMs) {
      result.lastActivityMs = ts;
    }

    const bucket: ModelBucket = result.byModel.get(modelId) ?? {
      cost: 0,
      requests: 0,
      tokens: emptyTokens(),
    };
    addTokens(bucket.tokens, tokens);
    bucket.requests += 1;
    bucket.cost = addCost(bucket.cost, costOf(modelId, tokens));
    result.byModel.set(modelId, bucket);
  }

  // A capped read is only known-complete for the window if it reached back PAST
  // the cutoff — seeing an older record proves nothing in the window was cut
  // off. Otherwise the file is a lower bound, including the degenerate cases
  // where the tail held no parseable record at all (a single JSONL record
  // longer than the budget, or one whose only newline is the file's trailing
  // one), which would otherwise read as an empty file rather than a truncated
  // one. `oldestSeenMs` stays Infinity when nothing parsed, so both are caught.
  result.truncated = !complete && oldestSeenMs >= cutoffMs;
  return result;
}

/**
 * Where transcripts live. Resolved per call rather than frozen at import so a
 * container can relocate it and tests can point at a fixture corpus.
 */
function projectsDir(): string {
  return (
    process.env.SHOOTER_CLAUDE_PROJECTS_DIR?.trim() ||
    path.join(os.homedir(), '.claude', 'projects')
  );
}

/**
 * Read at most the last TAIL_BUDGET_BYTES of a file.
 *
 * `complete` distinguishes "this is the whole file" from "this is where I
 * stopped"; the caller uses it to decide whether the result is a lower bound.
 */
async function readTail(
  filePath: string,
  size: number
): Promise<{ complete: boolean; text: string }> {
  if (size <= TAIL_BUDGET_BYTES) {
    try {
      return { complete: true, text: await fsp.readFile(filePath, 'utf8') };
    } catch {
      return { complete: true, text: '' };
    }
  }

  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(filePath, 'r');
    const buffer = Buffer.allocUnsafe(TAIL_BUDGET_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TAIL_BUDGET_BYTES, size - TAIL_BUDGET_BYTES);
    const text = buffer.toString('utf8', 0, bytesRead);
    // The first line is cut mid-record; drop it rather than feed a truncated
    // JSON fragment to the parser. With no newline at all there is no record
    // boundary in the entire budget, so nothing here is parseable.
    const newline = text.indexOf('\n');
    return { complete: false, text: newline === -1 ? '' : text.slice(newline + 1) };
  } catch {
    return { complete: true, text: '' };
  } finally {
    await handle?.close().catch(() => {
      // Nothing useful to do if the handle will not close.
    });
  }
}

/**
 * Re-stat a candidate so its size is current at read time.
 *
 * The listing may be up to LIST_TTL_MS stale, and an active transcript grows
 * constantly. A stale `size` would make readTail seek to the wrong offset and
 * miss exactly the newest records the monitor exists to show.
 */
async function refresh(transcript: Transcript): Promise<null | Transcript> {
  try {
    const stat = await fsp.stat(transcript.filePath);
    return { ...transcript, mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}
