import apn from 'apn';
import jwt from 'jsonwebtoken';

export class APNsService {
  constructor() {
    const apnsKey = process.env.APNS_KEY;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;

    if (!apnsKey || !keyId || !teamId) {
      console.warn('APNs configuration incomplete. Some environment variables are missing.');
      this.provider = null;
      return;
    }

    try {
      this.provider = new apn.Provider({
        token: {
          key: apnsKey,
          keyId: keyId,
          teamId: teamId,
        },
        production: process.env.NODE_ENV === 'production'
      });
      console.log('APNs provider initialized successfully');
    } catch (error) {
      console.error('Failed to initialize APNs provider:', error);
      this.provider = null;
    }
  }

  async sendNotification(deviceToken, payload) {
    if (!this.provider) {
      throw new Error('APNs provider not initialized. Check your configuration.');
    }

    if (!deviceToken) {
      throw new Error('Device token is required');
    }

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

    try {
      console.log('Sending notification to device:', deviceToken.substring(0, 8) + '...');
      const result = await this.provider.send(notification, deviceToken);
      console.log('APNs result:', result);
      
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
      console.error('APNs error:', error);
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