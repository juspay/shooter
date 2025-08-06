#!/usr/bin/env python3
"""
SHOOTER Notification Utility for Claude Code Hooks
Sends HTTP POST requests to SHOOTER API when Claude Code lifecycle events occur.
"""

import json
import sys
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
import traceback

# SHOOTER API Configuration
SHOOTER_API_URL = "https://shooter-k0pm43fy7-sachin-sharmas-projects-7dbbe7a8.vercel.app/api/notify"
# For local development, uncomment the next line:
# SHOOTER_API_URL = "http://localhost:5173/api/notify"

API_KEY = os.getenv("SHOOTER_API_KEY", "your-api-key-here")
DEVICE_TOKEN = os.getenv("SHOOTER_DEVICE_TOKEN", "your-device-token-here")

def send_notification(title, body, data=None):
    """
    Send notification to SHOOTER API
    
    Args:
        title (str): Notification title
        body (str): Notification body
        data (dict): Optional custom data payload
    """
    try:
        # Prepare notification payload
        payload = {
            "title": title,
            "message": body,
            "deviceToken": DEVICE_TOKEN
        }
        
        if data:
            payload["data"] = data
            
        # Prepare HTTP request
        headers = {
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json'
        }
        
        data_bytes = json.dumps(payload).encode('utf-8')
        
        req = urllib.request.Request(
            SHOOTER_API_URL,
            data=data_bytes,
            headers=headers,
            method='POST'
        )
        
        # Send request
        with urllib.request.urlopen(req, timeout=10) as response:
            response_data = response.read().decode('utf-8')
            response_json = json.loads(response_data)
            
            if response_json.get('success'):
                print(f"✅ SHOOTER notification sent: {title}")
                return True
            else:
                print(f"❌ SHOOTER notification failed: {response_json}")
                return False
                
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else "No error details"
        print(f"❌ HTTP Error {e.code}: {error_body}")
        return False
    except urllib.error.URLError as e:
        print(f"❌ URL Error: {e.reason}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        traceback.print_exc()
        return False

def read_hook_input():
    """
    Read and parse JSON input from stdin (Claude Code hook payload)
    """
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            return {}
        return json.loads(input_data)
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse hook input: {e}")
        return {}
    except Exception as e:
        print(f"❌ Error reading hook input: {e}")
        return {}

def get_project_name():
    """Get current project name from directory"""
    try:
        cwd = os.getcwd()
        return os.path.basename(cwd)
    except:
        return "Unknown Project"

def get_timestamp():
    """Get formatted timestamp"""
    return datetime.now().strftime("%H:%M:%S")

def format_tool_name(tool_name):
    """Format tool names for display"""
    tool_display_names = {
        "Edit": "📝 Code Edit",
        "Write": "📄 File Write", 
        "MultiEdit": "🔧 Multi-Edit",
        "Bash": "⚡ Command",
        "Read": "👁️ File Read",
        "Grep": "🔍 Search",
        "Glob": "📁 Find Files"
    }
    return tool_display_names.get(tool_name, f"🛠️ {tool_name}")

# Test function for development
def test_notification():
    """Test notification functionality"""
    print("🧪 Testing SHOOTER notification...")
    success = send_notification(
        "🧪 SHOOTER Test",
        "Claude Code integration test notification",
        {"test": True, "timestamp": get_timestamp()}
    )
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    # Allow testing with --test flag
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_notification()