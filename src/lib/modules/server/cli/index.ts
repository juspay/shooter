import type { CLICommand, Options as CLIOptions, CLIResult } from '$lib/types';

export { CLIRunner, createRunner, sleep } from './runner';

const DEFAULT_OPTIONS: CLIOptions = {
  dryRun: false,
  timeout: null,
  verbose: false,
};

export function createCommand(name: string, args: string[] = []): CLICommand {
  return {
    args,
    name,
    options: { ...DEFAULT_OPTIONS },
  };
}

export function createErrorResult(error: string, exitCode = 1): CLIResult {
  return {
    error,
    exitCode,
    output: null,
    success: false,
  };
}

export function createSuccessResult(output: string): CLIResult {
  return {
    error: null,
    exitCode: 0,
    output,
    success: true,
  };
}

export function formatCommand(command: CLICommand): string {
  const parts = [command.name, ...command.args];
  return parts.join(' ');
}

export function withOptions(command: CLICommand, options: Partial<CLIOptions>): CLICommand {
  return {
    ...command,
    options: {
      dryRun: options.dryRun !== undefined ? options.dryRun : command.options.dryRun,
      timeout: options.timeout !== undefined ? options.timeout : command.options.timeout,
      verbose: options.verbose !== undefined ? options.verbose : command.options.verbose,
    },
  };
}
