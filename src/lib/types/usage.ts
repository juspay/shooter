// Internal shapes for the usage reader. Hand-written rather than generated
// because they carry a Map, which the YAML type specs cannot express.
//
// The wire shapes (UsageSnapshot, SessionUsage, ModelUsage, TokenCounts,
// BurnRate, ModelRate) are generated from specs/types/usage.yaml.

import type { TokenCounts } from './generated';

/** What one model contributed within a single transcript. */
export interface ModelBucket {
  /** Null means UNKNOWN cost — no rate configured — never "free". */
  cost: null | number;
  requests: number;
  tokens: TokenCounts;
}

/** A transcript on disk, with the metadata needed to decide whether to read it. */
export interface Transcript {
  encodedDir: string;
  filePath: string;
  mtimeMs: number;
  sessionId: string;
  size: number;
}

/** What one transcript contributed inside the window. */
export interface TranscriptUsage {
  byModel: Map<string, ModelBucket>;
  cwd: string;
  lastActivityMs: number;
  requests: number;
  tokens: TokenCounts;
  /** True when the read budget was hit and in-window records may be missing. */
  truncated: boolean;
}
