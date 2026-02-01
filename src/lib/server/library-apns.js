// APNs service using proven library instead of manual implementation
import apn from '@parse/node-apn';
import { env } from '$env/dynamic/private';
import net from 'net';

// Fix for Node.js 18+ Happy Eyeballs algorithm - default 250ms timeout is too short for APNs
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

export class LibraryAPNsService {
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
        console.log('- Private Key:', this.privateKey ? `SET (${this.privateKey.length} chars)` : 'NOT SET');
        
        if (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey) {
            console.error('Missing required APNs configuration');
            this.configured = false;
            return;
        }
        
        // Create APNs provider using library
        const options = {
            token: {
                key: this.privateKey,
                keyId: this.keyId,
                teamId: this.teamId,
            },
            production: false // Sandbox mode for development iOS app
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
            console.error('❌ Failed to create APNs provider:', error.message);
            this.configured = false;
        }
    }
    
    async sendNotification(deviceToken, payload) {
        console.log('=== LIBRARY APNS NOTIFICATION ===');
        console.log('Device Token:', deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT PROVIDED');
        console.log('Payload:', payload);
        
        if (!this.configured) {
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
                title: payload.title,
                body: payload.body || payload.message
            };
            
            notification.badge = payload.badge || 1;
            notification.sound = payload.sound || 'default';
            notification.topic = this.bundleId;
            
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
            const result = await this.provider.send(notification, deviceToken);
            
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
                    success: false,
                    sent: result.sent?.length || 0,
                    failed: result.failed?.length || 0,
                    error: result.failed[0]?.response?.reason || 'Unknown error',
                    details: result.failed
                };
            }
            
            if (result.sent && result.sent.length > 0) {
                console.log('🎉 SUCCESS: Library sent notification!');
                console.log('- Sent devices:', result.sent.length);
                
                return {
                    success: true,
                    sent: result.sent.length,
                    failed: 0,
                    details: result.sent
                };
            }
            
            console.log('⚠️ Unexpected result format:', result);
            return {
                success: false,
                sent: 0,
                failed: 1,
                error: 'Unexpected result format',
                details: result
            };
            
        } catch (error) {
            console.error('💥 Library APNs Error:', error);
            throw error;
        }
    }
    
    isConfigured() {
        return this.configured;
    }
    
    shutdown() {
        if (this.provider) {
            this.provider.shutdown();
        }
    }
}

export default LibraryAPNsService;