#!/usr/bin/env node

// Direct APNs test script - bypasses our application entirely
import jwt from 'jsonwebtoken';
import http2 from 'http2';

// Load from environment variables
import dotenv from 'dotenv';
dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID;
const KEY_ID = process.env.APNS_KEY_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

async function testDirectAPNs() {
  try {
    console.log('🔍 Testing Direct APNs Connection...');
    console.log('Team ID:', TEAM_ID);
    console.log('Key ID:', KEY_ID);
    console.log('Bundle ID:', BUNDLE_ID);
    console.log('Device Token:', DEVICE_TOKEN.substring(0, 8) + '...');
    
    // Generate JWT token
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: TEAM_ID,
        iat: now
      },
      APNS_PRIVATE_KEY,
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: KEY_ID
        }
      }
    );
    
    console.log('✅ JWT token generated, length:', token.length);
    
    // Decode token to verify
    const decoded = jwt.decode(token, { complete: true });
    console.log('🔍 Decoded token header:', decoded.header);
    console.log('🔍 Decoded token payload:', decoded.payload);
    
    // Connect to APNs sandbox
    const client = http2.connect('https://api.development.push.apple.com:443');
    
    const headers = {
      ':method': 'POST',
      ':path': `/3/device/${DEVICE_TOKEN}`,
      'authorization': `bearer ${token}`,
      'apns-topic': BUNDLE_ID,
      'content-type': 'application/json'
    };
    
    const payload = JSON.stringify({
      aps: {
        alert: {
          title: '🧪 Direct APNs Test',
          body: 'Testing credentials directly'
        },
        sound: 'default'
      }
    });
    
    console.log('📤 Sending to APNs...');
    
    const req = client.request(headers);
    
    req.on('response', (headers) => {
      console.log('📥 Response Status:', headers[':status']);
      console.log('📥 Response Headers:', headers);
    });
    
    req.on('data', (chunk) => {
      console.log('📄 Response Body:', chunk.toString());
    });
    
    req.on('end', () => {
      console.log('✅ Request completed');
      client.close();
    });
    
    req.on('error', (err) => {
      console.error('❌ Request error:', err);
      client.close();
    });
    
    req.write(payload);
    req.end();
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

if (process.argv[2] === '--test') {
  testDirectAPNs();
} else {
  console.log('📋 Direct APNs Test Script');
  console.log('');
  console.log('1. Edit this file and replace the placeholder values:');
  console.log('   - TEAM_ID (from developer.apple.com)');
  console.log('   - KEY_ID (from your APNs key)');  
  console.log('   - BUNDLE_ID (your app bundle ID)');
  console.log('   - APNS_PRIVATE_KEY (your .p8 file content)');
  console.log('');
  console.log('2. Run: node test-apns-direct.js --test');
}