import type { Provider, ProviderOptions, Responses } from 'apn';
import apn from 'apn';
import { config } from '$lib/config';
import type { NotificationPayload, APNsResult } from '$types/notifications';
import { retryWithBackoff, CircuitBreaker } from './retry-utils';

export class APNsService {
  private provider: Provider | null = null;
  private configError: string | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute reset
    console.log('=== APNs SERVICE INITIALIZATION ===');

    const { apns, isProduction } = config;

    console.log('Environment variables check:');
    console.log('- APNS_KEY_P8:', apns.keyP8 ? `SET (${apns.keyP8.length} chars)` : 'NOT SET');
    console.log('- APNS_KEY_ID:', apns.keyId || 'NOT SET');
    console.log('- APNS_TEAM_ID:', apns.teamId || 'NOT SET');
    console.log('- APNS_BUNDLE_ID:', apns.bundleId || 'NOT SET');
    console.log('- APNS_ENVIRONMENT:', apns.environment);
    console.log('- Production mode:', isProduction);

    // Debug the key format
    if (apns.keyP8) {
      console.log('APNs key preview:');
      console.log('- First 50 chars:', JSON.stringify(apns.keyP8.substring(0, 50)));
      console.log('- Last 50 chars:', JSON.stringify(apns.keyP8.substring(apns.keyP8.length - 50)));
      console.log('- Has BEGIN:', apns.keyP8.includes('BEGIN PRIVATE KEY'));
      console.log('- Has END:', apns.keyP8.includes('END PRIVATE KEY'));
      console.log('- Line count:', apns.keyP8.split('\n').length);
    }

    if (!apns.keyP8 || !apns.keyId || !apns.teamId) {
      console.error('APNs configuration incomplete. Missing required environment variables.');
      this.provider = null;
      this.configError = 'Missing required environment variables';
      return;
    }

    // Validate APNs key format
    if (!apns.keyP8.includes('BEGIN PRIVATE KEY') || !apns.keyP8.includes('END PRIVATE KEY')) {
      console.error('APNs key format appears invalid - missing PEM headers');
      this.provider = null;
      this.configError = 'Invalid APNs key format';
      return;
    }

    try {
      console.log('Creating APNs provider...');

      // Clean the APNs key - ensure proper formatting
      let cleanedKey = apns.keyP8.trim();

      // If the key doesn't have proper line breaks, add them
      if (!cleanedKey.includes('\n')) {
        console.log('Key appears to be on single line, fixing format...');
        cleanedKey = cleanedKey.replace(
          /-----BEGIN PRIVATE KEY-----(.+)-----END PRIVATE KEY-----/,
          '-----BEGIN PRIVATE KEY-----\n$1\n-----END PRIVATE KEY-----'
        );
      }

      console.log('Using cleaned key format');

      // IMPORTANT: APNs library expects either:
      // 1. A file path (string) to a .p8 file, OR
      // 2. A Buffer containing the key content
      // Convert our key string to a Buffer for proper handling
      const keyBuffer = Buffer.from(cleanedKey, 'utf8');

      const providerOptions: ProviderOptions = {
        token: {
          key: keyBuffer,  // Use Buffer instead of raw string
          keyId: apns.keyId,
          teamId: apns.teamId
        },
        production: apns.environment === 'production'
      };

      this.provider = new apn.Provider(providerOptions);
      console.log('✅ APNs provider initialized successfully');
      this.configError = null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('❌ Failed to initialize APNs provider:', error);
      console.error('Error details:', errorMessage);
      if (errorStack) {
console.error('Error stack:', errorStack);
}
      this.provider = null;
      this.configError = errorMessage;
    }
  }

  async sendNotification(deviceToken: string, payload: NotificationPayload): Promise<APNsResult> {
    const { development } = config;

    if (development.debug) {
      console.log('=== SENDING NOTIFICATION ===');
      console.log('Function arguments:');
      console.log('- deviceToken type:', typeof deviceToken);
      console.log(
        '- deviceToken value:',
        deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
      );
      console.log('- payload type:', typeof payload);
      console.log('- payload value:', payload);

      if (payload) {
        console.log('- payload.title:', payload.title);
        console.log('- payload.body:', payload.body);
        console.log('- payload.data:', payload.data);
      }

      console.log('Provider available:', !!this.provider);
      console.log('Config error:', this.configError);

      try {
        console.log('Payload JSON stringify test:', JSON.stringify(payload, null, 2));
      } catch (jsonErr) {
        console.error('Failed to stringify payload:', jsonErr);
      }
    }

    if (!this.provider) {
      const error = `APNs provider not initialized. ${this.configError || 'Check your configuration.'}`;
      console.error(error);
      throw new Error(error);
    }

    if (!deviceToken) {
      console.error('Device token is required');
      throw new Error('Device token is required');
    }

    if (!payload) {
      console.error('Payload is required for sending notifications');
      throw new Error('Payload is required for sending notifications');
    }

    // Validate device token format
    if (!/^[a-f0-9]{64}$/i.test(deviceToken)) {
      console.error('Invalid device token format. Expected 64 hex characters.');
      throw new Error('Invalid device token format');
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

    if (development.debug) {
      console.log('Creating notification object...');
    }

    const notification = new apn.Notification();

    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.topic = config.apns.bundleId;

    // Use the correct APNs library API
    notification.alert =
      payload.title && payload.body
        ? {
            title: payload.title,
            body: payload.body
          }
        : 'SHOOTER Notification';

    notification.badge = payload.badge || 1;
    notification.sound = payload.sound || 'default';
    notification.payload = payload.data || {};

    if (development.debug) {
      // Quick debug info (reduced verbosity)
      const alertData = notification.aps?.alert;
      console.log('📱 SHOOTER Notification prepared:');
      console.log(
        '- Title:',
        typeof alertData === 'object' && alertData ? alertData.title : 'No title'
      );
      console.log(
        '- Body:',
        typeof alertData === 'object' && alertData ? alertData.body : 'No body'
      );
      console.log('- Target Bundle:', notification.topic);
    }

    try {
      if (development.debug) {
        console.log('🚀 Sending push notification...');

        // Debug the notification object before sending
        console.log('Notification object details:');
        console.log('- notification.alert:', JSON.stringify(notification.alert));
        console.log('- notification.payload:', JSON.stringify(notification.payload));
        console.log(
          '- notification as JSON:',
          JSON.stringify({
            alert: notification.alert,
            badge: notification.badge,
            sound: notification.sound,
            payload: notification.payload,
            topic: notification.topic,
            expiry: notification.expiry
          })
        );

        console.log('About to call provider.send...');
      }

      if (!this.provider) {
        throw new Error('APNs provider not initialized');
      }

      const result: Responses = await this.provider.send(notification, deviceToken);

      if (development.debug) {
        console.log('provider.send completed successfully');
        console.log('📱 APNs Response:');
        console.log('- Sent:', result.sent.length);
        console.log('- Failed:', result.failed.length);

        if (result.sent.length > 0) {
          console.log('✅ Notification sent successfully!');
          result.sent.forEach((sent, i) => {
            console.log(`  Sent ${i + 1}:`, sent.device);
          });
        }

        if (result.failed.length > 0) {
          console.log('❌ Failed notifications:');
          result.failed.forEach((failed, i) => {
            console.log(`  Failed ${i + 1}:`, {
              device: failed.device,
              status: failed.status,
              response: failed.response
            });
          });
        }
      }

      return {
        success: result.sent.length > 0,
        sent: result.sent.length,
        failed: result.failed.length,
        errors: result.failed.map(f => ({
          device: f.device,
          status: f.status ? parseInt(f.status, 10) : undefined, // Parse string status to number
          response: f.response
        }))
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('💥 APNs sending error:', error);
      console.error('Error message:', errorMessage);
      console.error('Error type:', errorName);
      if (errorStack) {
console.error('Error stack:', errorStack);
}

      // Check if it's a JSON parsing error
      if (errorMessage.includes('JSON')) {
        console.error('🔍 JSON parsing error detected!');
        console.error('Error details:', {
          message: errorMessage,
          name: errorName
        });

        // Extract position from error message
        const positionMatch = errorMessage.match(/position (\d+)/);
        if (positionMatch && positionMatch[1]) {
          const position = Number.parseInt(positionMatch[1], 10);
          console.error(`🔍 JSON error at position ${position}`);

          // Check both the APNs key and notification JSON
          const apnsKey = config.apns.keyP8;
          console.error('🔍 APNs key analysis:');
          console.error(`Key length: ${apnsKey.length}`);

          if (position < apnsKey.length) {
            const startPos = Math.max(0, position - 15);
            const endPos = Math.min(apnsKey.length, position + 15);
            const segment = apnsKey.substring(startPos, endPos);
            console.error(`Key segment around position ${position}:`);
            console.error(`"${segment}"`);
            console.error(
              `Character at ${position}: "${apnsKey[position]}" (ASCII: ${apnsKey.charCodeAt(position)})`
            );
          }

          // Also check the notification JSON
          try {
            const notifJson = JSON.stringify({
              alert: notification.alert,
              badge: notification.badge,
              sound: notification.sound,
              payload: notification.payload,
              topic: notification.topic,
              expiry: notification.expiry
            });
            console.error('🔍 Notification JSON analysis:');
            console.error(`JSON length: ${notifJson.length}`);

            if (position < notifJson.length) {
              const startPos = Math.max(0, position - 15);
              const endPos = Math.min(notifJson.length, position + 15);
              const segment = notifJson.substring(startPos, endPos);
              console.error(`JSON segment around position ${position}:`);
              console.error(`"${segment}"`);
              console.error(
                `Character at ${position}: "${notifJson[position]}" (ASCII: ${notifJson.charCodeAt(position)})`
              );
            }
          } catch (jsonError: unknown) {
            const jsonErrorMessage =
              jsonError instanceof Error ? jsonError.message : 'Unknown JSON error';
            console.error('Could not analyze notification JSON:', jsonErrorMessage);
          }
        }
      }

      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.provider;
  }

  getConfigError(): string | null {
    return this.configError;
  }

  getProvider(): Provider | null {
    return this.provider;
  }

  shutdown(): void {
    if (this.provider) {
      this.provider.shutdown();
    }
  }
}
