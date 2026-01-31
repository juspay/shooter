// APNs service using proven library instead of manual implementation
import type { Provider, ProviderOptions, ResponseFailure } from '@parse/node-apn';
import apn from '@parse/node-apn';
import { config } from '$lib/config';
import type { NotificationPayload, APNsResult } from '$types/notifications';
import { retryWithBackoff, CircuitBreaker } from './retry-utils';

export class LibraryAPNsService {
  private keyId: string;
  private teamId: string;
  private bundleId: string;
  private privateKey: string;
  private provider: Provider | null = null;
  private configured: boolean = false;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    console.log('=== LIBRARY APNS SERVICE INITIALIZATION ===');

    const { apns, development } = config;

    this.keyId = apns.keyId;
    this.teamId = apns.teamId;
    this.bundleId = apns.bundleId;
    this.privateKey = apns.keyP8;
    this.circuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute reset

    if (development.debug) {
      console.log('Configuration:');
      console.log('- Key ID:', this.keyId || 'NOT SET');
      console.log('- Team ID:', this.teamId || 'NOT SET');
      console.log('- Bundle ID:', this.bundleId || 'NOT SET');
      console.log(
        '- Private Key:',
        this.privateKey ? `SET (${this.privateKey.length} chars)` : 'NOT SET'
      );
    }

    if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
      console.error('Missing required APNs configuration');
      this.configured = false;
      return;
    }

    // Create APNs provider using library
    // IMPORTANT: @parse/node-apn expects either:
    // 1. A file path (string) to a .p8 file, OR
    // 2. A Buffer containing the key content in PEM format

    // Ensure key has proper PEM format
    let formattedKey = this.privateKey.trim();
    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // Raw key without headers - add PEM formatting
      formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
    }

    const keyBuffer = Buffer.from(formattedKey, 'utf8');

    const options: ProviderOptions = {
      token: {
        key: keyBuffer,  // Use Buffer instead of raw string
        keyId: this.keyId,
        teamId: this.teamId
      },
      production: apns.environment === 'production'
    };

    if (development.debug) {
      console.log('Creating APNs provider with options:');
      console.log('- Production:', options.production);
      console.log('- Key ID:', options.token?.keyId);
      console.log('- Team ID:', options.token?.teamId);
    }

    try {
      this.provider = new apn.Provider(options);
      this.configured = true;
      console.log('✅ Library APNs provider created successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      console.error('❌ Failed to create APNs provider:', errorMessage);
      this.configured = false;
    }
  }

  async sendNotification(deviceToken: string, payload: NotificationPayload): Promise<APNsResult> {
    const { development } = config;

    if (development.debug) {
      console.log('=== LIBRARY APNS NOTIFICATION ===');
      console.log(
        'Device Token:',
        deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
      );
      console.log('Payload:', payload);
    }

    if (!this.configured || !this.provider) {
      throw new Error('APNs service not configured properly');
    }

    if (!deviceToken || !payload) {
      throw new Error('Device token and payload are required');
    }

    // Use circuit breaker and retry logic for resilient notification delivery
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => await this.sendNotificationInternal(deviceToken, payload),
        {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2,
          onRetry: (attempt, error) => {
            if (development.debug) {
              console.log(`🔄 Retry attempt ${attempt} for APNs notification:`, error.message);
            }
          }
        }
      );
    });
  }

  private async sendNotificationInternal(deviceToken: string, payload: NotificationPayload): Promise<APNsResult> {
    const { development } = config;

    try {
      // Create notification using library
      const notification = new apn.Notification();

      // Set basic properties
      notification.alert = {
        title: payload.title,
        body: payload.body
      };

      notification.badge = payload.badge || 1;
      notification.sound = payload.sound || 'default';
      notification.topic = this.bundleId;

      // Add custom data if provided
      if (payload.data) {
        notification.payload = payload.data;
      }

      if (development.debug) {
        console.log('📱 Library Notification Object:');
        console.log('- Alert:', notification.alert);
        console.log('- Badge:', notification.badge);
        console.log('- Sound:', notification.sound);
        console.log('- Topic:', notification.topic);
        console.log('- Custom payload:', notification.payload);
        console.log('📤 Sending via library...');
      }

      if (!this.provider) {
        throw new Error('APNs provider not initialized');
      }

      // Send using library
      const result = await this.provider.send(notification, deviceToken);

      if (development.debug) {
        console.log('📥 Library Result:');
        console.log('- Sent:', result.sent?.length || 0);
        console.log('- Failed:', result.failed?.length || 0);
      }

      if (result.failed && result.failed.length > 0) {
        if (development.debug) {
          console.log('❌ Failed notifications:');
          result.failed.forEach((failed: ResponseFailure, index: number) => {
            console.log(`  ${index + 1}. Device: ${failed.device}`);
            console.log(`     Status: ${failed.status}`);
            console.log(`     Response: ${JSON.stringify(failed.response)}`);
          });
        }

        return {
          success: false,
          sent: result.sent?.length || 0,
          failed: result.failed?.length || 0,
          errors: result.failed.map((f: ResponseFailure) => ({
            device: f.device,
            status: f.status,
            response: f.response
          }))
        };
      }

      if (result.sent && result.sent.length > 0) {
        if (development.debug) {
          console.log('🎉 SUCCESS: Library sent notification!');
          console.log('- Sent devices:', result.sent.length);
        }

        return {
          success: true,
          sent: result.sent.length,
          failed: 0,
          errors: []
        };
      }

      if (development.debug) {
        console.log('⚠️ Unexpected result format:', result);
      }
      return {
        success: false,
        sent: 0,
        failed: 1,
        errors: [
          {
            device: deviceToken,
            status: 0, // 0 indicates unknown status
            response: 'Unexpected result format'
          }
        ]
      };
    } catch (error: unknown) {
      console.error('💥 Library APNs Error:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  shutdown(): void {
    if (this.provider) {
      this.provider.shutdown();
    }
  }
}

export default LibraryAPNsService;
