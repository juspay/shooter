#!/bin/bash

# Setup script for node-pty
# Handles installation and native module compilation for Node.js 22+

set -e

echo "🔧 Setting up node-pty..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "📦 Detected Node.js version: $(node -v)"

if [ "$NODE_VERSION" -ge 22 ]; then
    echo "⚠️  Node.js 22+ detected - using beta version of node-pty"
    PTY_VERSION="1.2.0-beta.10"
else
    echo "✓ Using stable node-pty"
    PTY_VERSION="1.1.0"
fi

# Detect package manager
if [ -f "pnpm-lock.yaml" ]; then
    PM="pnpm"
elif [ -f "yarn.lock" ]; then
    PM="yarn"
else
    PM="npm"
fi

echo "📦 Using package manager: $PM"

# Install node-pty
echo "📥 Installing node-pty@$PTY_VERSION..."
$PM add node-pty@$PTY_VERSION

# Configure pnpm to allow node-pty build scripts
if [ "$PM" = "pnpm" ]; then
    echo "⚙️  Configuring pnpm to allow node-pty build scripts..."
    pnpm config set onlyBuiltDependencies "node-pty" 2>/dev/null || true
fi

# Rebuild native modules
echo "🔨 Rebuilding native modules..."
if [ "$PM" = "pnpm" ]; then
    pnpm rebuild node-pty
elif [ "$PM" = "yarn" ]; then
    yarn rebuild node-pty
else
    npm rebuild node-pty
fi

# Verify installation
echo "✅ Verifying installation..."
node -e "
  const pty = require('node-pty');
  const timeout = setTimeout(() => { console.error('node-pty verification timed out'); process.exit(1); }, 5000);
  const t = pty.spawn('echo', ['ok']);
  t.onData(d => { clearTimeout(timeout); console.log('node-pty works:', d.trim()); process.exit(0); });
"

echo ""
echo "✅ node-pty setup complete!"
