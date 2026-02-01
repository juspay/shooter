import { env } from '$env/dynamic/private';
// APNs service using proven library instead of manual implementation
import apn from '@parse/node-apn';

import type {
  APNsLibraryResult,
  APNsNotificationResult,
  APNsSentDetail,
  NotificationPayload,
} from './types.js';

export class LibraryAPNsService {
  private bundleId: string | undefined;
  private configured = false;
  private keyId: string | undefined;
  private privateKey: string | undefined;
  private provider: apn.Provider | null = null;
  private teamId: string | undefined;

  constructor() {
    console.log('=== LIBRARY APNS SERVICE INITIALIZATION ===');

    this.keyId = env.APNS_KEY_ID;
    this.teamId = env.APNS_TEAM_ID;
    this.bundleId = env.APNS_BUNDLE_ID;
    this.privateKey = env.APNS_KEY;

    console.log('Configuration:');
    console.log('- Key ID:', this.keyId || 'NOT SET');
    console.log('- Team ID:', this.teamId || 'NOT SET');
    console.log('- Bundle ID:', this.bundleId || 'NOT SET');
    console.log(
      '- Private Key:',
      this.privateKey ? `SET (${this.privateKey.length} chars)` : 'NOT SET'
    );

    if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
      console.error('Missing required APNs configuration');
      this.configured = false;
      return;
    }

    // Create APNs provider using library
    const options = {
      production: false, // Sandbox mode for development iOS app
      token: {
        key: this.privateKey,
        keyId: this.keyId,
        teamId: this.teamId,
      },
    };

    console.log('Creating APNs provider with options:');
    console.log('- Production:', options.production);
    console.log('- Key ID:', options.token.keyId);
    console.log('- Team ID:', options.token.teamId);

    try {
      this.provider = new apn.Provider(options);
      this.configured = true;
      console.log('✅ Library APNs provider created successfully');
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to create APNs provider:', err.message);
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
    console.log('=== LIBRARY APNS NOTIFICATION ===');
    console.log(
      'Device Token:',
      deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
    );
    console.log('Payload:', payload);

    if (!this.configured || !this.provider) {
      throw new Error('APNs service not configured properly');
    }

    if (!deviceToken || !payload) {
      throw new Error('Device token and payload are required');
    }

    try {
      // Create notification using library
      const notification = new apn.Notification();

      // Set basic properties
      notification.alert = {
        body: payload.body || payload.message || '',
        title: payload.title,
      };

      notification.badge = payload.badge || 1;
      notification.sound = payload.sound || 'default';
      notification.topic = this.bundleId!;

      // Add custom data if provided
      if (payload.data) {
        notification.payload = payload.data;
      }

      console.log('📱 Library Notification Object:');
      console.log('- Alert:', notification.alert);
      console.log('- Badge:', notification.badge);
      console.log('- Sound:', notification.sound);
      console.log('- Topic:', notification.topic);
      console.log('- Custom payload:', notification.payload);

      console.log('📤 Sending via library...');

      // Send using library
      const result = (await this.provider.send(notification, deviceToken)) as APNsLibraryResult;

      console.log('📥 Library Result:');
      console.log('- Sent:', result.sent?.length || 0);
      console.log('- Failed:', result.failed?.length || 0);

      if (result.failed && result.failed.length > 0) {
        console.log('❌ Failed notifications:');
        result.failed.forEach((failed, index) => {
          console.log(`  ${index + 1}. Device: ${failed.device}`);
          console.log(`     Status: ${failed.status}`);
          console.log(`     Response: ${JSON.stringify(failed.response)}`);
        });

        return {
          details: result.failed as unknown as APNsSentDetail[],
          error: result.failed[0]?.response?.reason || 'Unknown error',
          failed: result.failed?.length || 0,
          sent: result.sent?.length || 0,
          success: false,
        };
      }

      if (result.sent && result.sent.length > 0) {
        console.log('🎉 SUCCESS: Library sent notification!');
        console.log('- Sent devices:', result.sent.length);

        return {
          details: result.sent,
          failed: 0,
          sent: result.sent.length,
          success: true,
        };
      }

      console.log('⚠️ Unexpected result format:', result);
      return {
        details: [result as unknown as Record<string, unknown>],
        error: 'Unexpected result format',
        failed: 1,
        sent: 0,
        success: false,
      };
    } catch (error) {
      console.error('💥 Library APNs Error:', error);
      throw error;
    }
  }

  shutdown(): void {
    if (this.provider) {
      void this.provider.shutdown();
    }
  }
}

export default LibraryAPNsService;
