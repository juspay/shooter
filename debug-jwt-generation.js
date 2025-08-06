#!/usr/bin/env node

// Debug our JWT generation against APNs requirements
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

console.log('🔧 JWT GENERATION DEBUG');
console.log('======================');

console.log('\n1. Raw Key Analysis:');
console.log('- Key starts:', APNS_PRIVATE_KEY.substring(0, 30));
console.log('- Key ends:', APNS_PRIVATE_KEY.substring(APNS_PRIVATE_KEY.length - 30));
console.log('- Key total length:', APNS_PRIVATE_KEY.length);

// Test different JWT generation approaches
const testCases = [
    {
        name: 'Current approach (with iat)',
        payload: { iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) },
        options: { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID }, noTimestamp: true }
    },
    {
        name: 'Without explicit iat',
        payload: { iss: TEAM_ID },
        options: { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID } }
    },
    {
        name: 'With explicit header typ',
        payload: { iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) },
        options: { algorithm: 'ES256', header: { alg: 'ES256', typ: 'JWT', kid: KEY_ID }, noTimestamp: true }
    },
    {
        name: 'Minimal payload',
        payload: { iss: TEAM_ID },
        options: { algorithm: 'ES256', keyid: KEY_ID }
    }
];

console.log('\n2. JWT Generation Tests:');
for (const testCase of testCases) {
    console.log(`\n   ${testCase.name}:`);
    try {
        const token = jwt.sign(testCase.payload, APNS_PRIVATE_KEY, testCase.options);
        const decoded = jwt.decode(token, { complete: true });
        
        console.log('   ✅ Generated successfully');
        console.log('   - Token parts:', token.split('.').length);
        console.log('   - Header:', JSON.stringify(decoded.header));
        console.log('   - Payload:', JSON.stringify(decoded.payload));
        console.log('   - Token length:', token.length);
        
        // Test if we can verify it
        try {
            const verified = jwt.verify(token, APNS_PRIVATE_KEY, { algorithms: ['ES256'] });
            console.log('   - Verification: ✅ PASS');
        } catch (verifyError) {
            console.log('   - Verification: ❌ FAIL -', verifyError.message);
        }
        
    } catch (error) {
        console.log('   ❌ Failed:', error.message);
    }
}

console.log('\n3. Manual JWT Construction Test:');
try {
    // Try manual JWT construction like APNs examples
    const header = {
        alg: "ES256",
        kid: KEY_ID
    };
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: TEAM_ID,
        iat: now
    };
    
    console.log('- Manual header:', JSON.stringify(header));
    console.log('- Manual payload:', JSON.stringify(payload));
    
    const token = jwt.sign(payload, APNS_PRIVATE_KEY, {
        algorithm: 'ES256',
        header: header,
        noTimestamp: true
    });
    
    console.log('- Manual generation: ✅ SUCCESS');
    console.log('- Token preview:', token.substring(0, 100) + '...');
    
} catch (error) {
    console.log('- Manual generation: ❌ FAILED -', error.message);
}

console.log('\n4. Key Format Validation:');
try {
    const keyObject = crypto.createPrivateKey(APNS_PRIVATE_KEY);
    console.log('- Key type:', keyObject.asymmetricKeyType);
    console.log('- Key size:', keyObject.asymmetricKeySize);
    console.log('- Key format: ✅ VALID');
    
    // Try to get public key
    const publicKey = crypto.createPublicKey(keyObject);
    console.log('- Public key derivation: ✅ SUCCESS');
    
} catch (error) {
    console.log('- Key format: ❌ INVALID -', error.message);
}

console.log('\n💡 DEBUGGING HINTS:');
console.log('- Check if timestamp is too far off (APNs rejects old/future tokens)');
console.log('- Verify key encoding (should be PKCS#8 format)');
console.log('- Ensure no extra whitespace in credentials');
console.log('- Try regenerating JWT with fresh timestamp');