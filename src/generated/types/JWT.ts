import { _decodeNumber, _decodeString, decodeNumber, decodeString, isJSON } from 'type-decoder';

/**
 * @type { Header }
 * @description JWT header for APNs authentication token
 */
export interface Header {
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
}

/**
 * @type { Payload }
 * @description JWT payload containing token claims
 */
export interface Payload {
  /**
   * @description Expiration time (Unix timestamp, optional)
   * @type { number }
   * @memberof Payload
   */
  exp: null | number;
  /**
   * @description Issued at time (Unix timestamp)
   * @type { number }
   * @memberof Payload
   */
  iat: number;
  /**
   * @description Issuer - your Apple Team ID
   * @type { string }
   * @memberof Payload
   */
  iss: string;
}

export function decodeHeader(rawInput: unknown): Header | null {
  if (isJSON(rawInput)) {
    const decodedAlg = decodeString(rawInput.alg);
    const decodedKid = decodeString(rawInput.kid);

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

export function decodePayload(rawInput: unknown): null | Payload {
  if (isJSON(rawInput)) {
    const decodedIss = decodeString(rawInput.iss);
    const decodedIat = decodeNumber(rawInput.iat);
    const decodedExp = decodeNumber(rawInput.exp);

    if (decodedIss === null || decodedIat === null) {
      return null;
    }

    return {
      exp: decodedExp,
      iat: decodedIat,
      iss: decodedIss,
    };
  }
  return null;
}
