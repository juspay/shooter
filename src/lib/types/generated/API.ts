import {
  isJSON,
  decodeString,
  _decodeString,
  decodeBoolean,
  _decodeBoolean,
  decodeNumber,
  _decodeNumber,
} from 'type-decoder';

/**
 * @type { NotificationData }
 * @description Custom data payload attached to a notification
 */
export type NotificationData = {
  /**
   * @description Notification category for grouping
   * @type { string }
   * @memberof NotificationData
   */
  category: string | null;
  /**
   * @description Files related to the notification event
   * @type { string }
   * @memberof NotificationData
   */
  files: string | null;
  /**
   * @description Project name associated with the notification
   * @type { string }
   * @memberof NotificationData
   */
  project: string | null;
  /**
   * @description Source hook or system that generated the notification
   * @type { string }
   * @memberof NotificationData
   */
  source: string | null;
  /**
   * @description Tool name related to the notification event
   * @type { string }
   * @memberof NotificationData
   */
  tool: string | null;
  [keys: string]: unknown;
};

export function decodeNotificationData(rawInput: unknown): NotificationData | null {
  if (isJSON(rawInput)) {
    const decodedCategory = decodeString(rawInput['category']);
    const decodedFiles = decodeString(rawInput['files']);
    const decodedProject = decodeString(rawInput['project']);
    const decodedSource = decodeString(rawInput['source']);
    const decodedTool = decodeString(rawInput['tool']);

    return {
      ...rawInput,
      category: decodedCategory,
      files: decodedFiles,
      project: decodedProject,
      source: decodedSource,
      tool: decodedTool,
    };
  }
  return null;
}

/**
 * @type { FCMConfiguration }
 * @description Firebase Cloud Messaging configuration status
 */
export type FCMConfiguration = {
  /**
   * @description Whether all required FCM environment variables are present
   * @type { boolean }
   * @memberof FCMConfiguration
   */
  configured: boolean;
  /**
   * @description Whether FCM_CLIENT_EMAIL is set
   * @type { boolean }
   * @memberof FCMConfiguration
   */
  hasClientEmail: boolean;
  /**
   * @description Whether FCM_PRIVATE_KEY is set
   * @type { boolean }
   * @memberof FCMConfiguration
   */
  hasPrivateKey: boolean;
  /**
   * @description Whether FCM_PROJECT_ID is set
   * @type { boolean }
   * @memberof FCMConfiguration
   */
  hasProjectId: boolean;
};

export function decodeFCMConfiguration(rawInput: unknown): FCMConfiguration | null {
  if (isJSON(rawInput)) {
    const decodedConfigured = decodeBoolean(rawInput['configured']);
    const decodedHasClientEmail = decodeBoolean(rawInput['hasClientEmail']);
    const decodedHasPrivateKey = decodeBoolean(rawInput['hasPrivateKey']);
    const decodedHasProjectId = decodeBoolean(rawInput['hasProjectId']);

    if (
      decodedConfigured === null ||
      decodedHasClientEmail === null ||
      decodedHasPrivateKey === null ||
      decodedHasProjectId === null
    ) {
      return null;
    }

    return {
      configured: decodedConfigured,
      hasClientEmail: decodedHasClientEmail,
      hasPrivateKey: decodedHasPrivateKey,
      hasProjectId: decodedHasProjectId,
    };
  }
  return null;
}

/**
 * @type { HealthStatus }
 * @description Overall server health status
 */
export type HealthStatus = 'healthy' | 'degraded';

export function decodeHealthStatus(rawInput: unknown): HealthStatus | null {
  switch (rawInput) {
    case 'healthy':
    case 'degraded':
      return rawInput;
  }
  return null;
}

export function _decodeHealthStatus(rawInput: unknown): HealthStatus | undefined {
  switch (rawInput) {
    case 'healthy':
    case 'degraded':
      return rawInput;
  }
  return;
}

/**
 * @type { HealthChecks }
 * @description Boolean checks for required service configurations
 */
export type HealthChecks = {
  /**
   * @description Whether API_KEY is set
   * @type { boolean }
   * @memberof HealthChecks
   */
  hasApiKey: boolean;
  /**
   * @description Whether all APNs keys are configured (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID)
   * @type { boolean }
   * @memberof HealthChecks
   */
  hasAPNsConfig: boolean;
  /**
   * @description Whether APNS_BUNDLE_ID is set
   * @type { boolean }
   * @memberof HealthChecks
   */
  hasBundleId: boolean;
  /**
   * @description Whether DEVICE_TOKEN is set
   * @type { boolean }
   * @memberof HealthChecks
   */
  hasDeviceToken: boolean;
  /**
   * @description Whether all FCM credentials are configured
   * @type { boolean }
   * @memberof HealthChecks
   */
  hasFCMConfig: boolean;
};

export function decodeHealthChecks(rawInput: unknown): HealthChecks | null {
  if (isJSON(rawInput)) {
    const decodedHasApiKey = decodeBoolean(rawInput['hasApiKey']);
    const decodedHasAPNsConfig = decodeBoolean(rawInput['hasAPNsConfig']);
    const decodedHasBundleId = decodeBoolean(rawInput['hasBundleId']);
    const decodedHasDeviceToken = decodeBoolean(rawInput['hasDeviceToken']);
    const decodedHasFCMConfig = decodeBoolean(rawInput['hasFCMConfig']);

    if (
      decodedHasApiKey === null ||
      decodedHasAPNsConfig === null ||
      decodedHasBundleId === null ||
      decodedHasDeviceToken === null ||
      decodedHasFCMConfig === null
    ) {
      return null;
    }

    return {
      hasApiKey: decodedHasApiKey,
      hasAPNsConfig: decodedHasAPNsConfig,
      hasBundleId: decodedHasBundleId,
      hasDeviceToken: decodedHasDeviceToken,
      hasFCMConfig: decodedHasFCMConfig,
    };
  }
  return null;
}

/**
 * @type { HealthConfiguration }
 * @description Detailed server configuration snapshot
 */
export type HealthConfiguration = {
  /**
   * @description Truncated APNs key ID (first 4 chars + "..."), or empty string if not set
   * @type { string }
   * @memberof HealthConfiguration
   */
  apnsKeyId: string;
  /**
   * @description iOS app bundle identifier, or empty string if not set
   * @type { string }
   * @memberof HealthConfiguration
   */
  bundleId: string;
  /**
   * @description Length of the configured device token (0 if not set)
   * @type { number }
   * @memberof HealthConfiguration
   */
  deviceTokenLength: number;
  /**
   * @description FCM configuration status
   * @type { FCMConfiguration }
   * @memberof HealthConfiguration
   */
  fcm: FCMConfiguration;
  /**
   * @description Whether the server is using the production APNs gateway
   * @type { boolean }
   * @memberof HealthConfiguration
   */
  production: boolean;
};

export function decodeHealthConfiguration(rawInput: unknown): HealthConfiguration | null {
  if (isJSON(rawInput)) {
    const decodedApnsKeyId = decodeString(rawInput['apnsKeyId']);
    const decodedBundleId = decodeString(rawInput['bundleId']);
    const decodedDeviceTokenLength = decodeNumber(rawInput['deviceTokenLength']);
    const decodedFcm = decodeFCMConfiguration(rawInput['fcm']);
    const decodedProduction = decodeBoolean(rawInput['production']);

    if (
      decodedApnsKeyId === null ||
      decodedBundleId === null ||
      decodedDeviceTokenLength === null ||
      decodedFcm === null ||
      decodedProduction === null
    ) {
      return null;
    }

    return {
      apnsKeyId: decodedApnsKeyId,
      bundleId: decodedBundleId,
      deviceTokenLength: decodedDeviceTokenLength,
      fcm: decodedFcm,
      production: decodedProduction,
    };
  }
  return null;
}
