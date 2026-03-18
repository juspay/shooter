> **Historical Document** — This was the original POC guide. The project has evolved significantly. See CLAUDE.md for the current architecture.

# POC Implementation Guide: Claude Code to iOS Push Notifications

## Overview

This guide provides exact step-by-step instructions to create a working POC where Claude Code can send push notifications to an iOS device. The POC will be hosted on Vercel and demonstrate the complete flow.

## Prerequisites Checklist

- [ ] macOS machine (for iOS development)
- [ ] Apple Developer Account ($99/year)
- [ ] Bun ≥1.0.0 (replaces Node.js/npm for faster performance)
- [ ] Xcode installed
- [ ] iOS device (simulators don't support push notifications)
- [ ] Vercel account (free tier sufficient)
- [ ] Git installed

## Phase 0: Environment Setup

### Step 1: Initialize Git Repository

```bash
cd /Users/username/Developer/Personal/shooter
git init
echo "node_modules/
.env
.env.local
dist/
build/
.DS_Store
*.log" > .gitignore
git add .
git commit -m "Initial commit: Project setup for Claude-iOS push notifications POC"
```

### Step 2: Create SvelteKit Project with Bun

```bash
# Install Bun if not already installed
curl -fsSL https://bun.sh/install | bash

# Create the SvelteKit project using Bun and the 'sv' CLI (2024)
bunx sv create sveltekit-app
cd sveltekit-app

# Select options during creation:
# - Choose "SvelteKit minimal app"
# - Add TypeScript support: Yes
# - Add Prettier: Yes
# - Add ESLint: Yes
# - Add Playwright: No (for POC)
# - Add Vitest: No (for POC)
# - Package Manager: bun

# Dependencies are automatically installed with Bun
# Add required packages for APNs
bun add apn jsonwebtoken dotenv
bun add -D @types/jsonwebtoken

# Configure Vercel adapter
bun add -D @sveltejs/adapter-vercel
```

### Step 3: Configure SvelteKit for Vercel

Create/update `svelte.config.js`:

```javascript
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      runtime: 'nodejs18.x',
    }),
  },
};

export default config;
```

### Step 4: Project Structure Setup

```bash
# Create required directories
mkdir -p src/lib/server
mkdir -p src/routes/api/notify
mkdir -p src/routes/api/webhook
mkdir -p src/routes/api/health

# Create environment file template
cat > .env.local << 'EOF'
# API Authentication
API_KEY=your_secret_api_key_here

# APNs Configuration
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.example.yourapp
APNS_KEY=-----BEGIN PRIVATE KEY-----
your_p8_key_content_here
-----END PRIVATE KEY-----

# Device Token (will be updated from iOS app)
DEVICE_TOKEN=your_device_token_from_ios_app

# Environment
NODE_ENV=development
EOF
```

## Phase 1: Apple Developer Setup

### Step 5: Apple Developer Account & App ID

1. **Create Apple Developer Account**
   - Go to https://developer.apple.com
   - Sign in with Apple ID
   - Enroll in Apple Developer Program ($99/year)
   - Complete verification process (1-2 business days)

2. **Create App ID**
   ```bash
   # Manual steps in Apple Developer Portal:
   # 1. Navigate to Certificates, Identifiers & Profiles
   # 2. Select Identifiers → App IDs → +
   # 3. Select "App" → Continue
   # 4. Enter description: "Claude Notifier POC"
   # 5. Bundle ID: com.example.claudenotifier
   # 6. Capabilities: Check "Push Notifications"
   # 7. Continue → Register
   ```

### Step 6: Generate APNs Key

```bash
# Manual steps in Apple Developer Portal:
# 1. Certificates, Identifiers & Profiles → Keys → +
# 2. Key Name: "Claude-Notifier-APNs-Key"
# 3. Check "Apple Push Notifications service (APNs)"
# 4. Continue → Register
# 5. Download .p8 file (ONLY AVAILABLE ONCE!)
# 6. Note the Key ID (10-character string)
# 7. Note your Team ID (found in membership details)
```

**Security Note**: Store the .p8 file securely and never commit it to Git.

## Phase 2: SvelteKit Backend Implementation

### Step 7: APNs Service Implementation

Create `src/lib/server/apns.js`:

```javascript
import apn from 'apn';
import jwt from 'jsonwebtoken';

export class APNsService {
  constructor() {
    this.provider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production',
    });
  }

  async sendNotification(deviceToken, payload) {
    const notification = new apn.Notification();

    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.badge = payload.badge || 1;
    notification.sound = payload.sound || 'default';
    notification.alert = {
      title: payload.title || 'Claude Code Notification',
      body: payload.body || 'Hello from Claude!',
    };
    notification.payload = payload.data || {};
    notification.topic = process.env.APNS_BUNDLE_ID;

    try {
      const result = await this.provider.send(notification, deviceToken);
      console.log('APNs result:', result);
      return {
        success: result.sent.length > 0,
        sent: result.sent.length,
        failed: result.failed.length,
        errors: result.failed,
      };
    } catch (error) {
      console.error('APNs error:', error);
      throw error;
    }
  }

  shutdown() {
    this.provider.shutdown();
  }
}
```

### Step 8: API Routes Implementation

Create `src/routes/api/notify/+server.js`:

```javascript
import { json } from '@sveltejs/kit';
import { APNsService } from '$lib/server/apns.js';

const apnsService = new APNsService();

export async function POST({ request }) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    if (apiKey !== process.env.API_KEY) {
      return json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { title, message, data } = body;

    if (!title || !message) {
      return json({ error: 'Title and message are required' }, { status: 400 });
    }

    // Send notification
    const deviceToken = process.env.DEVICE_TOKEN;
    if (!deviceToken) {
      return json({ error: 'No device token configured' }, { status: 500 });
    }

    const result = await apnsService.sendNotification(deviceToken, {
      title,
      body: message,
      data,
    });

    return json({
      success: true,
      message: 'Notification sent successfully',
      result,
    });
  } catch (error) {
    console.error('Notification error:', error);
    return json(
      {
        error: 'Failed to send notification',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
```

Create `src/routes/api/health/+server.js`:

```javascript
import { json } from '@sveltejs/kit';

export async function GET() {
  return json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasDeviceToken: !!process.env.DEVICE_TOKEN,
    hasAPNsConfig: !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY),
  });
}
```

### Step 9: Frontend Testing Interface

Create `src/routes/+page.svelte`:

```svelte
<script>
  let title = 'Claude Code Test';
  let message = 'Hello from the POC!';
  let result = '';
  let loading = false;

  async function sendNotification() {
    loading = true;
    result = '';

    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_API_KEY || 'test-key'}`,
        },
        body: JSON.stringify({
          title,
          message,
          data: { source: 'web-interface' },
        }),
      });

      const data = await response.json();
      result = JSON.stringify(data, null, 2);
    } catch (error) {
      result = `Error: ${error.message}`;
    }

    loading = false;
  }
</script>

<main>
  <h1>Claude Code → iOS Push Notification POC</h1>

  <div class="form">
    <label>
      Title:
      <input bind:value={title} type="text" />
    </label>

    <label>
      Message:
      <textarea bind:value={message}></textarea>
    </label>

    <button on:click={sendNotification} disabled={loading}>
      {loading ? 'Sending...' : 'Send Notification'}
    </button>
  </div>

  {#if result}
    <pre>{result}</pre>
  {/if}
</main>

<style>
  main {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 2rem 0;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  input,
  textarea {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  button {
    padding: 1rem;
    background: #007cba;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  pre {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
  }
</style>
```

## Phase 3: iOS App Implementation

### Step 10: Create iOS Project

```bash
# Open Xcode
open -a Xcode

# Create new project:
# 1. File → New → Project
# 2. iOS → App
# 3. Product Name: "Claude Notifier"
# 4. Bundle Identifier: com.example.claudenotifier (must match App ID)
# 5. Language: Swift
# 6. Interface: SwiftUI
# 7. Use Core Data: No
# 8. Include Tests: No (for POC)
```

### Step 11: Configure Push Notifications

In Xcode:

1. Select project → Target → Signing & Capabilities
2. Add Capability → Push Notifications
3. Ensure Bundle Identifier matches your App ID
4. Select your Team (Apple Developer Account)

### Step 12: Implement Push Notification Code

Replace `ContentView.swift`:

```swift
import SwiftUI
import UserNotifications

struct ContentView: View {
    @State private var deviceToken: String = "No token yet"
    @State private var permissionStatus: String = "Unknown"

    var body: some View {
        VStack(spacing: 20) {
            Text("Claude Notifier POC")
                .font(.title)
                .padding()

            VStack(alignment: .leading, spacing: 10) {
                Text("Permission Status: \(permissionStatus)")
                Text("Device Token:")
                Text(deviceToken)
                    .font(.caption)
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(8)
            }
            .padding()

            Button("Request Permission") {
                requestNotificationPermission()
            }
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(8)

            Button("Copy Token") {
                UIPasteboard.general.string = deviceToken
            }
            .padding()
            .background(Color.green)
            .foregroundColor(.white)
            .cornerRadius(8)

            Spacer()
        }
        .onAppear {
            checkNotificationSettings()
        }
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                if granted {
                    permissionStatus = "Granted"
                    UIApplication.shared.registerForRemoteNotifications()
                } else {
                    permissionStatus = "Denied"
                }
            }
        }
    }

    func checkNotificationSettings() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized:
                    permissionStatus = "Authorized"
                case .denied:
                    permissionStatus = "Denied"
                case .notDetermined:
                    permissionStatus = "Not Determined"
                case .provisional:
                    permissionStatus = "Provisional"
                case .ephemeral:
                    permissionStatus = "Ephemeral"
                @unknown default:
                    permissionStatus = "Unknown"
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
```

Update `AppDelegate.swift` (create if not exists):

```swift
import UIKit
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("Device Token: \(tokenString)")

        // Update ContentView with token
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .deviceTokenReceived, object: tokenString)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error)")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.alert, .sound, .badge])
    }
}

extension Notification.Name {
    static let deviceTokenReceived = Notification.Name("deviceTokenReceived")
}
```

Update main app file to use AppDelegate:

```swift
import SwiftUI

@main
struct ClaudeNotifierApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

## Phase 4: Deployment & Testing

### Step 13: Deploy to Vercel

```bash
# Install Vercel CLI with Bun
bun add -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: claude-ios-notifier-poc
# - Directory: ./
# - Override settings? No

# Set environment variables in Vercel Dashboard
vercel env add API_KEY
vercel env add APNS_KEY_ID
vercel env add APNS_TEAM_ID
vercel env add APNS_BUNDLE_ID
vercel env add APNS_KEY
vercel env add DEVICE_TOKEN

# Redeploy with environment variables
vercel --prod
```

### Step 14: Test the Complete Flow

1. **Deploy iOS app to device**:

   ```bash
   # In Xcode:
   # 1. Connect iOS device
   # 2. Select device as target
   # 3. Press Cmd+R to build and run
   # 4. Grant notification permissions when prompted
   # 5. Copy the device token from the app
   ```

2. **Update Vercel environment**:

   ```bash
   # In Vercel Dashboard or CLI:
   vercel env add DEVICE_TOKEN production
   # Paste the device token from iOS app

   # Redeploy
   vercel --prod
   ```

3. **Test the notification flow**:

   ```bash
   # Test via web interface
   # Visit your Vercel deployment URL
   # Use the form to send a test notification

   # Test via Claude Code (manual curl for POC)
   curl -X POST https://your-app.vercel.app/api/notify \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your_api_key" \
     -d '{
       "title": "Hello from Claude Code!",
       "message": "This notification was sent from Claude Code via the POC system."
     }'
   ```

## Phase 5: Claude Code Integration

### Step 15: Create Claude Code Client

Create `claude-notifier-client.js`:

```javascript
#!/usr/bin/env node

// Using Bun's built-in fetch - no need for node-fetch
import { config } from 'dotenv';

config();

class ClaudeNotifierClient {
  constructor(apiUrl, apiKey) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async sendNotification(title, message, data = {}) {
    try {
      const response = await fetch(`${this.apiUrl}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          title,
          message,
          data: {
            ...data,
            timestamp: new Date().toISOString(),
            source: 'claude-code',
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unknown error');
      }

      console.log('✅ Notification sent successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to send notification:', error.message);
      throw error;
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.apiUrl}/api/health`);
      const health = await response.json();
      console.log('🏥 Health check:', health);
      return health;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }
}

// Example usage
async function main() {
  const client = new ClaudeNotifierClient(process.env.VERCEL_APP_URL, process.env.API_KEY);

  // Check health first
  await client.checkHealth();

  // Send test notification
  await client.sendNotification(
    'Claude Code POC',
    'Successfully sending notifications from Claude Code to iOS!'
  );
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default ClaudeNotifierClient;
```

### Step 16: Final POC Validation

Create test script `test-poc.js`:

```javascript
import ClaudeNotifierClient from './claude-notifier-client.js';

const client = new ClaudeNotifierClient(process.env.VERCEL_APP_URL, process.env.API_KEY);

console.log('🚀 Starting Claude Code → iOS Push Notification POC Test');

try {
  // Test 1: Health check
  console.log('\n📋 Test 1: Health Check');
  const health = await client.checkHealth();

  if (!health.hasDeviceToken || !health.hasAPNsConfig) {
    console.error('❌ Configuration incomplete:', health);
    process.exit(1);
  }

  // Test 2: Simple notification
  console.log('\n📱 Test 2: Simple Notification');
  await client.sendNotification('POC Test #1', 'Basic notification from Claude Code');

  // Test 3: Rich notification with data
  console.log('\n🎯 Test 3: Rich Notification');
  await client.sendNotification('POC Test #2', 'Rich notification with custom data', {
    action: 'test',
    priority: 'high',
    category: 'poc',
  });

  console.log('\n✅ POC Test Complete! Check your iOS device for notifications.');
} catch (error) {
  console.error('\n❌ POC Test Failed:', error.message);
  process.exit(1);
}
```

## Success Criteria

The POC is successful when:

- [ ] SvelteKit app deploys to Vercel without errors
- [ ] iOS app receives and displays push notifications
- [ ] Health check endpoint reports all configuration as valid
- [ ] Manual curl commands successfully trigger notifications
- [ ] Claude Code client script successfully sends notifications
- [ ] Notifications appear on iOS device in real-time

## Troubleshooting Guide

### Common Issues:

1. **No notifications received**: Check device token, APNs key configuration, and bundle ID matching
2. **401 Unauthorized**: Verify API key in request headers
3. **APNs connection errors**: Ensure .p8 key is properly formatted and Team ID is correct
4. **Build failures**: Check Node.js version and dependency compatibility

### Debug Commands:

```bash
# Check Vercel logs
vercel logs

# Test health endpoint
curl https://your-app.vercel.app/api/health

# Validate environment variables
vercel env ls
```

This completes the POC implementation guide. The system will enable Claude Code to send push notifications to iOS devices through a SvelteKit/Vercel backend.
