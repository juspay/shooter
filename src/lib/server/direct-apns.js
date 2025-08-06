// Direct HTTP/2 APNs implementation with proven JWT library
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { env } from '$env/dynamic/private';

class DirectAPNsClient {
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
      
    this.session = null;
    this.tokenCache = null;
    this.tokenExpiry = 0;
    
    console.log('Configuration:');
    console.log('- Key ID:', this.keyId || 'NOT SET');
    console.log('- Team ID:', this.teamId || 'NOT SET');
    console.log('- Bundle ID:', this.bundleId || 'NOT SET');
    console.log('- Private Key:', this.privateKey ? `SET (${this.privateKey.length} chars)` : 'NOT SET');
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
  
  base64UrlEncode(data) {
    return Buffer.from(data)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  generateJWT() {
    console.log('🔑 Generating JWT token with jsonwebtoken library...');
    
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Reuse token if still valid (tokens valid for 1 hour)
      if (this.tokenCache && now < this.tokenExpiry - 300) {
        console.log('♻️ Reusing cached JWT token');
        return this.tokenCache;
      }
      
      const header = {
        alg: 'ES256',
        kid: this.keyId
      };
      
      const payload = {
        iss: this.teamId,
        iat: now
      };
      
      console.log('JWT Header:', header);
      console.log('JWT Payload:', payload);
      
      // Use proven jsonwebtoken library for ES256 signing
      this.tokenCache = jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256',
        header: header,
        noTimestamp: true  // We provide iat manually
      });
      
      this.tokenExpiry = now + 3600; // 1 hour
      
      console.log('✅ JWT token generated successfully with jsonwebtoken');
      console.log('- Token length:', this.tokenCache.length);
      console.log('- Token parts:', this.tokenCache.split('.').length);
      console.log('- Expires at:', new Date(this.tokenExpiry * 1000).toISOString());
      
      return this.tokenCache;
      
    } catch (error) {
      console.error('❌ JWT generation failed:', error);
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }
  
  async connect() {
    if (this.session && !this.session.destroyed) {
      return;
    }
    
    console.log('🔌 Connecting to APNs via HTTP/2...');
    
    return new Promise((resolve, reject) => {
      this.session = http2.connect(this.baseUrl, {
        settings: {
          enablePush: false,
          initialWindowSize: 1048576
        }
      });
      
      this.session.on('connect', () => {
        console.log('✅ Connected to APNs HTTP/2');
        resolve();
      });
      
      this.session.on('error', (error) => {
        console.error('❌ HTTP/2 session error:', error);
        reject(error);
      });
      
      this.session.on('close', () => {
        console.log('🔒 APNs HTTP/2 connection closed');
        this.session = null;
      });
    });
  }
  
  async sendNotification(deviceToken, payload) {
    console.log('=== DIRECT HTTP/2 APNS NOTIFICATION ===');
    console.log('Device Token:', deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED');
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
      const apnsPayload = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body || payload.message
          },
          badge: payload.badge || 1,
          sound: payload.sound || 'default'
        }
      };
      
      // Add custom data if provided
      if (payload.data) {
        Object.assign(apnsPayload, payload.data);
      }
      
      const payloadJSON = JSON.stringify(apnsPayload);
      console.log('📱 Final APNs Payload:', payloadJSON);
      
      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        ':scheme': 'https',
        'authorization': `bearer ${authToken}`,
        'apns-topic': this.bundleId,
        'content-type': 'application/json',
        'apns-push-type': 'alert',
        'apns-priority': '10'
      };
      
      console.log('📤 Request Headers:');
      console.log('- Method:', headers[':method']);
      console.log('- Path:', headers[':path']);
      console.log('- Topic:', headers['apns-topic']);
      console.log('- Push Type:', headers['apns-push-type']);
      console.log('- Priority:', headers['apns-priority']);
      console.log('- Auth Token:', `Bearer ${authToken.substring(0, 50)}...`);
      
      return new Promise((resolve, reject) => {
        const request = this.session.request(headers);
        let responseData = '';
        let statusCode;
        let responseHeaders;
        
        const timeout = setTimeout(() => {
          request.destroy();
          reject(new Error('Request timeout'));
        }, 10000);
        
        request.on('response', (headers) => {
          statusCode = headers[':status'];
          responseHeaders = headers;
          console.log('📥 APNs Response Status:', statusCode);
          console.log('📥 Response Headers:', headers);
          clearTimeout(timeout);
        });
        
        request.on('data', (chunk) => {
          responseData += chunk;
        });
        
        request.on('end', () => {
          console.log('📄 Response Data:', responseData);
          
          let parsedData = null;
          if (responseData) {
            try {
              parsedData = JSON.parse(responseData);
              console.log('📄 Parsed Response:', parsedData);
            } catch (e) {
              console.log('📄 Raw Response:', responseData);
            }
          }
          
          const result = {
            statusCode,
            headers: responseHeaders,
            data: parsedData,
            success: statusCode === 200,
            apnsId: responseHeaders['apns-id']
          };
          
          if (statusCode === 200) {
            console.log('🎉 SUCCESS: Notification sent via direct HTTP/2!');
            console.log('- APNs ID:', result.apnsId);
            resolve({
              success: true,
              sent: 1,
              failed: 0,
              apnsId: result.apnsId,
              statusCode,
              response: result
            });
          } else {
            console.log('❌ FAILED: APNs rejected the notification');
            console.log('- Status:', statusCode);
            console.log('- Error:', parsedData);
            resolve({
              success: false,
              sent: 0,
              failed: 1,
              statusCode,
              error: parsedData,
              response: result
            });
          }
        });
        
        request.on('error', (error) => {
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
  
  isConfigured() {
    return this.configured;
  }
  
  disconnect() {
    if (this.session && !this.session.destroyed) {
      this.session.close();
    }
  }
}

export { DirectAPNsClient };