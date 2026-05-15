// In-memory notification history store — bounded ring buffer of recent
// pushes for the /api/notify GET endpoint. Intentionally not persisted:
// history is a debug/observability aid, not a source of truth.

export type { NotificationRecord } from '$lib/types';
import type { NotificationRecord } from '$lib/types';

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
