/**
 * Analytics Components - Mobile UI components extracted from Claude Code templates
 * Provides real-time analytics dashboard components for Shooter
 */

// Core chat interface components
export { default as ChatHeader } from './ChatHeader.svelte';
export { default as ChatView } from './ChatView.svelte';
export { default as MessageBubble } from './MessageBubble.svelte';
export { default as ConversationHeader } from './ConversationHeader.svelte';

// Status and notification components
export { default as ConnectionStatus } from './ConnectionStatus.svelte';
export { default as NotificationBubble } from './NotificationBubble.svelte';
export { default as DeliveryStatus } from './DeliveryStatus.svelte';

// Import components for re-export in AnalyticsComponents object
import ChatHeader from './ChatHeader.svelte';
import ChatView from './ChatView.svelte';
import MessageBubble from './MessageBubble.svelte';
import ConversationHeader from './ConversationHeader.svelte';
import ConnectionStatus from './ConnectionStatus.svelte';
import NotificationBubble from './NotificationBubble.svelte';
import DeliveryStatus from './DeliveryStatus.svelte';

// Component interfaces for TypeScript
export interface ChatHeaderProps {
  title?: string;
  conversationCount?: number;
  isConnected?: boolean;
  lastUpdate?: Date | null;
}

export interface ChatViewProps {
  conversations?: import('$types').ConversationData[];
  selectedConversation?: import('$types').ConversationData | null;
  autoScroll?: boolean;
  showAvatars?: boolean;
  showTimestamps?: boolean;
}

export interface MessageBubbleProps {
  message: import('$types').MessageData;
  showTimestamp?: boolean;
  showAvatar?: boolean;
}

export interface ConversationHeaderProps {
  conversation: import('$types').ConversationData;
  isSelected?: boolean;
  showDetails?: boolean;
  compact?: boolean;
}

export interface ConnectionStatusProps {
  status: import('$lib/realtime/websocket-service').ConnectionStatus;
  showDetails?: boolean;
  position?: 'fixed' | 'relative';
  compact?: boolean;
}

export interface NotificationBubbleProps {
  notification: import('$lib/data/data-service').NotificationSession;
  autoHide?: boolean;
  duration?: number;
  position?: 'top' | 'bottom';
  variant?: 'default' | 'compact' | 'expanded';
  showActions?: boolean;
}

export interface DeliveryStatusProps {
  delivery: import('$types').NotificationAPIResponse;
  showDetails?: boolean;
  compact?: boolean;
  showRetry?: boolean;
}

// Event type definitions
export interface ChatHeaderEvents {
  refresh: void;
  settings: void;
}

export interface ChatViewEvents {
  conversationSelect: { conversation: import('$types').ConversationData };
  messageInteraction: { message: import('$types').MessageData; action: string };
  scrollToTop: void;
  scrollToBottom: void;
}

export interface MessageBubbleEvents {
  interaction: { action: string; message: import('$types').MessageData };
}

export interface ConversationHeaderEvents {
  select: void;
  back: void;
  action: { action: string; conversation: import('$types').ConversationData };
}

export interface ConnectionStatusEvents {
  reconnect: void;
  details: void;
}

export interface NotificationBubbleEvents {
  click: { notification: import('$lib/data/data-service').NotificationSession };
  dismiss: { notification: import('$lib/data/data-service').NotificationSession };
  action: { action: string; notification: import('$lib/data/data-service').NotificationSession };
  expired: { notification: import('$lib/data/data-service').NotificationSession };
}

export interface DeliveryStatusEvents {
  retry: { delivery: import('$types').NotificationAPIResponse };
  details: { delivery: import('$types').NotificationAPIResponse };
  dismiss: { delivery: import('$types').NotificationAPIResponse };
}

// Component composition helpers
export const AnalyticsComponents = {
  ChatHeader,
  ChatView,
  MessageBubble,
  ConversationHeader,
  ConnectionStatus,
  NotificationBubble,
  DeliveryStatus
} as const;

// Default configurations
export const defaultChatViewConfig = {
  autoScroll: true,
  showAvatars: false,
  showTimestamps: true
};

export const defaultNotificationBubbleConfig = {
  autoHide: true,
  duration: 5000,
  position: 'top' as const,
  variant: 'default' as const,
  showActions: true
};

export const defaultConnectionStatusConfig = {
  showDetails: false,
  position: 'fixed' as const,
  compact: false
};

// Utility functions for component data
export function createMockConversation(id: string, title: string): import('$types').ConversationData {
  return {
    id,
    title,
    messages: [],
    createdAt: new Date().getTime(),
    updatedAt: new Date().getTime(),
    messageCount: 0,
    status: 'active'
  };
}

export function createMockMessage(role: 'user' | 'assistant', content: string): import('$types').MessageData {
  return {
    id: crypto.randomUUID(),
    conversationId: 'mock-conversation',
    content,
    role,
    timestamp: new Date().getTime(),
    status: 'sent',
    metadata: {}
  };
}

export function createMockNotificationSession(
  type: 'debug' | 'feature' | 'testing' | 'learning' | 'error' = 'feature'
): import('$lib/data/data-service').NotificationSession {
  return {
    id: crypto.randomUUID(),
    title: `${type} session`,
    description: `Mock ${type} session for testing`,
    status: 'sent',
    timestamp: new Date(),
    type,
    metadata: {
      messageCount: Math.floor(Math.random() * 10) + 1,
      hasCodeBlocks: Math.random() > 0.5,
      hasErrors: type === 'error',
      sessionCompleted: Math.random() > 0.3
    }
  };
}