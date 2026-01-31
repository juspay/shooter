#!/bin/bash

# SHOOTER Development Server Startup Script
# Always starts on port 7777, kills existing processes if needed

PORT=7777
echo "🚀 Starting SHOOTER development server on port $PORT..."

# Function to kill process on port
kill_port() {
    local port=$1
    echo "🔍 Checking for processes on port $port..."
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ ! -z "$pid" ]; then
        echo "⚠️  Found process $pid running on port $port"
        echo "🔫 Killing process $pid..."
        kill -9 $pid 2>/dev/null
        sleep 1
        
        # Verify process was killed
        if ! lsof -ti:$port >/dev/null 2>&1; then
            echo "✅ Successfully killed process on port $port"
        else
            echo "❌ Failed to kill process on port $port"
            exit 1
        fi
    else
        echo "✅ Port $port is available"
    fi
}

# Kill any existing process on port 7777
kill_port $PORT

# Start the development server
echo "🌟 Starting Bun development server..."
echo "📍 URL: http://localhost:$PORT"
echo "🔄 Using Bun for maximum performance..."
echo ""

# Run with Bun
bun run dev

# If bun fails, provide troubleshooting info
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Development server failed to start"
    echo "🔧 Troubleshooting:"
    echo "   1. Check if port $PORT is still in use: lsof -ti:$PORT"
    echo "   2. Try running: bun install"
    echo "   3. Check for error messages above"
    exit 1
fi