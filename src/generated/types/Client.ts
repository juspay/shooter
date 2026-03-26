import { type SessionSource, decodeSessionSource } from './index';
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
 * @type { ClientTerminalStatus }
 * @description Whether a client-side terminal view is running or has exited
 */
export type ClientTerminalStatus = 'running' | 'exited';

export function decodeClientTerminalStatus(rawInput: unknown): ClientTerminalStatus | null {
  switch (rawInput) {
    case 'running':
    case 'exited':
      return rawInput;
  }
  return null;
}

export function _decodeClientTerminalStatus(rawInput: unknown): ClientTerminalStatus | undefined {
  switch (rawInput) {
    case 'running':
    case 'exited':
      return rawInput;
  }
  return;
}

/**
 * @type { SessionMessage }
 * @description A conversation message entry
 */
export type SessionMessage = {
  /**
   * @description Unique message identifier
   * @type { string }
   * @memberof SessionMessage
   */
  id: string;
  /**
   * @description Message type discriminator (e.g. "user", "assistant", "tool-use", "tool-result")
   * @type { string }
   * @memberof SessionMessage
   */
  type: string;
  /**
   * @description Primary text content of the message
   * @type { string }
   * @memberof SessionMessage
   */
  content: string;
  /**
   * @description ISO 8601 timestamp of the message
   * @type { string }
   * @memberof SessionMessage
   */
  timestamp: string;
  [keys: string]: unknown;
};

export function decodeSessionMessage(rawInput: unknown): SessionMessage | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedType = decodeString(rawInput['type']);
    const decodedContent = decodeString(rawInput['content']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);

    if (
      decodedId === null ||
      decodedType === null ||
      decodedContent === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      ...rawInput,
      id: decodedId,
      type: decodedType,
      content: decodedContent,
      timestamp: decodedTimestamp,
    };
  }
  return null;
}

/**
 * @type { TerminalListItem }
 * @description Terminal entry displayed in the /terminals list page
 */
export type TerminalListItem = {
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof TerminalListItem
   */
  id: string;
  /**
   * @description The command that was launched (e.g. "zsh", "claude")
   * @type { string }
   * @memberof TerminalListItem
   */
  command: string;
  /**
   * @description Command arguments passed at launch
   * @type { string[] }
   * @memberof TerminalListItem
   */
  args: string[];
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof TerminalListItem
   */
  cwd: string;
  /**
   * @description Current working directory detected via OSC 7, or null if not yet detected
   * @type { string }
   * @memberof TerminalListItem
   */
  currentCwd: string | null;
  /**
   * @description OS process ID of the terminal process
   * @type { number }
   * @memberof TerminalListItem
   */
  pid: number;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof TerminalListItem
   */
  createdAt: string;
  /**
   * @description ISO 8601 timestamp when the process exited, or null if still running
   * @type { string }
   * @memberof TerminalListItem
   */
  exitedAt: string | null;
  /**
   * @description Whether the terminal is running or has exited
   * @type { ClientTerminalStatus }
   * @memberof TerminalListItem
   */
  status: ClientTerminalStatus;
  /**
   * @description Process exit code, or null if still running
   * @type { number }
   * @memberof TerminalListItem
   */
  exitCode: number | null;
  /**
   * @description Whether the terminal is currently producing output
   * @type { boolean }
   * @memberof TerminalListItem
   */
  isActive: boolean | null;
  /**
   * @description Most recent output line for preview display, or null if none
   * @type { string }
   * @memberof TerminalListItem
   */
  lastOutput: string | null;
};

export function decodeTerminalListItem(rawInput: unknown): TerminalListItem | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedArgs = decodeArray(rawInput['args'], decodeString);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedCurrentCwd = decodeString(rawInput['currentCwd']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedStatus = decodeClientTerminalStatus(rawInput['status']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);
    const decodedIsActive = decodeBoolean(rawInput['isActive']);
    const decodedLastOutput = decodeString(rawInput['lastOutput']);

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
      id: decodedId,
      command: decodedCommand,
      args: decodedArgs,
      cwd: decodedCwd,
      currentCwd: decodedCurrentCwd,
      pid: decodedPid,
      createdAt: decodedCreatedAt,
      exitedAt: decodedExitedAt,
      status: decodedStatus,
      exitCode: decodedExitCode,
      isActive: decodedIsActive,
      lastOutput: decodedLastOutput,
    };
  }
  return null;
}

/**
 * @type { TerminalDetailView }
 * @description Terminal data used by the /terminals/[id] detail page
 */
export type TerminalDetailView = {
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof TerminalDetailView
   */
  id: string;
  /**
   * @description The command that was launched
   * @type { string }
   * @memberof TerminalDetailView
   */
  command: string;
  /**
   * @description Command arguments passed at launch
   * @type { string[] }
   * @memberof TerminalDetailView
   */
  args: string[];
  /**
   * @description Working directory the terminal was launched in
   * @type { string }
   * @memberof TerminalDetailView
   */
  cwd: string;
  /**
   * @description OS process ID of the terminal process
   * @type { number }
   * @memberof TerminalDetailView
   */
  pid: number;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof TerminalDetailView
   */
  createdAt: string;
  /**
   * @description ISO 8601 timestamp when the process exited, or null if still running
   * @type { string }
   * @memberof TerminalDetailView
   */
  exitedAt: string | null;
  /**
   * @description Whether the terminal is running or has exited
   * @type { ClientTerminalStatus }
   * @memberof TerminalDetailView
   */
  status: ClientTerminalStatus;
  /**
   * @description Process exit code, or null if still running
   * @type { number }
   * @memberof TerminalDetailView
   */
  exitCode: number | null;
  /**
   * @description Number of WebSocket clients currently attached to this terminal
   * @type { number }
   * @memberof TerminalDetailView
   */
  clientCount: number | null;
  /**
   * @description Most recent scrollback line for preview display, or null if empty
   * @type { string }
   * @memberof TerminalDetailView
   */
  lastOutput: string | null;
  /**
   * @description ISO 8601 timestamp when this response was generated
   * @type { string }
   * @memberof TerminalDetailView
   */
  timestamp: string | null;
  /**
   * @description WebSocket path for raw terminal I/O
   * @type { string }
   * @memberof TerminalDetailView
   */
  ws: string;
  /**
   * @description WebSocket path for structured session stream
   * @type { string }
   * @memberof TerminalDetailView
   */
  sessionWs: string;
};

export function decodeTerminalDetailView(rawInput: unknown): TerminalDetailView | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedCommand = decodeString(rawInput['command']);
    const decodedArgs = decodeArray(rawInput['args'], decodeString);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedPid = decodeNumber(rawInput['pid']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedStatus = decodeClientTerminalStatus(rawInput['status']);
    const decodedExitCode = decodeNumber(rawInput['exitCode']);
    const decodedClientCount = decodeNumber(rawInput['clientCount']);
    const decodedLastOutput = decodeString(rawInput['lastOutput']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);
    const decodedWs = decodeString(rawInput['ws']);
    const decodedSessionWs = decodeString(rawInput['sessionWs']);

    if (
      decodedId === null ||
      decodedCommand === null ||
      decodedArgs === null ||
      decodedCwd === null ||
      decodedPid === null ||
      decodedCreatedAt === null ||
      decodedStatus === null ||
      decodedWs === null ||
      decodedSessionWs === null
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
      clientCount: decodedClientCount,
      lastOutput: decodedLastOutput,
      timestamp: decodedTimestamp,
      ws: decodedWs,
      sessionWs: decodedSessionWs,
    };
  }
  return null;
}

/**
 * @type { SessionViewResponse }
 * @description API response shape for fetching a single session with its conversation messages
 */
export type SessionViewResponse = {
  /**
   * @description Session metadata
   * @type { SessionViewResponseSession }
   * @memberof SessionViewResponse
   */
  session: SessionViewResponseSession;
  /**
   * @description Conversation messages in the session
   * @type { SessionMessage[] }
   * @memberof SessionViewResponse
   */
  messages: SessionMessage[];
};

export function decodeSessionViewResponse(rawInput: unknown): SessionViewResponse | null {
  if (isJSON(rawInput)) {
    const decodedSession = decodeSessionViewResponseSession(rawInput['session']);
    const decodedMessages = decodeArray(rawInput['messages'], decodeSessionMessage);

    if (decodedSession === null || decodedMessages === null) {
      return null;
    }

    return {
      session: decodedSession,
      messages: decodedMessages,
    };
  }
  return null;
}

/**
 * @type { SessionViewResponseSession }
 * @description Session metadata
 */
export type SessionViewResponseSession = {
  /**
   * @description Unique session identifier
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  id: string;
  /**
   * @description Human-readable session title
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  title: string;
  /**
   * @description Absolute path to the project directory
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  projectPath: string;
  /**
   * @description Git branch active during the session
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  gitBranch: string;
  /**
   * @description Total number of messages in the session
   * @type { number }
   * @memberof SessionViewResponseSession
   */
  messageCount: number;
  /**
   * @description ISO 8601 timestamp when the session started
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  created: string;
  /**
   * @description ISO 8601 timestamp of the last session update
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  modified: string;
  /**
   * @description Brief summary of the session content
   * @type { string }
   * @memberof SessionViewResponseSession
   */
  summary: string;
  /**
   * @description Source tool that created the session
   * @type { SessionSource }
   * @memberof SessionViewResponseSession
   */
  source: SessionSource;
};

export function decodeSessionViewResponseSession(
  rawInput: unknown
): SessionViewResponseSession | null {
  if (isJSON(rawInput)) {
    const decodedId = decodeString(rawInput['id']);
    const decodedTitle = decodeString(rawInput['title']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);
    const decodedGitBranch = decodeString(rawInput['gitBranch']);
    const decodedMessageCount = decodeNumber(rawInput['messageCount']);
    const decodedCreated = decodeString(rawInput['created']);
    const decodedModified = decodeString(rawInput['modified']);
    const decodedSummary = decodeString(rawInput['summary']);
    const decodedSource = decodeSessionSource(rawInput['source']);

    if (
      decodedId === null ||
      decodedTitle === null ||
      decodedProjectPath === null ||
      decodedGitBranch === null ||
      decodedMessageCount === null ||
      decodedCreated === null ||
      decodedModified === null ||
      decodedSummary === null ||
      decodedSource === null
    ) {
      return null;
    }

    return {
      id: decodedId,
      title: decodedTitle,
      projectPath: decodedProjectPath,
      gitBranch: decodedGitBranch,
      messageCount: decodedMessageCount,
      created: decodedCreated,
      modified: decodedModified,
      summary: decodedSummary,
      source: decodedSource,
    };
  }
  return null;
}

/**
 * @type { ShortcutAction }
 * @description A keyboard shortcut definition for the terminal help overlay
 */
export type ShortcutAction = {
  /**
   * @description Key character that triggers the shortcut (e.g. "/", "k")
   * @type { string }
   * @memberof ShortcutAction
   */
  key: string;
  /**
   * @description Human-readable key combo label shown in the UI (e.g. "Cmd+/")
   * @type { string }
   * @memberof ShortcutAction
   */
  label: string;
  /**
   * @description What the shortcut does
   * @type { string }
   * @memberof ShortcutAction
   */
  description: string;
  /**
   * @description Whether the shift modifier is also required
   * @type { boolean }
   * @memberof ShortcutAction
   */
  shift: boolean | null;
};

export function decodeShortcutAction(rawInput: unknown): ShortcutAction | null {
  if (isJSON(rawInput)) {
    const decodedKey = decodeString(rawInput['key']);
    const decodedLabel = decodeString(rawInput['label']);
    const decodedDescription = decodeString(rawInput['description']);
    const decodedShift = decodeBoolean(rawInput['shift']);

    if (decodedKey === null || decodedLabel === null || decodedDescription === null) {
      return null;
    }

    return {
      key: decodedKey,
      label: decodedLabel,
      description: decodedDescription,
      shift: decodedShift,
    };
  }
  return null;
}

/**
 * @type { NativeBridgeConfig }
 * @description Configuration returned by ShooterBridge.getConfig() in the native app WebView
 */
export type NativeBridgeConfig = {
  /**
   * @description Base URL of the Shooter server
   * @type { string }
   * @memberof NativeBridgeConfig
   */
  serverUrl: string;
  /**
   * @description API key for authenticating with the server
   * @type { string }
   * @memberof NativeBridgeConfig
   */
  apiKey: string;
};

export function decodeNativeBridgeConfig(rawInput: unknown): NativeBridgeConfig | null {
  if (isJSON(rawInput)) {
    const decodedServerUrl = decodeString(rawInput['serverUrl']);
    const decodedApiKey = decodeString(rawInput['apiKey']);

    if (decodedServerUrl === null || decodedApiKey === null) {
      return null;
    }

    return {
      serverUrl: decodedServerUrl,
      apiKey: decodedApiKey,
    };
  }
  return null;
}
