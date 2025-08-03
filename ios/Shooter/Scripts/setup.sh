#!/bin/bash

# Setup script for Shooter iOS development
# This script sets up the development environment

set -e  # Exit on any error

echo "🔧 Setting up Shooter development environment..."

# Check if Xcode is installed
check_xcode() {
    if ! command -v xcodebuild &> /dev/null; then
        echo "❌ Xcode is not installed. Please install Xcode from the App Store."
        exit 1
    fi
    
    XCODE_VERSION=$(xcodebuild -version | head -1)
    echo "✅ Found $XCODE_VERSION"
}

# Check if iOS Simulator is available
check_simulator() {
    echo "📱 Checking iOS Simulators..."
    xcrun simctl list devices | grep "iPhone" | head -3
    echo "✅ iOS Simulators available"
}

# Setup development certificates (if needed)
setup_certificates() {
    echo "📋 Certificate setup information:"
    echo "   1. Open Xcode"
    echo "   2. Go to Preferences > Accounts"
    echo "   3. Add your Apple ID"
    echo "   4. Select your team"
    echo "   5. Download development certificates"
    echo ""
    echo "⚠️  For push notifications, you'll need:"
    echo "   - Apple Developer Program membership"
    echo "   - APNs Authentication Key (.p8 file)"
    echo "   - App ID with Push Notifications capability"
}

# Create necessary directories
create_directories() {
    echo "📁 Creating project directories..."
    mkdir -p "build"
    mkdir -p "fastlane"
    mkdir -p "docs"
    echo "✅ Directories created"
}

# Validate project structure
validate_project() {
    echo "🔍 Validating project structure..."
    
    required_files=(
        "Shooter.xcodeproj/project.pbxproj"
        "Shooter/ShooterApp.swift"
        "Shooter/ContentView.swift"
        "Shooter/NotificationManager.swift"
        "Shooter/AppDelegate.swift"
        "Shooter/Shooter.entitlements"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            echo "✅ $file"
        else
            echo "❌ Missing: $file"
            exit 1
        fi
    done
}

# Main setup process
main() {
    check_xcode
    check_simulator
    create_directories
    validate_project
    setup_certificates
    
    echo ""
    echo "🎉 Setup completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Open Shooter.xcodeproj in Xcode"
    echo "   2. Configure your development team in project settings"
    echo "   3. Bundle identifier is set to: in.juspay.shooter"
    echo "   4. Add APNs capability in Signing & Capabilities"
    echo "   5. Run the app in simulator or device"
    echo ""
    echo "🏗️  To build the project, run: ./Scripts/build.sh"
}

# Run main function
main