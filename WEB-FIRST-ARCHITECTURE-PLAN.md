# Web-First Architecture Plan for Shooter Analytics

## 🎯 **Strategic Architecture Overview**

Moving from **native iOS app** → **Web-first with WebView layer**

### **Core Concept**

- **Primary Interface**: Mobile-optimized web dashboard hosted on Vercel
- **Authentication**: Web-based auth protecting all dashboard routes
- **Native Layer**: Minimal iOS WebView container + JavaScript bridges for device features
- **Integration**: Claude Code analytics, real-time notifications, tunnel management

---

## 📋 **Detailed Implementation Roadmap**

### **Phase 1: Web Dashboard Foundation (Week 1)**

#### **1.1 Authentication System Architecture**

**Route Structure**:

```
src/routes/
├── auth/
│   ├── login/+page.svelte           # Login form
│   ├── logout/+server.js            # Logout endpoint
│   └── session/+server.js           # Session validation
├── dashboard/                       # Protected routes
│   ├── +layout.svelte              # Auth wrapper layout
│   ├── +page.svelte                # Main dashboard
│   ├── analytics/+page.svelte      # Claude Code analytics
│   ├── notifications/+page.svelte  # Notification management
│   ├── settings/+page.svelte       # Configuration
│   └── tunnel/+page.svelte         # Remote access management
└── api/
    ├── auth/+server.js             # Authentication endpoints
    ├── session/+server.js          # Session management
    └── [...existing APIs]
```

#### **1.2 Authentication Implementation**

**File**: `src/lib/server/auth.js`

```javascript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH; // bcrypt hash

export class AuthService {
  static async validateCredentials(username, password) {
    if (username !== AUTH_USERNAME) return false;

    if (AUTH_PASSWORD_HASH) {
      return await bcrypt.compare(password, AUTH_PASSWORD_HASH);
    }

    // Fallback for development
    return password === (process.env.AUTH_PASSWORD || 'shooter2024');
  }

  static generateToken(username) {
    return jwt.sign({ username, timestamp: Date.now() }, JWT_SECRET, { expiresIn: '7d' });
  }

  static validateToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }

  static requireAuth(request) {
    const authCookie = request.cookies.get('auth-token');
    if (!authCookie) throw new Error('Authentication required');

    const payload = this.validateToken(authCookie);
    if (!payload) throw new Error('Invalid or expired token');

    return payload;
  }
}
```

#### **1.3 Protected Layout System**

**File**: `src/routes/dashboard/+layout.svelte`

```svelte
<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let isAuthenticated = false;
  let isLoading = true;
  let user = null;

  onMount(async () => {
    try {
      const response = await fetch('/api/auth/validate');
      if (response.ok) {
        const data = await response.json();
        isAuthenticated = true;
        user = data.user;
      } else {
        goto('/auth/login');
        return;
      }
    } catch (error) {
      console.error('Auth validation failed:', error);
      goto('/auth/login');
      return;
    }

    isLoading = false;
  });

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    goto('/auth/login');
  }
</script>

{#if isLoading}
  <div class="loading-screen">
    <div class="loading-spinner"></div>
    <p>Authenticating...</p>
  </div>
{:else if isAuthenticated}
  <div class="dashboard-layout">
    <!-- Mobile-first header -->
    <header class="dashboard-header">
      <div class="header-content">
        <h1 class="dashboard-title">🔥 Shooter</h1>
        <div class="header-actions">
          <span class="user-info">@{user?.username}</span>
          <button class="logout-btn" on:click={logout}>
            Logout
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile navigation -->
    <nav class="mobile-nav">
      <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>
        <span class="nav-icon">📊</span>
        <span class="nav-label">Dashboard</span>
      </a>
      <a href="/dashboard/analytics" class:active={$page.url.pathname.includes('/analytics')}>
        <span class="nav-icon">📈</span>
        <span class="nav-label">Analytics</span>
      </a>
      <a href="/dashboard/notifications" class:active={$page.url.pathname.includes('/notifications')}>
        <span class="nav-icon">📱</span>
        <span class="nav-label">Notifications</span>
      </a>
      <a href="/dashboard/settings" class:active={$page.url.pathname.includes('/settings')}>
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">Settings</span>
      </a>
    </nav>

    <!-- Main content area -->
    <main class="dashboard-main">
      <slot />
    </main>
  </div>
{/if}

<style>
  /* Mobile-first dashboard theme matching iOS app */
  .dashboard-layout {
    min-height: 100vh;
    background: #0d1117;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0d1117;
    color: #ffffff;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #30363d;
    border-top: 3px solid #ff6b35;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .dashboard-header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 1rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
  }

  .dashboard-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    color: #ff6b35;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .user-info {
    color: #8b949e;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .logout-btn {
    background: rgba(255, 107, 53, 0.1);
    border: 1px solid rgba(255, 107, 53, 0.3);
    color: #ff6b35;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .logout-btn:hover {
    background: rgba(255, 107, 53, 0.2);
    border-color: rgba(255, 107, 53, 0.5);
  }

  .mobile-nav {
    display: flex;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem 1rem;
    text-decoration: none;
    color: #8b949e;
    transition: all 0.2s ease;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
    min-width: 80px;
  }

  .mobile-nav a:hover,
  .mobile-nav a.active {
    color: #ff6b35;
    border-bottom-color: #ff6b35;
    background: rgba(255, 107, 53, 0.05);
  }

  .nav-icon {
    font-size: 1.2rem;
    margin-bottom: 0.25rem;
  }

  .nav-label {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .dashboard-main {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
    min-height: calc(100vh - 140px);
  }

  /* Responsive adjustments */
  @media (min-width: 768px) {
    .mobile-nav {
      justify-content: center;
    }

    .mobile-nav a {
      min-width: 120px;
    }

    .dashboard-main {
      padding: 2rem;
    }
  }
</style>
```

### **Phase 2: Dashboard Components (Week 2)**

#### **2.1 Main Dashboard**

**File**: `src/routes/dashboard/+page.svelte`

```svelte
<script>
  import { onMount } from 'svelte';
  import MetricCard from '$lib/components/MetricCard.svelte';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import SystemStatus from '$lib/components/SystemStatus.svelte';

  let metrics = {
    totalNotifications: 0,
    claudeActivities: 0,
    tunnelStatus: 'disconnected',
    lastActivity: null
  };

  let activities = [];
  let isLoading = true;

  onMount(async () => {
    try {
      await loadDashboardData();
      setupRealTimeUpdates();
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      isLoading = false;
    }
  });

  async function loadDashboardData() {
    const [metricsRes, activitiesRes] = await Promise.all([
      fetch('/api/dashboard/metrics'),
      fetch('/api/dashboard/activities')
    ]);

    if (metricsRes.ok) {
      metrics = await metricsRes.json();
    }

    if (activitiesRes.ok) {
      const data = await activitiesRes.json();
      activities = data.activities || [];
    }
  }

  function setupRealTimeUpdates() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'notification_sent':
          metrics.totalNotifications++;
          addActivity(data);
          break;
        case 'claude_activity':
          metrics.claudeActivities++;
          addActivity(data);
          break;
        case 'tunnel_status':
          metrics.tunnelStatus = data.status;
          break;
      }
    };
  }

  function addActivity(data) {
    activities = [data, ...activities.slice(0, 49)]; // Keep last 50
    metrics.lastActivity = new Date().toISOString();
  }
</script>

<svelte:head>
  <title>Shooter Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>

{#if isLoading}
  <div class="loading">
    <div class="loading-spinner"></div>
    <p>Loading dashboard...</p>
  </div>
{:else}
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>📊 Dashboard</h1>
      <p class="subtitle">Real-time system overview</p>
    </header>

    <!-- Metrics Grid -->
    <div class="metrics-grid">
      <MetricCard
        title="Notifications Sent"
        value={metrics.totalNotifications}
        icon="📱"
        trend="+12% today"
      />

      <MetricCard
        title="Claude Activities"
        value={metrics.claudeActivities}
        icon="🔧"
        trend="+5 this hour"
      />

      <MetricCard
        title="Tunnel Status"
        value={metrics.tunnelStatus}
        icon="🌐"
        status={metrics.tunnelStatus === 'connected' ? 'good' : 'warning'}
      />

      <MetricCard
        title="Last Activity"
        value={metrics.lastActivity ? new Date(metrics.lastActivity).toLocaleTimeString() : 'None'}
        icon="⏱️"
      />
    </div>

    <!-- System Status -->
    <SystemStatus />

    <!-- Recent Activity -->
    <div class="activity-section">
      <h2>🔥 Recent Activity</h2>
      <ActivityFeed {activities} />
    </div>
  </div>
{/if}

<style>
  .dashboard {
    padding-bottom: 2rem;
  }

  .dashboard-header {
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #ffffff;
  }

  .subtitle {
    color: #8b949e;
    font-size: 1rem;
    margin: 0;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    color: #8b949e;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid #30363d;
    border-top: 2px solid #ff6b35;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .activity-section h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: #ffffff;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-header h1 {
      font-size: 1.5rem;
    }
  }
</style>
```

#### **2.2 Claude Code Analytics Dashboard**

**File**: `src/routes/dashboard/analytics/+page.svelte`

```svelte
<script>
  import { onMount } from 'svelte';
  import ConversationsList from '$lib/components/ConversationsList.svelte';
  import ActivityTimeline from '$lib/components/ActivityTimeline.svelte';
  import ToolUsageChart from '$lib/components/ToolUsageChart.svelte';

  let conversations = [];
  let selectedConversation = null;
  let activities = [];
  let toolUsage = {};
  let isConnected = false;
  let ws = null;

  onMount(async () => {
    await loadAnalyticsData();
    setupWebSocket();
  });

  async function loadAnalyticsData() {
    try {
      const [conversationsRes, activitiesRes, toolsRes] = await Promise.all([
        fetch('/api/claude/conversations'),
        fetch('/api/claude/activities'),
        fetch('/api/claude/tool-usage')
      ]);

      if (conversationsRes.ok) {
        conversations = await conversationsRes.json();
      }

      if (activitiesRes.ok) {
        const data = await activitiesRes.json();
        activities = data.activities || [];
      }

      if (toolsRes.ok) {
        toolUsage = await toolsRes.json();
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  }

  function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/api/claude/ws`);

    ws.onopen = () => {
      isConnected = true;
    };

    ws.onclose = () => {
      isConnected = false;
      // Reconnect after 3 seconds
      setTimeout(setupWebSocket, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleRealTimeUpdate(data);
    };
  }

  function handleRealTimeUpdate(data) {
    switch (data.type) {
      case 'new_conversation':
        conversations = [data.conversation, ...conversations];
        break;
      case 'conversation_activity':
        updateConversationActivity(data);
        break;
      case 'tool_executed':
        updateToolUsage(data.tool);
        addActivity(data);
        break;
    }
  }

  function updateConversationActivity(data) {
    const index = conversations.findIndex(c => c.id === data.conversationId);
    if (index !== -1) {
      conversations[index] = { ...conversations[index], ...data.updates };
      conversations = [...conversations];
    }
  }

  function updateToolUsage(toolName) {
    toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
    toolUsage = { ...toolUsage };
  }

  function addActivity(data) {
    activities = [data, ...activities.slice(0, 99)]; // Keep last 100
  }

  function selectConversation(conversation) {
    selectedConversation = conversation;
  }
</script>

<svelte:head>
  <title>Claude Code Analytics - Shooter</title>
</svelte:head>

<div class="analytics-dashboard">
  <header class="analytics-header">
    <div class="header-left">
      <h1>📈 Claude Code Analytics</h1>
      <div class="connection-status" class:connected={isConnected}>
        <span class="status-dot"></span>
        {isConnected ? 'Connected' : 'Connecting...'}
      </div>
    </div>

    <div class="header-stats">
      <div class="stat">
        <span class="stat-value">{conversations.length}</span>
        <span class="stat-label">Conversations</span>
      </div>
      <div class="stat">
        <span class="stat-value">{activities.length}</span>
        <span class="stat-label">Activities</span>
      </div>
      <div class="stat">
        <span class="stat-value">{Object.keys(toolUsage).length}</span>
        <span class="stat-label">Tools Used</span>
      </div>
    </div>
  </header>

  <div class="analytics-content">
    <!-- Mobile-responsive layout -->
    <div class="analytics-grid">
      <!-- Conversations List -->
      <div class="conversations-panel">
        <h2>💬 Active Conversations</h2>
        <ConversationsList
          {conversations}
          {selectedConversation}
          on:select={(e) => selectConversation(e.detail)}
        />
      </div>

      <!-- Activity Timeline -->
      <div class="activity-panel">
        <h2>🔥 Recent Activity</h2>
        <ActivityTimeline {activities} />
      </div>

      <!-- Tool Usage Chart -->
      <div class="tools-panel">
        <h2>🔧 Tool Usage</h2>
        <ToolUsageChart {toolUsage} />
      </div>
    </div>

    <!-- Selected Conversation Details -->
    {#if selectedConversation}
      <div class="conversation-details">
        <h2>📝 Conversation Details</h2>
        <!-- Conversation content here -->
      </div>
    {/if}
  </div>
</div>

<style>
  .analytics-dashboard {
    min-height: calc(100vh - 140px);
  }

  .analytics-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-left h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #ffffff;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 1rem;
    color: #dc3545;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .connection-status.connected {
    background: rgba(40, 167, 69, 0.1);
    border-color: rgba(40, 167, 69, 0.3);
    color: #28a745;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #dc3545;
  }

  .connection-status.connected .status-dot {
    background: #28a745;
  }

  .header-stats {
    display: flex;
    gap: 2rem;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #ff6b35;
  }

  .stat-label {
    font-size: 0.8rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .analytics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .conversations-panel,
  .activity-panel,
  .tools-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .conversations-panel h2,
  .activity-panel h2,
  .tools-panel h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: #ffffff;
  }

  .conversation-details {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .conversation-details h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: #ffffff;
  }

  @media (max-width: 768px) {
    .analytics-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-stats {
      justify-content: space-around;
    }

    .analytics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
```

### **Phase 3: API Endpoints (Week 3)**

#### **3.1 Authentication Endpoints**

**File**: `src/routes/api/auth/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { AuthService } from '$lib/server/auth.js';

export async function POST({ request, cookies }) {
  try {
    const { username, password, action } = await request.json();

    switch (action) {
      case 'login':
        const isValid = await AuthService.validateCredentials(username, password);
        if (!isValid) {
          return json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const token = AuthService.generateToken(username);

        // Set secure cookie
        cookies.set('auth-token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: '/'
        });

        return json({
          success: true,
          user: { username },
          message: 'Login successful'
        });

      case 'logout':
        cookies.delete('auth-token', { path: '/' });
        return json({ success: true, message: 'Logged out' });

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function GET({ request, cookies }) {
  try {
    const token = cookies.get('auth-token');
    if (!token) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = AuthService.validateToken(token);
    if (!payload) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    return json({
      success: true,
      user: { username: payload.username },
      authenticated: true
    });
  } catch (error) {
    return json({ error: 'Authentication validation failed' }, { status: 401 });
  }
}
```

#### **3.2 Dashboard API Endpoints**

**File**: `src/routes/api/dashboard/metrics/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { AuthService } from '$lib/server/auth.js';

export async function GET({ request, cookies }) {
  try {
    // Require authentication
    AuthService.requireAuth({ cookies });

    // Gather metrics from various sources
    const metrics = {
      totalNotifications: await getNotificationCount(),
      claudeActivities: await getClaudeActivityCount(),
      tunnelStatus: await getTunnelStatus(),
      lastActivity: await getLastActivityTime(),
      systemHealth: await getSystemHealth()
    };

    return json(metrics);
  } catch (error) {
    if (
      error.message === 'Authentication required' ||
      error.message === 'Invalid or expired token'
    ) {
      return json({ error: error.message }, { status: 401 });
    }

    console.error('Metrics error:', error);
    return json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}

async function getNotificationCount() {
  // Implementation to count notifications from logs or database
  return 0; // Placeholder
}

async function getClaudeActivityCount() {
  // Implementation to count Claude Code activities
  return 0; // Placeholder
}

async function getTunnelStatus() {
  // Check if tunnel is running
  return 'disconnected'; // Placeholder
}

async function getLastActivityTime() {
  // Get last activity timestamp
  return new Date().toISOString(); // Placeholder
}

async function getSystemHealth() {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };
}
```

### **Phase 4: JavaScript Bridge Preparation (Week 4)**

#### **4.1 Native Bridge Interface Design**

**File**: `src/lib/bridge/native-bridge.js`

```javascript
/**
 * JavaScript Bridge for Native iOS Features
 * This will be used when the iOS app loads the web dashboard in WebView
 */

class NativeBridge {
  constructor() {
    this.isNative = this.detectNativeEnvironment();
    this.capabilities = this.detectCapabilities();
  }

  detectNativeEnvironment() {
    // Check if running in iOS WebView
    return window.webkit && window.webkit.messageHandlers;
  }

  detectCapabilities() {
    if (!this.isNative) {
      return {
        notifications: false,
        deviceInfo: false,
        filesystem: false,
        camera: false
      };
    }

    return {
      notifications: !!window.webkit.messageHandlers.notifications,
      deviceInfo: !!window.webkit.messageHandlers.deviceInfo,
      filesystem: !!window.webkit.messageHandlers.filesystem,
      camera: !!window.webkit.messageHandlers.camera
    };
  }

  // Notification methods
  async requestNotificationPermission() {
    if (!this.capabilities.notifications) {
      throw new Error('Notifications not available');
    }

    return new Promise(resolve => {
      window.webkit.messageHandlers.notifications.postMessage({
        action: 'requestPermission',
        callback: 'notificationPermissionCallback'
      });

      window.notificationPermissionCallback = result => {
        resolve(result);
        delete window.notificationPermissionCallback;
      };
    });
  }

  async sendLocalNotification(title, body, data = {}) {
    if (!this.capabilities.notifications) {
      // Fallback to web notification
      return this.sendWebNotification(title, body, data);
    }

    window.webkit.messageHandlers.notifications.postMessage({
      action: 'sendLocal',
      title,
      body,
      data
    });
  }

  sendWebNotification(title, body, data = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, data });
    }
  }

  // Device info methods
  async getDeviceInfo() {
    if (!this.capabilities.deviceInfo) {
      return this.getWebDeviceInfo();
    }

    return new Promise(resolve => {
      window.webkit.messageHandlers.deviceInfo.postMessage({
        action: 'getInfo',
        callback: 'deviceInfoCallback'
      });

      window.deviceInfoCallback = info => {
        resolve(info);
        delete window.deviceInfoCallback;
      };
    });
  }

  getWebDeviceInfo() {
    return {
      platform: 'web',
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled
    };
  }

  // Authentication bridge
  async authenticateWithBiometrics() {
    if (!this.capabilities.deviceInfo) {
      throw new Error('Biometric authentication not available');
    }

    return new Promise(resolve => {
      window.webkit.messageHandlers.deviceInfo.postMessage({
        action: 'authenticateBiometric',
        callback: 'biometricAuthCallback'
      });

      window.biometricAuthCallback = result => {
        resolve(result);
        delete window.biometricAuthCallback;
      };
    });
  }

  // Utility methods
  async share(content) {
    if (navigator.share) {
      return navigator.share(content);
    }

    if (this.capabilities.deviceInfo) {
      window.webkit.messageHandlers.deviceInfo.postMessage({
        action: 'share',
        content
      });
    }
  }

  async hapticFeedback(type = 'light') {
    if (this.capabilities.deviceInfo) {
      window.webkit.messageHandlers.deviceInfo.postMessage({
        action: 'hapticFeedback',
        type
      });
    }
  }
}

// Global bridge instance
export const nativeBridge = new NativeBridge();

// Auto-initialize when in native environment
if (nativeBridge.isNative) {
  console.log('🔗 Native bridge initialized');
  console.log('📱 Capabilities:', nativeBridge.capabilities);
}
```

#### **4.2 Enhanced Authentication with Bridge**

**File**: `src/lib/components/EnhancedAuth.svelte`

```svelte
<script>
  import { nativeBridge } from '$lib/bridge/native-bridge.js';
  import { onMount } from 'svelte';

  export let onAuthenticated = () => {};

  let username = '';
  let password = '';
  let isLoading = false;
  let error = '';
  let supportsBiometric = false;

  onMount(async () => {
    if (nativeBridge.isNative) {
      try {
        const deviceInfo = await nativeBridge.getDeviceInfo();
        supportsBiometric = deviceInfo.biometricAvailable;
      } catch (err) {
        console.log('Could not get device info:', err);
      }
    }
  });

  async function handleLogin() {
    if (!username || !password) {
      error = 'Please enter username and password';
      return;
    }

    isLoading = true;
    error = '';

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username,
          password
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Add haptic feedback for native
        if (nativeBridge.isNative) {
          await nativeBridge.hapticFeedback('success');
        }

        onAuthenticated(result.user);
      } else {
        error = result.error || 'Login failed';

        if (nativeBridge.isNative) {
          await nativeBridge.hapticFeedback('error');
        }
      }
    } catch (err) {
      error = 'Network error. Please try again.';
      console.error('Login error:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleBiometricLogin() {
    if (!supportsBiometric) return;

    try {
      isLoading = true;
      const result = await nativeBridge.authenticateWithBiometrics();

      if (result.success) {
        // Use stored credentials or session
        onAuthenticated({ username: result.username });
      } else {
        error = 'Biometric authentication failed';
      }
    } catch (err) {
      error = 'Biometric authentication not available';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="auth-container">
  <div class="auth-card">
    <header class="auth-header">
      <h1>🔥 Shooter</h1>
      <p>Analytics Dashboard</p>
    </header>

    <form on:submit|preventDefault={handleLogin}>
      <div class="input-group">
        <label for="username">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="Enter username"
          disabled={isLoading}
          autocomplete="username"
        />
      </div>

      <div class="input-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter password"
          disabled={isLoading}
          autocomplete="current-password"
        />
      </div>

      {#if error}
        <div class="error-message">
          {error}
        </div>
      {/if}

      <div class="auth-actions">
        <button
          type="submit"
          class="login-btn"
          disabled={isLoading || !username || !password}
        >
          {#if isLoading}
            <span class="spinner"></span>
            Logging in...
          {:else}
            Login
          {/if}
        </button>

        {#if supportsBiometric}
          <button
            type="button"
            class="biometric-btn"
            on:click={handleBiometricLogin}
            disabled={isLoading}
          >
            🔒 Biometric Login
          </button>
        {/if}
      </div>
    </form>
  </div>
</div>

<style>
  .auth-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d1117;
    padding: 1rem;
  }

  .auth-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .auth-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .auth-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #ff6b35;
  }

  .auth-header p {
    color: #8b949e;
    margin: 0;
    font-size: 1rem;
  }

  .input-group {
    margin-bottom: 1.5rem;
  }

  .input-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #ffffff;
    font-weight: 500;
  }

  .input-group input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #ffffff;
    font-size: 1rem;
    transition: border-color 0.2s ease;
  }

  .input-group input:focus {
    outline: none;
    border-color: #ff6b35;
  }

  .input-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    color: #dc3545;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }

  .auth-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .login-btn,
  .biometric-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .login-btn {
    background: #ff6b35;
    border: none;
    color: #ffffff;
  }

  .login-btn:hover:not(:disabled) {
    background: #ff8659;
  }

  .login-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .biometric-btn {
    background: rgba(255, 107, 53, 0.1);
    border: 1px solid rgba(255, 107, 53, 0.3);
    color: #ff6b35;
  }

  .biometric-btn:hover:not(:disabled) {
    background: rgba(255, 107, 53, 0.2);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
```

---

## 🚀 **Implementation Commands**

### **Environment Setup**

```bash
# Install additional dependencies
npm install jsonwebtoken bcrypt ws chokidar

# Environment variables for .env
echo "JWT_SECRET=your-secure-jwt-secret-key" >> .env
echo "AUTH_USERNAME=admin" >> .env
echo "AUTH_PASSWORD=your-secure-password" >> .env
```

### **Development Commands**

```bash
# Start development server with analytics
npm run dev

# Access authenticated dashboard
open http://localhost:5173/dashboard

# Test authentication
curl -X POST http://localhost:5173/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","username":"admin","password":"your-password"}'
```

### **Deployment to Vercel**

```bash
# Deploy with environment variables
vercel --env JWT_SECRET=production-secret
vercel --env AUTH_USERNAME=admin
vercel --env AUTH_PASSWORD=production-password
```

This architecture gives you a **complete web-first dashboard** that can later be embedded in iOS WebView with minimal native code, while maintaining all the Claude Code analytics capabilities we analyzed.
