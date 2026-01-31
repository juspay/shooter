/**
 * APNs Integration with WebSocket System
 * Connects real-time WebSocket events to Apple Push Notification service
 */

import { getDataService, type NotificationSession } from '$lib/data/data-service';
// Note: WebSocket functions not exported from +server.ts per SvelteKit requirements
// import { broadcastNotificationEvent, sendNotificationToUser } from '../../routes/ws/+server';
import type {
  NotificationAPIRequest,
  NotificationAPIResponse,
  ConversationData,
  MessageData,
  ToolExecutionContext,
  StatusUpdatePayload,
  SystemMetrics
} from '$types';
import { createShooterEventHandler, type ShooterEventHandler } from './shooter-events';
import { initializeWebSocketService } from './websocket-service';

// APNs status tracking
interface ApnsStatus {
  isConnected: boolean;
  lastSuccessfulConnection: Date | null;
  lastError: string | null;
  totalNotificationsSent: number;
  totalNotificationsFailed: number;
  averageResponseTime: number;
  recentMetrics: ApnsMetric[];
}

interface ApnsMetric {
  timestamp: Date;
  messageId: string;
  status: 'sent' | 'failed' | 'filtered';
  responseTime: number;
  deviceToken?: string;
  error?: string;
}

// Global APNs status
let apnsStatus: ApnsStatus = {
  isConnected: false,
  lastSuccessfulConnection: null,
  lastError: null,
  totalNotificationsSent: 0,
  totalNotificationsFailed: 0,
  averageResponseTime: 0,
  recentMetrics: []
};

// WebSocket integration class
export class ApnsWebSocketIntegration {
  private dataService: ReturnType<typeof getDataService>;
  private eventHandler: ShooterEventHandler | null = null;
  private notificationQueue: NotificationAPIRequest[] = [];
  private isProcessing = false;
  private retryAttempts = new Map<string, number>();
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds

  constructor() {
    this.dataService = getDataService();
    this.initializeEventHandlers();
  }

  private async initializeEventHandlers(): Promise<void> {
    try {
      // Initialize WebSocket service
      const wsService = initializeWebSocketService();

      // Create event handler
      this.eventHandler = createShooterEventHandler(wsService);

      // Setup APNs-specific event listeners
      this.setupApnsEventListeners();

      console.log('[APNs Integration] Event handlers initialized');
    } catch (error) {
      console.error('[APNs Integration] Failed to initialize event handlers:', error);
    }
  }

  private setupApnsEventListeners(): void {
    if (!this.eventHandler) {
return;
}

    // Listen for notification requests from analytics events
    this.eventHandler.on('conversation_updated', this.handleConversationNotification.bind(this));
    this.eventHandler.on('tool_executed', this.handleToolExecutionNotification.bind(this));
    this.eventHandler.on('session_state_changed', this.handleSessionNotification.bind(this));
    
    // Listen for system health updates
    this.eventHandler.on('system_health_updated', this.handleSystemHealthNotification.bind(this));
    this.eventHandler.on('apns_status_updated', this.handleApnsStatusUpdate.bind(this));
  }

  // Main notification processing
  public async processNotification(request: NotificationAPIRequest): Promise<NotificationAPIResponse> {
    const startTime = Date.now();
    const messageId = this.generateMessageId();

    try {
      console.log(`[APNs Integration] Processing notification: ${messageId}`);

      // Add to queue for processing
      this.notificationQueue.push({ ...request, messageId });
      
      // Process queue
      const response = await this.processNotificationQueue();
      
      // Record metrics
      const responseTime = Date.now() - startTime;
      await this.recordApnsMetric({
        timestamp: new Date(),
        messageId,
        status: response.success ? 'sent' : 'failed',
        responseTime,
        ...(response.error && { error: response.error })
      });

      // Broadcast result via WebSocket
      await this.broadcastNotificationResult(messageId, response);

      return response;
    } catch (error) {
      const errorResponse: NotificationAPIResponse = {
        notificationId: messageId,
        success: false,
        error: `APNs processing failed: ${(error as Error).message}`,
        messageId,
        timestamp: new Date().toISOString(),
        sent: 0,
        failed: 0,
        filtered: 0,
        details: []
      };

      // Record failed metric
      await this.recordApnsMetric({
        timestamp: new Date(),
        messageId,
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: (error as Error).message
      });

      // Broadcast failure
      await this.broadcastNotificationResult(messageId, errorResponse);

      return errorResponse;
    }
  }

  private async processNotificationQueue(): Promise<NotificationAPIResponse> {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return {
        notificationId: `queue-${Date.now()}`,
        success: false,
        error: 'Queue is empty or already processing',
        timestamp: new Date().toISOString(),
        sent: 0,
        failed: 0,
        filtered: 0,
        details: []
      };
    }

    this.isProcessing = true;

    try {
      const notification = this.notificationQueue.shift();
      if (!notification) {
        throw new Error('No notification to process');
      }

      // Send via DataService (which handles APNs)
      const response = await this.dataService.sendNotification(notification);
      
      // Update APNs status based on response
      await this.updateApnsStatus(response);
      
      return response;
    } catch (error) {
      console.error('[APNs Integration] Queue processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      
      // Process next item if queue has more
      if (this.notificationQueue.length > 0) {
        setTimeout(() => this.processNotificationQueue(), 100);
      }
    }
  }

  // Event handlers for different notification triggers
  private async handleConversationNotification(data: {
    conversation: ConversationData;
    notificationSession: NotificationSession
  }): Promise<void> {
    try {
      const { conversation, notificationSession } = data;
      
      // Determine if this conversation should trigger a notification
      if (!this.shouldNotifyForConversation(conversation)) {
        return;
      }

      const request: NotificationAPIRequest = {
        title: `📝 New Claude Code Activity`,
        message: `${notificationSession.title}: ${notificationSession.description}`,
        category: notificationSession.type,
        data: {
          type: 'conversation_update',
          conversationId: conversation.id,
          sessionId: notificationSession.id,
          messageCount: conversation.messages?.length || 0,
          timestamp: new Date().toISOString()
        }
      };

      await this.processNotification(request);
    } catch (error) {
      console.error('[APNs Integration] Conversation notification failed:', error);
    }
  }

  private async handleToolExecutionNotification(data: ToolExecutionContext & { sessionId?: string }): Promise<void> {
    try {
      const { toolName, duration, sessionId = 'unknown' } = data;
      
      // Only notify for significant tool executions
      if (duration < 3000) { // Less than 3 seconds
        return;
      }

      const request: NotificationAPIRequest = {
        title: `🔧 Tool Execution Complete`,
        message: `${toolName} completed in ${Math.round(duration / 1000)}s`,
        category: 'debug',
        data: {
          type: 'tool_execution',
          toolName,
          duration,
          sessionId,
          timestamp: new Date().toISOString()
        }
      };

      await this.processNotification(request);
    } catch (error) {
      console.error('[APNs Integration] Tool execution notification failed:', error);
    }
  }

  private async handleSessionNotification(data: {
    sessionId: string;
    state: string;
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      const { sessionId, state, metadata = {} } = data;
      
      // Only notify for session start/end
      if (state !== 'started' && state !== 'completed') {
        return;
      }

      const isStart = state === 'started';
      const request: NotificationAPIRequest = {
        title: isStart ? '🚀 Claude Code Session Started' : '✅ Claude Code Session Completed',
        message: isStart ? 'New coding session is active' : `Session completed with ${metadata.messageCount || 0} messages`,
        category: 'feature',
        data: {
          type: 'session_state',
          sessionId,
          state,
          metadata,
          timestamp: new Date().toISOString()
        }
      };

      await this.processNotification(request);
    } catch (error) {
      console.error('[APNs Integration] Session notification failed:', error);
    }
  }

  private async handleSystemHealthNotification(data: {
    component: string;
    status: string;
    metrics?: SystemMetrics
  }): Promise<void> {
    try {
      const { component, status, metrics } = data;
      
      // Only notify for critical issues
      if (status !== 'down') {
        return;
      }

      const request: NotificationAPIRequest = {
        title: `⚠️ System Alert`,
        message: `${component} is experiencing issues`,
        category: 'error',
        data: {
          type: 'system_health',
          component,
          status,
          metrics,
          timestamp: new Date().toISOString()
        }
      };

      await this.processNotification(request);
    } catch (error) {
      console.error('[APNs Integration] System health notification failed:', error);
    }
  }

  private async handleApnsStatusUpdate(data: StatusUpdatePayload): Promise<void> {
    try {
      console.log('[APNs Integration] APNs status updated:', data);
      
      // Update local status
      apnsStatus.isConnected = data.status === 'connected';
      if (data.metrics) {
        // Update metrics from the status update
        Object.assign(apnsStatus, data.metrics);
      }

      // TODO: Re-implement WebSocket broadcasting via HTTP endpoint per SvelteKit requirements
      // await broadcastNotificationEvent({
      //   type: 'apns_status_change',
      //   payload: { status: data.status, metrics: apnsStatus, timestamp: Date.now() },
      //   timestamp: Date.now(),
      //   id: this.generateMessageId()
      // });
    } catch (error) {
      console.error('[APNs Integration] APNs status update failed:', error);
    }
  }

  // Notification result broadcasting
  private async broadcastNotificationResult(_messageId: string, _response: NotificationAPIResponse): Promise<void> {
    try {
      // const eventType = response.success ? 'notification_sent' : 'notification_failed';

      // TODO: Re-implement WebSocket broadcasting via HTTP endpoint per SvelteKit requirements
      // await broadcastNotificationEvent({
      //   type: eventType,
      //   payload: { messageId, response, timestamp: Date.now() },
      //   timestamp: Date.now(),
      //   id: this.generateMessageId()
      // });
    } catch (error) {
      console.error('[APNs Integration] Failed to broadcast notification result:', error);
    }
  }

  // APNs status management
  private async updateApnsStatus(response: NotificationAPIResponse): Promise<void> {
    if (response.success) {
      apnsStatus.isConnected = true;
      apnsStatus.lastSuccessfulConnection = new Date();
      apnsStatus.totalNotificationsSent++;
      apnsStatus.lastError = null;
    } else {
      apnsStatus.totalNotificationsFailed++;
      apnsStatus.lastError = response.error || 'Unknown error';
      
      // Don't mark as disconnected for single failures
      // Only mark disconnected after multiple consecutive failures
      const recentFailures = apnsStatus.recentMetrics
        .filter(m => m.timestamp > new Date(Date.now() - 300000)) // Last 5 minutes
        .filter(m => m.status === 'failed').length;
      
      if (recentFailures >= 5) {
        apnsStatus.isConnected = false;
      }
    }

    // Update average response time
    const recentMetrics = apnsStatus.recentMetrics.slice(-10); // Last 10 metrics
    if (recentMetrics.length > 0) {
      apnsStatus.averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    }
  }

  private async recordApnsMetric(metric: ApnsMetric): Promise<void> {
    apnsStatus.recentMetrics.push(metric);
    
    // Keep only last 100 metrics
    if (apnsStatus.recentMetrics.length > 100) {
      apnsStatus.recentMetrics = apnsStatus.recentMetrics.slice(-100);
    }
  }

  // Notification filtering logic
  private shouldNotifyForConversation(conversation: ConversationData): boolean {
    // Don't notify for conversations with no messages
    if (!conversation.messages || conversation.messages.length === 0) {
      return false;
    }

    // Don't notify for very old conversations (more than 1 hour old)
    const conversationAge = Date.now() - new Date(conversation.updatedAt).getTime();
    if (conversationAge > 3600000) { // 1 hour
      return false;
    }

    // Don't notify for conversations with only system messages
    const hasUserOrAssistantMessages = conversation.messages.some(
      (m: MessageData) => m.role === 'user' || m.role === 'assistant'
    );

    return hasUserOrAssistantMessages;
  }

  // Retry logic for failed notifications
  public async retryFailedNotification(messageId: string): Promise<NotificationAPIResponse> {
    const currentAttempts = this.retryAttempts.get(messageId) || 0;
    
    if (currentAttempts >= this.maxRetries) {
      return {
        notificationId: messageId,
        success: false,
        error: `Max retries (${this.maxRetries}) exceeded for notification ${messageId}`,
        messageId,
        timestamp: new Date().toISOString(),
        sent: 0,
        failed: 1,
        filtered: 0,
        details: []
      };
    }

    this.retryAttempts.set(messageId, currentAttempts + 1);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (currentAttempts + 1)));
    
    // Find the original notification (this is simplified - in practice you'd store failed notifications)
    console.log(`[APNs Integration] Retrying notification ${messageId} (attempt ${currentAttempts + 1})`);
    
    // This would need to be implemented based on your specific retry requirements
    return {
      notificationId: messageId,
      success: false,
      error: 'Retry logic not fully implemented',
      messageId,
      timestamp: new Date().toISOString(),
      sent: 0,
      failed: 1,
      filtered: 0,
      details: []
    };
  }

  // Utility methods
  private generateMessageId(): string {
    return `apns_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for getting APNs status
  public getApnsStatus(): ApnsStatus {
    return { ...apnsStatus };
  }

  public async getApnsMetrics(): Promise<{
    status: ApnsStatus;
    recentActivity: ApnsMetric[];
    healthScore: number;
  }> {
    const now = Date.now();
    const recentActivity = apnsStatus.recentMetrics.filter(
      m => now - m.timestamp.getTime() < 3600000 // Last hour
    );

    // Calculate health score (0-100)
    const totalRecent = recentActivity.length;
    const successfulRecent = recentActivity.filter(m => m.status === 'sent').length;
    const healthScore = totalRecent > 0 ? Math.round((successfulRecent / totalRecent) * 100) : 100;

    return {
      status: this.getApnsStatus(),
      recentActivity,
      healthScore
    };
  }

  // Cleanup
  public destroy(): void {
    if (this.eventHandler) {
      this.eventHandler.destroy();
    }
    this.notificationQueue.length = 0;
    this.retryAttempts.clear();
  }
}

// Global instance
let apnsIntegration: ApnsWebSocketIntegration | null = null;

// Factory function
export function getApnsIntegration(): ApnsWebSocketIntegration {
  if (!apnsIntegration) {
    apnsIntegration = new ApnsWebSocketIntegration();
  }
  return apnsIntegration;
}

// Convenience functions for external use
export async function sendNotificationViaWebSocket(request: NotificationAPIRequest): Promise<NotificationAPIResponse> {
  const integration = getApnsIntegration();
  return integration.processNotification(request);
}

export async function getApnsHealthStatus(): Promise<{
  status: ApnsStatus;
  recentActivity: ApnsMetric[];
  healthScore: number;
}> {
  const integration = getApnsIntegration();
  return integration.getApnsMetrics();
}

export async function retryNotification(messageId: string): Promise<NotificationAPIResponse> {
  const integration = getApnsIntegration();
  return integration.retryFailedNotification(messageId);
}
