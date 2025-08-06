#!/usr/bin/env node

// Compare our JWT with what Apple expects
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

console.log('🔍 JWT Construction vs Apple Requirements');
console.log('=======================================');

console.log('\n📋 OUR VALUES:');
console.log('- TEAM_ID:', JSON.stringify(TEAM_ID));
console.log('- KEY_ID:', JSON.stringify(KEY_ID));

console.log('\n🎯 APPLE REQUIREMENTS CHECK:');

// Check 1: Team ID format
console.log('\n1. Team ID Format:');
console.log('   - Our Team ID:', TEAM_ID);
console.log('   - Length:', TEAM_ID?.length);
console.log('   - Expected: 10 characters, alphanumeric');
console.log('   - Valid format:', /^[A-Z0-9]{10}$/.test(TEAM_ID));

// Check 2: Key ID format  
console.log('\n2. Key ID Format:');
console.log('   - Our Key ID:', KEY_ID);
console.log('   - Length:', KEY_ID?.length);
console.log('   - Expected: 10 characters, alphanumeric');
console.log('   - Valid format:', /^[A-Z0-9]{10}$/.test(KEY_ID));

// Check 3: JWT Construction
console.log('\n3. JWT Token Construction:');
try {
    const now = Math.floor(Date.now() / 1000);
    
    // Test multiple JWT configurations
    const configs = [
        {
            name: 'Current (with iat)',
            payload: { iss: TEAM_ID, iat: now },
            options: { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID }, noTimestamp: true }
        },
        {
            name: 'Without iat',
            payload: { iss: TEAM_ID },
            options: { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID }, noTimestamp: true }
        },
        {
            name: 'With exp (1 hour)',
            payload: { iss: TEAM_ID, iat: now, exp: now + 3600 },
            options: { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID }, noTimestamp: true }
        }
    ];
    
    for (const config of configs) {
        console.log(`\n   ${config.name}:`);
        try {
            const token = jwt.sign(config.payload, APNS_PRIVATE_KEY, config.options);
            const decoded = jwt.decode(token, { complete: true });
            
            console.log('   ✅ Generated successfully');
            console.log('   - Header:', JSON.stringify(decoded.header));
            console.log('   - Payload:', JSON.stringify(decoded.payload));
            console.log('   - Token length:', token.length);
            
        } catch (error) {
            console.log('   ❌ Failed:', error.message);
        }
    }
    
} catch (error) {
    console.log('❌ JWT generation failed:', error.message);
}

console.log('\n4. Key Validation:');
try {
    // Check if we can create a key object
    const crypto = await import('crypto');
    const keyObject = crypto.createPrivateKey({
        key: APNS_PRIVATE_KEY,
        format: 'pem',
        type: 'pkcs8'
    });
    
    console.log('   ✅ Private key is valid');
    console.log('   - Key type:', keyObject.asymmetricKeyType);
    console.log('   - Expected: ec (Elliptic Curve)');
    console.log('   - Match:', keyObject.asymmetricKeyType === 'ec');
    
    // Try to get the public key
    const publicKey = crypto.createPublicKey(keyObject);
    console.log('   ✅ Can derive public key');
    
} catch (error) {
    console.log('   ❌ Key validation failed:', error.message);
}

console.log('\n💡 DEBUGGING QUESTIONS:');
console.log('1. When you tested from Apple Portal, was it the EXACT same:');
console.log('   - Team ID: YM9U73Z2JM');
console.log('   - Key ID: 7G377564AL');
console.log('   - Bundle ID: in.juspay.shooter');
console.log('   - Device Token: ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab');
console.log('   - Environment: Sandbox');
console.log('');
console.log('2. Was the iOS app running when you tested from Apple Portal?');
console.log('3. Did you get the notification on the device when testing from Apple Portal?');

console.log('\n🎯 NEXT STEPS:');
console.log('- If all values match exactly, the issue might be:');
console.log('  1. Device token expired/changed');
console.log('  2. iOS app not running or permissions changed');
console.log('  3. Subtle difference in JWT construction vs Apple Portal');
console.log('  4. Apple-side temporary issue');