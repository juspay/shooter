#!/usr/bin/env bash
#
# Setup script for the Shooter Android project.
# Generates the Gradle wrapper files (gradle-wrapper.jar and gradlew scripts).
#
# Prerequisites:
#   - Gradle 8.12+ installed locally (e.g., via `brew install gradle` or SDKMAN)
#
# Usage:
#   cd android/
#   chmod +x setup.sh
#   ./setup.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generating Gradle wrapper..."

if ! command -v gradle &> /dev/null; then
    echo "Error: 'gradle' not found. Install it first:"
    echo "  brew install gradle"
    echo "  # or via SDKMAN: sdk install gradle 8.12"
    exit 1
fi

gradle wrapper --gradle-version 8.12

echo ""
echo "Gradle wrapper generated successfully."
echo "You can now build with: ./gradlew assembleDebug"
echo ""
echo "NOTE: You also need to place a google-services.json file in android/app/"
echo "      Download it from the Firebase Console for your project."
