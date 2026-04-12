import {
  type MessageRole,
  decodeMessageRole,
  type PermissionDecision,
  decodePermissionDecision,
  type SessionSource,
  decodeSessionSource,
} from './index';
import {
  isJSON,
  decodeString,
  _decodeString,
  decodeNumber,
  _decodeNumber,
  decodeBoolean,
  _decodeBoolean,
  decodeArray,
  _decodeArray,
} from 'type-decoder';

/**
 * @type { TerminalSignal }
 * @description Signals that can be sent to a terminal process
 */
export type TerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGTSTP';

export function decodeTerminalSignal(rawInput: unknown): TerminalSignal | null {
  switch (rawInput) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGTSTP':
      return rawInput;
  }
  return null;
}

export function _decodeTerminalSignal(rawInput: unknown): TerminalSignal | undefined {
  switch (rawInput) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGTSTP':
      return rawInput;
  }
  return;
}

/**
 * @type { TerminalInputMessage }
 * @description Send keyboard input to the terminal PTY
 */
export type TerminalInputMessage = {
  /**
   * @type { string }
   * @memberof TerminalInputMessage
   */
  type: string;
  /**
   * @description Raw terminal input data (keystrokes, pasted text)
   * @type { string }
   * @memberof TerminalInputMessage
   */
  data: string;
};

export function decodeTerminalInputMessage(rawInput: unknown): TerminalInputMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedData = decodeString(rawInput['data']);

    if (decodedType === null || decodedData === null) {
      return null;
    }

    return {
      type: decodedType,
      data: decodedData,
    };
  }
  return null;
}

/**
 * @type { TerminalResizeMessage }
 * @description Resize the terminal PTY dimensions
 */
export type TerminalResizeMessage = {
  /**
   * @type { string }
   * @memberof TerminalResizeMessage
   */
  type: string;
  /**
   * @description New terminal width in columns (1-500)
   * @type { number }
   * @memberof TerminalResizeMessage
   */
  cols: number;
  /**
   * @description New terminal height in rows (1-200)
   * @type { number }
   * @memberof TerminalResizeMessage
   */
  rows: number;
};

export function decodeTerminalResizeMessage(rawInput: unknown): TerminalResizeMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedCols = decodeNumber(rawInput['cols']);
    const decodedRows = decodeNumber(rawInput['rows']);

    if (decodedType === null || decodedCols === null || decodedRows === null) {
      return null;
    }

    return {
      type: decodedType,
      cols: decodedCols,
      rows: decodedRows,
    };
  }
  return null;
}

/**
 * @type { TerminalSignalMessage }
 * @description Send a signal to the terminal process
 */
export type TerminalSignalMessage = {
  /**
   * @type { string }
   * @memberof TerminalSignalMessage
   */
  type: string;
  /**
   * @description Signal name to send to the PTY process
   * @type { TerminalSignal }
   * @memberof TerminalSignalMessage
   */
  signal: TerminalSignal;
};

export function decodeTerminalSignalMessage(rawInput: unknown): TerminalSignalMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSignal = decodeTerminalSignal(rawInput['signal']);

    if (decodedType === null || decodedSignal === null) {
      return null;
    }

    return {
      type: decodedType,
      signal: decodedSignal,
    };
  }
  return null;
}

export type TerminalClientMessage =
  | CTerminalClientMessageTerminalInputMessage
  | CTerminalClientMessageTerminalResizeMessage
  | CTerminalClientMessageTerminalSignalMessage;

export function decodeTerminalClientMessage(rawInput: unknown): TerminalClientMessage | null {
  const result: TerminalClientMessage | null =
    decodeCTerminalClientMessageTerminalInputMessage(rawInput) ??
    decodeCTerminalClientMessageTerminalResizeMessage(rawInput) ??
    decodeCTerminalClientMessageTerminalSignalMessage(rawInput);

  return result;
}

export class CTerminalClientMessageTerminalInputMessage {
  data: TerminalInputMessage;
  constructor(data: TerminalInputMessage) {
    this.data = data;
  }
}

export function decodeCTerminalClientMessageTerminalInputMessage(
  rawInput: unknown
): CTerminalClientMessageTerminalInputMessage | null {
  const result = decodeTerminalInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalClientMessageTerminalInputMessage(result);
}

export class CTerminalClientMessageTerminalResizeMessage {
  data: TerminalResizeMessage;
  constructor(data: TerminalResizeMessage) {
    this.data = data;
  }
}

export function decodeCTerminalClientMessageTerminalResizeMessage(
  rawInput: unknown
): CTerminalClientMessageTerminalResizeMessage | null {
  const result = decodeTerminalResizeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalClientMessageTerminalResizeMessage(result);
}

export class CTerminalClientMessageTerminalSignalMessage {
  data: TerminalSignalMessage;
  constructor(data: TerminalSignalMessage) {
    this.data = data;
  }
}

export function decodeCTerminalClientMessageTerminalSignalMessage(
  rawInput: unknown
): CTerminalClientMessageTerminalSignalMessage | null {
  const result = decodeTerminalSignalMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalClientMessageTerminalSignalMessage(result);
}

/**
 * @type { TerminalOutputMessage }
 * @description Terminal output data from the PTY
 */
export type TerminalOutputMessage = {
  /**
   * @type { string }
   * @memberof TerminalOutputMessage
   */
  type: string;
  /**
   * @description Raw terminal output data
   * @type { string }
   * @memberof TerminalOutputMessage
   */
  data: string;
};

export function decodeTerminalOutputMessage(rawInput: unknown): TerminalOutputMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedData = decodeString(rawInput['data']);

    if (decodedType === null || decodedData === null) {
      return null;
    }

    return {
      type: decodedType,
      data: decodedData,
    };
  }
  return null;
}

/**
 * @type { TerminalOutputDroppedMessage }
 * @description Notification that output was dropped due to backpressure
 */
export type TerminalOutputDroppedMessage = {
  /**
   * @type { string }
   * @memberof TerminalOutputDroppedMessage
   */
  type: string;
  /**
   * @description Number of bytes that were dropped
   * @type { number }
   * @memberof TerminalOutputDroppedMessage
   */
  bytes: number;
};

export function decodeTerminalOutputDroppedMessage(
  rawInput: unknown
): TerminalOutputDroppedMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedBytes = decodeNumber(rawInput['bytes']);

    if (decodedType === null || decodedBytes === null) {
      return null;
    }

    return {
      type: decodedType,
      bytes: decodedBytes,
    };
  }
  return null;
}

/**
 * @type { TerminalScrollbackMessage }
 * @description Scrollback chunk sent on reconnection
 */
export type TerminalScrollbackMessage = {
  /**
   * @type { string }
   * @memberof TerminalScrollbackMessage
   */
  type: string;
  /**
   * @description Scrollback content for this chunk
   * @type { string }
   * @memberof TerminalScrollbackMessage
   */
  data: string;
  /**
   * @description 1-based chunk index
   * @type { number }
   * @memberof TerminalScrollbackMessage
   */
  chunk: number;
  /**
   * @description Total number of scrollback chunks
   * @type { number }
   * @memberof TerminalScrollbackMessage
   */
  total: number;
};

export function decodeTerminalScrollbackMessage(
  rawInput: unknown
): TerminalScrollbackMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedData = decodeString(rawInput['data']);
    const decodedChunk = decodeNumber(rawInput['chunk']);
    const decodedTotal = decodeNumber(rawInput['total']);

    if (
      decodedType === null ||
      decodedData === null ||
      decodedChunk === null ||
      decodedTotal === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      data: decodedData,
      chunk: decodedChunk,
      total: decodedTotal,
    };
  }
  return null;
}

/**
 * @type { TerminalExitMessage }
 * @description Terminal process has exited
 */
export type TerminalExitMessage = {
  /**
   * @type { string }
   * @memberof TerminalExitMessage
   */
  type: string;
  /**
   * @description Process exit code, or null if unknown
   * @type { number }
   * @memberof TerminalExitMessage
   */
  code: number | null;
  /**
   * @description Signal that caused the exit, or null if exited normally
   * @type { string }
   * @memberof TerminalExitMessage
   */
  signal: string | null;
};

export function decodeTerminalExitMessage(rawInput: unknown): TerminalExitMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedCode = decodeNumber(rawInput['code']);
    const decodedSignal = decodeString(rawInput['signal']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
      code: decodedCode,
      signal: decodedSignal,
    };
  }
  return null;
}

/**
 * @type { TerminalErrorMessage }
 * @description Error message from the terminal server
 */
export type TerminalErrorMessage = {
  /**
   * @type { string }
   * @memberof TerminalErrorMessage
   */
  type: string;
  /**
   * @description Human-readable error message
   * @type { string }
   * @memberof TerminalErrorMessage
   */
  message: string;
};

export function decodeTerminalErrorMessage(rawInput: unknown): TerminalErrorMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessage = decodeString(rawInput['message']);

    if (decodedType === null || decodedMessage === null) {
      return null;
    }

    return {
      type: decodedType,
      message: decodedMessage,
    };
  }
  return null;
}

export type TerminalServerMessage =
  | CTerminalServerMessageTerminalOutputMessage
  | CTerminalServerMessageTerminalOutputDroppedMessage
  | CTerminalServerMessageTerminalScrollbackMessage
  | CTerminalServerMessageTerminalExitMessage
  | CTerminalServerMessageTerminalErrorMessage;

export function decodeTerminalServerMessage(rawInput: unknown): TerminalServerMessage | null {
  const result: TerminalServerMessage | null =
    decodeCTerminalServerMessageTerminalOutputMessage(rawInput) ??
    decodeCTerminalServerMessageTerminalOutputDroppedMessage(rawInput) ??
    decodeCTerminalServerMessageTerminalScrollbackMessage(rawInput) ??
    decodeCTerminalServerMessageTerminalExitMessage(rawInput) ??
    decodeCTerminalServerMessageTerminalErrorMessage(rawInput);

  return result;
}

export class CTerminalServerMessageTerminalOutputMessage {
  data: TerminalOutputMessage;
  constructor(data: TerminalOutputMessage) {
    this.data = data;
  }
}

export function decodeCTerminalServerMessageTerminalOutputMessage(
  rawInput: unknown
): CTerminalServerMessageTerminalOutputMessage | null {
  const result = decodeTerminalOutputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalServerMessageTerminalOutputMessage(result);
}

export class CTerminalServerMessageTerminalOutputDroppedMessage {
  data: TerminalOutputDroppedMessage;
  constructor(data: TerminalOutputDroppedMessage) {
    this.data = data;
  }
}

export function decodeCTerminalServerMessageTerminalOutputDroppedMessage(
  rawInput: unknown
): CTerminalServerMessageTerminalOutputDroppedMessage | null {
  const result = decodeTerminalOutputDroppedMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalServerMessageTerminalOutputDroppedMessage(result);
}

export class CTerminalServerMessageTerminalScrollbackMessage {
  data: TerminalScrollbackMessage;
  constructor(data: TerminalScrollbackMessage) {
    this.data = data;
  }
}

export function decodeCTerminalServerMessageTerminalScrollbackMessage(
  rawInput: unknown
): CTerminalServerMessageTerminalScrollbackMessage | null {
  const result = decodeTerminalScrollbackMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalServerMessageTerminalScrollbackMessage(result);
}

export class CTerminalServerMessageTerminalExitMessage {
  data: TerminalExitMessage;
  constructor(data: TerminalExitMessage) {
    this.data = data;
  }
}

export function decodeCTerminalServerMessageTerminalExitMessage(
  rawInput: unknown
): CTerminalServerMessageTerminalExitMessage | null {
  const result = decodeTerminalExitMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalServerMessageTerminalExitMessage(result);
}

export class CTerminalServerMessageTerminalErrorMessage {
  data: TerminalErrorMessage;
  constructor(data: TerminalErrorMessage) {
    this.data = data;
  }
}

export function decodeCTerminalServerMessageTerminalErrorMessage(
  rawInput: unknown
): CTerminalServerMessageTerminalErrorMessage | null {
  const result = decodeTerminalErrorMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CTerminalServerMessageTerminalErrorMessage(result);
}

/**
 * @type { TextContentBlock }
 * @description Content block in the live 'message' payload
 */
export type TextContentBlock = {
  /**
   * @type { string }
   * @memberof TextContentBlock
   */
  type: string;
  /**
   * @description Text content of the block
   * @type { string }
   * @memberof TextContentBlock
   */
  content: string;
};

export function decodeTextContentBlock(rawInput: unknown): TextContentBlock | null {
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
 * @type { HistoryTextPart }
 * @description Plain text content
 */
export type HistoryTextPart = {
  /**
   * @type { string }
   * @memberof HistoryTextPart
   */
  type: string;
  /**
   * @description Text content
   * @type { string }
   * @memberof HistoryTextPart
   */
  content: string;
};

export function decodeHistoryTextPart(rawInput: unknown): HistoryTextPart | null {
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
 * @type { HistoryThinkingPart }
 * @description AI thinking/reasoning content
 */
export type HistoryThinkingPart = {
  /**
   * @type { string }
   * @memberof HistoryThinkingPart
   */
  type: string;
  /**
   * @description Thinking content
   * @type { string }
   * @memberof HistoryThinkingPart
   */
  content: string;
};

export function decodeHistoryThinkingPart(rawInput: unknown): HistoryThinkingPart | null {
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
 * @type { HistoryToolUsePart }
 * @description A tool invocation by the AI
 */
export type HistoryToolUsePart = {
  /**
   * @type { string }
   * @memberof HistoryToolUsePart
   */
  type: string;
  /**
   * @description Unique tool use identifier
   * @type { string }
   * @memberof HistoryToolUsePart
   */
  id: string;
  /**
   * @description Name of the tool being invoked
   * @type { string }
   * @memberof HistoryToolUsePart
   */
  toolName: string;
  /**
   * @description Tool input parameters
   * @type { HistoryToolUsePartInput }
   * @memberof HistoryToolUsePart
   */
  input: HistoryToolUsePartInput;
};

export function decodeHistoryToolUsePart(rawInput: unknown): HistoryToolUsePart | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedId = decodeString(rawInput['id']);
    const decodedToolName = decodeString(rawInput['toolName']);
    const decodedInput = decodeHistoryToolUsePartInput(rawInput['input']);

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
 * @type { HistoryToolUsePartInput }
 * @description Tool input parameters
 */
export type HistoryToolUsePartInput = Record<string, unknown>;

export function decodeHistoryToolUsePartInput(rawInput: unknown): HistoryToolUsePartInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { HistoryToolResultPart }
 * @description Result from a completed tool invocation
 */
export type HistoryToolResultPart = {
  /**
   * @type { string }
   * @memberof HistoryToolResultPart
   */
  type: string;
  /**
   * @description Tool use ID this result corresponds to
   * @type { string }
   * @memberof HistoryToolResultPart
   */
  toolUseId: string;
  /**
   * @description Tool output text
   * @type { string }
   * @memberof HistoryToolResultPart
   */
  output: string;
  /**
   * @description Whether the tool execution resulted in an error
   * @type { boolean }
   * @memberof HistoryToolResultPart
   */
  isError: boolean;
};

export function decodeHistoryToolResultPart(rawInput: unknown): HistoryToolResultPart | null {
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

export type HistoryPart =
  | CHistoryPartHistoryTextPart
  | CHistoryPartHistoryThinkingPart
  | CHistoryPartHistoryToolUsePart
  | CHistoryPartHistoryToolResultPart;

export function decodeHistoryPart(rawInput: unknown): HistoryPart | null {
  const result: HistoryPart | null =
    decodeCHistoryPartHistoryTextPart(rawInput) ??
    decodeCHistoryPartHistoryThinkingPart(rawInput) ??
    decodeCHistoryPartHistoryToolUsePart(rawInput) ??
    decodeCHistoryPartHistoryToolResultPart(rawInput);

  return result;
}

export class CHistoryPartHistoryTextPart {
  data: HistoryTextPart;
  constructor(data: HistoryTextPart) {
    this.data = data;
  }
}

export function decodeCHistoryPartHistoryTextPart(
  rawInput: unknown
): CHistoryPartHistoryTextPart | null {
  const result = decodeHistoryTextPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CHistoryPartHistoryTextPart(result);
}

export class CHistoryPartHistoryThinkingPart {
  data: HistoryThinkingPart;
  constructor(data: HistoryThinkingPart) {
    this.data = data;
  }
}

export function decodeCHistoryPartHistoryThinkingPart(
  rawInput: unknown
): CHistoryPartHistoryThinkingPart | null {
  const result = decodeHistoryThinkingPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CHistoryPartHistoryThinkingPart(result);
}

export class CHistoryPartHistoryToolUsePart {
  data: HistoryToolUsePart;
  constructor(data: HistoryToolUsePart) {
    this.data = data;
  }
}

export function decodeCHistoryPartHistoryToolUsePart(
  rawInput: unknown
): CHistoryPartHistoryToolUsePart | null {
  const result = decodeHistoryToolUsePart(rawInput);
  if (result === null) {
    return null;
  }
  return new CHistoryPartHistoryToolUsePart(result);
}

export class CHistoryPartHistoryToolResultPart {
  data: HistoryToolResultPart;
  constructor(data: HistoryToolResultPart) {
    this.data = data;
  }
}

export function decodeCHistoryPartHistoryToolResultPart(
  rawInput: unknown
): CHistoryPartHistoryToolResultPart | null {
  const result = decodeHistoryToolResultPart(rawInput);
  if (result === null) {
    return null;
  }
  return new CHistoryPartHistoryToolResultPart(result);
}

/**
 * @type { HistoryMessage }
 * @description A message in the history payload sent on session connect
 */
export type HistoryMessage = {
  /**
   * @description Unique message identifier
   * @type { string }
   * @memberof HistoryMessage
   */
  id: string;
  /**
   * @description Who sent the message
   * @type { MessageRole }
   * @memberof HistoryMessage
   */
  role: MessageRole;
  /**
   * @description ISO 8601 timestamp of the message
   * @type { string }
   * @memberof HistoryMessage
   */
  timestamp: string;
  /**
   * @description Array of content parts making up the message
   * @type { HistoryPart[] }
   * @memberof HistoryMessage
   */
  content: HistoryPart[];
};

export function decodeHistoryMessage(rawInput: unknown): HistoryMessage | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedRole = decodeMessageRole(rawInput['role']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);
    const decodedContent = decodeArray(rawInput['content'], decodeHistoryPart);

    if (
      decodedId === null ||
      decodedRole === null ||
      decodedTimestamp === null ||
      decodedContent === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      role: decodedRole,
      timestamp: decodedTimestamp,
      content: decodedContent,
    };
  }
  return null;
}

/**
 * @type { SessionSubscribeMessage }
 * @description Subscribe to a live AI session stream
 */
export type SessionSubscribeMessage = {
  /**
   * @type { string }
   * @memberof SessionSubscribeMessage
   */
  type: string;
  /**
   * @description Terminal ID used to find the associated session file for streaming
   * @type { string }
   * @memberof SessionSubscribeMessage
   */
  sessionId: string;
};

export function decodeSessionSubscribeMessage(rawInput: unknown): SessionSubscribeMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSessionId = decodeString(rawInput['sessionId']);

    if (decodedType === null || decodedSessionId === null) {
      return null;
    }

    return {
      type: decodedType,
      sessionId: decodedSessionId,
    };
  }
  return null;
}

/**
 * @type { SessionSendInputMessage }
 * @description Send text input to the AI session (writes to PTY stdin with newline)
 */
export type SessionSendInputMessage = {
  /**
   * @type { string }
   * @memberof SessionSendInputMessage
   */
  type: string;
  /**
   * @description Text to send to the AI session (max 10KB)
   * @type { string }
   * @memberof SessionSendInputMessage
   */
  text: string;
};

export function decodeSessionSendInputMessage(rawInput: unknown): SessionSendInputMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedText = decodeString(rawInput['text']);

    if (decodedType === null || decodedText === null) {
      return null;
    }

    return {
      type: decodedType,
      text: decodedText,
    };
  }
  return null;
}

/**
 * @type { SessionCancelMessage }
 * @description Cancel the current AI operation (sends SIGINT to PTY)
 */
export type SessionCancelMessage = {
  /**
   * @type { string }
   * @memberof SessionCancelMessage
   */
  type: string;
};

export function decodeSessionCancelMessage(rawInput: unknown): SessionCancelMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
    };
  }
  return null;
}

export type SessionClientMessage =
  | CSessionClientMessageSessionSubscribeMessage
  | CSessionClientMessageSessionSendInputMessage
  | CSessionClientMessageSessionCancelMessage;

export function decodeSessionClientMessage(rawInput: unknown): SessionClientMessage | null {
  const result: SessionClientMessage | null =
    decodeCSessionClientMessageSessionSubscribeMessage(rawInput) ??
    decodeCSessionClientMessageSessionSendInputMessage(rawInput) ??
    decodeCSessionClientMessageSessionCancelMessage(rawInput);

  return result;
}

export class CSessionClientMessageSessionSubscribeMessage {
  data: SessionSubscribeMessage;
  constructor(data: SessionSubscribeMessage) {
    this.data = data;
  }
}

export function decodeCSessionClientMessageSessionSubscribeMessage(
  rawInput: unknown
): CSessionClientMessageSessionSubscribeMessage | null {
  const result = decodeSessionSubscribeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionClientMessageSessionSubscribeMessage(result);
}

export class CSessionClientMessageSessionSendInputMessage {
  data: SessionSendInputMessage;
  constructor(data: SessionSendInputMessage) {
    this.data = data;
  }
}

export function decodeCSessionClientMessageSessionSendInputMessage(
  rawInput: unknown
): CSessionClientMessageSessionSendInputMessage | null {
  const result = decodeSessionSendInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionClientMessageSessionSendInputMessage(result);
}

export class CSessionClientMessageSessionCancelMessage {
  data: SessionCancelMessage;
  constructor(data: SessionCancelMessage) {
    this.data = data;
  }
}

export function decodeCSessionClientMessageSessionCancelMessage(
  rawInput: unknown
): CSessionClientMessageSessionCancelMessage | null {
  const result = decodeSessionCancelMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionClientMessageSessionCancelMessage(result);
}

/**
 * @type { SessionHistoryMessage }
 * @description Full conversation history sent on connect
 */
export type SessionHistoryMessage = {
  /**
   * @type { string }
   * @memberof SessionHistoryMessage
   */
  type: string;
  /**
   * @description All session messages from the beginning up to the current point
   * @type { HistoryMessage[] }
   * @memberof SessionHistoryMessage
   */
  messages: HistoryMessage[];
};

export function decodeSessionHistoryMessage(rawInput: unknown): SessionHistoryMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessages = decodeArray(rawInput['messages'], decodeHistoryMessage);

    if (decodedType === null || decodedMessages === null) {
      return null;
    }

    return {
      type: decodedType,
      messages: decodedMessages,
    };
  }
  return null;
}

/**
 * @type { SessionNewMessage }
 * @description A new conversation message (user or assistant)
 */
export type SessionNewMessage = {
  /**
   * @type { string }
   * @memberof SessionNewMessage
   */
  type: string;
  /**
   * @description Who sent the message
   * @type { MessageRole }
   * @memberof SessionNewMessage
   */
  role: MessageRole;
  /**
   * @description Message content blocks
   * @type { TextContentBlock[] }
   * @memberof SessionNewMessage
   */
  content: TextContentBlock[];
  /**
   * @description ISO 8601 timestamp of the message
   * @type { string }
   * @memberof SessionNewMessage
   */
  timestamp: string;
};

export function decodeSessionNewMessage(rawInput: unknown): SessionNewMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedRole = decodeMessageRole(rawInput['role']);
    const decodedContent = decodeArray(rawInput['content'], decodeTextContentBlock);
    const decodedTimestamp = decodeString(rawInput['timestamp']);

    if (
      decodedType === null ||
      decodedRole === null ||
      decodedContent === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      role: decodedRole,
      content: decodedContent,
      timestamp: decodedTimestamp,
    };
  }
  return null;
}

/**
 * @type { SessionToolUseMessage }
 * @description A tool invocation by the AI assistant
 */
export type SessionToolUseMessage = {
  /**
   * @type { string }
   * @memberof SessionToolUseMessage
   */
  type: string;
  /**
   * @description Unique tool use identifier
   * @type { string }
   * @memberof SessionToolUseMessage
   */
  id: string;
  /**
   * @description Tool name (e.g. "Edit", "Bash", "Read")
   * @type { string }
   * @memberof SessionToolUseMessage
   */
  name: string;
  /**
   * @description Tool input parameters
   * @type { SessionToolUseMessageInput }
   * @memberof SessionToolUseMessage
   */
  input: SessionToolUseMessageInput;
  /**
   * @description Execution status (always 'running' for tool-use messages)
   * @type { string }
   * @memberof SessionToolUseMessage
   */
  status: string;
};

export function decodeSessionToolUseMessage(rawInput: unknown): SessionToolUseMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedId = decodeString(rawInput['id']);
    const decodedName = decodeString(rawInput['name']);
    const decodedInput = decodeSessionToolUseMessageInput(rawInput['input']);
    const decodedStatus = decodeString(rawInput['status']);

    if (
      decodedType === null ||
      decodedId === null ||
      decodedName === null ||
      decodedInput === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      id: decodedId,
      name: decodedName,
      input: decodedInput,
      status: decodedStatus,
    };
  }
  return null;
}

/**
 * @type { SessionToolUseMessageInput }
 * @description Tool input parameters
 */
export type SessionToolUseMessageInput = Record<string, unknown>;

export function decodeSessionToolUseMessageInput(
  rawInput: unknown
): SessionToolUseMessageInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { SessionToolResultMessage }
 * @description Result from a completed tool invocation
 */
export type SessionToolResultMessage = {
  /**
   * @type { string }
   * @memberof SessionToolResultMessage
   */
  type: string;
  /**
   * @description Tool use ID this result corresponds to
   * @type { string }
   * @memberof SessionToolResultMessage
   */
  id: string;
  /**
   * @description Tool output text
   * @type { string }
   * @memberof SessionToolResultMessage
   */
  output: string;
  /**
   * @description Whether the tool execution resulted in an error
   * @type { boolean }
   * @memberof SessionToolResultMessage
   */
  isError: boolean;
  /**
   * @description Execution status (always 'done' for tool-result messages)
   * @type { string }
   * @memberof SessionToolResultMessage
   */
  status: string;
};

export function decodeSessionToolResultMessage(rawInput: unknown): SessionToolResultMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedId = decodeString(rawInput['id']);
    const decodedOutput = decodeString(rawInput['output']);
    const decodedIsError = decodeBoolean(rawInput['isError']);
    const decodedStatus = decodeString(rawInput['status']);

    if (
      decodedType === null ||
      decodedId === null ||
      decodedOutput === null ||
      decodedIsError === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      id: decodedId,
      output: decodedOutput,
      isError: decodedIsError,
      status: decodedStatus,
    };
  }
  return null;
}

/**
 * @type { SessionThinkingMessage }
 * @description AI thinking/reasoning block (extended thinking)
 */
export type SessionThinkingMessage = {
  /**
   * @type { string }
   * @memberof SessionThinkingMessage
   */
  type: string;
  /**
   * @description Thinking content text
   * @type { string }
   * @memberof SessionThinkingMessage
   */
  text: string;
};

export function decodeSessionThinkingMessage(rawInput: unknown): SessionThinkingMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedText = decodeString(rawInput['text']);

    if (decodedType === null || decodedText === null) {
      return null;
    }

    return {
      type: decodedType,
      text: decodedText,
    };
  }
  return null;
}

/**
 * @type { SessionEndMessage }
 * @description Session has ended (process exited or session file closed)
 */
export type SessionEndMessage = {
  /**
   * @type { string }
   * @memberof SessionEndMessage
   */
  type: string;
};

export function decodeSessionEndMessage(rawInput: unknown): SessionEndMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
    };
  }
  return null;
}

/**
 * @type { SessionErrorMessage }
 * @description Error message from the session handler
 */
export type SessionErrorMessage = {
  /**
   * @type { string }
   * @memberof SessionErrorMessage
   */
  type: string;
  /**
   * @description Human-readable error message
   * @type { string }
   * @memberof SessionErrorMessage
   */
  message: string;
};

export function decodeSessionErrorMessage(rawInput: unknown): SessionErrorMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessage = decodeString(rawInput['message']);

    if (decodedType === null || decodedMessage === null) {
      return null;
    }

    return {
      type: decodedType,
      message: decodedMessage,
    };
  }
  return null;
}

export type SessionServerMessage =
  | CSessionServerMessageSessionHistoryMessage
  | CSessionServerMessageSessionNewMessage
  | CSessionServerMessageSessionToolUseMessage
  | CSessionServerMessageSessionToolResultMessage
  | CSessionServerMessageSessionThinkingMessage
  | CSessionServerMessageSessionEndMessage
  | CSessionServerMessageSessionErrorMessage;

export function decodeSessionServerMessage(rawInput: unknown): SessionServerMessage | null {
  const result: SessionServerMessage | null =
    decodeCSessionServerMessageSessionHistoryMessage(rawInput) ??
    decodeCSessionServerMessageSessionNewMessage(rawInput) ??
    decodeCSessionServerMessageSessionToolUseMessage(rawInput) ??
    decodeCSessionServerMessageSessionToolResultMessage(rawInput) ??
    decodeCSessionServerMessageSessionThinkingMessage(rawInput) ??
    decodeCSessionServerMessageSessionEndMessage(rawInput) ??
    decodeCSessionServerMessageSessionErrorMessage(rawInput);

  return result;
}

export class CSessionServerMessageSessionHistoryMessage {
  data: SessionHistoryMessage;
  constructor(data: SessionHistoryMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionHistoryMessage(
  rawInput: unknown
): CSessionServerMessageSessionHistoryMessage | null {
  const result = decodeSessionHistoryMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionHistoryMessage(result);
}

export class CSessionServerMessageSessionNewMessage {
  data: SessionNewMessage;
  constructor(data: SessionNewMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionNewMessage(
  rawInput: unknown
): CSessionServerMessageSessionNewMessage | null {
  const result = decodeSessionNewMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionNewMessage(result);
}

export class CSessionServerMessageSessionToolUseMessage {
  data: SessionToolUseMessage;
  constructor(data: SessionToolUseMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionToolUseMessage(
  rawInput: unknown
): CSessionServerMessageSessionToolUseMessage | null {
  const result = decodeSessionToolUseMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionToolUseMessage(result);
}

export class CSessionServerMessageSessionToolResultMessage {
  data: SessionToolResultMessage;
  constructor(data: SessionToolResultMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionToolResultMessage(
  rawInput: unknown
): CSessionServerMessageSessionToolResultMessage | null {
  const result = decodeSessionToolResultMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionToolResultMessage(result);
}

export class CSessionServerMessageSessionThinkingMessage {
  data: SessionThinkingMessage;
  constructor(data: SessionThinkingMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionThinkingMessage(
  rawInput: unknown
): CSessionServerMessageSessionThinkingMessage | null {
  const result = decodeSessionThinkingMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionThinkingMessage(result);
}

export class CSessionServerMessageSessionEndMessage {
  data: SessionEndMessage;
  constructor(data: SessionEndMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionEndMessage(
  rawInput: unknown
): CSessionServerMessageSessionEndMessage | null {
  const result = decodeSessionEndMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionEndMessage(result);
}

export class CSessionServerMessageSessionErrorMessage {
  data: SessionErrorMessage;
  constructor(data: SessionErrorMessage) {
    this.data = data;
  }
}

export function decodeCSessionServerMessageSessionErrorMessage(
  rawInput: unknown
): CSessionServerMessageSessionErrorMessage | null {
  const result = decodeSessionErrorMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CSessionServerMessageSessionErrorMessage(result);
}

/**
 * @type { EventTerminalCreated }
 * @description A new managed terminal has been created
 */
export type EventTerminalCreated = {
  /**
   * @type { string }
   * @memberof EventTerminalCreated
   */
  type: string;
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof EventTerminalCreated
   */
  terminalId: string;
  /**
   * @description Command that was launched
   * @type { string }
   * @memberof EventTerminalCreated
   */
  command: string;
};

export function decodeEventTerminalCreated(rawInput: unknown): EventTerminalCreated | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedCommand = decodeString(rawInput['command']);

    if (decodedType === null || decodedTerminalId === null || decodedCommand === null) {
      return null;
    }

    return {
      type: decodedType,
      terminalId: decodedTerminalId,
      command: decodedCommand,
    };
  }
  return null;
}

/**
 * @type { EventTerminalExited }
 * @description A managed terminal process has exited
 */
export type EventTerminalExited = {
  /**
   * @type { string }
   * @memberof EventTerminalExited
   */
  type: string;
  /**
   * @description Terminal identifier that exited
   * @type { string }
   * @memberof EventTerminalExited
   */
  terminalId: string;
  /**
   * @description Process exit code, or null if unknown
   * @type { number }
   * @memberof EventTerminalExited
   */
  code: number | null;
};

export function decodeEventTerminalExited(rawInput: unknown): EventTerminalExited | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedCode = decodeNumber(rawInput['code']);

    if (decodedType === null || decodedTerminalId === null) {
      return null;
    }

    return {
      type: decodedType,
      terminalId: decodedTerminalId,
      code: decodedCode,
    };
  }
  return null;
}

/**
 * @type { EventPermissionRequested }
 * @description A permission request is awaiting approval
 */
export type EventPermissionRequested = {
  /**
   * @type { string }
   * @memberof EventPermissionRequested
   */
  type: string;
  /**
   * @description Unique request identifier for the permission flow
   * @type { string }
   * @memberof EventPermissionRequested
   */
  requestId: string;
  /**
   * @description Tool requesting permission (e.g. "Bash", "Edit")
   * @type { string }
   * @memberof EventPermissionRequested
   */
  tool: string;
  /**
   * @description Tool input that requires approval
   * @type { EventPermissionRequestedInput }
   * @memberof EventPermissionRequested
   */
  input: EventPermissionRequestedInput;
};

export function decodeEventPermissionRequested(rawInput: unknown): EventPermissionRequested | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedRequestId = decodeString(rawInput['requestId']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedInput = decodeEventPermissionRequestedInput(rawInput['input']);

    if (
      decodedType === null ||
      decodedRequestId === null ||
      decodedTool === null ||
      decodedInput === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      requestId: decodedRequestId,
      tool: decodedTool,
      input: decodedInput,
    };
  }
  return null;
}

/**
 * @type { EventPermissionRequestedInput }
 * @description Tool input that requires approval
 */
export type EventPermissionRequestedInput = Record<string, unknown>;

export function decodeEventPermissionRequestedInput(
  rawInput: unknown
): EventPermissionRequestedInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { EventPermissionResolved }
 * @description A permission request has been resolved
 */
export type EventPermissionResolved = {
  /**
   * @type { string }
   * @memberof EventPermissionResolved
   */
  type: string;
  /**
   * @description Request identifier that was resolved
   * @type { string }
   * @memberof EventPermissionResolved
   */
  requestId: string;
  /**
   * @description Whether the permission was allowed or denied
   * @type { PermissionDecision }
   * @memberof EventPermissionResolved
   */
  decision: PermissionDecision;
};

export function decodeEventPermissionResolved(rawInput: unknown): EventPermissionResolved | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedRequestId = decodeString(rawInput['requestId']);
    const decodedDecision = decodePermissionDecision(rawInput['decision']);

    if (decodedType === null || decodedRequestId === null || decodedDecision === null) {
      return null;
    }

    return {
      type: decodedType,
      requestId: decodedRequestId,
      decision: decodedDecision,
    };
  }
  return null;
}

/**
 * @type { EventSessionStarted }
 * @description A new AI session has started
 */
export type EventSessionStarted = {
  /**
   * @type { string }
   * @memberof EventSessionStarted
   */
  type: string;
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof EventSessionStarted
   */
  sessionId: string;
  /**
   * @description Project name or path
   * @type { string }
   * @memberof EventSessionStarted
   */
  project: string;
  /**
   * @description Source tool that started the session
   * @type { SessionSource }
   * @memberof EventSessionStarted
   */
  source: SessionSource;
};

export function decodeEventSessionStarted(rawInput: unknown): EventSessionStarted | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedProject = decodeString(rawInput['project']);
    const decodedSource = decodeSessionSource(rawInput['source']);

    if (
      decodedType === null ||
      decodedSessionId === null ||
      decodedProject === null ||
      decodedSource === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      sessionId: decodedSessionId,
      project: decodedProject,
      source: decodedSource,
    };
  }
  return null;
}

/**
 * @type { EventSessionEnded }
 * @description An AI session has ended
 */
export type EventSessionEnded = {
  /**
   * @type { string }
   * @memberof EventSessionEnded
   */
  type: string;
  /**
   * @description Session identifier that ended
   * @type { string }
   * @memberof EventSessionEnded
   */
  sessionId: string;
  /**
   * @description Summary of what happened in the session
   * @type { string }
   * @memberof EventSessionEnded
   */
  summary: string;
};

export function decodeEventSessionEnded(rawInput: unknown): EventSessionEnded | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedSummary = decodeString(rawInput['summary']);

    if (decodedType === null || decodedSessionId === null || decodedSummary === null) {
      return null;
    }

    return {
      type: decodedType,
      sessionId: decodedSessionId,
      summary: decodedSummary,
    };
  }
  return null;
}

/**
 * @type { EventToolStarted }
 * @description A tool execution has started
 */
export type EventToolStarted = {
  /**
   * @type { string }
   * @memberof EventToolStarted
   */
  type: string;
  /**
   * @description Name of the tool being executed
   * @type { string }
   * @memberof EventToolStarted
   */
  tool: string;
  /**
   * @description Command being executed (for Bash tool)
   * @type { string }
   * @memberof EventToolStarted
   */
  command: string | null;
  /**
   * @description File path being operated on
   * @type { string }
   * @memberof EventToolStarted
   */
  filePath: string | null;
  /**
   * @description Associated terminal identifier
   * @type { string }
   * @memberof EventToolStarted
   */
  terminalId: string | null;
};

export function decodeEventToolStarted(rawInput: unknown): EventToolStarted | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedFilePath = decodeString(rawInput['filePath']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);

    if (decodedType === null || decodedTool === null) {
      return null;
    }

    return {
      type: decodedType,
      tool: decodedTool,
      command: decodedCommand,
      filePath: decodedFilePath,
      terminalId: decodedTerminalId,
    };
  }
  return null;
}

/**
 * @type { EventToolCompleted }
 * @description A tool execution has completed
 */
export type EventToolCompleted = {
  /**
   * @type { string }
   * @memberof EventToolCompleted
   */
  type: string;
  /**
   * @description Name of the tool that completed
   * @type { string }
   * @memberof EventToolCompleted
   */
  tool: string;
  /**
   * @description Whether the tool execution succeeded
   * @type { boolean }
   * @memberof EventToolCompleted
   */
  success: boolean;
  /**
   * @description Associated terminal identifier
   * @type { string }
   * @memberof EventToolCompleted
   */
  terminalId: string | null;
};

export function decodeEventToolCompleted(rawInput: unknown): EventToolCompleted | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedSuccess = decodeBoolean(rawInput['success']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);

    if (decodedType === null || decodedTool === null || decodedSuccess === null) {
      return null;
    }

    return {
      type: decodedType,
      tool: decodedTool,
      success: decodedSuccess,
      terminalId: decodedTerminalId,
    };
  }
  return null;
}

/**
 * @type { EventToolFailed }
 * @description A tool execution has failed
 */
export type EventToolFailed = {
  /**
   * @type { string }
   * @memberof EventToolFailed
   */
  type: string;
  /**
   * @description Name of the tool that failed
   * @type { string }
   * @memberof EventToolFailed
   */
  tool: string;
  /**
   * @description Error message
   * @type { string }
   * @memberof EventToolFailed
   */
  error: string;
  /**
   * @description Associated terminal identifier
   * @type { string }
   * @memberof EventToolFailed
   */
  terminalId: string | null;
};

export function decodeEventToolFailed(rawInput: unknown): EventToolFailed | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedError = decodeString(rawInput['error']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);

    if (decodedType === null || decodedTool === null || decodedError === null) {
      return null;
    }

    return {
      type: decodedType,
      tool: decodedTool,
      error: decodedError,
      terminalId: decodedTerminalId,
    };
  }
  return null;
}

/**
 * @type { EventAgentIdle }
 * @description The AI agent is idle and waiting
 */
export type EventAgentIdle = {
  /**
   * @type { string }
   * @memberof EventAgentIdle
   */
  type: string;
  /**
   * @description Optional idle message
   * @type { string }
   * @memberof EventAgentIdle
   */
  message: string | null;
  /**
   * @description Associated terminal identifier
   * @type { string }
   * @memberof EventAgentIdle
   */
  terminalId: string | null;
};

export function decodeEventAgentIdle(rawInput: unknown): EventAgentIdle | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessage = decodeString(rawInput['message']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
      message: decodedMessage,
      terminalId: decodedTerminalId,
    };
  }
  return null;
}

/**
 * @type { EventAgentQuestion }
 * @description The AI agent has a question for the user
 */
export type EventAgentQuestion = {
  /**
   * @type { string }
   * @memberof EventAgentQuestion
   */
  type: string;
  /**
   * @description The question being asked
   * @type { string }
   * @memberof EventAgentQuestion
   */
  message: string;
  /**
   * @description Associated terminal identifier
   * @type { string }
   * @memberof EventAgentQuestion
   */
  terminalId: string | null;
};

export function decodeEventAgentQuestion(rawInput: unknown): EventAgentQuestion | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessage = decodeString(rawInput['message']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);

    if (decodedType === null || decodedMessage === null) {
      return null;
    }

    return {
      type: decodedType,
      message: decodedMessage,
      terminalId: decodedTerminalId,
    };
  }
  return null;
}

export type ShooterEvent =
  | CShooterEventEventTerminalCreated
  | CShooterEventEventTerminalExited
  | CShooterEventEventPermissionRequested
  | CShooterEventEventPermissionResolved
  | CShooterEventEventSessionStarted
  | CShooterEventEventSessionEnded
  | CShooterEventEventToolStarted
  | CShooterEventEventToolCompleted
  | CShooterEventEventToolFailed
  | CShooterEventEventAgentIdle
  | CShooterEventEventAgentQuestion;

export function decodeShooterEvent(rawInput: unknown): ShooterEvent | null {
  const result: ShooterEvent | null =
    decodeCShooterEventEventTerminalCreated(rawInput) ??
    decodeCShooterEventEventTerminalExited(rawInput) ??
    decodeCShooterEventEventPermissionRequested(rawInput) ??
    decodeCShooterEventEventPermissionResolved(rawInput) ??
    decodeCShooterEventEventSessionStarted(rawInput) ??
    decodeCShooterEventEventSessionEnded(rawInput) ??
    decodeCShooterEventEventToolStarted(rawInput) ??
    decodeCShooterEventEventToolCompleted(rawInput) ??
    decodeCShooterEventEventToolFailed(rawInput) ??
    decodeCShooterEventEventAgentIdle(rawInput) ??
    decodeCShooterEventEventAgentQuestion(rawInput);

  return result;
}

export class CShooterEventEventTerminalCreated {
  data: EventTerminalCreated;
  constructor(data: EventTerminalCreated) {
    this.data = data;
  }
}

export function decodeCShooterEventEventTerminalCreated(
  rawInput: unknown
): CShooterEventEventTerminalCreated | null {
  const result = decodeEventTerminalCreated(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventTerminalCreated(result);
}

export class CShooterEventEventTerminalExited {
  data: EventTerminalExited;
  constructor(data: EventTerminalExited) {
    this.data = data;
  }
}

export function decodeCShooterEventEventTerminalExited(
  rawInput: unknown
): CShooterEventEventTerminalExited | null {
  const result = decodeEventTerminalExited(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventTerminalExited(result);
}

export class CShooterEventEventPermissionRequested {
  data: EventPermissionRequested;
  constructor(data: EventPermissionRequested) {
    this.data = data;
  }
}

export function decodeCShooterEventEventPermissionRequested(
  rawInput: unknown
): CShooterEventEventPermissionRequested | null {
  const result = decodeEventPermissionRequested(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventPermissionRequested(result);
}

export class CShooterEventEventPermissionResolved {
  data: EventPermissionResolved;
  constructor(data: EventPermissionResolved) {
    this.data = data;
  }
}

export function decodeCShooterEventEventPermissionResolved(
  rawInput: unknown
): CShooterEventEventPermissionResolved | null {
  const result = decodeEventPermissionResolved(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventPermissionResolved(result);
}

export class CShooterEventEventSessionStarted {
  data: EventSessionStarted;
  constructor(data: EventSessionStarted) {
    this.data = data;
  }
}

export function decodeCShooterEventEventSessionStarted(
  rawInput: unknown
): CShooterEventEventSessionStarted | null {
  const result = decodeEventSessionStarted(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventSessionStarted(result);
}

export class CShooterEventEventSessionEnded {
  data: EventSessionEnded;
  constructor(data: EventSessionEnded) {
    this.data = data;
  }
}

export function decodeCShooterEventEventSessionEnded(
  rawInput: unknown
): CShooterEventEventSessionEnded | null {
  const result = decodeEventSessionEnded(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventSessionEnded(result);
}

export class CShooterEventEventToolStarted {
  data: EventToolStarted;
  constructor(data: EventToolStarted) {
    this.data = data;
  }
}

export function decodeCShooterEventEventToolStarted(
  rawInput: unknown
): CShooterEventEventToolStarted | null {
  const result = decodeEventToolStarted(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventToolStarted(result);
}

export class CShooterEventEventToolCompleted {
  data: EventToolCompleted;
  constructor(data: EventToolCompleted) {
    this.data = data;
  }
}

export function decodeCShooterEventEventToolCompleted(
  rawInput: unknown
): CShooterEventEventToolCompleted | null {
  const result = decodeEventToolCompleted(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventToolCompleted(result);
}

export class CShooterEventEventToolFailed {
  data: EventToolFailed;
  constructor(data: EventToolFailed) {
    this.data = data;
  }
}

export function decodeCShooterEventEventToolFailed(
  rawInput: unknown
): CShooterEventEventToolFailed | null {
  const result = decodeEventToolFailed(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventToolFailed(result);
}

export class CShooterEventEventAgentIdle {
  data: EventAgentIdle;
  constructor(data: EventAgentIdle) {
    this.data = data;
  }
}

export function decodeCShooterEventEventAgentIdle(
  rawInput: unknown
): CShooterEventEventAgentIdle | null {
  const result = decodeEventAgentIdle(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventAgentIdle(result);
}

export class CShooterEventEventAgentQuestion {
  data: EventAgentQuestion;
  constructor(data: EventAgentQuestion) {
    this.data = data;
  }
}

export function decodeCShooterEventEventAgentQuestion(
  rawInput: unknown
): CShooterEventEventAgentQuestion | null {
  const result = decodeEventAgentQuestion(rawInput);
  if (result === null) {
    return null;
  }
  return new CShooterEventEventAgentQuestion(result);
}

/**
 * @type { Ticket }
 * @description Short-lived single-use ticket for authenticating WebSocket upgrade requests
 */
export type Ticket = {
  /**
   * @description Unix timestamp (ms) when the ticket was created
   * @type { number }
   * @memberof Ticket
   */
  createdAt: number;
  /**
   * @description Whether the ticket has been consumed (single-use)
   * @type { boolean }
   * @memberof Ticket
   */
  used: boolean;
};

export function decodeTicket(rawInput: unknown): Ticket | null {
  if (isJSON(rawInput)) {
    const decodedCreatedAt = decodeNumber(rawInput['createdAt']);
    const decodedUsed = decodeBoolean(rawInput['used']);

    if (decodedCreatedAt === null || decodedUsed === null) {
      return null;
    }

    return {
      createdAt: decodedCreatedAt,
      used: decodedUsed,
    };
  }
  return null;
}
