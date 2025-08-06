#!/usr/bin/env node

const https = require('https');
const path = require('path');

const API_URL = 'https://shooter-k0pm43fy7-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify';
const API_KEY = process.env.SHOOTER_API_KEY || 'shooter2024';
const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || 'ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab';

function getProjectName() {
    return path.basename(process.cwd()) || 'unknown';
}

function getTimestamp() {
    return new Date().toLocaleTimeString();
}

function getEventConfig(eventType, hookData = {}) {
    const project = getProjectName();
    const timestamp = getTimestamp();
    const tool = hookData.tool || process.argv[3] || 'Unknown';
    const file = hookData.file || hookData.path || '';
    
    const configs = {
        'PreToolUse': {
            emoji: '🛠️',
            title: `${tool} Starting | ${project}`,
            message: `About to use ${tool}${file ? ` on ${path.basename(file)}` : ''} at ${timestamp}`,
            category: 'tool'
        },
        'PostToolUse': {
            emoji: '✅',
            title: `${tool} Complete | ${project}`,
            message: `Finished using ${tool}${file ? ` on ${path.basename(file)}` : ''} at ${timestamp}`,
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
        'Subagent Stop': {
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

function main() {
    // Get event type from command line argument or environment
    const eventType = process.argv[2] || process.env.CLAUDE_HOOK_EVENT || 'Unknown';
    
    console.log(`🔄 Processing ${eventType} event...`);
    
    // Try to read hook data from stdin
    let hookInput = '';
    
    if (process.stdin.isTTY) {
        // No stdin input, process with basic data
        processEvent(eventType, {});
    } else {
        // Read from stdin
        process.stdin.on('data', (chunk) => {
            hookInput += chunk;
        });
        
        process.stdin.on('end', () => {
            let hookData = {};
            try {
                if (hookInput.trim()) {
                    hookData = JSON.parse(hookInput);
                }
            } catch (error) {
                console.log('⚠️ Could not parse hook data, using defaults');
            }
            
            processEvent(eventType, hookData);
        });
    }
}

function processEvent(eventType, hookData) {
    const config = getEventConfig(eventType, hookData);
    
    const notificationData = {
        event: eventType,
        category: config.category,
        project: getProjectName(),
        timestamp: new Date().toISOString(),
        tool: hookData.tool || process.argv[3],
        hookData: hookData
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