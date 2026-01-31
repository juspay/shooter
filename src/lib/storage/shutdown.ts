// Graceful Shutdown and Cleanup
// Handles application shutdown, resource cleanup, and data persistence

import type {  } from './types.js';
import { getConnectedStorages } from './registry.js';
import { logInfo, logWarn, logError, exportLogs } from './logging.js';
import { exportPerformanceMetrics, resetMetrics } from './metrics.js';
import { stopMonitoring, getAllAlerts } from './monitoring.js';

/**
 * Shutdown phases
 */
export type ShutdownPhase =
  | 'initiated'
  | 'stopping_services'
  | 'persisting_data'
  | 'closing_connections'
  | 'cleanup'
  | 'completed';

/**
 * Shutdown configuration
 */
export interface ShutdownConfig {
  gracefulTimeout: number; // milliseconds
  forceTimeout: number; // milliseconds
  persistLogs: boolean;
  persistMetrics: boolean;
  persistAlerts: boolean;
  exportPath: string;
  enableHealthCheck: boolean;
  waitForInFlightOperations: boolean;
}

const DEFAULT_SHUTDOWN_CONFIG: ShutdownConfig = {
  gracefulTimeout: 30000, // 30 seconds
  forceTimeout: 45000, // 45 seconds
  persistLogs: true,
  persistMetrics: true,
  persistAlerts: true,
  exportPath: './exports',
  enableHealthCheck: true,
  waitForInFlightOperations: true
};

/**
 * Shutdown status
 */
export interface ShutdownStatus {
  phase: ShutdownPhase;
  progress: number; // 0-100
  startTime: number;
  currentOperation: string;
  completedOperations: string[];
  errors: string[];
  graceful: boolean;
}

class ShutdownManager {
  private config: ShutdownConfig;
  private status: ShutdownStatus;
  private _isShuttingDown = false;
  private shutdownPromise?: Promise<void>;
  private timeouts: NodeJS.Timeout[] = [];
  private inFlightOperations = new Set<string>();

  constructor(config: Partial<ShutdownConfig> = {}) {
    this.config = { ...DEFAULT_SHUTDOWN_CONFIG, ...config };
    this.status = {
      phase: 'initiated',
      progress: 0,
      startTime: 0,
      currentOperation: '',
      completedOperations: [],
      errors: [],
      graceful: true
    };

    // Register process signal handlers
    this.registerSignalHandlers();
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    try {
      // Graceful shutdown signals
      const gracefulSignals = ['SIGTERM', 'SIGINT'];
      gracefulSignals.forEach(signal => {
        process.on(signal, () => {
          logInfo('shutdown', `Received ${signal}, initiating graceful shutdown`);
          this.shutdown().catch(error => {
            logError(error, 'shutdown', 'signal_handler');
            process.exit(1);
          });
        });
      });

      // Force shutdown signal (note: SIGKILL cannot be handled)
      // process.on('SIGKILL', () => {
      //   logWarn('shutdown', 'Received SIGKILL, forcing immediate shutdown');
      //   this.forceShutdown();
      // });

      // Handle uncaught exceptions
      process.on('uncaughtException', error => {
        logError(error, 'shutdown', 'uncaught_exception');
        this.shutdown(true).finally(() => {
          process.exit(1);
        });
      });

      // Handle unhandled promise rejections
      process.on('unhandledRejection', (reason, _promise) => {
        logError(new Error(`Unhandled rejection: ${reason}`), 'shutdown', 'unhandled_rejection');
        this.shutdown(true).finally(() => {
          process.exit(1);
        });
      });
    } catch (error) {
      // Signal handling might fail in some environments (like testing)
      logWarn('shutdown', 'Could not register signal handlers', { error: (error as Error).message });
    }
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(force: boolean = false): Promise<void> {
    if (this._isShuttingDown) {
      return this.shutdownPromise;
    }

    this._isShuttingDown = true;
    this.status.startTime = Date.now();
    this.status.graceful = !force;

    logInfo('shutdown', 'Initiating graceful shutdown', {
      force,
      timeout: this.config.gracefulTimeout,
      config: JSON.stringify(this.config)
    });

    this.shutdownPromise = this.performShutdown(force);
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown process
   */
  private async performShutdown(force: boolean): Promise<void> {
    const startTime = Date.now();

    try {
      // Set up force timeout
      const forceTimeout = setTimeout(
        () => {
          logWarn('shutdown', 'Graceful shutdown timeout, forcing shutdown');
          this.forceShutdown();
        },
        force ? 5000 : this.config.gracefulTimeout
      );

      this.timeouts.push(forceTimeout);

      // Phase 1: Stop services
      await this.executePhase('stopping_services', async () => {
        await this.stopServices();
      });

      // Phase 2: Wait for in-flight operations
      if (this.config.waitForInFlightOperations) {
        await this.executePhase('persisting_data', async () => {
          await this.waitForInFlightOperations();
        });
      }

      // Phase 3: Persist data
      await this.executePhase('persisting_data', async () => {
        await this.persistData();
      });

      // Phase 4: Close connections
      await this.executePhase('closing_connections', async () => {
        await this.closeConnections();
      });

      // Phase 5: Cleanup
      await this.executePhase('cleanup', async () => {
        await this.performCleanup();
      });

      // Complete shutdown
      this.status.phase = 'completed';
      this.status.progress = 100;

      clearTimeout(forceTimeout);

      const duration = Date.now() - startTime;
      logInfo('shutdown', 'Graceful shutdown completed successfully', {
        duration,
        errors: this.status.errors.length,
        operations: this.status.completedOperations.length
      });
    } catch (error) {
      this.status.errors.push((error as Error).message);
      logError(error as Error, 'shutdown', 'shutdown_error');
      throw error;
    }
  }

  /**
   * Execute a shutdown phase
   */
  private async executePhase(phase: ShutdownPhase, operation: () => Promise<void>): Promise<void> {
    this.status.phase = phase;
    this.status.currentOperation = phase.replace('_', ' ');

    try {
      await operation();
      this.status.completedOperations.push(phase);
      this.updateProgress();
    } catch (error) {
      this.status.errors.push(`${phase}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Update shutdown progress
   */
  private updateProgress(): void {
    const totalPhases = 5;
    const completedPhases = this.status.completedOperations.length;
    this.status.progress = Math.round((completedPhases / totalPhases) * 100);
  }

  /**
   * Stop monitoring and other services
   */
  private async stopServices(): Promise<void> {
    logInfo('shutdown', 'Stopping services');

    try {
      // Stop monitoring
      stopMonitoring();
      logInfo('shutdown', 'Monitoring stopped');

      // Stop any other background services
      this.clearTimeouts();
      logInfo('shutdown', 'Background services stopped');
    } catch (error) {
      logError(error as Error, 'shutdown', 'stop_services');
      throw error;
    }
  }

  /**
   * Wait for in-flight operations to complete
   */
  private async waitForInFlightOperations(): Promise<void> {
    if (this.inFlightOperations.size === 0) {
      return;
    }

    logInfo('shutdown', `Waiting for ${this.inFlightOperations.size} in-flight operations`);

    const waitTimeout = 10000; // 10 seconds
    const startTime = Date.now();

    while (this.inFlightOperations.size > 0) {
      if (Date.now() - startTime > waitTimeout) {
        logWarn(
          'shutdown',
          `Timeout waiting for operations, ${this.inFlightOperations.size} still pending`
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.inFlightOperations.size > 0) {
      logWarn('shutdown', `${this.inFlightOperations.size} operations did not complete gracefully`);
    } else {
      logInfo('shutdown', 'All in-flight operations completed');
    }
  }

  /**
   * Persist important data before shutdown
   */
  private async persistData(): Promise<void> {
    logInfo('shutdown', 'Persisting data before shutdown');

    try {
      // Create export directory if it doesn't exist
      const fs = await import('fs/promises');
      try {
        await fs.mkdir(this.config.exportPath, { recursive: true });
      } catch (_error) {
        // Directory might already exist
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Persist logs
      if (this.config.persistLogs) {
        try {
          const logs = exportLogs('json');
          const logPath = `${this.config.exportPath}/logs-${timestamp}.json`;
          await fs.writeFile(logPath, logs);
          logInfo('shutdown', `Logs exported to ${logPath}`);
        } catch (error) {
          logError(error as Error, 'shutdown', 'persist_logs');
        }
      }

      // Persist metrics
      if (this.config.persistMetrics) {
        try {
          const metrics = exportPerformanceMetrics('json');
          const metricsPath = `${this.config.exportPath}/metrics-${timestamp}.json`;
          await fs.writeFile(metricsPath, metrics);
          logInfo('shutdown', `Metrics exported to ${metricsPath}`);
        } catch (error) {
          logError(error as Error, 'shutdown', 'persist_metrics');
        }
      }

      // Persist alerts
      if (this.config.persistAlerts) {
        try {
          const alerts = getAllAlerts();
          const alertsPath = `${this.config.exportPath}/alerts-${timestamp}.json`;
          await fs.writeFile(alertsPath, JSON.stringify(alerts, null, 2));
          logInfo('shutdown', `Alerts exported to ${alertsPath}`);
        } catch (error) {
          logError(error as Error, 'shutdown', 'persist_alerts');
        }
      }

      // Persist shutdown status
      const statusPath = `${this.config.exportPath}/shutdown-status-${timestamp}.json`;
      await fs.writeFile(statusPath, JSON.stringify(this.status, null, 2));
    } catch (error) {
      logError(error as Error, 'shutdown', 'persist_data');
      throw error;
    }
  }

  /**
   * Close all storage connections
   */
  private async closeConnections(): Promise<void> {
    logInfo('shutdown', 'Closing storage connections');

    const connectedStorages = getConnectedStorages();
    const closePromises = connectedStorages.map(async storage => {
      try {
        if (typeof storage.disconnect === 'function') {
          await storage.disconnect();
          logInfo('shutdown', `Disconnected from ${storage.name}`);
        }
      } catch (error) {
        logError(error as Error, 'shutdown', 'disconnect_storage', storage.name);
      }
    });

    await Promise.allSettled(closePromises);
    logInfo('shutdown', 'All storage connections closed');
  }

  /**
   * Perform final cleanup
   */
  private async performCleanup(): Promise<void> {
    logInfo('shutdown', 'Performing final cleanup');

    try {
      // Clear all timeouts
      this.clearTimeouts();

      // Reset metrics to free memory
      resetMetrics();

      // Clear any remaining references
      this.inFlightOperations.clear();

      logInfo('shutdown', 'Cleanup completed');
    } catch (error) {
      logError(error as Error, 'shutdown', 'cleanup');
      throw error;
    }
  }

  /**
   * Force immediate shutdown
   */
  private forceShutdown(): void {
    logWarn('shutdown', 'Forcing immediate shutdown');

    this.clearTimeouts();

    // Try to close connections quickly
    const connectedStorages = getConnectedStorages();
    connectedStorages.forEach(storage => {
      try {
        if (typeof storage.disconnect === 'function') {
          storage.disconnect();
        }
      } catch (_error) {
        // Ignore errors during force shutdown
      }
    });

    process.exit(1);
  }

  /**
   * Clear all registered timeouts
   */
  private clearTimeouts(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts = [];
  }

  /**
   * Register an in-flight operation
   */
  registerOperation(operationId: string): void {
    this.inFlightOperations.add(operationId);
  }

  /**
   * Unregister a completed operation
   */
  unregisterOperation(operationId: string): void {
    this.inFlightOperations.delete(operationId);
  }

  /**
   * Get current shutdown status
   */
  getStatus(): ShutdownStatus {
    return { ...this.status };
  }

  /**
   * Check if system is shutting down
   */
  isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Configure shutdown behavior
   */
  configure(config: Partial<ShutdownConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create a shutdown-aware operation wrapper
   */
  wrapOperation<T>(operationId: string, operation: () => Promise<T>): Promise<T> {
    if (this._isShuttingDown) {
      throw new Error('System is shutting down, operation rejected');
    }

    this.registerOperation(operationId);

    return operation().finally(() => {
      this.unregisterOperation(operationId);
    });
  }

  /**
   * Health check endpoint for shutdown status
   */
  healthCheck(): {
    healthy: boolean;
    shutting_down: boolean;
    status: ShutdownStatus;
  } {
    return {
      healthy: !this._isShuttingDown,
      shutting_down: this._isShuttingDown,
      status: this.getStatus()
    };
  }
}

// Global shutdown manager instance
const shutdownManager = new ShutdownManager();

// Export shutdown functions
export function initializeShutdownHandler(config?: Partial<ShutdownConfig>): void {
  if (config) {
    shutdownManager.configure(config);
  }
  logInfo('shutdown', 'Shutdown handler initialized');
}

export function shutdown(force: boolean = false): Promise<void> {
  return shutdownManager.shutdown(force);
}

export function getShutdownStatus(): ShutdownStatus {
  return shutdownManager.getStatus();
}

export function isShuttingDown(): boolean {
  return shutdownManager.isShuttingDown();
}

export function registerOperation(operationId: string): void {
  shutdownManager.registerOperation(operationId);
}

export function unregisterOperation(operationId: string): void {
  shutdownManager.unregisterOperation(operationId);
}

export function wrapOperation<T>(operationId: string, operation: () => Promise<T>): Promise<T> {
  return shutdownManager.wrapOperation(operationId, operation);
}

export function shutdownHealthCheck(): ReturnType<ShutdownManager['healthCheck']> {
  return shutdownManager.healthCheck();
}

export function configureShutdown(config: Partial<ShutdownConfig>): void {
  shutdownManager.configure(config);
}

// Export constants
export { DEFAULT_SHUTDOWN_CONFIG };

// Export the manager instance for advanced usage
export { shutdownManager as ShutdownManager };
