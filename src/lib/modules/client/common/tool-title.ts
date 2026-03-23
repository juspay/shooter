/**
 * Human-readable one-line description for a tool invocation.
 *
 * Accepts the tool name and its input record and returns a short
 * summary string suitable for display in a chat UI.
 */

export function getToolDescription(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    return (input.command as string) || (input.description as string) || '';
  }
  if (toolName === 'Read') {
    return (input.file_path as string) || '';
  }
  if (toolName === 'Edit' || toolName === 'Write') {
    return (input.file_path as string) || '';
  }
  if (toolName === 'Grep') {
    return (input.pattern as string) || '';
  }
  if (toolName === 'Glob') {
    return (input.pattern as string) || '';
  }
  if (toolName === 'Agent') {
    return (input.description as string) || (input.prompt as string)?.slice(0, 50) || '';
  }
  return JSON.stringify(input).slice(0, 60);
}
