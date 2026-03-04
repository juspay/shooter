import {
  _decodeBoolean,
  _decodeNumber,
  _decodeString,
  decodeBoolean,
  decodeNumber,
  decodeString,
  isJSON,
} from 'type-decoder';

/**
 * @type { Error }
 * @description Individual notification error for a specific device
 */
export interface Error {
  /**
   * @description Device token that failed to receive notification
   * @type { string }
   * @memberof Error
   */
  device: string;
  /**
   * @description Error response from APNs
   * @type { ErrorResponse }
   * @memberof Error
   */
  response: ErrorResponse | null;
  /**
   * @description HTTP status code from APNs
   * @type { number }
   * @memberof Error
   */
  status: null | number;
}

/**
 * @type { ErrorData }
 * @description Error details returned from APNs server
 */
export interface ErrorData {
  /**
   * @description Specific error reason code from APNs
   * @type { string }
   * @memberof ErrorData
   */
  reason: null | string;
}

/**
 * @type { ErrorResponse }
 * @description Full error response from APNs
 */
export interface ErrorResponse {
  /**
   * @description Specific error reason code from APNs
   * @type { string }
   * @memberof ErrorResponse
   */
  reason: null | string;
}

/**
 * @type { LibraryFailedItem }
 * @description Individual failed notification item from apn library
 */
export interface LibraryFailedItem {
  /**
   * @description Device token that failed
   * @type { string }
   * @memberof LibraryFailedItem
   */
  device: string;
  /**
   * @description Error response from APNs
   * @type { ErrorResponse }
   * @memberof LibraryFailedItem
   */
  response: ErrorResponse | null;
  /**
   * @description HTTP status code
   * @type { number }
   * @memberof LibraryFailedItem
   */
  status: null | number;
}

/**
 * @type { LibrarySentItem }
 * @description Individual sent notification item from apn library
 */
export interface LibrarySentItem {
  /**
   * @description Device token that received notification
   * @type { string }
   * @memberof LibrarySentItem
   */
  device: string;
}

/**
 * @type { RawResponse }
 * @description Raw HTTP response from APNs server
 */
export interface RawResponse {
  /**
   * @description Unique identifier for this notification from APNs
   * @type { string }
   * @memberof RawResponse
   */
  apnsId: null | string;
  /**
   * @description Response body data (nullable - null on success)
   * @type { ErrorData }
   * @memberof RawResponse
   */
  data: ErrorData | null;
  /**
   * @description HTTP response headers from APNs
   * @type { RawResponseHeaders }
   * @memberof RawResponse
   */
  headers: RawResponseHeaders;
  /**
   * @description HTTP status code from APNs
   * @type { number }
   * @memberof RawResponse
   */
  statusCode: number;
  /**
   * @description Whether the notification was successfully sent
   * @type { boolean }
   * @memberof RawResponse
   */
  success: boolean;
}

/**
 * @type { RawResponseHeaders }
 * @description HTTP response headers from APNs
 */
export type RawResponseHeaders = Record<string, unknown>;

/**
 * @type { SentDetail }
 * @description Details about a successfully sent notification
 */
export interface SentDetail {
  /**
   * @description Unique APNs identifier for the notification
   * @type { string }
   * @memberof SentDetail
   */
  'apns-unique-id': null | string;
  /**
   * @description Device token that received the notification
   * @type { string }
   * @memberof SentDetail
   */
  device: null | string;
  /**
   * @description Delivery status
   * @type { string }
   * @memberof SentDetail
   */
  status: null | string;
}

export function decodeError(rawInput: unknown): Error | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput.device);
    const decodedResponse = decodeErrorResponse(rawInput.response);
    const decodedStatus = decodeNumber(rawInput.status);

    if (decodedDevice === null) {
      return null;
    }

    return {
      device: decodedDevice,
      response: decodedResponse,
      status: decodedStatus,
    };
  }
  return null;
}

export function decodeErrorData(rawInput: unknown): ErrorData | null {
  if (isJSON(rawInput)) {
    const decodedReason = decodeString(rawInput.reason);

    return {
      reason: decodedReason,
    };
  }
  return null;
}

export function decodeErrorResponse(rawInput: unknown): ErrorResponse | null {
  if (isJSON(rawInput)) {
    const decodedReason = decodeString(rawInput.reason);

    return {
      reason: decodedReason,
    };
  }
  return null;
}

export function decodeLibraryFailedItem(rawInput: unknown): LibraryFailedItem | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput.device);
    const decodedResponse = decodeErrorResponse(rawInput.response);
    const decodedStatus = decodeNumber(rawInput.status);

    if (decodedDevice === null) {
      return null;
    }

    return {
      device: decodedDevice,
      response: decodedResponse,
      status: decodedStatus,
    };
  }
  return null;
}

export function decodeLibrarySentItem(rawInput: unknown): LibrarySentItem | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput.device);

    if (decodedDevice === null) {
      return null;
    }

    return {
      device: decodedDevice,
    };
  }
  return null;
}

export function decodeRawResponse(rawInput: unknown): null | RawResponse {
  if (isJSON(rawInput)) {
    const decodedStatusCode = decodeNumber(rawInput.statusCode);
    const decodedHeaders = decodeRawResponseHeaders(rawInput.headers);
    const decodedData = decodeErrorData(rawInput.data);
    const decodedSuccess = decodeBoolean(rawInput.success);
    const decodedApnsId = decodeString(rawInput.apnsId);

    if (decodedStatusCode === null || decodedHeaders === null || decodedSuccess === null) {
      return null;
    }

    return {
      apnsId: decodedApnsId,
      data: decodedData,
      headers: decodedHeaders,
      statusCode: decodedStatusCode,
      success: decodedSuccess,
    };
  }
  return null;
}

export function decodeRawResponseHeaders(rawInput: unknown): null | RawResponseHeaders {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

export function decodeSentDetail(rawInput: unknown): null | SentDetail {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput.device);
    const decodedStatus = decodeString(rawInput.status);
    const decodedApnsUniqueId = decodeString(rawInput['apns-unique-id']);

    return {
      'apns-unique-id': decodedApnsUniqueId,
      device: decodedDevice,
      status: decodedStatus,
    };
  }
  return null;
}
