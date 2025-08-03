import apn from 'apn';
import jwt from 'jsonwebtoken';

export class APNsService {
  constructor() {
    console.log('=== APNs SERVICE INITIALIZATION ===');
    
    let apnsKey = process.env.APNS_KEY;
    const apnsKeyBase64 = process.env.APNS_KEY_BASE64;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;
    const nodeEnv = process.env.NODE_ENV;

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
      this.provider = null;
      this.configError = 'Missing required environment variables';
      return;
    }

    // Validate APNs key format
    if (!apnsKey.includes('BEGIN PRIVATE KEY') || !apnsKey.includes('END PRIVATE KEY')) {
      console.error('APNs key format appears invalid - missing PEM headers');
      this.provider = null;
      this.configError = 'Invalid APNs key format';
      return;
    }

    try {
      console.log('Creating APNs provider...');
      
      // Clean the APNs key - ensure proper formatting
      let cleanedKey = apnsKey.trim();
      
      // If the key doesn't have proper line breaks, add them
      if (!cleanedKey.includes('\n')) {
        console.log('Key appears to be on single line, fixing format...');
        cleanedKey = cleanedKey.replace(/-----BEGIN PRIVATE KEY-----(.+)-----END PRIVATE KEY-----/,
          '-----BEGIN PRIVATE KEY-----\n$1\n-----END PRIVATE KEY-----');
      }
      
      console.log('Using cleaned key format');
      
      this.provider = new apn.Provider({
        token: {
          key: cleanedKey,
          keyId: keyId,
          teamId: teamId,
        },
        production: nodeEnv === 'production'
      });
      console.log('✅ APNs provider initialized successfully');
      this.configError = null;
    } catch (error) {
      console.error('❌ Failed to initialize APNs provider:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      this.provider = null;
      this.configError = error.message;
    }
  }

  async sendNotification(deviceToken, payload) {
    console.log('=== SENDING NOTIFICATION ===');
    console.log('Function arguments:');
    console.log('- deviceToken type:', typeof deviceToken);
    console.log('- deviceToken value:', deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED');
    console.log('- payload type:', typeof payload);
    console.log('- payload value:', payload);
    console.log('- payload is null:', payload === null);
    console.log('- payload is undefined:', payload === undefined);
    
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

    if (!this.provider) {
      const error = `APNs provider not initialized. ${this.configError || 'Check your configuration.'}`;
      console.error(error);
      throw new Error(error);
    }

    if (!deviceToken) {
      console.error('Device token is required');
      throw new Error('Device token is required');
    }

    // Validate device token format
    if (!/^[a-f0-9]{64}$/i.test(deviceToken)) {
      console.error('Invalid device token format. Expected 64 hex characters.');
      throw new Error('Invalid device token format');
    }

    console.log('Creating notification object...');
    const notification = new apn.Notification();
    
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.badge = payload.badge || 1;
    notification.sound = payload.sound || 'default';
    notification.alert = {
      title: payload.title || 'Claude Code Notification', 
      body: payload.body || 'Hello from Claude!'
    };
    notification.payload = payload.data || {};
    notification.topic = process.env.APNS_BUNDLE_ID;

    console.log('Notification details:');
    console.log('- Topic (Bundle ID):', notification.topic);
    console.log('- Title:', notification.alert.title);
    console.log('- Body:', notification.alert.body);
    console.log('- Badge:', notification.badge);
    console.log('- Sound:', notification.sound);
    console.log('- Expiry:', new Date(notification.expiry * 1000).toISOString());

    try {
      console.log('🚀 Sending push notification...');
      
      // Debug the notification object before sending
      console.log('Notification object details:');
      console.log('- notification.alert:', JSON.stringify(notification.alert));
      console.log('- notification.payload:', JSON.stringify(notification.payload));
      console.log('- notification as JSON:', JSON.stringify({
        alert: notification.alert,
        badge: notification.badge,
        sound: notification.sound,
        payload: notification.payload,
        topic: notification.topic,
        expiry: notification.expiry
      }));
      
      console.log('About to call provider.send...');
      const result = await this.provider.send(notification, deviceToken);
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
      
      return {
        success: result.sent.length > 0,
        sent: result.sent.length,
        failed: result.failed.length,
        errors: result.failed.map(f => ({
          device: f.device,
          status: f.status,
          response: f.response
        }))
      };
    } catch (error) {
      console.error('💥 APNs sending error:', error);
      console.error('Error message:', error.message);
      console.error('Error type:', error.constructor.name);
      console.error('Error stack:', error.stack);
      
      // Check if it's a JSON parsing error
      if (error.message && error.message.includes('JSON')) {
        console.error('🔍 JSON parsing error detected!');
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          code: error.code
        });
        
        // Try to identify what's being parsed
        if (error.message.includes('position')) {
          console.error('Error at specific position in JSON string');
        }
      }
      
      throw error;
    }
  }

  isConfigured() {
    return !!this.provider;
  }

  shutdown() {
    if (this.provider) {
      this.provider.shutdown();
    }
  }
}