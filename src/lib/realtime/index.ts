/**
 * Real-time Module - WebSocket integration for Shooter Analytics
 * Provides comprehensive real-time communication infrastructure
 */

// Import types and classes for internal use
import type { ConnectionStatus } from './websocket-service';
import { WebSocketService, initializeWebSocketService } from './websocket-service';
import { ShooterEventHandler, createShooterEventHandler } from './shooter-events';
import { ApnsWebSocketIntegration, getApnsIntegration } from './apns-integration';
import type {
  NotificationAPIRequest,
  NotificationAPIResponse,
  NotificationEventPayload,
  WebSocketMessagePayload
} from '$types';

// Re-export for external use
// Core WebSocket service
export {
  WebSocketService,
  getWebSocketService,
  initializeWebSocketService,
  type WebSocketMessage,
  type WebSocketConfig,
  type ConnectionStatus,
  type MessageHandler,
  type StatusHandler,
  type NotificationMessage,
  NotificationEvents
} from './websocket-service';

// Shooter-specific event handling
export {
  ShooterEventHandler,
  createShooterEventHandler,
  type ShooterAnalyticsEvent,
  type ShooterNotificationEvent,
  type ShooterSystemEvent
} from './shooter-events';

// APNs integration
export {
  ApnsWebSocketIntegration,
  getApnsIntegration,
  sendNotificationViaWebSocket,
  getApnsHealthStatus,
  retryNotification
} from './apns-integration';

// WebSocket server utilities (for server-side use)
// Note: These exports are not available from ws/+server.ts per SvelteKit requirements
// export {
//   broadcastNotificationEvent,
//   sendNotificationToUser,
//   initializeWebSocketServer
// } from '../../routes/ws/+server';

// Type definitions for comprehensive real-time system
export interface RealTimeConfig {
  websocket: {
    url: string;
    protocols?: string[];
    heartbeatInterval?: number;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  };
  notifications: {
    enableApnsIntegration: boolean;
    retryFailedNotifications: boolean;
    maxRetries?: number;
    retryDelay?: number;
  };
  analytics: {
    enableEventTracking: boolean;
    bufferSize?: number;
    flushInterval?: number;
  };
}

export interface RealTimeMetrics {
  websocket: {
    isConnected: boolean;
    connectedClients: number;
    messagesPerSecond: number;
    averageLatency: number;
    reconnectAttempts: number;
  };
  notifications: {
    totalSent: number;
    totalFailed: number;
    successRate: number;
    averageDeliveryTime: number;
    queueSize: number;
  };
  analytics: {
    eventsProcessed: number;
    eventsPerSecond: number;
    bufferUtilization: number;
    lastEventTimestamp: Date | null;
  };
}

// Unified real-time service
export class ShooterRealTimeService {
  private wsService: WebSocketService | null = null;
  private eventHandler: ShooterEventHandler | null = null;
  private apnsIntegration: ApnsWebSocketIntegration | null = null;
  private config: RealTimeConfig;
  private metrics: RealTimeMetrics;

  constructor(config: Partial<RealTimeConfig> = {}) {
    this.config = {
      websocket: {
        url: 'ws://localhost:5173/ws',
        heartbeatInterval: 30000,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        ...config.websocket
      },
      notifications: {
        enableApnsIntegration: true,
        retryFailedNotifications: true,
        maxRetries: 3,
        retryDelay: 5000,
        ...config.notifications
      },
      analytics: {
        enableEventTracking: true,
        bufferSize: 1000,
        flushInterval: 30000,
        ...config.analytics
      }
    };

    this.metrics = this.initializeMetrics();
  }

  public async initialize(): Promise<void> {
    try {
      console.log('[RealTime] Initializing Shooter real-time service...');

      // Initialize WebSocket service
      this.wsService = initializeWebSocketService();
      await this.wsService.connect();

      // Initialize event handler
      if (this.config.analytics.enableEventTracking) {
        this.eventHandler = createShooterEventHandler(this.wsService);
        this.setupAnalyticsTracking();
      }

      // Initialize APNs integration
      if (this.config.notifications.enableApnsIntegration) {
        this.apnsIntegration = getApnsIntegration();
      }

      // Setup metrics collection
      this.startMetricsCollection();

      console.log('[RealTime] Shooter real-time service initialized successfully');
    } catch (error) {
      console.error('[RealTime] Failed to initialize real-time service:', error);
      throw error;
    }
  }

  private initializeMetrics(): RealTimeMetrics {
    return {
      websocket: {
        isConnected: false,
        connectedClients: 0,
        messagesPerSecond: 0,
        averageLatency: 0,
        reconnectAttempts: 0
      },
      notifications: {
        totalSent: 0,
        totalFailed: 0,
        successRate: 100,
        averageDeliveryTime: 0,
        queueSize: 0
      },
      analytics: {
        eventsProcessed: 0,
        eventsPerSecond: 0,
        bufferUtilization: 0,
        lastEventTimestamp: null
      }
    };
  }

  private setupAnalyticsTracking(): void {
    if (!this.eventHandler) {
return;
}

    // Track various analytics events
    this.eventHandler.on('conversation_updated', (data: unknown) => {
      this.updateAnalyticsMetrics('conversation_updated');
      console.log('[RealTime] Analytics: Conversation updated', data);
    });

    this.eventHandler.on('tool_executed', (data: unknown) => {
      this.updateAnalyticsMetrics('tool_executed');
      console.log('[RealTime] Analytics: Tool executed', data);
    });

    this.eventHandler.on('notification_status_updated', (data: NotificationEventPayload) => {
      this.updateNotificationMetrics(data);
      console.log('[RealTime] Analytics: Notification status updated', data);
    });
  }

  private updateAnalyticsMetrics(_eventType: string): void {
    this.metrics.analytics.eventsProcessed++;
    this.metrics.analytics.lastEventTimestamp = new Date();
    
    // Calculate events per second (simplified)
    // In production, you'd use a sliding window
    this.metrics.analytics.eventsPerSecond = this.metrics.analytics.eventsProcessed / 60; // Rough estimate
  }

  private updateNotificationMetrics(data: NotificationEventPayload): void {
    if (data.success) {
      this.metrics.notifications.totalSent++;
    } else {
      this.metrics.notifications.totalFailed++;
    }

    // Update success rate
    const total = this.metrics.notifications.totalSent + this.metrics.notifications.totalFailed;
    if (total > 0) {
      this.metrics.notifications.successRate = (this.metrics.notifications.totalSent / total) * 100;
    }
  }

  private startMetricsCollection(): void {
    // Update WebSocket metrics every 10 seconds
    setInterval(() => {
      if (this.wsService) {
        const status = this.wsService.getStatus();
        this.metrics.websocket.isConnected = status.connected;
        this.metrics.websocket.reconnectAttempts = status.reconnectAttempts;
      }
    }, 10000);

    // Flush analytics metrics every 30 seconds
    setInterval(() => {
      this.flushAnalyticsMetrics();
    }, this.config.analytics.flushInterval);
  }

  private flushAnalyticsMetrics(): void {
    console.log('[RealTime] Metrics snapshot:', this.metrics);
    
    // In production, you would send these metrics to a monitoring service
    // or store them in a database for analysis
  }

  // Public API
  public getMetrics(): RealTimeMetrics {
    return { ...this.metrics };
  }

  public async sendNotification(request: NotificationAPIRequest): Promise<NotificationAPIResponse> {
    if (!this.apnsIntegration) {
      throw new Error('APNs integration not enabled');
    }
    return this.apnsIntegration.processNotification(request);
  }

  public subscribeToEvents(eventType: string, handler: Function): () => void {
    if (!this.eventHandler) {
      throw new Error('Event tracking not enabled');
    }
    
    this.eventHandler.on(eventType, handler);
    
    return () => {
      this.eventHandler?.off(eventType, handler);
    };
  }

  public async broadcastMessage(message: WebSocketMessagePayload): Promise<void> {
    if (!this.wsService) {
      throw new Error('WebSocket service not initialized');
    }

    // This would need to be implemented based on your specific broadcasting needs
    console.log('[RealTime] Broadcasting message:', message);
  }

  public getConnectionStatus(): ConnectionStatus | null {
    return this.wsService?.getStatus() || null;
  }

  public async reconnect(): Promise<void> {
    if (this.wsService) {
      await this.wsService.reconnect();
    }
  }

  public destroy(): void {
    console.log('[RealTime] Destroying real-time service...');
    
    if (this.wsService) {
      this.wsService.destroy();
    }
    
    if (this.eventHandler) {
      this.eventHandler.destroy();
    }
    
    if (this.apnsIntegration) {
      this.apnsIntegration.destroy();
    }
  }
}

// Factory function for creating real-time service
export function createRealTimeService(config?: Partial<RealTimeConfig>): ShooterRealTimeService {
  return new ShooterRealTimeService(config);
}

// Default configuration for different environments
export const defaultConfigs = {
  development: {
    websocket: {
      url: 'ws://localhost:5173/ws'
    },
    notifications: {
      enableApnsIntegration: false // Disable APNs in development
    }
  },
  production: {
    websocket: {
      url: 'wss://your-domain.com/ws'
    },
    notifications: {
      enableApnsIntegration: true,
      retryFailedNotifications: true
    }
  }
} as const;

// Utility functions
export function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}

export function getWebSocketReadyState(ws: WebSocket): string {
  switch (ws.readyState) {
    case WebSocket.CONNECTING: return 'CONNECTING';
    case WebSocket.OPEN: return 'OPEN';
    case WebSocket.CLOSING: return 'CLOSING';
    case WebSocket.CLOSED: return 'CLOSED';
    default: return 'UNKNOWN';
  }
}

// Event type constants
export const REALTIME_EVENTS = {
  // WebSocket events
  CONNECTION_ESTABLISHED: 'connection_established',
  CONNECTION_LOST: 'connection_lost',
  MESSAGE_RECEIVED: 'message_received',
  
  // Analytics events
  CONVERSATION_UPDATED: 'conversation_updated',
  TOOL_EXECUTED: 'tool_executed',
  SESSION_STATE_CHANGED: 'session_state_changed',
  
  // Notification events
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_FAILED: 'notification_failed',
  NOTIFICATION_INTERACTION: 'notification_interaction',
  
  // System events
  SYSTEM_HEALTH_UPDATE: 'system_health_update',
  APNS_STATUS_CHANGE: 'apns_status_change',
  METRICS_UPDATE: 'metrics_update'
} as const;