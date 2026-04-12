import type { LibraryResult as APNsLibraryResult, NotificationPayload } from '$lib/types';

import { env } from '$env/dynamic/private';
// APNs service using proven library instead of manual implementation
import apn from '@parse/node-apn';

import { toErrorMessage } from '../utils/error';

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
      console.error(
        '[apns] Missing required configuration (APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, or APNS_KEY)'
      );
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
      console.error('[apns] Failed to create provider:', toErrorMessage(error));
      this.configured = false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<{
    details?: unknown[];
    error?: string;
    failed: number;
    sent: number;
    success: boolean;
  }> {
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
    if (!this.bundleId) {
      throw new Error('APNs bundleId is required but was not configured');
    }
    notification.topic = this.bundleId;

    if (payload.category) {
      notification.aps.category = payload.category;
    }

    if (payload.data) {
      notification.payload = payload.data;
    }

    const result = (await this.provider.send(notification, deviceToken)) as APNsLibraryResult;

    if (result.failed && result.failed.length > 0) {
      console.error(`[apns] Full failed result: ${JSON.stringify(result.failed[0])}`);
      const failedItem = result.failed[0] as unknown as Record<string, unknown>;
      const rawReason =
        (failedItem?.response as Record<string, unknown>)?.reason ??
        failedItem?.status ??
        failedItem?.error;
      const reason =
        typeof rawReason === 'string' ? rawReason : JSON.stringify(rawReason ?? failedItem);
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
