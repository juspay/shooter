import { _decodeBoolean, _decodeNumber, decodeBoolean , decodeNumber, isJSON  } from 'type-decoder';

/**
 * @type { Options }
 * @description Configuration options for CLI command execution
 */
export interface Options {
  /**
   * @description Simulate execution without making changes
   * @type { boolean }
   * @memberof Options
  */
  dryRun: boolean;
  /**
   * @description Command timeout in milliseconds
   * @type { number }
   * @memberof Options
  */
  timeout: null | number;
  /**
   * @description Enable verbose output logging
   * @type { boolean }
   * @memberof Options
  */
  verbose: boolean;
  }

export function decodeOptions(rawInput: unknown): null | Options {
  if (isJSON(rawInput)) {
    const decodedVerbose = decodeBoolean(rawInput.verbose);
    const decodedDryRun = decodeBoolean(rawInput.dryRun);
    const decodedTimeout = decodeNumber(rawInput.timeout);

    if (
      decodedVerbose === null ||
      decodedDryRun === null
    ) {
      return null;
    }

    return {
      dryRun: decodedDryRun,
      timeout: decodedTimeout,
      verbose: decodedVerbose
    };
  }
  return null;
}




