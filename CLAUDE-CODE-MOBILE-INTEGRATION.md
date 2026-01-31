# Claude Code Mobile Analytics Integration for Shooter Project

## 🎯 **What We Actually Need**

Based on your clarification, you want to leverage the **mobile-first chats interface** and **data extraction capabilities** from claude-code-templates. Here's what we can implement:

## 🔍 **Key Discovery: Mobile Chat Analytics System**

The claude-code-templates project includes a sophisticated **mobile-first chat analytics system** that:

1. **Extracts real-time data** from Claude Code conversations
2. **Mobile-optimized UI** with chat bubbles and real-time updates
3. **WebSocket integration** for live data streaming
4. **Tool usage tracking** and conversation state detection
5. **Remote access** via Cloudflare Tunnel (`--tunnel` flag)

## 📱 **Mobile UI Components We Can Use**

### **1. Mobile Chat Interface (`chats_mobile.html`)**

- **Mobile-first design** with terminal theme (black/orange)
- **Real-time chat bubbles** for user/assistant messages
- **Tool execution visualization** with collapsible details
- **WebSocket live updates** for new messages
- **Conversation state indicators** (working, active, waiting, idle)

### **2. Data Extraction System (`chats-mobile.js`)**

- **File watching** for Claude Code conversation changes
- **Real-time parsing** of conversation JSON files
- **Tool correlation** and result tracking
- **Message change detection** and broadcasting
- **Performance monitoring** and analytics

### **3. Analytics Backend (`analytics.js`)**

- **Express server** with WebSocket support
- **Conversation analysis** and state calculation
- **Real-time notifications** for new messages/tools
- **Cloudflare Tunnel** for remote access
- **Performance monitoring** and health checks

## 🚀 **Implementation Plan for Shooter Project**

### **Phase 1: Mobile Analytics Dashboard**

#### **1.1 Add Claude Code Data Extraction**

```bash
# In our shooter project
npm install express ws chalk fs-extra chokidar
```

#### **1.2 Create Mobile Analytics Server**

Create `src/analytics/mobile-server.js`:

```javascript
const express = require('express');
const WebSocket = require('ws');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class ShooterMobileAnalytics {
  constructor() {
    this.app = express();
    this.port = 3334; // Different port from claude-code-templates
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.conversations = [];
  }

  async initialize() {
    // Setup routes for mobile interface
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'mobile-chat.html'));
    });

    // API endpoints for conversation data
    this.app.get('/api/conversations', (req, res) => {
      res.json({ conversations: this.conversations });
    });

    // Start server
    this.server = this.app.listen(this.port, () => {
      console.log(`🔥 Shooter Analytics: http://localhost:${this.port}`);
    });

    // Setup WebSocket for real-time updates
    this.wss = new WebSocket.Server({ server: this.server });
    this.setupWebSocket();

    // Watch for Claude Code changes
    this.watchClaudeCode();
  }

  setupWebSocket() {
    this.wss.on('connection', ws => {
      console.log('📱 Mobile client connected');

      // Send initial data
      ws.send(
        JSON.stringify({
          type: 'init',
          data: { conversations: this.conversations }
        })
      );
    });
  }

  watchClaudeCode() {
    // Watch for changes in Claude Code conversations
    // Send real-time updates to mobile clients
  }
}
```

#### **1.3 Create Mobile Chat Interface**

Create `src/analytics/mobile-chat.html` (adapted from claude-code-templates):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shooter - Claude Code Analytics</title>
    <style>
      /* Terminal theme - black and orange (matching shooter theme) */
      :root {
        --bg-primary: #0d1117;
        --bg-secondary: #161b22;
        --text-primary: #ffffff;
        --terminal-orange: #ff6b35;
        --message-received: #cc5500;
        --message-sent: #1e7e34;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg-primary);
        color: var(--text-primary);
        margin: 0;
        height: 100vh;
      }

      .chat-app {
        display: flex;
        height: 100vh;
        flex-direction: column;
      }

      .chat-header {
        background: var(--bg-secondary);
        padding: 16px 20px;
        border-bottom: 1px solid #30363d;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .chat-title {
        font-size: 1.2rem;
        font-weight: 700;
        color: var(--terminal-orange);
      }

      .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .message {
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
      }

      .message-user {
        align-self: flex-end;
        max-width: 85%;
      }

      .message-assistant {
        align-self: flex-start;
        max-width: 85%;
      }

      .message-bubble {
        padding: 12px 16px;
        border-radius: 18px;
        font-size: 1rem;
        line-height: 1.4;
      }

      .message-user .message-bubble {
        background: var(--message-sent);
        color: white;
        border-radius: 18px 18px 4px 18px;
      }

      .message-assistant .message-bubble {
        background: var(--bg-primary);
        color: var(--text-primary);
        border: 2px solid var(--message-received);
        border-radius: 8px;
      }

      .tool-execution {
        background: rgba(255, 107, 53, 0.1);
        border: 1px solid rgba(255, 107, 53, 0.3);
        border-radius: 8px;
        margin: 8px 0;
        padding: 12px;
      }

      .tool-name {
        color: var(--terminal-orange);
        font-weight: bold;
        font-family: 'Monaco', monospace;
      }

      .connection-status {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .status-connected {
        background: rgba(40, 167, 69, 0.2);
        color: #28a745;
        border: 1px solid rgba(40, 167, 69, 0.3);
      }

      .status-disconnected {
        background: rgba(220, 53, 69, 0.2);
        color: #dc3545;
        border: 1px solid rgba(220, 53, 69, 0.3);
      }
    </style>
  </head>
  <body>
    <div class="chat-app">
      <div class="chat-header">
        <div class="chat-title">🔥 Shooter Analytics</div>
        <div id="stats" class="header-stats"></div>
      </div>

      <div class="messages-container" id="messages">
        <!-- Messages will be populated here -->
      </div>

      <div id="connectionStatus" class="connection-status status-disconnected">Connecting...</div>
    </div>

    <script>
      class ShooterAnalytics {
        constructor() {
          this.ws = null;
          this.messages = [];
          this.connect();
        }

        connect() {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          this.ws = new WebSocket(`${protocol}//${window.location.host}`);

          this.ws.onopen = () => {
            console.log('📱 Connected to Shooter Analytics');
            this.updateConnectionStatus(true);
          };

          this.ws.onmessage = event => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          };

          this.ws.onclose = () => {
            console.log('📱 Disconnected from Shooter Analytics');
            this.updateConnectionStatus(false);
            // Reconnect after 3 seconds
            setTimeout(() => this.connect(), 3000);
          };
        }

        handleMessage(data) {
          switch (data.type) {
            case 'init':
              this.loadConversations(data.data.conversations);
              break;
            case 'new_message':
              this.addMessage(data.data.message);
              break;
            case 'tool_execution':
              this.addToolExecution(data.data);
              break;
          }
        }

        loadConversations(conversations) {
          const messagesContainer = document.getElementById('messages');
          messagesContainer.innerHTML = '';

          conversations.forEach(conv => {
            this.addConversationHeader(conv);
          });

          this.updateStats(conversations.length);
        }

        addConversationHeader(conversation) {
          const messagesContainer = document.getElementById('messages');
          const header = document.createElement('div');
          header.className = 'conversation-header';
          header.innerHTML = `
                    <h3>💬 ${conversation.name || 'Conversation'}</h3>
                    <span class="conversation-time">${new Date(conversation.lastModified).toLocaleString()}</span>
                `;
          messagesContainer.appendChild(header);
        }

        addMessage(message) {
          const messagesContainer = document.getElementById('messages');
          const messageEl = document.createElement('div');
          messageEl.className = `message message-${message.role}`;

          const content = Array.isArray(message.content)
            ? message.content.map(c => c.text || c.type).join(' ')
            : message.content;

          messageEl.innerHTML = `
                    <div class="message-bubble">
                        ${content}
                        ${message.toolResults ? this.renderToolResults(message.toolResults) : ''}
                    </div>
                `;

          messagesContainer.appendChild(messageEl);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        renderToolResults(toolResults) {
          return toolResults
            .map(
              tool => `
                    <div class="tool-execution">
                        <div class="tool-name">${tool.tool_name || 'Tool'}</div>
                        <div class="tool-result">${tool.content ? tool.content.substring(0, 200) + '...' : 'Executed'}</div>
                    </div>
                `
            )
            .join('');
        }

        updateConnectionStatus(connected) {
          const status = document.getElementById('connectionStatus');
          if (connected) {
            status.className = 'connection-status status-connected';
            status.textContent = '🔥 Connected';
          } else {
            status.className = 'connection-status status-disconnected';
            status.textContent = '⚠️ Disconnected';
          }
        }

        updateStats(conversationCount) {
          const stats = document.getElementById('stats');
          stats.innerHTML = `
                    <span>📊 ${conversationCount} conversations</span>
                    <span>🕒 ${new Date().toLocaleTimeString()}</span>
                `;
        }
      }

      // Initialize analytics
      const analytics = new ShooterAnalytics();
    </script>
  </body>
</html>
```

### **Phase 2: Real-time Claude Code Integration**

#### **2.1 Claude Code File Watcher**

```javascript
const chokidar = require('chokidar');
const path = require('path');
const os = require('os');

class ClaudeCodeWatcher {
  constructor(callback) {
    this.callback = callback;
    this.claudeDir = path.join(os.homedir(), '.claude');
  }

  start() {
    // Watch for conversation file changes
    const conversationsPath = path.join(this.claudeDir, 'conversations');

    this.watcher = chokidar.watch(conversationsPath, {
      persistent: true,
      ignoreInitial: false
    });

    this.watcher.on('change', filePath => {
      console.log(`📝 Claude Code conversation changed: ${filePath}`);
      this.callback('conversation_changed', filePath);
    });

    this.watcher.on('add', filePath => {
      console.log(`➕ New Claude Code conversation: ${filePath}`);
      this.callback('conversation_added', filePath);
    });
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}
```

#### **2.2 Shooter Notification Integration**

```javascript
// In src/routes/api/analytics/+server.js
import { json } from '@sveltejs/kit';

let analyticsClients = new Set();

export async function GET() {
  // SSE endpoint for real-time analytics
  return new Response(
    new ReadableStream({
      start(controller) {
        analyticsClients.add(controller);

        // Send initial data
        controller.enqueue(
          `data: ${JSON.stringify({
            type: 'connected',
            timestamp: new Date().toISOString()
          })}\n\n`
        );
      },
      cancel() {
        analyticsClients.delete(controller);
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    }
  );
}

export async function POST({ request }) {
  const data = await request.json();

  // When we get Claude Code activity, send notification
  if (data.type === 'claude_activity') {
    // Send to iOS app via our existing notification system
    await sendNotificationToiOS({
      title: 'Claude Code Activity',
      body: data.message,
      data: { type: 'claude_activity', ...data }
    });

    // Broadcast to mobile analytics clients
    broadcastToAnalyticsClients({
      type: 'claude_activity',
      data: data
    });
  }

  return json({ success: true });
}

function broadcastToAnalyticsClients(message) {
  analyticsClients.forEach(controller => {
    try {
      controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      analyticsClients.delete(controller);
    }
  });
}
```

### **Phase 3: iOS App Analytics Integration**

#### **3.1 Add Analytics View to iOS App**

```swift
// In ios/Shooter/Shooter/AnalyticsView.swift
import SwiftUI
import WebKit

struct AnalyticsView: View {
    @StateObject private var webViewStore = WebViewStore()

    var body: some View {
        NavigationView {
            WebView(webView: webViewStore.webView)
                .navigationTitle("📊 Analytics")
                .navigationBarTitleDisplayMode(.inline)
                .onAppear {
                    loadAnalytics()
                }
        }
    }

    private func loadAnalytics() {
        let analyticsUrl = URL(string: "http://localhost:3334")!
        webViewStore.webView.load(URLRequest(url: analyticsUrl))
    }
}

class WebViewStore: ObservableObject {
    let webView: WKWebView

    init() {
        webView = WKWebView()
        webView.navigationDelegate = nil
    }
}

struct WebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView {
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
```

#### **3.2 Add Analytics Tab**

```swift
// Update ContentView.swift
TabView {
    ConfigurationView()
        .tabItem {
            Image(systemName: "gear")
            Text("Settings")
        }

    AnalyticsView()
        .tabItem {
            Image(systemName: "chart.bar.fill")
            Text("Analytics")
        }
}
```

### **Phase 4: Cloud Access with Tunnel**

#### **4.1 Add Cloudflare Tunnel Support**

```javascript
// In mobile analytics server
const { spawn } = require('child_process');

class TunnelManager {
  constructor(localPort) {
    this.localPort = localPort;
    this.tunnelUrl = null;
  }

  async start() {
    console.log('☁️ Starting Cloudflare Tunnel...');

    const cloudflared = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${this.localPort}`,
      '--no-autoupdate'
    ]);

    return new Promise(resolve => {
      cloudflared.stdout.on('data', data => {
        const output = data.toString();
        console.log(`[cloudflared] ${output}`);

        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch) {
          this.tunnelUrl = urlMatch[0];
          console.log(`🌐 Tunnel ready: ${this.tunnelUrl}`);
          resolve(this.tunnelUrl);
        }
      });
    });
  }
}
```

#### **4.2 Mobile Access Instructions**

```javascript
// Send tunnel URL to iOS app via notification
await sendNotificationToiOS({
  title: '📱 Mobile Analytics Ready',
  body: `Access your analytics at: ${tunnelUrl}`,
  data: {
    type: 'analytics_url',
    url: tunnelUrl
  }
});
```

## 🎯 **How to Use with `--chats` Flag**

### **Testing the Original System**

```bash
# Test claude-code-templates mobile interface
cd /Users/sachinsharma/Developer/temp/ai-coder/claude-code-templates
npx claude-code-templates --chats

# With remote access
npx claude-code-templates --chats --tunnel
```

### **Implementation in Shooter**

```bash
# Add to package.json scripts
"scripts": {
  "analytics": "node src/analytics/mobile-server.js",
  "analytics:tunnel": "node src/analytics/mobile-server.js --tunnel"
}

# Run analytics server
npm run analytics

# Or with tunnel for remote access
npm run analytics:tunnel
```

## 📱 **Expected Mobile Experience**

1. **Real-time Chat Interface**: Mobile-optimized chat bubbles showing Claude Code conversations
2. **Tool Execution Tracking**: Visual indicators when tools are executed
3. **Live Updates**: WebSocket-powered real-time updates as you use Claude Code
4. **Notification Integration**: iOS app receives notifications about Claude Code activity
5. **Remote Access**: Access analytics from anywhere using Cloudflare Tunnel

## 🔧 **Technical Benefits**

- **Real-time visibility** into Claude Code usage
- **Mobile-first design** optimized for phones/tablets
- **Integration with existing notification system**
- **Cloud access** for remote monitoring
- **Performance analytics** for Claude Code optimization

This approach gives you a **mobile analytics dashboard** that shows real-time Claude Code activity and integrates with your existing Shooter notification system - exactly what the claude-code-templates `--chats` feature provides!
