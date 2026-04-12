// CLI types that require $ref or array constructs not yet supported by
// type-crafter, so they live here instead of in the generated barrel.

import type { Options as CLIOptions } from './generated';

export interface CLICommand {
  args: string[];
  name: string;
  options: CLIOptions;
}

export interface CLIResult {
  error: null | string;
  exitCode: number;
  output: null | string;
  success: boolean;
}

export interface CLIRunnerConfig {
  args: null | string[];
  cols: null | number;
  command: string;
  cwd: null | string;
  rows: null | number;
  useLoginShell: boolean | null;
}

export interface CLIRunnerInternalConfig {
  args: string[];
  cols: number;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  rows: number;
  useLoginShell: boolean;
}
export type ExitCallback = (code: number, signal?: number) => void;

export type OutputCallback = (data: string) => void;
