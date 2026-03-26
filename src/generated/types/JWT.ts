import { isJSON, decodeString, _decodeString, decodeNumber, _decodeNumber } from 'type-decoder';

/**
 * @type { Header }
 * @description JWT header for APNs authentication token
 */
export type Header = {
  /**
   * @description Algorithm used for signing (ES256 for APNs)
   * @type { string }
   * @memberof Header
   */
  alg: string;
  /**
   * @description Key ID from Apple Developer account
   * @type { string }
   * @memberof Header
   */
  kid: string;
};

export function decodeHeader(rawInput: unknown): Header | null {
  if (isJSON(rawInput)) {
    const decodedAlg = decodeString(rawInput['alg']);
    const decodedKid = decodeString(rawInput['kid']);

    if (decodedAlg === null || decodedKid === null) {
      return null;
    }

    return {
      alg: decodedAlg,
      kid: decodedKid,
    };
  }
  return null;
}

/**
 * @type { Payload }
 * @description JWT payload containing token claims
 */
export type Payload = {
  /**
   * @description Issuer - your Apple Team ID
   * @type { string }
   * @memberof Payload
   */
  iss: string;
  /**
   * @description Issued at time (Unix timestamp)
   * @type { number }
   * @memberof Payload
   */
  iat: number;
  /**
   * @description Expiration time (Unix timestamp, optional)
   * @type { number }
   * @memberof Payload
   */
  exp: number | null;
};

export function decodePayload(rawInput: unknown): Payload | null {
  if (isJSON(rawInput)) {
    const decodedIss = decodeString(rawInput['iss']);
    const decodedIat = decodeNumber(rawInput['iat']);
    const decodedExp = decodeNumber(rawInput['exp']);

    if (decodedIss === null || decodedIat === null) {
      return null;
    }

    return {
      iss: decodedIss,
      iat: decodedIat,
      exp: decodedExp,
    };
  }
  return null;
}
