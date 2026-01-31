<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ChatHeader,
    ChatView,
    ConnectionStatus,
    NotificationBubble,
    DeliveryStatus
  } from '$lib/components/analytics';
  import { getDataService } from '$lib/data/data-service';
  import { createRealTimeService, type ShooterRealTimeService } from '$lib/realtime';
  import type {
    WebSocketMessagePayload,
    GenericPayload as _GenericPayload,
    NotificationHistory as _NotificationHistory,
    NotificationAPIResponse
  } from '$types';
  import type {
    AnalyticsMetrics,
    ConversationData
  } from '$lib/types/data-services';
  import type { NotificationSession } from '$lib/data/data-service';

  interface NotificationHistoryResponse {
    notifications: NotificationSession[];
    deliveries: NotificationAPIResponse[];
  }

  let mounted = false;
  let conversations: ConversationData[] = [];
  let selectedConversation: ConversationData | null = null;
  let recentNotifications: NotificationSession[] = [];
  let dashboardMetrics: AnalyticsMetrics | null = null;
  let connectionStatus: { connected?: boolean } | null = null;
  let recentDeliveries: NotificationAPIResponse[] = [];
  let showSettings = false;

  const dataService = getDataService();
  let realTimeService: ShooterRealTimeService | null = null;
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  
  onMount(async () => {
    mounted = true;
    
    // Only initialize in browser
    if (typeof window !== 'undefined') {
      // Initialize real-time service
      try {
        realTimeService = createRealTimeService({
          websocket: {
            url: 'ws://localhost:7777/ws'
          },
          notifications: {
            enableApnsIntegration: false, // Disable for development
            retryFailedNotifications: false
          }
        });
        
        await realTimeService.initialize();
        
        // Subscribe to real-time events
        realTimeService.subscribeToEvents('conversation_updated', handleConversationUpdate);
        realTimeService.subscribeToEvents('notification_status_updated', handleNotificationUpdate);
        
        connectionStatus = realTimeService.getConnectionStatus();

        } catch (error) {
        console.warn('[Dashboard] Real-time service initialization failed:', error);
      }
      
      // Set up periodic refresh
      refreshInterval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    }
    
    // Load initial data
    await loadDashboardData();
  });
  
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      if (realTimeService) {
        realTimeService.destroy();
      }
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    }
  });
  
  async function loadDashboardData() {
    try {
      // Load dashboard metrics
      dashboardMetrics = await dataService.getDashboardMetrics();

      // Load recent notifications with proper typing
      const notificationHistory = await dataService.getNotificationHistory(10, 0) as NotificationHistoryResponse;
      recentNotifications = notificationHistory.notifications || [];

      // Load recent deliveries
      recentDeliveries = notificationHistory.deliveries || [];

      // Generate mock conversations for demo
      conversations = generateMockConversations();


      } catch (error) {
      console.error('[Dashboard] Failed to load data:', error);

      // Fallback to mock data
      dashboardMetrics = {
        conversations: {
          total: 5,
          active: 2,
          archived: 3,
          averageMessages: 12,
          totalMessages: 60
        },
        notifications: {
          total: 127,
          sent: 120,
          delivered: 115,
          failed: 5,
          pending: 2,
          successRate: 98.5
        },
        system: {
          uptime: 86400,
          memoryUsage: {
            used: 512000000,
            total: 1024000000,
            heapUsed: 256000000,
            heapTotal: 512000000,
            rss: 512000000,
            external: 10000000,
            percentage: 50
          },
          cpuUsage: 25,
          requestsPerMinute: 120,
          errorRate: 1.5,
          averageResponseTime: 50
        }
      };

      recentNotifications = [
        {
          id: '1',
          title: 'SHOOTER Tool Used',
          description: 'File analysis completed',
          type: 'feature',
          timestamp: new Date(Date.now() - 2 * 60 * 1000),
          status: 'sent'
        },
        {
          id: '2',
          title: 'File Modified',
          description: 'Authentication system updated',
          type: 'debug',
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          status: 'sent'
        },
        {
          id: '3',
          title: 'Task Completed',
          description: 'Component integration finished',
          type: 'testing',
          timestamp: new Date(Date.now() - 10 * 60 * 1000),
          status: 'sent'
        }
      ];

      recentDeliveries = [
        {
          notificationId: 'msg_1',
          sent: 1,
          failed: 0,
          filtered: 0,
          timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
          details: [{
            deviceToken: 'mock_token_1',
            status: 'sent'
          }]
        },
        {
          notificationId: 'msg_2',
          sent: 0,
          failed: 1,
          filtered: 0,
          timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          details: [{
            deviceToken: 'mock_token_2',
            status: 'failed',
            error: 'Device token invalid'
          }]
        }
      ];
    }
  }
  
  function generateMockConversations(): ConversationData[] {
    return [
      {
        id: 'conv_1',
        title: 'Authentication System Implementation',
        messages: [
          {
            id: 'msg_1',
            conversationId: 'conv_1',
            role: 'user',
            content: 'Implement JWT authentication',
            timestamp: Date.now() - 30 * 60 * 1000,
            status: 'delivered',
            metadata: {}
          },
          {
            id: 'msg_2',
            conversationId: 'conv_1',
            role: 'assistant',
            content: 'I\'ll implement a secure JWT authentication system...',
            timestamp: Date.now() - 25 * 60 * 1000,
            status: 'delivered',
            metadata: { hasCode: true }
          }
        ],
        createdAt: Date.now() - 35 * 60 * 1000,
        updatedAt: Date.now() - 25 * 60 * 1000,
        messageCount: 2,
        status: 'active'
      },
      {
        id: 'conv_2',
        title: 'Real-time WebSocket Integration',
        messages: [
          {
            id: 'msg_3',
            conversationId: 'conv_2',
            role: 'user',
            content: 'Add WebSocket support for real-time updates',
            timestamp: Date.now() - 15 * 60 * 1000,
            status: 'delivered',
            metadata: {}
          }
        ],
        createdAt: Date.now() - 20 * 60 * 1000,
        updatedAt: Date.now() - 15 * 60 * 1000,
        messageCount: 1,
        status: 'active'
      }
    ];
  }
  
  function handleConversationUpdate(payload: WebSocketMessagePayload) {
    // Type guard: only GenericPayload has a data property
    if (!('data' in payload) || !payload.data) {
      return;
    }

    // Extract conversation data from GenericPayload
    const data = payload.data as { conversation?: ConversationData };
    if (!data.conversation) {
      return;
    }

    const conversation = data.conversation;
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations = [conversation, ...conversations];
    }

    // Update selected conversation if it's the one that changed
    if (selectedConversation && selectedConversation.id === conversation.id) {
      selectedConversation = conversation;
    }
  }

  function handleNotificationUpdate(payload: WebSocketMessagePayload) {
    // Type guard: only GenericPayload has a data property
    if (!('data' in payload) || !payload.data) {
      return;
    }

    // Extract delivery response from GenericPayload
    const data = payload.data as { response?: NotificationAPIResponse };
    if (!data.response) {
      return;
    }

    const response = data.response;
    recentDeliveries = [response, ...recentDeliveries.slice(0, 9)];
  }

  function handleConversationSelect(event: CustomEvent<{ conversation: ConversationData | null | undefined }>) {
    selectedConversation = event.detail.conversation || null;
  }

  function handleRefresh() {
    loadDashboardData();
  }

  function _formatTimeAgo(timestamp: string | Date): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) {
      return 'Just now';
    }
    if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  function getHealthStatusClass(value: number): string {
    if (value >= 80) {
      return 'status-success';
    }
    if (value >= 50) {
      return 'status-warning';
    }
    return 'status-error';
  }

  function getSuccessRateClass(value: number): string {
    if (value >= 95) {
      return 'status-success';
    }
    if (value >= 85) {
      return 'status-warning';
    }
    return 'status-error';
  }
</script>

<svelte:head>
  <title>SHOOTER Dashboard</title>
</svelte:head>

{#if mounted}
  <div class="dashboard">
    <!-- Dashboard Header with Real-time Stats -->
    <div class="dashboard-header">
      <ChatHeader
        title="🎯 SHOOTER Analytics Dashboard"
        conversationCount={conversations.length}
        isConnected={connectionStatus?.connected || false}
        lastUpdate={null}
        on:refresh={handleRefresh}
      />

      {#if connectionStatus}
        <div class="connection-status-wrapper">
          <ConnectionStatus
            status={{ connected: connectionStatus.connected || false, connecting: false, reconnecting: false, reconnectAttempts: 0 }}
            position="relative"
            compact={true}
          />
        </div>
      {/if}
    </div>

    <div class="dashboard-grid">
      <!-- Left Sidebar: Quick Stats -->
      <aside class="sidebar">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-content">
              <div class="stat-label">Total Notifications</div>
              <div class="stat-value">{dashboardMetrics?.notifications.total || 0}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">📱</div>
            <div class="stat-content">
              <div class="stat-label">Active Conversations</div>
              <div class="stat-value">{dashboardMetrics?.conversations.active || 0}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-content">
              <div class="stat-label">CPU Usage</div>
              <div class="stat-value {getHealthStatusClass(dashboardMetrics?.system.cpuUsage || 0)}">{dashboardMetrics?.system.cpuUsage.toFixed(1) || 0}%</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-content">
              <div class="stat-label">Success Rate</div>
              <div class="stat-value {getSuccessRateClass(dashboardMetrics?.notifications.successRate || 0)}">{dashboardMetrics?.notifications.successRate.toFixed(1) || 0}%</div>
            </div>
          </div>
        </div>

        <!-- Recent Notifications -->
        <div class="recent-notifications">
          <h3>Recent Activity</h3>
          <div class="notification-bubbles">
            {#each recentNotifications.slice(0, 5) as notification}
              <NotificationBubble
                {notification}
                variant="compact"
                autoHide={false}
                showActions={false}
              />
            {/each}
          </div>
        </div>
      </aside>

      <!-- Main Content: Chat View -->
      <main class="main-content">
        <div class="chat-container">
          <ChatView
            {conversations}
            {selectedConversation}
            autoScroll={true}
            showTimestamps={true}
            showAvatars={false}
            on:conversationSelect={handleConversationSelect}
          />
        </div>
      </main>

      <!-- Right Sidebar: Delivery Status -->
      <aside class="delivery-sidebar">
        <h3>📤 Delivery Status</h3>
        <div class="delivery-list">
          {#each recentDeliveries.slice(0, 8) as delivery}
            <DeliveryStatus
              {delivery}
              compact={true}
              showRetry={!delivery.success}
              showDetails={false}
            />
          {/each}
        </div>
        
        <!-- Quick Actions -->
        <div class="quick-actions">
          <h3>⚡ Quick Actions</h3>
          <button class="action-btn" on:click={() => showSettings = true}>
            ⚙️ Settings
          </button>
          <button class="action-btn" on:click={() => window.location.href = '/system-monitoring'}>
            🔍 System Monitor
          </button>
          <button class="action-btn" on:click={() => window.location.href = '/notifications'}>
            📱 Notifications
          </button>
          <button class="action-btn" on:click={() => window.location.href = '/'}>
            🏠 Home
          </button>
        </div>
      </aside>
    </div>

    <!-- Settings Modal -->
    {#if showSettings}
      <div
        class="modal-overlay"
        role="presentation"
        on:click={() => showSettings = false}
        on:keydown={(e) => e.key === 'Escape' && (showSettings = false)}
      >
        <div
          class="modal-content"
          role="dialog"
          tabindex="-1"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          on:click|stopPropagation
          on:keydown|stopPropagation
        >
          <div class="modal-header">
            <h3 id="settings-modal-title">⚙️ Dashboard Settings</h3>
            <button class="close-btn" on:click={() => showSettings = false}>✕</button>
          </div>
          <div class="modal-body">
            <div class="setting-group">
              <label>
                <input type="checkbox" checked> Auto-refresh every 30s
              </label>
            </div>
            <div class="setting-group">
              <label>
                <input type="checkbox" checked> Show real-time notifications
              </label>
            </div>
            <div class="setting-group">
              <label>
                <input type="checkbox" checked> Dark mode
              </label>
            </div>
            <div class="setting-group">
              <label>
                Refresh interval:
                <select>
                  <option value="10">10 seconds</option>
                  <option value="30" selected>30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300">5 minutes</option>
                </select>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" on:click={() => showSettings = false}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="loading">
    <div class="loading-spinner"></div>
    <div class="loading-text">Initializing SHOOTER Dashboard...</div>
  </div>
{/if}

<style>
  .dashboard {
    min-height: 100vh;
    background: var(--bg-color-primary);
    display: flex;
    flex-direction: column;
    padding: 0;
    margin: 0;
  }

  .dashboard-header {
    border-bottom: 1px solid var(--border-color-primary);
    background: var(--bg-color-secondary);
    position: sticky;
    top: 0;
    z-index: 10;
    padding: var(--spacing-md);
  }

  .connection-status-wrapper {
    padding: var(--spacing-xs) var(--spacing-md);
    border-top: 1px solid var(--border-color-primary);
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    gap: var(--spacing-md);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Left Sidebar */
  .sidebar {
    background: var(--bg-color-secondary);
    border-right: 1px solid var(--border-color-primary);
    padding: var(--spacing-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch; /* Explicit alignment */
  }

  .stats-grid {
    display: grid;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xxl);
    align-items: start; /* Cards align to top */
  }

  .stat-card {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    transition: all 0.2s ease;
  }

  .stat-card:hover {
    background: var(--bg-color-tertiary);
    border-color: var(--border-color-secondary);
  }

  .stat-icon {
    font-size: var(--font-size-xl);
    background: var(--border-color-primary);
    padding: var(--spacing-xs);
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
    min-width: 0;
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--text-color-secondary);
    margin-bottom: var(--spacing-xxs);
    font-weight: var(--font-weight-medium);
  }

  .stat-value {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-color-primary);
  }

  .stat-value.status-success {
    color: var(--status-color-success);
  }

  .stat-value.status-warning {
    color: var(--status-color-warning);
  }

  .stat-value.status-error {
    color: var(--status-color-error);
  }

  .recent-notifications h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin-bottom: var(--spacing-md);
    margin-top: 0;
  }

  .notification-bubbles {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* Main Content */
  .main-content {
    background: var(--bg-color-primary);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .chat-container {
    flex: 1;
    min-height: 0;
  }

  /* Right Sidebar */
  .delivery-sidebar {
    background: var(--bg-color-secondary);
    border-left: 1px solid var(--border-color-primary);
    padding: var(--spacing-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch; /* Consistent with left sidebar */
  }

  .delivery-sidebar h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin-bottom: var(--spacing-md);
    margin-top: 0;
  }

  .delivery-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xxl);
  }

  .quick-actions {
    border-top: 1px solid var(--border-color-primary);
    padding-top: var(--spacing-md);
  }

  .quick-actions h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
    margin-bottom: var(--spacing-md);
    margin-top: 0;
  }

  .action-btn {
    display: block;
    width: 100%;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    color: var(--text-color-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: var(--spacing-xs);
    text-align: left;
  }

  .action-btn:hover {
    background: var(--status-color-info-hover);
    border-color: var(--status-color-info-hover);
  }

  /* Loading State */
  .loading {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: var(--bg-color-primary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color-primary);
    border-top: 3px solid var(--status-color-info-hover);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--spacing-md);
  }

  .loading-text {
    color: var(--text-color-secondary);
    font-size: var(--font-size-lg);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Settings Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--overlay-dark-heavy);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-xl);
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 20px 40px var(--overlay-dark-light);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--border-color-primary);
  }

  .modal-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-color-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-color-secondary);
    font-size: var(--font-size-xl);
    cursor: pointer;
    padding: var(--spacing-xxs);
    border-radius: var(--radius-xs);
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--border-color-primary);
  }

  .modal-body {
    padding: var(--spacing-lg);
  }

  .setting-group {
    margin-bottom: var(--spacing-lg);
  }

  .setting-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    cursor: pointer;
  }

  .setting-group input[type="checkbox"] {
    accent-color: var(--status-color-info-hover);
  }

  .setting-group select {
    background: var(--border-color-primary);
    border: 1px solid var(--border-color-tertiary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs);
    margin-left: var(--spacing-xs);
  }

  .modal-footer {
    padding: var(--spacing-lg);
    border-top: 1px solid var(--border-color-primary);
    text-align: right;
  }

  .btn {
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-md);

    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .btn-primary {
    background: var(--status-color-info-hover);
  }

  .btn-primary:hover {
    background: var(--status-color-info-hover);
  }

  /* Responsive Design */
  @media (max-width: 1200px) {
    .dashboard-grid {
      grid-template-columns: 250px 1fr 250px;
    }
  }

  @media (max-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto;
    }
    
    .sidebar, .delivery-sidebar {
      border: none;
      border-bottom: 1px solid var(--border-color-primary);
      max-height: 200px;
    }
    
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .dashboard {
      max-width: 100vw;
      overflow-x: hidden;
    }

    .dashboard-grid {
      gap: var(--spacing-sm);
      padding: 0;
      width: 100%;
    }

    .sidebar, .delivery-sidebar {
      padding: var(--spacing-sm);
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    .stats-grid {
      grid-template-columns: 1fr;
      gap: var(--spacing-xs);
      width: 100%;
    }

    .stat-card {
      padding: var(--spacing-sm);
      width: 100%;
      box-sizing: border-box;
    }

    .stat-icon {
      font-size: 1.5rem;
    }

    .stat-label {
      font-size: 0.875rem;
    }

    .stat-value {
      font-size: 1.5rem;
    }

    .modal-content {
      width: 95%;
      max-width: 95vw;
      margin: var(--spacing-sm);
      box-sizing: border-box;
    }

    .modal-header, .modal-body, .modal-footer {
      padding: var(--spacing-sm);
    }

    .recent-notifications h3,
    .delivery-sidebar h3 {
      font-size: 1rem;
      margin-bottom: var(--spacing-sm);
    }
  }
</style>