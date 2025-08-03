#!/usr/bin/env node

// Quick APNs test to isolate the JSON parsing error
import { APNsService } from './src/lib/server/apns.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('=== APNs JSON Error Test ===');

async function testAPNs() {
  try {
    console.log('Creating APNs service...');
    const apnsService = new APNsService();
    
    console.log('APNs service configured:', apnsService.isConfigured());
    
    if (!apnsService.isConfigured()) {
      console.error('APNs service not configured properly');
      return;
    }
    
    // Test with minimal payload
    const testPayload = {
      title: 'Test',
      body: 'Testing JSON parsing',
      data: {}
    };
    
    // Replace with your actual device token
    const testDeviceToken = 'b47da86b6e92d7f7d38ad8da95a4e9cd5ab3f0a2e51a0f2c8b9f7e3c4d5e6f78';
    
    console.log('Sending test notification...');
    const result = await apnsService.sendNotification(testDeviceToken, testPayload);
    
    console.log('Test result:', result);
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAPNs();