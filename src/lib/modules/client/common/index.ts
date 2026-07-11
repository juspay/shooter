// Shared client utilities
export {
  getHasNewActivity,
  markActivitySeen,
  startActivityBadgePolling,
} from './activity-badge.svelte';
export { clearCache, getCached, setCache } from './cache';
export { getApiKey, isShooterConfig } from './config-guard';
export { resolveSwipeAxis, shouldCommitBack, shouldEngageEdge } from './edge-swipe';
export { toErrorMessage } from './error';
export { getKeyboardInset, startKeyboardInsetTracking } from './keyboard-inset.svelte';
export { renderMarkdown } from './markdown';
export { prefersReducedMotion, resolveMotionDuration } from './motion';
export { haptic, hasScanner, isNativeBridge, scanQR } from './native-bridge';
export { startPresenceReporting } from './presence';
export { AI_COMMANDS, sourceLabel, sourceToCommand } from './provider';
export { resistPull, shouldTriggerRefresh } from './pull-refresh';
export { getSystemStatus, startSystemStatusPolling } from './system-status.svelte';
export { formatRelativeTime } from './time';
export { getToolDescription } from './tool-title';
