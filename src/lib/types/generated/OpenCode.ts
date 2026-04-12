import { isJSON, decodeString, _decodeString, decodeNumber, _decodeNumber } from 'type-decoder';

/**
 * @type { OpenCodeSession }
 * @description Row from the OpenCode SQLite session table
 */
export type OpenCodeSession = {
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof OpenCodeSession
   */
  id: string;
  /**
   * @description Working directory associated with the session
   * @type { string }
   * @memberof OpenCodeSession
   */
  directory: string;
  /**
   * @description Unix timestamp when the session was created
   * @type { number }
   * @memberof OpenCodeSession
   */
  time_created: number;
  /**
   * @description Unix timestamp when the session was last updated
   * @type { number }
   * @memberof OpenCodeSession
   */
  time_updated: number;
};

export function decodeOpenCodeSession(rawInput: unknown): OpenCodeSession | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedDirectory = decodeString(rawInput['directory']);
    const decodedTimeCreated = decodeNumber(rawInput['time_created']);
    const decodedTimeUpdated = decodeNumber(rawInput['time_updated']);

    if (
      decodedId === null ||
      decodedDirectory === null ||
      decodedTimeCreated === null ||
      decodedTimeUpdated === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      directory: decodedDirectory,
      time_created: decodedTimeCreated,
      time_updated: decodedTimeUpdated,
    };
  }
  return null;
}

/**
 * @type { OpenCodeMessage }
 * @description Row from the OpenCode SQLite message table
 */
export type OpenCodeMessage = {
  /**
   * @description Unique message identifier
   * @type { string }
   * @memberof OpenCodeMessage
   */
  id: string;
  /**
   * @description Session this message belongs to
   * @type { string }
   * @memberof OpenCodeMessage
   */
  session_id: string;
  /**
   * @description Unix timestamp when the message was created
   * @type { number }
   * @memberof OpenCodeMessage
   */
  time_created: number;
  /**
   * @description Unix timestamp when the message was last updated
   * @type { number }
   * @memberof OpenCodeMessage
   */
  time_updated: number;
  /**
   * @description JSON-encoded message data containing role and metadata
   * @type { string }
   * @memberof OpenCodeMessage
   */
  data: string;
};

export function decodeOpenCodeMessage(rawInput: unknown): OpenCodeMessage | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedSessionId = decodeString(rawInput['session_id']);
    const decodedTimeCreated = decodeNumber(rawInput['time_created']);
    const decodedTimeUpdated = decodeNumber(rawInput['time_updated']);
    const decodedData = decodeString(rawInput['data']);

    if (
      decodedId === null ||
      decodedSessionId === null ||
      decodedTimeCreated === null ||
      decodedTimeUpdated === null ||
      decodedData === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      session_id: decodedSessionId,
      time_created: decodedTimeCreated,
      time_updated: decodedTimeUpdated,
      data: decodedData,
    };
  }
  return null;
}

/**
 * @type { OpenCodePart }
 * @description Row from the OpenCode SQLite part table
 */
export type OpenCodePart = {
  /**
   * @description Unique part identifier
   * @type { string }
   * @memberof OpenCodePart
   */
  id: string;
  /**
   * @description Parent message this part belongs to
   * @type { string }
   * @memberof OpenCodePart
   */
  message_id: string;
  /**
   * @description Session this part belongs to
   * @type { string }
   * @memberof OpenCodePart
   */
  session_id: string;
  /**
   * @description Unix timestamp when the part was created
   * @type { number }
   * @memberof OpenCodePart
   */
  time_created: number;
  /**
   * @description Unix timestamp when the part was last updated
   * @type { number }
   * @memberof OpenCodePart
   */
  time_updated: number;
  /**
   * @description JSON-encoded part data containing type-specific content
   * @type { string }
   * @memberof OpenCodePart
   */
  data: string;
};

export function decodeOpenCodePart(rawInput: unknown): OpenCodePart | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedMessageId = decodeString(rawInput['message_id']);
    const decodedSessionId = decodeString(rawInput['session_id']);
    const decodedTimeCreated = decodeNumber(rawInput['time_created']);
    const decodedTimeUpdated = decodeNumber(rawInput['time_updated']);
    const decodedData = decodeString(rawInput['data']);

    if (
      decodedId === null ||
      decodedMessageId === null ||
      decodedSessionId === null ||
      decodedTimeCreated === null ||
      decodedTimeUpdated === null ||
      decodedData === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      message_id: decodedMessageId,
      session_id: decodedSessionId,
      time_created: decodedTimeCreated,
      time_updated: decodedTimeUpdated,
      data: decodedData,
    };
  }
  return null;
}

/**
 * @type { OpenCodePartData }
 * @description Parsed content of an OpenCode part's data JSON column
 */
export type OpenCodePartData = {
  /**
   * @description Part type discriminant (text, tool, reasoning, snapshot, etc.)
   * @type { string }
   * @memberof OpenCodePartData
   */
  type: string;
  /**
   * @description Text content for text and reasoning parts
   * @type { string }
   * @memberof OpenCodePartData
   */
  text: string | null;
  /**
   * @description Tool name for tool-type parts
   * @type { string }
   * @memberof OpenCodePartData
   */
  tool: string | null;
  /**
   * @description Tool call identifier
   * @type { string }
   * @memberof OpenCodePartData
   */
  callID: string | null;
  /**
   * @description Part-level identifier
   * @type { string }
   * @memberof OpenCodePartData
   */
  id: string | null;
  /**
   * @description Tool execution state containing input parameters
   * @type { OpenCodePartDataState }
   * @memberof OpenCodePartData
   */
  state: OpenCodePartDataState | null;
};

export function decodeOpenCodePartData(rawInput: unknown): OpenCodePartData | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedText = decodeString(rawInput['text']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedCallID = decodeString(rawInput['callID']);
    const decodedId = decodeString(rawInput['id']);
    const decodedState = decodeOpenCodePartDataState(rawInput['state']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
      text: decodedText,
      tool: decodedTool,
      callID: decodedCallID,
      id: decodedId,
      state: decodedState,
    };
  }
  return null;
}

/**
 * @type { OpenCodePartDataState }
 * @description Tool execution state containing input parameters
 */
export type OpenCodePartDataState = {
  /**
   * @description Tool input parameters
   * @type { OpenCodePartDataStateInput }
   * @memberof OpenCodePartDataState
   */
  input: OpenCodePartDataStateInput | null;
};

export function decodeOpenCodePartDataState(rawInput: unknown): OpenCodePartDataState | null {
  if (isJSON(rawInput)) {
    const decodedInput = decodeOpenCodePartDataStateInput(rawInput['input']);

    return {
      input: decodedInput,
    };
  }
  return null;
}

/**
 * @type { OpenCodePartDataStateInput }
 * @description Tool input parameters
 */
export type OpenCodePartDataStateInput = Record<string, unknown>;

export function decodeOpenCodePartDataStateInput(
  rawInput: unknown
): OpenCodePartDataStateInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { WatchState }
 * @description Per-session polling state for the OpenCode watcher
 */
export type WatchState = {
  /**
   * @description OpenCode session ID being watched
   * @type { string }
   * @memberof WatchState
   */
  sessionId: string;
  /**
   * @description Highest time_created seen for messages (high-water mark for polling)
   * @type { number }
   * @memberof WatchState
   */
  lastMessageTime: number;
  /**
   * @description Highest time_updated seen for parts (high-water mark for polling)
   * @type { number }
   * @memberof WatchState
   */
  lastPartTime: number;
};

export function decodeWatchState(rawInput: unknown): WatchState | null {
  if (isJSON(rawInput)) {
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedLastMessageTime = decodeNumber(rawInput['lastMessageTime']);
    const decodedLastPartTime = decodeNumber(rawInput['lastPartTime']);

    if (
      decodedSessionId === null ||
      decodedLastMessageTime === null ||
      decodedLastPartTime === null
    ) {
      return null;
    }

    return {
      sessionId: decodedSessionId,
      lastMessageTime: decodedLastMessageTime,
      lastPartTime: decodedLastPartTime,
    };
  }
  return null;
}
