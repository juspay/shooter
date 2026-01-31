// Environment Configuration Utility
// Centralized environment variable loading and validation

import { building } from '$app/environment';

// Use process.env for environment variables in lib files
const env = typeof process !== 'undefined' ? process.env : {};

export interface ShooterConfig {
  // SvelteKit
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;

  // APNs Configuration
  apns: {
    keyP8: string;
    keyId: string;
    teamId: string;
    bundleId: string;
    environment: 'development' | 'production';
  };

  // API Configuration
  api: {
    key: string;
    baseUrl?: string;
    timeout: number;
  };

  // Device Configuration
  device: {
    token: string;
  };

  // Authentication
  auth: {
    jwtSecret: string;
    username: string;
    password: string;
    expiresIn: string;
    cookieName: string;
  };

  // Storage
  storage: {
    type: 'memory' | 'redis' | 'database';
    connectionString?: string;
    retryAttempts: number;
    retryDelay: number;
  };

  // Security
  security: {
    bearerToken: string;
    webhookSecret?: string;
    corsOrigins: string[];
    rateLimitMax: number;
    rateLimitWindow: number;
  };

  // Monitoring
  monitoring: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    enableMetrics: boolean;
    metricsWindow: number;
    enableHealthChecks: boolean;
  };

  // Development
  development: {
    debug: boolean;
    verbose: boolean;
    mockApns: boolean;
    mockNotifications: boolean;
  };

  // Production
  production: {
    domain?: string;
    secureCookies: boolean;
    sentryDsn?: string;
    analyticsId?: string;
  };

  // Claude Code Integration
  claudeCode: {
    enableHooks: boolean;
    categories: string[];
    enableFiltering: boolean;
    minInterval: number;
  };

  // Mobile Dashboard
  mobile: {
    enableOptimization: boolean;
    mobileBreakpoint: number;
    tabletBreakpoint: number;
    enableWebsockets: boolean;
    websocketHeartbeat: number;
    enableOfflineMode: boolean;
    cacheStrategy: string;
  };

  // Performance
  performance: {
    bundleAnalyzer: boolean;
    preloadStrategy: string;
    enableImageOptimization: boolean;
    imageQuality: number;
    enableServiceWorker: boolean;
    swCacheStrategy: string;
  };
}

/**
 * Parse comma-separated string into array
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) {
return defaultValue;
}
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Parse boolean environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) {
return defaultValue;
}
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer environment variable
 */
function parseInt(value: string | undefined, defaultValue: number): number {
  if (!value) {
return defaultValue;
}
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get required environment variable or throw error
 * @deprecated Use getOptional with proper default handling instead
 */
function getRequired(key: string): string {
  const value = env[key];
  if (!value && !building) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value || '';
}

/**
 * Get environment variable with warning if missing (non-breaking)
 */
function getWithWarning(key: string, defaultValue: string = ''): string {
  const value = env[key];
  if (!value && !building) {
    console.warn(`⚠️  Environment variable ${key} is not set - using default or degraded functionality`);
  }
  return value || defaultValue;
}

/**
 * Get optional environment variable with default
 */
function getOptional(key: string, defaultValue: string = ''): string {
  return env[key] || defaultValue;
}

/**
 * Validate APNs configuration (non-breaking - warns only)
 */
function validateApnsConfig(config: ShooterConfig['apns']): void {
  if (!building) {
    const missingFields: string[] = [];

    if (!config.keyP8) {
missingFields.push('APNS_KEY_P8');
}
    if (!config.keyId) {
missingFields.push('APNS_KEY_ID');
}
    if (!config.teamId) {
missingFields.push('APNS_TEAM_ID');
}
    if (!config.bundleId) {
missingFields.push('APNS_BUNDLE_ID');
}

    if (missingFields.length > 0) {
      console.warn(`⚠️  APNs configuration incomplete: ${missingFields.join(', ')} not set`);
      console.warn('📱 Push notifications will be disabled until APNs credentials are configured');
      return;
    }

    // Validate format only if values are present
    if (config.keyId && config.keyId.length !== 10) {
      console.warn('⚠️  APNS_KEY_ID should be exactly 10 characters');
    }

    if (config.teamId && config.teamId.length !== 10) {
      console.warn('⚠️  APNS_TEAM_ID should be exactly 10 characters');
    }
  }
}

/**
 * Validate authentication configuration (non-breaking - warns only)
 */
function validateAuthConfig(config: ShooterConfig['auth']): void {
  if (!building) {
    if (!config.jwtSecret) {
      console.warn('⚠️  JWT_SECRET is not set - authentication will use a default (INSECURE)');
    } else if (config.jwtSecret.length < 32) {
      console.warn('⚠️  JWT_SECRET should be at least 32 characters long for security');
    }

    if (!config.username) {
      console.warn('⚠️  AUTH_USERNAME is not set - using default "admin"');
    }

    if (!config.password) {
      console.warn('⚠️  AUTH_PASSWORD is not set - using default password (INSECURE)');
    }
  }
}

/**
 * Load and validate environment configuration
 */
export function loadConfig(): ShooterConfig {
  const nodeEnv = getOptional('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';

  // APNs Configuration (all optional - app will work without push notifications)
  const apnsConfig = {
    keyP8: getWithWarning('APNS_KEY_P8', ''),
    keyId: getWithWarning('APNS_KEY_ID', ''),
    teamId: getWithWarning('APNS_TEAM_ID', ''),
    bundleId: getOptional('APNS_BUNDLE_ID', 'com.shooter.app'),
    environment: getOptional('APNS_ENVIRONMENT', 'development') as 'development' | 'production'
  };

  // API Configuration (optional - can be configured via UI)
  const apiConfig = {
    key: getOptional('API_KEY', 'default-api-key'),
    baseUrl: getOptional('API_BASE_URL'),
    timeout: parseInt(getOptional('API_TIMEOUT'), 30000)
  };

  // Device Configuration (optional - can be configured via UI)
  const deviceConfig = {
    token: getOptional('DEVICE_TOKEN', '')
  };

  // Authentication Configuration (with safe defaults for development)
  const authConfig = {
    jwtSecret: getOptional('JWT_SECRET', 'dev-secret-key-DO-NOT-USE-IN-PRODUCTION-must-be-at-least-32-chars'),
    username: getOptional('AUTH_USERNAME', 'admin'),
    password: getOptional('AUTH_PASSWORD', 'admin'),
    expiresIn: getOptional('JWT_EXPIRES_IN', '30d'),
    cookieName: getOptional('SESSION_COOKIE_NAME', 'shooter-session')
  };

  const config: ShooterConfig = {
    nodeEnv,
    isProduction,
    isDevelopment,

    apns: apnsConfig,
    api: apiConfig,
    device: deviceConfig,
    auth: authConfig,

    storage: {
      type: getOptional('STORAGE_TYPE', 'memory') as 'memory' | 'redis' | 'database',
      connectionString: getOptional('REDIS_URL') || getOptional('DATABASE_URL'),
      retryAttempts: parseInt(getOptional('STORAGE_RETRY_ATTEMPTS'), 3),
      retryDelay: parseInt(getOptional('STORAGE_RETRY_DELAY'), 1000)
    },

    security: {
      bearerToken: getRequired('BEARER_TOKEN'),
      webhookSecret: getOptional('WEBHOOK_SECRET'),
      corsOrigins: parseArray(getOptional('CORS_ORIGINS'), [
        'http://localhost:5173',
        'http://localhost:4173'
      ]),
      rateLimitMax: parseInt(getOptional('RATE_LIMIT_MAX'), 100),
      rateLimitWindow: parseInt(getOptional('RATE_LIMIT_WINDOW'), 900000)
    },

    monitoring: {
      logLevel: getOptional('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
      enableMetrics: parseBoolean(getOptional('ENABLE_METRICS'), true),
      metricsWindow: parseInt(getOptional('METRICS_WINDOW'), 300000),
      enableHealthChecks: parseBoolean(getOptional('ENABLE_HEALTH_CHECKS'), true)
    },

    development: {
      debug: parseBoolean(getOptional('DEBUG'), isDevelopment),
      verbose: parseBoolean(getOptional('VERBOSE'), false),
      mockApns: parseBoolean(getOptional('MOCK_APNS'), false),
      mockNotifications: parseBoolean(getOptional('MOCK_NOTIFICATIONS'), false)
    },

    production: {
      domain: getOptional('DOMAIN'),
      secureCookies: parseBoolean(getOptional('SECURE_COOKIES'), isProduction),
      sentryDsn: getOptional('SENTRY_DSN'),
      analyticsId: getOptional('ANALYTICS_ID')
    },

    claudeCode: {
      enableHooks: parseBoolean(getOptional('ENABLE_CLAUDE_HOOKS'), true),
      categories: parseArray(getOptional('CLAUDE_CATEGORIES'), [
        'debug',
        'feature',
        'testing',
        'learning',
        'error'
      ]),
      enableFiltering: parseBoolean(getOptional('ENABLE_NOTIFICATION_FILTERING'), true),
      minInterval: parseInt(getOptional('MIN_NOTIFICATION_INTERVAL'), 5000)
    },

    mobile: {
      enableOptimization: parseBoolean(getOptional('ENABLE_MOBILE_OPTIMIZATION'), true),
      mobileBreakpoint: parseInt(getOptional('MOBILE_BREAKPOINT'), 768),
      tabletBreakpoint: parseInt(getOptional('TABLET_BREAKPOINT'), 1024),
      enableWebsockets: parseBoolean(getOptional('ENABLE_WEBSOCKETS'), true),
      websocketHeartbeat: parseInt(getOptional('WEBSOCKET_HEARTBEAT'), 30000),
      enableOfflineMode: parseBoolean(getOptional('ENABLE_OFFLINE_MODE'), true),
      cacheStrategy: getOptional('CACHE_STRATEGY', 'stale-while-revalidate')
    },

    performance: {
      bundleAnalyzer: parseBoolean(getOptional('BUNDLE_ANALYZER'), false),
      preloadStrategy: getOptional('PRELOAD_STRATEGY', 'modulepreload'),
      enableImageOptimization: parseBoolean(getOptional('ENABLE_IMAGE_OPTIMIZATION'), true),
      imageQuality: parseInt(getOptional('IMAGE_QUALITY'), 80),
      enableServiceWorker: parseBoolean(getOptional('ENABLE_SERVICE_WORKER'), true),
      swCacheStrategy: getOptional('SW_CACHE_STRATEGY', 'networkfirst')
    }
  };

  // Validate critical configurations
  validateApnsConfig(config.apns);
  validateAuthConfig(config.auth);

  return config;
}

// Export singleton config instance
export const config = loadConfig();

// Export individual config sections for easier imports
export const {
  apns,
  api,
  device,
  auth,
  storage,
  security,
  monitoring,
  development,
  production,
  claudeCode,
  mobile,
  performance
} = config;
