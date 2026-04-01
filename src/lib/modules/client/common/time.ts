/**
 * Relative time formatting utility.
 *
 * Converts an ISO 8601 timestamp string into a human-friendly
 * relative label such as "just now", "5m ago", "2h ago", or "3d ago".
 */

export function formatRelativeTime(ts: string): string {
  if (!ts) {return '';}
  const date = new Date(ts);
  if (isNaN(date.getTime())) {return '';}
  const diff = Date.now() - date.getTime();
  if (diff < 0) {return 'just now';}
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {return 'just now';}
  if (mins < 60) {return `${mins}m ago`;}
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {return `${hrs}h ago`;}
  const days = Math.floor(hrs / 24);
  if (days < 7) {return `${days}d ago`;}
  if (days < 30) {return `${Math.floor(days / 7)}w ago`;}
  if (days < 365) {return `${Math.floor(days / 30)}mo ago`;}
  return `${Math.floor(days / 365)}y ago`;
}
