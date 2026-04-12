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
 * @type { SessionStatus }
 * @description Lifecycle status of a dashboard session card
 */
export type SessionStatus = 'running' | 'idle' | 'exited' | 'error';

export function decodeSessionStatus(rawInput: unknown): SessionStatus | null {
  switch (rawInput) {
    case 'running':
    case 'idle':
    case 'exited':
    case 'error':
      return rawInput;
  }
  return null;
}

export function _decodeSessionStatus(rawInput: unknown): SessionStatus | undefined {
  switch (rawInput) {
    case 'running':
    case 'idle':
    case 'exited':
    case 'error':
      return rawInput;
  }
  return;
}

/**
 * @type { SessionEvent }
 * @description A single event recorded from the /ws/events WebSocket channel for a session
 */
export type SessionEvent = {
  /**
   * @description Raw event payload received from the server
   * @type { SessionEventData }
   * @memberof SessionEvent
   */
  data: SessionEventData;
  /**
   * @description Unique event identifier (e.g. "evt-1", "evt-42")
   * @type { string }
   * @memberof SessionEvent
   */
  id: string;
  /**
   * @description Whether this event has been included in an AI summary
   * @type { boolean }
   * @memberof SessionEvent
   */
  summarized: boolean;
  /**
   * @description Terminal identifier this event belongs to
   * @type { string }
   * @memberof SessionEvent
   */
  terminalId: string;
  /**
   * @description ISO 8601 timestamp of the event
   * @type { string }
   * @memberof SessionEvent
   */
  timestamp: string;
  /**
   * @description Event type discriminator (e.g. "tool-started", "tool-failed", "agent-idle")
   * @type { string }
   * @memberof SessionEvent
   */
  type: string;
};

export function decodeSessionEvent(rawInput: unknown): SessionEvent | null {
  if (isJSON(rawInput)) {
    const decodedData = decodeSessionEventData(rawInput['data']);
    const decodedId = decodeString(rawInput['id']);
    const decodedSummarized = decodeBoolean(rawInput['summarized']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);
    const decodedType = decodeString(rawInput['type']);

    if (
      decodedData === null ||
      decodedId === null ||
      decodedSummarized === null ||
      decodedTerminalId === null ||
      decodedTimestamp === null ||
      decodedType === null
    ) {
      return null;
    }

    return {
      data: decodedData,
      id: decodedId,
      summarized: decodedSummarized,
      terminalId: decodedTerminalId,
      timestamp: decodedTimestamp,
      type: decodedType,
    };
  }
  return null;
}

/**
 * @type { SessionEventData }
 * @description Raw event payload received from the server
 */
export type SessionEventData = Record<string, unknown>;

export function decodeSessionEventData(rawInput: unknown): SessionEventData | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { SessionState }
 * @description Live state of one session card tracked by the dashboard store
 */
export type SessionState = {
  /**
   * @description The command running in the terminal (e.g. "claude", "opencode")
   * @type { string }
   * @memberof SessionState
   */
  command: string;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof SessionState
   */
  createdAt: string;
  /**
   * @description Working directory path of the terminal
   * @type { string }
   * @memberof SessionState
   */
  cwd: string;
  /**
   * @description Total number of error events accumulated in this session
   * @type { number }
   * @memberof SessionState
   */
  errorCount: number;
  /**
   * @description Total events received (including truncated ones beyond the ring buffer)
   * @type { number }
   * @memberof SessionState
   */
  eventCount: number;
  /**
   * @description Recent events ring buffer (capped at 100 entries)
   * @type { SessionEvent[] }
   * @memberof SessionState
   */
  events: SessionEvent[];
  /**
   * @description ISO 8601 timestamp when the terminal exited, or null if still running
   * @type { string }
   * @memberof SessionState
   */
  exitedAt: string | null;
  /**
   * @description What Claude is working on (extracted from first user message), or null if not yet known
   * @type { string }
   * @memberof SessionState
   */
  goal: string | null;
  /**
   * @description Whether an AI summary is currently being generated for this session
   * @type { boolean }
   * @memberof SessionState
   */
  isSummarizing: boolean;
  /**
   * @description Display name of the project (basename of cwd)
   * @type { string }
   * @memberof SessionState
   */
  projectName: string;
  /**
   * @description Full cwd path used as the project path
   * @type { string }
   * @memberof SessionState
   */
  projectPath: string;
  /**
   * @description Current lifecycle status of the session
   * @type { SessionStatus }
   * @memberof SessionState
   */
  status: SessionStatus;
  /**
   * @description Current AI-generated progress summary, or null if not yet summarized
   * @type { string }
   * @memberof SessionState
   */
  summary: string | null;
  /**
   * @description ISO 8601 timestamp when the summary was last updated, or null if never
   * @type { string }
   * @memberof SessionState
   */
  summaryUpdatedAt: string | null;
  /**
   * @description Unique terminal identifier (e.g. "term_a1b2c3")
   * @type { string }
   * @memberof SessionState
   */
  terminalId: string;
  /**
   * @description Total number of tool calls made in this session
   * @type { number }
   * @memberof SessionState
   */
  toolCallCount: number;
};

export function decodeSessionState(rawInput: unknown): SessionState | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput['command']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedErrorCount = decodeNumber(rawInput['errorCount']);
    const decodedEventCount = decodeNumber(rawInput['eventCount']);
    const decodedEvents = decodeArray(rawInput['events'], decodeSessionEvent);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedGoal = decodeString(rawInput['goal']);
    const decodedIsSummarizing = decodeBoolean(rawInput['isSummarizing']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);
    const decodedStatus = decodeSessionStatus(rawInput['status']);
    const decodedSummary = decodeString(rawInput['summary']);
    const decodedSummaryUpdatedAt = decodeString(rawInput['summaryUpdatedAt']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedToolCallCount = decodeNumber(rawInput['toolCallCount']);

    if (
      decodedCommand === null ||
      decodedCreatedAt === null ||
      decodedCwd === null ||
      decodedErrorCount === null ||
      decodedEventCount === null ||
      decodedEvents === null ||
      decodedIsSummarizing === null ||
      decodedProjectName === null ||
      decodedProjectPath === null ||
      decodedStatus === null ||
      decodedTerminalId === null ||
      decodedToolCallCount === null
    ) {
      return null;
    }

    return {
      command: decodedCommand,
      createdAt: decodedCreatedAt,
      cwd: decodedCwd,
      errorCount: decodedErrorCount,
      eventCount: decodedEventCount,
      events: decodedEvents,
      exitedAt: decodedExitedAt,
      goal: decodedGoal,
      isSummarizing: decodedIsSummarizing,
      projectName: decodedProjectName,
      projectPath: decodedProjectPath,
      status: decodedStatus,
      summary: decodedSummary,
      summaryUpdatedAt: decodedSummaryUpdatedAt,
      terminalId: decodedTerminalId,
      toolCallCount: decodedToolCallCount,
    };
  }
  return null;
}

/**
 * @type { DashboardCard }
 * @description A session card displayed on the home dashboard — extends SessionState with derived display fields
 */
export type DashboardCard = {
  /**
   * @description The command running in the terminal
   * @type { string }
   * @memberof DashboardCard
   */
  command: string;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof DashboardCard
   */
  createdAt: string;
  /**
   * @description Working directory path of the terminal
   * @type { string }
   * @memberof DashboardCard
   */
  cwd: string;
  /**
   * @description Milliseconds elapsed since createdAt (derived at render time)
   * @type { number }
   * @memberof DashboardCard
   */
  duration: number;
  /**
   * @description Total number of error events accumulated in this session
   * @type { number }
   * @memberof DashboardCard
   */
  errorCount: number;
  /**
   * @description Total events received (including truncated ones beyond the ring buffer)
   * @type { number }
   * @memberof DashboardCard
   */
  eventCount: number;
  /**
   * @description Recent events ring buffer (capped at 100 entries)
   * @type { SessionEvent[] }
   * @memberof DashboardCard
   */
  events: SessionEvent[];
  /**
   * @description ISO 8601 timestamp when the terminal exited, or null if still running
   * @type { string }
   * @memberof DashboardCard
   */
  exitedAt: string | null;
  /**
   * @description What Claude is working on, or null if not yet known
   * @type { string }
   * @memberof DashboardCard
   */
  goal: string | null;
  /**
   * @description Whether the session has received events within the last 30 seconds
   * @type { boolean }
   * @memberof DashboardCard
   */
  isActive: boolean;
  /**
   * @description Whether an AI summary is currently being generated
   * @type { boolean }
   * @memberof DashboardCard
   */
  isSummarizing: boolean;
  /**
   * @description Display name of the project (basename of cwd)
   * @type { string }
   * @memberof DashboardCard
   */
  projectName: string;
  /**
   * @description Full cwd path used as the project path
   * @type { string }
   * @memberof DashboardCard
   */
  projectPath: string;
  /**
   * @description Current lifecycle status of the session
   * @type { SessionStatus }
   * @memberof DashboardCard
   */
  status: SessionStatus;
  /**
   * @description Current AI-generated progress summary, or null if not yet summarized
   * @type { string }
   * @memberof DashboardCard
   */
  summary: string | null;
  /**
   * @description ISO 8601 timestamp when the summary was last updated, or null if never
   * @type { string }
   * @memberof DashboardCard
   */
  summaryUpdatedAt: string | null;
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof DashboardCard
   */
  terminalId: string;
  /**
   * @description Total number of tool calls made in this session
   * @type { number }
   * @memberof DashboardCard
   */
  toolCallCount: number;
};

export function decodeDashboardCard(rawInput: unknown): DashboardCard | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput['command']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedDuration = decodeNumber(rawInput['duration']);
    const decodedErrorCount = decodeNumber(rawInput['errorCount']);
    const decodedEventCount = decodeNumber(rawInput['eventCount']);
    const decodedEvents = decodeArray(rawInput['events'], decodeSessionEvent);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedGoal = decodeString(rawInput['goal']);
    const decodedIsActive = decodeBoolean(rawInput['isActive']);
    const decodedIsSummarizing = decodeBoolean(rawInput['isSummarizing']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);
    const decodedStatus = decodeSessionStatus(rawInput['status']);
    const decodedSummary = decodeString(rawInput['summary']);
    const decodedSummaryUpdatedAt = decodeString(rawInput['summaryUpdatedAt']);
    const decodedTerminalId = decodeString(rawInput['terminalId']);
    const decodedToolCallCount = decodeNumber(rawInput['toolCallCount']);

    if (
      decodedCommand === null ||
      decodedCreatedAt === null ||
      decodedCwd === null ||
      decodedDuration === null ||
      decodedErrorCount === null ||
      decodedEventCount === null ||
      decodedEvents === null ||
      decodedIsActive === null ||
      decodedIsSummarizing === null ||
      decodedProjectName === null ||
      decodedProjectPath === null ||
      decodedStatus === null ||
      decodedTerminalId === null ||
      decodedToolCallCount === null
    ) {
      return null;
    }

    return {
      command: decodedCommand,
      createdAt: decodedCreatedAt,
      cwd: decodedCwd,
      duration: decodedDuration,
      errorCount: decodedErrorCount,
      eventCount: decodedEventCount,
      events: decodedEvents,
      exitedAt: decodedExitedAt,
      goal: decodedGoal,
      isActive: decodedIsActive,
      isSummarizing: decodedIsSummarizing,
      projectName: decodedProjectName,
      projectPath: decodedProjectPath,
      status: decodedStatus,
      summary: decodedSummary,
      summaryUpdatedAt: decodedSummaryUpdatedAt,
      terminalId: decodedTerminalId,
      toolCallCount: decodedToolCallCount,
    };
  }
  return null;
}

/**
 * @type { SummaryRecentEvent }
 * @description A summarized view of a recent session event used as input to the AI summarizer
 */
export type SummaryRecentEvent = {
  /**
   * @description Command string if the event carries one (e.g. bash command), or undefined if not applicable
   * @type { string }
   * @memberof SummaryRecentEvent
   */
  command: string | null;
  /**
   * @description Error message if the event is an error event, or undefined if not applicable
   * @type { string }
   * @memberof SummaryRecentEvent
   */
  error: string | null;
  /**
   * @description Tool name if the event involves a tool call (e.g. "Edit", "Bash"), or undefined if not applicable
   * @type { string }
   * @memberof SummaryRecentEvent
   */
  tool: string | null;
  /**
   * @description Event type discriminator
   * @type { string }
   * @memberof SummaryRecentEvent
   */
  type: string;
};

export function decodeSummaryRecentEvent(rawInput: unknown): SummaryRecentEvent | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput['command']);
    const decodedError = decodeString(rawInput['error']);
    const decodedTool = decodeString(rawInput['tool']);
    const decodedType = decodeString(rawInput['type']);

    if (decodedType === null) {
      return null;
    }

    return {
      command: decodedCommand,
      error: decodedError,
      tool: decodedTool,
      type: decodedType,
    };
  }
  return null;
}

/**
 * @type { SummaryContext }
 * @description Session context passed to the SessionSummarizer to generate an AI summary
 */
export type SummaryContext = {
  /**
   * @description Last 3 user+assistant messages concatenated for context
   * @type { string }
   * @memberof SummaryContext
   */
  conversationExcerpt: string;
  /**
   * @description Total errors in the session
   * @type { number }
   * @memberof SummaryContext
   */
  errorCount: number;
  /**
   * @description Null until first user message is seen; the user's stated task
   * @type { string }
   * @memberof SummaryContext
   */
  goal: string | null;
  /**
   * @description Subset of recent events from the session store (last 10)
   * @type { SummaryRecentEvent[] }
   * @memberof SummaryContext
   */
  recentEvents: SummaryRecentEvent[];
  /**
   * @description Current session status
   * @type { SessionStatus }
   * @memberof SummaryContext
   */
  status: SessionStatus;
  /**
   * @description Total tool calls in the session
   * @type { number }
   * @memberof SummaryContext
   */
  toolCallCount: number;
};

export function decodeSummaryContext(rawInput: unknown): SummaryContext | null {
  if (isJSON(rawInput)) {
    const decodedConversationExcerpt = decodeString(rawInput['conversationExcerpt']);
    const decodedErrorCount = decodeNumber(rawInput['errorCount']);
    const decodedGoal = decodeString(rawInput['goal']);
    const decodedRecentEvents = decodeArray(rawInput['recentEvents'], decodeSummaryRecentEvent);
    const decodedStatus = decodeSessionStatus(rawInput['status']);
    const decodedToolCallCount = decodeNumber(rawInput['toolCallCount']);

    if (
      decodedConversationExcerpt === null ||
      decodedErrorCount === null ||
      decodedRecentEvents === null ||
      decodedStatus === null ||
      decodedToolCallCount === null
    ) {
      return null;
    }

    return {
      conversationExcerpt: decodedConversationExcerpt,
      errorCount: decodedErrorCount,
      goal: decodedGoal,
      recentEvents: decodedRecentEvents,
      status: decodedStatus,
      toolCallCount: decodedToolCallCount,
    };
  }
  return null;
}

/**
 * @type { SummaryTone }
 * @description Which prompt style was used to generate the summary
 */
export type SummaryTone = 'conversational' | 'status-report';

export function decodeSummaryTone(rawInput: unknown): SummaryTone | null {
  switch (rawInput) {
    case 'conversational':
    case 'status-report':
      return rawInput;
  }
  return null;
}

export function _decodeSummaryTone(rawInput: unknown): SummaryTone | undefined {
  switch (rawInput) {
    case 'conversational':
    case 'status-report':
      return rawInput;
  }
  return;
}

/**
 * @type { SummaryResult }
 * @description Result returned by SessionSummarizer.summarize
 */
export type SummaryResult = {
  /**
   * @description ISO 8601 timestamp of when this summary was generated
   * @type { string }
   * @memberof SummaryResult
   */
  generatedAt: string;
  /**
   * @description Plain-English summary text
   * @type { string }
   * @memberof SummaryResult
   */
  text: string;
  /**
   * @description Which prompt style produced this result
   * @type { SummaryTone }
   * @memberof SummaryResult
   */
  tone: SummaryTone;
};

export function decodeSummaryResult(rawInput: unknown): SummaryResult | null {
  if (isJSON(rawInput)) {
    const decodedGeneratedAt = decodeString(rawInput['generatedAt']);
    const decodedText = decodeString(rawInput['text']);
    const decodedTone = decodeSummaryTone(rawInput['tone']);

    if (decodedGeneratedAt === null || decodedText === null || decodedTone === null) {
      return null;
    }

    return {
      generatedAt: decodedGeneratedAt,
      text: decodedText,
      tone: decodedTone,
    };
  }
  return null;
}

/**
 * @type { DashboardTerminalRecord }
 * @description Slim terminal record returned by GET /api/terminals used to populate dashboard session cards
 */
export type DashboardTerminalRecord = {
  /**
   * @description The command running in the terminal
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  command: string;
  /**
   * @description ISO 8601 timestamp when the terminal was created
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  createdAt: string;
  /**
   * @description Working directory of the terminal
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  cwd: string;
  /**
   * @description ISO 8601 timestamp when the terminal exited, or null if still running
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  exitedAt: string | null;
  /**
   * @description Unique terminal identifier
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  id: string;
  /**
   * @description Raw terminal status string from the server
   * @type { string }
   * @memberof DashboardTerminalRecord
   */
  status: string;
};

export function decodeDashboardTerminalRecord(rawInput: unknown): DashboardTerminalRecord | null {
  if (isJSON(rawInput)) {
    const decodedCommand = decodeString(rawInput['command']);
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedCwd = decodeString(rawInput['cwd']);
    const decodedExitedAt = decodeString(rawInput['exitedAt']);
    const decodedId = decodeString(rawInput['id']);
    const decodedStatus = decodeString(rawInput['status']);

    if (
      decodedCommand === null ||
      decodedCreatedAt === null ||
      decodedCwd === null ||
      decodedId === null ||
      decodedStatus === null
    ) {
      return null;
    }

    return {
      command: decodedCommand,
      createdAt: decodedCreatedAt,
      cwd: decodedCwd,
      exitedAt: decodedExitedAt,
      id: decodedId,
      status: decodedStatus,
    };
  }
  return null;
}

/**
 * @type { DashboardTerminalListResponse }
 * @description API response shape for GET /api/terminals as consumed by the dashboard store
 */
export type DashboardTerminalListResponse = {
  /**
   * @description Array of slim terminal records
   * @type { DashboardTerminalRecord[] }
   * @memberof DashboardTerminalListResponse
   */
  terminals: DashboardTerminalRecord[];
};

export function decodeDashboardTerminalListResponse(
  rawInput: unknown
): DashboardTerminalListResponse | null {
  if (isJSON(rawInput)) {
    const decodedTerminals = decodeArray(rawInput['terminals'], decodeDashboardTerminalRecord);

    if (decodedTerminals === null) {
      return null;
    }

    return {
      terminals: decodedTerminals,
    };
  }
  return null;
}

/**
 * @type { ActivityEvent }
 * @description A single event captured from a Claude Code session WebSocket for the activity feed
 */
export type ActivityEvent = {
  /**
   * @description Raw event payload with tool name, file path, command, etc.
   * @type { ActivityEventData }
   * @memberof ActivityEvent
   */
  data: ActivityEventData;
  /**
   * @description Unique event identifier (e.g. "evt-1")
   * @type { string }
   * @memberof ActivityEvent
   */
  id: string;
  /**
   * @description Display name of the project this event belongs to
   * @type { string }
   * @memberof ActivityEvent
   */
  projectName: string;
  /**
   * @description Claude Code session ID this event was received from
   * @type { string }
   * @memberof ActivityEvent
   */
  sessionId: string;
  /**
   * @description Whether this event has been included in an AI-generated summary
   * @type { boolean }
   * @memberof ActivityEvent
   */
  summarized: boolean;
  /**
   * @description ISO 8601 timestamp of the event
   * @type { string }
   * @memberof ActivityEvent
   */
  timestamp: string;
  /**
   * @description Event type discriminator (e.g. "tool_use", "tool_result", "user_message", "error")
   * @type { string }
   * @memberof ActivityEvent
   */
  type: string;
};

export function decodeActivityEvent(rawInput: unknown): ActivityEvent | null {
  if (isJSON(rawInput)) {
    const decodedData = decodeActivityEventData(rawInput['data']);
    const decodedId = decodeString(rawInput['id']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedSessionId = decodeString(rawInput['sessionId']);
    const decodedSummarized = decodeBoolean(rawInput['summarized']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);
    const decodedType = decodeString(rawInput['type']);

    if (
      decodedData === null ||
      decodedId === null ||
      decodedProjectName === null ||
      decodedSessionId === null ||
      decodedSummarized === null ||
      decodedTimestamp === null ||
      decodedType === null
    ) {
      return null;
    }

    return {
      data: decodedData,
      id: decodedId,
      projectName: decodedProjectName,
      sessionId: decodedSessionId,
      summarized: decodedSummarized,
      timestamp: decodedTimestamp,
      type: decodedType,
    };
  }
  return null;
}

/**
 * @type { ActivityEventData }
 * @description Raw event payload with tool name, file path, command, etc.
 */
export type ActivityEventData = Record<string, unknown>;

export function decodeActivityEventData(rawInput: unknown): ActivityEventData | null {
  if (isJSON(rawInput)) {
    return {
      ...rawInput,
    };
  }
  return null;
}

/**
 * @type { ActivitySummary }
 * @description An AI-generated rolling summary covering a batch of activity events
 */
export type ActivitySummary = {
  /**
   * @description IDs of the events included in this summary
   * @type { string[] }
   * @memberof ActivitySummary
   */
  eventIds: string[];
  /**
   * @description Unique summary identifier (e.g. "sum-1")
   * @type { string }
   * @memberof ActivitySummary
   */
  id: string;
  /**
   * @description Project this summary covers
   * @type { string }
   * @memberof ActivitySummary
   */
  projectName: string;
  /**
   * @description AI-generated summary text
   * @type { string }
   * @memberof ActivitySummary
   */
  text: string;
  /**
   * @description ISO 8601 timestamp when the summary was generated
   * @type { string }
   * @memberof ActivitySummary
   */
  timestamp: string;
};

export function decodeActivitySummary(rawInput: unknown): ActivitySummary | null {
  if (isJSON(rawInput)) {
    const decodedEventIds = decodeArray(rawInput['eventIds'], decodeString);
    const decodedId = decodeString(rawInput['id']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedText = decodeString(rawInput['text']);
    const decodedTimestamp = decodeString(rawInput['timestamp']);

    if (
      decodedEventIds === null ||
      decodedId === null ||
      decodedProjectName === null ||
      decodedText === null ||
      decodedTimestamp === null
    ) {
      return null;
    }

    return {
      eventIds: decodedEventIds,
      id: decodedId,
      projectName: decodedProjectName,
      text: decodedText,
      timestamp: decodedTimestamp,
    };
  }
  return null;
}

/**
 * @type { ActivitySummaryResult }
 * @description Result from the activity feed summarizer (NeuroLink generate call)
 */
export type ActivitySummaryResult = {
  /**
   * @description Error message if summarization failed, or null on success
   * @type { string }
   * @memberof ActivitySummaryResult
   */
  error: string | null;
  /**
   * @description Summary text or fallback description
   * @type { string }
   * @memberof ActivitySummaryResult
   */
  text: string;
};

export function decodeActivitySummaryResult(rawInput: unknown): ActivitySummaryResult | null {
  if (isJSON(rawInput)) {
    const decodedError = decodeString(rawInput['error']);
    const decodedText = decodeString(rawInput['text']);

    if (decodedText === null) {
      return null;
    }

    return {
      error: decodedError,
      text: decodedText,
    };
  }
  return null;
}

/**
 * @type { ProviderStatus }
 * @description Configuration status of a single AI provider
 */
export type ProviderStatus = {
  /**
   * @description Whether the provider has valid API credentials
   * @type { boolean }
   * @memberof ProviderStatus
   */
  configured: boolean;
  /**
   * @description Provider identifier (e.g. "google-ai", "anthropic")
   * @type { string }
   * @memberof ProviderStatus
   */
  id: string;
  /**
   * @description Human-readable provider name
   * @type { string }
   * @memberof ProviderStatus
   */
  label: string;
};

export function decodeProviderStatus(rawInput: unknown): ProviderStatus | null {
  if (isJSON(rawInput)) {
    const decodedConfigured = decodeBoolean(rawInput['configured']);
    const decodedId = decodeString(rawInput['id']);
    const decodedLabel = decodeString(rawInput['label']);

    if (decodedConfigured === null || decodedId === null || decodedLabel === null) {
      return null;
    }

    return {
      configured: decodedConfigured,
      id: decodedId,
      label: decodedLabel,
    };
  }
  return null;
}

/**
 * @type { ActivitySessionRecord }
 * @description A discovered active session that the activity store connects to via WebSocket
 */
export type ActivitySessionRecord = {
  /**
   * @description ISO 8601 timestamp when the session was created
   * @type { string }
   * @memberof ActivitySessionRecord
   */
  createdAt: string;
  /**
   * @description Session identifier
   * @type { string }
   * @memberof ActivitySessionRecord
   */
  id: string;
  /**
   * @description ISO 8601 timestamp of last session modification
   * @type { string }
   * @memberof ActivitySessionRecord
   */
  modifiedAt: string;
  /**
   * @description Display name of the project
   * @type { string }
   * @memberof ActivitySessionRecord
   */
  projectName: string;
  /**
   * @description Full filesystem path of the project
   * @type { string }
   * @memberof ActivitySessionRecord
   */
  projectPath: string;
};

export function decodeActivitySessionRecord(rawInput: unknown): ActivitySessionRecord | null {
  if (isJSON(rawInput)) {
    const decodedCreatedAt = decodeString(rawInput['createdAt']);
    const decodedId = decodeString(rawInput['id']);
    const decodedModifiedAt = decodeString(rawInput['modifiedAt']);
    const decodedProjectName = decodeString(rawInput['projectName']);
    const decodedProjectPath = decodeString(rawInput['projectPath']);

    if (
      decodedCreatedAt === null ||
      decodedId === null ||
      decodedModifiedAt === null ||
      decodedProjectName === null ||
      decodedProjectPath === null
    ) {
      return null;
    }

    return {
      createdAt: decodedCreatedAt,
      id: decodedId,
      modifiedAt: decodedModifiedAt,
      projectName: decodedProjectName,
      projectPath: decodedProjectPath,
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
