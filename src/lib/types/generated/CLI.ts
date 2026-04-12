import { isJSON, decodeBoolean, _decodeBoolean, decodeNumber, _decodeNumber } from 'type-decoder';

/**
 * @type { Options }
 * @description Configuration options for CLI command execution
 */
export type Options = {
  /**
   * @description Enable verbose output logging
   * @type { boolean }
   * @memberof Options
   */
  verbose: boolean;
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
  timeout: number | null;
};

export function decodeOptions(rawInput: unknown): Options | null {
  if (isJSON(rawInput)) {
    const decodedVerbose = decodeBoolean(rawInput['verbose']);
    const decodedDryRun = decodeBoolean(rawInput['dryRun']);
    const decodedTimeout = decodeNumber(rawInput['timeout']);

    if (decodedVerbose === null || decodedDryRun === null) {
      return null;
    }

    return {
      verbose: decodedVerbose,
      dryRun: decodedDryRun,
      timeout: decodedTimeout,
    };
  }
  return null;
}
