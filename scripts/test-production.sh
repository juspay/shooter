#!/bin/bash

# Production Environment Test Script
# Run this after configuring Vercel environment variables
#
# IMPORTANT: Update the values below with your actual credentials before running!

set -e

# TODO: Replace these with your actual values from .env file
PRODUCTION_URL="YOUR_VERCEL_DEPLOYMENT_URL_HERE"  # e.g., https://shooter-xxx.vercel.app
API_KEY="YOUR_API_KEY_HERE"                       # From .env: API_KEY
DEVICE_TOKEN="YOUR_DEVICE_TOKEN_HERE"             # From .env: DEVICE_TOKEN

echo "🧪 Testing SHOOTER Production Environment"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "📊 Test 1: Health Check"
echo "------------------------"
echo "URL: $PRODUCTION_URL/api/health"
echo ""

HEALTH_RESPONSE=$(curl -s "$PRODUCTION_URL/api/health")
echo "Response: $HEALTH_RESPONSE"
echo ""

# Check if health is good
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    echo "✅ Health check: PASSED"
else
    echo "❌ Health check: FAILED"
    echo "Expected: status = 'healthy'"
    echo ""
    echo "Debug: Check Vercel environment variables"
    exit 1
fi
echo ""

# Test 2: API Authentication
echo "🔐 Test 2: API Authentication"
echo "------------------------------"
echo "Testing API key validation..."
echo ""

AUTH_RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/api/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "deviceToken": "'$DEVICE_TOKEN'",
    "title": "🧪 Auth Test",
    "message": "Testing API authentication"
  }')

echo "Response: $AUTH_RESPONSE"
echo ""

if echo "$AUTH_RESPONSE" | grep -q '"error":"Invalid API key"'; then
    echo "❌ API Authentication: FAILED"
    echo "API_KEY environment variable not set correctly"
    exit 1
elif echo "$AUTH_RESPONSE" | grep -q '"success":true'; then
    echo "✅ API Authentication: PASSED"
elif echo "$AUTH_RESPONSE" | grep -q 'JSON.*position'; then
    echo "⚠️  JSON parsing error detected (APNs key issue)"
    echo "Check APNS_KEY_BASE64 environment variable"
    exit 1
else
    echo "⚠️  Unexpected response - check logs"
fi
echo ""

# Test 3: Full Notification
echo "📱 Test 3: End-to-End Notification"
echo "-----------------------------------"
echo "Sending test notification to device..."
echo ""

NOTIFY_RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/api/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "deviceToken": "'$DEVICE_TOKEN'",
    "title": "🎉 Production Test Success!",
    "message": "SHOOTER production environment is working!",
    "data": {
      "source": "production-test",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }')

echo "Response: $NOTIFY_RESPONSE"
echo ""

if echo "$NOTIFY_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Notification API: SUCCESS"
    
    # Extract sent/failed counts
    SENT=$(echo "$NOTIFY_RESPONSE" | grep -o '"sent":[0-9]*' | cut -d: -f2)
    FAILED=$(echo "$NOTIFY_RESPONSE" | grep -o '"failed":[0-9]*' | cut -d: -f2)
    
    echo "   📤 Sent: $SENT"
    echo "   ❌ Failed: $FAILED"
    echo ""
    echo "📱 Check your iPhone for the notification!"
    echo ""
    echo "🎉 ALL TESTS PASSED! Production environment is working correctly."
else
    echo "❌ Notification API: FAILED"
    echo ""
    echo "🔍 Debugging Information:"
    echo "Response: $NOTIFY_RESPONSE"
    
    if echo "$NOTIFY_RESPONSE" | grep -q 'JSON.*position'; then
        echo ""
        echo "💡 JSON parsing error detected:"
        echo "   - Check APNS_KEY_BASE64 environment variable"
        echo "   - Ensure no extra characters or formatting issues"
        echo "   - Verify base64 content is exactly as provided"
    fi
    
    exit 1
fi

echo ""
echo "🚀 Production Environment Status: HEALTHY"
echo "✅ Ready for Claude Code integration testing"
echo "✅ Ready for enhanced notification features"