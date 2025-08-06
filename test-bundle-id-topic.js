#!/usr/bin/env node

// Test if bundle ID topic is the issue with team-scoped key
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim();
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function testWithDifferentTopics() {
    console.log('🧪 Testing Bundle ID Topic Configuration');
    console.log('=====================================');
    
    const testConfigs = [
        {
            name: 'Original Bundle ID',
            topic: BUNDLE_ID,
            description: 'Using our configured bundle ID'
        },
        {
            name: 'No apns-topic header',
            topic: null,
            description: 'Testing without topic header (team-scoped should allow this)'
        }
    ];
    
    for (const config of testConfigs) {
        console.log(`\n🎯 Testing: ${config.name}`);
        console.log(`   Description: ${config.description}`);
        console.log(`   Topic: ${config.topic || 'NONE'}`);
        
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
            
            // Connect to APNs sandbox
            const client = http2.connect('https://api.development.push.apple.com:443');
            
            const headers = {
                ':method': 'POST',
                ':path': `/3/device/${DEVICE_TOKEN}`,
                'authorization': `bearer ${token}`,
                'content-type': 'application/json',
                'apns-push-type': 'alert',
                'apns-priority': '10'
            };
            
            // Only add topic header if specified
            if (config.topic) {
                headers['apns-topic'] = config.topic;
            }
            
            const payload = JSON.stringify({
                aps: {
                    alert: {
                        title: `🧪 ${config.name}`,
                        body: `Testing: ${config.description}`
                    },
                    sound: 'default'
                }
            });
            
            const result = await new Promise((resolve, reject) => {
                const request = client.request(headers);
                let responseData = '';
                
                const timeout = setTimeout(() => {
                    request.destroy();
                    client.close();
                    reject(new Error('Request timeout'));
                }, 8000);
                
                request.on('response', (responseHeaders) => {
                    const statusCode = responseHeaders[':status'];
                    console.log(`   📥 Status: ${statusCode}`);
                    console.log(`   📥 APNs ID: ${responseHeaders['apns-id']}`);
                    clearTimeout(timeout);
                    
                    if (statusCode === 200) {
                        console.log(`   🎉 SUCCESS! This configuration works!`);
                        client.close();
                        resolve({ success: true, statusCode });
                        return;
                    }
                });
                
                request.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                request.on('end', () => {
                    if (responseData) {
                        try {
                            const parsed = JSON.parse(responseData);
                            console.log(`   📄 Error: ${parsed.reason}`);
                            
                            if (parsed.reason === 'BadTopic') {
                                console.log(`   💡 BadTopic = Bundle ID "${config.topic}" not valid for this key`);
                            } else if (parsed.reason === 'InvalidProviderToken') {
                                console.log(`   💡 InvalidProviderToken = Authentication issue (not topic-related)`);
                            }
                            
                        } catch (e) {
                            console.log(`   📄 Raw Response: ${responseData}`);
                        }
                    }
                    
                    client.close();
                    resolve({ success: false, responseData });
                });
                
                request.on('error', (err) => {
                    console.error(`   ❌ Request Error: ${err.message}`);
                    clearTimeout(timeout);
                    client.close();
                    reject(err);
                });
                
                request.write(payload);
                request.end();
            });
            
        } catch (error) {
            console.error(`   💥 Test Failed: ${error.message}`);
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

if (process.argv[2] === '--test') {
    testWithDifferentTopics()
        .then(() => {
            console.log('\n✅ All tests completed');
            console.log('\n💡 ANALYSIS:');
            console.log('- If both fail with InvalidProviderToken → Key/credential issue');
            console.log('- If one succeeds → Topic/bundle ID configuration issue');
            console.log('- If "No topic" works → Bundle ID not registered for this key');
        })
        .catch(error => {
            console.error('\n💥 Test suite failed:', error.message);
        });
} else {
    console.log('Usage: node test-bundle-id-topic.js --test');
}