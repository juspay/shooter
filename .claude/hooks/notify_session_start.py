#!/usr/bin/env python3
"""
Claude Code SessionStart Hook - Notify when Claude Code session begins
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
    """Handle SessionStart hook event"""
    hook_data = read_hook_input()
    
    project = get_project_name()
    timestamp = get_timestamp()
    
    title = f"🎯 SHOOTER: Session Started"
    body = f"{timestamp} • Claude Code session active in {project}"
    
    # Include session context in data payload
    data = {
        "event": "session_start",
        "project": project,
        "timestamp": timestamp,
        "cwd": os.getcwd()
    }
    
    send_notification(title, body, data)

if __name__ == "__main__":
    main()