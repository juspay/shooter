import {
  isJSON,
  decodeString,
  _decodeString,
  decodeNumber,
  _decodeNumber,
  decodeBoolean,
  _decodeBoolean,
} from 'type-decoder';

/**
 * @type { ErrorResponse }
 * @description Full error response from APNs
 */
export type ErrorResponse = {
  /**
   * @description Specific error reason code from APNs
   * @type { string }
   * @memberof ErrorResponse
   */
  reason: string | null;
};

export function decodeErrorResponse(rawInput: unknown): ErrorResponse | null {
  if (isJSON(rawInput)) {
    const decodedReason = decodeString(rawInput['reason']);

    return {
      reason: decodedReason,
    };
  }
  return null;
}

/**
 * @type { ErrorData }
 * @description Error details returned from APNs server
 */
export type ErrorData = {
  /**
   * @description Specific error reason code from APNs
   * @type { string }
   * @memberof ErrorData
   */
  reason: string | null;
};

export function decodeErrorData(rawInput: unknown): ErrorData | null {
  if (isJSON(rawInput)) {
    const decodedReason = decodeString(rawInput['reason']);

    return {
      reason: decodedReason,
    };
  }
  return null;
}

/**
 * @type { RawResponse }
 * @description Raw HTTP response from APNs server
 */
export type RawResponse = {
  /**
   * @description HTTP status code from APNs
   * @type { number }
   * @memberof RawResponse
   */
  statusCode: number;
  /**
   * @description HTTP response headers from APNs
   * @type { RawResponseHeaders }
   * @memberof RawResponse
   */
  headers: RawResponseHeaders;
  /**
   * @description Response body data (nullable - null on success)
   * @type { ErrorData }
   * @memberof RawResponse
   */
  data: ErrorData | null;
  /**
   * @description Whether the notification was successfully sent
   * @type { boolean }
   * @memberof RawResponse
   */
  success: boolean;
  /**
   * @description Unique identifier for this notification from APNs
   * @type { string }
   * @memberof RawResponse
   */
  apnsId: string | null;
};

export function decodeRawResponse(rawInput: unknown): RawResponse | null {
  if (isJSON(rawInput)) {
    const decodedStatusCode = decodeNumber(rawInput['statusCode']);
    const decodedHeaders = decodeRawResponseHeaders(rawInput['headers']);
    const decodedData = decodeErrorData(rawInput['data']);
    const decodedSuccess = decodeBoolean(rawInput['success']);
    const decodedApnsId = decodeString(rawInput['apnsId']);

    if (decodedStatusCode === null || decodedHeaders === null || decodedSuccess === null) {
      return null;
    }

    return {
      statusCode: decodedStatusCode,
      headers: decodedHeaders,
      data: decodedData,
      success: decodedSuccess,
      apnsId: decodedApnsId,
    };
  }
  return null;
}

/**
 * @type { RawResponseHeaders }
 * @description HTTP response headers from APNs
 */
export type RawResponseHeaders = Record<string, unknown>;

export function decodeRawResponseHeaders(rawInput: unknown): RawResponseHeaders | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { Error }
 * @description Individual notification error for a specific device
 */
export type Error = {
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
  status: number | null;
};

export function decodeError(rawInput: unknown): Error | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput['device']);
    const decodedResponse = decodeErrorResponse(rawInput['response']);
    const decodedStatus = decodeNumber(rawInput['status']);

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

/**
 * @type { SentDetail }
 * @description Details about a successfully sent notification
 */
export type SentDetail = {
  /**
   * @description Device token that received the notification
   * @type { string }
   * @memberof SentDetail
   */
  device: string | null;
  /**
   * @description Delivery status
   * @type { string }
   * @memberof SentDetail
   */
  status: string | null;
  /**
   * @description Unique APNs identifier for the notification
   * @type { string }
   * @memberof SentDetail
   */
  'apns-unique-id': string | null;
};

export function decodeSentDetail(rawInput: unknown): SentDetail | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput['device']);
    const decodedStatus = decodeString(rawInput['status']);
    const decodedApnsUniqueId = decodeString(rawInput['apns-unique-id']);

    return {
      device: decodedDevice,
      status: decodedStatus,
      'apns-unique-id': decodedApnsUniqueId,
    };
  }
  return null;
}

/**
 * @type { LibrarySentItem }
 * @description Individual sent notification item from apn library
 */
export type LibrarySentItem = {
  /**
   * @description Device token that received notification
   * @type { string }
   * @memberof LibrarySentItem
   */
  device: string;
};

export function decodeLibrarySentItem(rawInput: unknown): LibrarySentItem | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput['device']);

    if (decodedDevice === null) {
      return null;
    }

    return {
      device: decodedDevice,
    };
  }
  return null;
}

/**
 * @type { LibraryFailedItem }
 * @description Individual failed notification item from apn library
 */
export type LibraryFailedItem = {
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
  status: number | null;
};

export function decodeLibraryFailedItem(rawInput: unknown): LibraryFailedItem | null {
  if (isJSON(rawInput)) {
    const decodedDevice = decodeString(rawInput['device']);
    const decodedResponse = decodeErrorResponse(rawInput['response']);
    const decodedStatus = decodeNumber(rawInput['status']);

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
