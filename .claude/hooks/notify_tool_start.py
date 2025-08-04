#!/usr/bin/env python3
"""
Claude Code PreToolUse Hook - Notify when tools start executing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from shooter_notifier import (
    send_notification, 
    read_hook_input, 
    get_project_name, 
    get_timestamp,
    format_tool_name
)

def main():
    """Handle PreToolUse hook event"""
    hook_data = read_hook_input()
    
    tool_name = hook_data.get('tool', {}).get('name', 'Unknown Tool')
    tool_params = hook_data.get('tool', {}).get('parameters', {})
    
    project = get_project_name()
    timestamp = get_timestamp()
    
    # Create contextual notification based on tool type
    if tool_name == "Edit":
        file_path = tool_params.get('file_path', 'unknown file')
        filename = os.path.basename(file_path) if file_path != 'unknown file' else 'unknown file'
        title = f"🔧 SHOOTER: Editing {filename}"
        body = f"{timestamp} • Starting code edit in {project}"
        
    elif tool_name == "Write":
        file_path = tool_params.get('file_path', 'unknown file')
        filename = os.path.basename(file_path) if file_path != 'unknown file' else 'unknown file'
        title = f"📄 SHOOTER: Writing {filename}"
        body = f"{timestamp} • Creating/updating file in {project}"
        
    elif tool_name == "Bash":
        command = tool_params.get('command', 'unknown command')[:50]
        title = f"⚡ SHOOTER: Running Command"
        body = f"{timestamp} • Executing: {command}..."
        
    else:
        formatted_tool = format_tool_name(tool_name)
        title = f"🛠️ SHOOTER: {formatted_tool}"
        body = f"{timestamp} • Tool starting in {project}"
    
    # Include relevant context in data payload
    data = {
        "event": "tool_start",
        "tool": tool_name,
        "project": project,
        "timestamp": timestamp,
        "file": tool_params.get('file_path') if 'file_path' in tool_params else None
    }
    
    send_notification(title, body, data)

if __name__ == "__main__":
    main()