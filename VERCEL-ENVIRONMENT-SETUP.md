# Vercel Environment Variables Setup Guide

## 🚨 CRITICAL: Production Environment Fix Required

**Status**: All environment variables are missing from Vercel production deployment  
**Impact**: Complete failure of notification system in production  
**Solution**: Configure all required environment variables in Vercel dashboard

## Current Production Status

✅ **Health Check Results**:
```json
{
  "status": "degraded",
  "checks": {
    "hasDeviceToken": false,
    "hasAPNsConfig": false, 
    "hasBundleId": false,
    "hasApiKey": false
  }
}
```

❌ **API Endpoint Error**: `{"error":"Invalid API key"}`

## Required Environment Variables

### 1. API Authentication
```bash
API_KEY=YOUR_API_KEY_HERE
```

### 2. APNs Configuration
```bash
APNS_KEY_ID=YOUR_APNS_KEY_ID_HERE
APNS_TEAM_ID=YOUR_APNS_TEAM_ID_HERE
APNS_BUNDLE_ID=YOUR_BUNDLE_ID_HERE
```

### 3. APNs Private Key (Base64 Format)
```bash
APNS_KEY_BASE64=YOUR_BASE64_ENCODED_APNS_PRIVATE_KEY_HERE
```
*Note: Extract the base64 content from your .env file (between BEGIN/END PRIVATE KEY lines)*

### 4. Test Device Token (Optional)
```bash
DEVICE_TOKEN=YOUR_IOS_DEVICE_TOKEN_HERE
```

### 5. Environment Setting
```bash
NODE_ENV=production
```

## Vercel Dashboard Setup Steps

### Step 1: Access Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Navigate to the "shooter" project
3. Click on "Settings" tab
4. Select "Environment Variables" from the sidebar

### Step 2: Add Environment Variables
Add each variable with these exact values:

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `API_KEY` | `YOUR_API_KEY_HERE` | Production |
| `APNS_KEY_ID` | `YOUR_APNS_KEY_ID_HERE` | Production |
| `APNS_TEAM_ID` | `YOUR_APNS_TEAM_ID_HERE` | Production |
| `APNS_BUNDLE_ID` | `YOUR_BUNDLE_ID_HERE` | Production |
| `APNS_KEY_BASE64` | `YOUR_BASE64_APNS_KEY_HERE` | Production |
| `DEVICE_TOKEN` | `YOUR_DEVICE_TOKEN_HERE` | Production |
| `NODE_ENV` | `production` | Production |

*Note: Replace all placeholder values with your actual credentials from the `.env` file*

### Step 3: Redeploy Application
After adding all environment variables:
1. Go to "Deployments" tab
2. Click "Redeploy" on the latest deployment
3. Wait for deployment to complete

## Verification Tests

### Test 1: Health Check
```bash
curl -s "https://shooter-dpucs3r83-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/health" | jq .
```

**Expected Result**:
```json
{
  "status": "healthy",
  "checks": {
    "hasDeviceToken": true,
    "hasAPNsConfig": true,
    "hasBundleId": true,
    "hasApiKey": true
  }
}
```

### Test 2: Notification Endpoint
```bash
curl -X POST "https://shooter-dpucs3r83-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer shooter2024" \
  -d '{
    "deviceToken": "ffd431c70b0f0971b76c5b5d1bce24ac52753e06854496d29200ced822a11bab",
    "title": "🎉 Production Fixed!",
    "message": "End-to-end working!",
    "data": {"source": "production-test"}
  }'
```

**Expected Result**:
```json
{"success": true, "sent": 1, "failed": 0}
```

### Test 3: End-to-End Notification
After successful API response, check iPhone for notification delivery.

## Troubleshooting

### If Health Check Still Shows "degraded"
1. Check that all environment variable names are spelled exactly as shown
2. Ensure no extra spaces in variable values
3. Verify the deployment completed successfully
4. Check Vercel function logs for any initialization errors

### If API Key Error Persists
- Verify `API_KEY=shooter2024` is set exactly
- Check that the `Authorization: Bearer shooter2024` header is being sent correctly

### If APNs Errors Occur
- Verify `APNS_KEY_BASE64` is set as a single line with no spaces or newlines
- Check that `APNS_KEY_ID`, `APNS_TEAM_ID`, and `APNS_BUNDLE_ID` match exactly
- Ensure the base64 key content is exactly as provided (no truncation)

## Critical Notes

⚠️ **Security**: These environment variables contain sensitive production credentials  
🔧 **Single Source**: The `APNS_KEY_BASE64` format avoids multiline formatting issues  
🚀 **Priority**: This fix unblocks all production testing and deployment  
📱 **Testing**: Real iPhone device required for end-to-end verification

## Success Criteria

✅ **Fixed When**:
1. Health endpoint returns `"status": "healthy"`
2. All checks return `true` in health response  
3. Notify endpoint returns `{"success": true, "sent": 1, "failed": 0}`
4. Real iPhone receives notification from production
5. No JSON parsing errors in Vercel function logs

---

**Next Steps After Fix**:
1. Test Claude Code hooks with production endpoints
2. Clean up debug logging for production
3. Add production monitoring and alerting
4. Proceed to Phase 2 Priority 3: Enhanced Notification Features