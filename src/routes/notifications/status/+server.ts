import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface NotificationStatus {
  enabled: boolean;
  apnsConnected: boolean;
  lastNotificationSent: string | null;
  totalSent: number;
  totalFailed: number;
  categories: string[];
  deviceTokensConfigured: number;
  systemHealth: 'healthy' | 'warning' | 'error';
  lastChecked?: string;
}

// Mock status data (in production, get from actual services)
let notificationStatus: NotificationStatus = {
  enabled: true,
  apnsConnected: true,
  lastNotificationSent: new Date(Date.now() - 900000).toISOString(),
  totalSent: 247,
  totalFailed: 3,
  categories: ['debug', 'feature', 'testing', 'learning', 'system'],
  deviceTokensConfigured: 2,
  systemHealth: 'healthy'
};

export const GET: RequestHandler = async () => {
  try {
    // Simulate checking APNs connection status
    const apnsHealthy = await checkAPNsHealth();
    
    // Update system health based on various factors
    let systemHealth: 'healthy' | 'warning' | 'error' = 'healthy';
    
    if (!notificationStatus.apnsConnected || !apnsHealthy) {
      systemHealth = 'error';
    } else if (notificationStatus.totalFailed > notificationStatus.totalSent * 0.1) {
      systemHealth = 'warning';
    }

    const status: NotificationStatus = {
      ...notificationStatus,
      apnsConnected: apnsHealthy,
      systemHealth,
      // Add real-time stats
      lastChecked: new Date().toISOString()
    };

    return json(status);
  } catch (error) {
    console.error('Error fetching notification status:', error);
    return json({ 
      error: 'Failed to fetch notification status',
      systemHealth: 'error' 
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const updates = await request.json();
    
    // Update notification status
    if (typeof updates.enabled === 'boolean') {
      notificationStatus.enabled = updates.enabled;
    }
    
    if (updates.incrementSent) {
      notificationStatus.totalSent++;
      notificationStatus.lastNotificationSent = new Date().toISOString();
    }
    
    if (updates.incrementFailed) {
      notificationStatus.totalFailed++;
    }

    return json({ success: true, status: notificationStatus });
  } catch (error) {
    console.error('Error updating notification status:', error);
    return json({ error: 'Failed to update notification status' }, { status: 500 });
  }
};

async function checkAPNsHealth(): Promise<boolean> {
  try {
    // In production, this would test actual APNs connectivity
    // For now, simulate based on environment
    const apnsKey = process.env.APNS_KEY_BASE64;
    const apnsKeyId = process.env.APNS_KEY_ID;
    const apnsTeamId = process.env.APNS_TEAM_ID;
    
    return !!(apnsKey && apnsKeyId && apnsTeamId);
  } catch (error) {
    console.error('APNs health check failed:', error);
    return false;
  }
}