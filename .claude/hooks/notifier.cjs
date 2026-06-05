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
// Codex mode: invoked as `node notifier.cjs codex <HookEventName>`
const IS_CODEX =
  require.main === module &&
  process.argv[2] === 'codex';
const IS_OPENCODE =
  !IS_CODEX &&
  (typeof process.env.OPENCODE_VERSION !== 'undefined' ||
    require.main !== module ||
    process.argv[1]?.includes('opencode'));
const IS_CLAUDE_CODE = !IS_OPENCODE && !IS_CODEX && require.main === module;
const RUNTIME = IS_OPENCODE ? 'opencode' : IS_CODEX ? 'codex' : 'claude-code';

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

// Validate required environment variables for Claude Code and Codex CLI modes
if ((IS_CLAUDE_CODE || IS_CODEX) && !API_KEY) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

// Bidirectional permission response polling
const PERMISSION_TIMEOUT = parseInt(process.env.SHOOTER_PERMISSION_TIMEOUT || '120') * 1000;
const POLL_INTERVAL = 2000; // 2 seconds between polls
const RESPONSE_URL = `${BASE_URL}/api/response`;

// Debug logging flag
const DEBUG_ENABLED = process.env.SHOOTER_DEBUG === 'true';
const DEBUG_LOG_FILE = '/tmp/shooter-debug.log';

// Mask APNs device tokens (64-char hex) and similar long hex secrets in any
// string before logging. Keeps the first 4 + last 4 chars for debugging.
function redactSecrets(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[0-9a-f]{40,}/gi, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
}

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
 * eventType values handled by the dispatcher:
 *   'tool.before'    - Tool is about to execute (debug log only)
 *   'tool.after'     - Tool finished executing (debug log only)
 *   'session.start'  - New session started
 *   'session.end'    - Session terminated
 *   'subagent.start' - Subagent spawned
 *   'subagent.stop'  - Subagent finished
 *   'user.prompt'    - User submitted a prompt
 *   'permission'     - Agent needs permission to run a tool
 *   'permission_notification' - Permission dialog opened (informational)
 *   'question'       - Agent is asking user a question / presenting options
 *   'idle_input'     - Agent is idle, waiting for user to type
 *   'intervention'   - Generic intervention needed (fallback)
 *   'error'          - An error occurred (debug log only — not actionable from phone)
 *   'context.compact' - Context about to be compacted (debug log only)
 *
 * Other event types emitted by adapters (e.g. 'session.idle', 'task.completed',
 * 'teammate.idle', 'check.completion', 'session.status') fall through to the
 * dispatcher's default case and are silently ignored — agent-idle and
 * task-completion notifications were intentionally removed because they
 * aren't actionable remotely.
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

  // session_id is sent by Claude Code on every hook — capture it once so
  // getSessionContext() can read the goal + last user msg + last assistant text.
  data.sessionId = stdinData?.session_id || '';

  // --- PermissionRequest: Agent needs user permission to run a tool ---
  if (cliArg === 'PermissionRequest') {
    data.tool = stdinData?.tool_name || process.env.CLAUDE_TOOL_NAME || 'Unknown';
    data.toolInput = stdinData?.tool_input || {};
    // Extract meaningful details from tool input
    data.command = data.toolInput.command || '';
    data.filePath = data.toolInput.file_path || '';
    data.description = data.toolInput.description || '';
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
        // Agent is presenting a question/dialog to the user. Forward
        // choices/fields from stdin so extractElicitationChoices can
        // surface CHOICE_N buttons (otherwise the question lands as a
        // plain notification with no options).
        if (Array.isArray(stdinData?.choices)) data.choices = stdinData.choices;
        if (Array.isArray(stdinData?.fields)) data.fields = stdinData.fields;
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
    // tool_input is needed by handleAskUserQuestion to extract the
    // question + options array. Forward it so handlers have access.
    data.toolInput = stdinData?.tool_input || {};
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

/**
 * Adapter: Codex CLI hooks.json hook payload -> Common Event Format
 *
 * Codex delivers a JSON payload via stdin with at minimum:
 *   { hook_event_name, session_id, turn_id, transcript_path,
 *     model, permission_mode, cwd }
 *
 * The second CLI arg (`process.argv[3]`) is the HookEventName and
 * duplicates `hook_event_name` in the payload — either works for routing.
 *
 * Event name mapping (Codex → common vocabulary):
 *   SessionStart      → session.start
 *   UserPromptSubmit  → user.prompt
 *   PreToolUse        → tool.before
 *   PostToolUse       → tool.after
 *   Stop              → session.idle
 *   PermissionRequest → permission
 *   SubagentStart     → subagent.start
 *   SubagentStop      → subagent.stop
 *   PreCompact        → context.compact
 *   (unknown)         → unknown
 */
function adaptCodexEvent(stdinData) {
  // Prefer the payload field; fall back to the CLI arg (argv[3]).
  const hookEventName =
    (stdinData && stdinData.hook_event_name) ||
    process.argv[3] ||
    'Unknown';

  const data = {};
  data.sessionId = stdinData?.session_id || '';
  data.turnId = stdinData?.turn_id || '';
  data.cwd = stdinData?.cwd || process.cwd();
  data.model = stdinData?.model || '';
  data.permissionMode = stdinData?.permission_mode || '';
  data.transcriptPath = stdinData?.transcript_path || '';

  switch (hookEventName) {
    case 'SessionStart':
      data.source = stdinData?.source || '';
      return createCommonEvent('codex', 'session.start', data);

    case 'UserPromptSubmit':
      data.message = stdinData?.prompt || '';
      return createCommonEvent('codex', 'user.prompt', data);

    case 'PreToolUse':
      data.tool = stdinData?.tool_name || 'Unknown';
      data.toolInput = stdinData?.tool_input || {};
      data.command = data.toolInput.command || data.toolInput.cmd || '';
      data.filePath = data.toolInput.file_path || '';
      return createCommonEvent('codex', 'tool.before', data);

    case 'PostToolUse':
      data.tool = stdinData?.tool_name || 'Unknown';
      data.toolInput = stdinData?.tool_input || {};
      data.command = data.toolInput.command || data.toolInput.cmd || '';
      data.filePath = data.toolInput.file_path || '';
      data.toolResponse = stdinData?.tool_response || '';
      return createCommonEvent('codex', 'tool.after', data);

    case 'PermissionRequest':
      data.tool = stdinData?.tool_name || 'Unknown';
      data.toolInput = stdinData?.tool_input || {};
      data.command = data.toolInput.command || data.toolInput.cmd || '';
      data.filePath = data.toolInput.file_path || '';
      data.description = data.toolInput.description || '';
      return createCommonEvent('codex', 'permission', data);

    case 'Stop':
      data.lastAssistantMessage = stdinData?.last_assistant_message || '';
      return createCommonEvent('codex', 'session.idle', data);

    case 'SubagentStart':
      data.agentType = stdinData?.agent_type || 'unknown';
      data.source = stdinData?.source || '';
      return createCommonEvent('codex', 'subagent.start', data);

    case 'SubagentStop':
      data.agentType = stdinData?.agent_type || 'unknown';
      return createCommonEvent('codex', 'subagent.stop', data);

    case 'PreCompact':
      return createCommonEvent('codex', 'context.compact', data);

    default:
      data.rawHookEventName = hookEventName;
      return createCommonEvent('codex', 'unknown', data);
  }
}

// ============================================
// SECTION 5: Project / Session Identification
// ============================================

function getProjectName() {
  return path.basename(process.cwd()) || 'unknown';
}

function getSessionIdentifier() {
  const projectName = getProjectName();
  const runtime = RUNTIME;
  const pid = process.pid;
  return `${projectName}_${runtime}_${pid}`;
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
  debugLog(`Tool starting: ${event.data.tool || 'unknown'}`);
  // AskUserQuestion is a built-in tool whose answer we cannot intercept
  // via any hook, but PreToolUse fires with the question + options in
  // tool_input. Surface those on the phone (info-only) so the user can
  // see what's being asked before walking back to the laptop.
  if (event.data.tool === 'AskUserQuestion') {
    handleAskUserQuestion(event);
  }
}

/**
 * Render an AskUserQuestion call as a rich, info-only notification.
 *
 * The hook can't intercept the answer (PreToolUse for non-permission
 * tools is informational), so the iOS notification carries the
 * question + options for awareness; the user picks at the laptop.
 * Tapping an option button on the phone fires a POST to /api/response
 * which the server records under responseKind='info' (no routing
 * back to Claude Code in PR-3 — PTY routing is a follow-up).
 */
function handleAskUserQuestion(event) {
  const d = event.data;
  const toolInput = d.toolInput || {};
  const extracted = extractAskUserQuestionOptions(toolInput);
  if (!extracted) {
    debugLog('AskUserQuestion did not yield extractable options — skipping');
    return;
  }

  const category = categoryForOptionCount(extracted.options.length);
  if (!category) {
    debugLog(`AskUserQuestion option count outside lock-screen range — skipping`);
    return;
  }

  const title = `${event.projectName} · Claude is asking`;
  const subtitle = summarize(extracted.header || extracted.question, 70) || 'Awaiting answer';

  const lines = [extracted.question || extracted.header || 'Choose an option:'];
  const numbered = extracted.options.map((o, i) => `${i + 1}. ${o.label}`).join('   ');
  lines.push('', numbered, '', 'Answer at your laptop.');
  const body = lines.join('\n');

  const requestId = Math.random().toString(36).substring(2, 15);

  sendNotification(title, body, 'question', event.source, subtitle, {
    notificationCategory: category,
    options: extracted.options,
    question: extracted.question,
    requestId,
    responseKind: 'info',
    sessionId: d.sessionId,
    toolInput,
    toolName: 'AskUserQuestion',
    // Need waitForResponse so /api/notify creates a pending_requests row
    // (otherwise /api/decide/[id] won't find it when the user opens the
    // Decide screen from the phone).
    waitForResponse: true,
  });
}

function handleToolEnd(event) {
  debugLog(`Tool complete: ${event.data.tool || 'unknown'}`);
}

function handleSessionStart(_event) {
  debugLog(`New session started: ${getSessionIdentifier()}`);
}

/**
 * Plan-mode approval options surfaced when Claude calls ExitPlanMode.
 *
 * iOS shows the first 3 + Open-in-Shooter on the lock screen (4 button
 * cap); plan_keep is reachable via the Decide screen.
 */
const PLAN_MODE_OPTIONS = [
  { id: 'plan_auto', label: 'Auto Mode', hint: 'Bypass permissions for the rest of the session' },
  {
    id: 'plan_accept',
    label: 'Accept Edits',
    hint: 'Auto-accept file edits; still ask for risky operations',
  },
  { id: 'plan_review', label: 'Review Each', hint: 'Default — ask for each tool invocation' },
  { id: 'plan_keep', label: 'Keep Planning', hint: 'Stay in plan mode without exiting' },
];

/**
 * Map plan_* decisions to the hookSpecificOutput shape Claude Code's
 * PermissionRequest hook expects:
 *   plan_auto/accept/review → allow + updatedPermissions.setMode
 *   plan_keep                → deny (stay in plan mode)
 *
 * Exported via test hook for unit testing without spinning up CC.
 */
function planDecisionToHookResponse(decision) {
  const modeMap = {
    plan_auto: 'bypassPermissions',
    plan_accept: 'acceptEdits',
    plan_review: 'default',
  };
  if (decision === 'plan_keep') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        permissionDecision: 'deny',
        permissionDecisionReason: 'User chose to keep planning',
      },
    };
  }
  const mode = modeMap[decision];
  if (!mode) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'allow',
        updatedPermissions: [{ type: 'setMode', mode, destination: 'session' }],
      },
    },
  };
}

/**
 * Map a binary allow|deny decision to the hookSpecificOutput shape.
 */
function binaryDecisionToHookResponse(decision, wsActive) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: decision,
      permissionDecisionReason: `User ${decision === 'allow' ? 'approved' : 'denied'} via ${wsActive ? 'WebSocket' : 'iPhone notification'}`,
    },
  };
}

/**
 * Detect whether this permission request is the plan-mode approval
 * (ExitPlanMode tool). Plan-mode gets a richer 4-option notification
 * instead of binary allow/deny.
 */
function isPlanModePermission(d) {
  return d.tool === 'ExitPlanMode' || d.toolName === 'ExitPlanMode';
}

/**
 * Pick the right CHOICE_N notification category for an N-option push.
 * Returns null when the count is outside the supported range (1 or
 * >4) so the caller can fall back to info-only / open-in-app.
 *
 * iOS notification categories are pre-registered at app launch with
 * fixed labels (see NotificationManager.swift); only counts 2/3/4 have
 * dedicated registered categories.
 */
function categoryForOptionCount(n) {
  if (n === 2) return 'CLAUDE_CHOICE_2';
  if (n === 3) return 'CLAUDE_CHOICE_3';
  if (n === 4) return 'CLAUDE_CHOICE_4';
  return null;
}

/**
 * Extract OptionChoice[] from AskUserQuestion's tool_input.
 *
 * AskUserQuestion's schema:
 *   { questions: [{ question, header, multiSelect, options: [{label, description}] }] }
 *
 * Returns null when the tool_input doesn't look like a single-select
 * multi-choice question with 2-4 options (the range we can render on
 * iOS lock-screen buttons). The caller then falls through to the
 * generic info notification.
 */
function extractAskUserQuestionOptions(toolInput) {
  const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
  if (questions.length === 0) return null;
  const q = questions[0];
  const rawOpts = Array.isArray(q?.options) ? q.options : [];
  if (rawOpts.length < 2) return null;

  // Cap at 4 — iOS lock-screen actions max out there. Anything beyond
  // is reachable via the Decide screen which has no cap.
  const trimmed = rawOpts.slice(0, 4);
  const options = trimmed.map((o, i) => {
    const label = typeof o?.label === 'string' && o.label.length > 0 ? o.label : `Option ${i + 1}`;
    const hint =
      typeof o?.description === 'string' && o.description.length > 0 ? o.description : undefined;
    return hint ? { id: `option_${i + 1}`, label, hint } : { id: `option_${i + 1}`, label };
  });

  return {
    options,
    question: typeof q.question === 'string' ? q.question : '',
    header: typeof q.header === 'string' ? q.header : '',
  };
}

/**
 * Extract choices from a Notification hook payload of type
 * `elicitation_dialog`. MCP elicitation forms put a select field's
 * choices in `fields[].choices` per the elicitation spec; some
 * implementations also surface a flatter `choices` array directly on
 * the notification data. We try both shapes.
 *
 * Returns null when no select-field with 2-4 choices is found.
 */
function extractElicitationChoices(data) {
  const directChoices = Array.isArray(data?.choices) ? data.choices : null;
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const selectField = fields.find(
    (f) => f && f.type === 'select' && Array.isArray(f.choices) && f.choices.length >= 2
  );

  const choices =
    directChoices && directChoices.length >= 2 ? directChoices : (selectField?.choices ?? null);
  if (!choices || choices.length < 2) return null;

  const trimmed = choices.slice(0, 4);
  const options = trimmed.map((c, i) => {
    const label = typeof c === 'string' ? c : c?.label || c?.value || `Option ${i + 1}`;
    return { id: `option_${i + 1}`, label };
  });

  return {
    options,
    fieldName: selectField?.name ?? null,
  };
}

/**
 * Build the notification body for a plan-mode approval. The plan
 * content itself sits in body + question so the iOS Decide screen can
 * show it; the body also lists the numbered options for lock-screen
 * users who don't open the app.
 */
function buildPlanModeNotification(event) {
  const d = event.data;
  const toolInput = d.toolInput || {};
  const plan = typeof toolInput.plan === 'string' ? toolInput.plan : '';
  const planSummary = summarize(plan, 300) || 'Plan ready for approval';

  const title = `${event.projectName} · Plan ready`;
  const subtitle = summarize(plan, 70) || 'Review and choose how to proceed';
  const body = [
    planSummary,
    '',
    '1. Auto Mode  2. Accept Edits  3. Review Each  4. Keep Planning',
  ].join('\n');

  return { title, subtitle, body, question: plan };
}

/**
 * Handle permission events (agent needs user to approve a tool)
 *
 * Builds a rich notification with tool name + details when available,
 * falls back to the message text when tool details aren't available.
 * Content is identical between Claude Code and OpenCode.
 *
 * Plan-mode (ExitPlanMode tool) gets a special 4-option flow instead
 * of binary allow/deny — see PLAN_MODE_OPTIONS + planDecisionToHookResponse.
 */
async function handlePermission(event) {
  const d = event.data;
  debugLog(`Permission event: tool=${d.tool}, message=${d.message}`);

  const planMode = isPlanModePermission(d);

  const ctx = getSessionContext(d.sessionId);
  const { title, subtitle, body } = planMode
    ? buildPlanModeNotification(event)
    : buildPermissionNotification(event, ctx);

  // Check if WebSocket clients are connected — if so, the events channel
  // will broadcast the permission-requested event and we skip the push notification
  const wsActive = await hasWebSocketClients();

  // For Claude Code PermissionRequest: block and poll for iPhone response
  if (IS_CLAUDE_CODE && event.source === 'claude-code') {
    const requestId = Math.random().toString(36).substring(2, 15);
    debugLog(
      `Starting bidirectional permission flow (requestId: ${requestId}, planMode: ${planMode})`
    );

    const extras = { skipPush: wsActive, subtitle };
    if (planMode) {
      extras.notificationCategory = 'CLAUDE_PLAN_APPROVAL';
      extras.options = PLAN_MODE_OPTIONS;
      extras.question =
        typeof d.toolInput?.plan === 'string' ? d.toolInput.plan : 'Approve plan and proceed?';
      extras.responseKind = 'hook';
    }

    if (wsActive) {
      debugLog(`[Notifier] WebSocket clients connected, skipping push notification`);
      if (IS_CLAUDE_CODE) {
        console.error(`\n=== WEBSOCKET ACTIVE — SKIPPING PUSH [${requestId}] ===`);
        console.error(`Title: ${title}`);
        console.error(`Message: ${body}`);
        console.error(`=== REGISTERING REQUEST & POLLING VIA WEBSOCKET CHANNEL ===\n`);
      }
    }

    const result = await sendNotificationAndPoll(
      title,
      body,
      'permission',
      event.source,
      requestId,
      d,
      extras
    );

    if (result && result.decision) {
      // Plan-mode decisions (plan_auto/accept/review/keep) need the
      // richer hookSpecificOutput shape with updatedPermissions.setMode.
      // Binary allow/deny falls through the legacy path.
      const hookResponse = planMode
        ? planDecisionToHookResponse(result.decision)
        : binaryDecisionToHookResponse(result.decision, wsActive);

      if (hookResponse) {
        process.stdout.write(JSON.stringify(hookResponse));
        debugLog(`Wrote hook decision to stdout: ${result.decision}`);
      } else {
        debugLog(`Unknown decision shape '${result.decision}' — falling through to local dialog`);
      }
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
    sendNotification(title, body, 'permission', event.source, subtitle);
  }
}

// Pure helpers above are also re-exported alongside OpenCodePlugin at
// the bottom of this file for unit testing. The single module.exports
// block lives at the end of the file (see "Exports and Main Execution"
// section).

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

  const ctx = getSessionContext(event.data.sessionId);
  const { title, subtitle, body } = buildPermissionNotification(event, ctx);
  sendNotification(title, body, 'permission', event.source, subtitle);
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

  const ctx = getSessionContext(d.sessionId);
  const { title, subtitle, body } = buildQuestionNotification(event, ctx);

  // If the elicitation payload has dynamic choices (MCP select field),
  // surface them as a CHOICE_N category so the iOS Decide screen can
  // render proper option buttons. Still info-only — the Notification
  // hook can't return a decision, so any user tap on phone is recorded
  // for awareness only.
  const choiceData = extractElicitationChoices(d);
  const extras = { sessionId: d.sessionId };
  if (choiceData) {
    const category = categoryForOptionCount(choiceData.options.length);
    if (category) {
      extras.notificationCategory = category;
      extras.options = choiceData.options;
      extras.question = d.message || d.title || '';
      extras.responseKind = 'info';
      extras.waitForResponse = true;
      debugLog(`Elicitation choice surfaced: ${choiceData.options.length} options → ${category}`);
    }
  }

  sendNotification(title, body, 'question', event.source, subtitle, extras);
}

/**
 * Handle idle input events (agent is idle, waiting for user to type)
 *
 * Lighter notification - just tells user the agent is waiting.
 */
function handleIdleInput(event) {
  const d = event.data;
  debugLog(`Idle input event: message=${d.message}`);

  const ctx = getSessionContext(d.sessionId);
  const title = `${event.projectName} · Waiting for input`;
  const subtitle = ctx.goal
    ? `Goal: ${summarize(ctx.goal, 70)}`
    : summarize(d.message) || 'Agent is idle';

  // Body priority: when Claude's hook message is boilerplate ("waiting for
  // your input"), the agent's most recent text from the JSONL session carries
  // the real "current state". Fall back to Claude's message when we can't
  // read the session, or when the message has substance.
  const lines = [];
  const hookIsBoilerplate = isBoilerplate(d.message);
  if (hookIsBoilerplate && ctx.lastAssistantText) {
    lines.push(ctx.lastAssistantText);
  } else if (d.message) {
    lines.push(d.message);
  } else if (ctx.lastAssistantText) {
    lines.push(ctx.lastAssistantText);
  } else {
    lines.push('Agent is waiting.');
  }
  if (ctx.lastUserMessage && ctx.lastUserMessage !== ctx.goal) {
    lines.push(`Asked: ${summarize(ctx.lastUserMessage, 120)}`);
  }
  let body = lines.join('\n');
  if (body.length > 600) body = body.substring(0, 600) + '…';

  sendNotification(title, body, 'idle_input', event.source, subtitle);
}

/**
 * Handle generic intervention (fallback for unrecognizable events)
 *
 * Sends whatever information is available - never drops a notification.
 */
function handleIntervention(event) {
  const d = event.data;
  debugLog(`Intervention event: message=${d.message}`);

  const ctx = getSessionContext(d.sessionId);
  const title = `${event.projectName} · Needs attention`;
  const subtitle = ctx.goal
    ? `Goal: ${summarize(ctx.goal, 70)}`
    : summarize(d.message) || summarize(d.title) || 'Intervention required';

  const lines = [];
  if (isBoilerplate(d.message) && ctx.lastAssistantText) {
    lines.push(ctx.lastAssistantText);
  } else if (d.message) {
    lines.push(d.message);
  } else if (ctx.lastAssistantText) {
    lines.push(ctx.lastAssistantText);
  } else {
    lines.push('Agent needs your attention.');
  }
  if (ctx.lastUserMessage && ctx.lastUserMessage !== ctx.goal) {
    lines.push(`Asked: ${summarize(ctx.lastUserMessage, 120)}`);
  }
  let body = lines.join('\n');
  if (body.length > 600) body = body.substring(0, 600) + '…';

  sendNotification(title, body, 'intervention', event.source, subtitle);
}

function handleError(event) {
  // Errors are not actionable from the phone — the user can't fix a build error
  // remotely. Track for telemetry only; do not send a push notification.
  debugLog(`Error detected (not notifying): ${event.data.message}`);
}

function handleSessionEnd(_event) {
  debugLog('Session ended');
}

function handleSubagentStart(event) {
  debugLog(`Subagent started: ${event.data.agentType}`);
}

function handleSubagentStop(event) {
  debugLog(`Subagent stopped: ${event.data.agentType}`);
}

function handleUserPrompt(_event) {
  debugLog('User prompt submitted');
}

// ============================================
// SECTION 8: Notification Message Builders
// ============================================

/**
 * Map a tool name to a short verb describing what it's about to do.
 * Used in the subtitle line, e.g. "Bash — run command".
 * Returns 'use tool' as the catch-all so MCP / unknown tools still render cleanly.
 */
function toolVerb(toolName) {
  switch (toolName) {
    case 'Bash':
      return 'run command';
    case 'BashOutput':
      return 'read shell output';
    case 'Edit':
      return 'modify file';
    case 'Glob':
      return 'search files';
    case 'Grep':
      return 'search content';
    case 'KillShell':
      return 'kill shell';
    case 'NotebookEdit':
      return 'edit notebook';
    case 'Read':
      return 'read file';
    case 'Skill':
      return 'invoke skill';
    case 'Task':
      return 'spawn agent';
    case 'TodoWrite':
      return 'manage tasks';
    case 'WebFetch':
      return 'fetch URL';
    case 'WebSearch':
      return 'search web';
    case 'Write':
      return 'create file';
    default:
      return 'use tool';
  }
}

/**
 * Build the metadata footer appended to every notification body.
 * Replaces the old "[Claude] [LOCAL]" title prefix with a low-weight suffix
 * line, e.g. "— claude code" or "— opencode". The local/remote breadcrumb is
 * intentionally omitted — `data.environment` carries it for debug consumers.
 */
function buildFooter(source) {
  let runtime;
  if (source === 'opencode') {
    runtime = 'opencode';
  } else if (source === 'codex') {
    runtime = 'codex cli';
  } else if (source === 'gemini') {
    runtime = 'gemini cli';
  } else {
    runtime = 'claude code';
  }
  return `— ${runtime}`;
}

/** Append the runtime footer to a body, separated by a newline. */
function withFooter(body, source) {
  const footer = buildFooter(source);
  if (!body) return footer;
  return `${body}\n${footer}`;
}

/**
 * Read head and tail chunks from a Claude Code session JSONL file.
 *
 * Claude Code stores sessions at ~/.claude/projects/<encoded-cwd>/<session_id>.jsonl
 * where the encoded cwd replaces every '/' with '-'. Returns parsed lines from
 * the head (for the goal — first user prompt) and tail (for the last user msg
 * and last assistant text). For small sessions, both arrays are the same.
 *
 * Returns { firstLines, lastLines } as arrays of trimmed line strings.
 * Returns { firstLines: [], lastLines: [] } on any failure.
 */
function readSessionLines(sessionId, cwd) {
  if (!sessionId) return { firstLines: [], lastLines: [] };
  try {
    const projectsDir = path.join(require('os').homedir(), '.claude', 'projects');
    const encodedCwd = (cwd || process.cwd()).replace(/\//g, '-');
    const sessionFile = path.join(projectsDir, encodedCwd, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) return { firstLines: [], lastLines: [] };

    const stat = fs.statSync(sessionFile);
    const headSize = 262144; // 256 KB — enough to find the first user message
    const tailSize = 524288; // 512 KB — enough to find the most recent ones
    const fd = fs.openSync(sessionFile, 'r');

    let firstLines, lastLines;
    if (stat.size <= headSize + tailSize) {
      // Small/medium session — read whole file once
      const buf = Buffer.alloc(stat.size);
      fs.readSync(fd, buf, 0, stat.size, 0);
      fs.closeSync(fd);
      const all = buf
        .toString('utf-8')
        .split('\n')
        .filter((l) => l.trim());
      firstLines = all;
      lastLines = all;
    } else {
      // Huge session — read both ends. Drop the boundary lines (likely partial).
      const headBuf = Buffer.alloc(headSize);
      fs.readSync(fd, headBuf, 0, headSize, 0);
      const tailBuf = Buffer.alloc(tailSize);
      fs.readSync(fd, tailBuf, 0, tailSize, stat.size - tailSize);
      fs.closeSync(fd);

      firstLines = headBuf
        .toString('utf-8')
        .split('\n')
        .filter((l) => l.trim());
      if (firstLines.length > 0) firstLines.pop(); // drop possibly-partial last line
      lastLines = tailBuf
        .toString('utf-8')
        .split('\n')
        .filter((l) => l.trim());
      if (lastLines.length > 0) lastLines.shift(); // drop possibly-partial first line
    }

    return { firstLines, lastLines };
  } catch {
    return { firstLines: [], lastLines: [] };
  }
}

/**
 * Extract the user prompt text from a parsed JSONL entry, or '' if it isn't a
 * real user message (tool result, system-injected wrapper, empty, etc.).
 */
function extractUserPromptText(entry) {
  if (!entry || entry.type !== 'user' || !entry.message) return '';
  const content = entry.message.content;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        text = block.text;
        break;
      }
      // tool_result and other non-text blocks are not user prompts
    }
  }
  if (!text) return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  // Wrappers Claude Code injects that aren't real user prompts.
  if (trimmed.startsWith('<system-reminder>')) return '';
  if (trimmed.startsWith('<command-message>')) return '';
  if (trimmed.startsWith('<command-name>')) return '';
  if (trimmed.startsWith('<bash-stdout>')) return '';
  if (trimmed.startsWith('<bash-stderr>')) return '';
  if (trimmed.startsWith('Caveat:')) return '';
  if (trimmed.startsWith('Base directory for this skill:')) return '';

  return trimmed;
}

/**
 * Extract user-facing assistant text from a parsed JSONL entry. Skips thinking
 * blocks and tool_use blocks; returns the first text block's content.
 */
function extractAssistantText(entry) {
  if (!entry || entry.type !== 'assistant' || !entry.message) return '';
  const content = entry.message.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      return block.text.replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

/**
 * Walk session JSONL and surface the three pieces of context we need:
 *   - goal:              first real user prompt (the original ask)
 *   - lastUserMessage:   most recent real user prompt (the most recent ask)
 *   - lastAssistantText: most recent agent text output (current state)
 *
 * Cheap enough to call per notification — bounded by readSessionLines's caps.
 */
function getSessionContext(sessionId, cwd) {
  const empty = { goal: '', lastUserMessage: '', lastAssistantText: '' };
  const { firstLines, lastLines } = readSessionLines(sessionId, cwd);
  if (firstLines.length === 0 && lastLines.length === 0) return empty;

  // Goal: first user prompt in the head.
  let goal = '';
  for (const line of firstLines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const text = extractUserPromptText(entry);
    if (text) {
      goal = text;
      break;
    }
  }

  // Last user message and last assistant text: walk tail backwards.
  let lastUserMessage = '';
  let lastAssistantText = '';
  for (let i = lastLines.length - 1; i >= 0; i--) {
    if (lastUserMessage && lastAssistantText) break;
    let entry;
    try {
      entry = JSON.parse(lastLines[i]);
    } catch {
      continue;
    }
    if (!lastUserMessage) {
      const t = extractUserPromptText(entry);
      if (t) lastUserMessage = t;
    }
    if (!lastAssistantText) {
      const t = extractAssistantText(entry);
      if (t) lastAssistantText = t;
    }
  }

  return { goal, lastUserMessage, lastAssistantText };
}

/**
 * Detect Claude Code's boilerplate hook messages — short, generic strings like
 * "Claude is waiting for your input." that don't tell the user anything new
 * beyond what the title already says. When a hook message looks like this we
 * fall back to JSONL-derived assistant text, which carries real context.
 */
function isBoilerplate(text) {
  if (!text) return true;
  const t = String(text).trim().toLowerCase();
  if (t.length < 8) return true;
  if (t.length > 80) return false;
  return (
    /\bwaiting\b/.test(t) ||
    /\bawaiting\b/.test(t) ||
    /\bidle\b/.test(t) ||
    /^(claude is|agent is|ready)\b/.test(t) ||
    /\b(needs your input|input needed|attention required)\b/.test(t)
  );
}

/**
 * Compress a message into a subtitle-sized summary.
 * Prefers the first sentence; falls back to a hard char limit. Whitespace and
 * newlines are normalised so multi-line agent prose collapses into one line.
 */
function summarize(text, maxLen = 80) {
  if (!text) return '';
  const trimmed = String(text).replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  // First sentence: ends in . ? or ! followed by whitespace or end-of-string.
  // Lookahead avoids slicing at file extensions ("auth.ts") or abbreviations.
  const sentenceMatch = trimmed.match(/^[^.!?]+[.!?](?=\s|$)/);
  if (sentenceMatch && sentenceMatch[0].length <= maxLen) {
    return sentenceMatch[0].trim();
  }

  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.substring(0, maxLen).trim() + '…';
}

/**
 * Build permission notification content.
 * Returns a consistent { title, subtitle, body } shape regardless of tool or source.
 *
 *   title:    "<project> · Permission needed"
 *   subtitle: "<Tool> — <verb>"           (e.g. "Bash — run command")
 *   body:     <description if present>
 *             <command / file path / argument summary>
 */
function buildPermissionNotification(event, ctx = {}) {
  const d = event.data;
  const toolName = d.tool || '';
  const command = d.command || '';
  const filePath = d.filePath || '';
  const description = d.description || '';
  const message = d.message || '';

  const goal = ctx.goal || '';
  const lastUserMessage = ctx.lastUserMessage || '';

  const title = `${event.projectName} · Permission needed`;

  // Layered shape:
  //   title    = project + kind
  //   subtitle = original goal (highest-level context)
  //   body     = "<Tool>: <description>" (what the agent wants to do now)
  //              "Asked: <last user msg>" (only if distinct from goal)
  //              <command/file> (the specific data)
  //              footer (added by sendNotification)
  if (toolName && toolName !== 'Unknown' && toolName !== '') {
    const subtitle = goal
      ? `Goal: ${summarize(goal, 70)}`
      : description
        ? `${toolName}: ${summarize(description, 70)}`
        : `${toolName} — ${toolVerb(toolName)}`;

    let detail = '';
    if (toolName === 'Bash' && command) {
      detail = command;
    } else if (
      (toolName === 'Edit' ||
        toolName === 'Write' ||
        toolName === 'Read' ||
        toolName === 'NotebookEdit') &&
      filePath
    ) {
      detail = filePath;
    } else if (command) {
      detail = command;
    } else if (filePath) {
      detail = filePath;
    }
    if (detail.length > 500) detail = detail.substring(0, 500) + '…';

    const lines = [];
    // What the agent wants to do (description) — only push when goal occupies
    // the subtitle, otherwise it's in the subtitle already.
    if (goal && description) {
      lines.push(`${toolName}: ${description}`);
    }
    // What the user most recently asked — only when it's a distinct follow-up,
    // not the original goal restated.
    if (lastUserMessage && lastUserMessage !== goal) {
      lines.push(`Asked: ${summarize(lastUserMessage, 120)}`);
    }
    if (detail) {
      lines.push(detail);
    }
    if (lines.length === 0) {
      lines.push(message || `Approve ${toolName}`);
    }

    return { title, subtitle, body: lines.join('\n') };
  }

  // No tool name (Notification permission_prompt path).
  const subtitle = goal ? `Goal: ${summarize(goal, 70)}` : summarize(message) || 'Permission';

  if (message) {
    const lines = [message];
    if (lastUserMessage && lastUserMessage !== goal && lastUserMessage !== message) {
      lines.push(`Asked: ${summarize(lastUserMessage, 120)}`);
    }
    return { title, subtitle, body: lines.join('\n') };
  }

  return { title, subtitle, body: 'Agent needs permission' };
}

/**
 * Build question/elicitation notification content.
 * Returns { title, subtitle, body }.
 *
 *   title:    "<project> · Question"
 *   subtitle: <question header (truncated)>   (or 'Awaiting answer' fallback)
 *   body:     <question text>
 *             [Options: A / B / C]
 */
function buildQuestionNotification(event, ctx = {}) {
  const d = event.data;
  const message = d.message || '';
  const title = `${event.projectName} · Question`;
  const questions = d.questions || [];

  const goal = ctx.goal || '';
  const lastUserMessage = ctx.lastUserMessage || '';

  // Case 1: OpenCode question.asked with structured questions array
  if (questions.length > 0) {
    const q = questions[0];
    const header = q.header || q.question || '';
    const options = (q.options || []).map((o) => o.label).filter(Boolean);

    const subtitle = goal
      ? `Goal: ${summarize(goal, 70)}`
      : summarize(header || q.question, 80) || 'Awaiting answer';

    const lines = [];
    if (q.question) lines.push(q.question);
    else if (header) lines.push(header);
    if (options.length > 0) lines.push(`Options: ${options.join(' / ')}`);
    if (lastUserMessage && lastUserMessage !== goal) {
      lines.push(`Asked: ${summarize(lastUserMessage, 120)}`);
    }
    if (lines.length === 0) lines.push('Agent is asking a question');

    let body = lines.join('\n');
    if (body.length > 500) body = body.substring(0, 500) + '…';

    return { title, subtitle, body };
  }

  // Case 2: Claude Code Notification (elicitation_dialog). Goal is the original
  // user prompt; the agent's question itself is the body.
  const stdinTitle = d.title || '';
  const subtitle = goal
    ? `Goal: ${summarize(goal, 70)}`
    : summarize(message, 80) ||
      (stdinTitle && stdinTitle !== 'Permission needed' ? summarize(stdinTitle, 80) : '') ||
      'Awaiting answer';

  if (message) {
    const lines = [message.length > 500 ? message.substring(0, 500) + '…' : message];
    if (lastUserMessage && lastUserMessage !== goal && lastUserMessage !== message) {
      lines.push(`Asked: ${summarize(lastUserMessage, 120)}`);
    }
    return { title, subtitle, body: lines.join('\n') };
  }

  return { title, subtitle, body: 'Agent is asking a question' };
}

// ============================================
// SECTION 9: Notification Service
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
  {
    skipPush = false,
    subtitle = '',
    // Dynamic-options extras forwarded to /api/notify body so the server
    // can persist them on the pending_requests row + set the right APNs
    // category. Undefined → server falls back to the binary CLAUDE_PERMISSION
    // flow (preserves legacy behavior).
    notificationCategory,
    question,
    options,
    responseKind,
  } = {}
) {
  // Common body shared between the skipPush (register-only) and the
  // full push paths. Splitting reduces drift between the two.
  const buildNotifyBody = (timestamp, finalBody) => ({
    title,
    ...(subtitle ? { subtitle } : {}),
    message: finalBody,
    waitForResponse: true,
    ...(skipPush ? { skipPush: true } : {}),
    ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }),
    ...(notificationCategory && { notificationCategory }),
    ...(question !== undefined && { question }),
    ...(options && { options }),
    ...(responseKind && { responseKind }),
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

  return new Promise((resolve) => {
    const timestamp = new Date().toISOString();

    // Title flows through unchanged; runtime/env metadata moves to a body suffix
    // line so it doesn't eat title space on the lock screen.
    const finalBody = withFooter(body, source);

    // When skipPush is true (WebSocket clients connected), skip the actual
    // POST to /api/notify but still register the pending request and poll.
    if (skipPush) {
      debugLog(
        `Skipping push notification (WebSocket active), going straight to polling (requestId: ${requestId})`
      );
      // Register the pending request on the server so polling finds it.
      // We still need to POST with waitForResponse so the server creates
      // the pending-request entry, but we mark it as ws-only.
      const registerPayload = JSON.stringify(buildNotifyBody(timestamp, finalBody));

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

    debugLog(`Sending bidirectional notification: "${title}" (requestId: ${requestId})`);

    const payload = JSON.stringify(buildNotifyBody(timestamp, finalBody));

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
          console.error(`Title: ${title}`);
          if (subtitle) console.error(`Subtitle: ${subtitle}`);
          console.error(`Message: ${finalBody}`);
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

function sendNotification(
  title,
  body,
  category = 'completion',
  source = RUNTIME,
  subtitle = '',
  // PR-3: extras carries the dynamic-options fields (notificationCategory,
  // question, options, responseKind) for AskUserQuestion / elicitation
  // pushes that need to render proper action buttons + populate the
  // /api/decide/[id] payload. Optionally setting waitForResponse=true
  // tells the server to persist a pending_requests row even though this
  // is a fire-and-forget call (no polling) — needed so the iOS Decide
  // screen can fetch the question + options afterward.
  extras = {}
) {
  const requestId = extras.requestId || Math.random().toString(36).substring(2, 15);
  const timestamp = new Date().toISOString();

  // Title flows through unchanged; runtime/env metadata is appended as a low-weight
  // body suffix (see buildFooter / withFooter in Section 8).
  const finalBody = withFooter(body, source);

  debugLog(`Sending notification: "${title}"`);
  debugLog(`  Message: "${finalBody.substring(0, 100)}..."`);
  debugLog(`  Category: ${category}, RequestID: ${requestId}`);

  const payload = JSON.stringify({
    title,
    ...(subtitle ? { subtitle } : {}),
    message: finalBody,
    ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }),
    ...(extras.waitForResponse && { waitForResponse: true }),
    ...(extras.notificationCategory && { notificationCategory: extras.notificationCategory }),
    ...(extras.question !== undefined && { question: extras.question }),
    ...(extras.options && { options: extras.options }),
    ...(extras.responseKind && { responseKind: extras.responseKind }),
    data: {
      category,
      project: getProjectName(),
      timestamp,
      requestId,
      clientTimestamp: timestamp,
      source: 'shooter-completion-detector',
      environment: USE_LOCAL ? 'local' : 'remote',
      runtime: source,
      // Echo toolName/toolInput/sessionId when the caller knows them so
      // the server-side row + Decide screen have full context (matches
      // the eventData spread in sendNotificationAndPoll).
      ...(extras.toolName && { toolName: extras.toolName }),
      ...(extras.toolInput && { toolInput: extras.toolInput }),
      ...(extras.sessionId && { sessionId: extras.sessionId }),
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
        console.error(`Title: ${title}`);
        if (subtitle) console.error(`Subtitle: ${subtitle}`);
        console.error(`Message: ${finalBody}`);
        console.error(`API URL: ${API_URL} (${USE_LOCAL ? 'LOCAL' : 'REMOTE'})`);
        console.error(`Status Code: ${res.statusCode}`);
        console.error(`Response: ${redactSecrets(responseData)}`);
        console.error(`=== END NOTIFICATION ===\n`);
      }

      if (res.statusCode !== 200) {
        debugLog(`HTTP ERROR: ${res.statusCode} ${redactSecrets(responseData)}`);
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
// 11C: Codex CLI Entry Point
// ============================================

async function codexMain() {
  if (!USE_LOCAL && !REMOTE_BASE_URL) {
    console.error(
      'SHOOTER_API_URL environment variable is required when SHOOTER_USE_LOCAL is not true'
    );
    process.exit(1);
  }

  const hookEventName = process.argv[3] || 'Unknown';

  debugLog(`Shooter Notifier Codex CLI invoked: ${hookEventName}`);
  debugLog(`  Runtime: ${RUNTIME}`);
  debugLog(`  Environment: ${USE_LOCAL ? 'LOCAL' : 'REMOTE'}`);

  const stdinData = await readStdin();
  if (stdinData) {
    debugLog(`  Stdin data received: ${JSON.stringify(stdinData).substring(0, 500)}`);
  } else {
    debugLog(`  No stdin data`);
  }

  const event = adaptCodexEvent(stdinData);

  await processEvent(event);
}

// ============================================
// Exports and Main Execution
// ============================================

// Export for OpenCode plugin system + unit tests.
//
// The default export remains OpenCodePlugin so the OpenCode plugin
// loader (which does `require(notifier.cjs)()`) keeps working. Pure
// helpers (plan-mode routing, etc.) are attached as named properties
// so tests/ can require them without spawning the full hook script.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpenCodePlugin;
  module.exports.OpenCodePlugin = OpenCodePlugin;
  module.exports.ShooterNotifier = OpenCodePlugin;
  // Pure-function exports for unit tests (tests/plan-mode-routing.test.cjs).
  module.exports.PLAN_MODE_OPTIONS = PLAN_MODE_OPTIONS;
  module.exports.binaryDecisionToHookResponse = binaryDecisionToHookResponse;
  module.exports.isPlanModePermission = isPlanModePermission;
  module.exports.planDecisionToHookResponse = planDecisionToHookResponse;
  // PR-3 helpers (tests/dynamic-options-extraction.test.cjs).
  module.exports.adaptClaudeCodeEvent = adaptClaudeCodeEvent;
  module.exports.categoryForOptionCount = categoryForOptionCount;
  module.exports.extractAskUserQuestionOptions = extractAskUserQuestionOptions;
  module.exports.extractElicitationChoices = extractElicitationChoices;
  // Codex adapter (tests + wiring).
  module.exports.adaptCodexEvent = adaptCodexEvent;
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

// Run Codex main when invoked as `node notifier.cjs codex <HookEventName>`
if (IS_CODEX) {
  process.on('SIGINT', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });

  codexMain();
}
