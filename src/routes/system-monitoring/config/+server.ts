import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// System configuration interfaces
interface SystemConfiguration {
  notifications: {
    enabled: boolean;
    rateLimit: number;
    retryCount: number;
    timeout: number;
    batchSize: number;
  };
  webhooks: {
    enabled: boolean;
    timeout: number;
    maxRetries: number;
    signatureValidation: boolean;
    rateLimiting: boolean;
  };
  analytics: {
    enabled: boolean;
    retentionDays: number;
    samplingRate: number;
    realTimeUpdates: boolean;
    exportEnabled: boolean;
  };
  security: {
    rateLimiting: boolean;
    authRequired: boolean;
    corsEnabled: boolean;
    httpsOnly: boolean;
    tokenExpiration: number;
  };
  performance: {
    cacheEnabled: boolean;
    compressionEnabled: boolean;
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
    enableMetrics: boolean;
  };
  integrations: {
    claudeEnabled: boolean;
    githubEnabled: boolean;
    vercelEnabled: boolean;
    slackEnabled: boolean;
  };
}

// Default system configuration
const DEFAULT_CONFIG: SystemConfiguration = {
  notifications: {
    enabled: true,
    rateLimit: 60, // per minute
    retryCount: 3,
    timeout: 30000, // 30 seconds
    batchSize: 10
  },
  webhooks: {
    enabled: true,
    timeout: 15000, // 15 seconds
    maxRetries: 3,
    signatureValidation: true,
    rateLimiting: true
  },
  analytics: {
    enabled: true,
    retentionDays: 30,
    samplingRate: 100, // percentage
    realTimeUpdates: true,
    exportEnabled: true
  },
  security: {
    rateLimiting: true,
    authRequired: true,
    corsEnabled: true,
    httpsOnly: true,
    tokenExpiration: 3600 // 1 hour in seconds
  },
  performance: {
    cacheEnabled: true,
    compressionEnabled: true,
    maxConcurrentRequests: 100,
    requestTimeoutMs: 30000,
    enableMetrics: true
  },
  integrations: {
    claudeEnabled: true,
    githubEnabled: false,
    vercelEnabled: true,
    slackEnabled: false
  }
};

// In-memory configuration store (in production, this would be a database)
let currentConfig: SystemConfiguration = { ...DEFAULT_CONFIG };

// Configuration validation functions
function validateNotificationConfig(config: Partial<SystemConfiguration['notifications']>): string[] {
  const errors: string[] = [];
  
  if (config.rateLimit !== undefined && (config.rateLimit < 1 || config.rateLimit > 1000)) {
    errors.push('Rate limit must be between 1 and 1000 per minute');
  }
  
  if (config.retryCount !== undefined && (config.retryCount < 0 || config.retryCount > 10)) {
    errors.push('Retry count must be between 0 and 10');
  }
  
  if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 120000)) {
    errors.push('Timeout must be between 1000ms and 120000ms');
  }
  
  if (config.batchSize !== undefined && (config.batchSize < 1 || config.batchSize > 100)) {
    errors.push('Batch size must be between 1 and 100');
  }
  
  return errors;
}

function validateWebhookConfig(config: Partial<SystemConfiguration['webhooks']>): string[] {
  const errors: string[] = [];
  
  if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 60000)) {
    errors.push('Webhook timeout must be between 1000ms and 60000ms');
  }
  
  if (config.maxRetries !== undefined && (config.maxRetries < 0 || config.maxRetries > 10)) {
    errors.push('Max retries must be between 0 and 10');
  }
  
  return errors;
}

function validateAnalyticsConfig(config: Partial<SystemConfiguration['analytics']>): string[] {
  const errors: string[] = [];
  
  if (config.retentionDays !== undefined && (config.retentionDays < 1 || config.retentionDays > 365)) {
    errors.push('Retention days must be between 1 and 365');
  }
  
  if (config.samplingRate !== undefined && (config.samplingRate < 0 || config.samplingRate > 100)) {
    errors.push('Sampling rate must be between 0 and 100 percent');
  }
  
  return errors;
}

function validateSecurityConfig(config: Partial<SystemConfiguration['security']>): string[] {
  const errors: string[] = [];
  
  if (config.tokenExpiration !== undefined && (config.tokenExpiration < 300 || config.tokenExpiration > 86400)) {
    errors.push('Token expiration must be between 300 seconds (5 minutes) and 86400 seconds (24 hours)');
  }
  
  return errors;
}

function validatePerformanceConfig(config: Partial<SystemConfiguration['performance']>): string[] {
  const errors: string[] = [];
  
  if (config.maxConcurrentRequests !== undefined && (config.maxConcurrentRequests < 1 || config.maxConcurrentRequests > 1000)) {
    errors.push('Max concurrent requests must be between 1 and 1000');
  }
  
  if (config.requestTimeoutMs !== undefined && (config.requestTimeoutMs < 1000 || config.requestTimeoutMs > 300000)) {
    errors.push('Request timeout must be between 1000ms and 300000ms');
  }
  
  return errors;
}

function validateConfiguration(config: Partial<SystemConfiguration>): { isValid: boolean; errors: string[] } {
  const allErrors: string[] = [];
  
  if (config.notifications) {
    allErrors.push(...validateNotificationConfig(config.notifications));
  }
  
  if (config.webhooks) {
    allErrors.push(...validateWebhookConfig(config.webhooks));
  }
  
  if (config.analytics) {
    allErrors.push(...validateAnalyticsConfig(config.analytics));
  }
  
  if (config.security) {
    allErrors.push(...validateSecurityConfig(config.security));
  }
  
  if (config.performance) {
    allErrors.push(...validatePerformanceConfig(config.performance));
  }
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors
  };
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      result[key] = deepMerge(
        (target[key] || {}) as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const section = url.searchParams.get('section');
    
    if (section && section in currentConfig) {
      // Return specific configuration section
      return json({
        success: true,
        data: {
          [section]: currentConfig[section as keyof SystemConfiguration]
        },
        section,
        timestamp: new Date().toISOString()
      });
    }
    
    // Return full configuration
    return json({
      success: true,
      data: currentConfig,
      metadata: {
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        sections: Object.keys(currentConfig),
        totalSettings: Object.values(currentConfig).reduce((total, section) =>
          total + Object.keys(section).length, 0
        )
      }
    });
  } catch (error) {
    console.error('Failed to retrieve system configuration:', error);

    return json({
      success: false,
      error: 'Failed to retrieve system configuration',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const updates = await request.json();
    
    // Validate the configuration updates
    const validation = validateConfiguration(updates);
    
    if (!validation.isValid) {
      return json({
        success: false,
        error: 'Configuration validation failed',
        validationErrors: validation.errors,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }
    
    // Create backup of current configuration
    const backupConfig = { ...currentConfig };
    
    try {
      // Apply updates using deep merge
      currentConfig = deepMerge(
        currentConfig as unknown as Record<string, unknown>,
        updates as unknown as Partial<Record<string, unknown>>
      ) as unknown as SystemConfiguration;
      
      // Log configuration changes
      const changedSections = Object.keys(updates);
      console.log('Configuration updated:', {
        sections: changedSections,
        timestamp: new Date().toISOString(),
        previousConfig: backupConfig,
        newConfig: currentConfig
      });
      
      return json({
        success: true,
        message: 'Configuration updated successfully',
        data: currentConfig,
        changes: {
          sectionsModified: changedSections,
          totalChanges: Object.values(updates).reduce((total: number, section) =>
            total + Object.keys(section as object).length, 0
          ),
          appliedAt: new Date().toISOString()
        }
      });
      
    } catch (applyError) {
      // Restore backup on error
      currentConfig = backupConfig;
      throw applyError;
    }
  } catch (error) {
    console.error('Failed to update system configuration:', error);

    return json({
      success: false,
      error: 'Failed to update system configuration',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const newConfig = await request.json();
    
    // Validate the entire new configuration
    const validation = validateConfiguration(newConfig);
    
    if (!validation.isValid) {
      return json({
        success: false,
        error: 'Configuration validation failed',
        validationErrors: validation.errors,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }
    
    // Create backup of current configuration
    const backupConfig = { ...currentConfig };
    
    try {
      // Replace entire configuration
      currentConfig = { ...DEFAULT_CONFIG, ...newConfig };
      
      console.log('Configuration replaced:', {
        timestamp: new Date().toISOString(),
        previousConfig: backupConfig,
        newConfig: currentConfig
      });
      
      return json({
        success: true,
        message: 'Configuration replaced successfully',
        data: currentConfig,
        changes: {
          operation: 'full_replace',
          appliedAt: new Date().toISOString()
        }
      });
      
    } catch (replaceError) {
      // Restore backup on error
      currentConfig = backupConfig;
      throw replaceError;
    }
  } catch (error) {
    console.error('Failed to replace system configuration:', error);

    return json({
      success: false,
      error: 'Failed to replace system configuration',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ request: _request }) => {
  try {
    // Reset configuration to defaults
    const backupConfig = { ...currentConfig };
    currentConfig = { ...DEFAULT_CONFIG };
    
    console.log('Configuration reset to defaults:', {
      timestamp: new Date().toISOString(),
      previousConfig: backupConfig,
      newConfig: currentConfig
    });
    
    return json({
      success: true,
      message: 'Configuration reset to defaults successfully',
      data: currentConfig,
      changes: {
        operation: 'reset_to_defaults',
        appliedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to reset system configuration:', error);

    return json({
      success: false,
      error: 'Failed to reset system configuration',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};
