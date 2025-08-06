#!/usr/bin/env node

const https = require('https');
const path = require('path');

const API_URL = 'https://shooter-pj157emwn-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify';
const API_KEY = process.env.SHOOTER_API_KEY || 'shooter2024';
const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || 'ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab';

function getProjectName() {
    return path.basename(process.cwd()) || 'unknown';
}

function getTimestamp() {
    return new Date().toLocaleTimeString();
}

function getToolInfo() {
    // Claude Code provides these environment variables to hooks
    const toolName = process.env.CLAUDE_TOOL_NAME || process.argv[2] || 'Unknown';
    const filePaths = process.env.CLAUDE_FILE_PATHS || '';
    const commandLine = process.env.CLAUDE_COMMAND_LINE || '';
    
    // Extract file name if available
    const files = filePaths ? filePaths.split(',').map(f => path.basename(f.trim())).join(', ') : '';
    
    return {
        tool: toolName,
        files: files,
        command: commandLine
    };
}

function getEventConfig(eventType) {
    const project = getProjectName();
    const timestamp = getTimestamp();
    const toolInfo = getToolInfo();
    
    // Create contextual messages based on tool and files
    let contextMessage = '';
    if (toolInfo.files) {
        contextMessage = ` on ${toolInfo.files}`;
    } else if (toolInfo.command) {
        contextMessage = ` (${toolInfo.command.substring(0, 50)}${toolInfo.command.length > 50 ? '...' : ''})`;
    }
    
    const configs = {
        'PreToolUse': {
            emoji: '🛠️',
            title: `${toolInfo.tool} Starting | ${project}`,
            message: `About to use ${toolInfo.tool}${contextMessage} at ${timestamp}`,
            category: 'tool'
        },
        'PostToolUse': {
            emoji: '✅',
            title: `${toolInfo.tool} Complete | ${project}`,
            message: `Finished using ${toolInfo.tool}${contextMessage} at ${timestamp}`,
            category: 'tool'
        },
        'UserPromptSubmit': {
            emoji: '💬',
            title: `User Message | ${project}`,
            message: `New user prompt submitted at ${timestamp}`,
            category: 'interaction'
        },
        'Stop': {
            emoji: '🛑',
            title: `Session End | ${project}`,
            message: `Claude Code finished responding at ${timestamp}`,
            category: 'session'
        },
        'SessionStart': {
            emoji: '🚀',
            title: `Session Start | ${project}`,
            message: `Claude Code session started at ${timestamp}`,
            category: 'session'
        },
        'Notification': {
            emoji: '🔔',
            title: `Claude Notification | ${project}`,
            message: `Claude sent a notification at ${timestamp}`,
            category: 'system'
        },
        'SubagentStop': {
            emoji: '🤖',
            title: `Subagent Complete | ${project}`,
            message: `Subagent task completed at ${timestamp}`,
            category: 'agent'
        }
    };
    
    return configs[eventType] || {
        emoji: '❓',
        title: `${eventType} | ${project}`,
        message: `${eventType} event occurred at ${timestamp}`,
        category: 'unknown'
    };
}

function sendNotification(title, body, data = {}) {
    const payload = JSON.stringify({
        title,
        message: body,
        deviceToken: DEVICE_TOKEN,
        data
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(API_URL, options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log('✅ Notification sent successfully');
            } else {
                console.error(`❌ Notification failed: ${res.statusCode} ${responseData}`);
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ Request error:', error.message);
    });

    req.write(payload);
    req.end();
}

function logEnvironmentInfo() {
    // Debug logging for environment variables
    console.log('=== CLAUDE CODE HOOK DEBUG ===');
    console.log('Event Type:', process.argv[2] || 'UNKNOWN');
    console.log('Tool Name:', process.env.CLAUDE_TOOL_NAME || 'NOT_SET');
    console.log('File Paths:', process.env.CLAUDE_FILE_PATHS || 'NOT_SET');
    console.log('Command Line:', process.env.CLAUDE_COMMAND_LINE || 'NOT_SET');
    console.log('Working Directory:', process.cwd());
    console.log('================================');
}

function main() {
    // Get event type from command line argument
    const eventType = process.argv[2] || 'Unknown';
    
    // Debug logging
    logEnvironmentInfo();
    
    console.log(`🔄 Processing ${eventType} event...`);
    
    const config = getEventConfig(eventType);
    const toolInfo = getToolInfo();
    
    const notificationData = {
        event: eventType,
        category: config.category,
        project: getProjectName(),
        timestamp: new Date().toISOString(),
        tool: toolInfo.tool,
        files: toolInfo.files,
        command: toolInfo.command,
        claudeEnv: {
            toolName: process.env.CLAUDE_TOOL_NAME,
            filePaths: process.env.CLAUDE_FILE_PATHS,
            commandLine: process.env.CLAUDE_COMMAND_LINE
        }
    };
    
    console.log(`📱 Sending ${eventType} notification: ${config.title}`);
    
    sendNotification(
        config.title,
        config.message,
        notificationData
    );
}

// Handle process cleanup
process.on('SIGINT', () => {
    console.log('\n🛑 Universal notifier interrupted');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Universal notifier terminated');
    process.exit(0);
});

// Start the universal notifier
main();