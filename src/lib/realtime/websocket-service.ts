/**
 * WebSocket Service for Real-time Communication
 * Adapted from claude-code-templates with TypeScript and Shooter-specific features
 */

import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth';
import { get } from 'svelte/store';
import type { ClaudeWebSocketMessage, WebSocketMessageType } from '$lib/types/claude';

// Type alias for backward compatibility
export type WebSocketMessage = ClaudeWebSocketMessage;

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  heartbeatInterval?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  authToken?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  lastConnected?: Date | undefined;
  reconnectAttempts: number;
  error?: string | undefined;
}

export type MessageHandler = (_message: WebSocketMessage) => void;
export type StatusHandler = (_status: ConnectionStatus) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private statusHandlers = new Set<StatusHandler>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: ConnectionStatus = {
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: 0
  };

  constructor(config: WebSocketConfig) {
    this.config = {
      protocols: [],
      heartbeatInterval: 30000, // 30 seconds
      reconnectInterval: 5000, // 5 seconds
      maxReconnectAttempts: 10,
      authToken: '',
      ...config
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    if (!browser) {
      return Promise.reject(new Error('WebSocket only available in browser'));
    }

    if (this.status.connected || this.status.connecting) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.updateStatus({ connecting: true, error: undefined });

        // Build WebSocket URL with auth if available
        let wsUrl = this.config.url;
        const authState = get(auth);

        if (authState.isAuthenticated && authState.user) {
          const url = new URL(wsUrl);
          url.searchParams.set('auth', 'true');
          wsUrl = url.toString();
        }

        this.ws = new WebSocket(wsUrl, this.config.protocols);

        // Connection opened
        this.ws.onopen = () => {
          this.status.reconnectAttempts = 0;
          this.updateStatus({
            connected: true,
            connecting: false,
            reconnecting: false,
            lastConnected: new Date(),
            error: undefined
          });
          this.startHeartbeat();
          resolve();
        };

        // Message received
        this.ws.onmessage = event => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', event.data, error);
          }
        };

        // Connection closed
        this.ws.onclose = event => {
          this.updateStatus({
            connected: false,
            connecting: false
          });
          this.stopHeartbeat();

          if (!event.wasClean && this.shouldReconnect()) {
            this.scheduleReconnect();
          }
        };

        // Connection error
        this.ws.onerror = error => {
          console.error('WebSocket error:', error);
          this.updateStatus({
            connected: false,
            connecting: false,
            error: 'Connection error'
          });
          reject(new Error('WebSocket connection failed'));
        };
      } catch (error) {
        this.updateStatus({
          connected: false,
          connecting: false,
          error: error instanceof Error ? (error as Error).message : 'Unknown error'
        });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.updateStatus({
      connected: false,
      connecting: false,
      reconnecting: false
    });
  }

  /**
   * Send message to server
   */
  send(type: WebSocketMessageType, data: unknown): boolean {
    if (!this.isConnected()) {
      console.warn('Cannot send message: WebSocket not connected');
      return false;
    }

    const message: WebSocketMessage = {
      type,
      data,
      timestamp: Date.now(),
      id: this.generateMessageId()
    };

    try {
      this.ws!.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      return false;
    }
  }

  /**
   * Subscribe to messages of a specific type
   */
  subscribe(messageType: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, new Set());
    }

    this.messageHandlers.get(messageType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(messageType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(messageType);
        }
      }
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);

    // Immediately call with current status
    handler(this.status);

    // Return unsubscribe function
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Force reconnection
   */
  reconnect(): Promise<void> {
    this.disconnect();
    return this.connect();
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
    // Handle system messages
    if (message.type === 'ping') {
      this.send('pong', { timestamp: Date.now() });
      return;
    }

    if (message.type === 'pong') {
      // Heartbeat response received
      return;
    }

    // Notify message handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Message handler error:', error);
        }
      });
    }
  }

  /**
   * Update connection status and notify handlers
   */
  private updateStatus(updates: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...updates };

    this.statusHandlers.forEach(handler => {
      try {
        handler(this.status);
      } catch (error) {
        console.error('Status handler error:', error);
      }
    });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.updateStatus({
      reconnecting: true,
      reconnectAttempts: this.status.reconnectAttempts + 1
    });

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.status.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnection failed, will be handled by onclose/onerror
      });
    }, delay);
  }

  /**
   * Check if should attempt reconnection
   */
  private shouldReconnect(): boolean {
    return this.status.reconnectAttempts < this.config.maxReconnectAttempts;
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup when service is destroyed
   */
  destroy(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }
}

// Notification-specific message types
export interface NotificationMessage extends WebSocketMessage {
  type:
    | 'notification_sent'
    | 'notification_failed'
    | 'notification_filtered'
    | 'session_state_change'
    | 'apns_status_change'
    | 'system_health_update';
}

// Convenience functions for notification events
export const NotificationEvents = {
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_FAILED: 'notification_failed',
  NOTIFICATION_FILTERED: 'notification_filtered',
  SESSION_STATE_CHANGE: 'session_state_change',
  APNS_STATUS_CHANGE: 'apns_status_change',
  SYSTEM_HEALTH_UPDATE: 'system_health_update'
} as const;

// Global WebSocket service instance
let globalWebSocketService: WebSocketService | null = null;

/**
 * Get global WebSocket service instance
 */
export function getWebSocketService(config?: WebSocketConfig): WebSocketService {
  if (!globalWebSocketService && config) {
    globalWebSocketService = new WebSocketService(config);
  }

  if (!globalWebSocketService) {
    throw new Error('WebSocket service not initialized. Provide config on first call.');
  }

  return globalWebSocketService;
}

/**
 * Initialize WebSocket service with Shooter-specific configuration
 */
export function initializeWebSocketService(): WebSocketService {
  const wsProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';

  const config: WebSocketConfig = {
    url: `${wsProtocol}//${wsHost}/ws`,
    heartbeatInterval: 30000,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  };

  return getWebSocketService(config);
}
