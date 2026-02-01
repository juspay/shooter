import { env } from '$env/dynamic/private';
import apn from 'apn';

import type { APNsError, APNsNotificationResult, NotificationPayload } from './types.js';

export class APNsService {
  get configError(): null | string {
    return this._configError;
  }
  // Public getters for debugging
  get provider(): apn.Provider | null {
    return this._provider;
  }

  private _configError: null | string = null;

  private _provider: apn.Provider | null = null;

  constructor() {
    console.log('=== APNs SERVICE INITIALIZATION ===');

    let apnsKey = env.APNS_KEY;
    const apnsKeyBase64 = env.APNS_KEY_BASE64;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    const bundleId = env.APNS_BUNDLE_ID;
    const nodeEnv = env.NODE_ENV;

    // Try to use base64 version if available (to avoid newline issues)
    if (apnsKeyBase64) {
      console.log('Using base64 APNs key format');
      apnsKey = `-----BEGIN PRIVATE KEY-----\n${apnsKeyBase64.trim()}\n-----END PRIVATE KEY-----`;
    }

    console.log('Environment variables check:');
    console.log('- APNS_KEY:', apnsKey ? `SET (${apnsKey.length} chars)` : 'NOT SET');
    console.log('- APNS_KEY_ID:', keyId || 'NOT SET');
    console.log('- APNS_TEAM_ID:', teamId || 'NOT SET');
    console.log('- APNS_BUNDLE_ID:', bundleId || 'NOT SET');
    console.log('- NODE_ENV:', nodeEnv || 'NOT SET');
    console.log('- Production mode:', nodeEnv === 'production');

    // Debug the key format
    if (apnsKey) {
      console.log('APNs key preview:');
      console.log('- First 50 chars:', JSON.stringify(apnsKey.substring(0, 50)));
      console.log('- Last 50 chars:', JSON.stringify(apnsKey.substring(apnsKey.length - 50)));
      console.log('- Has BEGIN:', apnsKey.includes('BEGIN PRIVATE KEY'));
      console.log('- Has END:', apnsKey.includes('END PRIVATE KEY'));
      console.log('- Line count:', apnsKey.split('\n').length);
    }

    if (!apnsKey || !keyId || !teamId) {
      console.error('APNs configuration incomplete. Missing required environment variables.');
      this._provider = null;
      this._configError = 'Missing required environment variables';
      return;
    }

    // Validate APNs key format
    if (!apnsKey.includes('BEGIN PRIVATE KEY') || !apnsKey.includes('END PRIVATE KEY')) {
      console.error('APNs key format appears invalid - missing PEM headers');
      this._provider = null;
      this._configError = 'Invalid APNs key format';
      return;
    }

    try {
      console.log('Creating APNs provider...');

      // Clean the APNs key - ensure proper formatting
      let cleanedKey = apnsKey.trim();

      // If the key doesn't have proper line breaks, add them
      if (!cleanedKey.includes('\n')) {
        console.log('Key appears to be on single line, fixing format...');
        cleanedKey = cleanedKey.replace(
          /-----BEGIN PRIVATE KEY-----(.+)-----END PRIVATE KEY-----/,
          '-----BEGIN PRIVATE KEY-----\n$1\n-----END PRIVATE KEY-----'
        );
      }

      console.log('Using cleaned key format');

      this._provider = new apn.Provider({
        production: false, // Use sandbox for development device tokens
        token: {
          key: cleanedKey,
          keyId,
          teamId,
        },
      });
      console.log('✅ APNs provider initialized successfully');
      this._configError = null;
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to initialize APNs provider:', err);
      console.error('Error details:', err.message);
      console.error('Error stack:', err.stack);
      this._provider = null;
      this._configError = err.message;
    }
  }

  isConfigured(): boolean {
    return !!this._provider;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsNotificationResult> {
    console.log('=== SENDING NOTIFICATION ===');
    console.log('Function arguments:');
    console.log('- deviceToken type:', typeof deviceToken);
    console.log(
      '- deviceToken value:',
      deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
    );
    console.log('- payload type:', typeof payload);
    console.log('- payload value:', payload);
    console.log('- payload is null:', payload === null);
    console.log('- payload is undefined:', payload === undefined);

    if (payload) {
      console.log('- payload.title:', payload.title);
      console.log('- payload.body:', payload.body);
      console.log('- payload.data:', payload.data);
    }

    console.log('Provider available:', !!this._provider);
    console.log('Config error:', this._configError);

    try {
      console.log('Payload JSON stringify test:', JSON.stringify(payload, null, 2));
    } catch (jsonErr) {
      console.error('Failed to stringify payload:', jsonErr);
    }

    if (!this._provider) {
      const error = `APNs provider not initialized. ${this._configError || 'Check your configuration.'}`;
      console.error(error);
      throw new Error(error);
    }

    if (!deviceToken) {
      console.error('Device token is required');
      throw new Error('Device token is required');
    }

    if (payload === null || payload === undefined) {
      console.error('Payload is null or undefined. Received:', payload);
      console.error('Type of payload:', typeof payload);
      throw new Error('Payload is required for sending notifications');
    }

    // Defensive check for payload properties
    if (typeof payload !== 'object') {
      console.error('Payload is not an object. Type:', typeof payload, 'Value:', payload);
      throw new Error('Payload must be an object');
    }

    // Validate device token format
    if (!/^[a-f0-9]{64}$/i.test(deviceToken)) {
      console.error('Invalid device token format. Expected 64 hex characters.');
      throw new Error('Invalid device token format');
    }

    console.log('Creating notification object...');
    const notification = new apn.Notification();

    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.topic = env.APNS_BUNDLE_ID || '';

    // Use the correct APNs library API
    notification.alert =
      payload && payload.title && payload.body
        ? {
            body: payload.body,
            title: payload.title,
          }
        : 'SHOOTER Notification';

    notification.badge = (payload?.badge) || 1;
    notification.sound = (payload?.sound) || 'default';
    notification.payload = (payload?.data) || {};

    // Quick debug info (reduced verbosity)
    const alertData = notification.aps
      ? (notification.aps as { alert?: { body?: string; title?: string; } }).alert
      : null;
    console.log('📱 SHOOTER Notification prepared:');
    console.log('- Title:', alertData ? alertData.title : 'No title');
    console.log('- Body:', alertData ? alertData.body : 'No body');
    console.log('- Target Bundle:', notification.topic);

    try {
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
          expiry: notification.expiry,
          payload: notification.payload,
          sound: notification.sound,
          topic: notification.topic,
        })
      );

      console.log('About to call provider.send...');
      const result = await this._provider.send(notification, deviceToken);
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
            response: failed.response,
            status: failed.status,
          });
        });
      }

      const errors: APNsError[] = result.failed.map((f) => ({
        device: f.device,
        response: f.response,
        status: typeof f.status === 'number' ? f.status : undefined,
      }));

      return {
        errors,
        failed: result.failed.length,
        sent: result.sent.length,
        success: result.sent.length > 0,
      };
    } catch (error) {
      const err = error as Error;
      console.error('💥 APNs sending error:', err);
      console.error('Error message:', err.message);
      console.error('Error type:', err.constructor.name);
      console.error('Error stack:', err.stack);

      // Check if it's a JSON parsing error
      if (err.message && err.message.includes('JSON')) {
        console.error('🔍 JSON parsing error detected!');
        console.error('Error details:', {
          message: err.message,
          name: err.name,
        });

        // Extract position from error message
        const positionMatch = /position (\d+)/.exec(err.message);
        if (positionMatch) {
          const position = parseInt(positionMatch[1]);
          console.error(`🔍 JSON error at position ${position}`);

          // Check both the APNs key and notification JSON
          const apnsKey = env.APNS_KEY || env.APNS_KEY_BASE64 || '';
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
              expiry: notification.expiry,
              payload: notification.payload,
              sound: notification.sound,
              topic: notification.topic,
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
          } catch (jsonError) {
            const jsonErr = jsonError as Error;
            console.error('Could not analyze notification JSON:', jsonErr.message);
          }
        }
      }

      throw error;
    }
  }

  shutdown(): void {
    if (this._provider) {
      this._provider.shutdown();
    }
  }
}
