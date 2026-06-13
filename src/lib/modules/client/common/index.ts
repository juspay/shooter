// Shared client utilities
export { clearCache, getCached, setCache } from './cache';
export { getApiKey, isShooterConfig } from './config-guard';
export { toErrorMessage } from './error';
export { renderMarkdown } from './markdown';
export { hasScanner, isNativeBridge, scanQR } from './native-bridge';
export { startPresenceReporting } from './presence';
export { AI_COMMANDS, sourceLabel, sourceToCommand } from './provider';
export { formatRelativeTime } from './time';
export { getToolDescription } from './tool-title';
