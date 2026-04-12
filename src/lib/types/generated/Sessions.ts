import {
  isJSON,
  decodeString,
  _decodeString,
  decodeNumber,
  _decodeNumber,
  decodeArray,
  _decodeArray,
  decodeBoolean,
  _decodeBoolean,
} from 'type-decoder';

/**
 * @type { SessionSource }
 * @description Source tool that produced the session
 */
export type SessionSource = 'claude-code' | 'opencode';

export function decodeSessionSource(rawInput: unknown): SessionSource | null {
  switch (rawInput) {
    case 'claude-code':
    case 'opencode':
      return rawInput;
  }
  return null;
}

export function _decodeSessionSource(rawInput: unknown): SessionSource | undefined {
  switch (rawInput) {
    case 'claude-code':
    case 'opencode':
      return rawInput;
  }
  return;
}

/**
 * @type { MessageRole }
 * @description Role of the conversation message sender
 */
export type MessageRole = 'assistant' | 'system' | 'user';

export function decodeMessageRole(rawInput: unknown): MessageRole | null {
  switch (rawInput) {
    case 'assistant':
    case 'system':
    case 'user':
      return rawInput;
  }
  return null;
}

export function _decodeMessageRole(rawInput: unknown): MessageRole | undefined {
  switch (rawInput) {
    case 'assistant':
    case 'system':
    case 'user':
      return rawInput;
  }
  return;
}

/**
 * @type { SessionInfo }
 * @description Metadata about a single coding session
 */
export type SessionInfo = {
  /**
   * @description ISO 8601 timestamp when the session was created
   * @type { string }
   * @memberof SessionInfo
   */
  created: string;
  /**
   * @description Git branch active during the session
   * @type { string }
   * @memberof SessionInfo
   */
  gitBranch: string;
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof SessionInfo
   */
  id: string;
  /**
   * @description Total number of messages in the session
   * @type { number }
   * @memberof SessionInfo
   */
  messageCount: number;
  /**
   * @description ISO 8601 timestamp when the session was last modified
   * @type { string }
   * @memberof SessionInfo
   */
  modified: string;
  /**
   * @description Absolute path to the project directory
   * @type { string }
   * @memberof SessionInfo
   */
  projectPath: string;
  /**
   * @description Source tool that produced the session
   * @type { SessionSource }
   * @memberof SessionInfo
   */
  source: SessionSource;
  /**
   * @description Brief summary of the session content
   * @type { string }
   * @memberof SessionInfo
   */
  summary: string;
  /**
   * @description Display title for the session
   * @type { string }
   * @memberof SessionInfo
   */
  title: string;
};

export function decodeSessionInfo(rawInput: unknown): SessionInfo | null {
  if (isJSON(rawInput)) {
    const decodedCreated = decodeString(rawInput['created']);
    const decodedGitBranch = decodeString(rawInput['gitBranch']);
    const decodedId = decodeString(rawInput['id']);
    const decodedMessageCount = decodeNumber(rawInput['messageCount']);
    const decodedModified = decodeString(rawInput['modified']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);
    const decodedSource = decodeSessionSource(rawInput['source']);
    const decodedSummary = decodeString(rawInput['summary']);
    const decodedTitle = decodeString(rawInput['title']);

    if (
      decodedCreated === null ||
      decodedGitBranch === null ||
      decodedId === null ||
      decodedMessageCount === null ||
      decodedModified === null ||
      decodedProjectPath === null ||
      decodedSource === null ||
      decodedSummary === null ||
      decodedTitle === null
    ) {
      return null;
    }

    return {
      created: decodedCreated,
      gitBranch: decodedGitBranch,
      id: decodedId,
      messageCount: decodedMessageCount,
      modified: decodedModified,
      projectPath: decodedProjectPath,
      source: decodedSource,
      summary: decodedSummary,
      title: decodedTitle,
    };
  }
  return null;
}

/**
 * @type { ProjectGroup }
 * @description A project with its associated sessions grouped together
 */
export type ProjectGroup = {
  /**
   * @description Absolute filesystem path to the project
   * @type { string }
   * @memberof ProjectGroup
   */
  fullPath: string;
  /**
   * @description Unique project identifier
   * @type { string }
   * @memberof ProjectGroup
   */
  id: string;
  /**
   * @description ISO 8601 timestamp of the most recently modified session
   * @type { string }
   * @memberof ProjectGroup
   */
  lastModified: string;
  /**
   * @description Display name for the project
   * @type { string }
   * @memberof ProjectGroup
   */
  name: string;
  /**
   * @description Total number of sessions in this project
   * @type { number }
   * @memberof ProjectGroup
   */
  sessionCount: number;
  /**
   * @description Array of sessions belonging to this project
   * @type { SessionInfo[] }
   * @memberof ProjectGroup
   */
  sessions: SessionInfo[];
};

export function decodeProjectGroup(rawInput: unknown): ProjectGroup | null {
  if (isJSON(rawInput)) {
    const decodedFullPath = decodeString(rawInput['fullPath']);
    const decodedId = decodeString(rawInput['id']);
    const decodedLastModified = decodeString(rawInput['lastModified']);
    const decodedName = decodeString(rawInput['name']);
    const decodedSessionCount = decodeNumber(rawInput['sessionCount']);
    const decodedSessions = decodeArray(rawInput['sessions'], decodeSessionInfo);

    if (
      decodedFullPath === null ||
      decodedId === null ||
      decodedLastModified === null ||
      decodedName === null ||
      decodedSessionCount === null ||
      decodedSessions === null
    ) {
      return null;
    }

    return {
      fullPath: decodedFullPath,
      id: decodedId,
      lastModified: decodedLastModified,
      name: decodedName,
      sessionCount: decodedSessionCount,
      sessions: decodedSessions,
    };
  }
  return null;
}

/**
 * @type { TextPart }
 * @description A plain text content block in a conversation message
 */
export type TextPart = {
  /**
   * @type { string }
   * @memberof TextPart
   */
  type: string;
  /**
   * @description The text content
   * @type { string }
   * @memberof TextPart
   */
  content: string;
};

export function decodeTextPart(rawInput: unknown): TextPart | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedContent = decodeString(rawInput['content']);

    if (decodedType === null || decodedContent === null) {
      return null;
    }

    return {
      type: decodedType,
      content: decodedContent,
    };
  }
  return null;
}

/**
 * @type { ThinkingPart }
 * @description An AI thinking/reasoning block in a conversation message
 */
export type ThinkingPart = {
  /**
   * @type { string }
   * @memberof ThinkingPart
   */
  type: string;
  /**
   * @description The thinking/reasoning content
   * @type { string }
   * @memberof ThinkingPart
   */
  content: string;
};

export function decodeThinkingPart(rawInput: unknown): ThinkingPart | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedContent = decodeString(rawInput['content']);

    if (decodedType === null || decodedContent === null) {
      return null;
    }

    return {
      type: decodedType,
      content: decodedContent,
    };
  }
  return null;
}

/**
 * @type { ToolUsePart }
 * @description A tool invocation block in a conversation message
 */
export type ToolUsePart = {
  /**
   * @type { string }
   * @memberof ToolUsePart
   */
  type: string;
  /**
   * @description Unique identifier for this tool use
   * @type { string }
   * @memberof ToolUsePart
   */
  id: string;
  /**
   * @description Name of the tool being invoked
   * @type { string }
   * @memberof ToolUsePart
   */
  toolName: string;
  /**
   * @description Tool input parameters as key-value pairs
   * @type { ToolUsePartInput }
   * @memberof ToolUsePart
   */
  input: ToolUsePartInput;
};

export function decodeToolUsePart(rawInput: unknown): ToolUsePart | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedId = decodeString(rawInput['id']);
    const decodedToolName = decodeString(rawInput['toolName']);
    const decodedInput = decodeToolUsePartInput(rawInput['input']);

    if (
      decodedType === null ||
      decodedId === null ||
      decodedToolName === null ||
      decodedInput === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      id: decodedId,
      toolName: decodedToolName,
      input: decodedInput,
    };
  }
  return null;
}

/**
 * @type { ToolUsePartInput }
 * @description Tool input parameters as key-value pairs
 */
export type ToolUsePartInput = Record<string, unknown>;

export function decodeToolUsePartInput(rawInput: unknown): ToolUsePartInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { ToolResultPart }
 * @description A tool result block in a conversation message
 */
export type ToolResultPart = {
  /**
   * @type { string }
   * @memberof ToolResultPart
   */
  type: string;
  /**
   * @description Tool use ID this result corresponds to
   * @type { string }
   * @memberof ToolResultPart
   */
  toolUseId: string;
  /**
   * @description Tool output text
   * @type { string }
   * @memberof ToolResultPart
   */
  output: string;
  /**
   * @description Whether the tool execution resulted in an error
   * @type { boolean }
   * @memberof ToolResultPart
   */
  isError: boolean;
};

export function decodeToolResultPart(rawInput: unknown): ToolResultPart | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedToolUseId = decodeString(rawInput['toolUseId']);
    const decodedOutput = decodeString(rawInput['output']);
    const decodedIsError = decodeBoolean(rawInput['isError']);

    if (
      decodedType === null ||
      decodedToolUseId === null ||
      decodedOutput === null ||
      decodedIsError === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      toolUseId: decodedToolUseId,
      output: decodedOutput,
      isError: decodedIsError,
    };
  }
  return null;
}

export type MessagePart =
  | CMessagePartTextPart
  | CMessagePartThinkingPart
  | CMessagePartToolUsePart
  | CMessagePartToolResultPart;

export function decodeMessagePart(rawInput: unknown): MessagePart | null {
  const result: MessagePart | null =
    decodeCMessagePartTextPart(rawInput) ??
    decodeCMessagePartThinkingPart(rawInput) ??
    decodeCMessagePartToolUsePart(rawInput) ??
    decodeCMessagePartToolResultPart(rawInput);

  return result;
}

export class CMessagePartTextPart {
  data: TextPart;
  constructor(data: TextPart) {
    this.data = data;
  }
}

export function decodeCMessagePartTextPart(rawInput: unknown): CMessagePartTextPart | null {
  const result = decodeTextPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CMessagePartTextPart(result);
}

export class CMessagePartThinkingPart {
  data: ThinkingPart;
  constructor(data: ThinkingPart) {
    this.data = data;
  }
}

export function decodeCMessagePartThinkingPart(rawInput: unknown): CMessagePartThinkingPart | null {
  const result = decodeThinkingPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CMessagePartThinkingPart(result);
}

export class CMessagePartToolUsePart {
  data: ToolUsePart;
  constructor(data: ToolUsePart) {
    this.data = data;
  }
}

export function decodeCMessagePartToolUsePart(rawInput: unknown): CMessagePartToolUsePart | null {
  const result = decodeToolUsePart(rawInput);
  if (result === null) {
    return null;
  }
  return new CMessagePartToolUsePart(result);
}

export class CMessagePartToolResultPart {
  data: ToolResultPart;
  constructor(data: ToolResultPart) {
    this.data = data;
  }
}

export function decodeCMessagePartToolResultPart(
  rawInput: unknown
): CMessagePartToolResultPart | null {
  const result = decodeToolResultPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CMessagePartToolResultPart(result);
}

/**
 * @type { ConversationMessage }
 * @description A single message in a coding session conversation
 */
export type ConversationMessage = {
  /**
   * @description Unique message identifier
   * @type { string }
   * @memberof ConversationMessage
   */
  id: string;
  /**
   * @description Ordered content parts that make up the message body
   * @type { MessagePart[] }
   * @memberof ConversationMessage
   */
  parts: MessagePart[];
  /**
   * @description Role of the message sender
   * @type { MessageRole }
   * @memberof ConversationMessage
   */
  role: MessageRole;
  /**
   * @description ISO 8601 timestamp when the message was created
   * @type { string }
   * @memberof ConversationMessage
   */
  timestamp: string;
};

export function decodeConversationMessage(rawInput: unknown): ConversationMessage | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedParts = decodeArray(rawInput['parts'], decodeMessagePart);
    const decodedRole = decodeMessageRole(rawInput['role']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);

    if (
      decodedId === null ||
      decodedParts === null ||
      decodedRole === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      parts: decodedParts,
      role: decodedRole,
      timestamp: decodedTimestamp,
    };
  }
  return null;
}
