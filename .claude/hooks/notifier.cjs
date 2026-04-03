#!/usr/bin/env node

/**
 * Unified Shooter Notifier v3.0
 * Works with both Claude Code and OpenCode
 *
 * Claude Code: Called via CLI with event type argument + JSON on stdin
 *   node notifier.cjs PreToolUse          (stdin: { tool_name, tool_input, ... })
 *   node notifier.cjs Stop                (stdin: { session_id, ... })
 *   node notifier.cjs Notification        (stdin: { notification_type, message, title, ... })
 *   node notifier.cjs PermissionRequest   (stdin: { tool_name, tool_input, ... })
 *
 * OpenCode: Import as plugin module
 *   Place in ~/.config/opencode/plugins/ or .opencode/plugins/
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================
// SECTION 1: Configuration & Runtime Detection
// ============================================

// Detect runtime environment
const IS_OPENCODE =
  typeof process.env.OPENCODE_VERSION !== 'undefined' ||
  require.main !== module ||
  process.argv[1]?.includes('opencode');
const IS_CLAUDE_CODE = !IS_OPENCODE && require.main === module;
const RUNTIME = IS_OPENCODE ? 'opencode' : 'claude-code';

// Environment configuration
const USE_LOCAL = process.env.SHOOTER_USE_LOCAL === 'true';
const LOCAL_PORT = process.env.SHOOTER_LOCAL_PORT || '54007';
const REMOTE_BASE_URL = process.env.SHOOTER_API_URL?.trim() || '';
const LOCAL_BASE_URL = `http://localhost:${LOCAL_PORT}`;
const BASE_URL = USE_LOCAL ? LOCAL_BASE_URL : REMOTE_BASE_URL;
const API_URL = `${BASE_URL}/api/notify`;

// Read API_KEY from ~/.shooter/.env if not in environment
if (!process.env.API_KEY && !process.env.SHOOTER_API_KEY) {
  const envPath = path.join(require('os').homedir(), '.shooter', '.env');
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^API_KEY=["']?([^"'\n]+)["']?$/m);
    if (match) {
      process.env.API_KEY = match[1];
    }
  } catch {
    // .env file doesn't exist — API_KEY must be in environment
  }
}

// Authentication
const API_KEY = process.env.API_KEY || process.env.SHOOTER_API_KEY;
const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || null;
const AUTH_KEY = API_KEY || '';

// Validate required environment variables ONLY for Claude Code CLI mode
if (IS_CLAUDE_CODE && !API_KEY) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

// Completion detection timeout
const COMPLETION_TIMEOUT = 45000; // 45 seconds

// Bidirectional permission response polling
const PERMISSION_TIMEOUT = parseInt(process.env.SHOOTER_PERMISSION_TIMEOUT || '120') * 1000;
const POLL_INTERVAL = 2000; // 2 seconds between polls
const RESPONSE_URL = `${BASE_URL}/api/response`;
const STATE_DIR = `/tmp/claude_session_tracker`;

// Global timeout tracker per project (for OpenCode)
const completionTimers = new Map();

// Debug logging flag
const DEBUG_ENABLED = process.env.SHOOTER_DEBUG === 'true';
const DEBUG_LOG_FILE = '/tmp/shooter-debug.log';

// ============================================
// SECTION 1.5: WebSocket Client Detection
// ============================================

/**
 * Check if any WebSocket clients are connected to the events channel.
 * When clients are connected, the WebSocket events broadcast handles
 * permission-requested notifications, so we can skip push notifications.
 */
async function hasWebSocketClients() {
  try {
    const url = `${BASE_URL}/api/ws-status`;
    const protocol = url.startsWith('https') ? https : http;
    return new Promise((resolve) => {
      const req = protocol.request(
        url,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${AUTH_KEY}` },
          timeout: 3000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed.connectedClients > 0);
              } catch (e) {
                resolve(false);
              }
            } else {
              resolve(false);
            }
          });
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  } catch (e) {
    // If we can't reach the server, fall back to push
    return false;
  }
}

// ============================================
// SECTION 2: Stdin Reader (Claude Code)
// ============================================

/**
 * Read JSON data from stdin (Claude Code passes event data this way)
 * Returns parsed JSON or null if stdin is empty/not JSON
 */
function readStdin() {
  return new Promise((resolve) => {
    // If stdin is a TTY (interactive terminal), no data to read
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let data = '';
    const timeout = setTimeout(() => {
      // Timeout after 1 second - stdin may not have data
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      resolve(null);
    }, 1000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      if (data.trim()) {
        try {
          resolve(JSON.parse(data.trim()));
        } catch (e) {
          debugLog(`Failed to parse stdin JSON: ${e.message}`);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    process.stdin.resume();
  });
}

// ============================================
// SECTION 3: Common Event Format
// ============================================

/**
 * Common Event Format - all events normalized to this structure
 *
 * eventType values:
 *   'tool.before'    - Tool is about to execute (activity tracking)
 *   'tool.after'     - Tool finished executing (activity tracking)
 *   'session.idle'   - Agent finished responding (completion timer)
 *   'session.start'  - New session started
 *   'permission'     - Agent needs permission to run a tool
 *   'question'       - Agent is asking user a question / presenting options
 *   'idle_input'     - Agent is idle, waiting for user to type
 *   'intervention'   - Generic intervention needed (fallback)
 *   'error'          - An error occurred
 *   'check.completion' - Manual completion check
 *   'session.status' - Internal status update (ignored)
 */
function createCommonEvent(source, eventType, data = {}) {
  return {
    source, // 'claude-code' | 'opencode'
    eventType,
    timestamp: new Date().toISOString(),
    projectName: getProjectName(),
    data,
  };
}

// ============================================
// SECTION 4: Event Adapters
// ============================================

/**
 * Adapter: Claude Code CLI + stdin JSON -> Common Event Format
 *
 * Claude Code passes rich JSON on stdin with fields like:
 *   - tool_name, tool_input (for PreToolUse, PermissionRequest)
 *   - notification_type, message, title (for Notification)
 *   - session_id, cwd, hook_event_name (common to all)
 */
function adaptClaudeCodeEvent(cliArg, stdinData) {
  const data = {};

  // --- PermissionRequest: Agent needs user permission to run a tool ---
  if (cliArg === 'PermissionRequest') {
    data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
    data.toolInput = stdinData?.tool_input || {};
    // Extract meaningful details from tool input
    data.command = data.toolInput.command || '';
    data.filePath = data.toolInput.file_path || '';
    data.description = data.toolInput.description || '';
    data.sessionId = stdinData?.session_id || '';
    return createCommonEvent('claude-code', 'permission', data);
  }

  // --- Notification: Different subtypes based on notification_type ---
  if (cliArg === 'Notification') {
    const notificationType = stdinData?.notification_type || '';
    data.message = stdinData?.message || '';
    data.title = stdinData?.title || '';
    data.notificationType = notificationType;

    switch (notificationType) {
      case 'permission_prompt':
        // Permission prompt notification - agent waiting for permission approval.
        // Use 'permission_notification' (not 'permission') to avoid triggering
        // the blocking bidirectional poll flow in handlePermission().
        data.tool = ''; // Not available in notification event, just message
        return createCommonEvent('claude-code', 'permission_notification', data);

      case 'elicitation_dialog':
        // Agent is presenting a question/dialog to the user
        return createCommonEvent('claude-code', 'question', data);

      case 'idle_prompt':
        // Agent is idle, waiting for user to type something
        return createCommonEvent('claude-code', 'idle_input', data);

      case 'auth_success':
        // Auth completed - not actionable, ignore
        debugLog('auth_success notification - ignoring');
        return createCommonEvent('claude-code', 'session.status', data);

      default:
        // Unknown notification type - send with whatever info we have
        return createCommonEvent('claude-code', 'intervention', data);
    }
  }

  // --- PreToolUse: Tool is about to execute (activity tracking only) ---
  if (cliArg === 'PreToolUse') {
    data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
    data.files = process.env.CLAUDE_FILE_PATHS || '';
    data.command = stdinData?.tool_input?.command || process.env.CLAUDE_COMMAND_LINE || '';
    return createCommonEvent('claude-code', 'tool.before', data);
  }

  // --- PostToolUse: Tool finished executing (activity tracking) ---
  if (cliArg === 'PostToolUse') {
    data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
    data.files = process.env.CLAUDE_FILE_PATHS || '';
    data.command = stdinData?.tool_input?.command || process.env.CLAUDE_COMMAND_LINE || '';
    return createCommonEvent('claude-code', 'tool.after', data);
  }

  // --- PostToolUseFailure: Tool execution failed ---
  if (cliArg === 'PostToolUseFailure') {
    data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
    data.message = stdinData?.error || 'Tool execution failed';
    data.files = process.env.CLAUDE_FILE_PATHS || '';
    data.command = stdinData?.tool_input?.command || process.env.CLAUDE_COMMAND_LINE || '';
    return createCommonEvent('claude-code', 'error', data);
  }

  // --- Stop: Agent finished responding ---
  if (cliArg === 'Stop') {
    return createCommonEvent('claude-code', 'session.idle', data);
  }

  // --- SessionStart: New session started ---
  if (cliArg === 'SessionStart') {
    return createCommonEvent('claude-code', 'session.start', data);
  }

  // --- SessionEnd: Session terminated ---
  if (cliArg === 'SessionEnd') {
    return createCommonEvent('claude-code', 'session.end', data);
  }

  // --- SubagentStart: Subagent spawned ---
  if (cliArg === 'SubagentStart') {
    data.agentType = stdinData?.agent_type || 'unknown';
    return createCommonEvent('claude-code', 'subagent.start', data);
  }

  // --- SubagentStop: Subagent finished ---
  if (cliArg === 'SubagentStop') {
    data.agentType = stdinData?.agent_type || 'unknown';
    return createCommonEvent('claude-code', 'subagent.stop', data);
  }

  // --- UserPromptSubmit: User submitted a prompt ---
  if (cliArg === 'UserPromptSubmit') {
    data.message = stdinData?.message || '';
    return createCommonEvent('claude-code', 'user.prompt', data);
  }

  // --- TeammateIdle: Agent teammate went idle ---
  if (cliArg === 'TeammateIdle') {
    data.teammate = stdinData?.agent_name || stdinData?.name || 'unknown';
    return createCommonEvent('claude-code', 'teammate.idle', data);
  }

  // --- TaskCompleted: A task was marked complete ---
  if (cliArg === 'TaskCompleted') {
    data.taskId = stdinData?.task_id || '';
    data.message = stdinData?.subject || '';
    return createCommonEvent('claude-code', 'task.completed', data);
  }

  // --- PreCompact: Context about to be compacted ---
  if (cliArg === 'PreCompact') {
    return createCommonEvent('claude-code', 'context.compact', data);
  }

  // --- CheckCompletion: Manual check ---
  if (cliArg === 'CheckCompletion') {
    return createCommonEvent('claude-code', 'check.completion', data);
  }

  // --- Unknown event type ---
  data.rawArg = cliArg;
  return createCommonEvent('claude-code', 'unknown', data);
}

/**
 * Adapter: OpenCode Hook Events -> Common Event Format
 */
function adaptOpenCodeEvent(hookEventType, hookData = {}) {
  const eventTypeMap = {
    'tool.execute.before': 'tool.before',
    'tool.execute.after': 'tool.after',
    'session.idle': 'session.idle',
    'session.created': 'session.start',
    'session.error': 'error',
    'session.status': 'session.status',
    'session.updated': 'session.status',
    'session.diff': 'session.status',
    'message.updated': 'session.status',
    'message.part.updated': 'session.status',
    'message.removed': 'session.status',
    'message.part.removed': 'session.status',
    'lsp.client.diagnostics': 'session.status',
    'lsp.updated': 'session.status',
    'permission.asked': 'permission',
    'permission.replied': 'session.status',
    'question.asked': 'question',
    'question.replied': 'session.status',
    'question.rejected': 'session.status',
    'server.instance.disposed': 'session.status',
    'server.connected': 'session.status',
    'todo.updated': 'session.status',
    'file.edited': 'session.status',
    'file.watcher.updated': 'session.status',
    'installation.updated': 'session.status',
    'command.executed': 'session.status',
    'shell.env': 'session.status',
  };

  const eventType = eventTypeMap[hookEventType] || 'unknown';
  const data = {
    tool: hookData.tool || 'unknown',
    toolInput: hookData.toolInput || {},
    command: hookData.command || '',
    filePath: hookData.filePath || '',
    files: hookData.files || [],
    message: hookData.message || hookData.error || '',
    questions: hookData.questions || [],
  };

  return createCommonEvent('opencode', eventType, data);
}

// ============================================
// SECTION 5: Session State Management
// ============================================

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function getProjectName() {
  return path.basename(process.cwd()) || 'unknown';
}

function getSessionIdentifier() {
  const projectName = getProjectName();
  const runtime = RUNTIME;
  const pid = process.pid;
  return `${projectName}_${runtime}_${pid}`;
}

function getSessionState() {
  ensureStateDir();
  const sessionId = getSessionIdentifier();
  const stateFile = path.join(STATE_DIR, `session_state_${sessionId}.json`);

  try {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    debugLog(`Could not read session state: ${error.message}`);
  }

  const projectName = getProjectName();
  return {
    lastStopTime: null,
    lastActivityTime: Date.now(),
    sessionId: sessionId,
    pendingCompletion: false,
    project: projectName,
    recentTools: [],
    recentFiles: [],
    totalToolUses: 0,
  };
}

function saveSessionState(state) {
  ensureStateDir();
  const sessionId = getSessionIdentifier();
  const stateFile = path.join(STATE_DIR, `session_state_${sessionId}.json`);

  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    debugLog(`Could not save session state: ${error.message}`);
  }
}

// ============================================
// SECTION 6: Event Processor (Source-Agnostic)
// ============================================

/**
 * Process common events - NO source-specific logic here
 */
async function processEvent(event) {
  debugLog(`Processing event: ${event.eventType} from ${event.source}`);

  switch (event.eventType) {
    case 'tool.before':
      handleToolStart(event);
      break;

    case 'tool.after':
      handleToolEnd(event);
      break;

    case 'session.idle':
      handleSessionIdle(event);
      break;

    case 'session.start':
      handleSessionStart(event);
      break;

    case 'permission':
      await handlePermission(event);
      break;

    case 'permission_notification':
      // Fire-and-forget: a Notification event with permission_prompt type.
      // Does NOT block or poll — just informs the user that a permission dialog is open.
      handlePermissionNotification(event);
      break;

    case 'question':
      handleQuestion(event);
      break;

    case 'idle_input':
      handleIdleInput(event);
      break;

    case 'intervention':
      handleIntervention(event);
      break;

    case 'error':
      handleError(event);
      break;

    case 'check.completion':
      handleCheckCompletion(event);
      break;

    case 'session.end':
      handleSessionEnd(event);
      break;

    case 'subagent.start':
      handleSubagentStart(event);
      break;

    case 'subagent.stop':
      handleSubagentStop(event);
      break;

    case 'user.prompt':
      handleUserPrompt(event);
      break;

    case 'teammate.idle':
      handleTeammateIdle(event);
      break;

    case 'task.completed':
      handleTaskCompleted(event);
      break;

    case 'context.compact':
      debugLog('Context compact event - tracking only');
      break;

    case 'session.status':
      // CRITICAL: session.status is NOT real activity (internal updates)
      debugLog('session.status event - ignoring (not real activity)');
      break;

    default:
      debugLog(`Ignoring ${event.eventType} event (not relevant)`);
  }
}

// ============================================
// SECTION 7: Event Handlers
// ============================================

function handleToolStart(event) {
  const state = getSessionState();
  const now = Date.now();

  debugLog(`Tool starting: ${event.data.tool || 'unknown'}`);

  state.lastActivityTime = now;
  state.pendingCompletion = false;

  if (!state.recentTools) state.recentTools = [];
  if (!state.totalToolUses) state.totalToolUses = 0;

  state.recentTools.unshift(event.data.tool || 'unknown');
  state.recentTools = state.recentTools.slice(0, 10);
  state.totalToolUses++;

  saveSessionState(state);

  cancelCompletionTimer(event.projectName);
  debugLog(`Activity detected, completion timer cancelled (${state.totalToolUses} tools total)`);
}

function handleToolEnd(event) {
  const state = getSessionState();
  state.lastActivityTime = Date.now();
  saveSessionState(state);
  debugLog(`Tool complete: ${event.data.tool || 'unknown'}`);
}

function handleSessionIdle(event) {
  const state = getSessionState();
  const now = Date.now();

  debugLog(`Session idle detected - starting ${COMPLETION_TIMEOUT / 1000}s completion timer`);

  state.lastStopTime = now;
  state.pendingCompletion = true;
  saveSessionState(state);

  scheduleCompletionTimer(event.projectName);
}

function handleSessionStart(event) {
  const state = getSessionState();
  state.sessionId = Date.now().toString();
  state.lastActivityTime = Date.now();
  state.pendingCompletion = false;
  saveSessionState(state);
  cancelCompletionTimer(event.projectName);
  debugLog(`New session started: ${state.sessionId}`);
}

/**
 * Handle permission events (agent needs user to approve a tool)
 *
 * Builds a rich notification with tool name + details when available,
 * falls back to the message text when tool details aren't available.
 * Content is identical between Claude Code and OpenCode.
 */
async function handlePermission(event) {
  const d = event.data;
  debugLog(`Permission event: tool=${d.tool}, message=${d.message}`);

  const { title, body } = buildPermissionNotification(event);

  // Check if WebSocket clients are connected — if so, the events channel
  // will broadcast the permission-requested event and we skip the push notification
  const wsActive = await hasWebSocketClients();

  // For Claude Code PermissionRequest: block and poll for iPhone response
  if (IS_CLAUDE_CODE && event.source === 'claude-code') {
    const requestId = Math.random().toString(36).substring(2, 15);
    debugLog(`Starting bidirectional permission flow (requestId: ${requestId})`);

    let result;
    if (wsActive) {
      // WebSocket clients connected — skip push notification, but still register
      // the pending request on the server so polling can find it.
      debugLog(`[Notifier] WebSocket clients connected, skipping push notification`);
      if (IS_CLAUDE_CODE) {
        console.error(`\n=== WEBSOCKET ACTIVE — SKIPPING PUSH [${requestId}] ===`);
        console.error(`Title: ${title}`);
        console.error(`Message: ${body}`);
        console.error(`=== REGISTERING REQUEST & POLLING VIA WEBSOCKET CHANNEL ===\n`);
      }

      // Register the pending request but skip the actual push notification —
      // the events channel will broadcast the permission to connected clients.
      result = await sendNotificationAndPoll(
        title,
        body,
        'permission',
        event.source,
        requestId,
        d,
        { skipPush: true }
      );
    } else {
      // No WebSocket clients — send push notification and poll
      result = await sendNotificationAndPoll(title, body, 'permission', event.source, requestId, d);
    }

    if (result && result.decision) {
      const hookResponse = {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          permissionDecision: result.decision,
          permissionDecisionReason: `User ${result.decision === 'allow' ? 'approved' : 'denied'} via ${wsActive ? 'WebSocket' : 'iPhone notification'}`,
        },
      };
      // Write decision to stdout for Claude Code to read
      process.stdout.write(JSON.stringify(hookResponse));
      debugLog(`Wrote hook decision to stdout: ${result.decision}`);
    } else {
      debugLog('No response received - falling through to local permission dialog');
      // Output nothing → Claude Code shows normal permission dialog
    }
    return;
  }

  // For OpenCode or non-blocking: fire-and-forget as before
  if (wsActive) {
    debugLog(`[Notifier] WebSocket clients connected, skipping push notification for permission`);
  } else {
    sendNotification(title, body, 'permission', event.source);
  }
}

/**
 * Handle permission_notification events (Notification hook with permission_prompt type).
 *
 * Unlike handlePermission(), this does NOT block or poll for a response.
 * It just sends a fire-and-forget notification to inform the user that
 * Claude Code's local permission dialog is open.
 */
async function handlePermissionNotification(event) {
  const d = event.data;
  debugLog(`Permission notification event (non-blocking): message=${d.message}`);

  // Skip push if WebSocket clients are connected (they get the event via the events channel)
  const wsActive = await hasWebSocketClients();
  if (wsActive) {
    debugLog(`[Notifier] WebSocket clients connected, skipping push for permission_notification`);
    return;
  }

  const { title, body } = buildPermissionNotification(event);
  sendNotification(title, body, 'permission', event.source);
}

/**
 * Handle question/elicitation events (agent is asking user a question)
 *
 * Includes the question text and options when available.
 * Content is identical between Claude Code and OpenCode.
 */
function handleQuestion(event) {
  const d = event.data;
  debugLog(`Question event: message=${d.message}`);

  const { title, body } = buildQuestionNotification(event);

  sendNotification(title, body, 'question', event.source);
}

/**
 * Handle idle input events (agent is idle, waiting for user to type)
 *
 * Lighter notification - just tells user the agent is waiting.
 */
function handleIdleInput(event) {
  const d = event.data;
  debugLog(`Idle input event: message=${d.message}`);

  const title = `Waiting for Input`;
  const body = d.message || `Agent is waiting for your input in ${event.projectName}`;

  sendNotification(title, body, 'idle_input', event.source);
}

/**
 * Handle generic intervention (fallback for unrecognizable events)
 *
 * Sends whatever information is available - never drops a notification.
 */
function handleIntervention(event) {
  const d = event.data;
  debugLog(`Intervention event: message=${d.message}`);

  const title = d.title || `Needs Attention`;
  const body = d.message || `Needs your attention in ${event.projectName}`;

  sendNotification(title, body, 'intervention', event.source);
}

function handleError(event) {
  debugLog(`Error detected: ${event.data.message}`);
  sendNotification(
    `Error in ${event.projectName}`,
    event.data.message || 'An error occurred',
    'error',
    event.source
  );
}

function handleCheckCompletion(event) {
  debugLog(`Manual completion check requested`);
  checkCompletion(event.projectName, event.source);
}

function handleSessionEnd(event) {
  const state = getSessionState();
  state.pendingCompletion = false;
  saveSessionState(state);
  cancelCompletionTimer(event.projectName);
  debugLog('Session ended - cleaned up state');
}

function handleSubagentStart(event) {
  const state = getSessionState();
  state.lastActivityTime = Date.now();
  state.pendingCompletion = false;
  saveSessionState(state);
  cancelCompletionTimer(event.projectName);
  debugLog(`Subagent started: ${event.data.agentType}`);
}

function handleSubagentStop(event) {
  const state = getSessionState();
  state.lastActivityTime = Date.now();
  saveSessionState(state);
  debugLog(`Subagent stopped: ${event.data.agentType}`);
}

function handleUserPrompt(event) {
  const state = getSessionState();
  state.lastActivityTime = Date.now();
  state.pendingCompletion = false;
  saveSessionState(state);
  cancelCompletionTimer(event.projectName);
  debugLog('User prompt submitted - activity detected');
}

function handleTeammateIdle(event) {
  debugLog(`Teammate idle: ${event.data.teammate}`);
  sendNotification(
    `Teammate Idle`,
    `${event.data.teammate} is idle in ${event.projectName}`,
    'teammate_idle',
    event.source
  );
}

function handleTaskCompleted(event) {
  debugLog(`Task completed: ${event.data.message}`);
  sendNotification(
    `Task Completed`,
    event.data.message || `A task was completed in ${event.projectName}`,
    'task_completed',
    event.source
  );
}

// ============================================
// SECTION 8: Notification Message Builders
// ============================================

/**
 * Build permission notification content.
 * Same structure regardless of source (Claude Code or OpenCode).
 *
 * When we have tool details:
 *   Title: "Permission: Bash"
 *   Body:  "npm test" or "Allow: rm -rf /tmp/build"
 *
 * When we only have a message:
 *   Title: "Permission Needed"
 *   Body:  "Claude needs your permission to use Bash"
 */
function buildPermissionNotification(event) {
  const d = event.data;
  const toolName = d.tool || '';
  const command = d.command || '';
  const filePath = d.filePath || '';
  const description = d.description || '';
  const message = d.message || '';

  // Case 1: We know the tool name and have details
  if (toolName && toolName !== 'Unknown' && toolName !== '') {
    const title = `Permission: ${toolName}`;
    let body = '';

    if (toolName === 'Bash' && command) {
      // For Bash, show the command
      body = command.length > 200 ? command.substring(0, 200) + '...' : command;
    } else if ((toolName === 'Edit' || toolName === 'Write' || toolName === 'Read') && filePath) {
      // For file operations, show the file path
      body = filePath;
    } else if (description) {
      body = description;
    } else if (command) {
      body = command;
    } else if (filePath) {
      body = filePath;
    } else {
      body = `Approve ${toolName} in ${event.projectName}`;
    }

    return { title, body };
  }

  // Case 2: We only have a message (e.g., from Notification event)
  if (message) {
    return {
      title: `Permission Needed`,
      body: message,
    };
  }

  // Case 3: Minimal fallback
  return {
    title: `Permission Needed`,
    body: `Agent needs permission in ${event.projectName}`,
  };
}

/**
 * Build question/elicitation notification content.
 * Same structure regardless of source.
 *
 * Handles two formats:
 * 1. Claude Code: { message: "question text", title: "..." }
 * 2. OpenCode: { questions: [{ header, options: [{ label, description }] }] }
 *
 * Output is always:
 *   Title: "Question: <header>"  or  "Question"
 *   Body:  "<question text> | Options: A / B / C"
 */
function buildQuestionNotification(event) {
  const d = event.data;
  const message = d.message || '';
  const title = d.title || '';
  const questions = d.questions || [];

  // Case 1: OpenCode question.asked with structured questions array
  if (questions.length > 0) {
    const q = questions[0]; // Use first question
    const header = q.header || q.question || '';
    const options = (q.options || []).map((o) => o.label).filter(Boolean);

    const notifTitle = header ? `Question: ${header}` : 'Question';
    let body = q.question || header || '';

    if (options.length > 0) {
      body = body ? `${body} | Options: ${options.join(' / ')}` : `Options: ${options.join(' / ')}`;
    }

    if (!body) {
      body = `Agent is asking a question in ${event.projectName}`;
    }

    return {
      title: notifTitle,
      body: body.length > 300 ? body.substring(0, 300) + '...' : body,
    };
  }

  // Case 2: Claude Code notification with message text
  const notifTitle = title && title !== 'Permission needed' ? title : 'Question';

  if (message) {
    return {
      title: notifTitle,
      body: message.length > 300 ? message.substring(0, 300) + '...' : message,
    };
  }

  // Case 3: Minimal fallback
  return {
    title: 'Question',
    body: `Agent is asking a question in ${event.projectName}`,
  };
}

// ============================================
// SECTION 9: Completion Timer Management
// ============================================

function scheduleCompletionTimer(projectName) {
  if (IS_CLAUDE_CODE) {
    // Completion timer cannot work in Claude Code (each hook is a separate process)
    return;
  }
  debugLog(`Scheduling completion check for ${projectName}`);
  cancelCompletionTimer(projectName);

  const timer = setTimeout(() => {
    debugLog(`Completion timer fired for ${projectName}`);
    checkCompletion(projectName, RUNTIME);
  }, COMPLETION_TIMEOUT);

  completionTimers.set(projectName, timer);
  debugLog(`Completion timer scheduled (45s)`);
}

function cancelCompletionTimer(projectName) {
  const existingTimer = completionTimers.get(projectName);
  if (existingTimer) {
    clearTimeout(existingTimer);
    completionTimers.delete(projectName);
    debugLog(`Completion timer cancelled for ${projectName}`);
  }
}

function checkCompletion(projectName, source) {
  if (IS_CLAUDE_CODE) {
    return;
  }
  const state = getSessionState();
  const now = Date.now();

  debugLog(`Checking completion status for ${projectName}`);
  debugLog(`  pendingCompletion: ${state.pendingCompletion}`);
  debugLog(`  lastStopTime: ${state.lastStopTime}`);
  debugLog(`  lastActivityTime: ${state.lastActivityTime}`);

  if (
    state.pendingCompletion &&
    state.lastStopTime &&
    state.lastActivityTime <= state.lastStopTime &&
    now - state.lastStopTime >= COMPLETION_TIMEOUT
  ) {
    debugLog(`Conditions met - sending completion notification`);

    const message = createCompletionMessage(state, projectName);

    sendNotification(`${projectName} Complete`, message, 'completion', source);

    state.pendingCompletion = false;
    saveSessionState(state);
  } else {
    debugLog(`No completion notification needed`);
  }
}

function createCompletionMessage(state, projectName) {
  const timestamp = new Date().toLocaleTimeString();
  let message = `Session completed in ${projectName} at ${timestamp}`;

  const totalTools = state.totalToolUses || 0;
  if (totalTools > 0) {
    message += ` | ${totalTools} tools used`;

    if (state.recentTools && state.recentTools.length > 0) {
      const toolSummary = state.recentTools.slice(0, 3).join(', ');
      message += ` | Recent: ${toolSummary}`;
    }

    if (state.recentFiles && state.recentFiles.length > 0) {
      const fileSummary = state.recentFiles.slice(0, 3).join(', ');
      message += ` | Files: ${fileSummary}`;
    }
  }

  return message;
}

// ============================================
// SECTION 10: Notification Service
// ============================================

/**
 * Send a notification and poll the server for a user response.
 * Used for PermissionRequest bidirectional flow.
 *
 * Returns { decision: 'allow' | 'deny' } or null on timeout.
 */
function sendNotificationAndPoll(
  title,
  body,
  category,
  source,
  requestId,
  eventData,
  { skipPush = false } = {}
) {
  return new Promise((resolve) => {
    const timestamp = new Date().toISOString();

    const runtimePrefix = source === 'opencode' ? '[OpenCode]' : '[Claude]';
    const envPrefix = USE_LOCAL ? '[LOCAL]' : '';
    const finalTitle = `${runtimePrefix}${envPrefix ? ' ' + envPrefix : ''} ${title}`;

    // When skipPush is true (WebSocket clients connected), skip the actual
    // POST to /api/notify but still register the pending request and poll.
    if (skipPush) {
      debugLog(
        `Skipping push notification (WebSocket active), going straight to polling (requestId: ${requestId})`
      );
      // Register the pending request on the server so polling finds it.
      // We still need to POST with waitForResponse so the server creates
      // the pending-request entry, but we mark it as ws-only.
      const registerPayload = JSON.stringify({
        title: finalTitle,
        message: body,
        waitForResponse: true,
        skipPush: true,
        ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }),
        data: {
          category,
          project: getProjectName(),
          timestamp,
          requestId,
          clientTimestamp: timestamp,
          source: 'shooter-completion-detector',
          environment: USE_LOCAL ? 'local' : 'remote',
          runtime: source,
          toolName: eventData.tool || '',
          toolInput: eventData.toolInput || {},
          sessionId: eventData.sessionId || '',
        },
      });

      const registerOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTH_KEY}`,
          'Content-Length': Buffer.byteLength(registerPayload),
          'User-Agent': `Shooter-Notifier/3.0 ${source}`,
        },
      };

      const protocol = API_URL.startsWith('https') ? https : http;
      const req = protocol.request(API_URL, registerOptions, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          debugLog(`Pending request registered (skipPush): status=${res.statusCode}`);
          if (res.statusCode !== 200) {
            debugLog(
              `Registration failed (skipPush): ${res.statusCode} - falling through to local dialog`
            );
            resolve(null);
            return;
          }
          // Start polling only after successful registration — the WebSocket
          // events channel will deliver the permission to connected clients.
          startPolling(requestId, resolve);
        });
      });

      req.on('error', (error) => {
        debugLog(
          `Register request error (skipPush): ${error.message} - falling through to local dialog`
        );
        resolve(null);
      });

      req.setTimeout(10000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(registerPayload);
      req.end();
      return;
    }

    debugLog(`Sending bidirectional notification: "${finalTitle}" (requestId: ${requestId})`);

    const payload = JSON.stringify({
      title: finalTitle,
      message: body,
      waitForResponse: true,
      ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }),
      data: {
        category,
        project: getProjectName(),
        timestamp,
        requestId,
        clientTimestamp: timestamp,
        source: 'shooter-completion-detector',
        environment: USE_LOCAL ? 'local' : 'remote',
        runtime: source,
        toolName: eventData.tool || '',
        toolInput: eventData.toolInput || {},
        sessionId: eventData.sessionId || '',
      },
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': `Shooter-Notifier/3.0 ${source}`,
      },
    };

    // Step 1: Send the notification
    const protocol = API_URL.startsWith('https') ? https : http;
    const req = protocol.request(API_URL, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        if (IS_CLAUDE_CODE) {
          console.error(`\n=== BIDIRECTIONAL NOTIFICATION SENT [${requestId}] ===`);
          console.error(`Title: ${finalTitle}`);
          console.error(`Message: ${body}`);
          console.error(`Status: ${res.statusCode}`);
          console.error(`=== NOW POLLING FOR RESPONSE ===\n`);
        }

        if (res.statusCode !== 200) {
          debugLog(`Notification send failed: ${res.statusCode} - falling through to local dialog`);
          resolve(null);
          return;
        }

        // Step 2: Start polling for user response
        startPolling(requestId, resolve);
      });
    });

    req.on('error', (error) => {
      debugLog(`Notification request error: ${error.message} - falling through to local dialog`);
      resolve(null);
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Poll GET /api/response?requestId=xxx every POLL_INTERVAL until decided or timeout.
 */
function startPolling(requestId, resolve) {
  const startTime = Date.now();
  let resolved = false;

  const overallTimeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      clearInterval(pollTimer);
      debugLog(
        `Permission polling timed out after ${PERMISSION_TIMEOUT / 1000}s - falling through to local dialog`
      );
      if (IS_CLAUDE_CODE) {
        console.error(`\n=== PERMISSION TIMEOUT [${requestId}] ===`);
        console.error(
          `No response after ${PERMISSION_TIMEOUT / 1000}s - falling through to local dialog`
        );
        console.error(`=== END ===\n`);
      }
      resolve(null);
    }
  }, PERMISSION_TIMEOUT);

  const pollTimer = setInterval(() => {
    if (resolved) {
      clearInterval(pollTimer);
      return;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    debugLog(`Polling for response (${elapsed}s elapsed)...`);

    const pollUrl = `${RESPONSE_URL}?requestId=${encodeURIComponent(requestId)}`;
    const pollOptions = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${AUTH_KEY}`,
      },
    };

    const protocol = RESPONSE_URL.startsWith('https') ? https : http;
    const pollReq = protocol.request(pollUrl, pollOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (resolved) return;

        try {
          const result = JSON.parse(data);
          if (result.status === 'decided' && result.decision) {
            resolved = true;
            clearInterval(pollTimer);
            clearTimeout(overallTimeout);

            debugLog(`Decision received: ${result.decision} (after ${elapsed}s)`);
            if (IS_CLAUDE_CODE) {
              console.error(`\n=== DECISION RECEIVED [${requestId}] ===`);
              console.error(`Decision: ${result.decision}`);
              console.error(`Elapsed: ${elapsed}s`);
              console.error(`=== END ===\n`);
            }

            resolve({ decision: result.decision });
          }
          // status === 'pending' → keep polling
        } catch (e) {
          debugLog(`Poll parse error: ${e.message}`);
        }
      });
    });

    pollReq.on('error', (error) => {
      debugLog(`Poll request error: ${error.message}`);
      // Don't resolve on poll error — keep trying until timeout
    });

    pollReq.setTimeout(10000, () => {
      pollReq.destroy(new Error('Request timeout'));
    });

    pollReq.end();
  }, POLL_INTERVAL);
}

function sendNotification(title, body, category = 'completion', source = RUNTIME) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const timestamp = new Date().toISOString();

  // Prefix: [Claude] or [OpenCode], optionally [LOCAL]
  const runtimePrefix = source === 'opencode' ? '[OpenCode]' : '[Claude]';
  const envPrefix = USE_LOCAL ? '[LOCAL]' : '';
  const finalTitle = `${runtimePrefix}${envPrefix ? ' ' + envPrefix : ''} ${title}`;

  debugLog(`Sending notification: "${finalTitle}"`);
  debugLog(`  Message: "${body.substring(0, 100)}..."`);
  debugLog(`  Category: ${category}, RequestID: ${requestId}`);

  const payload = JSON.stringify({
    title: finalTitle,
    message: body,
    ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }),
    data: {
      category,
      project: getProjectName(),
      timestamp,
      requestId,
      clientTimestamp: timestamp,
      source: 'shooter-completion-detector',
      environment: USE_LOCAL ? 'local' : 'remote',
      runtime: source,
    },
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': `Shooter-Notifier/3.0 ${source}`,
    },
  };

  const protocol = API_URL.startsWith('https') ? https : http;
  const req = protocol.request(API_URL, options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => (responseData += chunk));
    res.on('end', () => {
      if (IS_CLAUDE_CODE) {
        console.error(`\n=== NOTIFICATION SENT [${requestId}] @ ${timestamp} ===`);
        console.error(`Project: ${getProjectName()}`);
        console.error(`Category: ${category}`);
        console.error(`Title: ${finalTitle}`);
        console.error(`Message: ${body}`);
        console.error(`API URL: ${API_URL} (${USE_LOCAL ? 'LOCAL' : 'REMOTE'})`);
        console.error(`Status Code: ${res.statusCode}`);
        console.error(`Response: ${responseData}`);
        console.error(`=== END NOTIFICATION ===\n`);
      }

      if (res.statusCode !== 200) {
        debugLog(`HTTP ERROR: ${res.statusCode} ${responseData}`);
      } else {
        debugLog(`Notification sent successfully`);
      }
    });
  });

  req.on('error', (error) => {
    debugLog(`Request error: ${error.message}`);
    if (IS_CLAUDE_CODE) {
      console.error('Notification request error:', error.message);
    }
  });

  req.setTimeout(10000, () => {
    req.destroy(new Error('Request timeout'));
  });

  req.write(payload);
  req.end();
}

// ============================================
// Utility: Debug Logging
// ============================================

function debugLog(msg) {
  if (!DEBUG_ENABLED) return;

  try {
    const timestamp = new Date().toISOString();
    const logFile = IS_CLAUDE_CODE ? DEBUG_LOG_FILE : '/tmp/shooter-opencode-debug.log';
    fs.writeFileSync(logFile, `[${timestamp}] ${msg}\n`, { flag: 'a' });
  } catch (e) {
    // Silent fail
  }
}

// ============================================
// SECTION 11: Entry Points
// ============================================

// ============================================
// 11A: Claude Code CLI Entry Point
// ============================================

async function claudeCodeMain() {
  // Validate required environment variables (only in Claude Code CLI mode)
  if (!USE_LOCAL && !REMOTE_BASE_URL) {
    console.error(
      'SHOOTER_API_URL environment variable is required when SHOOTER_USE_LOCAL is not true'
    );
    process.exit(1);
  }

  const cliArg = process.argv[2] || 'Unknown';

  debugLog(`Shooter Notifier CLI invoked: ${cliArg}`);
  debugLog(`  Runtime: ${RUNTIME}`);
  debugLog(`  Environment: ${USE_LOCAL ? 'LOCAL' : 'REMOTE'}`);
  debugLog(`  Session ID: ${getSessionIdentifier()}`);

  // Read stdin JSON (Claude Code passes event data here)
  const stdinData = await readStdin();
  if (stdinData) {
    debugLog(`  Stdin data received: ${JSON.stringify(stdinData).substring(0, 500)}`);
  } else {
    debugLog(`  No stdin data (legacy mode or TTY)`);
  }

  // Adapt CLI event + stdin data to common format
  const event = adaptClaudeCodeEvent(cliArg, stdinData);

  // Process the event (await for blocking handlers like PermissionRequest)
  await processEvent(event);
}

// ============================================
// 11B: OpenCode Plugin Entry Point
// ============================================

const OpenCodePlugin = async (ctx) => {
  debugLog('Shooter Notifier plugin loaded');
  debugLog(`  Runtime: ${RUNTIME}`);
  debugLog(`  Environment: ${USE_LOCAL ? 'LOCAL' : 'REMOTE'}`);
  debugLog(`  API URL: ${API_URL}`);
  debugLog(`  Session ID: ${getSessionIdentifier()}`);

  // Extract project name from context
  let projectName = getProjectName();
  if (ctx?.project && typeof ctx.project === 'string') {
    projectName = ctx.project;
  } else if (ctx?.directory && typeof ctx.directory === 'string') {
    projectName = path.basename(ctx.directory);
  } else if (ctx?.project?.name && typeof ctx.project.name === 'string') {
    projectName = ctx.project.name;
  }

  debugLog(`Project name: ${projectName}`);

  return {
    // Generic event handler - catches ALL OpenCode events
    event: async ({ event }) => {
      if (!event || !event.type) return;

      // Log ALL raw event types so we can discover what OpenCode sends
      debugLog(`[RAW EVENT] type=${event.type} keys=${Object.keys(event).join(',')}`);
      if (event.properties) {
        debugLog(`[RAW EVENT] properties=${JSON.stringify(event.properties).substring(0, 300)}`);
      }

      // Extract properties from OpenCode event
      const props = event.properties || {};

      const commonEvent = adaptOpenCodeEvent(event.type, {
        tool: event.tool || props.tool,
        toolInput: event.toolInput || event.args || {},
        command: event.command || event.args?.command || '',
        filePath: event.filePath || event.args?.filePath || '',
        files: event.files,
        message: event.message || event.error || props.message || '',
        questions: props.questions || [],
      });

      processEvent(commonEvent);
    },

    // Specific hook: Before tool execution
    'tool.execute.before': async (input, output) => {
      const commonEvent = adaptOpenCodeEvent('tool.execute.before', {
        tool: input?.tool || 'unknown',
        toolInput: output?.args || {},
        command: output?.args?.command || '',
        filePath: output?.args?.filePath || '',
      });
      processEvent(commonEvent);
    },

    // Specific hook: After tool execution
    'tool.execute.after': async (input, _output) => {
      const commonEvent = adaptOpenCodeEvent('tool.execute.after', {
        tool: input?.tool || 'unknown',
      });
      processEvent(commonEvent);
    },

    // Specific hook: Permission asked (agent needs user approval)
    'permission.asked': async (input, output) => {
      debugLog(`OpenCode permission.asked: tool=${input?.tool}`);
      const commonEvent = adaptOpenCodeEvent('permission.asked', {
        tool: input?.tool || 'unknown',
        toolInput: input?.args || output?.args || {},
        command: input?.args?.command || output?.args?.command || '',
        filePath: input?.args?.filePath || output?.args?.filePath || '',
        message: input?.message || '',
      });
      processEvent(commonEvent);
    },
  };
};

// ============================================
// Exports and Main Execution
// ============================================

// Export for OpenCode plugin system
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpenCodePlugin;
  module.exports.OpenCodePlugin = OpenCodePlugin;
  module.exports.ShooterNotifier = OpenCodePlugin;
}

// Run main() when called directly from CLI (Claude Code)
if (IS_CLAUDE_CODE) {
  // Handle process cleanup (Claude Code CLI only)
  process.on('SIGINT', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });

  claudeCodeMain();
}
