// Inject a default `--permission-mode` into a claude launch, configurable via the
// SHOOTER_AGENT_PERMISSION_MODE env var, so managed agent terminals can actually act instead of
// being auto-denied by a restrictive global Claude config. Claude-only (the flag is
// claude-specific) and never overrides an explicit --permission-mode the caller passed.
// Pure — unit-tested in tests/agent-launch.test.cjs.

const CLAUDE_COMMANDS = new Set(['claude']);

export function withAgentPermissionMode(
  command: string,
  args: string[],
  mode: string | undefined
): string[] {
  const trimmed = (mode ?? '').trim();
  if (trimmed.length === 0) {
    return args; // feature off when unset
  }
  const base = command.split('/').pop() ?? command;
  if (!CLAUDE_COMMANDS.has(base)) {
    return args; // --permission-mode is claude-specific
  }
  if (args.includes('--permission-mode')) {
    return args; // an explicit flag always wins
  }
  return [...args, '--permission-mode', trimmed];
}
