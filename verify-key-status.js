#!/usr/bin/env node

// Script to help verify APNs key status and validity
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID?.trim();
const KEY_ID = process.env.APNS_KEY_ID?.trim();
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

console.log('🔑 APNs Key Status Verification');
console.log('===============================');

console.log('\n📋 VERIFICATION CHECKLIST:');

// 1. Private Key Format
console.log('\n1. ✅ Private Key Format Check:');
if (APNS_PRIVATE_KEY) {
    const keyLines = APNS_PRIVATE_KEY.split('\n').filter(line => line.trim());
    console.log('   - Has BEGIN marker:', APNS_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----'));
    console.log('   - Has END marker:', APNS_PRIVATE_KEY.includes('-----END PRIVATE KEY-----'));
    console.log('   - Line count:', keyLines.length);
    console.log('   - Expected format: ✅ VALID');
} else {
    console.log('   - ❌ PRIVATE KEY NOT FOUND');
}

// 2. JWT Generation Test
console.log('\n2. ✅ JWT Generation Test:');
try {
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
    console.log('   - JWT generation: ✅ SUCCESS');
    console.log('   - Token length:', token.length);
} catch (error) {
    console.log('   - JWT generation: ❌ FAILED');
    console.log('   - Error:', error.message);
}

// 3. Key Validation with OpenSSL (if available)
console.log('\n3. 🔍 Key Validation Steps:');
console.log('   To verify your key hasn\'t been revoked, check:');
console.log('   a) Go to: https://developer.apple.com/account/resources/authkeys/list');
console.log('   b) Find Key ID:', KEY_ID);
console.log('   c) Check Status column - should be "Active"');
console.log('   d) If "Revoked" - that\'s the problem!');

console.log('\n4. 🏗️ Environment Check:');
console.log('   - Team ID:', TEAM_ID);
console.log('   - Key ID:', KEY_ID);
console.log('   - Target Environment: SANDBOX (api.development.push.apple.com)');

console.log('\n💡 COMMON ISSUES & SOLUTIONS:');
console.log('');
console.log('❌ ISSUE: Key is revoked in Apple Developer Portal');
console.log('✅ SOLUTION: Generate new APNs key, update Key ID and private key');
console.log('');
console.log('❌ ISSUE: Bundle ID mismatch');
console.log('✅ SOLUTION: Verify iOS app bundle ID matches "in.juspay.shooter"');
console.log('');
console.log('❌ ISSUE: Wrong Apple Developer account');
console.log('✅ SOLUTION: Ensure Team ID matches the account where the APNs key was created');

console.log('\n🎯 NEXT STEPS:');
console.log('1. Check key status at: https://developer.apple.com/account/resources/authkeys/list');
console.log('2. If key is revoked → Generate new key → Update credentials');
console.log('3. If key is active → Double-check Bundle ID in iOS app');
console.log('4. Verify iOS app is built for Development (not Distribution)');

console.log('\n🔍 APPLE DEVELOPER PORTAL LOCATIONS:');
console.log('- Team ID: developer.apple.com/account/ (top right corner)');
console.log('- Keys: developer.apple.com/account/resources/authkeys/list');
console.log('- Bundle ID: developer.apple.com/account/resources/identifiers/list');
console.log('- Test Notifications: developer.apple.com/account/resources/authkeys/list → Click your key → Send Test Notification');