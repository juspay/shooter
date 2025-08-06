#!/usr/bin/env node

// Debug script to analyze JWT token construction
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const TEAM_ID = process.env.APNS_TEAM_ID;
const KEY_ID = process.env.APNS_KEY_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const APNS_PRIVATE_KEY = process.env.APNS_KEY;

console.log('🔍 JWT CONSTRUCTION ANALYSIS');
console.log('=====================================');

console.log('\n📋 RAW VALUES FROM ENVIRONMENT:');
console.log('- TEAM_ID:', JSON.stringify(TEAM_ID));
console.log('- KEY_ID:', JSON.stringify(KEY_ID));
console.log('- BUNDLE_ID:', JSON.stringify(BUNDLE_ID));
console.log('- APNS_KEY length:', APNS_PRIVATE_KEY ? APNS_PRIVATE_KEY.length : 'NOT SET');

console.log('\n🔧 TRIMMED VALUES (what we use in JWT):');
const trimmedTeamId = TEAM_ID?.trim();
const trimmedKeyId = KEY_ID?.trim();
const trimmedBundleId = BUNDLE_ID?.trim();

console.log('- TEAM_ID trimmed:', JSON.stringify(trimmedTeamId));
console.log('- KEY_ID trimmed:', JSON.stringify(trimmedKeyId));
console.log('- BUNDLE_ID trimmed:', JSON.stringify(trimmedBundleId));

console.log('\n⚠️  WHITESPACE CHECK:');
console.log('- TEAM_ID has leading/trailing spaces:', TEAM_ID !== trimmedTeamId);
console.log('- KEY_ID has leading/trailing spaces:', KEY_ID !== trimmedKeyId);
console.log('- BUNDLE_ID has leading/trailing spaces:', BUNDLE_ID !== trimmedBundleId);

if (APNS_PRIVATE_KEY) {
    console.log('\n🔑 PRIVATE KEY ANALYSIS:');
    const keyLines = APNS_PRIVATE_KEY.split('\n');
    console.log('- Key starts with:', keyLines[0]);
    console.log('- Key ends with:', keyLines[keyLines.length - 1]);
    console.log('- Total lines:', keyLines.length);
    console.log('- Has proper BEGIN/END markers:', 
        APNS_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----') && 
        APNS_PRIVATE_KEY.includes('-----END PRIVATE KEY-----'));
}

try {
    console.log('\n🎯 JWT TOKEN CONSTRUCTION:');
    const now = Math.floor(Date.now() / 1000);
    
    const header = {
        alg: 'ES256',
        kid: trimmedKeyId
    };
    
    const payload = {
        iss: trimmedTeamId,
        iat: now
    };
    
    console.log('- Header:', JSON.stringify(header, null, 2));
    console.log('- Payload:', JSON.stringify(payload, null, 2));
    
    const token = jwt.sign(payload, APNS_PRIVATE_KEY, {
        algorithm: 'ES256',
        header: header,
        noTimestamp: true
    });
    
    console.log('- Token generated successfully ✅');
    console.log('- Token length:', token.length);
    console.log('- Token preview:', token.substring(0, 50) + '...');
    
    // Decode to verify
    const decoded = jwt.decode(token, { complete: true });
    console.log('\n📄 DECODED TOKEN VERIFICATION:');
    console.log('- Decoded header:', JSON.stringify(decoded.header, null, 2));
    console.log('- Decoded payload:', JSON.stringify(decoded.payload, null, 2));
    
} catch (error) {
    console.error('\n❌ JWT TOKEN GENERATION FAILED:', error.message);
}

console.log('\n🚨 ACTION ITEMS:');
console.log('1. Verify these exact values in Apple Developer Portal:');
console.log('   - Go to developer.apple.com/account/');
console.log('   - Check Team ID in upper right corner');
console.log('   - Go to Certificates, Identifiers & Profiles → Keys');
console.log('   - Find your APNs key and verify Key ID');
console.log('   - Verify Bundle ID matches your iOS app');
console.log('2. Ensure no trailing spaces or newlines in Vercel environment variables');
console.log('3. Confirm the private key is exactly as downloaded from Apple (no modifications)');