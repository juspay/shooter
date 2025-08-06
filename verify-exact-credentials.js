#!/usr/bin/env node

// Verify exact credential matching based on research findings
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('🔍 EXACT CREDENTIAL VERIFICATION');
console.log('================================');

console.log('\n📋 CURRENT CONFIGURATION:');
console.log('- APNS_KEY_ID:', JSON.stringify(process.env.APNS_KEY_ID));
console.log('- APNS_TEAM_ID:', JSON.stringify(process.env.APNS_TEAM_ID));
console.log('- APNS_BUNDLE_ID:', JSON.stringify(process.env.APNS_BUNDLE_ID));
console.log('- APNS_KEY length:', process.env.APNS_KEY?.length);

console.log('\n🎯 EXPECTED VALUES (from your screenshots):');
console.log('- Expected Key ID: "S85L2ZG5R8" (Juspay Admin)');
console.log('- Expected Team ID: "YM9U73Z2JM"');
console.log('- Expected Bundle ID: "in.juspay.shooter"');

console.log('\n🔍 EXACT MATCH VERIFICATION:');
const keyIdMatch = process.env.APNS_KEY_ID === 'S85L2ZG5R8';
const teamIdMatch = process.env.APNS_TEAM_ID === 'YM9U73Z2JM';
const bundleIdMatch = process.env.APNS_BUNDLE_ID === 'in.juspay.shooter';

console.log('- Key ID match:', keyIdMatch, keyIdMatch ? '✅' : '❌');
console.log('- Team ID match:', teamIdMatch, teamIdMatch ? '✅' : '❌');
console.log('- Bundle ID match:', bundleIdMatch, bundleIdMatch ? '✅' : '❌');

if (!keyIdMatch) {
    console.log('  KEY ID MISMATCH:');
    console.log('  - Current:', JSON.stringify(process.env.APNS_KEY_ID));
    console.log('  - Expected:', JSON.stringify('S85L2ZG5R8'));
}

if (!teamIdMatch) {
    console.log('  TEAM ID MISMATCH:');
    console.log('  - Current:', JSON.stringify(process.env.APNS_TEAM_ID));
    console.log('  - Expected:', JSON.stringify('YM9U73Z2JM'));
}

if (!bundleIdMatch) {
    console.log('  BUNDLE ID MISMATCH:');
    console.log('  - Current:', JSON.stringify(process.env.APNS_BUNDLE_ID));
    console.log('  - Expected:', JSON.stringify('in.juspay.shooter'));
}

console.log('\n🚨 CRITICAL CHECKS:');
console.log('1. Key Status in Apple Developer Portal:');
console.log('   - Go to: developer.apple.com/account/resources/authkeys/list');
console.log('   - Find Key ID: S85L2ZG5R8');
console.log('   - Verify status is "Active" (not "Revoked")');
console.log('');
console.log('2. Key File Verification:');
console.log('   - Downloaded file should be: APNSAuthKey_S85L2ZG5R8.p8');
console.log('   - File should be recent (not cached from earlier download)');
console.log('');
console.log('3. App ID Double-Check:');
console.log('   - Bundle ID "in.juspay.shooter" must be registered');
console.log('   - Push Notifications must be enabled for this exact Bundle ID');

const allMatch = keyIdMatch && teamIdMatch && bundleIdMatch;
console.log('\n🎯 OVERALL STATUS:', allMatch ? '✅ ALL CREDENTIALS MATCH' : '❌ MISMATCHES FOUND');

if (allMatch) {
    console.log('\nSince all credentials match, the issue is likely:');
    console.log('1. Key S85L2ZG5R8 is REVOKED in Apple Developer Portal');
    console.log('2. Bundle ID "in.juspay.shooter" is not properly registered');
    console.log('3. Apple-side temporary issue');
} else {
    console.log('\nFix the credential mismatches above first!');
}