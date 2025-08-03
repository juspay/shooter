#!/bin/bash

# Build script for Shooter iOS app
# This script builds the app for simulator and device

set -e  # Exit on any error

echo "🚀 Starting Shooter build process..."

# Configuration
PROJECT_NAME="Shooter"
WORKSPACE_FILE="Shooter.xcodeproj"
SCHEME_NAME="Shooter"

# Build paths
BUILD_DIR="build"
SIMULATOR_BUILD_DIR="$BUILD_DIR/simulator"
DEVICE_BUILD_DIR="$BUILD_DIR/device"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR"
mkdir -p "$SIMULATOR_BUILD_DIR"
mkdir -p "$DEVICE_BUILD_DIR"

# Function to build for simulator
build_simulator() {
    echo "📱 Building for iOS Simulator..."
    xcodebuild -project "$WORKSPACE_FILE" \
               -scheme "$SCHEME_NAME" \
               -sdk iphonesimulator \
               -configuration Debug \
               -derivedDataPath "$SIMULATOR_BUILD_DIR" \
               build
    echo "✅ Simulator build completed"
}

# Function to build for device
build_device() {
    echo "📱 Building for iOS Device..."
    xcodebuild -project "$WORKSPACE_FILE" \
               -scheme "$SCHEME_NAME" \
               -sdk iphoneos \
               -configuration Release \
               -derivedDataPath "$DEVICE_BUILD_DIR" \
               build
    echo "✅ Device build completed"
}

# Function to run tests
run_tests() {
    echo "🧪 Running tests..."
    xcodebuild -project "$WORKSPACE_FILE" \
               -scheme "$SCHEME_NAME" \
               -sdk iphonesimulator \
               -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
               test
    echo "✅ Tests completed"
}

# Parse command line arguments
case "${1:-all}" in
    "simulator")
        build_simulator
        ;;
    "device")
        build_device
        ;;
    "test")
        run_tests
        ;;
    "all")
        build_simulator
        build_device
        ;;
    *)
        echo "Usage: $0 [simulator|device|test|all]"
        echo "  simulator - Build for iOS Simulator"
        echo "  device    - Build for iOS Device"
        echo "  test      - Run unit tests"
        echo "  all       - Build for both simulator and device (default)"
        exit 1
        ;;
esac

echo "🎉 Build process completed successfully!"