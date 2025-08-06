#!/usr/bin/env node

// Test APNs using standard HTTPS instead of HTTP/2
import https from 'https';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim();
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function testHTTPSAPNs() {
    console.log('🧪 Testing APNs with HTTPS (HTTP/1.1) instead of HTTP/2');
    console.log('====================================================');
    
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
        
        const payload = JSON.stringify({
            aps: {
                alert: {
                    title: '🧪 HTTPS Test',
                    body: 'Testing with HTTPS instead of HTTP/2'
                },
                sound: 'default'
            }
        });
        
        const options = {
            hostname: 'api.development.push.apple.com',
            port: 443,
            path: `/3/device/${DEVICE_TOKEN}`,
            method: 'POST',
            headers: {
                'Authorization': `bearer ${token}`,
                'apns-topic': BUNDLE_ID,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'apns-push-type': 'alert',
                'apns-priority': '10'
            },
            timeout: 10000
        };
        
        console.log('📤 Sending HTTPS request...');
        console.log('- Host:', options.hostname);
        console.log('- Path:', options.path);
        console.log('- Topic:', BUNDLE_ID);
        
        const result = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                console.log('📥 Status Code:', res.statusCode);
                console.log('📥 Headers:', res.headers);
                
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    console.log('📄 Response Body:', responseData);
                    
                    if (res.statusCode === 200) {
                        console.log('🎉 SUCCESS! HTTPS method works!');
                        resolve({ success: true, statusCode: res.statusCode });
                    } else {
                        if (responseData) {
                            try {
                                const parsed = JSON.parse(responseData);
                                console.log('📄 Parsed Error:', parsed);
                                
                                if (parsed.reason === 'InvalidProviderToken') {
                                    console.log('\n💡 Still getting InvalidProviderToken with HTTPS');
                                    console.log('This confirms the issue is with credentials, not HTTP/2');
                                }
                            } catch (e) {
                                console.log('📄 Raw response (not JSON)');
                            }
                        }
                        resolve({ success: false, statusCode: res.statusCode, responseData });
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('❌ HTTPS Request Error:', error.message);
                reject(error);
            });
            
            req.on('timeout', () => {
                console.error('❌ HTTPS Request Timeout');
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.write(payload);
            req.end();
        });
        
        return result;
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        throw error;
    }
}

if (process.argv[2] === '--test') {
    testHTTPSAPNs()
        .then((result) => {
            if (result.success) {
                console.log('\n🎉 HTTPS APNs test PASSED');
                console.log('Solution: Use HTTPS instead of HTTP/2 for better compatibility');
            } else {
                console.log('\n🔍 HTTPS APNs test completed with error');
                console.log('But this shows the network connectivity is working');
            }
        })
        .catch((error) => {
            console.error('\n💥 HTTPS APNs test FAILED');
            console.error('Error:', error.message);
        });
} else {
    console.log('Usage: node test-https-apns.js --test');
}