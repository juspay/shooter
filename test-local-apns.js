#!/usr/bin/env node

// Test APNs credentials locally with minimal HTTP/2 client
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim();
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function testAPNsCredentials() {
    console.log('🧪 Testing APNs Credentials Locally');
    console.log('===================================');
    
    console.log('Using credentials:');
    console.log('- Team ID:', TEAM_ID);
    console.log('- Key ID:', KEY_ID);
    console.log('- Bundle ID:', BUNDLE_ID);
    console.log('- Device Token:', DEVICE_TOKEN?.substring(0, 8) + '...');
    
    try {
        // Generate JWT
        const now = Math.floor(Date.now() / 1000);
        const token = jwt.sign(
            { iss: TEAM_ID, iat: now },
            APNS_PRIVATE_KEY,
            { 
                algorithm: 'ES256',
                header: { alg: 'ES256', kid: KEY_ID },
                noTimestamp: true
            }
        );
        
        console.log('✅ JWT generated successfully');
        console.log('Token length:', token.length);
        
        // Connect to APNs sandbox (development environment)
        const client = http2.connect('https://api.development.push.apple.com:443');
        
        const headers = {
            ':method': 'POST',
            ':path': `/3/device/${DEVICE_TOKEN}`,
            'authorization': `bearer ${token}`,
            'apns-topic': BUNDLE_ID,
            'content-type': 'application/json',
            'apns-push-type': 'alert',
            'apns-priority': '10'
        };
        
        const payload = JSON.stringify({
            aps: {
                alert: {
                    title: '🧪 Local Test',
                    body: 'Testing credentials directly from local environment'
                },
                sound: 'default'
            }
        });
        
        console.log('📤 Sending test notification...');
        
        return new Promise((resolve, reject) => {
            const request = client.request(headers);
            let responseData = '';
            
            const timeout = setTimeout(() => {
                request.destroy();
                client.close();
                reject(new Error('Request timeout after 10 seconds'));
            }, 10000);
            
            request.on('response', (headers) => {
                const statusCode = headers[':status'];
                console.log('📥 Response Status:', statusCode);
                console.log('📥 APNs ID:', headers['apns-id']);
                clearTimeout(timeout);
                
                if (statusCode === 200) {
                    console.log('🎉 SUCCESS! Local credentials work perfectly!');
                    client.close();
                    resolve({ success: true, statusCode });
                } else {
                    console.log('❌ FAILED with status:', statusCode);
                }
            });
            
            request.on('data', (chunk) => {
                responseData += chunk;
            });
            
            request.on('end', () => {
                if (responseData) {
                    try {
                        const parsed = JSON.parse(responseData);
                        console.log('📄 Error Response:', parsed);
                        
                        if (parsed.reason === 'InvalidProviderToken') {
                            console.log('\n💡 DIAGNOSIS: InvalidProviderToken means:');
                            console.log('1. Team ID, Key ID, or Bundle ID mismatch with Apple Developer Portal');
                            console.log('2. APNs private key is revoked or invalid');
                            console.log('3. Wrong environment (sandbox vs production)');
                        }
                        
                    } catch (e) {
                        console.log('📄 Raw Response:', responseData);
                    }
                }
                
                client.close();
                resolve({ success: false, responseData });
            });
            
            request.on('error', (err) => {
                console.error('❌ Request Error:', err.message);
                clearTimeout(timeout);
                client.close();
                reject(err);
            });
            
            request.write(payload);
            request.end();
        });
        
    } catch (error) {
        console.error('💥 Test Failed:', error.message);
        throw error;
    }
}

if (process.argv[2] === '--test') {
    testAPNsCredentials()
        .then(result => {
            console.log('\n✅ Test completed');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Test failed:', error.message);
            process.exit(1);
        });
} else {
    console.log('Usage: node test-local-apns.js --test');
}