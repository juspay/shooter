import { get } from '$lib/storage';
import type { PageServerLoad } from './$types';

// Notification history item structure
interface NotificationHistoryItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
  success: boolean;
  sent: number;
  failed: number;
}

// Load notification history from memory storage
export const load: PageServerLoad = async () => {
  try {
    const notificationHistory = await get<NotificationHistoryItem[]>('notification_history') || [];
    return {
      notifications: notificationHistory
    };
  } catch (error) {
    console.error('Failed to load notification history:', error);
    return {
      notifications: []
    };
  }
};