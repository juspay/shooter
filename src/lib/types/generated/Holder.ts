import {
  isJSON,
  decodeNumber,
  _decodeNumber,
  decodeBoolean,
  _decodeBoolean,
  decodeString,
  _decodeString,
} from 'type-decoder';

/**
 * @type { ConnectResult }
 * @description Result returned after successfully connecting to a PTY holder process and completing the info+scrollback handshake
 */
export type ConnectResult = {
  /**
   * @description OS process ID of the PTY child process
   * @type { number }
   * @memberof ConnectResult
   */
  pid: number;
  /**
   * @description Whether the PTY process has already exited
   * @type { boolean }
   * @memberof ConnectResult
   */
  exited: boolean;
  /**
   * @description Process exit code if exited, or null if still running
   * @type { number }
   * @memberof ConnectResult
   */
  exitCode: number | null;
  /**
   * @description Scrollback buffer content replayed on connect
   * @type { string }
   * @memberof ConnectResult
   */
  scrollback: string;
};

export function decodeConnectResult(rawInput: unknown): ConnectResult | null {
  if (isJSON(rawInput)) {
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedExited = decodeBoolean(rawInput['exited']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);
    const decodedScrollback = decodeString(rawInput['scrollback']);

    if (decodedPid === null || decodedExited === null || decodedScrollback === null) {
      return null;
    }

    return {
      pid: decodedPid,
      exited: decodedExited,
      exitCode: decodedExitCode,
      scrollback: decodedScrollback,
    };
  }
  return null;
}

/**
 * @type { IncomingActivityMessage }
 * @description Terminal activity state change (active/idle)
 */
export type IncomingActivityMessage = {
  /**
   * @type { string }
   * @memberof IncomingActivityMessage
   */
  type: string;
  /**
   * @description Whether the terminal is currently producing output
   * @type { boolean }
   * @memberof IncomingActivityMessage
   */
  active: boolean;
};

export function decodeIncomingActivityMessage(rawInput: unknown): IncomingActivityMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedActive = decodeBoolean(rawInput['active']);

    if (decodedType === null || decodedActive === null) {
      return null;
    }

    return {
      type: decodedType,
      active: decodedActive,
    };
  }
  return null;
}

/**
 * @type { IncomingExitMessage }
 * @description PTY process has exited
 */
export type IncomingExitMessage = {
  /**
   * @type { string }
   * @memberof IncomingExitMessage
   */
  type: string;
  /**
   * @description Process exit code
   * @type { number }
   * @memberof IncomingExitMessage
   */
  code: number;
  /**
   * @description Signal that caused the exit
   * @type { string }
   * @memberof IncomingExitMessage
   */
  signal: string;
};

export function decodeIncomingExitMessage(rawInput: unknown): IncomingExitMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedCode = decodeNumber(rawInput['code']);
    const decodedSignal = decodeString(rawInput['signal']);

    if (decodedType === null || decodedCode === null || decodedSignal === null) {
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
 * @type { IncomingOutputMessage }
 * @description PTY output chunk during normal operation
 */
export type IncomingOutputMessage = {
  /**
   * @type { string }
   * @memberof IncomingOutputMessage
   */
  type: string;
  /**
   * @description Raw PTY output data
   * @type { string }
   * @memberof IncomingOutputMessage
   */
  data: string;
};

export function decodeIncomingOutputMessage(rawInput: unknown): IncomingOutputMessage | null {
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
 * @type { IncomingScrollbackMessage }
 * @description Full scrollback replay sent on connection
 */
export type IncomingScrollbackMessage = {
  /**
   * @type { string }
   * @memberof IncomingScrollbackMessage
   */
  type: string;
  /**
   * @description Full scrollback buffer content
   * @type { string }
   * @memberof IncomingScrollbackMessage
   */
  data: string;
};

export function decodeIncomingScrollbackMessage(
  rawInput: unknown
): IncomingScrollbackMessage | null {
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
 * @type { IncomingInfoMessage }
 * @description Current holder state sent on connection
 */
export type IncomingInfoMessage = {
  /**
   * @type { string }
   * @memberof IncomingInfoMessage
   */
  type: string;
  /**
   * @description PTY child process ID
   * @type { number }
   * @memberof IncomingInfoMessage
   */
  pid: number;
  /**
   * @description Whether the PTY process has exited
   * @type { boolean }
   * @memberof IncomingInfoMessage
   */
  exited: boolean;
  /**
   * @description Exit code if process has exited
   * @type { number }
   * @memberof IncomingInfoMessage
   */
  exitCode: number;
};

export function decodeIncomingInfoMessage(rawInput: unknown): IncomingInfoMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedExited = decodeBoolean(rawInput['exited']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);

    if (
      decodedType === null ||
      decodedPid === null ||
      decodedExited === null ||
      decodedExitCode === null
    ) {
      return null;
    }

    return {
      type: decodedType,
      pid: decodedPid,
      exited: decodedExited,
      exitCode: decodedExitCode,
    };
  }
  return null;
}

/**
 * @type { IncomingCwdMessage }
 * @description Current working directory change detected via OSC 7
 */
export type IncomingCwdMessage = {
  /**
   * @type { string }
   * @memberof IncomingCwdMessage
   */
  type: string;
  /**
   * @description Absolute path of the new working directory
   * @type { string }
   * @memberof IncomingCwdMessage
   */
  path: string;
};

export function decodeIncomingCwdMessage(rawInput: unknown): IncomingCwdMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedPath = decodeString(rawInput['path']);

    if (decodedType === null || decodedPath === null) {
      return null;
    }

    return {
      type: decodedType,
      path: decodedPath,
    };
  }
  return null;
}

export type IncomingMessage =
  | CIncomingMessageIncomingActivityMessage
  | CIncomingMessageIncomingExitMessage
  | CIncomingMessageIncomingOutputMessage
  | CIncomingMessageIncomingScrollbackMessage
  | CIncomingMessageIncomingInfoMessage
  | CIncomingMessageIncomingCwdMessage;

export function decodeIncomingMessage(rawInput: unknown): IncomingMessage | null {
  const result: IncomingMessage | null =
    decodeCIncomingMessageIncomingActivityMessage(rawInput) ??
    decodeCIncomingMessageIncomingExitMessage(rawInput) ??
    decodeCIncomingMessageIncomingOutputMessage(rawInput) ??
    decodeCIncomingMessageIncomingScrollbackMessage(rawInput) ??
    decodeCIncomingMessageIncomingInfoMessage(rawInput) ??
    decodeCIncomingMessageIncomingCwdMessage(rawInput);

  return result;
}

export class CIncomingMessageIncomingActivityMessage {
  data: IncomingActivityMessage;
  constructor(data: IncomingActivityMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingActivityMessage(
  rawInput: unknown
): CIncomingMessageIncomingActivityMessage | null {
  const result = decodeIncomingActivityMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingActivityMessage(result);
}

export class CIncomingMessageIncomingExitMessage {
  data: IncomingExitMessage;
  constructor(data: IncomingExitMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingExitMessage(
  rawInput: unknown
): CIncomingMessageIncomingExitMessage | null {
  const result = decodeIncomingExitMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingExitMessage(result);
}

export class CIncomingMessageIncomingOutputMessage {
  data: IncomingOutputMessage;
  constructor(data: IncomingOutputMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingOutputMessage(
  rawInput: unknown
): CIncomingMessageIncomingOutputMessage | null {
  const result = decodeIncomingOutputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingOutputMessage(result);
}

export class CIncomingMessageIncomingScrollbackMessage {
  data: IncomingScrollbackMessage;
  constructor(data: IncomingScrollbackMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingScrollbackMessage(
  rawInput: unknown
): CIncomingMessageIncomingScrollbackMessage | null {
  const result = decodeIncomingScrollbackMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingScrollbackMessage(result);
}

export class CIncomingMessageIncomingInfoMessage {
  data: IncomingInfoMessage;
  constructor(data: IncomingInfoMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingInfoMessage(
  rawInput: unknown
): CIncomingMessageIncomingInfoMessage | null {
  const result = decodeIncomingInfoMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingInfoMessage(result);
}

export class CIncomingMessageIncomingCwdMessage {
  data: IncomingCwdMessage;
  constructor(data: IncomingCwdMessage) {
    this.data = data;
  }
}

export function decodeCIncomingMessageIncomingCwdMessage(
  rawInput: unknown
): CIncomingMessageIncomingCwdMessage | null {
  const result = decodeIncomingCwdMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CIncomingMessageIncomingCwdMessage(result);
}

/**
 * @type { OutgoingResizeMessage }
 * @description Resize the PTY dimensions
 */
export type OutgoingResizeMessage = {
  /**
   * @type { string }
   * @memberof OutgoingResizeMessage
   */
  type: string;
  /**
   * @description New width in columns
   * @type { number }
   * @memberof OutgoingResizeMessage
   */
  cols: number;
  /**
   * @description New height in rows
   * @type { number }
   * @memberof OutgoingResizeMessage
   */
  rows: number;
};

export function decodeOutgoingResizeMessage(rawInput: unknown): OutgoingResizeMessage | null {
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
 * @type { OutgoingInputMessage }
 * @description Write data to PTY stdin
 */
export type OutgoingInputMessage = {
  /**
   * @type { string }
   * @memberof OutgoingInputMessage
   */
  type: string;
  /**
   * @description Raw input data to write to PTY
   * @type { string }
   * @memberof OutgoingInputMessage
   */
  data: string;
};

export function decodeOutgoingInputMessage(rawInput: unknown): OutgoingInputMessage | null {
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
 * @type { OutgoingKillMessage }
 * @description Send a signal to the PTY process
 */
export type OutgoingKillMessage = {
  /**
   * @type { string }
   * @memberof OutgoingKillMessage
   */
  type: string;
  /**
   * @description Signal name to send (default SIGTERM)
   * @type { string }
   * @memberof OutgoingKillMessage
   */
  signal: string | null;
};

export function decodeOutgoingKillMessage(rawInput: unknown): OutgoingKillMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSignal = decodeString(rawInput['signal']);

    if (decodedType === null) {
      return null;
    }

    return {
      type: decodedType,
      signal: decodedSignal,
    };
  }
  return null;
}

export type OutgoingMessage =
  | COutgoingMessageOutgoingResizeMessage
  | COutgoingMessageOutgoingInputMessage
  | COutgoingMessageOutgoingKillMessage;

export function decodeOutgoingMessage(rawInput: unknown): OutgoingMessage | null {
  const result: OutgoingMessage | null =
    decodeCOutgoingMessageOutgoingResizeMessage(rawInput) ??
    decodeCOutgoingMessageOutgoingInputMessage(rawInput) ??
    decodeCOutgoingMessageOutgoingKillMessage(rawInput);

  return result;
}

export class COutgoingMessageOutgoingResizeMessage {
  data: OutgoingResizeMessage;
  constructor(data: OutgoingResizeMessage) {
    this.data = data;
  }
}

export function decodeCOutgoingMessageOutgoingResizeMessage(
  rawInput: unknown
): COutgoingMessageOutgoingResizeMessage | null {
  const result = decodeOutgoingResizeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new COutgoingMessageOutgoingResizeMessage(result);
}

export class COutgoingMessageOutgoingInputMessage {
  data: OutgoingInputMessage;
  constructor(data: OutgoingInputMessage) {
    this.data = data;
  }
}

export function decodeCOutgoingMessageOutgoingInputMessage(
  rawInput: unknown
): COutgoingMessageOutgoingInputMessage | null {
  const result = decodeOutgoingInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new COutgoingMessageOutgoingInputMessage(result);
}

export class COutgoingMessageOutgoingKillMessage {
  data: OutgoingKillMessage;
  constructor(data: OutgoingKillMessage) {
    this.data = data;
  }
}

export function decodeCOutgoingMessageOutgoingKillMessage(
  rawInput: unknown
): COutgoingMessageOutgoingKillMessage | null {
  const result = decodeOutgoingKillMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new COutgoingMessageOutgoingKillMessage(result);
}

/**
 * @type { WatchedFile }
 * @description Tracking state for a JSONL session file being watched by the SessionWatcher
 */
export type WatchedFile = {
  /**
   * @description Absolute path to the JSONL session file being watched
   * @type { string }
   * @memberof WatchedFile
   */
  filePath: string;
  /**
   * @description Byte offset of the last read position in the file
   * @type { number }
   * @memberof WatchedFile
   */
  offset: number;
};

export function decodeWatchedFile(rawInput: unknown): WatchedFile | null {
  if (isJSON(rawInput)) {
    const decodedFilePath = decodeString(rawInput['filePath']);
    const decodedOffset = decodeNumber(rawInput['offset']);

    if (decodedFilePath === null || decodedOffset === null) {
      return null;
    }

    return {
      filePath: decodedFilePath,
      offset: decodedOffset,
    };
  }
  return null;
}
