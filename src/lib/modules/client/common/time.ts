/**
 * Relative time formatting utility.
 *
 * Converts an ISO 8601 timestamp string into a human-friendly
 * relative label such as "just now", "5m ago", "2h ago", or "3d ago".
 */

export function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  return `${Math.floor(hrs / 24)}d ago`;
}
