/**
 * Shooter-specific WebSocket Event Handling
 * Custom event handlers for Shooter analytics and notification system
 */

import type {
  WebSocketMessage,
  WebSocketService
} from './websocket-service';
import type {
  NotificationAPIResponse
} from '$types';
import {
  mapConversationToNotificationSession,
  type NotificationSession,
  type ConversationData
} from '$lib/data/data-service';
import { getDataService } from '$lib/data/data-service';

// Event type definitions for Shooter
// These align with ClaudeWebSocketMessage structure (using 'data' not 'payload')
export interface ShooterAnalyticsEvent {
  type: 'analytics_update' | 'conversation_change' | 'session_state_change' | 'tool_execution';
  data: {
    type: string;
    data?: {
      eventType: string;
      eventData: unknown;
      source: 'claude_code' | 'shooter_dashboard' | 'ios_app';
      userId?: string;
      sessionId?: string;
    };
    timestamp?: number;
  };
  id: string;
  timestamp: number;
}

export interface ShooterNotificationEvent {
  type: 'notification_sent' | 'notification_failed' | 'notification_filtered' | 'notification_interaction';
  data: {
    type: string;
    data?: {
      notificationId: string;
      status: 'sent' | 'failed' | 'filtered' | 'pending';
      response?: NotificationAPIResponse;
      interaction?: {
        action: string;
        timestamp: number;
        userId?: string;
      };
    };
    timestamp?: number;
  };
  id: string;
  timestamp: number;
}

export interface ShooterSystemEvent {
  type: 'system_health_update' | 'apns_status_change' | 'connection_stats_update';
  data: {
    type: string;
    data?: {
      component: string;
      status: 'healthy' | 'degraded' | 'down';
      metrics?: Record<string, unknown>;
    };
    timestamp?: number;
  };
  id: string;
  timestamp: number;
}

// Shooter-specific event handlers
export class ShooterEventHandler {
  private wsService: WebSocketService;
  private dataService: ReturnType<typeof getDataService>;
  private eventListeners = new Map<string, Set<Function>>();
  private messageQueue: WebSocketMessage[] = [];
  private isProcessing = false;

  constructor(wsService: WebSocketService) {
    this.wsService = wsService;
    this.dataService = getDataService();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Analytics events
    this.wsService.subscribe('analytics_update', this.handleAnalyticsUpdate.bind(this));
    this.wsService.subscribe('conversation_change', this.handleConversationChange.bind(this));
    this.wsService.subscribe('session_state_change', this.handleSessionStateChange.bind(this));
    this.wsService.subscribe('tool_execution', this.handleToolExecution.bind(this));

    // Notification events
    this.wsService.subscribe('notification_sent', this.handleNotificationSent.bind(this));
    this.wsService.subscribe('notification_failed', this.handleNotificationFailed.bind(this));
    this.wsService.subscribe('notification_filtered', this.handleNotificationFiltered.bind(this));
    this.wsService.subscribe('notification_interaction', this.handleNotificationInteraction.bind(this));

    // System events
    this.wsService.subscribe('system_health_update', this.handleSystemHealthUpdate.bind(this));
    this.wsService.subscribe('apns_status_change', this.handleApnsStatusChange.bind(this));
    this.wsService.subscribe('connection_stats_update', this.handleConnectionStatsUpdate.bind(this));

    // Generic message handler for queue processing
    this.wsService.subscribe('*', this.queueMessage.bind(this));
  }

  // Analytics event handlers
  private async handleAnalyticsUpdate(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterAnalyticsEvent;
    console.log('[Shooter Events] Analytics update:', event.data);

    try {
      // Update local analytics cache
      await this.updateAnalyticsCache(event.data);

      // Emit to listeners
      this.emit('analytics_updated', event.data);
    } catch (error) {
      console.error('[Shooter Events] Analytics update failed:', error);
    }
  }

  private async handleConversationChange(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterAnalyticsEvent;
    const data = event.data.data;

    console.log('[Shooter Events] Conversation change:', data);

    try {
      if (data && 'conversation' in data) {
        // Process conversation data
        const conversation: ConversationData = data.conversation as ConversationData;
        const notificationSession = mapConversationToNotificationSession(conversation);

        // Store in local cache
        await this.storeConversationUpdate(conversation, notificationSession);

        // Emit event for UI updates
        this.emit('conversation_updated', { conversation, notificationSession });

        // Send notification if conditions are met
        if (this.shouldNotifyForConversation(conversation)) {
          await this.triggerConversationNotification(conversation);
        }
      }
    } catch (error) {
      console.error('[Shooter Events] Conversation change handling failed:', error);
    }
  }

  private async handleSessionStateChange(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterAnalyticsEvent;
    const data = event.data.data;

    console.log('[Shooter Events] Session state change:', data);

    try {
      if (!data || !('sessionId' in data) || !('state' in data)) {
        return;
      }

      const sessionUpdate = {
        sessionId: data.sessionId as string,
        state: data.state as string,
        timestamp: new Date(),
        metadata: ('metadata' in data ? data.metadata : {}) as Record<string, unknown>
      };

      // Update session tracking
      await this.updateSessionState(sessionUpdate);

      // Emit to listeners
      this.emit('session_state_changed', sessionUpdate);

      // Handle session-specific notifications
      if (data.state === 'started' || data.state === 'completed') {
        await this.handleSessionNotification(sessionUpdate);
      }
    } catch (error) {
      console.error('[Shooter Events] Session state change handling failed:', error);
    }
  }

  private async handleToolExecution(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterAnalyticsEvent;
    const data = event.data.data;

    console.log('[Shooter Events] Tool execution:', data);

    try {
      if (!data || !('toolName' in data)) {
        return;
      }

      const toolExecution: Record<string, unknown> & { duration?: number } = {
        toolName: data.toolName as string,
        parameters: ('parameters' in data ? data.parameters : undefined) as Record<string, unknown> | undefined,
        result: ('result' in data ? data.result : undefined) as unknown,
        timestamp: new Date(),
        sessionId: data.sessionId as string | undefined
      };

      if ('duration' in data && typeof data.duration === 'number') {
        toolExecution.duration = data.duration;
      }

      // Store tool execution data
      await this.storeToolExecution(toolExecution);

      // Emit to listeners
      this.emit('tool_executed', toolExecution);

      // Handle tool-specific notifications
      if (this.shouldNotifyForToolExecution(toolExecution)) {
        await this.triggerToolExecutionNotification(toolExecution);
      }
    } catch (error) {
      console.error('[Shooter Events] Tool execution handling failed:', error);
    }
  }

  // Notification event handlers
  private async handleNotificationSent(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterNotificationEvent;
    console.log('[Shooter Events] Notification sent:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('notificationId' in data)) {
        return;
      }

      const notificationId = data.notificationId as string;
      const response = ('response' in data ? data.response : undefined) as NotificationAPIResponse | undefined;

      // Update notification status
      await this.updateNotificationStatus(notificationId, 'sent', response);
      
      // Emit to listeners
      this.emit('notification_status_updated', {
        id: notificationId,
        status: 'sent',
        response
      });
    } catch (error) {
      console.error('[Shooter Events] Notification sent handling failed:', error);
    }
  }

  private async handleNotificationFailed(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterNotificationEvent;
    console.log('[Shooter Events] Notification failed:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('notificationId' in data)) {
        return;
      }

      const notificationId = data.notificationId as string;
      const response = ('response' in data ? data.response : undefined) as NotificationAPIResponse | undefined;

      // Update notification status
      await this.updateNotificationStatus(notificationId, 'failed', response);
      
      // Emit to listeners
      this.emit('notification_status_updated', {
        id: notificationId,
        status: 'failed',
        response
      });

      // Handle retry logic if applicable
      await this.handleNotificationRetry(notificationId, response);
    } catch (error) {
      console.error('[Shooter Events] Notification failed handling failed:', error);
    }
  }

  private async handleNotificationFiltered(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterNotificationEvent;
    console.log('[Shooter Events] Notification filtered:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('notificationId' in data)) {
        return;
      }

      const notificationId = data.notificationId as string;
      const response = ('response' in data ? data.response : undefined) as NotificationAPIResponse | undefined;

      // Update notification status
      await this.updateNotificationStatus(notificationId, 'filtered', response);
      
      // Emit to listeners
      this.emit('notification_status_updated', {
        id: notificationId,
        status: 'filtered',
        response
      });
    } catch (error) {
      console.error('[Shooter Events] Notification filtered handling failed:', error);
    }
  }

  private async handleNotificationInteraction(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterNotificationEvent;
    console.log('[Shooter Events] Notification interaction:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('notificationId' in data)) {
        return;
      }

      const notificationId = data.notificationId as string;
      const interaction = ('interaction' in data ? data.interaction : undefined) as Record<string, unknown> | undefined;

      // Store interaction data
      await this.storeNotificationInteraction(notificationId, interaction || {});

      // Emit to listeners
      this.emit('notification_interaction', {
        notificationId,
        interaction
      });

      // Handle interaction-specific logic
      if (interaction) {
        await this.processNotificationInteraction(notificationId, interaction);
      }
    } catch (error) {
      console.error('[Shooter Events] Notification interaction handling failed:', error);
    }
  }

  // System event handlers
  private async handleSystemHealthUpdate(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterSystemEvent;
    console.log('[Shooter Events] System health update:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('component' in data) || !('status' in data)) {
        return;
      }

      const component = data.component as string;
      const status = data.status as 'healthy' | 'degraded' | 'down';
      const metrics = ('metrics' in data ? data.metrics : undefined) as Record<string, unknown> | undefined;

      // Update health status cache
      await this.updateSystemHealth(component, status, metrics);

      // Emit to listeners
      this.emit('system_health_updated', event.data);

      // Handle critical health issues
      if (status === 'down') {
        await this.handleCriticalSystemIssue(component, metrics);
      }
    } catch (error) {
      console.error('[Shooter Events] System health update handling failed:', error);
    }
  }

  private async handleApnsStatusChange(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterSystemEvent;
    console.log('[Shooter Events] APNs status change:', event.data);

    try {
      const data = event.data.data;
      if (!data || !('status' in data)) {
        return;
      }

      const status = data.status as 'healthy' | 'degraded' | 'down';
      const metrics = ('metrics' in data ? data.metrics : undefined) as Record<string, unknown> | undefined;

      // Update APNs status
      await this.updateApnsStatus(status, metrics);

      // Emit to listeners
      this.emit('apns_status_updated', event.data);

      // Handle APNs connectivity issues
      if (status !== 'healthy') {
        await this.handleApnsIssue(status, metrics);
      }
    } catch (error) {
      console.error('[Shooter Events] APNs status change handling failed:', error);
    }
  }

  private async handleConnectionStatsUpdate(message: WebSocketMessage): Promise<void> {
    const event = message as ShooterSystemEvent;
    console.log('[Shooter Events] Connection stats update:', event.data);

    try {
      const data = event.data.data;
      const metrics = (data && 'metrics' in data ? data.metrics : undefined) as Record<string, unknown> | undefined;

      // Update connection statistics
      await this.updateConnectionStats(metrics);

      // Emit to listeners
      this.emit('connection_stats_updated', metrics);
    } catch (error) {
      console.error('[Shooter Events] Connection stats update handling failed:', error);
    }
  }

  // Message queue processing
  private queueMessage(message: WebSocketMessage): void {
    this.messageQueue.push(message);
    this.processMessageQueue();
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) {
          await this.processMessage(message);
        }
      }
    } catch (error) {
      console.error('[Shooter Events] Message queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processMessage(message: WebSocketMessage): Promise<void> {
    // Generic message processing logic
    console.log('[Shooter Events] Processing message:', message.type);
    
    // Store message for analytics
    await this.storeMessage(message);
    
    // Update metrics
    await this.updateMessageMetrics(message);
  }

  // Event listener management
  public on(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  public off(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[Shooter Events] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  // Helper methods (implementation details)
  private async updateAnalyticsCache(data: unknown): Promise<void> {
    // Implementation depends on your caching strategy
    console.log('[Shooter Events] Updating analytics cache:', data);
  }

  private async storeConversationUpdate(conversation: ConversationData, _session: NotificationSession): Promise<void> {
    // Store conversation data using DataService
    console.log('[Shooter Events] Storing conversation update:', conversation.id);
  }

  private shouldNotifyForConversation(conversation: ConversationData): boolean {
    // Implement notification rules
    return conversation.messages.length > 0;
  }

  private async triggerConversationNotification(conversation: ConversationData): Promise<void> {
    try {
      const notification = mapConversationToNotificationSession(conversation);
      // Send notification via DataService
      await this.dataService.sendNotification({
        title: notification.title,
        message: notification.description,
        category: notification.type,
        data: { conversationId: conversation.id }
      });
    } catch (error) {
      console.error('[Shooter Events] Failed to trigger conversation notification:', error);
    }
  }

  private async updateSessionState(sessionUpdate: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Updating session state:', sessionUpdate);
  }

  private async handleSessionNotification(sessionUpdate: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Handling session notification:', sessionUpdate);
  }

  private async storeToolExecution(toolExecution: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Storing tool execution:', toolExecution);
  }

  private shouldNotifyForToolExecution(toolExecution: Record<string, unknown> & { duration?: number }): boolean {
    // Implement tool execution notification rules
    return (toolExecution.duration ?? 0) > 5000; // Notify for long-running tools
  }

  private async triggerToolExecutionNotification(toolExecution: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Triggering tool execution notification:', toolExecution);
  }

  private async updateNotificationStatus(id: string, status: string, response?: NotificationAPIResponse): Promise<void> {
    console.log('[Shooter Events] Updating notification status:', { id, status, response });
  }

  private async handleNotificationRetry(id: string, response?: NotificationAPIResponse): Promise<void> {
    console.log('[Shooter Events] Handling notification retry:', { id, response });
  }

  private async storeNotificationInteraction(id: string, interaction: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Storing notification interaction:', { id, interaction });
  }

  private async processNotificationInteraction(id: string, interaction: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Processing notification interaction:', { id, interaction });
  }

  private async updateSystemHealth(component: string, status: string, metrics?: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Updating system health:', { component, status, metrics });
  }

  private async handleCriticalSystemIssue(component: string, metrics?: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Handling critical system issue:', { component, metrics });
  }

  private async updateApnsStatus(status: string, metrics?: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Updating APNs status:', { status, metrics });
  }

  private async handleApnsIssue(status: string, metrics?: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Handling APNs issue:', { status, metrics });
  }

  private async updateConnectionStats(metrics?: Record<string, unknown>): Promise<void> {
    console.log('[Shooter Events] Updating connection stats:', metrics);
  }

  private async storeMessage(message: WebSocketMessage): Promise<void> {
    console.log('[Shooter Events] Storing message:', message.type);
  }

  private async updateMessageMetrics(message: WebSocketMessage): Promise<void> {
    console.log('[Shooter Events] Updating message metrics:', message.type);
  }

  // Cleanup
  public destroy(): void {
    this.eventListeners.clear();
    this.messageQueue.length = 0;
  }
}

// Factory function for creating Shooter event handler
export function createShooterEventHandler(wsService: WebSocketService): ShooterEventHandler {
  return new ShooterEventHandler(wsService);
}