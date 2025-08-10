#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://shooter-dtufsplzq-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify';
const API_KEY = process.env.SHOOTER_API_KEY;
const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || null; // Use server-side device token

// Validate required environment variables
if (!API_KEY) {
  console.error('❌ SHOOTER_API_KEY environment variable is required');
  process.exit(1);
}

// Configuration
const COMPLETION_TIMEOUT = 45000; // 45 seconds to wait for inactivity
const STATE_DIR = `/tmp/claude_session_tracker`;

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function getToolInfo() {
    // Claude Code provides these environment variables during tool execution
    const toolName = process.env.CLAUDE_TOOL_NAME || 'Unknown';
    const filePaths = process.env.CLAUDE_FILE_PATHS || '';
    const commandLine = process.env.CLAUDE_COMMAND_LINE || '';

    // Extract file names if available
    const files = filePaths ? filePaths.split(',').map(f => path.basename(f.trim())).join(', ') : '';

    return {
        tool: toolName,
        files: files,
        command: commandLine,
        fullPaths: filePaths
    };
}

function getSessionState() {
  ensureStateDir();
  const projectName = getProjectName();
  const stateFile = path.join(STATE_DIR, `session_state_${projectName}.json`);

  try {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('⚠️ Could not read session state, using defaults');
  }

  return {
    lastStopTime: null,
    lastActivityTime: Date.now(),
    sessionId: Date.now().toString(),
    pendingCompletion: false,
    completionTimeoutId: null,
    project: projectName,
  };
}

function saveSessionState(state) {
  ensureStateDir();
  const projectName = getProjectName();
  const stateFile = path.join(STATE_DIR, `session_state_${projectName}.json`);

  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('❌ Could not save session state:', error.message);
  }
}

function getProjectName() {
  return path.basename(process.cwd()) || 'unknown';
}

function getTimestamp() {
  return new Date().toLocaleTimeString();
}

function sendNotification(title, body, category = 'completion') {
  const requestId = Math.random().toString(36).substring(2, 15);
  const timestamp = new Date().toISOString();

  console.log(`\n=== 🎯 SMART COMPLETION REQUEST [${requestId}] @ ${timestamp} ===`);
  console.log(`📍 Project: ${getProjectName()}`);
  console.log(`🏷️ Category: ${category}`);
  console.log(`💬 Title: ${title}`);
  console.log(`📝 Message: ${body}`);
  console.log(`🌐 API URL: ${API_URL}`);

  const payload = JSON.stringify({
    title,
    message: body,
    ...(DEVICE_TOKEN && { deviceToken: DEVICE_TOKEN }), // Only include if we have a device token
    data: {
      category,
      project: getProjectName(),
      timestamp,
      requestId,
      clientTimestamp: timestamp,
      source: 'shooter-completion-detector',
    },
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Smart-Completion-Notifier/1.0 Claude-Code-Hook',
    },
  };

  const req = https.request(API_URL, options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => (responseData += chunk));
    res.on('end', () => {
      console.log(`=== SMART COMPLETION NOTIFIER HTTP RESPONSE ===`);
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Response Body: ${responseData}`);

      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(responseData);
          if (response.success && response.message === 'Notification filtered (not sent)') {
            console.log(`🚫 FILTERED: ${response.reason}`);
            console.log(`Filter Analysis: ${JSON.stringify(response.filteringAnalysis)}`);
          } else if (response.success) {
            console.log('✅ SENT TO DEVICE: Completion notification delivered successfully');
            if (response.result && response.result.details) {
              console.log(`APNs Details: ${JSON.stringify(response.result.details)}`);
            }
          } else {
            console.log(`❌ SERVER ERROR: ${response.error || 'Unknown error'}`);
          }
        } catch (parseError) {
          console.log('✅ SENT (Legacy Response): Completion notification sent successfully');
          console.log(`Parse Error: ${parseError.message}`);
        }
      } else {
        console.error(`❌ HTTP ERROR: ${res.statusCode} ${responseData}`);
      }
      console.log(`=== END SMART COMPLETION NOTIFIER RESPONSE ===`);
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
  });

  req.write(payload);
  req.end();
}

function handleStopEvent() {
  const state = getSessionState();
  const now = Date.now();

  console.log('🛑 Claude Code stopped, starting completion detection...');

  // Update state
  state.lastStopTime = now;
  state.pendingCompletion = true;
  saveSessionState(state);

  // Schedule completion check after timeout
  setTimeout(() => {
    checkForCompletion();
  }, COMPLETION_TIMEOUT);

  console.log(`⏰ Will check for completion in ${COMPLETION_TIMEOUT / 1000} seconds`);
}

function handlePreToolUse() {
  const state = getSessionState();
  const now = Date.now();

  console.log('🛠️ New tool activity detected, resetting completion timer (no notification)');

  // Reset completion state - work is continuing
  state.lastActivityTime = now;
  state.pendingCompletion = false;
  saveSessionState(state);

  // NO NOTIFICATION - just silent activity tracking
}

function handleNotification() {
  // Immediate notification for intervention needs
  const project = getProjectName();
  const timestamp = getTimestamp();

  console.log('🔔 Claude needs attention - sending immediate notification');

  sendNotification(
    `🚨 Shooter Needs Attention`,
    `Intervention needed in ${project} at ${timestamp}`,
    'intervention'
  );
}

function createContextualMessage(state) {
    const project = getProjectName();
    const timestamp = getTimestamp();
    const totalTools = state.totalToolUses || 0;

    let message = `Session completed in ${project} at ${timestamp}`;

    // Add context about recent work
    if (totalTools > 0) {
        message += `\n\n📊 Used ${totalTools} tools`;

        if (state.recentTools && state.recentTools.length > 0) {
            const toolSummary = state.recentTools.slice(0, 3).join(', ');
            message += `\n🛠️ Recent: ${toolSummary}`;
        }

        if (state.recentFiles && state.recentFiles.length > 0) {
            const fileSummary = state.recentFiles.slice(0, 3).join(', ');
            message += `\n📁 Files: ${fileSummary}`;
        }
    }

    message += `\n\n🎯 Ready for your next request!`;
    return message;
}

function checkForCompletion() {
  const state = getSessionState();
  const now = Date.now();

  console.log('🔍 Checking completion status...');
  console.log(
    `- Last stop: ${state.lastStopTime ? new Date(state.lastStopTime).toLocaleTimeString() : 'never'}`
  );
  console.log(`- Last activity: ${new Date(state.lastActivityTime).toLocaleTimeString()}`);
  console.log(`- Pending completion: ${state.pendingCompletion}`);

  // Only send completion notification if:
  // 1. We're in pending completion state
  // 2. No recent activity since the stop event
  // 3. Enough time has passed
  if (
    state.pendingCompletion &&
    state.lastStopTime &&
    state.lastActivityTime <= state.lastStopTime &&
    now - state.lastStopTime >= COMPLETION_TIMEOUT
  ) {
    const project = getProjectName();
    const timestamp = getTimestamp();
    const duration = Math.round((now - state.lastStopTime) / 1000);

    console.log(
      `✅ Session appears complete - sending notification after ${duration}s of inactivity`
    );

    sendNotification(
      `✅ Shooter Complete`,
      `Session completed in ${project} at ${timestamp}. Ready for your next request.`,
      'completion'
    );

    // Reset state
    state.pendingCompletion = false;
    saveSessionState(state);
  } else {
    console.log('⏭️ No completion notification needed (activity detected or timeout not reached)');
  }
}

function main() {
  const eventType = process.argv[2] || 'Unknown';

  console.log(`📍 Smart completion detector: ${eventType} event`);

  switch (eventType) {
    case 'Stop':
      handleStopEvent();
      break;

    case 'PreToolUse':
      handlePreToolUse();
      break;

    case 'Notification':
      handleNotification();
      break;

    case 'CheckCompletion':
      // Manual completion check (for testing)
      checkForCompletion();
      break;

    default:
      console.log(`ℹ️ Ignoring ${eventType} event (not relevant for completion detection)`);
  }
}

// Handle process cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Smart completion detector interrupted');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Smart completion detector terminated');
  process.exit(0);
});

// Start the smart completion detector
main();
