#!/usr/bin/env node

const https = require('https');

const API_URL = 'https://shooter-k0pm43fy7-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify';
const API_KEY = process.env.SHOOTER_API_KEY || 'shooter2024';
const DEVICE_TOKEN = process.env.SHOOTER_DEVICE_TOKEN || 'ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab';

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

// Read hook input from stdin if available
let hookInput = '';
if (process.stdin.isTTY) {
    // No stdin input, send basic notification
    const project = process.cwd().split('/').pop() || 'unknown';
    const timestamp = new Date().toLocaleTimeString();
    
    sendNotification(
        `✅ Tool Complete | ${project}`,
        `Claude Code finished using a tool at ${timestamp}`,
        {
            event: 'PostToolUse',
            project,
            timestamp
        }
    );
} else {
    // Read from stdin
    process.stdin.on('data', (chunk) => {
        hookInput += chunk;
    });
    
    process.stdin.on('end', () => {
        try {
            const hookData = hookInput ? JSON.parse(hookInput) : {};
            const project = process.cwd().split('/').pop() || 'unknown';
            const timestamp = new Date().toLocaleTimeString();
            const tool = hookData.tool || 'Unknown Tool';
            
            sendNotification(
                `✅ ${tool} Complete | ${project}`,
                `Finished using ${tool} at ${timestamp}`,
                {
                    event: 'PostToolUse',
                    tool,
                    project,
                    timestamp,
                    hookData
                }
            );
        } catch (error) {
            console.error('❌ Error parsing hook data:', error.message);
        }
    });
}