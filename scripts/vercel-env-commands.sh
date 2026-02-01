#!/bin/bash

# Vercel Environment Variable Setup Commands
# Run these commands if you have Vercel CLI installed

echo "🔧 Vercel Environment Variable Setup Commands"
echo "=============================================="
echo ""
echo "If you have Vercel CLI installed, run these commands:"
echo ""

echo "# 1. API Authentication"
echo "vercel env add API_KEY"
echo "# Enter: YOUR_API_KEY_HERE (from .env file)"
echo ""

echo "# 2. APNs Key ID"
echo "vercel env add APNS_KEY_ID"
echo "# Enter: YOUR_APNS_KEY_ID_HERE (from .env file)"
echo ""

echo "# 3. APNs Team ID"
echo "vercel env add APNS_TEAM_ID"
echo "# Enter: YOUR_APNS_TEAM_ID_HERE (from .env file)"
echo ""

echo "# 4. APNs Bundle ID"
echo "vercel env add APNS_BUNDLE_ID"
echo "# Enter: YOUR_BUNDLE_ID_HERE (from .env file)"
echo ""

echo "# 5. APNs Private Key (Base64)"
echo "vercel env add APNS_KEY_BASE64"
echo "# Enter: YOUR_BASE64_APNS_KEY_HERE (extract from .env between BEGIN/END PRIVATE KEY)"
echo ""

echo "# 6. Device Token (Optional)"
echo "vercel env add DEVICE_TOKEN"
echo "# Enter: YOUR_DEVICE_TOKEN_HERE (from iOS app or .env file)"
echo ""

echo "# 7. Environment"
echo "vercel env add NODE_ENV"
echo "# Enter: production"
echo ""

echo "# 8. Redeploy after adding variables"
echo "vercel --prod"
echo ""

echo "📋 Manual Setup (if CLI not available):"
echo "1. Go to https://vercel.com/dashboard"
echo "2. Select your 'shooter' project"
echo "3. Go to Settings > Environment Variables"
echo "4. Add each variable with values shown above"
echo "5. Redeploy the application"
echo ""

echo "🧪 Test after setup:"
echo "./tests/test-production.sh"