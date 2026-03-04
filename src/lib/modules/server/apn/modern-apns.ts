import type { ErrorData as APNsErrorData, Header as JWTHeader, Payload as JWTPayload } from '$generated/types';

import { env } from '$env/dynamic/private';
import http2, { type ClientHttp2Session, type ClientHttp2Stream, type IncomingHttpHeaders } from 'http2';
import jwt from 'jsonwebtoken';

import type {
  NotificationResult as APNsNotificationResult,
  NotificationPayload,
} from './types';

interface APNsPayload {
  [key: string]: unknown;
  aps: {
    alert: {
      body: string;
      title: string;
    };
    badge: number;
    sound: string;
  };
}

export class ModernAPNsService {
  private apnsHost: string;
  private apnsKey: string | undefined;
  private bundleId: string | undefined;
  private configError: null | string = null;
  private configured = false;
  private isProduction = false;
  private keyId: string | undefined;
  private teamId: string | undefined;
  private tokenCache: null | string = null;
  private tokenExpiry = 0;

  constructor() {
    console.log('=== MODERN APNS SERVICE INITIALIZATION ===');

    const apnsKey = env.APNS_KEY;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    const bundleId = env.APNS_BUNDLE_ID;
    const nodeEnv = env.NODE_ENV;

    console.log('Environment variables check:');
    console.log('- APNS_KEY:', apnsKey ? `SET (${apnsKey.length} chars)` : 'NOT SET');
    console.log('- APNS_KEY_ID:', keyId || 'NOT SET');
    console.log('- APNS_TEAM_ID:', teamId || 'NOT SET');
    console.log('- APNS_BUNDLE_ID:', bundleId || 'NOT SET');
    console.log('- NODE_ENV:', nodeEnv || 'NOT SET');

    if (!apnsKey || !keyId || !teamId || !bundleId) {
      console.error('Missing required APNs environment variables');
      this.configured = false;
      this.configError = 'Missing required environment variables';
      this.apnsHost = '';
      return;
    }

    this.apnsKey = apnsKey;
    this.keyId = keyId;
    this.teamId = teamId;
    this.bundleId = bundleId;
    // Force sandbox environment for development device tokens
    this.isProduction = false;

    // Always use sandbox for development device tokens
    this.apnsHost = 'api.sandbox.push.apple.com';

    console.log(
      `✅ Modern APNs service configured for ${this.isProduction ? 'PRODUCTION' : 'SANDBOX'}`
    );
    console.log(`- APNs Host: ${this.apnsHost}`);

    this.configured = true;
    this.configError = null;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsNotificationResult> {
    console.log('=== MODERN APNS NOTIFICATION SENDING ===');
    console.log(
      '- Device Token:',
      deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
    );
    console.log('- Payload:', payload);
    console.log('- APNs Host:', this.apnsHost);

    if (!this.configured) {
      throw new Error(`APNs service not configured: ${this.configError}`);
    }

    if (!deviceToken) {
      throw new Error('Device token is required');
    }

    if (!payload?.title || !payload.body) {
      throw new Error('Payload with title and body is required');
    }

    try {
      // Generate JWT token
      const authToken = this.generateJWT();

      // Create APNs payload
      const apnsPayload: APNsPayload = {
        aps: {
          alert: {
            body: payload.body,
            title: payload.title,
          },
          badge: payload.badge || 1,
          sound: payload.sound || 'default',
        },
        ...payload.data,
      };

      const payloadJSON = JSON.stringify(apnsPayload);
      console.log('📱 APNs Payload:', payloadJSON);

      // HTTP/2 request
      const client: ClientHttp2Session = http2.connect(`https://${this.apnsHost}`);

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'apns-priority': '10',
        'apns-push-type': 'alert',
        'apns-topic': this.bundleId!,
        authorization: `bearer ${authToken}`,
        'content-type': 'application/json',
      };

      console.log('📤 Sending HTTP/2 request...');
      console.log('- Headers:', {
        path: headers[':path'],
        priority: headers['apns-priority'],
        pushType: headers['apns-push-type'],
        topic: headers['apns-topic'],
      });

      return new Promise((resolve, reject) => {
        const req: ClientHttp2Stream = client.request(headers);

        let responseData = '';

        req.on('response', (headers: IncomingHttpHeaders) => {
          const status = Number(headers[':status']);
          console.log('📥 APNs Response Status:', status);
          console.log('- Response Headers:', headers);

          req.on('data', (chunk: Buffer) => {
            responseData += chunk;
          });

          req.once('end', () => {
            if (responseData) {
              console.log('📄 Response Data:', responseData);
            }
            client.close();

            if (status === 200) {
              console.log('🎉 SUCCESS: Notification sent successfully!');
              resolve({
                apnsId: null,
                details: null,
                error: null,
                errorData: null,
                errors: null,
                failed: 0,
                headers: headers as Record<string, unknown>,
                response: null,
                responseBody: null,
                sent: 1,
                status,
                statusCode: status,
                success: true,
              });
            } else {
              console.log('❌ FAILED: APNs rejected the notification');
              let errorData: APNsErrorData | null = null;
              if (responseData) {
                try {
                  errorData = JSON.parse(responseData);
                } catch {
                  errorData = null;
                }
              }
              resolve({
                apnsId: null,
                details: null,
                error: `APNs returned status ${status}`,
                errorData,
                errors: null,
                failed: 1,
                headers: headers as Record<string, unknown>,
                response: null,
                responseBody: responseData,
                sent: 0,
                status,
                statusCode: status,
                success: false,
              });
            }
          });
        });

        req.on('error', (error: Error) => {
          console.error('❌ HTTP/2 Request Error:', error);
          client.close();
          reject(error);
        });

        req.write(payloadJSON);
        req.end();
      });
    } catch (error) {
      console.error('💥 Modern APNs Error:', error);
      throw error;
    }
  }

  private generateJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    // Return cached token if it's valid for at least 5 more minutes
    if (this.tokenCache && this.tokenExpiry > now + 300) {
      console.log('Using cached JWT token');
      return this.tokenCache;
    }
    console.log('Generating new JWT token...');

    try {
      const header: JWTHeader = {
        alg: 'ES256',
        kid: this.keyId!,
      };

      const payload: JWTPayload = {
        exp: now + 3600, // Expires in 1 hour (max 1 hour for APNs)
        iat: now,
        iss: this.teamId!,
      };

      console.log('- Header:', header);
      console.log('- Payload:', payload);

      const token = jwt.sign(payload, this.apnsKey!, {
        algorithm: 'ES256',
        header,
        noTimestamp: true, // We're providing iat manually
      });

      console.log('✅ JWT token generated successfully');
      console.log('- Token length:', token.length);

      // Debug the JWT structure
      const parts = token.split('.');
      console.log('- JWT parts count:', parts.length);
      if (parts.length === 3) {
        try {
          const headerDecoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
          const payloadDecoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          console.log('- Decoded header:', headerDecoded);
          console.log('- Decoded payload:', payloadDecoded);
          console.log('- IAT time:', new Date(payloadDecoded.iat * 1000).toISOString());
        } catch {
          console.log('- Could not decode JWT parts for debugging');
        }
      }

      this.tokenCache = token;
      this.tokenExpiry = now + 3600;
      return token;
    } catch (error) {
      const err = error as Error;
      console.error('❌ JWT generation failed:', err);
      throw new Error(`JWT generation failed: ${err.message}`);
    }
  }
}
