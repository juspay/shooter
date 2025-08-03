# ClaudeNotifier iOS App

A SwiftUI-based iOS application for receiving push notifications from Claude Code. This app demonstrates modern iOS development practices with APNs integration.

## 🏗️ Project Structure

```
ios/
├── ClaudeNotifier/
│   ├── ClaudeNotifier.xcodeproj/          # Xcode project file
│   ├── ClaudeNotifier/                    # Source code
│   │   ├── ClaudeNotifierApp.swift        # Main app entry point
│   │   ├── AppDelegate.swift              # App lifecycle management
│   │   ├── ContentView.swift              # Main UI view
│   │   ├── NotificationManager.swift      # Push notification handling
│   │   ├── ClaudeNotifier.entitlements    # App capabilities
│   │   ├── Assets.xcassets/               # App icons and images
│   │   └── Preview Content/               # SwiftUI previews
│   ├── Scripts/                           # Build and setup scripts
│   │   ├── build.sh                       # Build automation
│   │   └── setup.sh                       # Development setup
│   └── build/                             # Build outputs (ignored)
├── .gitignore                             # iOS-specific git ignores
└── README.md                              # This file
```

## 🚀 Quick Start

### Prerequisites

- macOS with Xcode 15.0 or later
- iOS 15.0+ target device or simulator
- Apple Developer account (for device testing and push notifications)

### Setup

1. **Run the setup script:**
   ```bash
   cd ios/ClaudeNotifier
   ./Scripts/setup.sh
   ```

2. **Open in Xcode:**
   ```bash
   open ClaudeNotifier.xcodeproj
   ```

3. **Configure your development team:**
   - Select the project in Xcode
   - Go to "Signing & Capabilities"
   - Select your development team
   - Update the bundle identifier to be unique

### Building

Use the build script for automated building:

```bash
# Build for simulator only
./Scripts/build.sh simulator

# Build for device only  
./Scripts/build.sh device

# Run tests
./Scripts/build.sh test

# Build everything (default)
./Scripts/build.sh
```

Or build directly in Xcode (⌘+B).

## 📱 Features

### Core Functionality
- **Push Notification Registration**: Automatically requests permission and registers device token
- **Server Integration**: Connects to the SvelteKit backend for notification delivery
- **Real-time Updates**: Displays incoming notifications in the app
- **Device Token Management**: Secure handling and display of APNs device tokens

### User Interface
- **SwiftUI Architecture**: Modern declarative UI with environment objects
- **Notification Status**: Visual indicators for permission and registration status
- **Test Notifications**: Built-in local notification testing
- **Server Configuration**: Editable server URL for different environments

## 🔧 Configuration

### Push Notifications Setup

1. **Enable Push Notifications:**
   - In Xcode, select your target
   - Go to "Signing & Capabilities"
   - Click "+ Capability" and add "Push Notifications"

2. **Configure APNs:**
   - Create an App ID in Apple Developer Portal
   - Enable Push Notifications capability
   - Generate an APNs Authentication Key (.p8 file)
   - Note your Team ID and Key ID

3. **Update Server:**
   - Add the .p8 key content to your server environment
   - Configure the server with your Team ID, Key ID, and Bundle ID

### Environment Configuration

The app uses the following configuration:
- **Default Server URL**: `https://shooter-dpucs3r83-sachin-sharmas-projects-7dbbe7a8.vercel.app`
- **Bundle ID**: `com.example.claudenotifier` (update this to your own)
- **Minimum iOS Version**: 15.0

## 🏃‍♂️ Running the App

### In Simulator
1. Select an iOS Simulator in Xcode
2. Press ⌘+R to build and run
3. Note: Push notifications won't work in simulator

### On Device
1. Connect your iOS device
2. Select your device in Xcode
3. Ensure you have a valid development certificate
4. Press ⌘+R to build and run
5. Trust the developer certificate on your device if prompted

## 🧪 Testing

### Local Notifications
The app includes a "Send Test Notification" button that triggers local notifications to verify the UI and notification handling.

### Push Notifications
To test real push notifications:
1. Run the app on a physical device
2. Grant notification permissions
3. Copy the device token from the app
4. Use the web interface or API to send a test notification

## 🛠️ Development

### Architecture
- **SwiftUI**: Modern declarative UI framework
- **Combine**: Reactive programming for data flow
- **UserNotifications**: iOS framework for notification handling
- **MVVM Pattern**: Separation of concerns with ObservableObject

### Key Components

**NotificationManager**: Handles all push notification logic
- Permission requests
- Device token registration
- Notification processing
- Server communication

**ContentView**: Main UI displaying app status and controls
- Real-time status updates
- Device token display
- Server configuration
- Test controls

**AppDelegate**: Manages app lifecycle and remote notifications
- Device token callbacks
- Notification registration
- Background processing

## 🔍 Troubleshooting

### Common Issues

**"No valid signing certificate found"**
- Ensure you have a valid Apple Developer account
- Check your signing settings in Xcode
- Download development certificates in Xcode preferences

**"Push notifications not working"**
- Verify you're testing on a physical device (not simulator)
- Check that Push Notifications capability is enabled
- Ensure your APNs configuration is correct on the server

**"Device token not generated"**
- Check notification permissions are granted
- Verify you're on a physical device
- Check Xcode console for error messages

### Debug Information

The app logs important information to the Xcode console:
- Device token registration
- Notification permissions
- Server communication
- Error messages

Check the console output when debugging issues.

## 📚 Additional Resources

- [Apple Push Notification Service](https://developer.apple.com/documentation/usernotifications/)
- [SwiftUI Documentation](https://developer.apple.com/documentation/swiftui/)
- [iOS App Development](https://developer.apple.com/ios/)

## 🔒 Security Notes

- Never commit APNs keys (.p8 files) to version control
- Use environment variables for sensitive configuration
- Validate all server communications
- Follow Apple's security guidelines for app development