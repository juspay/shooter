// In-memory notification history store.
// Same pattern as pending-requests.ts — suitable for single-instance deployments.

export interface NotificationRecord {
  category?: string;
  data?: Record<string, unknown>;
  error?: string;
  id: string;
  message: string;
  project?: string;
  source?: string;
  status: 'failed' | 'filtered' | 'sent';
  timestamp: string;
  title: string;
  tool?: string;
}

const MAX_HISTORY = 100;

const history: NotificationRecord[] = [];

export function addNotification(record: NotificationRecord): void {
  history.unshift(record); // newest first
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY; // trim old entries
  }
}

export function clearNotifications(): void {
  history.length = 0;
}

export function getNotifications(limit = 50): NotificationRecord[] {
  return history.slice(0, limit);
}
