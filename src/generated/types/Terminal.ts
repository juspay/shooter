import { _decodeArray, _decodeNumber, _decodeString , decodeArray, decodeNumber , decodeString, isJSON  } from 'type-decoder';

/**
 * @type { CreateTerminalRequest }
 * @description Request body for creating a new managed terminal session
 */
export interface CreateTerminalRequest {
  /**
   * @description Optional command arguments
   * @type { string[] }
   * @memberof CreateTerminalRequest
  */
  args: null | string[];
  /**
   * @description Terminal width in columns (default 80)
   * @type { number }
   * @memberof CreateTerminalRequest
  */
  cols: null | number;
    /**
   * @description The command to execute (e.g. "zsh", "claude", "opencode")
   * @type { string }
   * @memberof CreateTerminalRequest
  */
  command: string;
  /**
   * @description Working directory for the new terminal
   * @type { string }
   * @memberof CreateTerminalRequest
  */
  cwd: string;
    /**
   * @description Terminal height in rows (default 24)
   * @type { number }
   * @memberof CreateTerminalRequest
  */
  rows: null | number;
  }

/**
 * @type { CreateTerminalResponse }
 * @description Response after successfully creating a managed terminal session
 */
export interface CreateTerminalResponse {
  /**
   * @description The command that was launched
   * @type { string }
   * @memberof CreateTerminalResponse
  */
  command: string;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof CreateTerminalResponse
  */
  createdAt: string;
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof CreateTerminalResponse
  */
  cwd: string;
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
   * @description WebSocket path for structured session stream, or null if not an AI session
   * @type { string }
   * @memberof CreateTerminalResponse
  */
  sessionWs: null | string;
    /**
   * @description WebSocket path for raw terminal I/O (e.g. "/ws/terminal/term_a1b2c3")
   * @type { string }
   * @memberof CreateTerminalResponse
  */
  ws: string;
}

/**
 * @type { ManagedTerminalInfo }
 * @description Serializable info about a managed terminal session (excludes runtime handles like PTY, watchers, client sets)
 */
export interface ManagedTerminalInfo {
  /**
   * @description Command arguments passed at launch
   * @type { string[] }
   * @memberof ManagedTerminalInfo
  */
  args: string[];
  /**
   * @description The command that was launched (e.g. "zsh", "claude", "opencode")
   * @type { string }
   * @memberof ManagedTerminalInfo
  */
  command: string;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof ManagedTerminalInfo
  */
  createdAt: string;
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof ManagedTerminalInfo
  */
  cwd: string;
  /**
   * @description Process exit code (0 = success), or null if still running
   * @type { number }
   * @memberof ManagedTerminalInfo
  */
  exitCode: null | number;
  /**
   * @description ISO 8601 timestamp when the process exited, or null if still running
   * @type { string }
   * @memberof ManagedTerminalInfo
  */
  exitedAt: null | string;
  /**
   * @description Unique terminal identifier (e.g. "term_a1b2c3")
   * @type { string }
   * @memberof ManagedTerminalInfo
  */
  id: string;
    /**
   * @description OS process ID of the terminal process
   * @type { number }
   * @memberof ManagedTerminalInfo
  */
  pid: number;
  /**
   * @description Current lifecycle status of the terminal
   * @type { StatusEnum }
   * @memberof ManagedTerminalInfo
  */
  status: StatusEnum;
  }

/**
 * @type { RoleEnum }
 * @description Who sent the message
 */
export type RoleEnum =
  | 'assistant'
  | 'user'
;

/**
 * @type { StatusEnum }
 * @description Current lifecycle status of the terminal
 */
export type StatusEnum =
  | 'exited'
  | 'running'
;

/**
 * @type { StatusEnum }
 * @description Current execution status of the tool
 */
export type StatusEnum =
  | 'done'
  | 'error'
  | 'running'
;

/**
 * @type { StatusEnum }
 * @description Whether the tool completed successfully
 */
export type StatusEnum =
  | 'done'
  | 'error'
;


/**
 * @type { TerminalListResponse }
 * @description Response for listing all managed terminal sessions
 */
export interface TerminalListResponse {
  /**
   * @description Total number of terminals in the list
   * @type { number }
   * @memberof TerminalListResponse
  */
  count: number;
  /**
   * @description Array of managed terminal info objects
   * @type { ManagedTerminalInfo[] }
   * @memberof TerminalListResponse
  */
  terminals: ManagedTerminalInfo[];
}

export type WsEvent =
  |       CWsEvent1
    |       CWsEvent2
    |       CWsEvent3
    |       CWsEvent4
    |       CWsEvent5
  ;


/**
 * @type { WsEvent1 }
 * @description A new AI session has started
 */
export interface WsEvent1 {
  /**
   * @description Project name or path
   * @type { string }
   * @memberof WsEvent1
  */
  project: string;
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof WsEvent1
  */
  sessionId: string;
  /**
   * @description Source tool that started the session (e.g. "claude-code", "opencode")
   * @type { string }
   * @memberof WsEvent1
  */
  source: string;
  /**
   * @type { string }
   * @memberof WsEvent1
  */
  type: string;
}

/**
 * @type { WsEvent2 }
 * @description An AI session has ended
 */
export interface WsEvent2 {
  /**
   * @description Session identifier that ended
   * @type { string }
   * @memberof WsEvent2
  */
  sessionId: string;
  /**
   * @description Optional summary of what happened in the session
   * @type { string }
   * @memberof WsEvent2
  */
  summary: null | string;
  /**
   * @type { string }
   * @memberof WsEvent2
  */
  type: string;
  }


/**
 * @type { WsEvent3 }
 * @description A permission request is awaiting approval
 */
export interface WsEvent3 {
  /**
   * @description Tool input that requires approval
   * @type { WsEvent3Input }
   * @memberof WsEvent3
  */
  input: WsEvent3Input;
  /**
   * @description Unique request identifier for the permission flow
   * @type { string }
   * @memberof WsEvent3
  */
  requestId: string;
  /**
   * @description Tool requesting permission (e.g. "Bash", "Edit")
   * @type { string }
   * @memberof WsEvent3
  */
  tool: string;
  /**
   * @type { string }
   * @memberof WsEvent3
  */
  type: string;
}

/**
 * @type { WsEvent3Input }
 * @description Tool input that requires approval
 */
export type WsEvent3Input = Record<string, unknown>;


/**
 * @type { WsEvent4 }
 * @description A new managed terminal has been created
 */
export interface WsEvent4 {
  /**
   * @description Command that was launched
   * @type { string }
   * @memberof WsEvent4
  */
  command: string;
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof WsEvent4
  */
  terminalId: string;
  /**
   * @type { string }
   * @memberof WsEvent4
  */
  type: string;
}

/**
 * @type { WsEvent5 }
 * @description A managed terminal process has exited
 */
export interface WsEvent5 {
  /**
   * @description Process exit code
   * @type { number }
   * @memberof WsEvent5
  */
  code: number;
  /**
   * @description Terminal identifier that exited
   * @type { string }
   * @memberof WsEvent5
  */
  terminalId: string;
  /**
   * @type { string }
   * @memberof WsEvent5
  */
  type: string;
}


export type WsSessionMessage =
  |       CWsSessionMessage1
    |       CWsSessionMessage2
    |       CWsSessionMessage3
  ;

/**
 * @type { WsSessionMessage1 }
 * @description Subscribe to a live AI session stream
 */
export interface WsSessionMessage1 {
  /**
   * @description Session ID to subscribe to
   * @type { string }
   * @memberof WsSessionMessage1
  */
  sessionId: string;
  /**
   * @type { string }
   * @memberof WsSessionMessage1
  */
  type: string;
}




/**
 * @type { WsSessionMessage2 }
 * @description Send text input to the AI session (writes to PTY stdin with newline)
 */
export interface WsSessionMessage2 {
  /**
   * @description Text to send to the AI session
   * @type { string }
   * @memberof WsSessionMessage2
  */
  text: string;
  /**
   * @type { string }
   * @memberof WsSessionMessage2
  */
  type: string;
}

/**
 * @type { WsSessionMessage3 }
 * @description Cancel the current AI operation (sends SIGINT to PTY)
 */
export interface WsSessionMessage3 {
  /**
   * @type { string }
   * @memberof WsSessionMessage3
  */
  type: string;
}



export type WsSessionOutput =
  |       CWsSessionOutput1
    |       CWsSessionOutput2
    |       CWsSessionOutput3
    |       CWsSessionOutput4
    |       CWsSessionOutput5
    |       CWsSessionOutput6
  ;

/**
 * @type { WsSessionOutput1 }
 * @description Full conversation history sent on connect
 */
export interface WsSessionOutput1 {
  /**
   * @description All session messages from the beginning up to the current point
   * @type { messagesItem[] }
   * @memberof WsSessionOutput1
  */
  messages: messagesItem[];
  /**
   * @type { string }
   * @memberof WsSessionOutput1
  */
  type: string;
}



/**
 * @type { WsSessionOutput2 }
 * @description A new conversation message (user or assistant)
 */
export interface WsSessionOutput2 {
  /**
   * @description Message content blocks
   * @type { contentItem[] }
   * @memberof WsSessionOutput2
  */
  content: contentItem[];
  /**
   * @description Who sent the message
   * @type { RoleEnum }
   * @memberof WsSessionOutput2
  */
  role: RoleEnum;
  /**
   * @description ISO 8601 timestamp of the message
   * @type { string }
   * @memberof WsSessionOutput2
  */
  timestamp: string;
  /**
   * @type { string }
   * @memberof WsSessionOutput2
  */
  type: string;
}

/**
 * @type { WsSessionOutput3 }
 * @description A tool invocation by the AI assistant
 */
export interface WsSessionOutput3 {
  /**
   * @description Tool input parameters
   * @type { WsSessionOutput3Input }
   * @memberof WsSessionOutput3
  */
  input: WsSessionOutput3Input;
  /**
   * @description Tool name (e.g. "Edit", "Bash", "Read")
   * @type { string }
   * @memberof WsSessionOutput3
  */
  name: string;
  /**
   * @description Current execution status of the tool
   * @type { StatusEnum }
   * @memberof WsSessionOutput3
  */
  status: StatusEnum;
  /**
   * @type { string }
   * @memberof WsSessionOutput3
  */
  type: string;
}



/**
 * @type { WsSessionOutput3Input }
 * @description Tool input parameters
 */
export type WsSessionOutput3Input = Record<string, unknown>;

/**
 * @type { WsSessionOutput4 }
 * @description Result from a completed tool invocation
 */
export interface WsSessionOutput4 {
  /**
   * @description Tool use ID this result corresponds to
   * @type { string }
   * @memberof WsSessionOutput4
  */
  id: string;
  /**
   * @description Tool output text
   * @type { string }
   * @memberof WsSessionOutput4
  */
  output: string;
  /**
   * @description Whether the tool completed successfully
   * @type { StatusEnum }
   * @memberof WsSessionOutput4
  */
  status: StatusEnum;
  /**
   * @type { string }
   * @memberof WsSessionOutput4
  */
  type: string;
}



/**
 * @type { WsSessionOutput5 }
 * @description AI thinking/reasoning block (extended thinking)
 */
export interface WsSessionOutput5 {
  /**
   * @description Thinking content text
   * @type { string }
   * @memberof WsSessionOutput5
  */
  text: string;
  /**
   * @type { string }
   * @memberof WsSessionOutput5
  */
  type: string;
}

/**
 * @type { WsSessionOutput6 }
 * @description Session has ended (process exited or session file closed)
 */
export interface WsSessionOutput6 {
  /**
   * @type { string }
   * @memberof WsSessionOutput6
  */
  type: string;
}



/**
 * @type { WsStatusResponse }
 * @description Response indicating how many WebSocket clients are currently connected
 */
export interface WsStatusResponse {
  /**
   * @description Number of active WebSocket connections across all channels
   * @type { number }
   * @memberof WsStatusResponse
  */
  connectedClients: number;
}

export type WsTerminalMessage =
  |       CWsTerminalMessage1
    |       CWsTerminalMessage2
    |       CWsTerminalMessage3
  ;


/**
 * @type { WsTerminalMessage1 }
 * @description Send keyboard input to the terminal PTY
 */
export interface WsTerminalMessage1 {
  /**
   * @description Raw terminal input data (keystrokes, pasted text)
   * @type { string }
   * @memberof WsTerminalMessage1
  */
  data: string;
  /**
   * @type { string }
   * @memberof WsTerminalMessage1
  */
  type: string;
}

/**
 * @type { WsTerminalMessage2 }
 * @description Resize the terminal PTY dimensions
 */
export interface WsTerminalMessage2 {
  /**
   * @description New terminal width in columns
   * @type { number }
   * @memberof WsTerminalMessage2
  */
  cols: number;
  /**
   * @description New terminal height in rows
   * @type { number }
   * @memberof WsTerminalMessage2
  */
  rows: number;
  /**
   * @type { string }
   * @memberof WsTerminalMessage2
  */
  type: string;
}




/**
 * @type { WsTerminalMessage3 }
 * @description Send a signal to the terminal process
 */
export interface WsTerminalMessage3 {
  /**
   * @description Signal name to send (e.g. "SIGINT", "SIGTERM", "SIGTSTP")
   * @type { string }
   * @memberof WsTerminalMessage3
  */
  signal: string;
  /**
   * @type { string }
   * @memberof WsTerminalMessage3
  */
  type: string;
}

export type WsTerminalOutput =
  |       CWsTerminalOutput1
    |       CWsTerminalOutput2
    |       CWsTerminalOutput3
    |       CWsTerminalOutput4
  ;



/**
 * @type { WsTerminalOutput1 }
 * @description Terminal output data from the PTY
 */
export interface WsTerminalOutput1 {
  /**
   * @description Raw terminal output data
   * @type { string }
   * @memberof WsTerminalOutput1
  */
  data: string;
  /**
   * @type { string }
   * @memberof WsTerminalOutput1
  */
  type: string;
}

/**
 * @type { WsTerminalOutput2 }
 * @description Terminal process has exited
 */
export interface WsTerminalOutput2 {
  /**
   * @description Process exit code
   * @type { number }
   * @memberof WsTerminalOutput2
  */
  code: number;
  /**
   * @description Signal that caused the exit, or null if exited normally
   * @type { string }
   * @memberof WsTerminalOutput2
  */
  signal: null | string;
  /**
   * @type { string }
   * @memberof WsTerminalOutput2
  */
  type: string;
  }



/**
 * @type { WsTerminalOutput3 }
 * @description Scrollback chunk sent on reconnection
 */
export interface WsTerminalOutput3 {
  /**
   * @description 1-based chunk index
   * @type { number }
   * @memberof WsTerminalOutput3
  */
  chunk: number;
  /**
   * @description Scrollback content for this chunk (max 50KB)
   * @type { string }
   * @memberof WsTerminalOutput3
  */
  data: string;
  /**
   * @description Total number of scrollback chunks
   * @type { number }
   * @memberof WsTerminalOutput3
  */
  total: number;
  /**
   * @type { string }
   * @memberof WsTerminalOutput3
  */
  type: string;
}

/**
 * @type { WsTerminalOutput4 }
 * @description Error message from the terminal server
 */
export interface WsTerminalOutput4 {
  /**
   * @description Human-readable error message
   * @type { string }
   * @memberof WsTerminalOutput4
  */
  message: string;
  /**
   * @type { string }
   * @memberof WsTerminalOutput4
  */
  type: string;
}



/**
 * @type { WsTicketResponse }
 * @description Response containing a short-lived ticket for WebSocket authentication
 */
export interface WsTicketResponse {
  /**
   * @description ISO 8601 timestamp when the ticket expires
   * @type { string }
   * @memberof WsTicketResponse
  */
  expiresAt: string;
  /**
   * @description Single-use random ticket string (expires in 30 seconds)
   * @type { string }
   * @memberof WsTicketResponse
  */
  ticket: string;
}

export class CWsEventWsEvent1 {
  data: WsEvent1;
  constructor(data: WsEvent1) {
    this.data = data;
  }
}



export class CWsEventWsEvent2 {
  data: WsEvent2;
  constructor(data: WsEvent2) {
    this.data = data;
  }
}

export class CWsEventWsEvent3 {
  data: WsEvent3;
  constructor(data: WsEvent3) {
    this.data = data;
  }
}



export class CWsEventWsEvent4 {
  data: WsEvent4;
  constructor(data: WsEvent4) {
    this.data = data;
  }
}

export class CWsEventWsEvent5 {
  data: WsEvent5;
  constructor(data: WsEvent5) {
    this.data = data;
  }
}



export class CWsSessionMessageWsSessionMessage1 {
  data: WsSessionMessage1;
  constructor(data: WsSessionMessage1) {
    this.data = data;
  }
}

export class CWsSessionMessageWsSessionMessage2 {
  data: WsSessionMessage2;
  constructor(data: WsSessionMessage2) {
    this.data = data;
  }
}



export class CWsSessionMessageWsSessionMessage3 {
  data: WsSessionMessage3;
  constructor(data: WsSessionMessage3) {
    this.data = data;
  }
}

export class CWsSessionOutputWsSessionOutput1 {
  data: WsSessionOutput1;
  constructor(data: WsSessionOutput1) {
    this.data = data;
  }
}


export class CWsSessionOutputWsSessionOutput2 {
  data: WsSessionOutput2;
  constructor(data: WsSessionOutput2) {
    this.data = data;
  }
}

export class CWsSessionOutputWsSessionOutput3 {
  data: WsSessionOutput3;
  constructor(data: WsSessionOutput3) {
    this.data = data;
  }
}




export class CWsSessionOutputWsSessionOutput4 {
  data: WsSessionOutput4;
  constructor(data: WsSessionOutput4) {
    this.data = data;
  }
}

export class CWsSessionOutputWsSessionOutput5 {
  data: WsSessionOutput5;
  constructor(data: WsSessionOutput5) {
    this.data = data;
  }
}



export class CWsSessionOutputWsSessionOutput6 {
  data: WsSessionOutput6;
  constructor(data: WsSessionOutput6) {
    this.data = data;
  }
}

export class CWsTerminalMessageWsTerminalMessage1 {
  data: WsTerminalMessage1;
  constructor(data: WsTerminalMessage1) {
    this.data = data;
  }
}



export class CWsTerminalMessageWsTerminalMessage2 {
  data: WsTerminalMessage2;
  constructor(data: WsTerminalMessage2) {
    this.data = data;
  }
}

export class CWsTerminalMessageWsTerminalMessage3 {
  data: WsTerminalMessage3;
  constructor(data: WsTerminalMessage3) {
    this.data = data;
  }
}



export class CWsTerminalOutputWsTerminalOutput1 {
  data: WsTerminalOutput1;
  constructor(data: WsTerminalOutput1) {
    this.data = data;
  }
}

export class CWsTerminalOutputWsTerminalOutput2 {
  data: WsTerminalOutput2;
  constructor(data: WsTerminalOutput2) {
    this.data = data;
  }
}



export class CWsTerminalOutputWsTerminalOutput3 {
  data: WsTerminalOutput3;
  constructor(data: WsTerminalOutput3) {
    this.data = data;
  }
}

export class CWsTerminalOutputWsTerminalOutput4 {
  data: WsTerminalOutput4;
  constructor(data: WsTerminalOutput4) {
    this.data = data;
  }
}



export function _decodeRoleEnum(rawInput: unknown): RoleEnum | undefined {
  switch (rawInput) {
    case 'assistant':
    case 'user':
    return rawInput;
  }
  return;
}

export function _decodeStatusEnum(rawInput: unknown): StatusEnum | undefined {
  switch (rawInput) {
    case 'exited':
    case 'running':
    return rawInput;
  }
  return;
}


export function _decodeStatusEnum(rawInput: unknown): StatusEnum | undefined {
  switch (rawInput) {
    case 'done':
    case 'error':
    case 'running':
    return rawInput;
  }
  return;
}

export function _decodeStatusEnum(rawInput: unknown): StatusEnum | undefined {
  switch (rawInput) {
    case 'done':
    case 'error':
    return rawInput;
  }
  return;
}




export function decodeCreateTerminalRequest(rawInput: unknown): CreateTerminalRequest | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput.command);
    const decodedArgs = decodeArray(rawInput.args, decodeString);
    const decodedCwd = decodeString(rawInput.cwd);
    const decodedCols = decodeNumber(rawInput.cols);
    const decodedRows = decodeNumber(rawInput.rows);

    if (
      decodedCommand === null ||
      decodedCwd === null
    ) {
      return null;
    }

    return {
      args: decodedArgs,
      cols: decodedCols,
      command: decodedCommand,
      cwd: decodedCwd,
      rows: decodedRows
    };
  }
  return null;
}

export function decodeCreateTerminalResponse(rawInput: unknown): CreateTerminalResponse | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput.id);
    const decodedPid = decodeNumber(rawInput.pid);
    const decodedCommand = decodeString(rawInput.command);
    const decodedCwd = decodeString(rawInput.cwd);
    const decodedWs = decodeString(rawInput.ws);
    const decodedSessionWs = decodeString(rawInput.sessionWs);
    const decodedCreatedAt = decodeString(rawInput.createdAt);

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
      command: decodedCommand,
      createdAt: decodedCreatedAt,
      cwd: decodedCwd,
      id: decodedId,
      pid: decodedPid,
      sessionWs: decodedSessionWs,
      ws: decodedWs
    };
  }
  return null;
}



export function decodeCWsEvent1(rawInput: unknown) {
  const result = decodeWsEvent1(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsEvent1(result);
}

export function decodeCWsEvent2(rawInput: unknown) {
  const result = decodeWsEvent2(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsEvent2(result);
}



export function decodeCWsEvent3(rawInput: unknown) {
  const result = decodeWsEvent3(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsEvent3(result);
}

export function decodeCWsEvent4(rawInput: unknown) {
  const result = decodeWsEvent4(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsEvent4(result);
}

export function decodeCWsEvent5(rawInput: unknown) {
  const result = decodeWsEvent5(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsEventWsEvent5(result);
}

export function decodeCWsSessionMessage1(rawInput: unknown) {
  const result = decodeWsSessionMessage1(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionMessage1(result);
}

export function decodeCWsSessionMessage2(rawInput: unknown) {
  const result = decodeWsSessionMessage2(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionMessage2(result);
}


export function decodeCWsSessionMessage3(rawInput: unknown) {
  const result = decodeWsSessionMessage3(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionMessageWsSessionMessage3(result);
}

export function decodeCWsSessionOutput1(rawInput: unknown) {
  const result = decodeWsSessionOutput1(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput1(result);
}



export function decodeCWsSessionOutput2(rawInput: unknown) {
  const result = decodeWsSessionOutput2(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput2(result);
}

export function decodeCWsSessionOutput3(rawInput: unknown) {
  const result = decodeWsSessionOutput3(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput3(result);
}

export function decodeCWsSessionOutput4(rawInput: unknown) {
  const result = decodeWsSessionOutput4(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput4(result);
}

export function decodeCWsSessionOutput5(rawInput: unknown) {
  const result = decodeWsSessionOutput5(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput5(result);
}

export function decodeCWsSessionOutput6(rawInput: unknown) {
  const result = decodeWsSessionOutput6(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsSessionOutputWsSessionOutput6(result);
}

export function decodeCWsTerminalMessage1(rawInput: unknown) {
  const result = decodeWsTerminalMessage1(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalMessage1(result);
}

export function decodeCWsTerminalMessage2(rawInput: unknown) {
  const result = decodeWsTerminalMessage2(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalMessage2(result);
}


export function decodeCWsTerminalMessage3(rawInput: unknown) {
  const result = decodeWsTerminalMessage3(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalMessageWsTerminalMessage3(result);
}

export function decodeCWsTerminalOutput1(rawInput: unknown) {
  const result = decodeWsTerminalOutput1(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutput1(result);
}



export function decodeCWsTerminalOutput2(rawInput: unknown) {
  const result = decodeWsTerminalOutput2(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutput2(result);
}

export function decodeCWsTerminalOutput3(rawInput: unknown) {
  const result = decodeWsTerminalOutput3(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutput3(result);
}

export function decodeCWsTerminalOutput4(rawInput: unknown) {
  const result = decodeWsTerminalOutput4(rawInput);
  if (result === null) {
    return null;
  }
  return new CWsTerminalOutputWsTerminalOutput4(result);
}

export function decodeManagedTerminalInfo(rawInput: unknown): ManagedTerminalInfo | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput.id);
    const decodedCommand = decodeString(rawInput.command);
    const decodedArgs = decodeArray(rawInput.args, decodeString);
    const decodedCwd = decodeString(rawInput.cwd);
    const decodedPid = decodeNumber(rawInput.pid);
    const decodedCreatedAt = decodeString(rawInput.createdAt);
    const decodedExitedAt = decodeString(rawInput.exitedAt);
    const decodedStatus = decodeStatusEnum(rawInput.status);
    const decodedExitCode = decodeNumber(rawInput.exitCode);

    if (
      decodedId === null ||
      decodedCommand === null ||
      decodedArgs === null ||
      decodedCwd === null ||
      decodedPid === null ||
      decodedCreatedAt === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      args: decodedArgs,
      command: decodedCommand,
      createdAt: decodedCreatedAt,
      cwd: decodedCwd,
      exitCode: decodedExitCode,
      exitedAt: decodedExitedAt,
      id: decodedId,
      pid: decodedPid,
      status: decodedStatus
    };
  }
  return null;
}

export function decodeRoleEnum(rawInput: unknown): null | RoleEnum {
  switch (rawInput) {
    case 'assistant':
    case 'user':
     return rawInput;
  }
  return null;
}


export function decodeStatusEnum(rawInput: unknown): null | StatusEnum {
  switch (rawInput) {
    case 'exited':
    case 'running':
     return rawInput;
  }
  return null;
}

export function decodeStatusEnum(rawInput: unknown): null | StatusEnum {
  switch (rawInput) {
    case 'done':
    case 'error':
    case 'running':
     return rawInput;
  }
  return null;
}



export function decodeStatusEnum(rawInput: unknown): null | StatusEnum {
  switch (rawInput) {
    case 'done':
    case 'error':
     return rawInput;
  }
  return null;
}

export function decodeTerminalListResponse(rawInput: unknown): null | TerminalListResponse {
  if (isJSON(rawInput)) {
    const decodedTerminals = decodeArray(rawInput.terminals, decodeManagedTerminalInfo);
    const decodedCount = decodeNumber(rawInput.count);

    if (
      decodedTerminals === null ||
      decodedCount === null
    ) {
      return null;
    }

    return {
      count: decodedCount,
      terminals: decodedTerminals
    };
  }
  return null;
}



export function decodeWsEvent(rawInput: unknown): null | WsEvent {
  const result: null | WsEvent =
    decodeCWsEvent1(rawInput)
??
      decodeCWsEvent2(rawInput)
??
      decodeCWsEvent3(rawInput)
??
      decodeCWsEvent4(rawInput)
??
      decodeCWsEvent5(rawInput)

  ;
  return result;
}

export function decodeWsEvent1(rawInput: unknown): null | WsEvent1 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedSessionId = decodeString(rawInput.sessionId);
    const decodedProject = decodeString(rawInput.project);
    const decodedSource = decodeString(rawInput.source);

    if (
      decodedType === null ||
      decodedSessionId === null ||
      decodedProject === null ||
      decodedSource === null
    ) {
      return null;
    }

    return {
      project: decodedProject,
      sessionId: decodedSessionId,
      source: decodedSource,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsEvent2(rawInput: unknown): null | WsEvent2 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedSessionId = decodeString(rawInput.sessionId);
    const decodedSummary = decodeString(rawInput.summary);

    if (
      decodedType === null ||
      decodedSessionId === null
    ) {
      return null;
    }

    return {
      sessionId: decodedSessionId,
      summary: decodedSummary,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsEvent3(rawInput: unknown): null | WsEvent3 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedRequestId = decodeString(rawInput.requestId);
    const decodedTool = decodeString(rawInput.tool);
    const decodedInput = decodeWsEvent3Input(rawInput.input);

    if (
      decodedType === null ||
      decodedRequestId === null ||
      decodedTool === null ||
      decodedInput === null
    ) {
      return null;
    }

    return {
      input: decodedInput,
      requestId: decodedRequestId,
      tool: decodedTool,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsEvent3Input(rawInput: unknown): null | WsEvent3Input {
  if (isJSON(rawInput)) {


    return {
      ...rawInput,
    };
  }
  return null;
}

export function decodeWsEvent4(rawInput: unknown): null | WsEvent4 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedTerminalId = decodeString(rawInput.terminalId);
    const decodedCommand = decodeString(rawInput.command);

    if (
      decodedType === null ||
      decodedTerminalId === null ||
      decodedCommand === null
    ) {
      return null;
    }

    return {
      command: decodedCommand,
      terminalId: decodedTerminalId,
      type: decodedType
    };
  }
  return null;
}


export function decodeWsEvent5(rawInput: unknown): null | WsEvent5 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedTerminalId = decodeString(rawInput.terminalId);
    const decodedCode = decodeNumber(rawInput.code);

    if (
      decodedType === null ||
      decodedTerminalId === null ||
      decodedCode === null
    ) {
      return null;
    }

    return {
      code: decodedCode,
      terminalId: decodedTerminalId,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionMessage(rawInput: unknown): null | WsSessionMessage {
  const result: null | WsSessionMessage =
    decodeCWsSessionMessage1(rawInput)
??
      decodeCWsSessionMessage2(rawInput)
??
      decodeCWsSessionMessage3(rawInput)

  ;
  return result;
}




export function decodeWsSessionMessage1(rawInput: unknown): null | WsSessionMessage1 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedSessionId = decodeString(rawInput.sessionId);

    if (
      decodedType === null ||
      decodedSessionId === null
    ) {
      return null;
    }

    return {
      sessionId: decodedSessionId,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionMessage2(rawInput: unknown): null | WsSessionMessage2 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedText = decodeString(rawInput.text);

    if (
      decodedType === null ||
      decodedText === null
    ) {
      return null;
    }

    return {
      text: decodedText,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsSessionMessage3(rawInput: unknown): null | WsSessionMessage3 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);

    if (
      decodedType === null
    ) {
      return null;
    }

    return {
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionOutput(rawInput: unknown): null | WsSessionOutput {
  const result: null | WsSessionOutput =
    decodeCWsSessionOutput1(rawInput)
??
      decodeCWsSessionOutput2(rawInput)
??
      decodeCWsSessionOutput3(rawInput)
??
      decodeCWsSessionOutput4(rawInput)
??
      decodeCWsSessionOutput5(rawInput)
??
      decodeCWsSessionOutput6(rawInput)

  ;
  return result;
}



export function decodeWsSessionOutput1(rawInput: unknown): null | WsSessionOutput1 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedMessages = decodeArray(rawInput.messages, decodeMessagesItem);

    if (
      decodedType === null ||
      decodedMessages === null
    ) {
      return null;
    }

    return {
      messages: decodedMessages,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionOutput2(rawInput: unknown): null | WsSessionOutput2 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedRole = decodeRoleEnum(rawInput.role);
    const decodedContent = decodeArray(rawInput.content, decodeContentItem);
    const decodedTimestamp = decodeString(rawInput.timestamp);

    if (
      decodedType === null ||
      decodedRole === null ||
      decodedContent === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      content: decodedContent,
      role: decodedRole,
      timestamp: decodedTimestamp,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsSessionOutput3(rawInput: unknown): null | WsSessionOutput3 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedName = decodeString(rawInput.name);
    const decodedInput = decodeWsSessionOutput3Input(rawInput.input);
    const decodedStatus = decodeStatusEnum(rawInput.status);

    if (
      decodedType === null ||
      decodedName === null ||
      decodedInput === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      input: decodedInput,
      name: decodedName,
      status: decodedStatus,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionOutput3Input(rawInput: unknown): null | WsSessionOutput3Input {
  if (isJSON(rawInput)) {


    return {
      ...rawInput,
    };
  }
  return null;
}



export function decodeWsSessionOutput4(rawInput: unknown): null | WsSessionOutput4 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedId = decodeString(rawInput.id);
    const decodedOutput = decodeString(rawInput.output);
    const decodedStatus = decodeStatusEnum(rawInput.status);

    if (
      decodedType === null ||
      decodedId === null ||
      decodedOutput === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      output: decodedOutput,
      status: decodedStatus,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionOutput5(rawInput: unknown): null | WsSessionOutput5 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedText = decodeString(rawInput.text);

    if (
      decodedType === null ||
      decodedText === null
    ) {
      return null;
    }

    return {
      text: decodedText,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsSessionOutput6(rawInput: unknown): null | WsSessionOutput6 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);

    if (
      decodedType === null
    ) {
      return null;
    }

    return {
      type: decodedType
    };
  }
  return null;
}

export function decodeWsStatusResponse(rawInput: unknown): null | WsStatusResponse {
  if (isJSON(rawInput)) {
    const decodedConnectedClients = decodeNumber(rawInput.connectedClients);

    if (
      decodedConnectedClients === null
    ) {
      return null;
    }

    return {
      connectedClients: decodedConnectedClients
    };
  }
  return null;
}



export function decodeWsTerminalMessage(rawInput: unknown): null | WsTerminalMessage {
  const result: null | WsTerminalMessage =
    decodeCWsTerminalMessage1(rawInput)
??
      decodeCWsTerminalMessage2(rawInput)
??
      decodeCWsTerminalMessage3(rawInput)

  ;
  return result;
}

export function decodeWsTerminalMessage1(rawInput: unknown): null | WsTerminalMessage1 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedData = decodeString(rawInput.data);

    if (
      decodedType === null ||
      decodedData === null
    ) {
      return null;
    }

    return {
      data: decodedData,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsTerminalMessage2(rawInput: unknown): null | WsTerminalMessage2 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedCols = decodeNumber(rawInput.cols);
    const decodedRows = decodeNumber(rawInput.rows);

    if (
      decodedType === null ||
      decodedCols === null ||
      decodedRows === null
    ) {
      return null;
    }

    return {
      cols: decodedCols,
      rows: decodedRows,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsTerminalMessage3(rawInput: unknown): null | WsTerminalMessage3 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedSignal = decodeString(rawInput.signal);

    if (
      decodedType === null ||
      decodedSignal === null
    ) {
      return null;
    }

    return {
      signal: decodedSignal,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsTerminalOutput(rawInput: unknown): null | WsTerminalOutput {
  const result: null | WsTerminalOutput =
    decodeCWsTerminalOutput1(rawInput)
??
      decodeCWsTerminalOutput2(rawInput)
??
      decodeCWsTerminalOutput3(rawInput)
??
      decodeCWsTerminalOutput4(rawInput)

  ;
  return result;
}

export function decodeWsTerminalOutput1(rawInput: unknown): null | WsTerminalOutput1 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedData = decodeString(rawInput.data);

    if (
      decodedType === null ||
      decodedData === null
    ) {
      return null;
    }

    return {
      data: decodedData,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsTerminalOutput2(rawInput: unknown): null | WsTerminalOutput2 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedCode = decodeNumber(rawInput.code);
    const decodedSignal = decodeString(rawInput.signal);

    if (
      decodedType === null ||
      decodedCode === null
    ) {
      return null;
    }

    return {
      code: decodedCode,
      signal: decodedSignal,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsTerminalOutput3(rawInput: unknown): null | WsTerminalOutput3 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedData = decodeString(rawInput.data);
    const decodedChunk = decodeNumber(rawInput.chunk);
    const decodedTotal = decodeNumber(rawInput.total);

    if (
      decodedType === null ||
      decodedData === null ||
      decodedChunk === null ||
      decodedTotal === null
    ) {
      return null;
    }

    return {
      chunk: decodedChunk,
      data: decodedData,
      total: decodedTotal,
      type: decodedType
    };
  }
  return null;
}



export function decodeWsTerminalOutput4(rawInput: unknown): null | WsTerminalOutput4 {
  if (isJSON(rawInput)) {
    const decodedType = decodeString(rawInput.type);
    const decodedMessage = decodeString(rawInput.message);

    if (
      decodedType === null ||
      decodedMessage === null
    ) {
      return null;
    }

    return {
      message: decodedMessage,
      type: decodedType
    };
  }
  return null;
}

export function decodeWsTicketResponse(rawInput: unknown): null | WsTicketResponse {
  if (isJSON(rawInput)) {
    const decodedTicket = decodeString(rawInput.ticket);
    const decodedExpiresAt = decodeString(rawInput.expiresAt);

    if (
      decodedTicket === null ||
      decodedExpiresAt === null
    ) {
      return null;
    }

    return {
      expiresAt: decodedExpiresAt,
      ticket: decodedTicket
    };
  }
  return null;
}




