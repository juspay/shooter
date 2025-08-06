// Debug script to check what credentials we have configured
// Run this locally to see what values are being used

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const values = {
  APNS_KEY_ID: process.env.APNS_KEY_ID || 'NOT_SET',
  APNS_TEAM_ID: process.env.APNS_TEAM_ID || 'NOT_SET', 
  APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID || 'NOT_SET',
  APNS_KEY: process.env.APNS_KEY ? `SET (${process.env.APNS_KEY.length} chars)` : 'NOT_SET',
  DEVICE_TOKEN: process.env.DEVICE_TOKEN || 'NOT_SET'
};

console.log('🔍 Current Environment Variables:');
console.log('=====================================');
Object.entries(values).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});

console.log('');
console.log('⚠️  Compare these values with your Apple Developer Portal:');
console.log('1. Team ID: https://developer.apple.com/account/ (upper right)');
console.log('2. Key ID: Certificates, Identifiers & Profiles → Keys');
console.log('3. Bundle ID: Should match your iOS app bundle identifier');