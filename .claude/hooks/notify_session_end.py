#!/usr/bin/env python3
"""
Claude Code Stop Hook - Notify when Claude Code session ends
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
    """Handle Stop hook event"""
    hook_data = read_hook_input()
    
    project = get_project_name()
    timestamp = get_timestamp()
    
    title = f"👋 SHOOTER: Session Ended"
    body = f"{timestamp} • Claude Code session completed in {project}"
    
    # Include session end context in data payload  
    data = {
        "event": "session_end",
        "project": project,
        "timestamp": timestamp
    }
    
    send_notification(title, body, data)

if __name__ == "__main__":
    main()