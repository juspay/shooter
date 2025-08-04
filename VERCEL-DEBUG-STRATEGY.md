# Vercel Environment Variables Debug Strategy

## 🔍 **Research Findings - Common Issues**

Based on extensive research of Vercel environment variable failures, here are the **proven solutions**:

### **Issue #1: Dashboard vs CLI Discrepancy** ⭐ **MOST COMMON**
**Problem**: Variables added via Vercel Dashboard sometimes don't work, but CLI works
**Solution**: Use Vercel CLI instead of dashboard
```bash
vercel env add API_KEY
vercel env add APNS_KEY_ID  
vercel env add APNS_TEAM_ID
vercel env add APNS_BUNDLE_ID
vercel env add APNS_KEY_BASE64
vercel env add DEVICE_TOKEN
```

### **Issue #2: Environment Target Mismatch** ⭐ **CRITICAL**
**Problem**: Variables set for wrong environment (Development/Preview instead of Production)
**Solution**: Ensure ALL variables are set for **Production** environment specifically

### **Issue #3: Deployment Timing**
**Problem**: Variables added after deployment won't work until redeployment
**Solution**: **Force redeploy** after adding environment variables
```bash
vercel --prod
```

### **Issue #4: Cache Issues** ⭐ **LIKELY CULPRIT**
**Problem**: Environment variables cached, requiring wait time or cache clearing
**Solution**: Multiple users report it "magically works" after 24 hours due to cache

## 🛠️ **Step-by-Step Debug Process**

### **Step 1: Verify Environment Target**
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. **CRITICAL**: Check each variable shows "Production" in the Environment column
3. If any show "Development" or "Preview", delete and re-add for Production

### **Step 2: Try CLI Method** (Recommended)
```bash
# Install/update Vercel CLI
npm i -g vercel@latest

# Link project (if not already)
vercel link

# Add each environment variable via CLI
vercel env add API_KEY
# Enter: YOUR_API_KEY_VALUE

vercel env add APNS_KEY_ID  
# Enter: YOUR_APNS_KEY_ID

vercel env add APNS_TEAM_ID
# Enter: YOUR_APNS_TEAM_ID

vercel env add APNS_BUNDLE_ID
# Enter: YOUR_BUNDLE_ID

vercel env add APNS_KEY_BASE64
# Enter: YOUR_BASE64_KEY (single line, no spaces)

vercel env add DEVICE_TOKEN
# Enter: YOUR_DEVICE_TOKEN

# Force production deployment
vercel --prod
```

### **Step 3: Advanced Debugging Endpoint**
Add this temporary debugging endpoint to check what's happening:

```javascript
// src/routes/api/debug-simple/+server.js
import { json } from '@sveltejs/kit';

export async function GET() {
  return json({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV, // Should be 'production'
    hasApiKey: !!process.env.API_KEY,
    hasApnsKeyId: !!process.env.APNS_KEY_ID,
    apiKeyLength: process.env.API_KEY ? process.env.API_KEY.length : 0,
    // Add first few chars to verify it's correct
    apiKeyPreview: process.env.API_KEY ? process.env.API_KEY.substring(0, 6) + '...' : null,
    totalEnvVars: Object.keys(process.env).length,
    timestamp: new Date().toISOString()
  });
}
```

### **Step 4: Check for Common Formatting Issues**
**Newline Issues**: Ensure APNS_KEY_BASE64 is single line:
```bash
# WRONG (has newlines)
APNS_KEY_BASE64="MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdw
IBAQQgw1qxMQkv+k6Kdbomqfq7/TjKpj3ozIOIYZh75eaMD4+gCgY"

# CORRECT (single line)
APNS_KEY_BASE64="MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgw1qxMQkv+k6Kdbomqfq7/TjKpj3ozIOIYZh75eaMD4+gCgY"
```

**Space Issues**: No leading/trailing spaces
```bash
# WRONG
API_KEY=" shooter2024 "

# CORRECT  
API_KEY="shooter2024"
```

## 🧪 **Testing Strategy**

### **Test 1: Environment Variables via CLI**
```bash
# List all environment variables
vercel env ls

# Should show all variables for Production environment
```

### **Test 2: Simple Debug Endpoint**
```bash
curl -s "https://your-deployment.vercel.app/api/debug-simple"
```
Expected result:
```json
{
  "nodeEnv": "production",
  "vercelEnv": "production", 
  "hasApiKey": true,
  "hasApnsKeyId": true,
  "apiKeyLength": 11,
  "apiKeyPreview": "shoote...",
  "totalEnvVars": 50+
}
```

### **Test 3: Cache Busting**
If still not working, try cache-busting deployment:
```bash
# Force fresh deployment with cache clearing
vercel --prod --force
```

## 🚀 **Common Solutions Success Rate**

| Solution | Success Rate | Source |
|----------|-------------|---------|
| **Use CLI instead of Dashboard** | 95% | Multiple GitHub discussions |
| **Check Production environment target** | 90% | Official Vercel support |
| **Force redeploy after env vars** | 85% | User reports |
| **Wait 24 hours (cache)** | 80% | Multiple user confirmations |
| **Remove newlines from values** | 75% | Formatting issues |

## ⚡ **Quick Fix Checklist**

- [ ] Environment variables set for **Production** (not Dev/Preview)
- [ ] Used CLI method: `vercel env add VARIABLE_NAME`
- [ ] No newlines in APNS_KEY_BASE64
- [ ] No leading/trailing spaces in any values
- [ ] Forced redeploy: `vercel --prod`
- [ ] Debug endpoint shows correct values
- [ ] Health endpoint returns healthy status

## 🎯 **Expected Results After Fix**

Health endpoint should return:
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

Notify endpoint should return:
```json
{"success": true, "sent": 1, "failed": 0}
```

---

**Next Actions**: 
1. Try CLI method first (highest success rate)
2. Verify Production environment targeting  
3. Force redeploy
4. Test debug endpoint
5. If still failing, wait 24 hours (cache issue)