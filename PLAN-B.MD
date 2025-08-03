# Claude Code to iOS Communication System - Detailed Architecture Plan

## Executive Summary

This document serves as a comprehensive architectural blueprint for building a bidirectional communication system between Claude Code (running locally) and an iOS application. The system leverages SvelteKit deployed on Vercel as the central server layer, enabling real-time push notifications and interactive responses designed for personal development use.

## System Design Philosophy

### Core Principles
1. **Start Simple, Iterate Continuously**: Begin with basic push notifications when all components are online, then progressively add reliability layers
2. **Local-First Development**: Optimize for local development workflows with minimal cloud dependencies
3. **Cost-Conscious Architecture**: Leverage free tiers (Vercel) and existing infrastructure (Cloudflare domains)
4. **Security Through Simplicity**: Use straightforward authentication patterns suitable for single-user systems
5. **Modular Enhancement**: Design each component to be independently upgradeable
6. **Unified Framework**: Use SvelteKit for both API endpoints and potential admin interface

### Technology Stack Rationale

The choice of SvelteKit as the central server framework provides several architectural advantages:
- **Unified Codebase**: Server-side API routes and client-side admin interface in one project
- **Native Vercel Integration**: Automatic optimization for Vercel's infrastructure
- **Type Safety**: Full TypeScript support across frontend and backend
- **Development Experience**: Hot module replacement and fast builds
- **API Routes**: File-based routing for clean API structure
- **Future Extensibility**: Easy to add web-based monitoring or configuration interfaces

### Iteration Strategy
The system will be built in four distinct phases:
- **Phase 1**: Basic push notifications (one-way communication)
- **Phase 2**: Interactive notifications with simple responses
- **Phase 3**: Full bidirectional communication with webhooks
- **Phase 4**: Reliability enhancements and state management

## Detailed Component Architecture

### 1. Claude Code Integration Layer

**Purpose**: Serves as the event source and action handler for the entire system. This component detects relevant events in your development workflow and transforms them into notifications.

**Technical Specifications**:
- **Language**: TypeScript with Node.js runtime
- **Integration Points**: File system watchers, process monitors, custom event hooks
- **Communication Protocol**: HTTPS with JSON payloads
- **Authentication**: Bearer token in Authorization header
- **SvelteKit Integration**: Communicates with SvelteKit API routes

**Implementation Requirements**:
```
Core Modules:
- HTTP Client: Native fetch API for consistency with SvelteKit
- Event Emitter: For internal event handling
- Configuration: dotenv for environment management
- Webhook Server: Express.js for receiving responses (Phase 3+)

Event Types to Support:
1. Task Completion Events
   - Build success/failure
   - Test results
   - Deploy status
2. Interactive Queries
   - Confirmation requests
   - Multiple choice questions
   - Text input requests
3. Information Updates
   - Progress notifications
   - Log streaming
   - Status changes

Claude Code Client Class Structure:
class ClaudeNotificationClient {
  constructor(config: {
    apiUrl: string;      // Your SvelteKit app URL
    apiKey: string;      // Authentication token
    webhookPort?: number; // For bidirectional communication
  })

  // Core methods
  async sendNotification(payload: NotificationPayload): Promise<Response>
  async sendSilentUpdate(data: any): Promise<Response>
  async requestUserInput(options: InputOptions): Promise<Response>

  // Webhook handling (Phase 3+)
  startWebhookServer(): void
  on(event: string, handler: Function): void
}
```

**Configuration Structure**:
```
Environment Variables:
- SVELTEKIT_API_URL: Your Vercel deployment URL
- API_KEY: Shared secret for authentication
- WEBHOOK_PORT: Local port for webhook server (Phase 3+)
- LOG_LEVEL: debug | info | error
```

### 2. SvelteKit Application Architecture

**Purpose**: Serves as the cloud gateway and potential admin interface. SvelteKit handles API routes for receiving events from Claude Code, sending push notifications through APNs, and optionally providing a web interface for monitoring and configuration.

**Technical Specifications**:
- **Framework**: SvelteKit with adapter-vercel
- **Language**: TypeScript throughout
- **Styling**: Tailwind CSS for any UI components
- **State Management**: SvelteKit's built-in stores
- **Data Fetching**: SvelteKit's load functions
- **API Design**: RESTful endpoints using +server.ts files

**Project Structure**:
```
sveltekit-app/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte          # Root layout (if adding UI)
│   │   ├── +page.svelte            # Dashboard (Phase 4+)
│   │   ├── api/
│   │   │   ├── notify/
│   │   │   │   └── +server.ts     # POST endpoint for notifications
│   │   │   ├── webhook/
│   │   │   │   └── +server.ts     # POST endpoint for iOS responses
│   │   │   ├── health/
│   │   │   │   └── +server.ts     # GET health check
│   │   │   └── status/
│   │   │       └── +server.ts     # GET notification status
│   │   └── admin/                  # Future admin interface
│   │       ├── +page.svelte        # Dashboard
│   │       ├── logs/
│   │       │   └── +page.svelte    # Notification logs
│   │       └── config/
│   │           └── +page.svelte    # Configuration UI
│   ├── lib/
│   │   ├── server/
│   │   │   ├── apns.ts            # APNs client implementation
│   │   │   ├── auth.ts            # Authentication middleware
│   │   │   ├── validation.ts      # Request validation schemas
│   │   │   └── cloudflare.ts      # Tunnel integration
│   │   ├── types/
│   │   │   └── index.ts           # Shared TypeScript types
│   │   └── stores/
│   │       └── notifications.ts    # Client-side state (Phase 4+)
│   ├── app.d.ts                   # App-wide type definitions
│   └── hooks.server.ts            # Server hooks for auth
├── static/                        # Static assets
├── tests/                         # Test files
├── package.json
├── svelte.config.js              # SvelteKit configuration
├── vite.config.js                # Vite configuration
├── tailwind.config.js            # Tailwind setup
└── vercel.json                   # Vercel configuration
```

**API Endpoint Specifications**:

```typescript
// src/routes/api/notify/+server.ts
import type { RequestHandler } from './$types';
import { validateAuth } from '$lib/server/auth';
import { sendPushNotification } from '$lib/server/apns';
import { notificationSchema } from '$lib/server/validation';

export const POST: RequestHandler = async ({ request, platform }) => {
  // 1. Validate authentication
  const authResult = await validateAuth(request);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Parse and validate request body
  const body = await request.json();
  const validation = notificationSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify({
      error: 'Validation failed',
      details: validation.error
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. Send push notification
  try {
    const result = await sendPushNotification(validation.data, platform?.env);
    return new Response(JSON.stringify({
      success: true,
      notificationId: result.id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to send notification',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Request Schema
interface NotificationRequest {
  id: string;
  type: 'alert' | 'silent' | 'interactive';
  priority: 'high' | 'normal' | 'low';
  payload: {
    title?: string;
    body?: string;
    category?: string;
    data?: Record<string, any>;
  };
  options?: {
    sound?: string | null;
    badge?: number | null;
    threadId?: string;
    collapseId?: string;
  };
}
```

**SvelteKit Configuration**:
```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      runtime: 'nodejs18.x',
      functions: {
        'src/routes/api/notify/+server.ts': {
          maxDuration: 10
        },
        'src/routes/api/webhook/+server.ts': {
          maxDuration: 10
        }
      }
    }),
    env: {
      dir: '..',
      publicPrefix: 'PUBLIC_'
    }
  }
};
```

**Environment Management**:
```bash
# .env.local (not committed)
API_KEY=your-secret-api-key
DEVICE_TOKEN=your-ios-device-token
APNS_KEY_ID=your-key-id
APNS_TEAM_ID=your-team-id
APNS_KEY=-----BEGIN PRIVATE KEY-----...
WEBHOOK_URL=https://webhook.yourdomain.com/notifications
WEBHOOK_SECRET=your-webhook-secret
PUBLIC_APP_NAME=Claude Notifier
```

### 3. APNs Client Implementation in SvelteKit

**Purpose**: Handles the complexity of communicating with Apple's Push Notification service, including JWT generation, HTTP/2 requests, and error handling.

```typescript
// src/lib/server/apns.ts
import jwt from 'jsonwebtoken';
import type { NotificationRequest } from '$lib/types';

export class APNsClient {
  private keyId: string;
  private teamId: string;
  private privateKey: string;
  private bundleId: string;
  private isDevelopment: boolean;
  private tokenCache: { token: string; expiry: number } | null = null;

  constructor(config: APNsConfig) {
    this.keyId = config.keyId;
    this.teamId = config.teamId;
    this.privateKey = config.privateKey;
    this.bundleId = config.bundleId;
    this.isDevelopment = config.isDevelopment ?? false;
  }

  private generateToken(): string {
    // Cache tokens for 45 minutes
    if (this.tokenCache && this.tokenCache.expiry > Date.now()) {
      return this.tokenCache.token;
    }

    const token = jwt.sign(
      {
        iss: this.teamId,
        iat: Math.floor(Date.now() / 1000)
      },
      this.privateKey,
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: this.keyId
        }
      }
    );

    this.tokenCache = {
      token,
      expiry: Date.now() + 45 * 60 * 1000 // 45 minutes
    };

    return token;
  }

  async sendNotification(
    deviceToken: string,
    notification: NotificationRequest
  ): Promise<APNsResponse> {
    const host = this.isDevelopment
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';

    const url = `https://${host}/3/device/${deviceToken}`;

    // Build APNs payload
    const payload = this.buildPayload(notification);

    // Send HTTP/2 request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${this.generateToken()}`,
        'apns-topic': this.bundleId,
        'apns-push-type': this.getPushType(notification.type),
        'apns-priority': notification.priority === 'high' ? '10' : '5',
        'apns-expiration': '0'
      },
      body: JSON.stringify(payload)
    });

    // Handle response
    if (response.ok) {
      return {
        success: true,
        id: response.headers.get('apns-id') || notification.id
      };
    } else {
      const error = await response.json();
      throw new APNsError(error.reason, response.status);
    }
  }

  private buildPayload(notification: NotificationRequest): any {
    const payload: any = {
      aps: {}
    };

    // Configure based on notification type
    switch (notification.type) {
      case 'alert':
      case 'interactive':
        payload.aps.alert = {
          title: notification.payload.title,
          body: notification.payload.body
        };
        if (notification.payload.category) {
          payload.aps.category = notification.payload.category;
        }
        break;
      case 'silent':
        payload.aps['content-available'] = 1;
        break;
    }

    // Add optional parameters
    if (notification.options?.sound !== undefined) {
      payload.aps.sound = notification.options.sound;
    }
    if (notification.options?.badge !== undefined) {
      payload.aps.badge = notification.options.badge;
    }
    if (notification.options?.threadId) {
      payload.aps['thread-id'] = notification.options.threadId;
    }

    // Add custom data
    if (notification.payload.data) {
      Object.assign(payload, notification.payload.data);
    }

    return payload;
  }

  private getPushType(type: NotificationRequest['type']): string {
    switch (type) {
      case 'alert':
      case 'interactive':
        return 'alert';
      case 'silent':
        return 'background';
      default:
        return 'alert';
    }
  }
}
```

### 4. iOS Application Architecture

**Purpose**: Receives push notifications, displays them to the user, and handles interactive responses. The app serves as the user interface for the entire system and communicates back to the SvelteKit server.

**Technical Specifications**:
- **Language**: Swift 5.5+
- **Minimum iOS Version**: 14.0
- **Architecture Pattern**: MVVM with Combine
- **Networking**: URLSession with async/await
- **UI Framework**: SwiftUI (with UIKit for notifications)

**Core Components Structure**:
```
iOS-App/
├── ClaudeNotifier/
│   ├── App/
│   │   ├── ClaudeNotifierApp.swift      # App entry point
│   │   ├── AppDelegate.swift            # Push registration
│   │   └── SceneDelegate.swift          # Scene management
│   ├── Services/
│   │   ├── NotificationService.swift    # Core notification logic
│   │   ├── APIClient.swift              # SvelteKit communication
│   │   └── TokenManager.swift           # Device token handling
│   ├── Models/
│   │   ├── Notification.swift           # Data models
│   │   └── NotificationAction.swift     # Action models
│   ├── Views/
│   │   ├── ContentView.swift           # Main view
│   │   ├── NotificationList.swift      # History view
│   │   └── SettingsView.swift          # Configuration
│   └── Extensions/
│       └── NotificationExtensions.swift # Helper extensions
├── NotificationService/                 # Service Extension
│   ├── NotificationService.swift       # Modify notifications
│   └── Info.plist
└── NotificationContent/                # Content Extension
    ├── NotificationViewController.swift # Custom UI
    ├── MainInterface.storyboard
    └── Info.plist
```

**Push Notification Registration**:
```swift
// AppDelegate.swift
import UIKit
import UserNotifications

class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Configure notification categories
        configureNotificationCategories()

        // Request notification permissions
        requestNotificationPermissions()

        return true
    }

    private func configureNotificationCategories() {
        // Confirmation category
        let confirmAction = UNNotificationAction(
            identifier: "CONFIRM_ACTION",
            title: "Confirm",
            options: [.foreground]
        )
        let cancelAction = UNNotificationAction(
            identifier: "CANCEL_ACTION",
            title: "Cancel",
            options: [.destructive]
        )
        let confirmationCategory = UNNotificationCategory(
            identifier: "CONFIRMATION",
            actions: [confirmAction, cancelAction],
            intentIdentifiers: [],
            options: []
        )

        // Text input category
        let replyAction = UNTextInputNotificationAction(
            identifier: "REPLY_ACTION",
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Type your response..."
        )
        let textInputCategory = UNNotificationCategory(
            identifier: "TEXT_INPUT",
            actions: [replyAction],
            intentIdentifiers: [],
            options: []
        )

        // Register categories
        UNUserNotificationCenter.current().setNotificationCategories([
            confirmationCategory,
            textInputCategory
        ])
    }

    private func requestNotificationPermissions() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge]
        ) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("Device Token: \(token)")
        // In production, this would be sent to your server
        // For now, copy this to your SvelteKit .env file
        TokenManager.shared.saveToken(token)
    }
}
```

**Notification Response Handling**:
```swift
// NotificationService.swift
import UserNotifications

class NotificationService: NSObject {
    static let shared = NotificationService()

    private let apiClient = APIClient()

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }
}

extension NotificationService: UNUserNotificationCenterDelegate {

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Extract notification data
        let userInfo = response.notification.request.content.userInfo
        guard let notificationId = userInfo["notificationId"] as? String else {
            completionHandler()
            return
        }

        // Handle different response types
        switch response.actionIdentifier {
        case "CONFIRM_ACTION":
            sendResponse(notificationId: notificationId, action: "confirm")
        case "CANCEL_ACTION":
            sendResponse(notificationId: notificationId, action: "cancel")
        case "REPLY_ACTION":
            if let textResponse = response as? UNTextInputNotificationResponse {
                sendResponse(
                    notificationId: notificationId,
                    action: "reply",
                    text: textResponse.userText
                )
            }
        case UNNotificationDefaultActionIdentifier:
            // User tapped notification
            sendResponse(notificationId: notificationId, action: "tap")
        default:
            break
        }

        completionHandler()
    }

    private func sendResponse(
        notificationId: String,
        action: String,
        text: String? = nil
    ) {
        Task {
            do {
                try await apiClient.sendNotificationResponse(
                    notificationId: notificationId,
                    action: action,
                    additionalData: text != nil ? ["text": text!] : nil
                )
            } catch {
                print("Failed to send response: \(error)")
            }
        }
    }
}
```

**API Client for SvelteKit Communication**:
```swift
// APIClient.swift
import Foundation

class APIClient {
    private let baseURL: String
    private let session = URLSession.shared

    init() {
        // In production, this would be your Vercel deployment URL
        self.baseURL = ProcessInfo.processInfo.environment["API_URL"]
            ?? "https://your-app.vercel.app"
    }

    func sendNotificationResponse(
        notificationId: String,
        action: String,
        additionalData: [String: Any]? = nil
    ) async throws {
        let url = URL(string: "\(baseURL)/api/webhook")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "notificationId": notificationId,
            "action": action,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        if let additionalData = additionalData {
            body["userInfo"] = additionalData
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.invalidResponse
        }
    }
}
```

### 5. Cloudflare Tunnel Configuration (Phase 3+)

**Purpose**: Provides a stable, secure endpoint for webhooks without exposing local development environment. This enables the SvelteKit server to communicate back to Claude Code.

**Integration with SvelteKit**:
```typescript
// src/lib/server/cloudflare.ts
export class CloudflareWebhookClient {
  private webhookUrl: string;
  private webhookSecret: string;

  constructor(config: { url: string; secret: string }) {
    this.webhookUrl = config.url;
    this.webhookSecret = config.secret;
  }

  async forwardToClaudeCode(data: any): Promise<boolean> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': this.webhookSecret
        },
        body: JSON.stringify(data)
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to forward to Claude Code:', error);
      return false;
    }
  }
}
```

**Tunnel Configuration**:
```yaml
# ~/.cloudflared/config.yml
tunnel: your-tunnel-id
credentials-file: /path/to/credentials.json

ingress:
  - hostname: webhook.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

## Data Flow Specifications

### Phase 1: Basic Push (One-Way)
The initial implementation focuses on getting notifications from Claude Code to your iOS device with minimal complexity.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant SK as SvelteKit/Vercel
    participant APNS as Apple Push Service
    participant iOS as iOS Device

    CC->>SK: POST /api/notify<br/>Auth: Bearer token
    SK->>SK: Validate request
    SK->>SK: Generate APNs JWT
    SK->>APNS: Send notification<br/>HTTP/2 + JWT
    APNS->>iOS: Deliver push
    iOS->>iOS: Display notification
```

### Phase 2: Interactive Notifications
Adds support for notification actions without requiring full bidirectional communication.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant SK as SvelteKit/Vercel
    participant APNS as Apple Push Service
    participant iOS as iOS Device

    CC->>SK: POST /api/notify<br/>category: "CONFIRMATION"
    SK->>APNS: Send interactive notification
    APNS->>iOS: Deliver with actions
    iOS->>iOS: User taps action
    iOS->>iOS: Handle locally<br/>(no response yet)
```

### Phase 3: Full Bidirectional Communication
Implements complete feedback loop using Cloudflare Tunnel for webhook delivery.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant CF as Cloudflare Tunnel
    participant SK as SvelteKit/Vercel
    participant APNS as Apple Push Service
    participant iOS as iOS Device

    CC->>SK: POST /api/notify
    SK->>APNS: Send notification
    APNS->>iOS: Deliver push
    iOS->>iOS: User takes action
    iOS->>SK: POST /api/webhook
    SK->>CF: Forward response
    CF->>CC: Deliver webhook
    CC->>CC: Process response
```

### Phase 4: Enhanced Reliability
Adds queuing, retries, and state management for production-ready system.

```mermaid
graph TB
    subgraph "Claude Code"
        CCE[Event Emitter]
        CCQ[Message Queue]
        CCW[Webhook Server]
    end

    subgraph "SvelteKit/Vercel"
        API[API Routes]
        Queue[Job Queue]
        DB[(State Store)]
        Admin[Admin UI]
    end

    subgraph "iOS App"
        NotifHandler[Notification Handler]
        LocalDB[(Local Cache)]
    end

    CCE -->|Queue if offline| CCQ
    CCQ -->|Retry logic| API
    API -->|Store state| DB
    API -->|Background job| Queue
    Queue -->|Send via APNs| NotifHandler
    NotifHandler -->|Cache| LocalDB
    NotifHandler -->|Response| API
    API -->|Via Cloudflare| CCW
    Admin -->|Monitor| DB
```

## Security Architecture

### Authentication Layers

The security model uses defense-in-depth with multiple authentication layers:

**1. Claude Code → SvelteKit**
```typescript
// Implementation in SvelteKit hooks
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const authHeader = event.request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== env.API_KEY) {
      return new Response('Invalid token', { status: 401 });
    }
  }

  return await resolve(event);
};
```

**2. SvelteKit → APNs**
```typescript
// JWT generation with automatic rotation
class APNsAuthManager {
  private cache: Map<string, { token: string; expiry: number }> = new Map();

  getToken(keyId: string): string {
    const cached = this.cache.get(keyId);
    if (cached && cached.expiry > Date.now()) {
      return cached.token;
    }

    // Generate new token
    const token = this.generateToken(keyId);
    this.cache.set(keyId, {
      token,
      expiry: Date.now() + 45 * 60 * 1000
    });

    return token;
  }
}
```

**3. iOS → SvelteKit**
```swift
// Device token validation
struct DeviceTokenValidator {
    static func validate(_ token: String) -> Bool {
        // Ensure token matches expected format
        let regex = try! NSRegularExpression(
            pattern: "^[a-fA-F0-9]{64}$"
        )
        return regex.firstMatch(
            in: token,
            range: NSRange(location: 0, length: token.count)
        ) != nil
    }
}
```

**4. SvelteKit → Claude Code (Phase 3+)**
```typescript
// HMAC signature validation
import { createHmac } from 'crypto';

function validateWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return signature === expectedSignature;
}
```

### Security Best Practices Implementation

**Environment Variable Management**:
```bash
# Development (.env.local)
API_KEY=dev_secret_key_change_in_prod
DEVICE_TOKEN=your_dev_device_token

# Production (Vercel Dashboard)
# Set these via Vercel UI, never commit
API_KEY=prod_complex_random_string
DEVICE_TOKEN=your_prod_device_token
```

**Rate Limiting (Phase 4)**:
```typescript
// src/lib/server/rateLimit.ts
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private windowMs: number = 60000, // 1 minute
    private maxRequests: number = 60
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];

    // Remove old requests
    const validRequests = requests.filter(
      time => now - time < this.windowMs
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    return true;
  }
}
```

## Implementation Timeline

### Phase 1: Basic Push (Week 1)

**Day 1-2: Environment Setup**
Morning Day 1:
- Create Apple Developer account configurations
- Generate App ID with Push Notifications capability
- Create APNs Auth Key (.p8 file)
- Document Key ID and Team ID

Afternoon Day 1:
- Initialize SvelteKit project with TypeScript
- Configure Vercel deployment
- Set up local development environment
- Create basic project structure

Day 2:
- Configure iOS Xcode project
- Enable Push Notifications capability
- Implement basic notification registration
- Test device token generation

**Day 3-4: Core Implementation**
Day 3:
- Implement SvelteKit `/api/notify` endpoint
- Create APNs client class in SvelteKit
- Build Claude Code notification client
- Test end-to-end flow with hardcoded device token

Day 4:
- Implement error handling and logging
- Add request validation with Zod
- Create health check endpoint
- Deploy to Vercel and test production flow

**Day 5-7: Testing and Refinement**
Day 5:
- Comprehensive testing of notification types
- Test different APNs payload configurations
- Verify development vs production environments
- Document any iOS-specific quirks

Day 6:
- Performance testing and optimization
- Add proper TypeScript types throughout
- Create basic documentation
- Set up GitHub repository with proper .gitignore

Day 7:
- Final integration testing
- Create troubleshooting guide
- Prepare for Phase 2 enhancements
- Code review and cleanup

### Phase 2: Interactive Notifications (Week 2)

**Day 1-2: iOS Enhancement**
Day 1:
- Define notification categories in iOS app
- Implement action handlers for each category
- Create notification service extension
- Test local notification interactions

Day 2:
- Enhance UI for different notification types
- Add notification history tracking (local only)
- Implement notification grouping
- Test various user interaction flows

**Day 3-4: SvelteKit Updates**
Day 3:
- Extend notification schema for categories
- Add support for custom actions in payload
- Create notification type templates
- Update API documentation

Day 4:
- Implement notification status tracking
- Add temporary response storage (memory only)
- Prepare webhook endpoint structure
- Test interactive notification delivery

**Day 5-7: Integration Testing**
Day 5:
- Test all notification categories end-to-end
- Verify action button functionality
- Test notification replacement/updates
- Document interaction patterns

Day 6:
- Edge case testing (app states, network conditions)
- Performance optimization for quick actions
- Update Claude Code client for new features
- Create usage examples

Day 7:
- Full system integration test
- Update documentation with new features
- Prepare webhook infrastructure plan
- Code review and refinement

### Phase 3: Bidirectional Communication (Week 3)

**Day 1-2: Cloudflare Tunnel Setup**
Day 1:
- Install and configure cloudflared
- Create tunnel with proper ingress rules
- Set up DNS routing in Cloudflare
- Test basic tunnel connectivity

Day 2:
- Implement webhook server in Claude Code
- Add request validation and security
- Create event emitter for responses
- Test local webhook reception

**Day 3-4: SvelteKit Webhook Implementation**
Day 3:
- Create `/api/webhook` endpoint in SvelteKit
- Implement response forwarding logic
- Add webhook retry mechanism
- Create webhook event types

Day 4:
- Implement HMAC signature validation
- Add webhook delivery tracking
- Create error handling for failed deliveries
- Test complete feedback loop

**Day 5-7: Full System Testing**
Day 5:
- End-to-end bidirectional flow testing
- Test various network failure scenarios
- Verify webhook security measures
- Document the complete flow

Day 6:
- Performance testing under load
- Optimize webhook delivery speed
- Add comprehensive logging
- Create monitoring alerts setup

Day 7:
- Final integration testing
- Update all documentation
- Create operational runbook
- Prepare for Phase 4 enhancements

### Phase 4: Reliability Enhancements (Week 4+)

**Week 4: State Management & Persistence**
- Implement notification history in SvelteKit
- Add SQLite/PostgreSQL for state storage
- Create notification retry queue
- Build offline message handling

**Week 5: Admin Interface**
- Create SvelteKit admin routes
- Build notification dashboard
- Add real-time monitoring
- Implement configuration UI

**Week 6: Advanced Features**
- Add message queuing (Bull/BullMQ)
- Implement exponential backoff
- Create notification templates
- Add batch notification support

**Week 7: Production Hardening**
- Implement comprehensive monitoring
- Add alerting for failures
- Create backup mechanisms
- Performance optimization

## Testing Strategy

### Unit Testing Framework

**SvelteKit Testing Setup**:
```json
// package.json testing dependencies
{
  "devDependencies": {
    "@testing-library/svelte": "^4.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "jsdom": "^23.0.0",
    "supertest": "^6.3.0"
  }
}
```

**Example API Route Test**:
```typescript
// src/routes/api/notify/+server.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';

describe('POST /api/notify', () => {
  beforeEach(() => {
    // Reset mocks
  });

  it('should reject unauthorized requests', async () => {
    const request = new Request('http://localhost/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'alert' })
    });

    const response = await POST({ request, platform: {} });
    expect(response.status).toBe(401);
  });

  it('should validate notification payload', async () => {
    const request = new Request('http://localhost/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ invalid: 'payload' })
    });

    const response = await POST({ request, platform: {} });
    expect(response.status).toBe(400);
  });

  it('should send valid notifications', async () => {
    const request = new Request('http://localhost/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({
        id: 'test-123',
        type: 'alert',
        priority: 'normal',
        payload: {
          title: 'Test',
          body: 'Test notification'
        }
      })
    });

    const response = await POST({ request, platform: {} });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.notificationId).toBeDefined();
  });
});
```

### Integration Testing Scenarios

**1. Happy Path Test Suite**:
```typescript
// tests/integration/happyPath.test.ts
describe('Happy Path Integration', () => {
  it('should deliver notification end-to-end', async () => {
    // 1. Claude Code sends notification
    const notificationResponse = await claudeClient.sendNotification({
      type: 'alert',
      payload: {
        title: 'Integration Test',
        body: 'This is a test notification'
      }
    });
    expect(notificationResponse.success).toBe(true);

    // 2. Wait for iOS delivery (mock in tests)
    await waitForDelivery(notificationResponse.notificationId);

    // 3. Simulate user interaction
    const actionResponse = await simulateIOSAction(
      notificationResponse.notificationId,
      'confirm'
    );
    expect(actionResponse.delivered).toBe(true);

    // 4. Verify webhook delivery (Phase 3+)
    const webhookReceived = await waitForWebhook(
      notificationResponse.notificationId
    );
    expect(webhookReceived).toBe(true);
  });
});
```

**2. Network Failure Scenarios**:
```typescript
// Network failure test matrix
const networkScenarios = [
  { name: 'Claude Code offline during response', config: { claudeOffline: true } },
  { name: 'Vercel timeout', config: { vercelTimeout: true } },
  { name: 'APNs rejection', config: { apnsReject: true } },
  { name: 'Cloudflare tunnel down', config: { tunnelDown: true } }
];
```

**3. Concurrent Operation Tests**:
```typescript
// Concurrent notification handling
it('should handle 100 concurrent notifications', async () => {
  const promises = Array.from({ length: 100 }, (_, i) =>
    claudeClient.sendNotification({
      type: 'alert',
      payload: {
        title: `Test ${i}`,
        body: `Concurrent test ${i}`
      }
    })
  );

  const results = await Promise.allSettled(promises);
  const successful = results.filter(r => r.status === 'fulfilled');
  expect(successful.length).toBeGreaterThan(95); // Allow some failures
});
```

### Performance Testing Metrics

**Key Performance Indicators**:
```typescript
// Performance monitoring configuration
interface PerformanceMetrics {
  notificationDeliveryLatency: {
    p50: number; // Target: < 1s
    p95: number; // Target: < 3s
    p99: number; // Target: < 5s
  };
  webhookDeliveryLatency: {
    p50: number; // Target: < 500ms
    p95: number; // Target: < 2s
    p99: number; // Target: < 5s
  };
  systemThroughput: {
    notificationsPerSecond: number; // Target: > 10
    concurrentConnections: number;   // Target: > 100
  };
  errorRates: {
    apnsFailures: number;      // Target: < 1%
    webhookFailures: number;   // Target: < 5%
    authFailures: number;      // Target: < 0.1%
  };
}
```

**Load Testing Script**:
```typescript
// k6 load test example
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Peak load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests under 3s
    http_req_failed: ['rate<0.05'],    // Error rate under 5%
  },
};

export default function() {
  const payload = JSON.stringify({
    type: 'alert',
    priority: 'normal',
    payload: {
      title: 'Load Test',
      body: `Test at ${new Date().toISOString()}`
    }
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key',
    },
  };

  const res = http.post(
    'https://your-app.vercel.app/api/notify',
    payload,
    params
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has notificationId': (r) => JSON.parse(r.body).notificationId,
  });

  sleep(1);
}
```

## Deployment & Operations

### SvelteKit Deployment Configuration

**Vercel Configuration**:
```json
// vercel.json
{
  "framework": "sveltekit",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "regions": ["iad1"], // Choose closest to you
  "functions": {
    "src/routes/api/notify/+server.ts": {
      "memory": 512,
      "maxDuration": 10
    },
    "src/routes/api/webhook/+server.ts": {
      "memory": 512,
      "maxDuration": 10
    }
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

**GitHub Actions Deployment**:
```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Install Vercel CLI
        run: npm i -g vercel@latest

      - name: Pull Vercel Environment
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build Project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Monitoring & Alerting Setup

**Application Monitoring**:
```typescript
// src/lib/server/monitoring.ts
export class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();

  recordLatency(operation: string, duration: number) {
    const key = `latency.${operation}`;
    const values = this.metrics.get(key) || [];
    values.push(duration);
    this.metrics.set(key, values);
  }

  recordError(operation: string, error: Error) {
    const key = `errors.${operation}`;
    const count = this.metrics.get(key)?.[0] || 0;
    this.metrics.set(key, [count + 1]);

    // Log to external service
    console.error(`[${operation}] Error:`, error);
  }

  getMetrics(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [key, values] of this.metrics.entries()) {
      if (key.startsWith('latency.')) {
        report[key] = {
          count: values.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          p50: this.percentile(values, 0.5),
          p95: this.percentile(values, 0.95),
          p99: this.percentile(values, 0.99)
        };
      } else if (key.startsWith('errors.')) {
        report[key] = values[0];
      }
    }

    return report;
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}
```

**Health Check Endpoint**:
```typescript
// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    checks: {
      apns: await checkAPNs(),
      environment: checkEnvironment(),
      memory: process.memoryUsage(),
    }
  };

  return json(health);
};

async function checkAPNs(): Promise<boolean> {
  try {
    // Attempt to generate JWT token
    const client = new APNsClient(getAPNsConfig());
    const token = client.generateToken();
    return token.length > 0;
  } catch {
    return false;
  }
}

function checkEnvironment(): boolean {
  const required = [
    'API_KEY',
    'DEVICE_TOKEN',
    'APNS_KEY_ID',
    'APNS_TEAM_ID',
    'APNS_KEY'
  ];

  return required.every(key => process.env[key]);
}
```

### Troubleshooting Guide

**Common Issues and Solutions**:

1. **Device Token Issues**
```bash
# Symptom: InvalidDeviceToken error from APNs
# Solution: Verify token format and environment

# Debug checklist:
- [ ] Token is 64 hexadecimal characters
- [ ] Using sandbox endpoint for development builds
- [ ] Using production endpoint for TestFlight/App Store
- [ ] Token hasn't changed (iOS can regenerate)
```

2. **Authentication Failures**
```typescript
// Add debug logging to identify auth issues
if (process.env.DEBUG === 'true') {
  console.log('Auth header:', request.headers.get('authorization'));
  console.log('Expected key:', process.env.API_KEY?.substring(0, 5) + '...');
}
```

3. **Notification Not Received**
```swift
// iOS debug helper
class NotificationDebugger {
    static func logNotificationState() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            print("Authorization status: \(settings.authorizationStatus)")
            print("Alert setting: \(settings.alertSetting)")
            print("Sound setting: \(settings.soundSetting)")
            print("Badge setting: \(settings.badgeSetting)")
        }
    }
}
```

4. **Webhook Delivery Failures**
```bash
# Test Cloudflare tunnel connectivity
curl -X POST https://webhook.yourdomain.com/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check tunnel status
cloudflared tunnel info claude-webhook
```

## Appendix: Complete Configuration Templates

### SvelteKit Project Setup Script
```bash
#!/bin/bash
# setup-sveltekit-notifier.sh

# Create SvelteKit project
npm create svelte@latest claude-notifier
cd claude-notifier

# Install dependencies
npm install
npm install -D @sveltejs/adapter-vercel
npm install jsonwebtoken zod
npm install -D @types/jsonwebtoken

# Create environment file
cat > .env.local << EOF
API_KEY=development_key_change_in_production
DEVICE_TOKEN=your_device_token_here
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_KEY=-----BEGIN PRIVATE KEY-----
your_p8_key_content_here
-----END PRIVATE KEY-----
WEBHOOK_URL=https://webhook.yourdomain.com/notifications
WEBHOOK_SECRET=your_webhook_secret
EOF

# Create basic structure
mkdir -p src/routes/api/{notify,webhook,health}
mkdir -p src/lib/server
mkdir -p src/lib/types

echo "SvelteKit project created! Next steps:"
echo "1. Update .env.local with your credentials"
echo "2. Run 'npm run dev' to start development"
echo "3. Deploy with 'vercel' command"
```

### iOS Project Configuration
```swift
// Info.plist additions
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>

// Entitlements file
<key>aps-environment</key>
<string>development</string> <!-- or 'production' -->
```

This completes the comprehensive architectural plan for your Claude Code to iOS communication system. The plan provides a complete blueprint that can be followed to implement a robust, scalable solution starting from the simplest implementation and progressively adding features as needed.
