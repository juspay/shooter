#!/usr/bin/env node

const https = require('https');
const { execSync } = require('child_process');

console.log('✅ Shooter session completed at ' + new Date().toLocaleTimeString());

// Get project context
function getProjectContext() {
    const context = {
        project: 'shooter',
        cwd: process.cwd()
    };
    
    try {
        // Get Git information
        context.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        context.gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
        context.gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
        
        // Get recent commits (last 3)
        const recentCommits = execSync('git log --oneline -3', { encoding: 'utf8' }).trim();
        context.recentWork = recentCommits.split('\n').map(line => line.substring(8)); // Remove hash
        
        // Check if there are uncommitted changes
        context.hasChanges = context.gitStatus.length > 0;
        
    } catch (error) {
        context.gitInfo = 'Not a Git repository';
    }
    
    return context;
}

function createEnhancedMessage(context) {
    let message = `✅ Session completed in ${context.project}\n\n`;
    
    if (context.gitBranch) {
        message += `🌿 Branch: ${context.gitBranch}\n`;
        message += `📝 Commit: ${context.gitCommit}\n\n`;
        
        if (context.recentWork && context.recentWork.length > 0) {
            message += `📊 Recent work:\n`;
            context.recentWork.forEach(work => {
                message += `• ${work}\n`;
            });
            message += `\n`;
        }
        
        if (context.hasChanges) {
            message += `⚠️ Uncommitted changes detected\n\n`;
        }
    }
    
    message += `🎯 Ready for next task!`;
    return message;
}

function sendCompletionNotification() {
    const context = getProjectContext();
    const enhancedMessage = createEnhancedMessage(context);
    
    const payload = JSON.stringify({
        title: "✅ Shooter Complete",
        message: enhancedMessage,
        data: {
            category: 'completion',
            source: 'shooter-completion-detector',
            project: context.project,
            branch: context.gitBranch,
            timestamp: new Date().toISOString()
        }
    });

    const options = {
        hostname: 'shooter-dtufsplzq-sachin-sharmas-projects-7dbbe7a8.vercel.app',
        port: 443,
        path: '/api/notify',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer shooter2024',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
            console.log(`📊 Response: ${res.statusCode} ${res.statusMessage}`);
            if (res.statusCode === 200) {
                console.log('📱 Completion notification sent successfully');
                console.log(`📝 Response: ${responseData}`);
            } else {
                console.error(`❌ Notification failed: ${res.statusCode} ${responseData}`);
            }
            process.exit(0);
        });
    });

    req.on('error', (error) => {
        console.error('❌ Request error:', error.message);
        process.exit(1);
    });

    req.setTimeout(10000, () => {
        console.error('❌ Request timeout');
        req.destroy();
        process.exit(1);
    });

    req.write(payload);
    req.end();
}

sendCompletionNotification();