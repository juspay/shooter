import { isJSON, decodeString, _decodeString, decodeNumber, _decodeNumber } from 'type-decoder';

/**
 * @type { ShooterConfig }
 * @description Client-side configuration stored in localStorage for API authentication and device registration
 */
export type ShooterConfig = {
  /**
   * @description API key for authenticating requests to the Shooter server
   * @type { string }
   * @memberof ShooterConfig
   */
  apiKey: string;
  /**
   * @description Device token for push notification delivery (APNs or FCM)
   * @type { string }
   * @memberof ShooterConfig
   */
  deviceToken: string | null;
  /**
   * @description Base URL of the Shooter server, or null to use the current origin
   * @type { string }
   * @memberof ShooterConfig
   */
  serverUrl: string | null;
  /**
   * @description Unix timestamp (milliseconds) of the last configuration update
   * @type { number }
   * @memberof ShooterConfig
   */
  lastUpdated: number | null;
};

export function decodeShooterConfig(rawInput: unknown): ShooterConfig | null {
  if (isJSON(rawInput)) {
    const decodedApiKey = decodeString(rawInput['apiKey']);
    const decodedDeviceToken = decodeString(rawInput['deviceToken']);
    const decodedServerUrl = decodeString(rawInput['serverUrl']);
    const decodedLastUpdated = decodeNumber(rawInput['lastUpdated']);

    if (decodedApiKey === null) {
      return null;
    }

    return {
      apiKey: decodedApiKey,
      deviceToken: decodedDeviceToken,
      serverUrl: decodedServerUrl,
      lastUpdated: decodedLastUpdated,
    };
  }
  return null;
}
