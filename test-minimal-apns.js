#!/usr/bin/env node

// Minimal APNs test with maximum debugging
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim();
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function minimalAPNsTest() {
    console.log('🧪 Minimal APNs Test with Maximum Debugging');
    console.log('===========================================');
    
    console.log('\n📋 INPUT VALUES:');
    console.log('- TEAM_ID:', JSON.stringify(TEAM_ID));
    console.log('- KEY_ID:', JSON.stringify(KEY_ID));
    console.log('- BUNDLE_ID:', JSON.stringify(BUNDLE_ID));
    console.log('- DEVICE_TOKEN length:', DEVICE_TOKEN?.length);
    console.log('- APNS_PRIVATE_KEY length:', APNS_PRIVATE_KEY?.length);
    
    // Step 1: Generate JWT
    console.log('\n🔑 STEP 1: JWT Generation');
    let token;
    try {
        const now = Math.floor(Date.now() / 1000);
        const payload = { iss: TEAM_ID, iat: now };
        const header = { alg: 'ES256', kid: KEY_ID };
        
        console.log('- Payload:', JSON.stringify(payload));
        console.log('- Header:', JSON.stringify(header));
        
        token = jwt.sign(payload, APNS_PRIVATE_KEY, {
            algorithm: 'ES256',
            header: header,
            noTimestamp: true
        });
        
        console.log('- JWT generated: ✅ SUCCESS');
        console.log('- Token length:', token.length);
        console.log('- Token preview:', token.substring(0, 50) + '...');
        
        // Verify token can be decoded
        const decoded = jwt.decode(token, { complete: true });
        console.log('- Decoded header:', JSON.stringify(decoded.header));
        console.log('- Decoded payload:', JSON.stringify(decoded.payload));
        
    } catch (error) {
        console.log('- JWT generation: ❌ FAILED');
        console.error('- Error:', error.message);
        return;
    }
    
    // Step 2: Test HTTP/2 connection (without sending notification)
    console.log('\n🔌 STEP 2: HTTP/2 Connection Test');
    try {
        const client = http2.connect('https://api.development.push.apple.com:443', {
            timeout: 5000
        });
        
        console.log('- Creating HTTP/2 session...');
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                client.close();
                reject(new Error('Connection timeout after 5 seconds'));
            }, 5000);
            
            client.on('connect', () => {
                console.log('- HTTP/2 connection: ✅ SUCCESS');
                clearTimeout(timeout);
                client.close();
                resolve();
            });
            
            client.on('error', (error) => {
                console.log('- HTTP/2 connection: ❌ FAILED');
                console.error('- Error:', error.message);
                clearTimeout(timeout);
                client.close();
                reject(error);
            });
        });
        
    } catch (error) {
        console.log('- HTTP/2 connection: ❌ FAILED');
        console.error('- Error:', error.message);
        console.log('\n💡 NETWORK ISSUE DETECTED:');
        console.log('- Check internet connection');
        console.log('- Check firewall/proxy settings');
        console.log('- Try VPN if behind corporate firewall');
        return;
    }
    
    // Step 3: Send actual notification
    console.log('\n📤 STEP 3: Send Test Notification');
    try {
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
        
        console.log('- Request headers:');
        Object.entries(headers).forEach(([key, value]) => {
            if (key === 'authorization') {
                console.log(`  ${key}: Bearer ${value.substring(7, 50)}...`);
            } else {
                console.log(`  ${key}: ${value}`);
            }
        });
        
        const payload = JSON.stringify({
            aps: {
                alert: {
                    title: '🧪 Minimal Test',
                    body: 'Testing with maximum debugging'
                },
                sound: 'default'
            }
        });
        
        console.log('- Payload:', payload);
        
        const result = await new Promise((resolve, reject) => {
            const request = client.request(headers);
            let responseData = '';
            
            const timeout = setTimeout(() => {
                request.destroy();
                client.close();
                reject(new Error('Request timeout after 10 seconds'));
            }, 10000);
            
            request.on('response', (responseHeaders) => {
                const statusCode = responseHeaders[':status'];
                console.log(`- Response Status: ${statusCode}`);
                console.log(`- APNs ID: ${responseHeaders['apns-id']}`);
                console.log('- Response Headers:', responseHeaders);
                clearTimeout(timeout);
            });
            
            request.on('data', (chunk) => {
                responseData += chunk;
            });
            
            request.on('end', () => {
                console.log(`- Response Body: ${responseData}`);
                
                if (responseData) {
                    try {
                        const parsed = JSON.parse(responseData);
                        console.log('- Parsed Response:', parsed);
                        
                        if (parsed.reason === 'InvalidProviderToken') {
                            console.log('\n🚨 INVALIDPROVIDERTOKEN ANALYSIS:');
                            console.log('This means one of:');
                            console.log('1. Team ID mismatch (Apple expects different value)');
                            console.log('2. Key ID mismatch (Key not found in Apple Developer)');
                            console.log('3. Private key content wrong (key was regenerated)');
                            console.log('4. Wrong Apple Developer account');
                            console.log('\nSince all IDs match your screenshot, the issue is likely #3');
                        }
                        
                    } catch (e) {
                        console.log('- Raw response (not JSON):', responseData);
                    }
                }
                
                client.close();
                resolve(responseData);
            });
            
            request.on('error', (err) => {
                console.error(`- Request Error: ${err.message}`);
                clearTimeout(timeout);
                client.close();
                reject(err);
            });
            
            request.write(payload);
            request.end();
        });
        
    } catch (error) {
        console.error('💥 Notification sending failed:', error.message);
    }
    
    console.log('\n✅ Test completed');
}

if (process.argv[2] === '--test') {
    minimalAPNsTest();
} else {
    console.log('Usage: node test-minimal-apns.js --test');
}