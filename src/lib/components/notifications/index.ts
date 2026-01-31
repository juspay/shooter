// Notifications Components
// Centralized exports for all notification-related components

export { default as NotificationHistoryTable } from './NotificationHistoryTable.svelte';

// Notification-related types and interfaces
export interface NotificationHistoryItem {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'coding' | 'debugging' | 'testing' | 'deployment' | 'collaboration';
  status: 'sent' | 'delivered' | 'failed' | 'filtered' | 'pending';
  priority: 'low' | 'normal' | 'high' | 'critical';
  deviceType: 'desktop' | 'mobile' | 'email' | 'slack';
  deviceId?: string;
  errorMessage?: string;
  retryCount: number;
  readAt?: string;
}

export interface NotificationFilter {
  searchTerm?: string;
  status?: string;
  type?: string;
  priority?: string;
  deviceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NotificationPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface NotificationSort {
  column: string;
  direction: 'asc' | 'desc';
}

// Mock data generator for testing
export function generateMockNotificationHistory(count: number): NotificationHistoryItem[] {
  const types: NotificationHistoryItem['type'][] = [
    'coding',
    'debugging',
    'testing',
    'deployment',
    'collaboration'
  ];
  const statuses: NotificationHistoryItem['status'][] = [
    'sent',
    'delivered',
    'failed',
    'filtered',
    'pending'
  ];
  const priorities: NotificationHistoryItem['priority'][] = ['low', 'normal', 'high', 'critical'];
  const deviceTypes: NotificationHistoryItem['deviceType'][] = [
    'desktop',
    'mobile',
    'email',
    'slack'
  ];

  const titles = [
    'Code completion successful',
    'Build process started',
    'Test suite completed',
    'Deployment to staging',
    'Code review requested',
    'Error in production',
    'Database migration completed',
    'New feature branch created',
    'Security vulnerability detected',
    'Performance optimization needed'
  ];

  const messages = [
    'Your code has been successfully processed and compiled.',
    'The automated build process has been initiated for your latest commit.',
    'All unit tests have passed successfully with 100% coverage.',
    'Your application has been deployed to the staging environment.',
    'A team member has requested a code review for your pull request.',
    'An error has been detected in the production environment requiring attention.',
    'The database migration has completed successfully without issues.',
    'A new feature branch has been created and is ready for development.',
    'A security vulnerability has been detected in one of your dependencies.',
    'Performance bottlenecks have been identified and optimization is recommended.'
  ];

  return Array.from({ length: count }, (_, index) => {
    const now = new Date();
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const type = types[Math.floor(Math.random() * types.length)]!;
    const status = statuses[Math.floor(Math.random() * statuses.length)]!;
    const priority = priorities[Math.floor(Math.random() * priorities.length)]!;
    const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)]!;
    const title = titles[Math.floor(Math.random() * titles.length)]!;
    const message = messages[Math.floor(Math.random() * messages.length)]!;

    const deviceId = deviceType === 'mobile' ? `device_${Math.random().toString(36).substr(2, 8)}` : null;
    const errorMessage = status === 'failed' ? 'Network timeout after 30 seconds' : null;
    const readAt = Math.random() > 0.3
      ? new Date(timestamp.getTime() + Math.random() * 60 * 60 * 1000).toISOString()
      : null;

    return {
      id: `notif_${index + 1}_${Date.now()}`,
      timestamp: timestamp.toISOString(),
      title,
      message,
      type,
      status,
      priority,
      deviceType,
      ...(deviceId && { deviceId }),
      ...(errorMessage && { errorMessage }),
      retryCount: status === 'failed' ? Math.floor(Math.random() * 3) : 0,
      ...(readAt && { readAt })
    };
  });
}

// Utility functions for working with notification data
export function filterNotifications(
  notifications: NotificationHistoryItem[],
  filter: NotificationFilter
): NotificationHistoryItem[] {
  return notifications.filter(notification => {
    // Search term filter
    if (filter.searchTerm) {
      const searchLower = filter.searchTerm.toLowerCase();
      const matchesSearch =
        notification.title.toLowerCase().includes(searchLower) ||
        notification.message.toLowerCase().includes(searchLower);
      if (!matchesSearch) {
return false;
}
    }

    // Status filter
    if (filter.status && filter.status !== 'all' && notification.status !== filter.status) {
      return false;
    }

    // Type filter
    if (filter.type && filter.type !== 'all' && notification.type !== filter.type) {
      return false;
    }

    // Priority filter
    if (filter.priority && filter.priority !== 'all' && notification.priority !== filter.priority) {
      return false;
    }

    // Device type filter
    if (
      filter.deviceType &&
      filter.deviceType !== 'all' &&
      notification.deviceType !== filter.deviceType
    ) {
      return false;
    }

    // Date range filter
    if (filter.dateFrom) {
      const notificationDate = new Date(notification.timestamp);
      const fromDate = new Date(filter.dateFrom);
      if (notificationDate < fromDate) {
return false;
}
    }

    if (filter.dateTo) {
      const notificationDate = new Date(notification.timestamp);
      const toDate = new Date(filter.dateTo);
      if (notificationDate > toDate) {
return false;
}
    }

    return true;
  });
}

export function sortNotifications(
  notifications: NotificationHistoryItem[],
  sort: NotificationSort
): NotificationHistoryItem[] {
  return [...notifications].sort((a, b) => {
    const aValue = a[sort.column as keyof NotificationHistoryItem];
    const bValue = b[sort.column as keyof NotificationHistoryItem];

    // Handle null/undefined values
    if (aValue == null && bValue == null) {
return 0;
}
    if (aValue == null) {
return sort.direction === 'asc' ? 1 : -1;
}
    if (bValue == null) {
return sort.direction === 'asc' ? -1 : 1;
}

    // Handle different data types
    let comparison = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else if (sort.column === 'timestamp') {
      // Special handling for timestamp strings
      comparison = new Date(aValue as string).getTime() - new Date(bValue as string).getTime();
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

export function paginateNotifications(
  notifications: NotificationHistoryItem[],
  pagination: NotificationPagination
): NotificationHistoryItem[] {
  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const endIndex = startIndex + pagination.pageSize;
  return notifications.slice(startIndex, endIndex);
}

export function getNotificationStats(notifications: NotificationHistoryItem[]) {
  const total = notifications.length;
  const statusCounts = notifications.reduce(
    (acc, notif) => {
      acc[notif.status] = (acc[notif.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const typeCounts = notifications.reduce(
    (acc, notif) => {
      acc[notif.type] = (acc[notif.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const priorityCounts = notifications.reduce(
    (acc, notif) => {
      acc[notif.priority] = (acc[notif.priority] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    total,
    statusCounts,
    typeCounts,
    priorityCounts,
    successRate: total > 0 ? (statusCounts.delivered || 0) / total : 0,
    failureRate: total > 0 ? (statusCounts.failed || 0) / total : 0
  };
}

// Export commonly used type guards
export function isFailedNotification(notification: NotificationHistoryItem): boolean {
  return notification.status === 'failed';
}

export function isHighPriorityNotification(notification: NotificationHistoryItem): boolean {
  return notification.priority === 'high' || notification.priority === 'critical';
}

export function isRecentNotification(
  notification: NotificationHistoryItem,
  hoursAgo = 24
): boolean {
  const notificationTime = new Date(notification.timestamp);
  const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return notificationTime > cutoffTime;
}
