#!/usr/bin/env python3
"""
Claude Code UserPromptSubmit Hook - Notify on new user interactions
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from shooter_notifier import (
    send_notification, 
    read_hook_input, 
    get_project_name, 
    get_timestamp
)

def main():
    """Handle UserPromptSubmit hook event"""
    hook_data = read_hook_input()
    
    # Extract user prompt information
    prompt = hook_data.get('prompt', '')
    project = get_project_name()
    timestamp = get_timestamp()
    
    # Create summary of user request (truncate if too long)
    prompt_preview = prompt[:60] + "..." if len(prompt) > 60 else prompt
    
    # Determine notification content based on prompt characteristics
    if not prompt.strip():
        title = f"💬 SHOOTER: New Session"
        body = f"{timestamp} • User started interaction in {project}"
    else:
        # Analyze prompt to provide context
        prompt_lower = prompt.lower()
        
        if any(word in prompt_lower for word in ['fix', 'error', 'bug', 'issue', 'problem']):
            title = f"🐛 SHOOTER: Debug Request"
            body = f"{timestamp} • Troubleshooting: {prompt_preview}"
        elif any(word in prompt_lower for word in ['create', 'add', 'new', 'implement', 'build']):
            title = f"🚀 SHOOTER: New Feature"
            body = f"{timestamp} • Building: {prompt_preview}"
        elif any(word in prompt_lower for word in ['test', 'check', 'verify', 'validate']):
            title = f"🧪 SHOOTER: Testing"
            body = f"{timestamp} • Testing: {prompt_preview}"
        elif any(word in prompt_lower for word in ['explain', 'understand', 'how', 'what', 'why']):
            title = f"❓ SHOOTER: Learning"
            body = f"{timestamp} • Exploring: {prompt_preview}"
        else:
            title = f"💭 SHOOTER: New Request"
            body = f"{timestamp} • Working on: {prompt_preview}"
    
    # Include prompt context in data payload
    data = {
        "event": "user_prompt",
        "project": project,
        "timestamp": timestamp,
        "prompt_length": len(prompt),
        "prompt_preview": prompt[:100]  # First 100 chars for context
    }
    
    send_notification(title, body, data)

if __name__ == "__main__":
    main()