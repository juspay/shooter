/**
 * WebSocket Server Endpoint for Real-time Communication
 * Provides bidirectional communication for analytics dashboard and notifications
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ClaudeWebSocketMessage } from '$lib/types/claude';

// Type alias for WebSocket messages
type WebSocketMessage = ClaudeWebSocketMessage;

// Payload type definitions
interface SubscribePayload {
  channels: string[];
}

interface UnsubscribePayload {
  channels: string[];
}

interface AnalyticsRequestPayload {
  type: 'dashboard_metrics' | 'notification_history' | 'session_analytics';
  params?: Record<string, unknown>;
}

interface NotificationInteractionPayload {
  action: string;
  notificationId: string;
  data?: Record<string, unknown>;
}

// WebSocket server instance
let wsServer: WebSocketServer | null = null;

// Connected clients registry
const connectedClients = new Map<string, WebSocketConnection>();

interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  userId?: string;
  userRole?: string;
  lastPing: number;
  subscriptions: Set<string>;
}

interface WebSocketServer {
  handleConnection(_ws: WebSocket, _request: Request): void;
  broadcast(_message: WebSocketMessage, _filter?: (_conn: WebSocketConnection) => boolean): void;
  sendToUser(_userId: string, _message: WebSocketMessage): boolean;
  getConnectedCount(): number;
  cleanup(): void;
}

class ShooterWebSocketServer implements WebSocketServer {
  private pingInterval: ReturnType<typeof setInterval>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Ping clients every 30 seconds
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    // Cleanup stale connections every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000);
  }

  handleConnection(ws: WebSocket, request: Request): void {
    const connectionId = generateConnectionId();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const userRole = url.searchParams.get('userRole');

    const connection: WebSocketConnection = {
      id: connectionId,
      ws,
      ...(userId && { userId }),
      ...(userRole && { userRole }),
      lastPing: Date.now(),
      subscriptions: new Set()
    };

    connectedClients.set(connectionId, connection);

    console.log(`[WebSocket] Client connected: ${connectionId} (user: ${userId || 'anonymous'})`);

    // Send welcome message
    this.sendToConnection(connection, {
      type: 'connection_established',
      data: {
        connectionId,
        serverTime: new Date().toISOString(),
        userId: userId || null
      },
      timestamp: Date.now(),
      id: generateMessageId()
    });

    // Handle incoming messages
    ws.addEventListener('message', (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(connection, message);
      } catch (error) {
        console.error('[WebSocket] Invalid message format:', error);
        this.sendError(connection, 'Invalid message format');
      }
    });

    // Handle connection close
    ws.addEventListener('close', () => {
      console.log(`[WebSocket] Client disconnected: ${connectionId}`);
      connectedClients.delete(connectionId);
    });

    // Handle connection error
    ws.addEventListener('error', (error) => {
      console.error(`[WebSocket] Connection error for ${connectionId}:`, error);
      connectedClients.delete(connectionId);
    });

    // Update connection stats
    this.broadcastConnectionStats();
  }

  private handleMessage(connection: WebSocketConnection, message: WebSocketMessage): void {
    connection.lastPing = Date.now();

    switch (message.type) {
      case 'ping':
        this.sendToConnection(connection, {
          type: 'pong',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
          id: generateMessageId()
        });
        break;

      case 'subscribe':
        this.handleSubscribe(connection, message.data);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(connection, message.data);
        break;

      case 'analytics_request':
        this.handleAnalyticsRequest(connection, message.data);
        break;

      case 'notification_interaction':
        this.handleNotificationInteraction(connection, message.data);
        break;

      default:
        console.warn(`[WebSocket] Unknown message type: ${message.type}`);
        this.sendError(connection, `Unknown message type: ${message.type}`);
    }
  }

  private handleSubscribe(connection: WebSocketConnection, payload: unknown): void {
    const { channels } = payload as SubscribePayload;

    if (Array.isArray(channels)) {
      channels.forEach(channel => {
        connection.subscriptions.add(channel);
      });

      this.sendToConnection(connection, {
        type: 'subscription_confirmed',
        data: { channels, subscriptions: Array.from(connection.subscriptions) },
        timestamp: Date.now(),
        id: generateMessageId()
      });
    }
  }

  private handleUnsubscribe(connection: WebSocketConnection, payload: unknown): void {
    const { channels } = payload as UnsubscribePayload;

    if (Array.isArray(channels)) {
      channels.forEach(channel => {
        connection.subscriptions.delete(channel);
      });

      this.sendToConnection(connection, {
        type: 'unsubscription_confirmed',
        data: { channels, subscriptions: Array.from(connection.subscriptions) },
        timestamp: Date.now(),
        id: generateMessageId()
      });
    }
  }

  private async handleAnalyticsRequest(connection: WebSocketConnection, payload: unknown): Promise<void> {
    try {
      const { type, params: _params } = payload as AnalyticsRequestPayload;

      // Mock analytics data for WebSocket functionality testing
      let data: Record<string, unknown>;
      switch (type) {
        case 'dashboard_metrics':
          data = {
            totalNotifications: 127,
            connectedDevices: this.getConnectedCount(),
            systemHealth: 100,
            successRate: 98.5
          };
          break;
        case 'notification_history':
          data = {
            notifications: [
              {
                id: 'ws_1',
                title: 'WebSocket Connected',
                description: 'Real-time communication established',
                type: 'system',
                timestamp: new Date()
              }
            ],
            deliveries: []
          };
          break;
        case 'session_analytics':
          data = {
            activeSessions: this.getConnectedCount(),
            sessionDuration: 1234,
            lastActivity: new Date().toISOString()
          };
          break;
        default:
          throw new Error(`Unknown analytics request type: ${type}`);
      }

      this.sendToConnection(connection, {
        type: 'analytics_response',
        data: { requestType: type, data },
        timestamp: Date.now(),
        id: generateMessageId()
      });
    } catch (error) {
      this.sendError(connection, `Analytics request failed: ${(error as Error).message}`);
    }
  }

  private handleNotificationInteraction(connection: WebSocketConnection, payload: unknown): void {
    const { action, notificationId, data } = payload as NotificationInteractionPayload;

    // Broadcast interaction to other clients
    this.broadcast({
      type: 'notification_interaction_broadcast',
      data: {
        action,
        notificationId,
        data,
        userId: connection.userId,
        timestamp: Date.now()
      },
      timestamp: Date.now(),
      id: generateMessageId()
    }, (conn) => conn.id !== connection.id);

    console.log(`[WebSocket] Notification interaction: ${action} on ${notificationId} by ${connection.userId || 'anonymous'}`);
  }

  private sendToConnection(connection: WebSocketConnection, message: WebSocketMessage): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebSocket] Failed to send message to ${connection.id}:`, error);
      }
    }
  }

  private sendError(connection: WebSocketConnection, error: string): void {
    this.sendToConnection(connection, {
      type: 'error',
      data: { error },
      timestamp: Date.now(),
      id: generateMessageId()
    });
  }

  private pingClients(): void {
    const pingMessage: WebSocketMessage = {
      type: 'ping',
      data: { timestamp: Date.now() },
      timestamp: Date.now(),
      id: generateMessageId()
    };

    connectedClients.forEach(connection => {
      this.sendToConnection(connection, pingMessage);
    });
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 120000; // 2 minutes

    connectedClients.forEach((connection, id) => {
      if (now - connection.lastPing > staleThreshold) {
        console.log(`[WebSocket] Cleaning up stale connection: ${id}`);
        connection.ws.close();
        connectedClients.delete(id);
      }
    });
  }

  private broadcastConnectionStats(): void {
    const stats = {
      totalConnections: connectedClients.size,
      authenticatedConnections: Array.from(connectedClients.values()).filter(c => c.userId).length,
      timestamp: Date.now()
    };

    this.broadcast({
      type: 'connection_stats_update',
      data: stats,
      timestamp: Date.now(),
      id: generateMessageId()
    });
  }

  broadcast(message: WebSocketMessage, filter?: (_conn: WebSocketConnection) => boolean): void {
    connectedClients.forEach(connection => {
      if (!filter || filter(connection)) {
        this.sendToConnection(connection, message);
      }
    });
  }

  sendToUser(userId: string, message: WebSocketMessage): boolean {
    const userConnections = Array.from(connectedClients.values()).filter(c => c.userId === userId);
    
    if (userConnections.length === 0) {
      return false;
    }

    userConnections.forEach(connection => {
      this.sendToConnection(connection, message);
    });

    return true;
  }

  getConnectedCount(): number {
    return connectedClients.size;
  }

  cleanup(): void {
    clearInterval(this.pingInterval);
    clearInterval(this.cleanupInterval);
    
    connectedClients.forEach(connection => {
      connection.ws.close();
    });
    
    connectedClients.clear();
  }
}

// Helper functions
function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize WebSocket server
function initializeWebSocketServer(): WebSocketServer {
  if (!wsServer) {
    wsServer = new ShooterWebSocketServer();
  }
  return wsServer;
}

// HTTP handlers for WebSocket upgrade
export const GET: RequestHandler = async ({ request, url }) => {
  // WebSocket upgrade request
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const server = initializeWebSocketServer();
    
    // In a real implementation, you would handle the WebSocket upgrade here
    // For SvelteKit, we'll return connection info for client-side WebSocket setup
    return json({
      success: true,
      websocketUrl: `ws://${url.host}/ws`,
      connectedClients: server.getConnectedCount(),
      serverTime: new Date().toISOString()
    });
  }

  // Return WebSocket server status
  const server = wsServer || initializeWebSocketServer();
  
  return json({
    status: 'running',
    connectedClients: server.getConnectedCount(),
    serverTime: new Date().toISOString(),
    endpoints: {
      websocket: `ws://${url.host}/ws`,
      status: `${url.origin}/ws`
    }
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    const { type, payload, targetUserId } = data;

    if (!wsServer) {
      return json({ error: 'WebSocket server not initialized' }, { status: 503 });
    }

    const message: WebSocketMessage = {
      type: type || 'server_broadcast',
      data: payload || {},
      timestamp: Date.now(),
      id: generateMessageId()
    };

    if (targetUserId) {
      // Send to specific user
      const sent = wsServer.sendToUser(targetUserId, message);
      return json({ success: sent, message: sent ? 'Message sent' : 'User not connected' });
    } else {
      // Broadcast to all clients
      wsServer.broadcast(message);
      return json({ success: true, message: 'Message broadcasted' });
    }
  } catch (error) {
    console.error('[WebSocket] POST handler error:', error);
    return json({ error: 'Invalid request' }, { status: 400 });
  }
};

// Note: Exports removed to comply with SvelteKit server endpoint requirements
// WebSocket server functionality available through GET/POST endpoints
