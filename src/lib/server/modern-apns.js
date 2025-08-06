// Modern APNs implementation using native Node.js HTTP/2
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { env } from '$env/dynamic/private';

export class ModernAPNsService {
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
    
    console.log(`✅ Modern APNs service configured for ${this.isProduction ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`- APNs Host: ${this.apnsHost}`);
    
    this.configured = true;
    this.configError = null;
  }
  
  generateJWT() {
    console.log('🔑 Generating JWT token...');
    
    try {
      const header = {
        alg: 'ES256',
        kid: this.keyId
      };
      
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: this.teamId,
        iat: now,
        exp: now + 3600  // Expires in 1 hour (max 1 hour for APNs)
      };
      
      console.log('- Header:', header);
      console.log('- Payload:', payload);
      
      const token = jwt.sign(payload, this.apnsKey, {
        algorithm: 'ES256',
        header: header,
        noTimestamp: true  // We're providing iat manually
      });
      
      console.log('✅ JWT token generated successfully');
      console.log('- Token length:', token.length);
      console.log('- Token preview:', token.substring(0, 50) + '...');
      
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
        } catch (e) {
          console.log('- Could not decode JWT parts for debugging');
        }
      }
      
      return token;
      
    } catch (error) {
      console.error('❌ JWT generation failed:', error);
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }
  
  async sendNotification(deviceToken, payload) {
    console.log('=== MODERN APNS NOTIFICATION SENDING ===');
    console.log('- Device Token:', deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED');
    console.log('- Payload:', payload);
    console.log('- APNs Host:', this.apnsHost);
    
    if (!this.configured) {
      throw new Error(`APNs service not configured: ${this.configError}`);
    }
    
    if (!deviceToken) {
      throw new Error('Device token is required');
    }
    
    if (!payload || !payload.title || !payload.body) {
      throw new Error('Payload with title and body is required');
    }
    
    try {
      // Generate JWT token
      const authToken = this.generateJWT();
      
      // Create APNs payload
      const apnsPayload = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body
          },
          badge: payload.badge || 1,
          sound: payload.sound || 'default'
        },
        ...payload.data
      };
      
      const payloadJSON = JSON.stringify(apnsPayload);
      console.log('📱 APNs Payload:', payloadJSON);
      
      // HTTP/2 request
      const client = http2.connect(`https://${this.apnsHost}`);
      
      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${authToken}`,
        'apns-topic': this.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json'
      };
      
      console.log('📤 Sending HTTP/2 request...');
      console.log('- Headers:', {
        path: headers[':path'],
        topic: headers['apns-topic'],
        pushType: headers['apns-push-type'],
        priority: headers['apns-priority']
      });
      
      return new Promise((resolve, reject) => {
        const req = client.request(headers);
        
        let responseData = '';
        
        req.on('response', (headers) => {
          const status = headers[':status'];
          console.log('📥 APNs Response Status:', status);
          console.log('- Response Headers:', headers);
          
          if (status === 200) {
            console.log('🎉 SUCCESS: Notification sent successfully!');
            resolve({
              success: true,
              sent: 1,
              failed: 0,
              status: status,
              headers: headers
            });
          } else {
            console.log('❌ FAILED: APNs rejected the notification');
            
            // Wait for response data to get the error details
            setTimeout(() => {
              let errorData = null;
              if (responseData) {
                try {
                  errorData = JSON.parse(responseData);
                } catch (e) {
                  errorData = responseData;
                }
              }
              
              resolve({
                success: false,
                sent: 0,
                failed: 1,
                status: status,
                headers: headers,
                error: `APNs returned status ${status}`,
                errorData: errorData,
                responseBody: responseData
              });
            }, 100);
          }
        });
        
        req.on('data', (chunk) => {
          responseData += chunk;
        });
        
        req.on('end', () => {
          if (responseData) {
            console.log('📄 Response Data:', responseData);
            try {
              const errorData = JSON.parse(responseData);
              console.log('📄 Parsed Error:', errorData);
            } catch (e) {
              console.log('📄 Raw Response:', responseData);
            }
          }
          client.close();
        });
        
        req.on('error', (error) => {
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
  
  isConfigured() {
    return this.configured;
  }
}