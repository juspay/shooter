import {
  isJSON,
  decodeString,
  _decodeString,
  decodeNumber,
  _decodeNumber,
  decodeArray,
  _decodeArray,
} from 'type-decoder';

/**
 * @type { NotificationStatus }
 * @description Delivery status of a notification
 */
export type NotificationStatus = 'sent' | 'failed' | 'filtered' | 'skipped';

export function decodeNotificationStatus(rawInput: unknown): NotificationStatus | null {
  switch (rawInput) {
    case 'sent':
    case 'failed':
    case 'filtered':
    case 'skipped':
      return rawInput;
  }
  return null;
}

export function _decodeNotificationStatus(rawInput: unknown): NotificationStatus | undefined {
  switch (rawInput) {
    case 'sent':
    case 'failed':
    case 'filtered':
    case 'skipped':
      return rawInput;
  }
  return;
}

/**
 * @type { NotificationSessionStatus }
 * @description Whether a notification session is still active or has completed
 */
export type NotificationSessionStatus = 'active' | 'complete';

export function decodeNotificationSessionStatus(
  rawInput: unknown
): NotificationSessionStatus | null {
  switch (rawInput) {
    case 'active':
    case 'complete':
      return rawInput;
  }
  return null;
}

export function _decodeNotificationSessionStatus(
  rawInput: unknown
): NotificationSessionStatus | undefined {
  switch (rawInput) {
    case 'active':
    case 'complete':
      return rawInput;
  }
  return;
}

/**
 * @type { PermissionDecision }
 * @description User decision on a permission request
 */
export type PermissionDecision = 'allow' | 'deny';

export function decodePermissionDecision(rawInput: unknown): PermissionDecision | null {
  switch (rawInput) {
    case 'allow':
    case 'deny':
      return rawInput;
  }
  return null;
}

export function _decodePermissionDecision(rawInput: unknown): PermissionDecision | undefined {
  switch (rawInput) {
    case 'allow':
    case 'deny':
      return rawInput;
  }
  return;
}

/**
 * @type { NotificationRecord }
 * @description A single notification entry stored in the in-memory history
 */
export type NotificationRecord = {
  /**
   * @description Unique notification identifier
   * @type { string }
   * @memberof NotificationRecord
   */
  id: string;
  /**
   * @description Notification title
   * @type { string }
   * @memberof NotificationRecord
   */
  title: string;
  /**
   * @description Notification body text
   * @type { string }
   * @memberof NotificationRecord
   */
  message: string;
  /**
   * @description Delivery status of the notification
   * @type { NotificationStatus }
   * @memberof NotificationRecord
   */
  status: NotificationStatus;
  /**
   * @description ISO 8601 timestamp when the notification was created
   * @type { string }
   * @memberof NotificationRecord
   */
  timestamp: string;
  /**
   * @description Notification category (e.g. debug, feature, testing)
   * @type { string }
   * @memberof NotificationRecord
   */
  category: string | null;
  /**
   * @description Project name the notification relates to
   * @type { string }
   * @memberof NotificationRecord
   */
  project: string | null;
  /**
   * @description Source that triggered the notification (e.g. hook name)
   * @type { string }
   * @memberof NotificationRecord
   */
  source: string | null;
  /**
   * @description Tool name that triggered the notification
   * @type { string }
   * @memberof NotificationRecord
   */
  tool: string | null;
  /**
   * @description Error message if the notification failed to send
   * @type { string }
   * @memberof NotificationRecord
   */
  error: string | null;
  /**
   * @description Additional metadata attached to the notification
   * @type { NotificationRecordData }
   * @memberof NotificationRecord
   */
  data: NotificationRecordData | null;
};

export function decodeNotificationRecord(rawInput: unknown): NotificationRecord | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedTitle = decodeString(rawInput['title']);
    const decodedMessage = decodeString(rawInput['message']);
    const decodedStatus = decodeNotificationStatus(rawInput['status']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);
    const decodedCategory = decodeString(rawInput['category']);
    const decodedProject = decodeString(rawInput['project']);
    const decodedSource = decodeString(rawInput['source']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedError = decodeString(rawInput['error']);
    const decodedData = decodeNotificationRecordData(rawInput['data']);

    if (
      decodedId === null ||
      decodedTitle === null ||
      decodedMessage === null ||
      decodedStatus === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      title: decodedTitle,
      message: decodedMessage,
      status: decodedStatus,
      timestamp: decodedTimestamp,
      category: decodedCategory,
      project: decodedProject,
      source: decodedSource,
      tool: decodedTool,
      error: decodedError,
      data: decodedData,
    };
  }
  return null;
}

/**
 * @type { NotificationRecordData }
 * @description Additional metadata attached to the notification
 */
export type NotificationRecordData = Record<string, unknown>;

export function decodeNotificationRecordData(rawInput: unknown): NotificationRecordData | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { NotificationSession }
 * @description A grouped session of notification events, derived from notification history with 30-minute gap detection
 */
export type NotificationSession = {
  /**
   * @description Session identifier (e.g. "session-1")
   * @type { string }
   * @memberof NotificationSession
   */
  id: string;
  /**
   * @description Project name associated with this session
   * @type { string }
   * @memberof NotificationSession
   */
  project: string;
  /**
   * @description Runtime that produced the events (e.g. "claude-code", "opencode")
   * @type { string }
   * @memberof NotificationSession
   */
  runtime: string;
  /**
   * @description ISO 8601 timestamp of the first event in the session
   * @type { string }
   * @memberof NotificationSession
   */
  startTime: string;
  /**
   * @description ISO 8601 timestamp of the last event in the session
   * @type { string }
   * @memberof NotificationSession
   */
  endTime: string;
  /**
   * @description Session duration in seconds
   * @type { number }
   * @memberof NotificationSession
   */
  duration: number;
  /**
   * @description Total number of notification events in this session
   * @type { number }
   * @memberof NotificationSession
   */
  eventCount: number;
  /**
   * @description All notification records in this session, sorted chronologically
   * @type { NotificationRecord[] }
   * @memberof NotificationSession
   */
  events: NotificationRecord[];
  /**
   * @description Distinct tool names used during this session
   * @type { string[] }
   * @memberof NotificationSession
   */
  toolsUsed: string[];
  /**
   * @description Distinct file paths modified during this session
   * @type { string[] }
   * @memberof NotificationSession
   */
  filesModified: string[];
  /**
   * @description Whether the session is still active or has completed
   * @type { NotificationSessionStatus }
   * @memberof NotificationSession
   */
  status: NotificationSessionStatus;
};

export function decodeNotificationSession(rawInput: unknown): NotificationSession | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedProject = decodeString(rawInput['project']);
    const decodedRuntime = decodeString(rawInput['runtime']);
    const decodedStartTime = decodeString(rawInput['startTime']);
    const decodedEndTime = decodeString(rawInput['endTime']);
    const decodedDuration = decodeNumber(rawInput['duration']);
    const decodedEventCount = decodeNumber(rawInput['eventCount']);
    const decodedEvents = decodeArray(rawInput['events'], decodeNotificationRecord);
    const decodedToolsUsed = decodeArray(rawInput['toolsUsed'], decodeString);
    const decodedFilesModified = decodeArray(rawInput['filesModified'], decodeString);
    const decodedStatus = decodeNotificationSessionStatus(rawInput['status']);

    if (
      decodedId === null ||
      decodedProject === null ||
      decodedRuntime === null ||
      decodedStartTime === null ||
      decodedEndTime === null ||
      decodedDuration === null ||
      decodedEventCount === null ||
      decodedEvents === null ||
      decodedToolsUsed === null ||
      decodedFilesModified === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      project: decodedProject,
      runtime: decodedRuntime,
      startTime: decodedStartTime,
      endTime: decodedEndTime,
      duration: decodedDuration,
      eventCount: decodedEventCount,
      events: decodedEvents,
      toolsUsed: decodedToolsUsed,
      filesModified: decodedFilesModified,
      status: decodedStatus,
    };
  }
  return null;
}

/**
 * @type { PendingRequest }
 * @description An in-memory pending permission request awaiting user decision via iOS notification
 */
export type PendingRequest = {
  /**
   * @description AI session that triggered the permission request
   * @type { string }
   * @memberof PendingRequest
   */
  sessionId: string;
  /**
   * @description Tool requesting permission (e.g. "Bash", "Edit")
   * @type { string }
   * @memberof PendingRequest
   */
  toolName: string;
  /**
   * @description Tool input parameters that require approval
   * @type { PendingRequestToolInput }
   * @memberof PendingRequest
   */
  toolInput: PendingRequestToolInput;
  /**
   * @description Unix timestamp (ms) when the request was created
   * @type { number }
   * @memberof PendingRequest
   */
  createdAt: number;
  /**
   * @description Unix timestamp (ms) when the user responded, or null if still pending
   * @type { number }
   * @memberof PendingRequest
   */
  decidedAt: number | null;
  /**
   * @description User's decision (allow/deny), or null if still pending
   * @type { PermissionDecision }
   * @memberof PendingRequest
   */
  decision: PermissionDecision | null;
};

export function decodePendingRequest(rawInput: unknown): PendingRequest | null {
  if (isJSON(rawInput)) {
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedToolName = decodeString(rawInput['toolName']);
    const decodedToolInput = decodePendingRequestToolInput(rawInput['toolInput']);
    const decodedCreatedAt = decodeNumber(rawInput['createdAt']);
    const decodedDecidedAt = decodeNumber(rawInput['decidedAt']);
    const decodedDecision = decodePermissionDecision(rawInput['decision']);

    if (
      decodedSessionId === null ||
      decodedToolName === null ||
      decodedToolInput === null ||
      decodedCreatedAt === null
    ) {
      return null;
    }

    return {
      sessionId: decodedSessionId,
      toolName: decodedToolName,
      toolInput: decodedToolInput,
      createdAt: decodedCreatedAt,
      decidedAt: decodedDecidedAt,
      decision: decodedDecision,
    };
  }
  return null;
}

/**
 * @type { PendingRequestToolInput }
 * @description Tool input parameters that require approval
 */
export type PendingRequestToolInput = Record<string, unknown>;

export function decodePendingRequestToolInput(rawInput: unknown): PendingRequestToolInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}
