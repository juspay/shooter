#!/usr/bin/env node

// Test with completely fresh JWT and minimal request
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim();
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function testFreshNotification() {
    console.log('🧪 Fresh Notification Test');
    console.log('==========================');
    
    try {
        // Generate completely fresh JWT with current timestamp
        const now = Math.floor(Date.now() / 1000);
        console.log('- Current timestamp:', now);
        console.log('- Current time:', new Date().toISOString());
        
        const token = jwt.sign(
            { 
                iss: TEAM_ID, 
                iat: now
            },
            APNS_PRIVATE_KEY,
            { 
                algorithm: 'ES256',
                header: { alg: 'ES256', kid: KEY_ID },
                noTimestamp: true
            }
        );
        
        console.log('- JWT generated with fresh timestamp ✅');
        console.log('- Token length:', token.length);
        
        // Connect to APNs Sandbox
        const client = http2.connect('https://api.development.push.apple.com:443');
        
        const headers = {
            ':method': 'POST',
            ':path': `/3/device/${DEVICE_TOKEN}`,
            'authorization': `bearer ${token}`,
            'apns-topic': BUNDLE_ID,
            'content-type': 'application/json'
        };
        
        // Minimal payload
        const payload = JSON.stringify({
            aps: {
                alert: "Fresh test notification",
                sound: "default"
            }
        });
        
        console.log('\n📤 Sending fresh request...');
        console.log('- Environment: SANDBOX');
        console.log('- Topic:', BUNDLE_ID);
        console.log('- Device token (first 8):', DEVICE_TOKEN.substring(0, 8));
        
        const result = await new Promise((resolve, reject) => {
            const request = client.request(headers);
            let responseData = '';
            
            const timeout = setTimeout(() => {
                request.destroy();
                client.close();
                reject(new Error('Request timeout'));
            }, 15000);
            
            request.on('response', (responseHeaders) => {
                const statusCode = responseHeaders[':status'];
                console.log('\n📥 APNs Response:');
                console.log('- Status:', statusCode);
                console.log('- APNs ID:', responseHeaders['apns-id']);
                clearTimeout(timeout);
                
                if (statusCode === 200) {
                    console.log('🎉 SUCCESS! Notification sent!');
                    client.close();
                    resolve({ success: true, statusCode });
                    return;
                }
            });
            
            request.on('data', (chunk) => {
                responseData += chunk;
            });
            
            request.on('end', () => {
                console.log('- Response body:', responseData);
                
                if (responseData) {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (parsed.reason === 'InvalidProviderToken') {
                            console.log('\n💡 STILL InvalidProviderToken - this suggests:');
                            console.log('1. Something fundamentally wrong with our request format');
                            console.log('2. APNs doesn\'t recognize our Key+Team+Bundle combination');
                            console.log('3. Network/proxy issue intercepting our requests');
                        }
                    } catch (e) {
                        console.log('- Raw response (not JSON)');
                    }
                }
                
                client.close();
                resolve({ success: false, statusCode: 403, responseData });
            });
            
            request.on('error', (err) => {
                console.error('- Request error:', err.message);
                clearTimeout(timeout);
                client.close();
                reject(err);
            });
            
            request.write(payload);
            request.end();
        });
        
        return result;
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        throw error;
    }
}

if (process.argv[2] === '--test') {
    testFreshNotification()
        .then((result) => {
            if (result.success) {
                console.log('\n🎉 BREAKTHROUGH! The issue was timing/JWT freshness');
            } else {
                console.log('\n🤔 Still failing with fresh JWT - deeper issue exists');
                console.log('Next: Check if Bundle ID is actually associated with this Team/Key');
            }
        })
        .catch((error) => {
            console.error('\n💥 Test completely failed:', error.message);
        });
} else {
    console.log('Usage: node test-fresh-notification.js --test');
}