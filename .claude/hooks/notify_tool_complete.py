#!/usr/bin/env python3
"""
Claude Code PostToolUse Hook - Notify when tools complete execution
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
    """Handle PostToolUse hook event"""
    hook_data = read_hook_input()
    
    tool_name = hook_data.get('tool', {}).get('name', 'Unknown Tool')
    tool_params = hook_data.get('tool', {}).get('parameters', {})
    result = hook_data.get('result', {})
    
    project = get_project_name()
    timestamp = get_timestamp()
    
    # Check if tool execution was successful
    success = result.get('success', True)  # Assume success if not specified
    error = result.get('error')
    
    # Create contextual notification based on tool type and result
    if tool_name == "Edit":
        file_path = tool_params.get('file_path', 'unknown file')
        filename = os.path.basename(file_path) if file_path != 'unknown file' else 'unknown file'
        
        if success:
            title = f"✅ SHOOTER: Edit Complete"
            body = f"{timestamp} • {filename} updated successfully"
        else:
            title = f"❌ SHOOTER: Edit Failed"
            body = f"{timestamp} • Failed to update {filename}"
            
    elif tool_name == "Write":
        file_path = tool_params.get('file_path', 'unknown file')
        filename = os.path.basename(file_path) if file_path != 'unknown file' else 'unknown file'
        
        if success:
            title = f"✅ SHOOTER: File Written"
            body = f"{timestamp} • {filename} created/updated"
        else:
            title = f"❌ SHOOTER: Write Failed"
            body = f"{timestamp} • Failed to write {filename}"
            
    elif tool_name == "Bash":
        command = tool_params.get('command', 'unknown command')[:30]
        
        if success:
            title = f"✅ SHOOTER: Command Complete"
            body = f"{timestamp} • {command}... executed"
        else:
            title = f"❌ SHOOTER: Command Failed"
            body = f"{timestamp} • {command}... failed"
            
    else:
        formatted_tool = format_tool_name(tool_name)
        status = "✅ Complete" if success else "❌ Failed"
        title = f"{status} SHOOTER: {formatted_tool}"
        body = f"{timestamp} • Tool finished in {project}"
    
    # Include execution details in data payload
    data = {
        "event": "tool_complete",
        "tool": tool_name,
        "project": project,
        "timestamp": timestamp,
        "success": success,
        "file": tool_params.get('file_path') if 'file_path' in tool_params else None
    }
    
    if error:
        data["error"] = str(error)[:200]  # Limit error message length
    
    send_notification(title, body, data)

if __name__ == "__main__":
    main()