#!/usr/bin/env node

// Test if environment variables are loading correctly
console.log('🔍 Environment Variable Loading Test');
console.log('===================================');

console.log('\n1. Before dotenv.config():');
console.log('- APNS_KEY_ID:', process.env.APNS_KEY_ID || 'UNDEFINED');
console.log('- APNS_TEAM_ID:', process.env.APNS_TEAM_ID || 'UNDEFINED');
console.log('- APNS_BUNDLE_ID:', process.env.APNS_BUNDLE_ID || 'UNDEFINED');
console.log('- APNS_KEY length:', process.env.APNS_KEY?.length || 'UNDEFINED');
console.log('- DEVICE_TOKEN length:', process.env.DEVICE_TOKEN?.length || 'UNDEFINED');

// Load dotenv
import dotenv from 'dotenv';
const result = dotenv.config();

console.log('\n2. dotenv.config() result:');
console.log('- Success:', !result.error);
if (result.error) {
    console.log('- Error:', result.error.message);
} else {
    console.log('- Loaded from:', result.parsed ? 'parsed' : 'already in env');
}

console.log('\n3. After dotenv.config():');
console.log('- APNS_KEY_ID:', process.env.APNS_KEY_ID || 'UNDEFINED');
console.log('- APNS_TEAM_ID:', process.env.APNS_TEAM_ID || 'UNDEFINED');
console.log('- APNS_BUNDLE_ID:', process.env.APNS_BUNDLE_ID || 'UNDEFINED');
console.log('- APNS_KEY length:', process.env.APNS_KEY?.length || 'UNDEFINED');
console.log('- DEVICE_TOKEN length:', process.env.DEVICE_TOKEN?.length || 'UNDEFINED');

console.log('\n4. Raw values (first 50 chars):');
console.log('- APNS_KEY_ID:', JSON.stringify(process.env.APNS_KEY_ID?.substring(0, 50)));
console.log('- APNS_TEAM_ID:', JSON.stringify(process.env.APNS_TEAM_ID?.substring(0, 50)));
console.log('- APNS_KEY start:', JSON.stringify(process.env.APNS_KEY?.substring(0, 50)));

console.log('\n5. Check for issues:');
const issues = [];

if (!process.env.APNS_KEY_ID) issues.push('APNS_KEY_ID missing');
if (!process.env.APNS_TEAM_ID) issues.push('APNS_TEAM_ID missing');
if (!process.env.APNS_BUNDLE_ID) issues.push('APNS_BUNDLE_ID missing');
if (!process.env.APNS_KEY) issues.push('APNS_KEY missing');
if (!process.env.DEVICE_TOKEN) issues.push('DEVICE_TOKEN missing');

if (issues.length > 0) {
    console.log('❌ Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
} else {
    console.log('✅ All environment variables loaded successfully');
}

console.log('\n6. .env file check:');
try {
    const fs = await import('fs');
    const envContent = fs.readFileSync('.env', 'utf8');
    console.log('- .env file exists: ✅');
    console.log('- .env file size:', envContent.length, 'bytes');
    console.log('- .env file lines:', envContent.split('\n').length);
    
    // Check for common issues
    if (envContent.includes('\r\n')) {
        console.log('⚠️  Warning: .env file has Windows line endings (\\r\\n)');
    }
    if (!envContent.endsWith('\n')) {
        console.log('⚠️  Warning: .env file missing final newline');
    }
    
} catch (error) {
    console.log('❌ .env file issue:', error.message);
}