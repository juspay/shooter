#!/usr/bin/env python3
"""
SHOOTER Claude Code Integration Setup Script
Helps configure API credentials and test the integration
"""

import os
import sys
import json
import re

def get_user_input(prompt, default=None):
    """Get user input with optional default value"""
    if default:
        response = input(f"{prompt} [{default}]: ").strip()
        return response if response else default
    else:
        response = input(f"{prompt}: ").strip()
        return response

def validate_api_key(api_key):
    """Validate API key format"""
    if not api_key or len(api_key) < 10:
        return False, "API key seems too short"
    return True, "Valid"

def validate_device_token(token):
    """Validate device token format (64 hex characters)"""
    if not token:
        return False, "Device token is required"
    if not re.match(r'^[a-fA-F0-9]{64}$', token):
        return False, "Device token must be exactly 64 hexadecimal characters"
    return True, "Valid"

def update_shooter_notifier(api_key, device_token, api_url):
    """Update shooter_notifier.py with user credentials"""
    notifier_path = os.path.join(os.path.dirname(__file__), 'hooks', 'shooter_notifier.py')
    
    try:
        with open(notifier_path, 'r') as f:
            content = f.read()
        
        # Replace placeholders
        content = content.replace('YOUR_API_KEY_HERE', api_key)
        content = content.replace('YOUR_DEVICE_TOKEN_HERE', device_token)
        content = content.replace('https://shooter-rho.vercel.app/api/notify', api_url)
        
        with open(notifier_path, 'w') as f:
            f.write(content)
            
        return True, "Configuration updated successfully"
    except Exception as e:
        return False, f"Failed to update configuration: {e}"

def test_configuration():
    """Test the notification configuration"""
    try:
        # Import the updated notifier
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'hooks'))
        import shooter_notifier
        
        print("\n🧪 Testing SHOOTER notification...")
        success = shooter_notifier.send_notification(
            "🧪 SHOOTER Setup Test",
            "Claude Code integration configuration test",
            {"test": True, "setup": True}
        )
        
        if success:
            print("✅ Test notification sent successfully!")
            print("📱 Check your iPhone for the notification")
            return True
        else:
            print("❌ Test notification failed")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False

def main():
    """Main setup flow"""
    print("🎯 SHOOTER Claude Code Integration Setup")
    print("=" * 50)
    
    print("\nThis script will help you configure the Claude Code → SHOOTER integration.")
    print("You'll need your API key and device token from the SHOOTER system.\n")
    
    # Get API URL preference
    print("1. Choose API endpoint:")
    print("   1) Production: https://shooter-rho.vercel.app/api/notify")
    print("   2) Local: http://localhost:5173/api/notify")
    
    choice = get_user_input("Select option (1 or 2)", "1")
    
    if choice == "2":
        api_url = "http://localhost:5173/api/notify"
        print("📍 Using local development API")
    else:
        api_url = "https://shooter-rho.vercel.app/api/notify"
        print("🌐 Using production API")
    
    # Get API key
    print("\n2. API Key Configuration:")
    print("   This is the same API key used in your SHOOTER Vercel environment.")
    api_key = get_user_input("Enter your SHOOTER API key")
    
    valid, message = validate_api_key(api_key)
    if not valid:
        print(f"❌ {message}")
        return 1
    
    # Get device token
    print("\n3. Device Token Configuration:")
    print("   This is your iPhone's APNs device token (64 hex characters).")
    print("   You can find this in your iOS app logs or SHOOTER web interface.")
    device_token = get_user_input("Enter your device token")
    
    valid, message = validate_device_token(device_token)
    if not valid:
        print(f"❌ {message}")
        return 1
    
    # Update configuration
    print("\n4. Updating configuration...")
    success, message = update_shooter_notifier(api_key, device_token, api_url)
    
    if not success:
        print(f"❌ {message}")
        return 1
    
    print(f"✅ {message}")
    
    # Test configuration
    print("\n5. Testing configuration...")
    test_choice = get_user_input("Send test notification? (y/n)", "y")
    
    if test_choice.lower() in ['y', 'yes']:
        success = test_configuration()
        if success:
            print("\n🎉 Setup completed successfully!")
            print("\nYour Claude Code integration is now ready.")
            print("SHOOTER will send notifications when Claude Code events occur in this project.")
        else:
            print("\n⚠️  Setup completed but test failed.")
            print("Check your API key and device token, then run:")
            print("python3 .claude/hooks/shooter_notifier.py --test")
    else:
        print("\n✅ Setup completed!")
        print("To test later, run: python3 .claude/hooks/shooter_notifier.py --test")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())