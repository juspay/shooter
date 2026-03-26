import {
  type SessionSource,
  decodeSessionSource,
  type PermissionDecision,
  decodePermissionDecision,
} from './index';
import {
  isJSON,
  decodeString,
  _decodeString,
  decodeArray,
  _decodeArray,
  decodeNumber,
  _decodeNumber,
  decodeBoolean,
  _decodeBoolean,
} from 'type-decoder';

/**
 * @type { TerminalStatus }
 * @description Lifecycle status of a terminal session
 */
export type TerminalStatus = 'running' | 'exited' | 'orphaned';

export function decodeTerminalStatus(rawInput: unknown): TerminalStatus | null {
  switch (rawInput) {
    case 'running':
    case 'exited':
    case 'orphaned':
      return rawInput;
  }
  return null;
}

export function _decodeTerminalStatus(rawInput: unknown): TerminalStatus | undefined {
  switch (rawInput) {
    case 'running':
    case 'exited':
    case 'orphaned':
      return rawInput;
  }
  return;
}

/**
 * @type { ManagedTerminalInfo }
 * @description Serializable info about a managed terminal session (excludes runtime handles like PTY, watchers, client sets)
 */
export type ManagedTerminalInfo = {
  /**
   * @description Unique terminal identifier (e.g. "term_a1b2c3")
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  id: string;
  /**
   * @description The command that was launched (e.g. "zsh", "claude", "opencode")
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  command: string;
  /**
   * @description Command arguments passed at launch
   * @type { string[] }
   * @memberof ManagedTerminalInfo
   */
  args: string[];
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  cwd: string;
  /**
   * @description OS process ID of the terminal process
   * @type { number }
   * @memberof ManagedTerminalInfo
   */
  pid: number;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  createdAt: string;
  /**
   * @description ISO 8601 timestamp when the process exited, or null if still running
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  exitedAt: string | null;
  /**
   * @description Current lifecycle status of the terminal
   * @type { TerminalStatus }
   * @memberof ManagedTerminalInfo
   */
  status: TerminalStatus;
  /**
   * @description Process exit code (0 = success), or null if still running
   * @type { number }
   * @memberof ManagedTerminalInfo
   */
  exitCode: number | null;
  /**
   * @description PID of the PTY holder process, or null if not using holder architecture
   * @type { number }
   * @memberof ManagedTerminalInfo
   */
  holderPid: number | null;
  /**
   * @description Unix domain socket path for the holder process, or null if not applicable
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  socketPath: string | null;
  /**
   * @description Whether the terminal is currently producing output (true) or idle (false)
   * @type { boolean }
   * @memberof ManagedTerminalInfo
   */
  isActive: boolean;
  /**
   * @description Current working directory detected via OSC 7, or null if not yet detected
   * @type { string }
   * @memberof ManagedTerminalInfo
   */
  currentCwd: string;
};

export function decodeManagedTerminalInfo(rawInput: unknown): ManagedTerminalInfo | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedArgs = decodeArray(rawInput['args'], decodeString);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedStatus = decodeTerminalStatus(rawInput['status']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);
    const decodedHolderPid = decodeNumber(rawInput['holderPid']);
    const decodedSocketPath = decodeString(rawInput['socketPath']);
    const decodedIsActive = decodeBoolean(rawInput['isActive']);
    const decodedCurrentCwd = decodeString(rawInput['currentCwd']);

    if (
      decodedId === null ||
      decodedCommand === null ||
      decodedArgs === null ||
      decodedCwd === null ||
      decodedPid === null ||
      decodedCreatedAt === null ||
      decodedStatus === null ||
      decodedIsActive === null ||
      decodedCurrentCwd === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      command: decodedCommand,
      args: decodedArgs,
      cwd: decodedCwd,
      pid: decodedPid,
      createdAt: decodedCreatedAt,
      exitedAt: decodedExitedAt,
      status: decodedStatus,
      exitCode: decodedExitCode,
      holderPid: decodedHolderPid,
      socketPath: decodedSocketPath,
      isActive: decodedIsActive,
      currentCwd: decodedCurrentCwd,
    };
  }
  return null;
}

/**
 * @type { CreateTerminalRequest }
 * @description Request body for creating a new managed terminal session
 */
export type CreateTerminalRequest = {
  /**
   * @description The command to execute (e.g. "zsh", "claude", "opencode")
   * @type { string }
   * @memberof CreateTerminalRequest
   */
  command: string;
  /**
   * @description Optional command arguments
   * @type { string[] }
   * @memberof CreateTerminalRequest
   */
  args: string[] | null;
  /**
   * @description Working directory for the new terminal
   * @type { string }
   * @memberof CreateTerminalRequest
   */
  cwd: string;
  /**
   * @description Terminal width in columns (default 80)
   * @type { number }
   * @memberof CreateTerminalRequest
   */
  cols: number | null;
  /**
   * @description Terminal height in rows (default 24)
   * @type { number }
   * @memberof CreateTerminalRequest
   */
  rows: number | null;
};

export function decodeCreateTerminalRequest(rawInput: unknown): CreateTerminalRequest | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput['command']);
    const decodedArgs = decodeArray(rawInput['args'], decodeString);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedCols = decodeNumber(rawInput['cols']);
    const decodedRows = decodeNumber(rawInput['rows']);

    if (decodedCommand === null || decodedCwd === null) {
      return null;
    }

    return {
      command: decodedCommand,
      args: decodedArgs,
      cwd: decodedCwd,
      cols: decodedCols,
      rows: decodedRows,
    };
  }
  return null;
}

/**
 * @type { CreateTerminalResponse }
 * @description Response after successfully creating a managed terminal session
 */
export type CreateTerminalResponse = {
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  id: string;
  /**
   * @description OS process ID of the spawned process
   * @type { number }
   * @memberof CreateTerminalResponse
   */
  pid: number;
  /**
   * @description The command that was launched
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  command: string;
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  cwd: string;
  /**
   * @description WebSocket path for raw terminal I/O (e.g. "/ws/terminal/term_a1b2c3")
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  ws: string;
  /**
   * @description WebSocket path for structured session stream, or null if not an AI session
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  sessionWs: string | null;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof CreateTerminalResponse
   */
  createdAt: string;
};

export function decodeCreateTerminalResponse(rawInput: unknown): CreateTerminalResponse | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedWs = decodeString(rawInput['ws']);
    const decodedSessionWs = decodeString(rawInput['sessionWs']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);

    if (
      decodedId === null ||
      decodedPid === null ||
      decodedCommand === null ||
      decodedCwd === null ||
      decodedWs === null ||
      decodedCreatedAt === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      pid: decodedPid,
      command: decodedCommand,
      cwd: decodedCwd,
      ws: decodedWs,
      sessionWs: decodedSessionWs,
      createdAt: decodedCreatedAt,
    };
  }
  return null;
}

/**
 * @type { TerminalListResponse }
 * @description Response for listing all managed terminal sessions
 */
export type TerminalListResponse = {
  /**
   * @description Array of managed terminal info objects
   * @type { ManagedTerminalInfo[] }
   * @memberof TerminalListResponse
   */
  terminals: ManagedTerminalInfo[];
  /**
   * @description Total number of terminals in the list
   * @type { number }
   * @memberof TerminalListResponse
   */
  count: number;
};

export function decodeTerminalListResponse(rawInput: unknown): TerminalListResponse | null {
  if (isJSON(rawInput)) {
    const decodedTerminals = decodeArray(rawInput['terminals'], decodeManagedTerminalInfo);
    const decodedCount = decodeNumber(rawInput['count']);

    if (decodedTerminals === null || decodedCount === null) {
      return null;
    }

    return {
      terminals: decodedTerminals,
      count: decodedCount,
    };
  }
  return null;
}

/**
 * @type { WsTicketResponse }
 * @description Response containing a short-lived ticket for WebSocket authentication
 */
export type WsTicketResponse = {
  /**
   * @description Single-use random ticket string (expires in 30 seconds)
   * @type { string }
   * @memberof WsTicketResponse
   */
  ticket: string;
  /**
   * @description ISO 8601 timestamp when the ticket expires
   * @type { string }
   * @memberof WsTicketResponse
   */
  expiresAt: string;
};

export function decodeWsTicketResponse(rawInput: unknown): WsTicketResponse | null {
  if (isJSON(rawInput)) {
    const decodedTicket = decodeString(rawInput['ticket']);
    const decodedExpiresAt = decodeString(rawInput['expiresAt']);

    if (decodedTicket === null || decodedExpiresAt === null) {
      return null;
    }

    return {
      ticket: decodedTicket,
      expiresAt: decodedExpiresAt,
    };
  }
  return null;
}

/**
 * @type { WsStatusResponse }
 * @description Response indicating how many WebSocket clients are currently connected
 */
export type WsStatusResponse = {
  /**
   * @description Number of active WebSocket connections across all channels
   * @type { number }
   * @memberof WsStatusResponse
   */
  connectedClients: number;
};

export function decodeWsStatusResponse(rawInput: unknown): WsStatusResponse | null {
  if (isJSON(rawInput)) {
    const decodedConnectedClients = decodeNumber(rawInput['connectedClients']);

    if (decodedConnectedClients === null) {
      return null;
    }

    return {
      connectedClients: decodedConnectedClients,
    };
  }
  return null;
}

/**
 * @type { WsTerminalInputMessage }
 * @description Send keyboard input to the terminal PTY
 */
export type WsTerminalInputMessage = {
  /**
   * @type { string }
   * @memberof WsTerminalInputMessage
   */
  type: string;
  /**
   * @description Raw terminal input data (keystrokes, pasted text)
   * @type { string }
   * @memberof WsTerminalInputMessage
   */
  data: string;
};

export function decodeWsTerminalInputMessage(rawInput: unknown): WsTerminalInputMessage | null {
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
 * @type { WsTerminalResizeMessage }
 * @description Resize the terminal PTY dimensions
 */
export type WsTerminalResizeMessage = {
  /**
   * @type { string }
   * @memberof WsTerminalResizeMessage
   */
  type: string;
  /**
   * @description New terminal width in columns (1-500)
   * @type { number }
   * @memberof WsTerminalResizeMessage
   */
  cols: number;
  /**
   * @description New terminal height in rows (1-200)
   * @type { number }
   * @memberof WsTerminalResizeMessage
   */
  rows: number;
};

export function decodeWsTerminalResizeMessage(rawInput: unknown): WsTerminalResizeMessage | null {
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
 * @type { WsTerminalSignalMessage }
 * @description Send a signal to the terminal process
 */
export type WsTerminalSignalMessage = {
  /**
   * @type { string }
   * @memberof WsTerminalSignalMessage
   */
  type: string;
  /**
   * @description Signal name to send to the terminal process
   * @type { SignalEnum }
   * @memberof WsTerminalSignalMessage
   */
  signal: SignalEnum;
};

export function decodeWsTerminalSignalMessage(rawInput: unknown): WsTerminalSignalMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedSignal = decodeSignalEnum(rawInput['signal']);

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

/**
 * @type { SignalEnum }
 * @description Signal name to send to the terminal process
 */
export type SignalEnum = 'SIGINT' | 'SIGTERM' | 'SIGTSTP';

export function decodeSignalEnum(rawInput: unknown): SignalEnum | null {
  switch (rawInput) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGTSTP':
      return rawInput;
  }
  return null;
}

export function _decodeSignalEnum(rawInput: unknown): SignalEnum | undefined {
  switch (rawInput) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'SIGTSTP':
      return rawInput;
  }
  return;
}

export type WsTerminalMessage =
  | CWsTerminalMessageWsTerminalInputMessage
  | CWsTerminalMessageWsTerminalResizeMessage
  | CWsTerminalMessageWsTerminalSignalMessage;

export function decodeWsTerminalMessage(rawInput: unknown): WsTerminalMessage | null {
  const result: WsTerminalMessage | null =
    decodeCWsTerminalMessageWsTerminalInputMessage(rawInput) ??
    decodeCWsTerminalMessageWsTerminalResizeMessage(rawInput) ??
    decodeCWsTerminalMessageWsTerminalSignalMessage(rawInput);

  return result;
}

export class CWsTerminalMessageWsTerminalInputMessage {
  data: WsTerminalInputMessage;
  constructor(data: WsTerminalInputMessage) {
    this.data = data;
  }
}

export function decodeCWsTerminalMessageWsTerminalInputMessage(
  rawInput: unknown
): CWsTerminalMessageWsTerminalInputMessage | null {
  const result = decodeWsTerminalInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalInputMessage(result);
}

export class CWsTerminalMessageWsTerminalResizeMessage {
  data: WsTerminalResizeMessage;
  constructor(data: WsTerminalResizeMessage) {
    this.data = data;
  }
}

export function decodeCWsTerminalMessageWsTerminalResizeMessage(
  rawInput: unknown
): CWsTerminalMessageWsTerminalResizeMessage | null {
  const result = decodeWsTerminalResizeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalResizeMessage(result);
}

export class CWsTerminalMessageWsTerminalSignalMessage {
  data: WsTerminalSignalMessage;
  constructor(data: WsTerminalSignalMessage) {
    this.data = data;
  }
}

export function decodeCWsTerminalMessageWsTerminalSignalMessage(
  rawInput: unknown
): CWsTerminalMessageWsTerminalSignalMessage | null {
  const result = decodeWsTerminalSignalMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalSignalMessage(result);
}

/**
 * @type { WsTerminalOutputData }
 * @description Terminal output data from the PTY
 */
export type WsTerminalOutputData = {
  /**
   * @type { string }
   * @memberof WsTerminalOutputData
   */
  type: string;
  /**
   * @description Raw terminal output data
   * @type { string }
   * @memberof WsTerminalOutputData
   */
  data: string;
};

export function decodeWsTerminalOutputData(rawInput: unknown): WsTerminalOutputData | null {
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
 * @type { WsTerminalExitData }
 * @description Terminal process has exited
 */
export type WsTerminalExitData = {
  /**
   * @type { string }
   * @memberof WsTerminalExitData
   */
  type: string;
  /**
   * @description Process exit code, or null if terminated by signal
   * @type { number }
   * @memberof WsTerminalExitData
   */
  code: number | null;
  /**
   * @description Signal that caused the exit, or null if exited normally
   * @type { string }
   * @memberof WsTerminalExitData
   */
  signal: string | null;
};

export function decodeWsTerminalExitData(rawInput: unknown): WsTerminalExitData | null {
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
 * @type { WsTerminalScrollbackData }
 * @description Scrollback chunk sent on reconnection
 */
export type WsTerminalScrollbackData = {
  /**
   * @type { string }
   * @memberof WsTerminalScrollbackData
   */
  type: string;
  /**
   * @description Scrollback content for this chunk (max 50KB)
   * @type { string }
   * @memberof WsTerminalScrollbackData
   */
  data: string;
  /**
   * @description 1-based chunk index
   * @type { number }
   * @memberof WsTerminalScrollbackData
   */
  chunk: number;
  /**
   * @description Total number of scrollback chunks
   * @type { number }
   * @memberof WsTerminalScrollbackData
   */
  total: number;
};

export function decodeWsTerminalScrollbackData(rawInput: unknown): WsTerminalScrollbackData | null {
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
 * @type { WsTerminalErrorData }
 * @description Error message from the terminal server
 */
export type WsTerminalErrorData = {
  /**
   * @type { string }
   * @memberof WsTerminalErrorData
   */
  type: string;
  /**
   * @description Human-readable error message
   * @type { string }
   * @memberof WsTerminalErrorData
   */
  message: string;
};

export function decodeWsTerminalErrorData(rawInput: unknown): WsTerminalErrorData | null {
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

/**
 * @type { WsTerminalOutputDroppedData }
 * @description Notification that output was dropped due to backpressure
 */
export type WsTerminalOutputDroppedData = {
  /**
   * @type { string }
   * @memberof WsTerminalOutputDroppedData
   */
  type: string;
  /**
   * @description Number of bytes that were dropped
   * @type { number }
   * @memberof WsTerminalOutputDroppedData
   */
  bytes: number;
};

export function decodeWsTerminalOutputDroppedData(
  rawInput: unknown
): WsTerminalOutputDroppedData | null {
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
 * @type { WsTerminalActivityData }
 * @description Terminal activity state change (active/idle)
 */
export type WsTerminalActivityData = {
  /**
   * @type { string }
   * @memberof WsTerminalActivityData
   */
  type: string;
  /**
   * @description Whether the terminal is currently producing output
   * @type { boolean }
   * @memberof WsTerminalActivityData
   */
  active: boolean;
};

export function decodeWsTerminalActivityData(rawInput: unknown): WsTerminalActivityData | null {
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
 * @type { WsTerminalCwdData }
 * @description Current working directory change detected via OSC 7
 */
export type WsTerminalCwdData = {
  /**
   * @type { string }
   * @memberof WsTerminalCwdData
   */
  type: string;
  /**
   * @description Absolute path of the new working directory
   * @type { string }
   * @memberof WsTerminalCwdData
   */
  path: string;
};

export function decodeWsTerminalCwdData(rawInput: unknown): WsTerminalCwdData | null {
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

export type WsTerminalOutput =
  | CWsTerminalOutputWsTerminalOutputData
  | CWsTerminalOutputWsTerminalExitData
  | CWsTerminalOutputWsTerminalScrollbackData
  | CWsTerminalOutputWsTerminalErrorData
  | CWsTerminalOutputWsTerminalOutputDroppedData
  | CWsTerminalOutputWsTerminalActivityData
  | CWsTerminalOutputWsTerminalCwdData;

export function decodeWsTerminalOutput(rawInput: unknown): WsTerminalOutput | null {
  const result: WsTerminalOutput | null =
    decodeCWsTerminalOutputWsTerminalOutputData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalExitData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalScrollbackData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalErrorData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalOutputDroppedData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalActivityData(rawInput) ??
    decodeCWsTerminalOutputWsTerminalCwdData(rawInput);

  return result;
}

export class CWsTerminalOutputWsTerminalOutputData {
  data: WsTerminalOutputData;
  constructor(data: WsTerminalOutputData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalOutputData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalOutputData | null {
  const result = decodeWsTerminalOutputData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutputData(result);
}

export class CWsTerminalOutputWsTerminalExitData {
  data: WsTerminalExitData;
  constructor(data: WsTerminalExitData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalExitData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalExitData | null {
  const result = decodeWsTerminalExitData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalExitData(result);
}

export class CWsTerminalOutputWsTerminalScrollbackData {
  data: WsTerminalScrollbackData;
  constructor(data: WsTerminalScrollbackData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalScrollbackData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalScrollbackData | null {
  const result = decodeWsTerminalScrollbackData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalScrollbackData(result);
}

export class CWsTerminalOutputWsTerminalErrorData {
  data: WsTerminalErrorData;
  constructor(data: WsTerminalErrorData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalErrorData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalErrorData | null {
  const result = decodeWsTerminalErrorData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalErrorData(result);
}

export class CWsTerminalOutputWsTerminalOutputDroppedData {
  data: WsTerminalOutputDroppedData;
  constructor(data: WsTerminalOutputDroppedData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalOutputDroppedData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalOutputDroppedData | null {
  const result = decodeWsTerminalOutputDroppedData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutputDroppedData(result);
}

export class CWsTerminalOutputWsTerminalActivityData {
  data: WsTerminalActivityData;
  constructor(data: WsTerminalActivityData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalActivityData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalActivityData | null {
  const result = decodeWsTerminalActivityData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalActivityData(result);
}

export class CWsTerminalOutputWsTerminalCwdData {
  data: WsTerminalCwdData;
  constructor(data: WsTerminalCwdData) {
    this.data = data;
  }
}

export function decodeCWsTerminalOutputWsTerminalCwdData(
  rawInput: unknown
): CWsTerminalOutputWsTerminalCwdData | null {
  const result = decodeWsTerminalCwdData(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalCwdData(result);
}

/**
 * @type { WsSessionSubscribeMessage }
 * @description Subscribe to a live AI session stream
 */
export type WsSessionSubscribeMessage = {
  /**
   * @type { string }
   * @memberof WsSessionSubscribeMessage
   */
  type: string;
  /**
   * @description Terminal ID used to find the associated session file for streaming
   * @type { string }
   * @memberof WsSessionSubscribeMessage
   */
  sessionId: string;
};

export function decodeWsSessionSubscribeMessage(
  rawInput: unknown
): WsSessionSubscribeMessage | null {
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
 * @type { WsSessionSendInputMessage }
 * @description Send text input to the AI session (writes to PTY stdin with newline)
 */
export type WsSessionSendInputMessage = {
  /**
   * @type { string }
   * @memberof WsSessionSendInputMessage
   */
  type: string;
  /**
   * @description Text to send to the AI session (max 10KB)
   * @type { string }
   * @memberof WsSessionSendInputMessage
   */
  text: string;
};

export function decodeWsSessionSendInputMessage(
  rawInput: unknown
): WsSessionSendInputMessage | null {
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
 * @type { WsSessionCancelMessage }
 * @description Cancel the current AI operation (sends SIGINT to PTY)
 */
export type WsSessionCancelMessage = {
  /**
   * @type { string }
   * @memberof WsSessionCancelMessage
   */
  type: string;
};

export function decodeWsSessionCancelMessage(rawInput: unknown): WsSessionCancelMessage | null {
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

export type WsSessionMessage =
  | CWsSessionMessageWsSessionSubscribeMessage
  | CWsSessionMessageWsSessionSendInputMessage
  | CWsSessionMessageWsSessionCancelMessage;

export function decodeWsSessionMessage(rawInput: unknown): WsSessionMessage | null {
  const result: WsSessionMessage | null =
    decodeCWsSessionMessageWsSessionSubscribeMessage(rawInput) ??
    decodeCWsSessionMessageWsSessionSendInputMessage(rawInput) ??
    decodeCWsSessionMessageWsSessionCancelMessage(rawInput);

  return result;
}

export class CWsSessionMessageWsSessionSubscribeMessage {
  data: WsSessionSubscribeMessage;
  constructor(data: WsSessionSubscribeMessage) {
    this.data = data;
  }
}

export function decodeCWsSessionMessageWsSessionSubscribeMessage(
  rawInput: unknown
): CWsSessionMessageWsSessionSubscribeMessage | null {
  const result = decodeWsSessionSubscribeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionSubscribeMessage(result);
}

export class CWsSessionMessageWsSessionSendInputMessage {
  data: WsSessionSendInputMessage;
  constructor(data: WsSessionSendInputMessage) {
    this.data = data;
  }
}

export function decodeCWsSessionMessageWsSessionSendInputMessage(
  rawInput: unknown
): CWsSessionMessageWsSessionSendInputMessage | null {
  const result = decodeWsSessionSendInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionSendInputMessage(result);
}

export class CWsSessionMessageWsSessionCancelMessage {
  data: WsSessionCancelMessage;
  constructor(data: WsSessionCancelMessage) {
    this.data = data;
  }
}

export function decodeCWsSessionMessageWsSessionCancelMessage(
  rawInput: unknown
): CWsSessionMessageWsSessionCancelMessage | null {
  const result = decodeWsSessionCancelMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionCancelMessage(result);
}

/**
 * @type { SessionMessageItem }
 * @description A session message entry
 */
export type SessionMessageItem = Record<string, unknown>;

export function decodeSessionMessageItem(rawInput: unknown): SessionMessageItem | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { WsSessionHistoryOutput }
 * @description Full conversation history sent on connect
 */
export type WsSessionHistoryOutput = {
  /**
   * @type { string }
   * @memberof WsSessionHistoryOutput
   */
  type: string;
  /**
   * @description All session messages from the beginning up to the current point
   * @type { SessionMessageItem[] }
   * @memberof WsSessionHistoryOutput
   */
  messages: SessionMessageItem[];
};

export function decodeWsSessionHistoryOutput(rawInput: unknown): WsSessionHistoryOutput | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedMessages = decodeArray(rawInput['messages'], decodeSessionMessageItem);

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
 * @type { ContentBlockItem }
 * @description A content block (text, code, etc.)
 */
export type ContentBlockItem = Record<string, unknown>;

export function decodeContentBlockItem(rawInput: unknown): ContentBlockItem | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { WsSessionMessageOutput }
 * @description A new conversation message (user or assistant)
 */
export type WsSessionMessageOutput = {
  /**
   * @type { string }
   * @memberof WsSessionMessageOutput
   */
  type: string;
  /**
   * @description Who sent the message
   * @type { RoleEnum }
   * @memberof WsSessionMessageOutput
   */
  role: RoleEnum;
  /**
   * @description Message content blocks
   * @type { ContentBlockItem[] }
   * @memberof WsSessionMessageOutput
   */
  content: ContentBlockItem[];
  /**
   * @description ISO 8601 timestamp of the message
   * @type { string }
   * @memberof WsSessionMessageOutput
   */
  timestamp: string;
};

export function decodeWsSessionMessageOutput(rawInput: unknown): WsSessionMessageOutput | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedRole = decodeRoleEnum(rawInput['role']);
    const decodedContent = decodeArray(rawInput['content'], decodeContentBlockItem);
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
 * @type { RoleEnum }
 * @description Who sent the message
 */
export type RoleEnum = 'user' | 'assistant';

export function decodeRoleEnum(rawInput: unknown): RoleEnum | null {
  switch (rawInput) {
    case 'user':
    case 'assistant':
      return rawInput;
  }
  return null;
}

export function _decodeRoleEnum(rawInput: unknown): RoleEnum | undefined {
  switch (rawInput) {
    case 'user':
    case 'assistant':
      return rawInput;
  }
  return;
}

/**
 * @type { WsSessionToolUseOutput }
 * @description A tool invocation by the AI assistant
 */
export type WsSessionToolUseOutput = {
  /**
   * @type { string }
   * @memberof WsSessionToolUseOutput
   */
  type: string;
  /**
   * @description Unique tool use identifier for correlating with tool-result
   * @type { string }
   * @memberof WsSessionToolUseOutput
   */
  id: string;
  /**
   * @description Tool name (e.g. "Edit", "Bash", "Read")
   * @type { string }
   * @memberof WsSessionToolUseOutput
   */
  name: string;
  /**
   * @description Tool input parameters
   * @type { WsSessionToolUseOutputInput }
   * @memberof WsSessionToolUseOutput
   */
  input: WsSessionToolUseOutputInput;
  /**
   * @description Tool use is always emitted with running status
   * @type { string }
   * @memberof WsSessionToolUseOutput
   */
  status: string;
};

export function decodeWsSessionToolUseOutput(rawInput: unknown): WsSessionToolUseOutput | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedId = decodeString(rawInput['id']);
    const decodedName = decodeString(rawInput['name']);
    const decodedInput = decodeWsSessionToolUseOutputInput(rawInput['input']);
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
 * @type { WsSessionToolUseOutputInput }
 * @description Tool input parameters
 */
export type WsSessionToolUseOutputInput = Record<string, unknown>;

export function decodeWsSessionToolUseOutputInput(
  rawInput: unknown
): WsSessionToolUseOutputInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { WsSessionToolResultOutput }
 * @description Result from a completed tool invocation
 */
export type WsSessionToolResultOutput = {
  /**
   * @type { string }
   * @memberof WsSessionToolResultOutput
   */
  type: string;
  /**
   * @description Tool use ID this result corresponds to
   * @type { string }
   * @memberof WsSessionToolResultOutput
   */
  id: string;
  /**
   * @description Tool output text
   * @type { string }
   * @memberof WsSessionToolResultOutput
   */
  output: string;
  /**
   * @description Whether the tool execution resulted in an error
   * @type { boolean }
   * @memberof WsSessionToolResultOutput
   */
  isError: boolean;
  /**
   * @description Tool result is always emitted with done status
   * @type { string }
   * @memberof WsSessionToolResultOutput
   */
  status: string;
};

export function decodeWsSessionToolResultOutput(
  rawInput: unknown
): WsSessionToolResultOutput | null {
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
 * @type { WsSessionThinkingOutput }
 * @description AI thinking/reasoning block (extended thinking)
 */
export type WsSessionThinkingOutput = {
  /**
   * @type { string }
   * @memberof WsSessionThinkingOutput
   */
  type: string;
  /**
   * @description Thinking content text
   * @type { string }
   * @memberof WsSessionThinkingOutput
   */
  text: string;
};

export function decodeWsSessionThinkingOutput(rawInput: unknown): WsSessionThinkingOutput | null {
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
 * @type { WsSessionEndOutput }
 * @description Session has ended (process exited or session file closed)
 */
export type WsSessionEndOutput = {
  /**
   * @type { string }
   * @memberof WsSessionEndOutput
   */
  type: string;
};

export function decodeWsSessionEndOutput(rawInput: unknown): WsSessionEndOutput | null {
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
 * @type { WsSessionErrorOutput }
 * @description Error message from the session handler
 */
export type WsSessionErrorOutput = {
  /**
   * @type { string }
   * @memberof WsSessionErrorOutput
   */
  type: string;
  /**
   * @description Human-readable error message
   * @type { string }
   * @memberof WsSessionErrorOutput
   */
  message: string;
};

export function decodeWsSessionErrorOutput(rawInput: unknown): WsSessionErrorOutput | null {
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

export type WsSessionOutput =
  | CWsSessionOutputWsSessionHistoryOutput
  | CWsSessionOutputWsSessionMessageOutput
  | CWsSessionOutputWsSessionToolUseOutput
  | CWsSessionOutputWsSessionToolResultOutput
  | CWsSessionOutputWsSessionThinkingOutput
  | CWsSessionOutputWsSessionEndOutput
  | CWsSessionOutputWsSessionErrorOutput;

export function decodeWsSessionOutput(rawInput: unknown): WsSessionOutput | null {
  const result: WsSessionOutput | null =
    decodeCWsSessionOutputWsSessionHistoryOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionMessageOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionToolUseOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionToolResultOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionThinkingOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionEndOutput(rawInput) ??
    decodeCWsSessionOutputWsSessionErrorOutput(rawInput);

  return result;
}

export class CWsSessionOutputWsSessionHistoryOutput {
  data: WsSessionHistoryOutput;
  constructor(data: WsSessionHistoryOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionHistoryOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionHistoryOutput | null {
  const result = decodeWsSessionHistoryOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionHistoryOutput(result);
}

export class CWsSessionOutputWsSessionMessageOutput {
  data: WsSessionMessageOutput;
  constructor(data: WsSessionMessageOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionMessageOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionMessageOutput | null {
  const result = decodeWsSessionMessageOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionMessageOutput(result);
}

export class CWsSessionOutputWsSessionToolUseOutput {
  data: WsSessionToolUseOutput;
  constructor(data: WsSessionToolUseOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionToolUseOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionToolUseOutput | null {
  const result = decodeWsSessionToolUseOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionToolUseOutput(result);
}

export class CWsSessionOutputWsSessionToolResultOutput {
  data: WsSessionToolResultOutput;
  constructor(data: WsSessionToolResultOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionToolResultOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionToolResultOutput | null {
  const result = decodeWsSessionToolResultOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionToolResultOutput(result);
}

export class CWsSessionOutputWsSessionThinkingOutput {
  data: WsSessionThinkingOutput;
  constructor(data: WsSessionThinkingOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionThinkingOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionThinkingOutput | null {
  const result = decodeWsSessionThinkingOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionThinkingOutput(result);
}

export class CWsSessionOutputWsSessionEndOutput {
  data: WsSessionEndOutput;
  constructor(data: WsSessionEndOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionEndOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionEndOutput | null {
  const result = decodeWsSessionEndOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionEndOutput(result);
}

export class CWsSessionOutputWsSessionErrorOutput {
  data: WsSessionErrorOutput;
  constructor(data: WsSessionErrorOutput) {
    this.data = data;
  }
}

export function decodeCWsSessionOutputWsSessionErrorOutput(
  rawInput: unknown
): CWsSessionOutputWsSessionErrorOutput | null {
  const result = decodeWsSessionErrorOutput(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionErrorOutput(result);
}

/**
 * @type { WsSessionStartedEvent }
 * @description A new AI session has started
 */
export type WsSessionStartedEvent = {
  /**
   * @type { string }
   * @memberof WsSessionStartedEvent
   */
  type: string;
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof WsSessionStartedEvent
   */
  sessionId: string;
  /**
   * @description Project name or path
   * @type { string }
   * @memberof WsSessionStartedEvent
   */
  project: string;
  /**
   * @description Source tool that started the session
   * @type { SessionSource }
   * @memberof WsSessionStartedEvent
   */
  source: SessionSource;
};

export function decodeWsSessionStartedEvent(rawInput: unknown): WsSessionStartedEvent | null {
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
 * @type { WsSessionEndedEvent }
 * @description An AI session has ended
 */
export type WsSessionEndedEvent = {
  /**
   * @type { string }
   * @memberof WsSessionEndedEvent
   */
  type: string;
  /**
   * @description Session identifier that ended
   * @type { string }
   * @memberof WsSessionEndedEvent
   */
  sessionId: string;
  /**
   * @description Summary of what happened in the session
   * @type { string }
   * @memberof WsSessionEndedEvent
   */
  summary: string;
};

export function decodeWsSessionEndedEvent(rawInput: unknown): WsSessionEndedEvent | null {
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
 * @type { WsPermissionRequestedEvent }
 * @description A permission request is awaiting approval
 */
export type WsPermissionRequestedEvent = {
  /**
   * @type { string }
   * @memberof WsPermissionRequestedEvent
   */
  type: string;
  /**
   * @description Unique request identifier for the permission flow
   * @type { string }
   * @memberof WsPermissionRequestedEvent
   */
  requestId: string;
  /**
   * @description Tool requesting permission (e.g. "Bash", "Edit")
   * @type { string }
   * @memberof WsPermissionRequestedEvent
   */
  tool: string;
  /**
   * @description Tool input that requires approval
   * @type { WsPermissionRequestedEventInput }
   * @memberof WsPermissionRequestedEvent
   */
  input: WsPermissionRequestedEventInput;
};

export function decodeWsPermissionRequestedEvent(
  rawInput: unknown
): WsPermissionRequestedEvent | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedRequestId = decodeString(rawInput['requestId']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedInput = decodeWsPermissionRequestedEventInput(rawInput['input']);

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
 * @type { WsPermissionRequestedEventInput }
 * @description Tool input that requires approval
 */
export type WsPermissionRequestedEventInput = Record<string, unknown>;

export function decodeWsPermissionRequestedEventInput(
  rawInput: unknown
): WsPermissionRequestedEventInput | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { WsPermissionResolvedEvent }
 * @description A permission request has been resolved
 */
export type WsPermissionResolvedEvent = {
  /**
   * @type { string }
   * @memberof WsPermissionResolvedEvent
   */
  type: string;
  /**
   * @description Request identifier that was resolved
   * @type { string }
   * @memberof WsPermissionResolvedEvent
   */
  requestId: string;
  /**
   * @description Whether the permission was allowed or denied
   * @type { PermissionDecision }
   * @memberof WsPermissionResolvedEvent
   */
  decision: PermissionDecision;
};

export function decodeWsPermissionResolvedEvent(
  rawInput: unknown
): WsPermissionResolvedEvent | null {
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
 * @type { WsTerminalCreatedEvent }
 * @description A new managed terminal has been created
 */
export type WsTerminalCreatedEvent = {
  /**
   * @type { string }
   * @memberof WsTerminalCreatedEvent
   */
  type: string;
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof WsTerminalCreatedEvent
   */
  terminalId: string;
  /**
   * @description Command that was launched
   * @type { string }
   * @memberof WsTerminalCreatedEvent
   */
  command: string;
};

export function decodeWsTerminalCreatedEvent(rawInput: unknown): WsTerminalCreatedEvent | null {
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
 * @type { WsTerminalExitedEvent }
 * @description A managed terminal process has exited
 */
export type WsTerminalExitedEvent = {
  /**
   * @type { string }
   * @memberof WsTerminalExitedEvent
   */
  type: string;
  /**
   * @description Terminal identifier that exited
   * @type { string }
   * @memberof WsTerminalExitedEvent
   */
  terminalId: string;
  /**
   * @description Process exit code, or null if terminated by signal
   * @type { number }
   * @memberof WsTerminalExitedEvent
   */
  code: number | null;
};

export function decodeWsTerminalExitedEvent(rawInput: unknown): WsTerminalExitedEvent | null {
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

export type WsEvent =
  | CWsEventWsSessionStartedEvent
  | CWsEventWsSessionEndedEvent
  | CWsEventWsPermissionRequestedEvent
  | CWsEventWsPermissionResolvedEvent
  | CWsEventWsTerminalCreatedEvent
  | CWsEventWsTerminalExitedEvent;

export function decodeWsEvent(rawInput: unknown): WsEvent | null {
  const result: WsEvent | null =
    decodeCWsEventWsSessionStartedEvent(rawInput) ??
    decodeCWsEventWsSessionEndedEvent(rawInput) ??
    decodeCWsEventWsPermissionRequestedEvent(rawInput) ??
    decodeCWsEventWsPermissionResolvedEvent(rawInput) ??
    decodeCWsEventWsTerminalCreatedEvent(rawInput) ??
    decodeCWsEventWsTerminalExitedEvent(rawInput);

  return result;
}

export class CWsEventWsSessionStartedEvent {
  data: WsSessionStartedEvent;
  constructor(data: WsSessionStartedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsSessionStartedEvent(
  rawInput: unknown
): CWsEventWsSessionStartedEvent | null {
  const result = decodeWsSessionStartedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsSessionStartedEvent(result);
}

export class CWsEventWsSessionEndedEvent {
  data: WsSessionEndedEvent;
  constructor(data: WsSessionEndedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsSessionEndedEvent(
  rawInput: unknown
): CWsEventWsSessionEndedEvent | null {
  const result = decodeWsSessionEndedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsSessionEndedEvent(result);
}

export class CWsEventWsPermissionRequestedEvent {
  data: WsPermissionRequestedEvent;
  constructor(data: WsPermissionRequestedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsPermissionRequestedEvent(
  rawInput: unknown
): CWsEventWsPermissionRequestedEvent | null {
  const result = decodeWsPermissionRequestedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsPermissionRequestedEvent(result);
}

export class CWsEventWsPermissionResolvedEvent {
  data: WsPermissionResolvedEvent;
  constructor(data: WsPermissionResolvedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsPermissionResolvedEvent(
  rawInput: unknown
): CWsEventWsPermissionResolvedEvent | null {
  const result = decodeWsPermissionResolvedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsPermissionResolvedEvent(result);
}

export class CWsEventWsTerminalCreatedEvent {
  data: WsTerminalCreatedEvent;
  constructor(data: WsTerminalCreatedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsTerminalCreatedEvent(
  rawInput: unknown
): CWsEventWsTerminalCreatedEvent | null {
  const result = decodeWsTerminalCreatedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsTerminalCreatedEvent(result);
}

export class CWsEventWsTerminalExitedEvent {
  data: WsTerminalExitedEvent;
  constructor(data: WsTerminalExitedEvent) {
    this.data = data;
  }
}

export function decodeCWsEventWsTerminalExitedEvent(
  rawInput: unknown
): CWsEventWsTerminalExitedEvent | null {
  const result = decodeWsTerminalExitedEvent(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsTerminalExitedEvent(result);
}

/**
 * @type { TerminalRecord }
 * @description Persisted terminal metadata stored in SQLite for recovery across server restarts
 */
export type TerminalRecord = {
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof TerminalRecord
   */
  id: string;
  /**
   * @description The command that was launched
   * @type { string }
   * @memberof TerminalRecord
   */
  command: string;
  /**
   * @description JSON-encoded array of command arguments
   * @type { string }
   * @memberof TerminalRecord
   */
  args: string;
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof TerminalRecord
   */
  cwd: string;
  /**
   * @description Terminal width in columns
   * @type { number }
   * @memberof TerminalRecord
   */
  cols: number;
  /**
   * @description Terminal height in rows
   * @type { number }
   * @memberof TerminalRecord
   */
  rows: number;
  /**
   * @description PTY child process ID
   * @type { number }
   * @memberof TerminalRecord
   */
  pid: number | null;
  /**
   * @description Holder process ID
   * @type { number }
   * @memberof TerminalRecord
   */
  holderPid: number | null;
  /**
   * @description Unix domain socket path for holder communication
   * @type { string }
   * @memberof TerminalRecord
   */
  socketPath: string | null;
  /**
   * @description Claude Code JSONL session file path
   * @type { string }
   * @memberof TerminalRecord
   */
  sessionFile: string | null;
  /**
   * @description OpenCode SQLite session ID
   * @type { string }
   * @memberof TerminalRecord
   */
  opencodeSessionId: string | null;
  /**
   * @description Terminal lifecycle status
   * @type { TerminalStatus }
   * @memberof TerminalRecord
   */
  status: TerminalStatus;
  /**
   * @description Process exit code
   * @type { number }
   * @memberof TerminalRecord
   */
  exitCode: number | null;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof TerminalRecord
   */
  createdAt: string;
  /**
   * @description ISO 8601 timestamp when the process exited
   * @type { string }
   * @memberof TerminalRecord
   */
  exitedAt: string | null;
};

export function decodeTerminalRecord(rawInput: unknown): TerminalRecord | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedArgs = decodeString(rawInput['args']);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedCols = decodeNumber(rawInput['cols']);
    const decodedRows = decodeNumber(rawInput['rows']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedHolderPid = decodeNumber(rawInput['holderPid']);
    const decodedSocketPath = decodeString(rawInput['socketPath']);
    const decodedSessionFile = decodeString(rawInput['sessionFile']);
    const decodedOpencodeSessionId = decodeString(rawInput['opencodeSessionId']);
    const decodedStatus = decodeTerminalStatus(rawInput['status']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);

    if (
      decodedId === null ||
      decodedCommand === null ||
      decodedArgs === null ||
      decodedCwd === null ||
      decodedCols === null ||
      decodedRows === null ||
      decodedStatus === null ||
      decodedCreatedAt === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      command: decodedCommand,
      args: decodedArgs,
      cwd: decodedCwd,
      cols: decodedCols,
      rows: decodedRows,
      pid: decodedPid,
      holderPid: decodedHolderPid,
      socketPath: decodedSocketPath,
      sessionFile: decodedSessionFile,
      opencodeSessionId: decodedOpencodeSessionId,
      status: decodedStatus,
      exitCode: decodedExitCode,
      createdAt: decodedCreatedAt,
      exitedAt: decodedExitedAt,
    };
  }
  return null;
}

/**
 * @type { HolderInputMessage }
 * @description Write data to PTY stdin
 */
export type HolderInputMessage = {
  /**
   * @type { string }
   * @memberof HolderInputMessage
   */
  type: string;
  /**
   * @description Raw input data to write to PTY
   * @type { string }
   * @memberof HolderInputMessage
   */
  data: string;
};

export function decodeHolderInputMessage(rawInput: unknown): HolderInputMessage | null {
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
 * @type { HolderResizeMessage }
 * @description Resize the PTY dimensions
 */
export type HolderResizeMessage = {
  /**
   * @type { string }
   * @memberof HolderResizeMessage
   */
  type: string;
  /**
   * @description New width in columns
   * @type { number }
   * @memberof HolderResizeMessage
   */
  cols: number;
  /**
   * @description New height in rows
   * @type { number }
   * @memberof HolderResizeMessage
   */
  rows: number;
};

export function decodeHolderResizeMessage(rawInput: unknown): HolderResizeMessage | null {
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
 * @type { HolderKillMessage }
 * @description Send a signal to the PTY process
 */
export type HolderKillMessage = {
  /**
   * @type { string }
   * @memberof HolderKillMessage
   */
  type: string;
  /**
   * @description Signal name to send (default SIGTERM)
   * @type { string }
   * @memberof HolderKillMessage
   */
  signal: string | null;
};

export function decodeHolderKillMessage(rawInput: unknown): HolderKillMessage | null {
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

export type HolderServerMessage =
  | CHolderServerMessageHolderInputMessage
  | CHolderServerMessageHolderResizeMessage
  | CHolderServerMessageHolderKillMessage;

export function decodeHolderServerMessage(rawInput: unknown): HolderServerMessage | null {
  const result: HolderServerMessage | null =
    decodeCHolderServerMessageHolderInputMessage(rawInput) ??
    decodeCHolderServerMessageHolderResizeMessage(rawInput) ??
    decodeCHolderServerMessageHolderKillMessage(rawInput);

  return result;
}

export class CHolderServerMessageHolderInputMessage {
  data: HolderInputMessage;
  constructor(data: HolderInputMessage) {
    this.data = data;
  }
}

export function decodeCHolderServerMessageHolderInputMessage(
  rawInput: unknown
): CHolderServerMessageHolderInputMessage | null {
  const result = decodeHolderInputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderServerMessageHolderInputMessage(result);
}

export class CHolderServerMessageHolderResizeMessage {
  data: HolderResizeMessage;
  constructor(data: HolderResizeMessage) {
    this.data = data;
  }
}

export function decodeCHolderServerMessageHolderResizeMessage(
  rawInput: unknown
): CHolderServerMessageHolderResizeMessage | null {
  const result = decodeHolderResizeMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderServerMessageHolderResizeMessage(result);
}

export class CHolderServerMessageHolderKillMessage {
  data: HolderKillMessage;
  constructor(data: HolderKillMessage) {
    this.data = data;
  }
}

export function decodeCHolderServerMessageHolderKillMessage(
  rawInput: unknown
): CHolderServerMessageHolderKillMessage | null {
  const result = decodeHolderKillMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderServerMessageHolderKillMessage(result);
}

/**
 * @type { HolderInfoMessage }
 * @description Current holder state sent on connection
 */
export type HolderInfoMessage = {
  /**
   * @type { string }
   * @memberof HolderInfoMessage
   */
  type: string;
  /**
   * @description PTY child process ID
   * @type { number }
   * @memberof HolderInfoMessage
   */
  pid: number;
  /**
   * @description Whether the PTY process has exited
   * @type { boolean }
   * @memberof HolderInfoMessage
   */
  exited: boolean;
  /**
   * @description Exit code if process has exited
   * @type { number }
   * @memberof HolderInfoMessage
   */
  exitCode: number | null;
};

export function decodeHolderInfoMessage(rawInput: unknown): HolderInfoMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedExited = decodeBoolean(rawInput['exited']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);

    if (decodedType === null || decodedPid === null || decodedExited === null) {
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
 * @type { HolderScrollbackMessage }
 * @description Full scrollback replay sent on connection
 */
export type HolderScrollbackMessage = {
  /**
   * @type { string }
   * @memberof HolderScrollbackMessage
   */
  type: string;
  /**
   * @description Full scrollback buffer content
   * @type { string }
   * @memberof HolderScrollbackMessage
   */
  data: string;
};

export function decodeHolderScrollbackMessage(rawInput: unknown): HolderScrollbackMessage | null {
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
 * @type { HolderOutputMessage }
 * @description PTY output chunk during normal operation
 */
export type HolderOutputMessage = {
  /**
   * @type { string }
   * @memberof HolderOutputMessage
   */
  type: string;
  /**
   * @description Raw PTY output data
   * @type { string }
   * @memberof HolderOutputMessage
   */
  data: string;
};

export function decodeHolderOutputMessage(rawInput: unknown): HolderOutputMessage | null {
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
 * @type { HolderExitMessage }
 * @description PTY process has exited
 */
export type HolderExitMessage = {
  /**
   * @type { string }
   * @memberof HolderExitMessage
   */
  type: string;
  /**
   * @description Process exit code
   * @type { number }
   * @memberof HolderExitMessage
   */
  code: number;
  /**
   * @description Signal that caused exit
   * @type { string }
   * @memberof HolderExitMessage
   */
  signal: string | null;
};

export function decodeHolderExitMessage(rawInput: unknown): HolderExitMessage | null {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput['type']);
    const decodedCode = decodeNumber(rawInput['code']);
    const decodedSignal = decodeString(rawInput['signal']);

    if (decodedType === null || decodedCode === null) {
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
 * @type { HolderActivityMessage }
 * @description Terminal activity state change (active/idle)
 */
export type HolderActivityMessage = {
  /**
   * @type { string }
   * @memberof HolderActivityMessage
   */
  type: string;
  /**
   * @description Whether the terminal is currently producing output
   * @type { boolean }
   * @memberof HolderActivityMessage
   */
  active: boolean;
};

export function decodeHolderActivityMessage(rawInput: unknown): HolderActivityMessage | null {
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
 * @type { HolderCwdMessage }
 * @description Current working directory change detected via OSC 7
 */
export type HolderCwdMessage = {
  /**
   * @type { string }
   * @memberof HolderCwdMessage
   */
  type: string;
  /**
   * @description Absolute path of the new working directory
   * @type { string }
   * @memberof HolderCwdMessage
   */
  path: string;
};

export function decodeHolderCwdMessage(rawInput: unknown): HolderCwdMessage | null {
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

export type HolderClientMessage =
  | CHolderClientMessageHolderInfoMessage
  | CHolderClientMessageHolderScrollbackMessage
  | CHolderClientMessageHolderOutputMessage
  | CHolderClientMessageHolderExitMessage
  | CHolderClientMessageHolderActivityMessage
  | CHolderClientMessageHolderCwdMessage;

export function decodeHolderClientMessage(rawInput: unknown): HolderClientMessage | null {
  const result: HolderClientMessage | null =
    decodeCHolderClientMessageHolderInfoMessage(rawInput) ??
    decodeCHolderClientMessageHolderScrollbackMessage(rawInput) ??
    decodeCHolderClientMessageHolderOutputMessage(rawInput) ??
    decodeCHolderClientMessageHolderExitMessage(rawInput) ??
    decodeCHolderClientMessageHolderActivityMessage(rawInput) ??
    decodeCHolderClientMessageHolderCwdMessage(rawInput);

  return result;
}

export class CHolderClientMessageHolderInfoMessage {
  data: HolderInfoMessage;
  constructor(data: HolderInfoMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderInfoMessage(
  rawInput: unknown
): CHolderClientMessageHolderInfoMessage | null {
  const result = decodeHolderInfoMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderInfoMessage(result);
}

export class CHolderClientMessageHolderScrollbackMessage {
  data: HolderScrollbackMessage;
  constructor(data: HolderScrollbackMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderScrollbackMessage(
  rawInput: unknown
): CHolderClientMessageHolderScrollbackMessage | null {
  const result = decodeHolderScrollbackMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderScrollbackMessage(result);
}

export class CHolderClientMessageHolderOutputMessage {
  data: HolderOutputMessage;
  constructor(data: HolderOutputMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderOutputMessage(
  rawInput: unknown
): CHolderClientMessageHolderOutputMessage | null {
  const result = decodeHolderOutputMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderOutputMessage(result);
}

export class CHolderClientMessageHolderExitMessage {
  data: HolderExitMessage;
  constructor(data: HolderExitMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderExitMessage(
  rawInput: unknown
): CHolderClientMessageHolderExitMessage | null {
  const result = decodeHolderExitMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderExitMessage(result);
}

export class CHolderClientMessageHolderActivityMessage {
  data: HolderActivityMessage;
  constructor(data: HolderActivityMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderActivityMessage(
  rawInput: unknown
): CHolderClientMessageHolderActivityMessage | null {
  const result = decodeHolderActivityMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderActivityMessage(result);
}

export class CHolderClientMessageHolderCwdMessage {
  data: HolderCwdMessage;
  constructor(data: HolderCwdMessage) {
    this.data = data;
  }
}

export function decodeCHolderClientMessageHolderCwdMessage(
  rawInput: unknown
): CHolderClientMessageHolderCwdMessage | null {
  const result = decodeHolderCwdMessage(rawInput);
  if (result === null) {
    return null;
  }
  return new CHolderClientMessageHolderCwdMessage(result);
}
