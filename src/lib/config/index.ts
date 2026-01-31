// Configuration Module Exports
// Centralized configuration management for Shooter Dashboard

export {
  loadConfig,
  config,
  apns,
  auth,
  storage,
  security,
  monitoring,
  development,
  production,
  claudeCode,
  mobile,
  performance,
  type ShooterConfig
} from './env.js';

// Configuration constants
export const CONFIG_DEFAULTS = {
  JWT_EXPIRES_IN: '30d',
  SESSION_COOKIE_NAME: 'shooter-session',
  STORAGE_TYPE: 'memory',
  LOG_LEVEL: 'info',
  METRICS_WINDOW: 300000,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: 900000,
  MIN_NOTIFICATION_INTERVAL: 5000,
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
  WEBSOCKET_HEARTBEAT: 30000,
  IMAGE_QUALITY: 80
} as const;

// Environment validation helpers
export const ENV_VALIDATORS = {
  isValidKeyId: (keyId: string): boolean => keyId.length === 10,
  isValidTeamId: (teamId: string): boolean => teamId.length === 10,
  isValidJwtSecret: (secret: string): boolean => secret.length >= 32,
  isValidLogLevel: (level: string): boolean => ['error', 'warn', 'info', 'debug'].includes(level),
  isValidStorageType: (type: string): boolean => ['memory', 'redis', 'database'].includes(type),
  isValidApnsEnvironment: (env: string): boolean => ['development', 'production'].includes(env)
} as const;
