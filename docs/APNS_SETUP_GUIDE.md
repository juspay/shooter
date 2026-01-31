# APNs Setup Guide

Complete guide for setting up Apple Push Notifications (APNs) with the Shooter Dashboard.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Apple Developer Portal Setup](#apple-developer-portal-setup)
- [Obtaining APNs Credentials](#obtaining-apns-credentials)
- [Environment Configuration](#environment-configuration)
- [Key Format Requirements](#key-format-requirements)
- [Testing Your Setup](#testing-your-setup)
- [Retry Logic & Error Handling](#retry-logic--error-handling)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Apple Developer Account** ($99/year for individual, $299/year for organization)
- **iOS App** with push notifications capability enabled
- **Bundle Identifier** for your iOS app
- **Device Token** from your iOS app (for testing)

## Apple Developer Portal Setup

### 1. Create APNs Auth Key

1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Keys** in the sidebar
4. Click the **+** button to create a new key
5. Enter a **Key Name** (e.g., "Shooter APNs Key")
6. Check **Apple Push Notifications service (APNs)**
7. Click **Continue** and then **Register**
8. **Download the .p8 file** (you can only download it once!)
9. Note your **Key ID** (10-character string, e.g., "S85L2ZG5R8")
10. Note your **Team ID** (found in the top right of the portal)

### 2. Enable Push Notifications for App ID

1. Navigate to **Identifiers**
2. Select your **App ID** (bundle identifier)
3. Ensure **Push Notifications** capability is checked
4. Save changes

## Obtaining APNs Credentials

You now have three pieces of information needed:

1. **APNs Auth Key (.p8 file)**: Downloaded from Apple Developer Portal
2. **Key ID**: 10-character string (e.g., "S85L2ZG5R8")
3. **Team ID**: 10-character string (e.g., "YM9U73Z2JM")

## Environment Configuration

### Step 1: Copy Environment Template

```bash
cp .env.example .env
```

### Step 2: Configure APNs Credentials

Edit your `.env` file and add your APNs credentials:

```bash
# APNs Configuration
APNS_KEY_ID=S85L2ZG5R8          # Your 10-char Key ID
APNS_TEAM_ID=YM9U73Z2JM         # Your 10-char Team ID
APNS_BUNDLE_ID=in.juspay.shooter # Your iOS bundle identifier

# APNs Key - See "Key Format Requirements" section below
APNS_KEY_P8="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgY/khMFkUNPQs...
XT7oSa2S8LihWj12VHXIzrWnsMBwgVBatRgKiiTQfHWBfrsqmPW7D68ACPOI...
3LrpIFp7
-----END PRIVATE KEY-----"

# Environment (development or production)
APNS_ENVIRONMENT=development
```

## Key Format Requirements

The system supports **two formats** for `APNS_KEY_P8`:

### Format 1: PEM with Headers (RECOMMENDED)

```bash
APNS_KEY_P8="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgY/khMFkUNPQs...
XT7oSa2S8LihWj12VHXIzrWnsMBwgVBatRgKiiTQfHWBfrsqmPW7D68ACPOI...
-----END PRIVATE KEY-----"
```

**Advantages:**
- Explicitly shows key format
- Compatible with all APNs libraries
- Standard PEM format

**To extract from .p8 file:**
```bash
cat AuthKey_XXXXXXXXXX.p8
```

### Format 2: Raw Key Without Headers (AUTO-FORMATTED)

```bash
APNS_KEY_P8=MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgY/khMFkUNPQs...
```

**Advantages:**
- Simpler to copy/paste
- Automatically adds PEM headers when loading

**How it works:**
The system detects if PEM headers are missing and automatically adds them:

```typescript
// Automatic PEM formatting (in library-apns.ts)
if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
  formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
}
```

## Testing Your Setup

### 1. Start Development Server

```bash
bun run dev
```

Look for successful initialization logs:

```
✅ Library APNs provider created successfully
Library APNs service initialized successfully
```

### 2. Get Device Token from iOS App

In your iOS app, implement push notification registration:

```swift
func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    print("Device Token: \(token)")
}
```

### 3. Send Test Notification via API

```bash
curl -X POST http://localhost:7777/api/notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer shooter2024" \
  -d '{
    "title": "Test Notification",
    "message": "Testing APNs setup",
    "deviceToken": "YOUR_DEVICE_TOKEN_HERE"
  }'
```

### 4. Send Test Notification via Dashboard

1. Navigate to http://localhost:7777/config
2. Enter your device token
3. Click "Send Test Notification"

## Retry Logic & Error Handling

The system includes robust retry and error handling to ensure reliable notification delivery:

### Exponential Backoff Retry

When APNs requests fail due to network issues, the system automatically retries:

```typescript
{
  maxAttempts: 3,              // Max 3 retry attempts
  initialDelay: 1000,          // 1 second initial delay
  maxDelay: 10000,             // 10 seconds max delay
  backoffMultiplier: 2         // Double delay each retry
}
```

**Retry Sequence:**
1. Initial attempt fails → Wait 1 second
2. Retry #1 fails → Wait 2 seconds
3. Retry #2 fails → Wait 4 seconds
4. Retry #3 fails → **Stop and throw error**

### Circuit Breaker Protection

Prevents cascading failures when APNs is experiencing issues:

```typescript
{
  failureThreshold: 5,         // Open circuit after 5 failures
  resetTimeout: 60000          // 60 second cooldown
}
```

**Circuit States:**
- **CLOSED**: Normal operation, requests go through
- **OPEN**: After 5 failures, all requests blocked for 60 seconds
- **HALF-OPEN**: After cooldown, allows one test request

**Benefits:**
- Prevents overwhelming APNs during outages
- Gives APNs time to recover
- Fails fast during prolonged outages

### Retryable Errors

Only network-related errors trigger retries:

```typescript
- ECONNREFUSED
- ECONNRESET
- ETIMEDOUT
- ENOTFOUND
- Network errors
- Socket hang up
- EPIPE
```

**Non-retryable errors** (fail immediately):
- Invalid device token
- Invalid APNs credentials
- Malformed payload
- Invalid bundle ID

## Troubleshooting

### "APNs provider not initialized"

**Cause:** Missing or invalid environment variables

**Solution:**
1. Check `.env` file exists
2. Verify all required variables are set:
   - `APNS_KEY_P8`
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_BUNDLE_ID`
3. Restart the server: `bun run dev`

### "Failed to generate token: secretOrPrivateKey must be an asymmetric key"

**Cause:** APNs key is not in proper PEM format

**Solution:**
1. Ensure key has PEM headers (see [Key Format Requirements](#key-format-requirements))
2. Use **Format 1** (PEM with headers) if **Format 2** (raw) doesn't work
3. Verify the key content from your `.p8` file is complete

### "BadDeviceToken" or "DeviceTokenNotForTopic"

**Cause:** Device token doesn't match bundle ID or environment

**Solutions:**
1. **Verify Bundle ID Match:**
   ```bash
   # In .env
   APNS_BUNDLE_ID=com.yourcompany.yourapp  # Must match iOS app
   ```

2. **Verify Environment:**
   ```bash
   # For development builds
   APNS_ENVIRONMENT=development

   # For production builds (App Store)
   APNS_ENVIRONMENT=production
   ```

3. **Get Fresh Device Token:**
   - Uninstall and reinstall iOS app
   - Check Xcode console for new device token

### "Circuit breaker is open"

**Cause:** Too many consecutive failures (5+) triggered circuit breaker

**Solution:**
1. Wait 60 seconds for circuit breaker to reset
2. Fix underlying issue causing failures
3. Manually reset circuit breaker (if needed):
   ```typescript
   // In your APNs service
   apnsService.circuitBreaker.reset();
   ```

### Notifications Not Arriving on Device

**Checklist:**
1. ✅ Device connected to internet
2. ✅ App has push notification permission granted
3. ✅ Device token is current (not expired)
4. ✅ Bundle ID matches between dashboard and iOS app
5. ✅ Environment (dev/prod) matches app build type
6. ✅ APNs credentials are valid and not expired
7. ✅ Server logs show "Sent: 1" (not "Failed: 1")

**Debug Steps:**
1. Check server logs for APNs response
2. Verify device token format (64 hex characters)
3. Try sending notification via [Apple's Push Notification Console](https://icloud.developer.apple.com/dashboard)
4. Check iOS app logs for delivery/receipt

### "Invalid device token format"

**Cause:** Device token is not 64 hexadecimal characters

**Solution:**
1. Verify device token from iOS app logs
2. Remove any spaces or special characters
3. Token should look like: `7a233090669bd391d60247e3d2c183165a85e44204a5a4246dc9c78bf2cda838`

### Server Logs Debugging

Enable debug logging in `.env`:

```bash
DEBUG=true
VERBOSE=true
```

**Useful Log Messages:**
```
✅ Library APNs provider created successfully    # Provider initialized
📱 SHOOTER Notification prepared                # Notification created
🚀 Sending push notification                   # Sending to APNs
✅ Notification sent successfully!              # APNs accepted
❌ Failed notifications                        # APNs rejected
⏳ Retry attempt N/3                           # Retry in progress
🔄 Circuit breaker: Attempting half-open       # Circuit testing
❌ Circuit breaker: Opening circuit            # Circuit opened
```

## Production Considerations

### Security Best Practices

1. **Never commit credentials to git:**
   ```bash
   # Ensure .env is in .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment-specific configs:**
   - `.env` for local development
   - Vercel/hosting platform secrets for production

3. **Rotate keys periodically:**
   - Create new APNs auth key every 6-12 months
   - Update across all environments

### Production Configuration

```bash
# Production .env
APNS_ENVIRONMENT=production
APNS_BUNDLE_ID=com.yourcompany.yourapp

# Ensure using production credentials
APNS_KEY_ID=YOUR_PRODUCTION_KEY_ID
APNS_TEAM_ID=YOUR_PRODUCTION_TEAM_ID
APNS_KEY_P8="YOUR_PRODUCTION_KEY"
```

### Monitoring

Monitor these metrics in production:

```typescript
// Success rate
const successRate = (sent / (sent + failed)) * 100;

// Circuit breaker state
const isHealthy = circuitBreaker.getState() === 'closed';

// Retry frequency
const retriesPerNotification = totalRetries / totalNotifications;
```

**Recommended Alerts:**
- Success rate < 95%
- Circuit breaker open > 5 minutes
- Retry rate > 20%
- Response time > 3 seconds

## Additional Resources

- [Apple APNs Documentation](https://developer.apple.com/documentation/usernotifications)
- [APNs Provider API](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server)
- [Push Notification Console](https://icloud.developer.apple.com/dashboard)
- [node-apn Library](https://github.com/node-apn/node-apn)
- [@parse/node-apn Library](https://github.com/parse-community/node-apn)

## Support

For issues specific to this implementation:
- Check [DEBUGGING-JOURNEY.md](../DEBUGGING-JOURNEY.md) for common issues
- Review [retry-utils.ts](../src/lib/server/retry-utils.ts) for retry configuration
- See [library-apns.ts](../src/lib/server/library-apns.ts) for APNs service implementation

---

**Last Updated:** 2025-10-26
**Version:** 1.0.0
