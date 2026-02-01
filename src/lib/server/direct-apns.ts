import { env } from '$env/dynamic/private';
import http2, {
  type ClientHttp2Session,
  type ClientHttp2Stream,
  type IncomingHttpHeaders,
} from 'http2';
// Direct HTTP/2 APNs implementation with proven JWT library
import jwt from 'jsonwebtoken';

import type {
  APNsErrorData,
  APNsNotificationResult,
  JWTHeader,
  JWTPayload,
  NotificationPayload,
} from './types.js';

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

type RequestHeaders = Record<string, string>;

class DirectAPNsClient {
  private baseUrl: string;
  private bundleId: string | undefined;
  private configured = false;
  private isProduction = false;
  private keyId: string | undefined;
  private privateKey: string | undefined;
  private session: ClientHttp2Session | null = null;
  private teamId: string | undefined;
  private tokenCache: null | string = null;
  private tokenExpiry = 0;

  constructor() {
    console.log('=== DIRECT HTTP/2 APNS CLIENT INITIALIZATION ===');

    this.keyId = env.APNS_KEY_ID;
    this.teamId = env.APNS_TEAM_ID;
    this.bundleId = env.APNS_BUNDLE_ID;
    this.privateKey = env.APNS_KEY;
    this.isProduction = false; // Use sandbox with development device token

    this.baseUrl = this.isProduction
      ? 'https://api.push.apple.com:443'
      : 'https://api.development.push.apple.com:443';

    console.log('Configuration:');
    console.log('- Key ID:', this.keyId || 'NOT SET');
    console.log('- Team ID:', this.teamId || 'NOT SET');
    console.log('- Bundle ID:', this.bundleId || 'NOT SET');
    console.log(
      '- Private Key:',
      this.privateKey ? `SET (${this.privateKey.length} chars)` : 'NOT SET'
    );
    console.log('- Environment:', this.isProduction ? 'PRODUCTION' : 'SANDBOX');
    console.log('- APNs URL:', this.baseUrl);

    if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
      console.error('Missing required APNs configuration');
      this.configured = false;
      return;
    }

    this.configured = true;
    console.log('✅ Direct APNs client configured successfully');
  }

  disconnect(): void {
    if (this.session && !this.session.destroyed) {
      this.session.close();
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendNotification(
    deviceToken: string,
    payload: NotificationPayload
  ): Promise<APNsNotificationResult> {
    console.log('=== DIRECT HTTP/2 APNS NOTIFICATION ===');
    console.log(
      'Device Token:',
      deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED'
    );
    console.log('Payload:', payload);

    if (!this.configured) {
      throw new Error('APNs client not configured properly');
    }

    if (!deviceToken || !payload) {
      throw new Error('Device token and payload are required');
    }

    try {
      await this.connect();

      const authToken = this.generateJWT();

      // Create APNs payload structure
      const apnsPayload: APNsPayload = {
        aps: {
          alert: {
            body: payload.body || payload.message || '',
            title: payload.title,
          },
          badge: payload.badge || 1,
          sound: payload.sound || 'default',
        },
      };

      // Add custom data if provided
      if (payload.data) {
        Object.assign(apnsPayload, payload.data);
      }

      const payloadJSON = JSON.stringify(apnsPayload);
      console.log('📱 Final APNs Payload:', payloadJSON);

      const headers: RequestHeaders = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        ':scheme': 'https',
        'apns-priority': '10',
        'apns-push-type': 'alert',
        'apns-topic': this.bundleId!,
        authorization: `bearer ${authToken}`,
        'content-type': 'application/json',
      };

      console.log('📤 Request Headers:');
      console.log('- Method:', headers[':method']);
      console.log('- Path:', headers[':path']);
      console.log('- Topic:', headers['apns-topic']);
      console.log('- Push Type:', headers['apns-push-type']);
      console.log('- Priority:', headers['apns-priority']);
      console.log('- Auth Token:', `Bearer ${authToken.substring(0, 50)}...`);

      return new Promise((resolve, reject) => {
        const request: ClientHttp2Stream = this.session!.request(headers);
        let responseData = '';
        let statusCode: number;
        let responseHeaders: IncomingHttpHeaders;

        const timeout = setTimeout(() => {
          request.destroy();
          reject(new Error('Request timeout'));
        }, 10000);

        request.on('response', (headers: IncomingHttpHeaders) => {
          statusCode = Number(headers[':status']);
          responseHeaders = headers;
          console.log('📥 APNs Response Status:', statusCode);
          console.log('📥 Response Headers:', headers);
          clearTimeout(timeout);
        });

        request.on('data', (chunk: Buffer) => {
          responseData += chunk;
        });

        request.on('end', () => {
          console.log('📄 Response Data:', responseData);

          let parsedData: APNsErrorData | null = null;
          if (responseData) {
            try {
              parsedData = JSON.parse(responseData);
              console.log('📄 Parsed Response:', parsedData);
            } catch {
              console.log('📄 Raw Response:', responseData);
            }
          }

          const apnsId = responseHeaders['apns-id'] as string | undefined;

          if (statusCode === 200) {
            console.log('🎉 SUCCESS: Notification sent via direct HTTP/2!');
            console.log('- APNs ID:', apnsId);
            resolve({
              apnsId,
              failed: 0,
              response: {
                apnsId,
                data: parsedData,
                headers: responseHeaders as Record<string, string>,
                statusCode,
                success: true,
              },
              sent: 1,
              statusCode,
              success: true,
            });
          } else {
            console.log('❌ FAILED: APNs rejected the notification');
            console.log('- Status:', statusCode);
            console.log('- Error:', parsedData);
            resolve({
              error: parsedData || undefined,
              failed: 1,
              response: {
                data: parsedData,
                headers: responseHeaders as Record<string, string>,
                statusCode,
                success: false,
              },
              sent: 0,
              statusCode,
              success: false,
            });
          }
        });

        request.on('error', (error: Error) => {
          console.error('❌ HTTP/2 Request Error:', error);
          clearTimeout(timeout);
          reject(error);
        });

        request.write(payloadJSON);
        request.end();
      });
    } catch (error) {
      console.error('💥 Direct APNs Error:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    if (this.session && !this.session.destroyed) {
      return;
    }

    console.log('🔌 Connecting to APNs via HTTP/2...');

    return new Promise((resolve, reject) => {
      this.session = http2.connect(this.baseUrl, {
        settings: {
          enablePush: false,
          initialWindowSize: 1048576,
        },
      });

      this.session.on('connect', () => {
        console.log('✅ Connected to APNs HTTP/2');
        resolve();
      });

      this.session.on('error', (error: Error) => {
        console.error('❌ HTTP/2 session error:', error);
        reject(error);
      });

      this.session.on('close', () => {
        console.log('🔒 APNs HTTP/2 connection closed');
        this.session = null;
      });
    });
  }

  private generateJWT(): string {
    console.log('🔑 Generating JWT token with jsonwebtoken library...');

    try {
      const now = Math.floor(Date.now() / 1000);

      // Reuse token if still valid (tokens valid for 1 hour)
      if (this.tokenCache && now < this.tokenExpiry - 300) {
        console.log('♻️ Reusing cached JWT token');
        return this.tokenCache;
      }

      const header: JWTHeader = {
        alg: 'ES256',
        kid: this.keyId!,
      };

      const payload: JWTPayload = {
        iat: now,
        iss: this.teamId!,
      };

      console.log('JWT Header:', header);
      console.log('JWT Payload:', payload);

      // Use proven jsonwebtoken library for ES256 signing
      this.tokenCache = jwt.sign(payload, this.privateKey!, {
        algorithm: 'ES256',
        header,
        noTimestamp: true, // We provide iat manually
      });

      this.tokenExpiry = now + 3600; // 1 hour

      console.log('✅ JWT token generated successfully with jsonwebtoken');
      console.log('- Token length:', this.tokenCache.length);
      console.log('- Token parts:', this.tokenCache.split('.').length);
      console.log('- Expires at:', new Date(this.tokenExpiry * 1000).toISOString());

      return this.tokenCache;
    } catch (error) {
      const err = error as Error;
      console.error('❌ JWT generation failed:', err);
      throw new Error(`JWT generation failed: ${err.message}`);
    }
  }
}

export { DirectAPNsClient };
