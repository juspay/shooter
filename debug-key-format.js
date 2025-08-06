#!/usr/bin/env node

// Debug the exact format of the APNs private key
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const APNS_KEY = process.env.APNS_KEY;

console.log('🔑 APNs Private Key Format Analysis');
console.log('===================================');

if (!APNS_KEY) {
    console.log('❌ APNS_KEY not found in environment');
    process.exit(1);
}

console.log('\n📋 RAW KEY ANALYSIS:');
console.log('- Total length:', APNS_KEY.length);
console.log('- First 50 chars:', JSON.stringify(APNS_KEY.substring(0, 50)));
console.log('- Last 50 chars:', JSON.stringify(APNS_KEY.substring(APNS_KEY.length - 50)));

console.log('\n📝 LINE-BY-LINE ANALYSIS:');
const lines = APNS_KEY.split('\n');
lines.forEach((line, index) => {
    console.log(`Line ${index + 1}: "${line}" (${line.length} chars)`);
});

console.log('\n🔍 FORMAT VALIDATION:');
console.log('- Has BEGIN marker:', APNS_KEY.includes('-----BEGIN PRIVATE KEY-----'));
console.log('- Has END marker:', APNS_KEY.includes('-----END PRIVATE KEY-----'));
console.log('- Total lines:', lines.length);

// Check for common issues
const expectedLines = 5; // BEGIN + 3 content lines + END
console.log('- Expected lines:', expectedLines);
console.log('- Actual lines:', lines.length);
console.log('- Line count match:', lines.length === expectedLines);

console.log('\n🧪 NODE.JS CRYPTO VALIDATION:');
try {
    // Try to create a key object to validate format
    const keyObject = crypto.createPrivateKey({
        key: APNS_KEY,
        format: 'pem',
        type: 'pkcs8'
    });
    
    console.log('- Crypto createPrivateKey: ✅ SUCCESS');
    console.log('- Key type:', keyObject.asymmetricKeyType);
    console.log('- Key size:', keyObject.asymmetricKeySize);
    
} catch (error) {
    console.log('- Crypto createPrivateKey: ❌ FAILED');
    console.log('- Error:', error.message);
    console.log('- This indicates the key format is invalid or corrupted');
}

console.log('\n💡 EXPECTED FORMAT:');
console.log('-----BEGIN PRIVATE KEY-----');
console.log('MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgXXXXXXXXXXXX...');
console.log('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
console.log('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
console.log('-----END PRIVATE KEY-----');

console.log('\n🚨 IF CRYPTO VALIDATION FAILED:');
console.log('1. The private key is corrupted or invalid');
console.log('2. Re-download the .p8 file from Apple Developer Portal');
console.log('3. Or create a new APNs authentication key');
console.log('4. Ensure no extra characters or line breaks were added during copy/paste');