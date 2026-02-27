import { env } from '$env/dynamic/private';
// APNs service using proven library instead of manual implementation
import apn from '@parse/node-apn';

import type {
  LibraryFailedItem as APNsLibraryFailedItem,
  LibraryResult as APNsLibraryResult,
  NotificationResult as APNsNotificationResult,
  NotificationPayload,
} from './types';

export class LibraryAPNsService {
  private bundleId: string | undefined;
  private configured = false;
  private keyId: string | undefined;
  private privateKey: string | undefined;
  private provider: apn.Provider | null = null;
  private teamId: string | undefined;

  constructor() {
    this.keyId = env.APNS_KEY_ID;
    this.teamId = env.APNS_TEAM_ID;
    this.bundleId = env.APNS_BUNDLE_ID;
    this.privateKey = env.APNS_KEY;

    if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
      console.error('[apns] Missing required configuration (APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, or APNS_KEY)');
      this.configured = false;
      return;
    }

    const production = env.APNS_PRODUCTION === 'true';
    const options = {
      production,
      token: {
        key: this.privateKey,
        keyId: this.keyId,
        teamId: this.teamId,
      },
    };

    try {
      this.provider = new apn.Provider(options);
      this.configured = true;
      console.log(`[apns] Provider initialized (${production ? 'production' : 'sandbox'} mode)`);
    } catch (error) {
      const err = error as Error;
      console.error('[apns] Failed to create provider:', err.message);
      this.configured = false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsNotificationResult> {
    if (!this.configured || !this.provider) {
      throw new Error('APNs service not configured properly');
    }

    if (!deviceToken || !payload) {
      throw new Error('Device token and payload are required');
    }

    const notification = new apn.Notification();

    notification.alert = {
      body: payload.body ?? payload.message ?? '',
      title: payload.title,
    };

    notification.badge = payload.badge ?? 1;
    notification.sound = payload.sound ?? 'default';
    notification.topic = this.bundleId!;

    if (payload.category) {
      notification.aps.category = payload.category;
    }

    if (payload.data) {
      notification.payload = payload.data;
    }

    const result = (await this.provider.send(notification, deviceToken)) as APNsLibraryResult;

    if (result.failed && result.failed.length > 0) {
      const reason = result.failed[0]?.response?.reason || 'Unknown error';
      console.error(`[apns] Delivery failed: ${reason}`);

      return {
        error: reason,
        failed: result.failed?.length || 0,
        sent: result.sent?.length || 0,
        success: false,
      };
    }

    if (result.sent && result.sent.length > 0) {
      return {
        details: result.sent,
        failed: 0,
        sent: result.sent.length,
        success: true,
      };
    }

    return {
      details: [result as unknown as Record<string, unknown>],
      error: 'Unexpected result format',
      failed: 1,
      sent: 0,
      success: false,
    };
  }

  shutdown(): void {
    if (this.provider) {
      void this.provider.shutdown();
    }
  }
}

export default LibraryAPNsService;
